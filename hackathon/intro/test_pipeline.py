"""Contracts for visibility rules and nested crop-coordinate transforms."""
import tempfile
from pathlib import Path
from types import SimpleNamespace as NS
import unittest
import cv2
import numpy as np
import torch
from pipeline import Inspector, oriented_crop, transform


class PipelineContracts(unittest.TestCase):
    def run_case(self, classification='clean', details=(), crack=False, seg=True, confidence=.9):
        frame=np.full((180,240,3),120,np.uint8)
        inspector=Inspector()
        def predict(key,image,**kw):
            if key=='obb':
                return NS(obb=NS(xyxyxyxy=torch.tensor([[[30.,30.],[150.,30.],[150.,130.],[30.,130.]]]),conf=torch.tensor([.95])))
            h,w=image.shape[:2]
            poly=np.float32([[2,2],[w-3,2],[w-3,h-3],[2,h-3]])
            if key=='seg':return NS(masks=NS(xy=[poly]) if seg else None)
            if key=='cls':return NS(names={0:classification},probs=NS(top1=0,top1conf=torch.tensor(confidence)))
            if key=='crack':return NS(masks=NS(xy=[poly]) if crack else None,boxes=NS(conf=torch.tensor([.8])))
            if key=='dirty':
                names={i:n for i,n in enumerate(details)}
                return NS(names=names,obb=NS(xyxyxyxy=torch.tensor(np.array([poly for _ in details],dtype=np.float32).reshape(-1,4,2)),cls=torch.tensor(list(names)),conf=torch.tensor([.8]*len(details))))
            raise AssertionError(key)
        inspector.predict=predict
        with tempfile.TemporaryDirectory() as td:
            folder=Path(td);(folder/'crops').mkdir()
            observations,limit=inspector.inspect_frame(frame,0,.3,.55,folder)
            self.assertFalse(limit)
            self.assertEqual(len(observations),1)
            obs=observations[0]
            if obs.get('crop'):self.assertTrue((folder/obs['crop']).exists())
            return obs,inspector.annotate(frame,observations),frame

    def test_clean_is_saved_without_overlay(self):
        obs,annotated,original=self.run_case()
        self.assertEqual(obs['state'],'clean');self.assertTrue(obs['crop'])
        np.testing.assert_array_equal(annotated,original)

    def test_snow_alone_is_saved_without_overlay(self):
        obs,annotated,original=self.run_case('dirty',('snow',))
        self.assertEqual(obs['state'],'suppressed');self.assertEqual(obs['labels'],[])
        self.assertEqual(obs['suppressed_snow'][0]['class'],'snow')
        np.testing.assert_array_equal(annotated,original)

    def test_multiple_dirty_details_exclude_snow(self):
        obs,_,_=self.run_case('dirty',('dust','bird','snow','leaf'))
        self.assertEqual(set(obs['labels']),{'panel_dirty_dust','panel_dirty_bird','panel_dirty_leaf'})
        self.assertEqual({d['class'] for d in obs['details']},{'dust','bird','leaf'})
        for d in obs['details']:
            points=np.array(d['polygon']);self.assertGreaterEqual(points.min(),29)
            self.assertLessEqual(points[:,0].max(),151);self.assertLessEqual(points[:,1].max(),131)

    def test_crack_requires_segmentation_verification(self):
        good,_,_=self.run_case('crack',crack=True)
        uncertain,_,_=self.run_case('crack',crack=False)
        self.assertEqual(good['labels'],['panel_crack']);self.assertEqual(good['state'],'crack')
        self.assertEqual(uncertain['state'],'review');self.assertEqual(uncertain['labels'],[])

    def test_missing_mask_does_not_invent_classification(self):
        obs,_,_=self.run_case(seg=False)
        self.assertEqual(obs['state'],'review');self.assertIsNone(obs['class'])

    def test_low_confidence_is_not_confirmed_defect(self):
        obs,_,_=self.run_case('crack',crack=True,confidence=.4)
        self.assertEqual(obs['state'],'review');self.assertEqual(obs['labels'],[])

    def test_rotated_crop_transform_round_trip(self):
        image=np.zeros((250,250,3),np.uint8)
        polygon=cv2.boxPoints(((125,125),(120,70),32))
        crop,inverse=oriented_crop(image,polygon)
        restored=transform(transform(polygon,np.linalg.inv(inverse)),inverse)
        np.testing.assert_allclose(restored,polygon,atol=.001)

if __name__=='__main__':unittest.main()
