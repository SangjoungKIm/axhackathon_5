import json
from pathlib import Path
import tempfile
import unittest
from map_service import session_from_result,ensure_portal_layout


class PortalContracts(unittest.TestCase):
    def empty_result(self):
        return {'job_id':'portal-test','filename':'empty.mp4','width':320,'height':240,'duration':1,
                'source_fps':30,'frame_stride':5,'aggregation':'track_majority_v1','tracks':[],
                'frames':[{'source_frame':0,'detections':[]}],'site_id':'S1','inspection_id':'INS-2026-031'}

    def test_valid_zero_detection_analysis_has_empty_session(self):
        doc=session_from_result(self.empty_result())
        self.assertEqual(doc['panels'],[]);self.assertEqual(doc['meta']['frame_stride'],5)
        self.assertEqual(doc['summary']['total_tracks'],0)

    def test_old_untracked_results_are_not_given_fake_track_ids(self):
        result=self.empty_result();result.pop('aggregation')
        with self.assertRaises(ValueError):session_from_result(result)

    def test_initial_layout_is_all_unknown_when_no_panels_were_seen(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t);(f/'result.json').write_text(json.dumps(self.empty_result()))
            (f/'status.json').write_text(json.dumps({'site_id':'S1'}))
            layout=ensure_portal_layout(f)
            self.assertEqual(layout['summary']['panels'],155)
            self.assertEqual(layout['summary']['undetected'],155)
            self.assertEqual(layout['summary']['clean'],0)
            self.assertTrue(all(not p['members'] and not p['thumbs'] for p in layout['panels']))

    def test_opening_existing_layout_never_overwrites_segments(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t);layout={'session_id':'test','panels':[],'rows':[],
                             'segments':[{'start':425,'end':785,'direction':'out'}],
                             'summary':{'panels':0},'mode':'bounded_manual'}
            original=json.dumps(layout);(f/'layout.json').write_text(original)
            loaded=ensure_portal_layout(f)
            self.assertEqual(loaded['segments'],layout['segments'])
            self.assertEqual((f/'layout.json').read_text(),original)

if __name__=='__main__':unittest.main()
