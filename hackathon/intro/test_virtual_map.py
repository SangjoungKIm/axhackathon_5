import json
from pathlib import Path
import tempfile
import unittest

from layout_review import apply_reviews,cell_key
from map_service import session_from_result,generate_layout,save_review,reference_image
from virtual_map_manual import build_manual_layout


def fixture():
    panels=[]
    for row in [1,2]:
        for lane in range(5):
            for col in range(15):
                traj=[]
                for frame in range(0,301,5):
                    x=.12+lane*.18;y=.72+.005*frame-col*.08
                    if .04<y<.98:
                        w,h=.12,.065
                        quad=[x-w/2,y-h/2,x+w/2,y-h/2,x+w/2,y+h/2,x-w/2,y+h/2]
                        traj.append([frame+(row-1)*400,x,y,w,h,*quad])
                uid=f'T{len(panels)+1:06d}'
                status='dirty' if (col+lane)%3==0 else 'clean'
                if row==1 and lane==0 and col==5:status='crack'
                panels.append({'uid':uid,'track_id':uid,'status':status,'with_dirty':False,
                    'dirty_classes':['dust'] if status=='dirty' else [],'votes':{'clean':5 if status=='clean' else 0,'dirty':4 if status=='dirty' else 0,'crack':3 if status=='crack' else 0},
                    'observations':len(traj),'first_frame':traj[0][0],'last_frame':traj[-1][0],
                    'thumbs':{},'traj':traj,'references':[]})
    return {'session_id':'fixture','meta':{'frame_size':[1000,1000],'frames_processed':701,'frame_stride':5,'aggregation':'track_majority_v1'},'panels':panels}

SEGS=[{'start':0,'end':300,'row':1,'direction':'out'}, {'start':400,'end':700,'row':2,'direction':'out'}]

class LayoutContracts(unittest.TestCase):
    def test_reference_layout_two_rows_five_lanes(self):
        doc=fixture();layout=build_manual_layout(doc,SEGS)
        self.assertEqual(layout['summary']['rows'],2)
        self.assertEqual([r['lanes'] for r in layout['rows']],[5,5])
        self.assertEqual([r['cols'] for r in layout['rows']],[15,15])
        self.assertEqual(layout['summary']['panels'],150)
        self.assertIn('R1-L1-C13',{p['pid'] for p in layout['panels']})

    def test_layout_is_deterministic_except_creation_time(self):
        a=build_manual_layout(fixture(),SEGS);b=build_manual_layout(fixture(),SEGS)
        a.pop('created_at');b.pop('created_at');self.assertEqual(a,b)

    def test_no_automatic_direction_flip(self):
        doc=fixture();doc['panels']=[p for p in doc['panels'] if p['first_frame']<400]
        forward=build_manual_layout(doc,[SEGS[0]])
        backward=build_manual_layout(doc,[{**SEGS[0],'direction':'back','mirror':True}])
        def find(layout,uid):return next(p for p in layout['panels'] if any(m['uid']==uid for m in p['members']))
        a=find(forward,'T000001');b=find(backward,'T000001')
        self.assertEqual(a['lane']+b['lane'],6);self.assertEqual(a['col']+b['col'],16)

    def test_review_save_reset_and_automatic_preservation(self):
        with tempfile.TemporaryDirectory() as t:
            folder=Path(t);(folder/'session.json').write_text(json.dumps(fixture()))
            layout=generate_layout(folder,SEGS,{})
            target=next(p for p in layout['panels'] if p['status']=='clean')
            original=json.loads((folder/'layout.json').read_text())
            body={'pid':target['pid'],'key':cell_key(target),'major':['dirty'],'dirty_classes':['bird']}
            changed=save_review(folder,body);p=next(p for p in changed['panels'] if p['pid']==target['pid'])
            self.assertEqual(p['status'],'dirty');self.assertEqual(p['dirty_classes'],['bird'])
            self.assertEqual(p['auto']['status'],'clean');self.assertTrue(p['review'])
            self.assertEqual(json.loads((folder/'layout.json').read_text()),original)
            restored=save_review(folder,{**body,'reset':True});p=next(p for p in restored['panels'] if p['pid']==target['pid'])
            self.assertEqual(p['status'],'clean');self.assertFalse(p['review'])

    def test_reference_both_ways_merges_same_locations(self):
        doc=fixture();segments=[SEGS[0],{**SEGS[0],'start':400,'end':700,'direction':'back','mirror':True}]
        # A second pass with reversed panel order/lanes describes the same array.
        for i,p in enumerate(doc['panels'][75:]):
            lane=i//15;col=i%15
            partner=doc['panels'][(4-lane)*15+(14-col)]
            p['status']=partner['status'];p['dirty_classes']=partner['dirty_classes']
        layout=build_manual_layout(doc,segments)
        self.assertEqual(layout['summary']['panels'],75)
        self.assertEqual(layout['summary']['both_ways'],75)
        self.assertEqual(layout['summary']['tracks_merged'],75)

    def test_adapter_uses_source_frames_and_real_vote_state(self):
        result={'job_id':'test','filename':'test.mp4','width':100,'height':100,'duration':1,'source_fps':30,
                'frame_stride':5,'aggregation':'track_majority_v1',
                'tracks':[{'id':'T000001','state':'clean','votes':{'clean':5,'dirty':2,'crack':0},'subtype_votes':{},'evidence':{}}],
                'frames':[{'source_frame':f,'detections':[{'id':f'F{i:05d}-P001','track_id':'T000001','polygon':[[10,70],[30,70],[30,90],[10,90]],'crop':f'crops/F{i:05d}-P001.jpg'}]} for i,f in enumerate([0,5,10])]}
        doc=session_from_result(result);p=doc['panels'][0]
        self.assertEqual([t[0] for t in p['traj']],[0,5,10]);self.assertEqual(p['last_frame'],10)
        self.assertEqual(p['status'],'clean');self.assertEqual(p['votes']['clean'],5)
        self.assertEqual(p['traj'][0][1:5],[.2,.8,.2,.2])
        self.assertEqual(doc['meta']['frame_stride'],5)

    def test_empty_band_returns_error_instead_of_fake_grid(self):
        with self.assertRaises(ValueError):build_manual_layout(fixture(),SEGS,{'band_top':0,'band_bottom':.01})

    def test_out_of_video_segment_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t);(f/'session.json').write_text(json.dumps(fixture()))
            with self.assertRaises(ValueError):generate_layout(f,[{**SEGS[0],'end':900}],{})

    def test_dirty_cannot_be_manually_saved_without_subtype(self):
        with tempfile.TemporaryDirectory() as t:
            folder=Path(t);(folder/'session.json').write_text(json.dumps(fixture()))
            l=generate_layout(folder,SEGS,{})
            p=l['panels'][0]
            with self.assertRaises(ValueError):save_review(folder,{'pid':p['pid'],'key':cell_key(p),'major':['dirty'],'dirty_classes':[]})

if __name__=='__main__':unittest.main()
