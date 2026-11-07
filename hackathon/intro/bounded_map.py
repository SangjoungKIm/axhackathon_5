"""Known-array layout: fit a bounded physical lattice; reject rather than squash outliers.

Uses the supplied manual mapper's camera-motion coordinates. The declared row
shape is a prior, never a detected status: empty positions are 'undetected'.
"""
from collections import Counter, defaultdict
from copy import deepcopy
from pathlib import Path
import math
import time

import cv2
import numpy as np

from cell_consensus import cell_consensus
from virtual_map_manual import _clean_segments, _merge_params, _segment_positions, _quad_at, _box_iou

DIRTY_ORDER=('bird','dust','leaf')
RANK={'crack':3,'dirty':2,'clean':1,'insufficient':0}


def validate_specs(specs):
    if not isinstance(specs,list) or not specs:raise ValueError('열별 실제 줄 수와 칸 수를 지정하세요.')
    clean={}
    for s in specs:
        if not isinstance(s,dict):raise ValueError('단지 규격을 확인하세요.')
        row,lanes,cols=int(s['row']),int(s['lanes']),int(s['cols'])
        if row in clean or not 1<=row<=100 or not 1<=lanes<=50 or not 1<=cols<=300:
            raise ValueError('열 번호는 중복 없이 1~100, 줄은 1~50, 칸은 1~300이어야 합니다.')
        clean[row]={'row':row,'lanes':lanes,'cols':cols}
    if sum(s['lanes']*s['cols'] for s in clean.values())>10000:raise ValueError('전체 지도는 최대 10,000칸입니다.')
    return clean


def axes(quad,W,H):
    q=np.asarray(quad,np.float64).reshape(4,2)*[W,H]
    edges=np.roll(q,-1,axis=0)-q
    dx=[(abs(edges[0,0])+abs(edges[2,0]))/2,(abs(edges[1,0])+abs(edges[3,0]))/2]
    i=int(np.argmax(dx));e=edges[i];angle=(math.degrees(math.atan2(e[1],e[0]))+90)%180-90
    return dx[i],(abs(edges[1-i,1])+abs(edges[3-i,1]))/2,angle


def _quality(rec,folder,cache):
    """Reference-code grid/colour checks, on several saved crops rather than one shot."""
    if folder is None:return True,None
    uid=rec['uid']
    if uid in cache:return cache[uid]
    refs=rec.get('references',[])
    paths=[rec.get('thumbs',{}).get('rep')]
    if refs:
        for i in np.linspace(0,len(refs)-1,min(5,len(refs)),dtype=int):paths.append(refs[i].get('crop'))
    valid=[]
    for name in dict.fromkeys(p for p in paths if p):
        image=cv2.imread(str(Path(folder)/name))
        if image is None:continue
        gray=cv2.cvtColor(cv2.resize(image,(128,128),interpolation=cv2.INTER_AREA),cv2.COLOR_BGR2GRAY)
        line=float((cv2.morphologyEx(gray,cv2.MORPH_TOPHAT,np.ones((7,7),np.uint8))>25).mean())
        hsv=cv2.cvtColor(cv2.resize(image,(64,64),interpolation=cv2.INTER_AREA),cv2.COLOR_BGR2HSV)
        yg=float(((hsv[:,:,0]>20)&(hsv[:,:,0]<45)&(hsv[:,:,1]>60)).mean())
        valid.append((line,yg))
    # Missing old artifacts do not prove that a track is non-panel.
    if not valid:answer=(True,None)
    elif max(v[0] for v in valid)<.14:answer=(False,'panel_grid_not_confirmed')
    elif all(line<.16 and yg>.05 for line,yg in valid):answer=(False,'panel_colour_rejected')
    else:answer=(True,None)
    cache[uid]=answer
    return answer


def _dominant_angle(angles,weights):
    if not len(angles):return 0.
    candidates=np.arange(-70,71,2.)
    diff=np.abs((np.asarray(angles)[None,:]-candidates[:,None]+90)%180-90)
    score=((diff<14)*np.asarray(weights)[None,:]).sum(1)
    center=float(candidates[int(np.argmax(score))]);good=np.abs((np.asarray(angles)-center+90)%180-90)<14
    return float(np.median(np.asarray(angles)[good]))


def _fit_axis(values,weights,count,basis,prior=None,tolerance=.34):
    """Fit pitch + phase within a physical size range, with a fixed number of slots.

    No min/max resizing, modulo wrapping, or clipping an outside index to an edge.
    A missing internal detection therefore stays an unoccupied physical slot.
    """
    values=np.asarray(values,np.float64);weights=np.asarray(weights,np.float64)
    basis=max(8.,float(basis));best=None
    for pitch in np.linspace(.85*basis,1.2*basis,15):
        step=pitch/24
        # Restrict start candidates to observed phases, not to detected item counts.
        starts=np.unique(np.round(np.concatenate([values-k*pitch for k in range(count)])/step)*step)
        for start in starts:
            z=(values-start)/pitch;index=np.rint(z).astype(int);res=np.abs(z-index)
            ok=(index>=0)&(index<count)&(res<=tolerance)
            support=float(np.sum(weights[ok]*(1-.45*res[ok]/tolerance)))
            occupied=len(set(index[ok]))
            score=support+occupied*.8-.12*abs(pitch/basis-1)
            if prior is not None:score-=.10*abs(start+(count-1)*pitch/2-prior)/pitch
            else:
                # Prefer a first occupied physical position near the first observation,
                # retaining holes instead of stretching detected slots to fill a row.
                score-=.015*abs(start-np.quantile(values,.03))/pitch
            key=(score,-abs(pitch-basis),-abs(start-float(np.median(values))+(count-1)*pitch/2))
            if best is None or key>best[0]:best=(key,start,pitch,index,res,ok)
    return {'start':float(best[1]),'pitch':float(best[2]),'index':best[3],'residual':best[4],'ok':best[5]}


def _fit_lanes(us,vs,weights,count,basis,prior,tolerance):
    # A shallow residual drift is permitted, but cannot create an extra lane.
    center=float(np.median(us));best=None
    for slope in np.linspace(-.12,.12,9):
        values=np.asarray(vs)-slope*(np.asarray(us)-center)
        fit=_fit_axis(values,weights,count,basis,prior,tolerance)
        score=float(np.sum(np.asarray(weights)[fit['ok']]*(1-.45*fit['residual'][fit['ok']]/tolerance)))
        score+=.8*len(set(fit['index'][fit['ok']]))
        score-=.4*abs(slope)/.12
        if best is None or score>best[0]:best=(score,slope,fit)
    result=best[2];result.update(slope=float(best[1]),u_center=center)
    return result


def _pitch_from_observations(records,ids,seg,W,H,fallback):
    """Use real simultaneous panel-center distances; avoid half-panel jitter peaks."""
    frames=defaultdict(list)
    for i in ids:
        for t in records[i]['traj']:
            if seg['start']<=t[0]<=seg['end'] and .6<=t[2]<=.98:
                frames[t[0]].append((t[1]*W,t[2]*H,t[3]*W,t[4]*H))
    deltas=[]
    for points in frames.values():
        for i,a in enumerate(points):
            for b in points[i+1:]:
                dy=abs(a[1]-b[1]);height=(a[3]+b[3])/2
                if abs(a[0]-b[0])<.3*(a[2]+b[2])/2 and .80*height<dy<1.5*height:
                    deltas.append(dy)
    if len(deltas)>=4:
        value=float(np.median(deltas))
        if .8*fallback<value<1.5*fallback:return value
    return fallback


def build_bounded_layout(doc,segments,params,folder=None):
    specs=validate_specs(params.get('row_specs'))
    segs=_clean_segments(segments);p=_merge_params(params);W,H=doc['meta']['frame_size'];records=doc['panels']
    tolerance=float(params.get('grid_tolerance',.34))
    if not .15<=tolerance<=.45:raise ValueError('격자 허용 오차는 0.15~0.45칸이어야 합니다.')
    all_candidates=[];segment_info=[];excluded=[];quality_cache={}
    for sn,seg in enumerate(segs):
        if seg['row'] not in specs:raise ValueError(f"{seg['row']}열의 실제 단지 규격을 먼저 등록하세요.")
        spec=specs[seg['row']]
        if abs(seg['lane_offset'])>=spec['lanes'] or abs(seg['col_offset'])>=spec['cols']:
            raise ValueError('보정값은 격자 크기가 아닙니다. 줄/칸 보정값을 0부터 설정해 주세요.')
        idx=[i for i,r in enumerate(records) if r['status']!='rejected' and
             (p['include_insufficient'] or r['status']!='insufficient') and
             r['first_frame']<=seg['end'] and r['last_frame']>=seg['start']]
        # Exclude obvious non-panels before estimating camera motion.
        eligible=[]
        for i in idx:
            good,reason=_quality(records[i],folder,quality_cache)
            if good:eligible.append(i)
            else:excluded.append({'uid':records[i]['uid'],'segment':sn+1,'reason':reason})
        pos,size,diag=_segment_positions(records,eligible,seg,W,H,p)
        if not pos or size is None:
            segment_info.append({**seg,'panels':0,'tracks':0,'lanes':spec['lanes'],'cols':spec['cols'],'diag':diag,
                                 'warning':'관측 근거가 부족하여 해당 구간은 미탐지로 남깁니다.'});continue
        ids=list(pos);ax={}
        for i in ids:
            t=next(t for t in records[i]['traj'] if int(t[0])==pos[i][3]);ax[i]=axes(t[5:13],W,H)
        med_width=float(np.median([ax[i][0] for i in ids]));med_height=float(np.median([next(t[4]*H for t in records[i]['traj'] if int(t[0])==pos[i][3]) for i in ids]))
        angle=_dominant_angle([ax[i][2] for i in ids],[min(pos[i][2],8) for i in ids])
        filtered=[]
        for i in ids:
            width,vertical,theta=ax[i];delta=abs((theta-angle+90)%180-90)
            reason='off_row_orientation' if delta>22 else 'panel_size_outlier' if not .45*med_width<=width<=1.75*med_width or vertical<.35*med_height else None
            if reason:excluded.append({'uid':records[i]['uid'],'segment':sn+1,'reason':reason})
            else:filtered.append(i)
        ids=filtered
        if not ids:
            segment_info.append({**seg,'panels':0,'tracks':0,'lanes':spec['lanes'],'cols':spec['cols'],'diag':diag,'warning':'같은 열에 맞는 관측이 없습니다.'});continue
        # Re-estimate motion after rejecting differently oriented neighboring arrays.
        pos,size,diag=_segment_positions(records,ids,seg,W,H,p)
        ids=list(pos)
        if not ids:
            segment_info.append({**seg,'panels':0,'tracks':0,'lanes':spec['lanes'],'cols':spec['cols'],'diag':diag,'warning':'열 내부의 유효 궤적이 없습니다.'});continue
        us=np.array([pos[i][0] for i in ids]);vs=np.array([pos[i][1] for i in ids]);weights=np.array([min(pos[i][2],8) for i in ids],float)
        x_basis=float(np.median([ax[i][0] for i in ids]));x_motion=float(np.median([pos[i][4][0]*W-pos[i][1] for i in ids]))
        lane_fit=_fit_lanes(us,vs,weights,spec['lanes'],x_basis,W*.5-x_motion,tolerance)
        inside=[j for j in range(len(ids)) if lane_fit['ok'][j]]
        if not inside:
            segment_info.append({**seg,'panels':0,'tracks':0,'lanes':spec['lanes'],'cols':spec['cols'],'diag':diag,'warning':'지정한 다섯 줄의 열 내부에 맞는 관측이 없습니다.'});continue
        good_ids=[ids[j] for j in inside]
        y_basis=_pitch_from_observations(records,good_ids,seg,W,H,size[1])
        col_fit=_fit_axis(us[inside],weights[inside],spec['cols'],y_basis,None,tolerance)
        cols_by_j={j:k for k,j in enumerate(inside)}
        placed=[]
        for j,i in enumerate(ids):
            reason=None
            if not lane_fit['ok'][j]:reason='outside_five_lane_corridor'
            else:
                k=cols_by_j[j]
                if not col_fit['ok'][k]:reason='outside_column_lattice'
            if reason:
                excluded.append({'uid':records[i]['uid'],'segment':sn+1,'reason':reason});continue
            lane=int(lane_fit['index'][j]);col=int(col_fit['index'][cols_by_j[j]])
            if seg['mirror']:lane=spec['lanes']-1-lane
            if seg['direction']=='back':col=spec['cols']-1-col
            lane+=seg['lane_offset'];col+=seg['col_offset']
            if not 0<=lane<spec['lanes'] or not 0<=col<spec['cols']:
                excluded.append({'uid':records[i]['uid'],'segment':sn+1,'reason':'offset_outside_shape'});continue
            residual=float(lane_fit['residual'][j]+col_fit['residual'][cols_by_j[j]])
            placed.append({'i':i,'segment':sn,'row':seg['row'],'lane':lane+1,'col':col+1,
                           'ref_frame':pos[i][3],'ref_box':pos[i][4],
                           'support':pos[i][2],'residual':residual})
        # If simultaneously distinct panels collide, discard the weaker association.
        cells=defaultdict(list)
        for a in sorted(placed,key=lambda a:(a['residual'],-a['support'],records[a['i']]['uid'])):
            key=(a['lane'],a['col']);reject=False
            aa={int(t[0]):t[1:5] for t in records[a['i']]['traj'] if seg['start']<=t[0]<=seg['end']}
            for b in cells[key]:
                bb={int(t[0]):t[1:5] for t in records[b['i']]['traj'] if seg['start']<=t[0]<=seg['end']}
                common=sorted(aa.keys()&bb.keys())
                minimum=max(1,math.ceil(5/doc['meta'].get('frame_stride',1)))
                if len(common)>minimum and float(np.median([_box_iou(aa[f],bb[f]) for f in common]))<.3:
                    reject=True;break
            if reject:excluded.append({'uid':records[a['i']]['uid'],'segment':sn+1,'reason':'simultaneous_distinct_panel_collision'})
            else:cells[key].append(a);all_candidates.append(a)
        diag.update(lane_pitch_px=round(lane_fit['pitch'],2),column_pitch_px=round(col_fit['pitch'],2),
                    lane_drift=round(lane_fit['slope'],4),dominant_angle=round(angle,2),
                    bounded_lanes=spec['lanes'],bounded_cols=spec['cols'])
        segment_info.append({**seg,'tracks':sum(map(len,cells.values())),'panels':len(cells),'lanes':spec['lanes'],
                             'cols':spec['cols'],'mirrored':seg['mirror'],'diag':diag})
    # One tracked object cannot populate several positions in the same physical row.
    by_identity=defaultdict(list)
    for a in all_candidates:by_identity[(a['row'],a['i'])].append(a)
    cells=defaultdict(list)
    for group in by_identity.values():
        best=min(group,key=lambda a:(a['residual'],-a['support'],a['segment']))
        for a in group:
            if (a['lane'],a['col'])==(best['lane'],best['col']):cells[(a['row'],a['lane'],a['col'])].append(a)
            else:excluded.append({'uid':records[a['i']]['uid'],'segment':a['segment']+1,'reason':'track_position_disagreement'})
    panels=[];rows=[];base=0.;used=set()
    for row,spec in sorted(specs.items()):
        row_panels=[]
        for lane in range(1,spec['lanes']+1):
            for col in range(1,spec['cols']+1):
                entries=cells.get((row,lane,col),[]);members=[];identities={}
                for a in sorted(entries,key=lambda a:(a['residual'],-a['support'])):
                    rec=records[a['i']]
                    if rec['uid'] in identities:continue
                    identities[rec['uid']]=a;used.add(a['i'])
                    members.append({'uid':rec['uid'],'track_id':rec['track_id'],'status':rec['status'],
                                    'first_frame':rec['first_frame'],'last_frame':rec['last_frame'],'observations':rec['observations'],
                                    'segment':a['segment']+1,'ref_frame':a['ref_frame'],'ref_box':a['ref_box'],
                                    'ref_quad':_quad_at(rec,a['ref_frame']),'thumbs':rec.get('thumbs',{}),
                                    'geometry_residual':round(a['residual'],4)})
                recs=[records[a['i']] for a in identities.values()]
                status=max((r['status'] for r in recs),key=lambda s:RANK.get(s,0),default='undetected')
                classes={c for r in recs if r['status']=='dirty' or r.get('with_dirty') for c in r.get('dirty_classes',[]) if c in DIRTY_ORDER}
                classes=[c for c in DIRTY_ORDER if c in classes]
                best=max(recs,key=lambda r:(RANK.get(r['status'],0),r['observations']),default={})
                directions=sorted({segs[a['segment']]['direction'] for a in entries})
                pcell={'pid':f'R{row}-L{lane}-C{col:02d}','row':row,'lane':lane,'col':col,'grid':[(col-1)*1.08,base+lane-1],
                       'est':[(col-1)*1.08,base+lane-1],'status':status,'synthetic':not bool(members),
                       'detection_state':'not_observed' if not members else 'observed','members':members,
                       'with_dirty':status=='crack' and bool(classes),'dirty_classes':classes,
                       'dirty_label':('dirty_'+classes[0] if len(classes)==1 else 'dirty_'+str(len(classes))) if classes else None,
                       'inconsistent':len({r['status'] for r in recs if r['status']!='insufficient'})>1,
                       'seen_in_segments':directions,'thumbs':best.get('thumbs',{}),
                       'votes':{c:sum(r.get('votes',{}).get(c,0) for r in recs) for c in ['clean','dirty','crack']}}
                pcell.update(cell_consensus(recs))
                row_panels.append(pcell);panels.append(pcell)
        counts=Counter(p['status'] for p in row_panels)
        rows.append({**spec,'panels':len(row_panels),'grid_y':base,'crack':counts['crack'],'dirty':counts['dirty'],
                     'undetected':counts['undetected'],'detected':len(row_panels)-counts['undetected'],
                     'both_ways':sum(len(p['seen_in_segments'])>1 for p in row_panels)})
        base+=spec['lanes']+1.6
    counts=Counter(p['status'] for p in panels);reasons=Counter(e['reason'] for e in excluded)
    return {'session_id':doc['session_id'],'schema':2,'mode':'bounded_manual','created_at':time.time(),
            'params':{**p,'row_specs':list(specs.values()),'grid_tolerance':tolerance},'segments':segment_info,
            'units':'알려진 열/줄/칸 순번 (실측 좌표 아님)','scale':{'pitch':1.08,'lane_h':1.,'aisle':1.6},
            'panels':panels,'rows':rows,'path':[],
            'summary':{'panels':len(panels),**{s:counts[s] for s in ['crack','dirty','clean','insufficient','undetected']},
                       'detected':len(panels)-counts['undetected'],'inconsistent':sum(p['inconsistent'] for p in panels),
                       'rows':len(rows),'tracks_used':len(used),'tracks_merged':sum(max(0,len(p['members'])-1) for p in panels),
                       'tracks_excluded':len(records)-len(used),'both_ways':sum(r['both_ways'] for r in rows)},
            'diagnostics':{'mode':'bounded_manual','excluded_reasons':dict(reasons),'excluded_tracks':excluded,
                           'placeholder_policy':'undetected_without_status_or_images','assignment':'bounded_lattice_no_edge_clamping'}}
