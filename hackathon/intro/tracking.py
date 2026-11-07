"""Camera-motion compensated panel association and per-track majority voting.

Track IDs are local to one continuous shot. Re-identification after a cut or a
long absence is intentionally not treated as a guaranteed physical identity.
"""
from collections import Counter
from copy import deepcopy

import cv2
import numpy as np
from scipy.optimize import linear_sum_assignment


class PanelTracker:
    def __init__(self, max_gap=5):
        self.max_gap = max_gap  # sampled frames: 5 gaps = 25 source frames
        self.tracks = {}
        self.active = {}
        self.previous = None
        self.frame_number = -1
        self.scene_resets = 0

    @staticmethod
    def _motion(previous, current):
        """Return previous→current homography in working-image pixels, or None."""
        if previous is None:
            return np.eye(3, dtype=np.float64), 'first_frame'
        if previous.shape != current.shape:
            return None, 'frame_size_changed'
        if cv2.absdiff(previous, current).mean() < 2.:
            return np.eye(3, dtype=np.float64), 'static'
        points = cv2.goodFeaturesToTrack(previous, 1600, .01, 8)
        if points is not None and len(points) >= 16:
            moved, ok, err = cv2.calcOpticalFlowPyrLK(previous, current, points, None,
                winSize=(25,25), maxLevel=4)
            if moved is not None:
                back, back_ok, _ = cv2.calcOpticalFlowPyrLK(current, previous, moved, None,
                    winSize=(25,25), maxLevel=4)
                if back is not None:
                    valid = ((ok.ravel() == 1) & (back_ok.ravel() == 1) &
                             (np.linalg.norm(points-back, axis=2).ravel() < 1.8) &
                             (err.ravel() < 25))
                    src, dst = points[valid], moved[valid]
                    h = PanelTracker._fit_motion(src, dst, current.shape)
                    if h is not None:
                        return h, 'optical_flow'
        # Handles motion beyond the LK pyramid without linking by screen position alone.
        orb = cv2.ORB_create(nfeatures=2500)
        k1, d1 = orb.detectAndCompute(previous,None)
        k2, d2 = orb.detectAndCompute(current,None)
        if d1 is not None and d2 is not None and len(d1) >= 16 and len(d2) >= 16:
            pairs = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(d1,d2,k=2)
            matches = [pair[0] for pair in pairs if len(pair)==2 and pair[0].distance < .7*pair[1].distance]
            if len(matches) >= 16:
                src = np.float32([k1[m.queryIdx].pt for m in matches])
                dst = np.float32([k2[m.trainIdx].pt for m in matches])
                h = PanelTracker._fit_motion(src,dst,current.shape)
                if h is not None:
                    return h,'feature_match'
        return None,'motion_unresolved_new_tracks'

    @staticmethod
    def _fit_motion(src, dst, shape):
        if len(src) < 16:
            return None
        h, mask = cv2.findHomography(src,dst,cv2.RANSAC,3.)
        if h is None or mask is None or mask.sum() < 12 or mask.mean() < .4:
            return None
        if not np.isfinite(h).all():
            return None
        height,width = shape
        corners = np.float32([[[0,0],[width,0],[width,height],[0,height]]])
        projected = cv2.perspectiveTransform(corners,h)[0]
        area = abs(cv2.contourArea(projected)) / (width*height)
        if not .35 < area < 2.8 or not cv2.isContourConvex(projected):
            return None
        if np.linalg.norm(projected.mean(axis=0)-[width/2,height/2]) > max(width,height)*.8:
            return None
        return h

    @staticmethod
    def _iou(a,b):
        a,b = np.asarray(a,np.float32),np.asarray(b,np.float32)
        area_a,area_b = abs(cv2.contourArea(a)),abs(cv2.contourArea(b))
        try:
            intersection,_ = cv2.intersectConvexConvex(a,b)
        except cv2.error:
            return 0.
        return max(0.,float(intersection)) / max(1.,area_a+area_b-intersection)

    def associate(self,frame,observations):
        """Assign one track per observation and accumulate independent valid votes."""
        self.frame_number += 1
        height,width = frame.shape[:2]
        scale = min(1.,960/max(height,width))
        gray = cv2.cvtColor(cv2.resize(frame,(round(width*scale),round(height*scale))),cv2.COLOR_BGR2GRAY)
        h,mode = self._motion(self.previous,gray)
        self.previous = gray
        if h is None:
            self.active.clear()
            self.scene_resets += 1
        else:
            s = np.diag([scale,scale,1.])
            full_h = np.linalg.inv(s) @ h @ s
            for track in self.active.values():
                poly = np.array(track['_polygon'],np.float32).reshape(1,-1,2)
                projected = cv2.perspectiveTransform(poly,full_h)[0]
                track['_polygon'] = projected
        self.active = {k:t for k,t in self.active.items() if self.frame_number-t['last_frame'] <= self.max_gap}
        candidates = list(self.active.values())
        matches = {}
        if candidates and observations:
            costs = np.full((len(candidates),len(observations)),1.e6,dtype=np.float64)
            current = [np.array(o['polygon'],np.float32) for o in observations]
            for i,t in enumerate(candidates):
                a = np.array(t['_polygon'],np.float32)
                if not np.isfinite(a).all():
                    continue
                amin,amax,ac = a.min(0),a.max(0),a.mean(0)
                diag=max(1.,np.linalg.norm(amax-amin))
                for j,b in enumerate(current):
                    if np.any(amax < b.min(0)) or np.any(b.max(0) < amin):
                        continue
                    dist=np.linalg.norm(ac-b.mean(0))/diag
                    if dist > .7:
                        continue
                    iou=self._iou(a,b)
                    if iou >= .25:
                        costs[i,j] = 1.-iou+.12*dist+.015*(self.frame_number-t['last_frame']-1)
            rows,cols=linear_sum_assignment(costs)
            for i,j in zip(rows,cols):
                if costs[i,j] < 1.e5:
                    matches[int(j)] = candidates[int(i)]
        for j,obs in enumerate(observations):
            track = matches.get(j)
            if track is None:
                tid=f'T{len(self.tracks)+1:06d}'
                track={'id':tid,'first_frame':self.frame_number,'last_frame':self.frame_number,
                       'observations':0,'votes':{'clean':0,'dirty':0,'crack':0},
                       'subtype_votes':{'bird':0,'dust':0,'leaf':0},'review_observations':0,
                       'snow_observations':0,'decision':'review','evidence':{},'_polygon':obs['polygon']}
                self.tracks[tid]=track
                self.active[tid]=track
            track['last_frame']=self.frame_number
            track['_polygon']=obs['polygon']
            track['observations'] += 1
            obs['track_id']=track['id']
            # Unverified cracks, mask failures, and low-confidence classes never vote.
            vote = None
            if obs['state']=='clean':
                vote='clean'
            elif obs['state']=='crack':
                if any(d['class']=='crack' for d in obs.get('details',[])):
                    vote='crack'
            elif obs['class']=='dirty' and (obs['state']=='dirty' or obs.get('reason')=='dirty_not_verified'):
                vote='dirty'
            if vote:
                track['votes'][vote] += 1
                old = track['evidence'].get(vote)
                if old is None or (obs.get('confidence') or 0) > (old.get('confidence') or 0):
                    track['evidence'][vote] = {'observation_id':obs['id'],'frame':self.frame_number,
                        'crop':obs.get('crop'),'confidence':obs.get('confidence'),'labels':obs['labels'][:]}
                for subtype in {d['class'] for d in obs.get('details',[]) if d['class'] in track['subtype_votes']}:
                    track['subtype_votes'][subtype] += 1
            elif obs['state']=='suppressed':
                track['snow_observations'] += 1
            else:
                track['review_observations'] += 1
            self._decide(track)
        return mode

    @staticmethod
    def _decide(track):
        maximum=max(track['votes'].values())
        leaders=[key for key,n in track['votes'].items() if n==maximum] if maximum else []
        if len(leaders)==1:
            decision=leaders[0]
        elif leaders and track['decision'] in leaders:
            decision=track['decision']
        elif not leaders and track['snow_observations'] and not track['review_observations']:
            decision='suppressed'
        else:
            decision='review'
        track['decision']=decision
        track['tie']=len(leaders)>1
        if decision=='crack':
            track['labels']=['panel_crack']
        elif decision=='dirty':
            submax=max(track['subtype_votes'].values())
            track['labels']=['panel_dirty_'+key for key,n in track['subtype_votes'].items() if n==submax and n>0] or ['panel_dirty']
        else:
            track['labels']=[]
        return decision

    def summary(self):
        tracks=[]
        counts=dict.fromkeys(['clean','crack','dirty','review','suppressed'],0)
        for track in self.tracks.values():
            self._decide(track)
            counts[track['decision']] += 1
            item={k:deepcopy(v) for k,v in track.items() if not k.startswith('_')}
            item['state']=item.pop('decision')
            tracks.append(item)
        return tracks,counts

    def finalize_observation(self,observation):
        """Apply the final video-wide vote to every occurrence, retaining raw evidence."""
        obs=observation
        track=self.tracks[obs['track_id']]
        obs['raw_state']=obs['state']
        obs['raw_labels']=obs['labels'][:]
        obs['raw_reason']=obs['reason']
        obs['raw_details']=deepcopy(obs['details'])
        obs['votes']=dict(track['votes'])
        obs['subtype_votes']=dict(track['subtype_votes'])
        obs['track_observations']=track['observations']
        obs['vote_tie']=track['tie']
        obs['state']=track['decision']
        obs['labels']=track['labels'][:]
        # No stale masks are projected into frames where the defect was not observed.
        obs['details']=[d for d in obs['raw_details'] if
            (obs['state']=='crack' and d['class']=='crack') or
            (obs['state']=='dirty' and 'panel_dirty_'+d['class'] in obs['labels'])]
        obs['reason']='vote_tie' if track['tie'] else ('no_valid_votes' if obs['state']=='review' else None)
        if obs['state']=='suppressed':obs['reason']='snow_only_suppressed'
        obs['decision_evidence']=deepcopy(track['evidence'].get(obs['state']))
        return obs
