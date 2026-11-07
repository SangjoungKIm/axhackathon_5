from io import BytesIO
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

import app as backend
from fixed_inspection import fixed_map
from row_route import build_row_route


class InspectionApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(backend.app)

    def test_row_api_uses_decoded_image_and_passes_confidence(self):
        data = BytesIO()
        Image.new('RGB', (240, 160)).save(data, format='JPEG')
        route = build_row_route([[[20, 20], [200, 20], [200, 40], [20, 40]]])
        with patch.object(backend.row_inspector, 'detect', return_value=route) as detect:
            response = self.client.post('/api/rows/detect', files={'file': ('site.jpg', data.getvalue(), 'image/jpeg')}, data={'confidence': '.4'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(detect.call_args.args[0].shape, (160, 240, 3))
        self.assertEqual(detect.call_args.args[1], .4)
        self.assertEqual(len(response.json()['waypoints']), 2)

    def test_invalid_uploads_never_reach_model(self):
        with patch.object(backend.row_inspector, 'detect') as detect:
            for data, confidence, code in [(b'', '.25', 413), (b'bad', '.25', 422),
                                            (b'bad', '0', 422), (b'x'*(8*1024*1024+1), '.25', 413)]:
                response = self.client.post('/api/rows/detect', files={'file': ('image.png', data)}, data={'confidence': confidence})
                self.assertEqual(response.status_code, code)
            detect.assert_not_called()

    def test_fixed_map_survives_a_new_analysis_with_same_filename(self):
        before = self.client.get('/api/inspections/INS-2026-031/fixed-map').json()
        self.assertEqual(before['layout']['summary']['panels'], 155)
        self.assertEqual(before['layout']['summary']['dirty'], 99)
        self.assertEqual(before['layout']['summary']['clean'], 45)

        def simulate_new_analysis(folder, meta, report):
            (folder/'result.json').write_text(json.dumps({'panels': [], 'different_result': True}))
            report(status='done', stage='완료', progress=100)

        with tempfile.TemporaryDirectory() as folder, patch.object(backend, 'JOBS', Path(folder)), patch.object(backend.inspector, 'run_video', side_effect=simulate_new_analysis):
            response = self.client.post('/api/analyze', files={'file': ('testload_1.mp4', b'video')},
                                        data={'site_id': 'S1', 'inspection_id': 'INS-2026-031'})
            self.assertEqual(response.status_code, 202)
            for _ in range(100):
                if backend.active_job is None:
                    break
                time.sleep(.01)
            self.assertIsNone(backend.active_job)
            new_id = response.json()['id']
            self.assertTrue((Path(folder)/new_id/'result.json').is_file())
            after = self.client.get('/api/inspections/INS-2026-031/fixed-map').json()
            self.assertEqual(after, before)
            self.assertNotEqual(after['source_job_id'], new_id)

    def test_fixed_manifest_and_layout_are_independent_of_job_status(self):
        doc = fixed_map()
        self.assertEqual(doc['display_policy'], 'fixed_snapshot')
        self.assertEqual(len(doc['layout']['panels']), 155)
        self.assertEqual(sum(row['panels'] for row in doc['layout']['rows']), 155)
