"""Read persisted source/annotated video frames without running inference again."""
from functools import lru_cache
import json
from pathlib import Path
import threading

import cv2

FRAME_LOCK=threading.Lock()


@lru_cache(maxsize=16)
def frame_catalog(folder):
    root=Path(folder)
    result=json.loads((root/('view.json' if (root/'view.json').exists() else 'result.json')).read_text())
    return {int(f['source_frame']):str(f['preview']) for f in result['frames']}


def editor_frame(folder,source_frame,mode):
    if source_frame<0:raise ValueError('프레임 번호는 0 이상이어야 합니다.')
    if mode not in {'source','analysis'}:raise ValueError('영상 모드를 확인하세요.')
    if not (folder/'result.json').is_file():raise ValueError('저장된 분석 결과가 없습니다.')
    if mode=='analysis':
        path=frame_catalog(str(folder)).get(source_frame)
        if path is None:raise ValueError('해당 프레임은 모델 분석 프레임이 아닙니다. 원본 모드로 전환해 주세요.')
        p=folder/path
        if not p.is_file():raise ValueError('저장된 분석 프레임 이미지가 없습니다.')
        return p
    dest=folder/'editor_frames'/f'F{source_frame:07d}.jpg'
    if dest.is_file():return dest
    # Serialize seeks to limit CPU/memory when scrubbing produces concurrent requests.
    with FRAME_LOCK:
        if dest.is_file():return dest
        video=cv2.VideoCapture(str(folder/'input.video'))
        try:
            if not video.isOpened():raise ValueError('저장된 원본 영상을 열 수 없습니다.')
            total=int(video.get(cv2.CAP_PROP_FRAME_COUNT))
            if source_frame>=total:raise ValueError(f'프레임 범위를 벗어났습니다. 마지막 프레임은 {total-1}입니다.')
            video.set(cv2.CAP_PROP_POS_FRAMES,source_frame)
            ok,frame=video.read()
            if not ok:raise ValueError('해당 원본 프레임을 읽지 못했습니다.')
            position=video.get(cv2.CAP_PROP_POS_FRAMES)
            if abs(position-(source_frame+1))>.5:raise ValueError('영상의 프레임 위치를 정확히 찾지 못했습니다.')
            h,w=frame.shape[:2];scale=min(1.,1280/max(h,w))
            if scale<1:frame=cv2.resize(frame,(round(w*scale),round(h*scale)))
            dest.parent.mkdir(exist_ok=True)
            if not cv2.imwrite(str(dest),frame,[cv2.IMWRITE_JPEG_QUALITY,88]):raise ValueError('프레임 이미지를 저장하지 못했습니다.')
        finally:video.release()
    return dest
