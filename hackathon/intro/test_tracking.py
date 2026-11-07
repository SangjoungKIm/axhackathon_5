from copy import deepcopy
import unittest
from unittest.mock import patch

import cv2
import numpy as np
from tracking import PanelTracker


def observation(number,state='clean',subtypes=(),verified=True,x=30):
    detail=[{'class':d,'confidence':.9,'polygon':[[x,20],[x+30,20],[x+30,70],[x,70]]} for d in subtypes]
    if state=='crack' and verified:detail=[{'class':'crack','confidence':.9,'polygon':[[x,20],[x+30,20],[x+30,70],[x,70]]}]
    return {'id':f'F{number:05d}-P001','polygon':[[x,20],[x+30,20],[x+30,70],[x,70]],
            'state':state if state!='crack' or verified else 'review',
            'class':state,'confidence':.9,'obb_confidence':.9,'crop':'crops/example.jpg',
            'labels':['panel_crack'] if state=='crack' and verified else ['panel_dirty_'+d for d in subtypes],
            'details':detail,'reason':'crack_not_verified' if state=='crack' and not verified else None}


class TrackingContracts(unittest.TestCase):
    def setUp(self):
        self.frame=np.zeros((160,320,3),np.uint8)

    def sequence(self,states):
        tracker=PanelTracker();obs=[]
        for i,s in enumerate(states):
            o=observation(i,**s) if isinstance(s,dict) else observation(i,s)
            tracker.associate(self.frame,[o]);obs.append(o)
        tracks,counts=tracker.summary()
        for o in obs:tracker.finalize_observation(o)
        return tracks,counts,obs

    def test_clean_five_dirty_two_retroactively_cleans_all_frames(self):
        tracks,counts,obs=self.sequence(['dirty','dirty']+['clean']*5)
        self.assertEqual(len(tracks),1)
        self.assertEqual(tracks[0]['votes'],{'clean':5,'dirty':2,'crack':0})
        self.assertEqual(counts['clean'],1)
        self.assertTrue(all(o['state']=='clean' and not o['labels'] for o in obs))
        self.assertEqual(obs[0]['raw_state'],'dirty')

    def test_dirty_majority_and_subtype_majority(self):
        tracks,counts,obs=self.sequence(['clean','clean']+
            [{'state':'dirty','subtypes':['dust']}]*4+[{'state':'dirty','subtypes':['leaf']}])
        self.assertEqual(tracks[0]['votes'],{'clean':2,'dirty':5,'crack':0})
        self.assertEqual(tracks[0]['labels'],['panel_dirty_dust'])
        self.assertTrue(all(o['labels']==['panel_dirty_dust'] for o in obs))
        self.assertEqual(obs[-1]['details'],[])  # Leaf evidence must not be drawn as dust.

    def test_unverified_cracks_never_vote(self):
        tracks,counts,obs=self.sequence([{'state':'crack','verified':False}]*5+['clean']*2)
        self.assertEqual(tracks[0]['votes'],{'clean':2,'dirty':0,'crack':0})
        self.assertEqual(tracks[0]['review_observations'],5)
        self.assertTrue(all(o['state']=='clean' for o in obs))

    def test_verified_crack_wins_only_after_majority(self):
        tracks,_,obs=self.sequence(['clean']*2+['crack']*3)
        self.assertEqual(tracks[0]['state'],'crack')
        self.assertEqual(tracks[0]['votes']['crack'],3)
        self.assertTrue(all(o['labels']==['panel_crack'] for o in obs))
        self.assertEqual(obs[0]['details'],[])  # No invented crack mask on a clean observation.
        self.assertTrue(obs[-1]['details'])

    def test_crack_vote_does_not_override_larger_clean_count(self):
        tracks,_,_=self.sequence(['clean']*5+['crack'])
        self.assertEqual(tracks[0]['state'],'clean')

    def test_tie_keeps_previous_winner(self):
        tracks,_,_=self.sequence(['dirty','clean'])
        self.assertEqual(tracks[0]['state'],'dirty');self.assertTrue(tracks[0]['tie'])

    def test_snow_excluded_from_votes_and_display(self):
        o=observation(0,'dirty');o.update(state='suppressed',reason='snow_only_suppressed')
        t=PanelTracker();t.associate(self.frame,[o]);tracks,counts=t.summary();t.finalize_observation(o)
        self.assertEqual(sum(tracks[0]['votes'].values()),0)
        self.assertEqual(counts['suppressed'],1);self.assertFalse(o['labels'])

    def test_all_unverified_remains_review(self):
        tracks,_,_=self.sequence([{'state':'crack','verified':False}]*3)
        self.assertEqual(tracks[0]['state'],'review')

    def test_one_to_one_ids_survive_reordered_detections(self):
        t=PanelTracker();first=[observation(0,x=30),observation(0,x=90)]
        t.associate(self.frame,first)
        second=[observation(1,x=90),observation(1,x=30)]
        t.associate(self.frame,second)
        self.assertEqual(second[0]['track_id'],first[1]['track_id'])
        self.assertEqual(second[1]['track_id'],first[0]['track_id'])
        self.assertEqual(len(t.tracks),2)

    def test_short_miss_recovers_but_long_miss_creates_new_id(self):
        t=PanelTracker();o=observation(0);t.associate(self.frame,[o])
        for _ in range(3):t.associate(self.frame,[])
        back=observation(4);t.associate(self.frame,[back]);self.assertEqual(back['track_id'],o['track_id'])
        for _ in range(6):t.associate(self.frame,[])
        late=observation(11);t.associate(self.frame,[late]);self.assertNotEqual(late['track_id'],o['track_id'])

    def test_unresolved_motion_starts_new_track_instead_of_merging(self):
        t=PanelTracker();first=observation(0);t.associate(self.frame,[first])
        with patch.object(t,'_motion',return_value=(None,'scene_cut')):
            other=observation(1);t.associate(self.frame,[other])
        self.assertNotEqual(first['track_id'],other['track_id']);self.assertEqual(t.scene_resets,1)

    def test_camera_translation_keeps_panel_identity(self):
        rng=np.random.default_rng(23)
        frame=rng.integers(0,256,(240,400,3),dtype=np.uint8)
        shifted=cv2.warpAffine(frame,np.float32([[1,0,35],[0,1,0]]),(400,240))
        t=PanelTracker();a=observation(0,x=90);t.associate(frame,[a])
        b=observation(1,x=125);mode=t.associate(shifted,[b])
        self.assertIn(mode,{'optical_flow','feature_match'})
        self.assertEqual(a['track_id'],b['track_id'])

if __name__=='__main__':unittest.main()
