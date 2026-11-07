from pathlib import Path
import json
import tempfile
import unittest
import cv2
import numpy as np
from video_editor import editor_frame


class FrameEditorContracts(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.folder=Path(self.tmp.name)
        path=self.folder/'input.video'
        tmpvideo=self.folder/'video.mp4'
        v=cv2.VideoWriter(str(tmpvideo),cv2.VideoWriter_fourcc(*'mp4v'),10,(160,100))
        for i in range(12):v.write(np.full((100,160,3),(i*15,100,200),np.uint8))
        v.release();tmpvideo.rename(path)
        (self.folder/'frames').mkdir()
        cv2.imwrite(str(self.folder/'frames/00001.jpg'),np.full((100,160,3),(99,77,55),np.uint8))
        (self.folder/'result.json').write_text(json.dumps({'frames':[{'source_frame':0,'preview':'frames/00000.jpg'},{'source_frame':5,'preview':'frames/00001.jpg'}]}))

    def tearDown(self):self.tmp.cleanup()

    def test_source_reads_requested_frame_not_nearest_analyzed_frame(self):
        a=cv2.imread(str(editor_frame(self.folder,1,'source')))
        b=cv2.imread(str(editor_frame(self.folder,6,'source')))
        self.assertLess(abs(float(a[:,:,0].mean())-15),12)
        self.assertLess(abs(float(b[:,:,0].mean())-90),12)
        self.assertGreater(b[:,:,0].mean()-a[:,:,0].mean(),60)

    def test_analysis_returns_existing_saved_annotation(self):
        self.assertEqual(editor_frame(self.folder,5,'analysis'),self.folder/'frames/00001.jpg')
        with self.assertRaises(ValueError):editor_frame(self.folder,6,'analysis')

    def test_invalid_frame_or_mode_rejected(self):
        for frame,mode in [(-1,'source'),(12,'source'),(0,'other')]:
            with self.assertRaises(ValueError):editor_frame(self.folder,frame,mode)

    def test_cached_frame_is_reused(self):
        p=editor_frame(self.folder,4,'source');mtime=p.stat().st_mtime_ns
        again=editor_frame(self.folder,4,'source')
        self.assertEqual(p,again);self.assertEqual(mtime,again.stat().st_mtime_ns)

if __name__=='__main__':unittest.main()
