"""Panel inspection: OBB crop → panel mask → classification → defect verification."""
import json
import math
import os
from pathlib import Path
import subprocess
import threading
import time
import traceback

os.environ.setdefault('YOLO_CONFIG_DIR', '/data/hackathon/intro/.yolo')
import cv2
import imageio_ffmpeg
import numpy as np
import torch
from ultralytics import YOLO
from tracking import PanelTracker

MODEL_DIR = Path(os.environ.get('PANEL_MODEL_DIR', '/data/panel_models'))
MODEL_FILES = {'obb': 'panel_obb.pt', 'seg': 'panel_seg.pt', 'cls': 'panel_class_cls.pt',
               'crack': 'panel_crack_seg.pt', 'dirty': 'panel_dirty_class_obb.pt'}
COLORS = {'crack': (110, 95, 235), 'bird': (70, 155, 240), 'dust': (65, 195, 230),
          'leaf': (90, 175, 130), 'review': (200, 150, 80)}


def save_json(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False), encoding='utf-8')
    tmp.replace(path)


def transform(points, matrix):
    return cv2.perspectiveTransform(np.array(points, dtype=np.float32).reshape(1, -1, 2), matrix)[0]


def oriented_crop(image, points):
    pts = np.asarray(points, dtype=np.float32)
    center = pts.mean(axis=0)
    pts = pts[np.argsort(np.arctan2(pts[:, 1]-center[1], pts[:, 0]-center[0]))]
    pts = np.roll(pts, -np.argmin(pts.sum(axis=1)), axis=0)
    width = int(round(max(np.linalg.norm(pts[1]-pts[0]), np.linalg.norm(pts[2]-pts[3]))))
    height = int(round(max(np.linalg.norm(pts[3]-pts[0]), np.linalg.norm(pts[2]-pts[1]))))
    if width < 12 or height < 12:
        return None
    # Large source panels do not need multi-megapixel individual inference crops.
    scale = min(1., 1024/max(width, height))
    width, height = max(12, round(width*scale)), max(12, round(height*scale))
    dst = np.float32([[0, 0], [width-1, 0], [width-1, height-1], [0, height-1]])
    matrix = cv2.getPerspectiveTransform(pts, dst)
    crop = cv2.warpPerspective(image, matrix, (width, height))
    return crop, np.linalg.inv(matrix)


class Inspector:
    def __init__(self):
        self.models = {}
        self.lock = threading.Lock()
        self.device = 'cpu'
        self.error = None
        self.loading = False

    def load(self):
        with self.lock:
            if self.models:
                return
            self.loading = True
            try:
                torch.set_num_threads(4)
                self.device = 0 if torch.cuda.is_available() else 'cpu'
                models = {key: YOLO(str(MODEL_DIR/name)) for key, name in MODEL_FILES.items()}
                expected = {'obb': {'panel'}, 'seg': {'panel'}, 'cls': {'clean', 'crack', 'dirty'},
                            'crack': {'crack', 'cracked'}, 'dirty': {'bird', 'dust', 'leaf', 'snow'}}
                for key, model in models.items():
                    names = set(model.names.values())
                    if key == 'crack':
                        assert names.intersection(expected[key]), f'{key}: unexpected classes {names}'
                    else:
                        assert names == expected[key], f'{key}: unexpected classes {names}'
                    model.predict(np.zeros((320, 320, 3), np.uint8), imgsz=320,
                                  device=self.device, verbose=False)
                self.models = models
                self.error = None
            except Exception as exc:
                self.error = f'{type(exc).__name__}: {exc}'
                raise
            finally:
                self.loading = False

    def predict(self, key, image, **kw):
        return self.models[key].predict(image, device=self.device, verbose=False, **kw)[0]

    def inspect_frame(self, frame, frame_no, conf, cls_conf, folder):
        result = self.predict('obb', frame, conf=conf, imgsz=1024, max_det=300)
        observations = []
        obbs = result.obb
        if obbs is None:
            return observations, False
        polygons = obbs.xyxyxyxy.cpu().numpy()
        scores = obbs.conf.cpu().tolist()
        for i, (polygon, score) in enumerate(zip(polygons, scores)):
            obs = {'id': f'F{frame_no:05d}-P{i+1:03d}', 'polygon': np.round(polygon, 1).tolist(),
                   'obb_confidence': round(score, 4), 'state': 'review', 'class': None,
                   'confidence': None, 'labels': [], 'details': [], 'reason': None}
            crop_result = oriented_crop(frame, polygon)
            if crop_result is None:
                obs['reason'] = 'crop_too_small'
                observations.append(obs)
                continue
            crop, inv = crop_result
            crop_name = f'crops/{obs["id"]}.jpg'
            cv2.imwrite(str(folder/crop_name), crop, [cv2.IMWRITE_JPEG_QUALITY, 85])
            obs['crop'] = crop_name
            seg = self.predict('seg', crop, conf=conf, imgsz=640)
            if seg.masks is None or len(seg.masks.xy) == 0:
                obs['reason'] = 'panel_mask_not_found'
                observations.append(obs)
                continue
            # Prefer the central panel when a crop contains a neighboring panel fragment.
            h, w = crop.shape[:2]
            def mask_score(p):
                area = abs(cv2.contourArea(p))
                return area * (1.5 if cv2.pointPolygonTest(p.astype(np.float32), (w/2, h/2), False) >= 0 else 1.)
            poly = max(seg.masks.xy, key=mask_score)
            mask = np.zeros((h, w), np.uint8)
            cv2.fillPoly(mask, [np.round(poly).astype(np.int32)], 255)
            if cv2.countNonZero(mask) < 64:
                obs['reason'] = 'panel_mask_too_small'
                observations.append(obs)
                continue
            masked = cv2.bitwise_and(crop, crop, mask=mask)
            x, y, mw, mh = cv2.boundingRect(poly.astype(np.float32))
            x, y = max(0, x), max(0, y)
            roi = masked[y:min(h, y+mh), x:min(w, x+mw)]
            if roi.size == 0:
                obs['reason'] = 'empty_panel_mask'
                observations.append(obs)
                continue
            cv2.imwrite(str(folder/crop_name), roi, [cv2.IMWRITE_JPEG_QUALITY, 85])
            obs['panel_mask'] = np.round(transform(poly, inv), 1).tolist()
            cls = self.predict('cls', roi, imgsz=224)
            name = cls.names[int(cls.probs.top1)]
            confidence = float(cls.probs.top1conf)
            obs['class'], obs['confidence'] = name, round(confidence, 4)
            if confidence < cls_conf:
                obs['reason'] = 'classification_low_confidence'
            elif name == 'clean':
                obs['state'] = 'clean'
            elif name == 'crack':
                cr = self.predict('crack', roi, imgsz=640, conf=conf)
                if cr.masks is not None and len(cr.masks.xy):
                    obs['state'], obs['labels'] = 'crack', ['panel_crack']
                    for j, p in enumerate(cr.masks.xy):
                        pp = np.array(p, np.float32) + np.float32([x, y])
                        obs['details'].append({'class': 'crack', 'confidence': round(float(cr.boxes.conf[j]), 4),
                                               'polygon': np.round(transform(pp, inv), 1).tolist()})
                else:
                    obs['reason'] = 'crack_not_verified'
            elif name == 'dirty':
                dr = self.predict('dirty', roi, imgsz=640, conf=conf)
                snow = []
                if dr.obb is not None:
                    for p, c, sc in zip(dr.obb.xyxyxyxy.cpu().numpy(), dr.obb.cls.cpu().tolist(), dr.obb.conf.cpu().tolist()):
                        detail_name = dr.names[int(c)]
                        item = {'class': detail_name, 'confidence': round(sc, 4),
                                'polygon': np.round(transform(p+np.float32([x, y]), inv), 1).tolist()}
                        if detail_name == 'snow':
                            snow.append(item)
                            continue
                        if detail_name in {'bird', 'dust', 'leaf'}:
                            obs['details'].append(item)
                    obs['suppressed_snow'] = snow
                if obs['details']:
                    obs['state'] = 'dirty'
                    obs['labels'] = sorted({'panel_dirty_'+d['class'] for d in obs['details']})
                elif snow:
                    obs['state'], obs['reason'] = 'suppressed', 'snow_only_suppressed'
                else:
                    obs['reason'] = 'dirty_not_verified'
            observations.append(obs)
        return observations, len(polygons) >= 300

    @staticmethod
    def annotate(frame, observations):
        canvas = frame.copy()
        for obs in observations:
            if obs['state'] in {'clean', 'suppressed'}:
                continue
            state = obs['state']
            key = 'crack' if state == 'crack' else (obs['details'][0]['class'] if obs['details'] else 'dust') if state == 'dirty' else 'review'
            color = COLORS[key]
            polygon = np.int32(obs['polygon'])
            cv2.polylines(canvas, [polygon], True, color, 2, cv2.LINE_AA)
            for detail in obs['details']:
                points = np.int32(detail['polygon'])
                cv2.polylines(canvas, [points], True, COLORS.get(detail['class'], color), 2, cv2.LINE_AA)
            label = ' / '.join(obs['labels']) if obs['labels'] else 'panel_review'
            if obs.get('track_id'):
                label += ' ['+obs['track_id']+']'
            x = int(max(0, min(polygon[:, 0].min(), canvas.shape[1]-200)))
            y = int(max(20, min(polygon[:, 1].min(), canvas.shape[0]-4)))
            size = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, .5, 1)[0]
            cv2.rectangle(canvas, (x, y-20), (min(canvas.shape[1], x+size[0]+8), y+3), color, -1)
            cv2.putText(canvas, label, (x+4, y-4), cv2.FONT_HERSHEY_SIMPLEX, .5, (255,255,255), 1, cv2.LINE_AA)
        return canvas

    def run_video(self, job_dir, meta, report):
        capture = None
        encoder = None
        stderr = None
        try:
            report(status='loading', stage='모델 로딩 중', progress=0)
            self.load()
            capture = cv2.VideoCapture(str(job_dir/'input.video'))
            if not capture.isOpened():
                raise ValueError('영상 파일을 열 수 없습니다. MP4 또는 WebM 영상을 사용해 주세요.')
            fps = float(capture.get(cv2.CAP_PROP_FPS))
            nframes = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
            width, height = int(capture.get(3)), int(capture.get(4))
            if not math.isfinite(fps) or fps <= 0 or nframes <= 0 or min(width,height) <= 0:
                raise ValueError('영상 프레임 정보가 유효하지 않습니다.')
            duration = nframes/fps
            if duration > 600:
                raise ValueError('현재 테스트는 10분 이하 영상을 지원합니다.')
            stride = 5
            output_fps = fps/stride
            (job_dir/'crops').mkdir(exist_ok=True)
            (job_dir/'frames').mkdir(exist_ok=True)
            output_scale = min(1., 1280/max(width,height))
            out_w, out_h = max(2,int(width*output_scale)//2*2), max(2,int(height*output_scale)//2*2)
            report(status='running', stage='5프레임 간격 탐지 · 패널 추적 및 누적 집계', width=width, height=height,
                   duration=round(duration,3), source_fps=round(fps,3), total_frames=math.ceil(nframes/stride),
                   frame_stride=stride, aggregation='track_majority_v1',
                   effective_sample_fps=round(output_fps,4), device=str(self.device))
            frames = []
            raw_counts = dict.fromkeys(['clean','crack','dirty','review','suppressed'],0)
            tracker = PanelTracker()
            start = time.monotonic()
            source_index, analyzed = 0, 0
            # Pass 1: infer and associate before deciding the final state of each panel.
            while capture.grab():
                if source_index % stride:
                    source_index += 1
                    continue
                ok, frame = capture.retrieve()
                if not ok:
                    raise ValueError(f'{source_index} 프레임을 디코딩하지 못했습니다.')
                observations, limit_hit = self.inspect_frame(frame, analyzed, meta['det_conf'], meta['cls_conf'], job_dir)
                motion_mode = tracker.associate(frame,observations)
                for obs in observations:
                    raw_counts[obs['state']] += 1
                frames.append({'index':analyzed,'source_frame':source_index,'time':round(source_index/fps,4),
                               'preview':f'frames/{analyzed:05d}.jpg','detections':observations,
                               'detection_limit_hit':limit_hit,'tracking_motion':motion_mode})
                analyzed += 1
                counts = dict.fromkeys(['clean','crack','dirty','review','suppressed'],0)
                for track in tracker.tracks.values():
                    counts[track['decision']] += 1
                report(progress=min(85,round((source_index+stride)/nframes*85,1)), analyzed_frames=analyzed,
                       observations=sum(raw_counts.values()), tracked_panels=len(tracker.tracks), counts=counts,
                       elapsed=round(time.monotonic()-start,1))
                source_index += 1
            if not frames:
                raise ValueError('분석할 수 있는 영상 프레임이 없습니다.')
            tracks, counts = tracker.summary()
            for frame_info in frames:
                for obs in frame_info['detections']:
                    tracker.finalize_observation(obs)
            # Pass 2: every output frame uses the same final track vote, not transient labels.
            report(stage='누적 최종 판정으로 결과 영상 생성 중', progress=85, counts=counts,
                   tracked_panels=len(tracks), scene_resets=tracker.scene_resets)
            capture.release()
            capture = cv2.VideoCapture(str(job_dir/'input.video'))
            stderr = open(job_dir/'encoder.log', 'w')
            encoder = subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loglevel', 'error',
                '-f','rawvideo','-pix_fmt','bgr24','-s',f'{out_w}x{out_h}', '-r',str(output_fps),
                '-i','-', '-an', '-c:v','libx264', '-preset','veryfast', '-crf','23',
                '-pix_fmt','yuv420p','-movflags','+faststart', str(job_dir/'annotated.mp4')],
                stdin=subprocess.PIPE, stderr=stderr)
            source_index, rendered = 0, 0
            while capture.grab():
                if source_index % stride:
                    source_index += 1
                    continue
                ok, frame = capture.retrieve()
                if not ok or rendered >= len(frames):
                    raise ValueError('결과 영상 프레임을 재구성하지 못했습니다.')
                frame_info = frames[rendered]
                if frame_info['source_frame'] != source_index:
                    raise ValueError('원본 영상과 결과 프레임 순서가 일치하지 않습니다.')
                annotated = self.annotate(frame,frame_info['detections'])
                small = cv2.resize(annotated,(out_w,out_h))
                cv2.imwrite(str(job_dir/frame_info['preview']),small,[cv2.IMWRITE_JPEG_QUALITY,85])
                encoder.stdin.write(small.tobytes())
                rendered += 1
                report(progress=round(85+rendered/len(frames)*14,1),rendered_frames=rendered,
                       latest_preview=frame_info['preview'],elapsed=round(time.monotonic()-start,1))
                source_index += 1
            if rendered != len(frames):
                raise ValueError('결과 영상의 프레임 수가 분석 프레임 수와 다릅니다.')
            encoder.stdin.close()
            if encoder.wait(timeout=120) != 0:
                raise RuntimeError('분석 영상 인코딩 실패. encoder.log를 확인해 주세요.')
            result = {'job_id':meta['id'],'filename':meta['filename'],'width':width,'height':height,
                      'duration':round(duration,3),'source_fps':fps,'sample_fps':output_fps,'frame_stride':5,
                      'aggregation':'track_majority_v1','tie_policy':'keep_previous_winner_else_review',
                      'crack_vote_policy':'only_segmentation_verified_crack_votes',
                      'dirty_subtype_policy':'most_frequent_verified_subtype_ties_show_all',
                      'counts':counts,'observation_counts':raw_counts,'observation_total':sum(raw_counts.values()),
                      'tracks':tracks,'frames':frames,'model_files':MODEL_FILES,
                      'thresholds':{'detection':meta['det_conf'],'classification':meta['cls_conf']},
                      'count_unit':'local_panel_tracks','tracking':{'method':'camera_motion_homography_iou_assignment',
                      'max_missing_sampled_frames':tracker.max_gap,'scene_resets':tracker.scene_resets,
                      'limitation':'Track IDs may change after cuts, long occlusion, or failed camera-motion estimation.'},
                      'map_type':'frame_relative_not_georeferenced',
                      'crack_verifier':'panel_crack_seg.pt','snow_display':False,
                      'created_at':meta['created_at'],'site_id':meta.get('site_id','S1'),
                      'inspection_id':meta.get('inspection_id','INS-2026-031'),'elapsed':round(time.monotonic()-start,1)}
            save_json(job_dir/'result.json',result)
            report(status='done',stage='누적 판정 분석 완료',progress=100,elapsed=result['elapsed'])
        except Exception as exc:
            traceback.print_exc()
            report(status='error',stage='분석 실패',error=f'{type(exc).__name__}: {exc}')
        finally:
            if capture is not None:
                capture.release()
            if encoder is not None and encoder.poll() is None:
                encoder.kill()
                encoder.wait()
            if stderr is not None:
                stderr.close()
