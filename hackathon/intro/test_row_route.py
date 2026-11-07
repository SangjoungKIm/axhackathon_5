import math
import unittest

import numpy as np

from row_route import build_row_route, decode_image


def rectangle(center, length, width, angle):
    theta = math.radians(angle)
    u = np.array([math.cos(theta), math.sin(theta)])
    v = np.array([-u[1], u[0]])
    c = np.array(center)
    return np.array([c-u*length/2-v*width/2, c+u*length/2-v*width/2,
                     c+u*length/2+v*width/2, c-u*length/2+v*width/2])


class RowRouteTests(unittest.TestCase):
    def test_reference_image_split_pairs_form_thirteen_physical_rows(self):
        # Approximate centerline ends of the 24 boxes in the supplied 1..48 image.
        ends = [((135,63),(90,186)), ((162,161),(207,49)), ((154,184),(132,243)),
                ((220,184),(268,62)), ((210,205),(188,264)), ((278,205),(325,87)),
                ((271,232),(221,350)), ((335,226),(384,107)), ((330,255),(277,432)),
                ((396,248),(466,64)), ((387,276),(286,517)), ((453,271),(526,85)),
                ((444,293),(349,544)), ((512,293),(587,107)), ((505,315),(405,564)),
                ((568,322),(669,70)), ((561,347),(462,573)), ((631,340),(706,154)),
                ((620,368),(537,551)), ((631,511),(684,391)), ((745,238),(695,366)),
                ((755,385),(779,325)), ((745,411),(695,534)), ((783,499),(805,436))]
        boxes = []
        for a, b in ends:
            a, b = np.array(a), np.array(b)
            vector = b-a
            boxes.append(rectangle((a+b)/2, np.linalg.norm(vector), 16,
                                   math.degrees(math.atan2(vector[1], vector[0]))))
        result = build_row_route(boxes)
        self.assertEqual(len(result['rows']), 13)
        self.assertEqual(len(result['waypoints']), 26)
        self.assertEqual(sorted(row['segment_count'] for row in result['rows']), [1, 1]+[2]*11)

    def test_split_collinear_boxes_become_one_long_row(self):
        boxes = [rectangle((30, 100), 40, 10, 0), rectangle((90, 100), 40, 10, 0),
                 rectangle((150, 100), 40, 10, 0), rectangle((90, 130), 160, 10, 0)]
        result = build_row_route(boxes)
        self.assertEqual(len(result['rows']), 2)
        self.assertEqual(result['detection_count'], 4)
        self.assertEqual(result['rows'][0]['segment_count'], 3)
        self.assertEqual([(p['x'], p['y']) for p in result['waypoints']],
                         [(10, 100), (170, 100), (170, 130), (10, 130)])

    def test_rotated_fragments_merge_without_joining_parallel_neighbors(self):
        for angle in [-70, -30, 0, 30, 70, 90, 160, 179]:
            theta = math.radians(angle)
            u, v = np.array([math.cos(theta), math.sin(theta)]), np.array([-math.sin(theta), math.cos(theta)])
            boxes = [rectangle(np.array([300, 300])+u*t+v*offset, 80, 16, angle)
                     for offset in [0, 35] for t in [-90, 90]]
            result = build_row_route(boxes[::-1])
            self.assertEqual(len(result['rows']), 2, angle)
            self.assertTrue(all(row['segment_count'] == 2 for row in result['rows']))
            self.assertEqual(len(result['waypoints']), 4)

    def test_similar_angles_must_also_share_the_extended_centerline(self):
        result = build_row_route([rectangle((100, 100), 100, 12, 25),
                                  rectangle((100, 150), 100, 12, 25)])
        self.assertEqual(len(result['rows']), 2)

    def test_small_angle_error_still_merges_on_one_row(self):
        result = build_row_route([rectangle((70, 100), 100, 16, 1),
                                  rectangle((200, 101), 90, 16, -1)])
        self.assertEqual(len(result['rows']), 1)
        self.assertEqual(result['rows'][0]['segment_count'], 2)

    def test_crossing_and_bent_segments_are_separate(self):
        result = build_row_route([rectangle((100, 100), 150, 10, 0),
                                  rectangle((100, 100), 150, 10, 30)])
        self.assertEqual(len(result['rows']), 2)

    def test_horizontal_rows_alternate_at_both_ends(self):
        result = build_row_route([rectangle((110, 60), 180, 12, 0),
                                  rectangle((110, 20), 180, 12, 0)])
        points = [(p['x'], p['y']) for p in result['waypoints']]
        self.assertEqual(points, [(20, 20), (200, 20), (200, 60), (20, 60)])
        self.assertEqual([p['number'] for p in result['waypoints']], [1, 2, 3, 4])

    def test_vertical_rows_run_top_to_bottom_then_reverse(self):
        result = build_row_route([rectangle((60, 110), 180, 12, 90),
                                  rectangle((20, 110), 180, 12, 90)])
        points = [(p['x'], p['y']) for p in result['waypoints']]
        self.assertEqual(points, [(20, 20), (20, 200), (60, 200), (60, 20)])

    def test_rotation_and_vertex_order_do_not_change_route(self):
        for angle in [-40, -15, 15, 40, 65, 110, 165, 179]:
            u = np.array([math.cos(math.radians(angle)), math.sin(math.radians(angle))])
            v = np.array([-u[1], u[0]])
            boxes = [rectangle(np.array([250, 250])+v*offset, 180, 12, angle)
                     for offset in [0, 40, 80]]
            route = build_row_route(boxes)
            shuffled = build_row_route([np.roll(boxes[2][::-1], 1, 0),
                                         np.roll(boxes[0], 2, 0), boxes[1][::-1]])
            self.assertEqual(route['waypoints'], shuffled['waypoints'])
            points = np.array([[p['x'], p['y']] for p in route['waypoints']])
            for i in range(3):
                self.assertAlmostEqual(np.linalg.norm(points[2*i+1]-points[2*i]), 180, places=3)
            directions = points[1::2]-points[::2]
            self.assertLess(directions[0]@directions[1], 0)
            self.assertLess(directions[1]@directions[2], 0)

    def test_empty_detection_never_produces_fake_waypoints(self):
        result = build_row_route([])
        self.assertEqual(result['rows'], [])
        self.assertEqual(result['waypoints'], [])
        self.assertFalse(result['executable'])

    def test_one_row_has_exactly_two_short_edge_midpoints(self):
        polygon = rectangle((200, 200), 160, 20, 32)
        result = build_row_route([polygon])
        self.assertEqual(len(result['waypoints']), 2)
        midpoint = np.mean([[p['x'], p['y']] for p in result['waypoints']], axis=0)
        np.testing.assert_allclose(midpoint, [200, 200])

    def test_invalid_vertices_and_images_are_rejected(self):
        with self.assertRaises(ValueError):
            build_row_route([[[0, 0], [float('nan'), 1], [1, 1], [1, 0]]])
        with self.assertRaises(ValueError):
            decode_image(b'not an image')
