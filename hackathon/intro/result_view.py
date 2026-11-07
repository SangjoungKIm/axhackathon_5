"""Compact read model for the dashboard; full inference JSON remains untouched."""
import json
import threading
from pipeline import save_json

LOCK=threading.Lock()
OBS_KEYS={'id','track_id','polygon','state','class','confidence','obb_confidence','labels','reason','crop','votes','subtype_votes','track_observations','vote_tie','raw_reason','decision_evidence'}
TRACK_KEYS={'id','state','labels','votes','subtype_votes','observations','tie','first_frame','last_frame'}


def compact_result(result):
    doc={k:v for k,v in result.items() if k not in {'frames','tracks'}}
    doc['ui_view_schema']=1
    doc['tracks']=[{k:v for k,v in t.items() if k in TRACK_KEYS} for t in result.get('tracks',[])]
    frames=[]
    for frame in result['frames']:
        f={k:v for k,v in frame.items() if k!='detections'}
        observations=[]
        for obs in frame['detections']:
            o={k:v for k,v in obs.items() if k in OBS_KEYS}
            o['details']=[{k:v for k,v in d.items() if k in {'class','confidence'}} for d in obs.get('details',[])]
            observations.append(o)
        f['detections']=observations;frames.append(f)
    doc['frames']=frames
    return doc


def result_view_file(folder):
    source=folder/'result.json';dest=folder/'view.json'
    if not source.is_file():raise ValueError('분석 결과가 아직 없습니다.')
    with LOCK:
        if not dest.is_file() or dest.stat().st_mtime_ns<source.stat().st_mtime_ns:
            result=json.loads(source.read_text())
            save_json(dest,compact_result(result))
    return dest
