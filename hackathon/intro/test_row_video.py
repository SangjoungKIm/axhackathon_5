import unittest
from render_row_video import segment_memberships,filter_observations

class RowVideoTests(unittest.TestCase):
    def setUp(self):
        self.layout={'segments':[{'row':1,'start':10,'end':20},{'row':2,'start':30,'end':40}],
                     'panels':[{'pid':'R1','row':1,'status':'dirty','dirty_classes':['dust'],
                                'members':[{'uid':'A','track_id':'A','segment':1}]},
                               {'pid':'R2','row':2,'status':'clean','members':[{'uid':'B','segment':2}]}]}
        self.members=segment_memberships(self.layout)
    def frame(self,n):
        return {'source_frame':n,'detections':[{'track_id':tid,'state':'dirty','details':[],
                                               'raw_details':[{'class':'dust'},{'class':'snow'},{'class':'crack'}]}
                                              for tid in ['A','B','OFF_ROW']]}
    def test_outside_segments_and_other_rows_have_no_boxes(self):
        for n in [0,9,21,29,30,40,41]:
            self.assertEqual(filter_observations(self.frame(n),self.layout,self.members),[])
    def test_segment_boundaries_keep_only_assigned_tracks(self):
        for n in [10,15,20]:
            selected=filter_observations(self.frame(n),self.layout,self.members)
            self.assertEqual([o['track_id'] for o in selected],['A'])
            self.assertEqual(selected[0]['labels'],['panel_dirty_dust'])
            self.assertEqual(selected[0]['details'],[{'class':'dust'}])
    def test_cell_clean_consensus_hides_previously_dirty_track(self):
        self.layout['panels'][0]['status']='clean'
        self.assertEqual(filter_observations(self.frame(15),self.layout,self.members),[])
    def test_off_angle_box_is_rejected_even_when_track_was_mapped(self):
        self.layout['panels'].append({'pid':'R1-C','row':1,'status':'dirty','dirty_classes':['dust'],
                                     'members':[{'uid':'C','segment':1}]})
        self.layout['panels'][1]['row']=1;self.layout['panels'][1]['members'][0]['segment']=1
        members=segment_memberships(self.layout)
        frame=self.frame(15)
        for obs in frame['detections']:obs['polygon']=[[0,0],[10,0],[10,10],[0,10]]
        frame['detections'].append({'track_id':'C','state':'dirty','details':[],
                                    'polygon':[[0,5],[5,0],[10,5],[5,10]]})
        self.assertEqual([o['track_id'] for o in filter_observations(frame,self.layout,members)],['A'])
    def test_detail_boxes_are_clipped_inside_the_parent_panel(self):
        frame=self.frame(15);obs=frame['detections'][0]
        obs['polygon']=[[0,0],[10,0],[10,10],[0,10]]
        obs['raw_details']=[{'class':'dust','polygon':[[-5,1],[5,1],[5,9],[-5,9]]}]
        selected=filter_observations(frame,self.layout,self.members)
        self.assertTrue(all(0<=x<=10 and 0<=y<=10 for x,y in selected[0]['details'][0]['polygon']))
        self.assertEqual(obs['raw_details'][0]['polygon'][0],[-5,1])
    def test_does_not_change_original_observations(self):
        f=self.frame(15);filter_observations(f,self.layout,self.members)
        self.assertEqual(f['detections'][0]['state'],'dirty')
        self.assertNotIn('map_panel_id',f['detections'][0])

if __name__=='__main__':unittest.main()
