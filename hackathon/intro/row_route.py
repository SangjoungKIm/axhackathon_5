"""OBB row detection and an image-coordinate boustrophedon route."""
from io import BytesIO
from pathlib import Path
import math
import threading

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

ROUTE_SCHEMA = 2
ANGLE_TOLERANCE_DEG = 8.
LINE_DISTANCE_WIDTH_RATIO = .6


def _collinear(a, b):
    """Parallel neighbors must stay separate; only the same extended line joins."""
    alignment = float(a['axis'] @ b['axis'])
    if abs(alignment) < math.cos(math.radians(ANGLE_TOLERANCE_DEG)):
        return False
    axis_b = b['axis'] if alignment >= 0 else -b['axis']
    axis = a['axis']+axis_b
    axis /= np.linalg.norm(axis)
    normal = np.array([-axis[1], axis[0]])
    distance = abs(float((b['center']-a['center']) @ normal))
    return distance <= LINE_DISTANCE_WIDTH_RATIO*min(a['width'], b['width'])


def merge_collinear(records):
    # Complete-link groups avoid transitive chains drifting into a parallel row.
    groups = []
    ordered = sorted(records, key=lambda r: (-r['length'], *r['center']))
    for record in ordered:
        matches = [g for g in groups if all(_collinear(record, item) for item in g)]
        if matches:
            group = min(matches, key=lambda g: np.linalg.norm(record['center']-g[0]['center']))
            group.append(record)
        else:
            groups.append([record])
    merged = []
    for group in groups:
        if len(group) == 1:
            merged.append({**group[0], 'source_polygons': [group[0]['polygon']], 'segment_count': 1})
            continue
        vector = sum((r['length']*np.array([math.cos(2*r['angle']), math.sin(2*r['angle'])])
                      for r in group), np.zeros(2))
        angle = .5*math.atan2(vector[1], vector[0])
        axis = np.array([math.cos(angle), math.sin(angle)])
        normal = np.array([-axis[1], axis[0]])
        points = np.concatenate([r['polygon'] for r in group])
        along, across = points @ axis, points @ normal
        lo, hi, bottom, top = along.min(), along.max(), across.min(), across.max()
        center = axis*(lo+hi)/2+normal*(bottom+top)/2
        polygon = np.array([axis*lo+normal*bottom, axis*hi+normal*bottom,
                            axis*hi+normal*top, axis*lo+normal*top])
        merged.append(dict(center=center, axis=axis, angle=angle,
                           length=float(hi-lo), width=float(top-bottom), polygon=polygon,
                           confidence=max(r['confidence'] for r in group),
                           source_polygons=[r['polygon'] for r in group], segment_count=len(group)))
    return merged


def build_row_route(polygons, confidences=None):
    """Use each OBB's long axis, independent of vertex order or rotation.

    Merge collinear OBB fragments, order physical rows across the dominant long
    axis, then alternate entry/exit ends. Gaps along one row are bridged.
    Coordinates are pixels, not GPS positions or executable aircraft commands.
    """
    records = []
    if confidences is None:
        confidences = [1.] * len(polygons)
    for polygon, confidence in zip(polygons, confidences):
        pts = np.asarray(polygon, dtype=float)
        if pts.shape != (4, 2) or not np.isfinite(pts).all():
            raise ValueError('열 OBB는 유효한 꼭짓점 4개여야 합니다.')
        center = pts.mean(axis=0)
        pts = pts[np.argsort(np.arctan2(pts[:, 1]-center[1], pts[:, 0]-center[0]))]
        edges = np.roll(pts, -1, axis=0)-pts
        lengths = np.linalg.norm(edges, axis=1)
        index = int(np.argmax(lengths))
        length, width = float(lengths[index]), float(lengths.min())
        if width < 1e-6:
            continue
        axis = edges[index]/length
        angle = math.atan2(axis[1], axis[0])
        records.append(dict(center=center, axis=axis, angle=angle,
                            length=length, width=width, polygon=pts,
                            confidence=float(confidence)))
    if not records:
        return {'rows': [], 'waypoints': [], 'axis_angle_deg': None, 'detection_count': 0,
                'route_schema': ROUTE_SCHEMA,
                'coordinate_system': 'image_pixels', 'executable': False}

    detection_count = len(records)
    records = merge_collinear(records)

    # Axial mean: +179 and -1 degrees describe the same row direction.
    vector = sum((r['length'] * np.array([math.cos(2*r['angle']), math.sin(2*r['angle'])])
                  for r in records), np.zeros(2))
    angle = .5*math.atan2(vector[1], vector[0])
    dominant = np.array([math.cos(angle), math.sin(angle)])
    horizontal = abs(dominant[0]) >= abs(dominant[1])
    if dominant[0 if horizontal else 1] < 0:
        dominant = -dominant
    normal = np.array([-dominant[1], dominant[0]])
    # Mostly horizontal: top -> bottom; mostly vertical: left -> right.
    if normal[1 if horizontal else 0] < 0:
        normal = -normal
    records.sort(key=lambda r: (round(float(r['center'] @ normal), 5),
                                float(r['center'] @ dominant)))
    rows, waypoints = [], []
    for i, record in enumerate(records):
        axis = record['axis']
        if axis @ dominant < 0:
            axis = -axis
        a = record['center']-axis*record['length']/2
        b = record['center']+axis*record['length']/2
        if i % 2:
            a, b = b, a
        first = len(waypoints)+1
        for endpoint, point in zip(('entry', 'exit'), (a, b)):
            waypoints.append({'number': len(waypoints)+1, 'row': i+1,
                              'endpoint': endpoint, 'x': round(float(point[0]), 4),
                              'y': round(float(point[1]), 4)})
        rows.append({'id': i+1, 'polygon': record['polygon'].round(4).tolist(),
                     'source_polygons': [p.round(4).tolist() for p in record['source_polygons']],
                     'segment_count': record['segment_count'],
                     'center': record['center'].round(4).tolist(),
                     'length': round(record['length'], 4), 'width': round(record['width'], 4),
                     'angle_deg': round(math.degrees(math.atan2(axis[1], axis[0])), 3),
                     'confidence': record['confidence'], 'waypoint_numbers': [first, first+1]})
    return {'rows': rows, 'waypoints': waypoints, 'detection_count': detection_count,
            'route_schema': ROUTE_SCHEMA,
            'axis_angle_deg': round(math.degrees(math.atan2(dominant[1], dominant[0])), 3),
            'coordinate_system': 'image_pixels', 'executable': False}


def decode_image(data):
    try:
        with Image.open(BytesIO(data)) as image:
            if image.format not in {'JPEG', 'PNG', 'WEBP'}:
                raise ValueError('JPEG, PNG, WebP 이미지를 사용하세요.')
            if image.width*image.height > 30_000_000:
                raise ValueError('이미지는 최대 3천만 화소입니다.')
            image = ImageOps.exif_transpose(image).convert('RGB')
            return np.array(image)[:, :, ::-1].copy()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError('이미지 파일을 읽을 수 없습니다.') from exc


class RowInspector:
    def __init__(self, model_path):
        self.model_path = Path(model_path)
        self.model = None
        self.lock = threading.Lock()

    def detect(self, image, confidence=.25):
        import torch
        from ultralytics import YOLO
        with self.lock:
            if self.model is None:
                model = YOLO(str(self.model_path))
                if model.task != 'obb' or len(model.names) != 1:
                    raise ValueError('solar_row.pt는 단일 클래스 OBB 모델이어야 합니다.')
                self.model = model
            result = self.model.predict(image, conf=confidence, imgsz=1280, max_det=300,
                                        device=0 if torch.cuda.is_available() else 'cpu', verbose=False)[0]
            obb = result.obb
            polygons = obb.xyxyxyxy.cpu().numpy() if obb is not None else []
            confidences = obb.conf.cpu().numpy() if obb is not None else []
        route = build_row_route(polygons, confidences)
        return {**route, 'width': image.shape[1], 'height': image.shape[0],
                'model': self.model_path.name, 'classes': self.model.names,
                'row_count': len(route['rows']), 'waypoint_count': len(route['waypoints'])}
