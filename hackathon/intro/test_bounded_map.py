from copy import deepcopy
from pathlib import Path
import json
import tempfile
import unittest

from bounded_map import build_bounded_layout, _fit_axis
import numpy as np
from layout_review import apply_reviews,cell_key
from map_service import generate_layout,save_review

SPECS=[{'row':1,'lanes':5,'cols':15},{'row':2,'lanes':5,'cols':16}]
SEGS=[{'start':0,'end':300,'row':1,'direction':'out'}, {'start':400,'end':700,'row':2,'direction':'out'}]
PARAMS={'row_specs':SPECS,'grid_tolerance':.34,'include_insufficient':True}


def fixture():
    panels=[]
    for row,count in [(1,15),(2,16)]:
        for lane in range(5):
            for col in range(count):
                traj=[]
                for frame in range(0,301,5):
                    x=.3+.1*lane;y=.72+.005*frame-col*.08;w=.096;h=.075
                    if .04<y<.98:
                        traj.append([frame+(row-1)*400,x,y,w,h,x-w/2,y-h/2,x+w/2,y-h/2,x+w/2,y+h/2,x-w/2,y+h/2])
                uid=f'T{row}{lane:02d}{col:03d}';status='dirty' if col%3==0 else 'clean'
                panels.append({'uid':uid,'track_id':uid,'status':status,'with_dirty':False,'dirty_classes':['dust'] if status=='dirty' else [],
                    'votes':{'clean':5 if status=='clean' else 0,'dirty':4 if status=='dirty' else 0,'crack':0},'observations':len(traj),
                    'first_frame':traj[0][0],'last_frame':traj[-1][0],'thumbs':{},'traj':traj,'references':[]})
    return {'session_id':'fixed-fixture','meta':{'frame_size':[1000,1000],'frames_processed':701,'frame_stride':5,'aggregation':'track_majority_v1'},'panels':panels}


def find_track(layout,uid):
    return next((p for p in layout['panels'] if any(m['uid']==uid for m in p['members'])),None)


class BoundedMapContracts(unittest.TestCase):
    def test_exact_structure_and_no_missing_ground_truth_panels(self):
        layout=build_bounded_layout(fixture(),SEGS,PARAMS)
        self.assertEqual([(r['lanes'],r['cols'],r['panels']) for r in layout['rows']],[(5,15,75),(5,16,80)])
        self.assertEqual(layout['summary']['panels'],155)
        self.assertEqual(layout['summary']['undetected'],0)
        self.assertEqual(len({p['pid'] for p in layout['panels']}),155)

    def test_internal_hole_stays_at_original_position(self):
        doc=fixture();uid='T102007';doc['panels']=[p for p in doc['panels'] if p['uid']!=uid]
        layout=build_bounded_layout(doc,SEGS,PARAMS)
        missing=next(p for p in layout['panels'] if p['pid']=='R1-L3-C08')
        self.assertEqual(missing['status'],'undetected');self.assertTrue(missing['synthetic'])
        self.assertEqual(missing['members'],[]);self.assertEqual(missing['thumbs'],{})
        self.assertEqual(find_track(layout,'T102008')['pid'],'R1-L3-C09')

    def test_far_side_neighbor_is_excluded_not_extra_lane(self):
        doc=fixture();extra=deepcopy(doc['panels'][10]);extra.update(uid='T900001',track_id='T900001')
        for t in extra['traj']:
            shift=-.25;t[1]+=shift
            for i in [5,7,9,11]:t[i]+=shift
        doc['panels'].append(extra)
        layout=build_bounded_layout(doc,SEGS,PARAMS)
        self.assertIsNone(find_track(layout,'T900001'))
        self.assertTrue(all(r['lanes']==5 for r in layout['rows']))

    def test_far_longitudinal_outlier_does_not_rescale_real_cells(self):
        values=np.array([i*100 for i in range(15)]+[9000.])
        fit=_fit_axis(values,np.ones(16)*10,15,100.)
        self.assertTrue(all(fit['ok'][:15]));self.assertFalse(fit['ok'][-1])
        self.assertEqual(list(fit['index'][:15]),list(range(15)))
        self.assertGreater(fit['index'][-1],14)

    def test_differently_oriented_neighbor_is_rejected(self):
        doc=fixture();extra=deepcopy(doc['panels'][10]);extra.update(uid='T900003',track_id='T900003')
        angle=np.deg2rad(35);rot=np.array([[np.cos(angle),-np.sin(angle)],[np.sin(angle),np.cos(angle)]])
        for t in extra['traj']:
            center=np.array(t[1:3]);q=np.array(t[5:13]).reshape(4,2)
            t[5:13]=((q-center)@rot.T+center).reshape(-1).tolist()
        doc['panels'].append(extra)
        layout=build_bounded_layout(doc,SEGS,PARAMS)
        self.assertIsNone(find_track(layout,'T900003'))
        self.assertGreater(layout['diagnostics']['excluded_reasons'].get('off_row_orientation',0),0)

    def test_unseen_entire_row_gets_unknown_placeholders(self):
        doc=fixture();doc['panels']=[p for p in doc['panels'] if p['first_frame']<400]
        layout=build_bounded_layout(doc,[SEGS[0]],PARAMS)
        row2=[p for p in layout['panels'] if p['row']==2]
        self.assertEqual(len(row2),80);self.assertTrue(all(p['synthetic'] and p['status']=='undetected' for p in row2))
        self.assertEqual(len({cell_key(p) for p in row2}),80)

    def test_no_observations_does_not_invent_clean_or_images(self):
        doc=fixture();doc['panels']=[]
        l=build_bounded_layout(doc,SEGS,PARAMS)
        self.assertEqual(l['summary']['undetected'],155)
        self.assertTrue(all(not p['members'] and not p['thumbs'] and not sum(p['votes'].values()) for p in l['panels']))
        reviewed=apply_reviews(l,None);self.assertEqual(reviewed['summary']['undetected'],155)

    def test_bad_old_offsets_are_rejected_as_offsets_not_dimensions(self):
        with self.assertRaisesRegex(ValueError,'보정값'):
            build_bounded_layout(fixture(),[{**SEGS[0],'lane_offset':15,'col_offset':5}],PARAMS)

    def test_manual_review_cannot_turn_missing_observation_into_clean(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t);doc=fixture();doc['panels']=[];(f/'session.json').write_text(json.dumps(doc))
            l=generate_layout(f,SEGS,PARAMS);p=l['panels'][0]
            with self.assertRaisesRegex(ValueError,'관측 근거'):
                save_review(f,{'pid':p['pid'],'key':cell_key(p),'major':['clean']})

if __name__=='__main__':unittest.main()
