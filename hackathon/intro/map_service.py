"""Adapt the current five-frame/voting output to the supplied manual-layout schema.

Inference rules remain unchanged. The user-supplied layout algorithm operates on
source-frame trajectories; timestamps are never confused with sampled indices.
"""
from collections import Counter, defaultdict
from copy import deepcopy
import json
from pathlib import Path
import re
import threading

import cv2
import numpy as np

from pipeline import save_json
from virtual_map_manual import build_manual_layout
from bounded_map import build_bounded_layout
from cell_consensus import update_layout_consensus, POLICY
from layout_review import apply_reviews, validate, cell_key

LOCK = threading.RLock()


def session_from_result(result):
    width,height = result['width'],result['height']
    tracks = {t['id']:t for t in result.get('tracks',[])}
    if not tracks and not result.get('aggregation'):
        raise ValueError('이 결과에는 누적 추적 ID가 없습니다. 현재 방식으로 영상을 다시 분석해 주세요.')
    history = defaultdict(list)
    for f in result['frames']:
        for obs in f['detections']:
            if obs.get('track_id') in tracks:
                history[obs['track_id']].append((f,obs))
    panels=[]
    for tid,track in tracks.items():
        seen=history.get(tid,[])
        if not seen:
            continue
        status={'review':'insufficient','suppressed':'rejected'}.get(track['state'],track['state'])
        traj=[]
        best=None
        refs=[]
        for f,o in seen:
            polygon=np.asarray(o['polygon'],np.float64)
            low,high=polygon.min(0),polygon.max(0)
            x,y=(low+high)/2
            w,h=high-low
            traj.append([f['source_frame'],round(x/width,4),round(y/height,4),round(w/width,4),round(h/height,4),
                         *np.round((polygon/[width,height]).reshape(-1),4).tolist()])
            if best is None or w*h>best[0]:best=(w*h,o)
            refs.append({'frame':f['source_frame'],'observation_id':o['id'],'crop':o.get('crop')})
        classes=[c for c,n in track.get('subtype_votes',{}).items() if n>0 and c in {'bird','dust','leaf'}]
        evidence=track.get('evidence',{})
        thumbs={'rep':best[1].get('crop')} if best and best[1].get('crop') else {}
        for state in ['crack','dirty']:
            if evidence.get(state,{}).get('crop'):thumbs[state]=evidence[state]['crop']
        if 'dirty' in thumbs:thumbs['dirty_raw']=thumbs['dirty']
        panels.append({'uid':tid,'track_id':tid,'status':status,'with_dirty':status=='crack' and bool(classes),
                       'dirty_classes':classes,'dirty_label':('dirty_'+classes[0] if len(classes)==1 else 'dirty_'+str(len(classes))) if classes else None,
                       'first_frame':seen[0][0]['source_frame'],'last_frame':seen[-1][0]['source_frame'],
                       'observations':len(seen),'votes':dict(track['votes']),'traj':traj,'thumbs':thumbs,
                       'references':refs,'tie':track.get('tie',False),'evidence':evidence})
    counts=Counter(p['status'] for p in panels)
    return {'session_id':result['job_id'],'schema':1,'meta':{'label':result['filename'],
            'frame_size':[width,height],'source_fps':result['source_fps'],
            'frames_processed':int(round(result['duration']*result['source_fps'])),
            'frame_stride':result.get('frame_stride',5),'aggregation':result.get('aggregation'),
            'adapter':'five_frame_track_votes_to_manual_layout_v1'},'panels':panels,
            'summary':{'total_tracks':len(panels),**{s:counts[s] for s in ['crack','dirty','clean','insufficient','rejected']}}}


def load_session(folder):
    p=folder/'session.json'
    if p.exists():return json.loads(p.read_text())
    result_path=folder/'result.json'
    if not result_path.exists():raise ValueError('영상 분석을 완료한 다음 지도를 생성하세요.')
    doc=session_from_result(json.loads(result_path.read_text()))
    save_json(p,doc)
    return doc


def effective_layout(folder):
    p=folder/'layout.json'
    if not p.exists():return None
    review=folder/'review.json'
    layout=json.loads(p.read_text())
    if layout.get('decision_policy')!=POLICY:
        by_uid={}
        if any(p.get('members') for p in layout.get('panels',[])) and ((folder/'session.json').exists() or (folder/'result.json').exists()):
            by_uid={r['uid']:r for r in load_session(folder)['panels']}
        update_layout_consensus(layout,by_uid)
    return apply_reviews(layout,json.loads(review.read_text()) if review.exists() else None)


def generate_layout(folder,segments,params):
    with LOCK:
        session=load_session(folder)
        last=max((r['last_frame'] for r in session['panels']),default=0)
        if len(segments)>100:raise ValueError('구간은 최대 100개까지 지정할 수 있습니다.')
        for s in segments:
            if not isinstance(s,dict):raise ValueError('각 구간은 시작·끝·열 번호를 포함해야 합니다.')
            start,end=s.get('start'),s.get('end')
            if not isinstance(start,int) or not isinstance(end,int) or start<0 or end>session['meta']['frames_processed']-1:
                raise ValueError('구간의 시작·끝은 원본 영상 범위 안의 정수 프레임이어야 합니다.')
            if abs(int(s.get('col_offset',0)))>5000 or abs(int(s.get('lane_offset',0)))>500 or not 1<=int(s.get('row',1))<=100:
                raise ValueError('열 번호와 오프셋 범위를 확인하세요.')
        if not 0<=float(params.get('band_top',.65))<=.9 or not float(params.get('band_top',.65))+.05<=float(params.get('band_bottom',.95))<=1:
            raise ValueError('화면 띠 시작은 0~90%, 끝은 시작보다 5%p 이상 커야 하며 100% 이하여야 합니다.')
        if not 1<=int(params.get('min_band_obs',2))<=100:
            raise ValueError('최소 관측 수는 1~100이어야 합니다.')
        layout=build_bounded_layout(session,segments,params,folder) if params.get('row_specs') else build_manual_layout(session,segments,params)
        by_uid={p['uid']:p for p in session['panels']}
        for cell in layout['panels']:
            # Repeated appearances of a track in adjacent segments are one membership.
            members={}
            for m in cell['members']:
                uid=m['uid'];rec=by_uid[uid]
                m.update(votes=rec['votes'],tie=rec.get('tie',False))
                frame_ref=next((r for r in rec['references'] if r['frame']==m['ref_frame']),None)
                if frame_ref:m['reference_crop']=frame_ref.get('crop')
                if uid not in members:members[uid]=m
                else:members[uid].setdefault('additional_references',[]).append({'segment':m['segment'],'frame':m['ref_frame']})
            cell['members']=list(members.values())
            # Unlike the reference's dust fallback, do not invent an unverified subtype.
            cls={c for m in cell['members'] for c in by_uid[m['uid']]['dirty_classes']
                 if by_uid[m['uid']]['status']=='dirty' or by_uid[m['uid']]['with_dirty']}
            cell['dirty_classes']=[c for c in ['bird','dust','leaf'] if c in cls]
            cell['dirty_label']=('dirty_'+cell['dirty_classes'][0] if len(cls)==1 else 'dirty_'+str(len(cls))) if cls else None
            cell['votes']={c:sum(m['votes'][c] for m in cell['members']) for c in ['clean','dirty','crack']}
        update_layout_consensus(layout,by_uid)
        used={m['uid'] for p in layout['panels'] for m in p['members']}
        layout['summary'].update(tracks_used=len(used),tracks_merged=sum(len(p['members'])-1 for p in layout['panels']),tracks_excluded=len(session['panels'])-len(used))
        layout['inference']={'frame_stride':session['meta']['frame_stride'],'aggregation':session['meta']['aggregation']}
        save_json(folder/'layout.json',layout)
        return effective_layout(folder)


def save_review(folder,body):
    with LOCK:
        layout=effective_layout(folder)
        if layout is None:raise ValueError('먼저 지도를 생성하세요.')
        panel=next((p for p in layout['panels'] if p['pid']==body.get('pid')),None)
        if panel is None:raise ValueError('해당 지도 칸이 없습니다.')
        if panel.get('synthetic') and not panel.get('members'):
            raise ValueError('미탐지 칸에는 관측 근거가 없어 정상·오염·크랙 판정을 저장할 수 없습니다.')
        if body.get('key')!=cell_key(panel):raise ValueError('지도 칸이 변경되었습니다. 다시 선택해 주세요.')
        path=folder/'review.json'
        doc=json.loads(path.read_text()) if path.exists() else {'reviews':{}}
        if body.get('reset'):
            key=(panel.get('review') or {}).get('stored_key',body['key'])
            doc['reviews'].pop(key,None)
        else:
            clean=validate(body)
            doc['reviews'][clean['key']]=clean
        save_json(path,doc)
        return effective_layout(folder)


def reference_image(folder,source_frame,track_id):
    if not re.fullmatch(r'T\d{6}',track_id):raise ValueError('유효하지 않은 추적 ID입니다.')
    session=load_session(folder)
    rec=next((p for p in session['panels'] if p['uid']==track_id),None)
    point=next((t for t in rec['traj'] if t[0]==source_frame),None) if rec else None
    if point is None:raise ValueError('해당 시점의 패널 관측이 없습니다.')
    dest=folder/'references'/f'F{source_frame:07d}-{track_id}.jpg'
    if dest.exists():return dest
    video=cv2.VideoCapture(str(folder/'input.video'))
    try:
        video.set(cv2.CAP_PROP_POS_FRAMES,source_frame)
        ok,frame=video.read()
        if not ok:raise ValueError('원본 영상의 해당 프레임을 읽을 수 없습니다.')
        h,w=frame.shape[:2]
        quad=(np.array(point[5:13]).reshape(4,2)*[w,h]).round().astype(np.int32)
        cv2.polylines(frame,[quad],True,(40,220,255),max(2,round(w/450)),cv2.LINE_AA)
        scale=min(1.,960/max(w,h));frame=cv2.resize(frame,(round(w*scale),round(h*scale)))
        dest.parent.mkdir(exist_ok=True)
        if not cv2.imwrite(str(dest),frame,[cv2.IMWRITE_JPEG_QUALITY,90]):raise ValueError('근거 이미지를 저장하지 못했습니다.')
    finally:video.release()
    return dest


def ensure_portal_layout(folder):
    """Create an initial layout once; never overwrite saved manual segments."""
    with LOCK:
        existing=effective_layout(folder)
        if existing is not None:return existing
        doc=load_session(folder)
        status=json.loads((folder/'status.json').read_text())
        end=max(1,doc['meta']['frames_processed']-1)
        params={'band_top':.65,'band_bottom':.95,'min_band_obs':2,'include_insufficient':True}
        if status.get('site_id','S1')=='S1':
            params['row_specs']=[{'row':1,'lanes':5,'cols':15},{'row':2,'lanes':5,'cols':16}]
        return generate_layout(folder,[{'start':0,'end':end,'row':1,'direction':'out','mirror':False,'col_offset':0,'lane_offset':0}],params)
