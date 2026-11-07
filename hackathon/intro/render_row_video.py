"""Render only map-approved tracks in their assigned flight segment from saved inference."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import subprocess

import cv2
import imageio_ffmpeg
import numpy as np

from bounded_map import axes, _dominant_angle

from pipeline import Inspector, save_json
from map_service import effective_layout


def segment_memberships(layout):
    """Track approval is segment-specific, never a global whitelist."""
    members=defaultdict(dict)
    for cell in layout['panels']:
        if cell.get('synthetic'):continue
        for member in cell.get('members',[]):
            segments={member['segment'],*(r['segment'] for r in member.get('additional_references',[]))}
            for segment in segments:
                definition=layout['segments'][segment-1]
                if definition['row']!=cell['row']:
                    raise ValueError('Map membership and flight row do not match')
                uid=member.get('track_id',member['uid'])
                if uid in members[segment] and members[segment][uid]['pid']!=cell['pid']:
                    raise ValueError('A track cannot have two physical positions in a flight segment')
                members[segment][uid]=cell
    return members


def filter_observations(frame,layout,members):
    allowed={}
    for index,segment in enumerate(layout['segments'],1):
        if segment['start']<=frame['source_frame']<=segment['end']:
            allowed.update(members.get(index,{}))
    candidates=[o for o in frame['detections'] if o.get('track_id') in allowed and o.get('polygon')]
    # A tracked box can rotate onto a support/neighbor briefly despite a valid map
    # reference. Reject these per-frame orientation outliers as well.
    angles=[axes(o['polygon'],1,1)[2] for o in candidates]
    dominant=_dominant_angle(angles,[1]*len(angles)) if len(angles)>=3 else None
    filtered=[]
    for obs in frame['detections']:
        cell=allowed.get(obs.get('track_id'))
        if cell is None:continue
        if dominant is not None and obs.get('polygon'):
            angle=axes(obs['polygon'],1,1)[2]
            if abs((angle-dominant+90)%180-90)>22:continue
        state=cell['status']
        # Original display policy: clean panels are recorded but have no overlay.
        if state not in {'dirty','crack'}:continue
        classes=cell.get('dirty_classes',[]) if state=='dirty' else ['crack']
        item={**obs,'state':state,'labels':(['panel_crack'] if state=='crack' else
              ['panel_dirty_'+c for c in classes] or ['panel_dirty']),
              'details':[d for d in obs.get('raw_details',obs.get('details',[])) if d['class'] in classes],
              'map_panel_id':cell['pid']}
        if state=='dirty' and obs.get('polygon'):
            details=[]
            for detail in item['details']:
                if not detail.get('polygon'):continue
                area,clipped=cv2.intersectConvexConvex(np.asarray(detail['polygon'],np.float32),np.asarray(obs['polygon'],np.float32))
                if area>1 and clipped is not None:
                    details.append({**detail,'polygon':clipped.reshape(-1,2).tolist()})
            item['details']=details
        filtered.append(item)
    return filtered


def render(folder):
    folder=Path(folder);layout=effective_layout(folder)
    if not layout or not layout.get('segments'):raise ValueError('A saved flight-segment map is required')
    result=json.loads((folder/'result.json').read_text())
    approved=segment_memberships(layout)
    frames=result['frames'];stride=int(result.get('frame_stride',5));fps=float(result['sample_fps'])
    width,height=int(result['width']),int(result['height'])
    output=folder/'annotated_row_only.mp4';temp=folder/'annotated_row_only.partial.mp4'
    cap=cv2.VideoCapture(str(folder/'input.video'))
    if not cap.isOpened():raise ValueError('Cannot open original video')
    encoder=None
    stats=Counter();audit=[]
    try:
        with (folder/'row_only_encoder.log').open('w') as log:
            encoder=subprocess.Popen([imageio_ffmpeg.get_ffmpeg_exe(),'-y','-loglevel','error',
                '-f','rawvideo','-pix_fmt','bgr24','-s',f'{width}x{height}','-r',str(fps),'-i','-',
                '-an','-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',str(temp)],
                stdin=subprocess.PIPE,stderr=log)
            source=0;rendered=0
            while cap.grab():
                if source%stride:
                    source+=1;continue
                ok,image=cap.retrieve()
                if not ok or rendered>=len(frames) or frames[rendered]['source_frame']!=source:
                    raise ValueError('Source frame alignment failed')
                frame=frames[rendered];selected=filter_observations(frame,layout,approved)
                stats['original_box_observations']+=sum(o['state'] not in {'clean','suppressed'} for o in frame['detections'])
                stats['row_only_box_observations']+=len(selected)
                if selected:stats['frames_with_boxes']+=1
                audit.append({'source_frame':source,'tracks':[o['track_id'] for o in selected],
                              'cells':[o['map_panel_id'] for o in selected]})
                encoder.stdin.write(Inspector.annotate(image,selected).tobytes())
                rendered+=1;source+=1
                if rendered%100==0:print(f'Rendered {rendered}/{len(frames)}',flush=True)
            if rendered!=len(frames):raise ValueError('Incomplete output frame count')
            encoder.stdin.close()
            if encoder.wait(timeout=120)!=0:raise RuntimeError('Video encoding failed')
        temp.replace(output)
    except BaseException:
        if encoder and encoder.poll() is None:encoder.kill();encoder.wait()
        temp.unlink(missing_ok=True)
        raise
    finally:cap.release()
    report={'file':output.name,'created_at':datetime.now(timezone.utc).isoformat(),
            'policy':'map_approved_tracks_in_assigned_segment_only','state_policy':'physical_cell_sum_votes_dirty_on_tie',
            'clean_boxes':False,'geometry_policy':'reject_frame_orientation_outliers_and_clip_detail_boxes_to_panel','source_fps':result['source_fps'],'output_fps':fps,'frame_stride':stride,
            'output_frames':len(frames),'width':width,'height':height,
            'approved_tracks':len({tid for m in approved.values() for tid in m}),
            'segments':[{k:s[k] for k in ['start','end','row','direction']} for s in layout['segments']],
            'statistics':dict(stats),'frames':audit}
    save_json(folder/'row_only_video.json',report)
    status=json.loads((folder/'status.json').read_text());status['row_only_video']=output.name
    save_json(folder/'status.json',status)
    print(json.dumps({k:v for k,v in report.items() if k!='frames'},ensure_ascii=False),flush=True)
    return report

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('folder');args=parser.parse_args();render(args.folder)
