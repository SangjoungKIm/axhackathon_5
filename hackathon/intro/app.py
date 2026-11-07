import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import mimetypes
from pathlib import Path
import re
import threading
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Body
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pipeline import Inspector, save_json
from map_service import generate_layout, effective_layout, load_session, save_review, reference_image, ensure_portal_layout
from video_editor import editor_frame
from result_view import result_view_file
from row_route import RowInspector, decode_image
from fixed_inspection import fixed_map

ROOT = Path(__file__).resolve().parent
JOBS = ROOT/'analysis_jobs'
JOBS.mkdir(exist_ok=True)
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount('/assets',StaticFiles(directory=ROOT/'portal'),name='portal-assets')
inspector = Inspector()
row_inspector = RowInspector(Path('/data/panel_models/solar_row.pt'))
executor = ThreadPoolExecutor(max_workers=1)
meta_lock = threading.Lock()
active_lock = threading.Lock()
active_job = None
MAX_UPLOAD = 500 * 1024 * 1024

@app.middleware('http')
async def proxy_prefix(request, call_next):
    # The GPU portal forwards the original /i/<instance>/ prefix unchanged.
    path = request.scope['path']
    prefix = re.match(r'^/i/[^/]+(?=/|$)', path)
    if prefix:
        request.scope['path'] = path[prefix.end():] or '/'
        request.scope['raw_path'] = request.scope['path'].encode('utf-8')
    return await call_next(request)


# Interrupted tasks remain visible as failed, rather than polling forever after restart.
for status_file in JOBS.glob('*/status.json'):
    try:
        record = json.loads(status_file.read_text())
        if record['status'] not in {'done','error'}:
            record.update(status='error', stage='분석 중단', error='서버가 재시작되었습니다. 영상을 다시 업로드해 주세요.')
            save_json(status_file,record)
    except (ValueError,KeyError):
        pass


def job_path(job_id):
    if not re.fullmatch(r'[a-f0-9]{24}',job_id):
        raise HTTPException(404,'분석 작업을 찾을 수 없습니다.')
    folder = JOBS/job_id
    if not folder.is_dir():
        raise HTTPException(404,'분석 작업을 찾을 수 없습니다.')
    return folder


@app.get('/api/health')
def health():
    return {'status':'ok','models_ready':bool(inspector.models),'model_error':inspector.error,
            'device':str(inspector.device),'active_job':active_job,
            'classes':{k:v.names for k,v in inspector.models.items()}}


@app.get('/api/jobs')
def jobs():
    records=[]
    for p in JOBS.glob('*/status.json'):
        try:
            records.append(json.loads(p.read_text()))
        except ValueError:
            pass
    return sorted(records,key=lambda x:x['created_at'],reverse=True)[:20]


@app.get('/api/inspections/INS-2026-031/fixed-map')
def inspection_fixed_map():
    # Deliberately independent of latest jobs, uploaded filenames and job state.
    return JSONResponse(fixed_map(), headers={'Cache-Control': 'no-store'})


@app.post('/api/rows/detect')
async def detect_rows(file: UploadFile = File(...), confidence: float = Form(.25)):
    if not .05 <= confidence <= .95:
        raise HTTPException(422, '탐지 신뢰도는 0.05~0.95 범위입니다.')
    try:
        data = await file.read(8*1024*1024+1)
        if not data or len(data) > 8*1024*1024:
            raise HTTPException(413, '전사 이미지는 0바이트 초과, 최대 8MB입니다.')
        image = await asyncio.to_thread(decode_image, data)
        return await asyncio.to_thread(row_inspector.detect, image, confidence)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    finally:
        await file.close()


@app.post('/api/analyze')
async def analyze(file: UploadFile = File(...),
                  det_conf: float = Form(.3), cls_conf: float = Form(.55),
                  site_id: str = Form('S1'), inspection_id: str = Form('INS-2026-031')):
    global active_job
    if site_id not in {f'S{i}' for i in range(1,14)} or not re.fullmatch(r'INS-\d{4}-\d{3,8}',inspection_id):
        raise HTTPException(422,'발전소와 점검 회차를 확인하세요.')
    if not .05 <= det_conf <= .95 or not .3 <= cls_conf <= .99:
        raise HTTPException(422,'분석 설정값이 유효하지 않습니다.')
    if not (file.filename or '').lower().endswith(('.mp4','.mov','.avi','.mkv','.webm','.m4v')):
        raise HTTPException(415,'MP4, MOV, AVI, MKV, WebM 영상을 선택해 주세요.')
    with active_lock:
        if active_job:
            raise HTTPException(409,'다른 영상이 분석 중입니다. 완료 후 다시 시도해 주세요.')
        job_id = uuid.uuid4().hex[:24]
        active_job = job_id
    folder = JOBS/job_id
    folder.mkdir()
    meta = {'id':job_id,'filename':Path(file.filename).name[:200],
            'created_at':datetime.now(timezone.utc).isoformat(),'status':'uploading',
            'stage':'영상 업로드 중','progress':0,'frame_stride':5,'aggregation':'track_majority_v1',
            'det_conf':det_conf,'cls_conf':cls_conf,'site_id':site_id,'inspection_id':inspection_id}
    save_json(folder/'status.json',meta)
    try:
        size=0
        with open(folder/'input.video','wb') as dest:
            while chunk := await file.read(1024*1024):
                size += len(chunk)
                if size > MAX_UPLOAD:
                    raise HTTPException(413,'영상 크기는 최대 500 MB입니다.')
                await asyncio.to_thread(dest.write,chunk)
        if size == 0:
            raise HTTPException(422,'비어 있는 파일입니다.')
        meta.update(status='queued',stage='분석 준비 중',upload_bytes=size)
        save_json(folder/'status.json',meta)
    except BaseException:
        with active_lock:
            active_job=None
        meta.update(status='error',stage='업로드 실패',error='업로드가 완료되지 않았습니다.')
        save_json(folder/'status.json',meta)
        (folder/'input.video').unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    def report(**kwargs):
        with meta_lock:
            meta.update(kwargs)
            save_json(folder/'status.json',meta)

    def run():
        global active_job
        try:
            inspector.run_video(folder,meta,report)
        finally:
            with active_lock:
                active_job=None
    executor.submit(run)
    return JSONResponse({'id':job_id},status_code=202)


@app.get('/api/jobs/{job_id}')
def status(job_id:str):
    return json.loads((job_path(job_id)/'status.json').read_text())


@app.get('/api/jobs/{job_id}/result')
def result(job_id:str):
    p=job_path(job_id)/'result.json'
    if not p.exists():
        raise HTTPException(409,'분석이 아직 완료되지 않았습니다.')
    return FileResponse(p,media_type='application/json',headers={'Cache-Control':'no-store'})


@app.get('/api/jobs/{job_id}/files/{filename:path}')
def artifact(job_id:str,filename:str):
    folder=job_path(job_id)
    allowed = filename in {'annotated.mp4','annotated_row_only.mp4','row_only_video.json','result.json','session.json','layout.json','review.json'} or re.fullmatch(r'frames/\d{5}\.jpg',filename) or re.fullmatch(r'crops/F\d{5}-P\d{3}\.jpg',filename)
    if not allowed:
        raise HTTPException(404)
    p=folder/filename
    if not p.is_file():
        raise HTTPException(404)
    return FileResponse(p,headers={'Cache-Control':'no-store'})


@app.get('/api/jobs/{job_id}/layout')
def get_layout(job_id:str):
    return effective_layout(job_path(job_id))


@app.post('/api/jobs/{job_id}/layout')
def create_layout(job_id:str, body:dict=Body(...)):
    try:
        if not isinstance(body.get('segments'),list) or not isinstance(body.get('params',{}),dict):
            raise ValueError('구간과 지도 설정을 확인하세요.')
        return generate_layout(job_path(job_id),body['segments'],body.get('params',{}))
    except (ValueError,TypeError,KeyError,OverflowError) as exc:
        raise HTTPException(422,str(exc))


@app.post('/api/jobs/{job_id}/review')
def review_panel(job_id:str, body:dict=Body(...)):
    try:
        return save_review(job_path(job_id),body)
    except (ValueError,TypeError,KeyError) as exc:
        raise HTTPException(422,str(exc))


@app.get('/api/jobs/{job_id}/session')
def get_session(job_id:str):
    try:
        return load_session(job_path(job_id))
    except ValueError as exc:
        raise HTTPException(409,str(exc))


@app.get('/api/jobs/{job_id}/reference/{source_frame}/{track_id}')
def panel_reference(job_id:str,source_frame:int,track_id:str):
    try:
        path=reference_image(job_path(job_id),source_frame,track_id)
        return FileResponse(path,media_type='image/jpeg')
    except ValueError as exc:
        raise HTTPException(404,str(exc))


@app.get('/api/jobs/{job_id}/source-video')
def source_video(job_id:str):
    folder=job_path(job_id)
    path=folder/'input.video'
    if not path.is_file():raise HTTPException(404,'저장된 원본 영상이 없습니다.')
    status=json.loads((folder/'status.json').read_text())
    media=mimetypes.guess_type(status.get('filename','video.mp4'))[0] or 'video/mp4'
    return FileResponse(path,media_type=media,headers={'Cache-Control':'no-store'})


@app.get('/api/jobs/{job_id}/frame/{source_frame}')
def exact_frame(job_id:str,source_frame:int,mode:str='source'):
    try:
        path=editor_frame(job_path(job_id),source_frame,mode)
        return FileResponse(path,media_type='image/jpeg',headers={'Cache-Control':'no-store'})
    except (ValueError,FileNotFoundError) as exc:
        raise HTTPException(422,str(exc))


@app.get('/api/jobs/{job_id}/view')
def dashboard_result(job_id:str):
    try:
        return FileResponse(result_view_file(job_path(job_id)),media_type='application/json',headers={'Cache-Control':'no-store'})
    except ValueError as exc:
        raise HTTPException(409,str(exc))


@app.get('/analysis')
def analysis_workspace():
    return FileResponse(ROOT/'analysis.html',media_type='text/html',headers={'Cache-Control':'no-store'})


@app.post('/api/jobs/{job_id}/layout/ensure')
def ensure_initial_layout(job_id:str):
    try:
        return ensure_portal_layout(job_path(job_id))
    except (ValueError,TypeError,KeyError) as exc:
        raise HTTPException(422,str(exc))


@app.get('/{path:path}')
def index(path:str=''):
    if path.startswith('api/'):
        raise HTTPException(404)
    return FileResponse(ROOT/'index.html',media_type='text/html',headers={'Cache-Control':'no-store'})
