from copy import deepcopy
import unittest
from cell_consensus import cell_consensus,update_layout_consensus
from layout_review import apply_reviews,cell_key


def record(uid,clean,dirty,crack=0,status='clean',**extra):
    return {'uid':uid,'status':status,'votes':{'clean':clean,'dirty':dirty,'crack':crack},'dirty_classes':['dust'],**extra}


class CellConsensusContracts(unittest.TestCase):
    def test_user_example_outgoing_and_return_votes_add_to_dirty(self):
        decision=cell_consensus([record('out',5,2),record('back',2,6,status='dirty')])
        self.assertEqual(decision['votes'],{'clean':7,'dirty':8,'crack':0})
        self.assertEqual(decision['status'],'dirty')
        self.assertFalse(decision['inconsistent']);self.assertFalse(decision['needs_review'])

    def test_clean_majority_beats_a_dirty_track_label(self):
        decision=cell_consensus([record('out',20,1),record('back',2,6,status='dirty')])
        self.assertEqual(decision['status'],'clean')
        self.assertEqual(decision['dirty_classes'],[])

    def test_equal_positive_clean_dirty_votes_choose_dirty(self):
        decision=cell_consensus([record('out',5,2),record('back',2,5,status='dirty')])
        self.assertEqual(decision['votes'],{'clean':7,'dirty':7,'crack':0})
        self.assertEqual(decision['status'],'dirty');self.assertTrue(decision['vote_tie'])

    def test_same_track_listed_in_two_segments_is_counted_once(self):
        a=record('same',5,2);decision=cell_consensus([a,deepcopy(a),record('other',1,4,status='dirty')])
        self.assertEqual(decision['votes'],{'clean':6,'dirty':6,'crack':0})
        self.assertEqual(decision['status'],'dirty')

    def test_raw_unverified_crack_classifications_cannot_win(self):
        decision=cell_consensus([record('a',3,1,20,status='crack',seg={'checks':20,'hits':0})])
        self.assertEqual(decision['votes']['crack'],0);self.assertEqual(decision['status'],'clean')

    def test_verified_crack_counts_compete_by_frequency(self):
        decision=cell_consensus([record('a',2,1,9,status='crack',seg={'checks':9,'hits':5}),record('b',1,1)])
        self.assertEqual(decision['votes']['crack'],5);self.assertEqual(decision['status'],'crack')

    def test_no_observations_are_not_mislabeled_dirty_as_zero_tie(self):
        self.assertEqual(cell_consensus([])['status'],'undetected')
        self.assertEqual(cell_consensus([record('x',0,0)])['status'],'insufficient')

    def test_shape_and_member_evidence_stay_unchanged_while_states_recount(self):
        members=[record('out',5,2),record('back',2,6,status='dirty')]
        cell={'pid':'R1-L1-C01','row':1,'lane':1,'col':1,'grid':[0,0],'members':members,'status':'clean','inconsistent':True}
        layout={'panels':[cell],'rows':[{'row':1,'lanes':5,'cols':15}],'summary':{}}
        geometry=deepcopy({k:cell[k] for k in ['pid','row','lane','col','grid','members']})
        update_layout_consensus(layout)
        self.assertEqual({k:cell[k] for k in geometry},geometry)
        self.assertEqual(cell['status'],'dirty');self.assertTrue(cell['track_states_differ'])
        self.assertEqual(layout['summary']['dirty'],1);self.assertEqual(layout['summary']['inconsistent'],0)
        self.assertEqual(layout['rows'][0]['dirty'],1)

    def test_manual_review_still_overrides_automatic_sum_without_erasing_it(self):
        members=[record('a',1,5),record('b',1,5,status='dirty')]
        cell={'pid':'R1-L1-C01','row':1,'members':members,'status':'clean'}
        layout={'panels':[cell],'rows':[{'row':1}],'summary':{}}
        update_layout_consensus(layout);key=cell_key(cell)
        result=apply_reviews(layout,{'reviews':{key:{'major':['clean'],'dirty_classes':[],'key':key}}})
        self.assertEqual(result['panels'][0]['status'],'clean')
        self.assertEqual(result['panels'][0]['auto']['status'],'dirty')
        self.assertFalse(result['panels'][0]['needs_review'])

if __name__=='__main__':unittest.main()
