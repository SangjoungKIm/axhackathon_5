import json
from pathlib import Path
import tempfile
import unittest
from result_view import compact_result,result_view_file


class ResultViewContracts(unittest.TestCase):
    def fixture(self):
        return {'job_id':'test','counts':{'clean':1,'dirty':0},'source_fps':24,'frame_stride':5,
                'tracks':[{'id':'T000001','state':'clean','votes':{'clean':5,'dirty':2,'crack':0},'subtype_votes':{},'observations':7,'labels':[],'tie':False,'evidence':{'unused':[0]*500}}],
                'frames':[{'index':0,'source_frame':0,'time':0,'preview':'frames/00000.jpg','detections':[
                    {'id':'F00000-P001','track_id':'T000001','state':'clean','labels':[],'class':'clean','confidence':.9,
                     'polygon':[[0,0],[10,0],[10,10],[0,10]],'votes':{'clean':5,'dirty':2,'crack':0},
                     'panel_mask':[[0,0]]*1000,'raw_details':[{'polygon':[[0,0]]*1000}],
                     'details':[{'class':'dust','confidence':.8,'polygon':[[0,0]]*1000}]}]}]}

    def test_preserves_ui_states_votes_and_frame_identity_without_mutating_full_data(self):
        doc=self.fixture();before=json.dumps(doc);view=compact_result(doc)
        self.assertEqual(view['counts'],doc['counts']);self.assertEqual(view['frames'][0]['source_frame'],0)
        a=view['frames'][0]['detections'][0]
        self.assertEqual(a['track_id'],'T000001');self.assertEqual(a['votes']['clean'],5)
        self.assertNotIn('panel_mask',a);self.assertNotIn('raw_details',a)
        self.assertEqual(a['details'],[{'class':'dust','confidence':.8}])
        self.assertEqual(before,json.dumps(doc))

    def test_full_saved_json_is_unchanged_and_compact_file_is_cached(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t);source=f/'result.json';text=json.dumps(self.fixture());source.write_text(text)
            view=result_view_file(f);mtime=view.stat().st_mtime_ns
            self.assertLess(view.stat().st_size,len(text)//3)
            self.assertEqual(source.read_text(),text)
            self.assertEqual(result_view_file(f).stat().st_mtime_ns,mtime)

if __name__=='__main__':unittest.main()
