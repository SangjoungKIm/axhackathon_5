"""반자동 가상 지도: 사용자가 지정한 영상 구간(프레임 범위 · 열 번호 · 가는/오는 방향)으로 패널 배치를 만든다.

자동 방식(virtual_map.py)은 카메라가 거의 수직이라고 가정해서, 낮은 고도에서 비스듬히 찍은 영상(원근 왜곡,
화면 위쪽 패널이 작게 보임)에서는 위치가 흩어졌다. 반자동 방식은 문제를 줄여서 푼다.

1) 구간마다 독립적으로 처리한다. 구간 = 한 열을 한 방향으로 직진 비행한 부분 (사용자가 지정).
2) 위치 계산에는 화면 하단 띠(band, 기본 화면 높이 65~95%)의 관측만 쓴다. 카메라에 가까워 원근 왜곡이 작고,
   띠 안에서는 패널 크기가 거의 일정하다고 볼 수 있다.
3) 카메라 움직임은 띠 안 패널들의 프레임 간 이동량(중앙값)으로 "이동만" 누적한다 (회전·원근 추정 없음).
   - 정지한 패널은 y(f) - S(f)가 일정하다 (S = 누적 세로 이동). 그래서 u = S(f) - y(f)가 "열 방향 위치",
     v = x(f) - X(f)가 "열 폭 방향 위치"가 된다.
4) u를 패널 피치(띠 안 패널 높이 중앙값)로, v를 패널 폭으로 나눠 칸(열 방향 순번)·줄(폭 방향 순번)을 정한다.
   같은 칸으로 모인 트랙(ID 재발급·중복 탐지)은 하나의 패널로 합친다.
5) 방향 규칙은 카메라 화면 기준으로 고정하고, 뒤집기는 사용자가 지정한 값만 따른다 (자동 판단 없음).
   - 줄: 화면 왼쪽 -> 오른쪽 순서. "좌우 반전"을 체크한 구간만 뒤집는다 (드론이 180도 돌아서 촬영한 구간).
   - 칸: 화면 아래(카메라 쪽) -> 위(카메라가 바라보는 쪽) 순서. "오는" 구간만 뒤집는다.
   [수정 2026-10-22] 이전에는 패널이 화면 위로 흐르면(흐름 < 0) 후진 비행으로 보고 줄·칸을 자동으로 뒤집었다.
   그러나 testload_1의 F1760~2060처럼 짐벌이 아래로 기울어질 때도 같은 흐름이 생겨, 체크하지 않은 구간이
   몰래 뒤집히는 문제가 있었다. 흐름 부호는 진단 정보로만 남긴다.
   구간별 칸·줄 오프셋으로 어긋남을 보정한다.

한계
- 구간 안에서 드론이 크게 회전하거나 옆으로 많이 움직이면 줄 번호가 밀린다 (구간을 더 짧게 나눠 지정).
- 왕복 정렬은 "오는 구간이 열 끝에서 시작한다"는 가정이다. 맞지 않으면 구간의 칸 오프셋으로 맞춘다.
- 실측 위치가 아니라 열/줄/칸 순번이다.
"""
from __future__ import annotations

import math
import time
from collections import defaultdict

import numpy as np
from cell_consensus import cell_consensus

STATUS_RANK = {"crack": 3, "dirty": 2, "clean": 1, "insufficient": 0}
DIRTY_ORDER = ("bird", "dust", "leaf")

DEFAULT_PARAMS = {
    "band_top": 0.65,             # 위치 계산에 쓰는 화면 띠 (높이 비율). testload_1 실측: 0.55는 비스듬한 구간에서 줄이 합쳐짐, 0.65에서 세 구간 모두 5줄로 일치
    "band_bottom": 0.95,
    "include_insufficient": False,
    "slice_gap_ratio": 0.25,      # 같은 가로줄(슬라이스)로 볼 진행 방향 간격 (띠 안 패널 박스 높이 배수)
    "min_band_obs": 2,            # 띠 안 관측이 이보다 적은 트랙은 위치를 정하지 않음
    "min_lane_fill": 0.3,         # 구간 칸 수 대비 채워진 칸 비율이 이보다 낮은 줄은 제외 (화면 가장자리 조각·옆 열)
}


def _merge_params(params: dict | None) -> dict:
    p = dict(DEFAULT_PARAMS)
    for k, v in (params or {}).items():
        if k in p and v is not None:
            p[k] = bool(v) if isinstance(p[k], bool) else type(p[k])(v)
    p["band_top"] = min(max(p["band_top"], 0.0), 0.9)
    p["band_bottom"] = min(max(p["band_bottom"], p["band_top"] + 0.05), 1.0)
    return p


def _clean_segments(segments: list[dict]) -> list[dict]:
    out = []
    for i, s in enumerate(segments or []):
        a, b = int(s.get("start", 0)), int(s.get("end", 0))
        if b <= a:
            raise ValueError(f"{i + 1}번째 구간: 끝 프레임이 시작 프레임보다 커야 합니다.")
        row = int(s.get("row", 1))
        if row < 1:
            raise ValueError(f"{i + 1}번째 구간: 열 번호는 1 이상이어야 합니다.")
        d = s.get("direction", "out")
        if d not in ("out", "back"):
            raise ValueError(f"{i + 1}번째 구간: 방향은 out(가는) 또는 back(오는)이어야 합니다.")
        mirror = s.get("mirror")
        mirror = (d == "back") if mirror is None else bool(mirror)
        out.append({"start": a, "end": b, "row": row, "direction": d, "mirror": mirror,
                    "col_offset": int(s.get("col_offset", 0) or 0), "lane_offset": int(s.get("lane_offset", 0) or 0),
                    "note": str(s.get("note", ""))[:60]})
    if not out:
        raise ValueError("구간을 1개 이상 지정하세요.")
    return out


def _segment_positions(records, idx_list, seg, W, H, p):
    """구간 안에서 트랙별 (u, v) 위치와 띠 안 패널 크기를 계산한다."""
    y1, y2 = p["band_top"] * H, p["band_bottom"] * H
    obs = defaultdict(dict)   # frame -> {track idx: (x, y, w, h)}
    for i in idx_list:
        for t in records[i].get("traj", []):
            f = int(t[0])
            if seg["start"] <= f <= seg["end"]:
                x, y, w, h = t[1] * W, t[2] * H, t[3] * W, t[4] * H
                if y1 <= y <= y2:
                    obs[f][i] = (x, y, w, h)
    frames = sorted(obs)
    if len(frames) < 2:
        return {}, None, {"frames": len(frames), "steps": 0, "matched_steps": 0, "flow": 0.0}

    # 누적 이동 (S: 세로, X: 가로). 프레임 간 공통 트랙의 이동량 중앙값.
    S, X = {frames[0]: 0.0}, {frames[0]: 0.0}
    last = (0.0, 0.0)
    matched = 0
    dys = []
    for fa, fb in zip(frames, frames[1:]):
        common = [i for i in obs[fb] if i in obs[fa]]
        df = fb - fa
        if common:
            dy = float(np.median([obs[fb][i][1] - obs[fa][i][1] for i in common]))
            dx = float(np.median([obs[fb][i][0] - obs[fa][i][0] for i in common]))
            last = (dy / df, dx / df)
            matched += 1
            dys.append(dy / df)
        else:
            dy, dx = last[0] * min(df, 10), last[1] * min(df, 10)
        S[fb] = S[fa] + dy
        X[fb] = X[fa] + dx
    flow = float(np.median(dys)) if dys else 0.0  # +: 패널이 화면 아래로 흐름(전진), -: 위로 흐름(후진)

    # 폭 방향 위치(v)는 띠 중앙 기준선에 가장 가까웠던 순간의 x로 잡는다. 비스듬한 영상에서는 패널이 화면 아래로
    # 내려올수록 소실점에서 바깥쪽으로 벌어지므로, 띠 전체 평균을 쓰면 줄 경계가 번진다.
    y_ref = (y1 + y2) / 2
    pos, ph, pw = {}, [], []
    for i in idx_list:
        us, best = [], None
        for f in frames:
            if i in obs[f]:
                x, y, w, h = obs[f][i]
                us.append(S[f] - y)   # 클수록 화면 위쪽(카메라가 바라보는 쪽)에 있는 패널
                d = abs(y - y_ref)
                if best is None or d < best[0]:
                    best = (d, x - X[f], f, (x / W, y / H, w / W, h / H))
                ph.append(h)
                pw.append(w)
        if len(us) >= p["min_band_obs"]:
            # (진행 방향 위치, 폭 방향 위치, 띠 관측 수, 기준선 시점 프레임, 그 시점 박스[정규화 cx,cy,w,h])
            pos[i] = (float(np.median(us)), float(best[1]), len(us), int(best[2]),
                      [round(v, 4) for v in best[3]])
    size = (float(np.median(pw)), float(np.median(ph))) if ph else None
    return pos, size, {"frames": len(frames), "steps": len(frames) - 1, "matched_steps": matched, "flow": round(flow, 2)}


def _quad_at(rec: dict, frame: int) -> list | None:
    """궤적에서 해당 프레임의 패널 4꼭짓점(정규화 8값)을 찾는다. seg 모델 이전 세션은 없음(None)."""
    for t in rec.get("traj", []):
        if int(t[0]) == frame:
            return [round(float(v), 4) for v in t[5:13]] if len(t) >= 13 else None
    return None


def _cluster_1d(values: list[float], gap: float) -> list[int]:
    """정렬 후 간격이 gap보다 크면 끊어서 묶음 번호를 매긴다 (입력 순서대로 반환)."""
    order = np.argsort(values)
    labels = [0] * len(values)
    g, prev = 0, None
    for k in order:
        if prev is not None and values[k] - prev > gap:
            g += 1
        labels[k] = g
        prev = values[k]
    return labels


def _assign_lanes(vs: list[float], sl: list[int], pw: float) -> list[int]:
    """슬라이스(진행 방향 가로줄)를 순서대로 훑으며 이전 슬라이스의 줄 위치와 가장 가까운 줄에 잇는다.

    열이 화면에서 약간 비스듬하면 슬라이스마다 줄 위치가 조금씩 옆으로 밀리므로(누적 시 패널 폭 이상),
    전체 v를 한 번에 묶으면 줄이 섞인다. 이웃 슬라이스끼리만 비교하고, 밀림량(드리프트)을 누적해 보정한다."""
    by = defaultdict(list)
    for i, (v, k) in enumerate(zip(vs, sl)):
        by[k].append(i)
    gaps = []
    for k in by:
        vv = sorted(vs[i] for i in by[k])
        gaps += [b - a for a, b in zip(vv, vv[1:]) if b - a > 0.4 * pw]
    spacing = float(np.median(gaps)) if gaps else pw
    tol = 0.45 * spacing

    lane_of = [-1] * len(vs)
    centers: dict[int, float] = {}   # 줄 번호 -> 최근 v
    drift_total, adj = 0.0, {}       # 슬라이스까지 누적 밀림량 (줄 순서 결정용)
    for k in sorted(by):
        items = sorted(by[k], key=lambda i: vs[i])
        # 이번 슬라이스 전체 밀림량: 가장 가까운 기존 줄과의 차이 중앙값
        if centers:
            d = [min((vs[i] - c for c in centers.values()), key=abs) for i in items]
            shift = float(np.median([x for x in d if abs(x) < tol] or [0.0]))
        else:
            shift = 0.0
        drift_total += shift
        used = set()
        for i in items:
            best, bd = None, None
            for ln, c in centers.items():
                dd = abs(vs[i] - (c + shift))
                if dd <= tol and (bd is None or dd < bd):
                    best, bd = ln, dd
            if best is None or best in used:
                # 같은 슬라이스에서 이미 쓰인 줄이면: 중복 탐지(같은 패널)인지 새 줄인지 거리로 판단
                if best is not None and bd < 0.25 * spacing:
                    lane_of[i] = best
                    continue
                best = len(centers)
            lane_of[i] = best
            used.add(best)
            centers[best] = vs[i]
            adj.setdefault(best, []).append(vs[i] - drift_total)
    # 줄 번호를 밀림 보정한 평균 위치 순으로 다시 매긴다
    order = sorted(adj, key=lambda ln: float(np.median(adj[ln])))
    remap = {ln: n for n, ln in enumerate(order)}
    # 보정 위치가 거의 같은 줄(끊겼다 다시 나타난 줄)은 하나로 합친다
    merged, prev_pos, cur = {}, None, -1
    for ln in order:
        pos_ = float(np.median(adj[ln]))
        if prev_pos is None or pos_ - prev_pos > 0.5 * spacing:
            cur += 1
        merged[ln] = cur
        prev_pos = pos_
    _assign_lanes.last_spacing = spacing
    return [merged[l] for l in lane_of]


def _box_iou(a, b) -> float:
    ax1, ay1, ax2, ay2 = a[0] - a[2] / 2, a[1] - a[3] / 2, a[0] + a[2] / 2, a[1] + a[3] / 2
    bx1, by1, bx2, by2 = b[0] - b[2] / 2, b[1] - b[3] / 2, b[0] + b[2] / 2, b[1] + b[3] / 2
    iw = max(0.0, min(ax2, bx2) - max(ax1, bx1))
    ih = max(0.0, min(ay2, by2) - max(ay1, by1))
    inter = iw * ih
    union = a[2] * a[3] + b[2] * b[3] - inter
    return inter / union if union > 0 else 0.0


def _resolve_conflicts(ids, lanes, cols, pos, records, seg, pitch, spacing, min_common=5, dup_iou=0.3):
    """같은 칸에 묶였지만 같은 시점에 함께 보였고 박스도 겹치지 않는 트랙 = 서로 다른 패널.

    오탐/오차로 이웃 패널이 한 칸에 합쳐진 경우로 보고, 벌어진 방향(폭 방향이면 줄, 진행 방향이면 칸)으로
    이웃 칸에 옮긴다. 옮길 칸에도 같은 충돌이 있으면 한 칸 더 밀고, 그래도 안 되면 그대로 둔다(미해결로 집계).
    박스가 크게 겹치는(IoU >= dup_iou) 동시 트랙은 같은 패널의 중복 탐지로 보고 그대로 둔다."""
    obs = {}
    for i in ids:
        obs[i] = {int(t[0]): t[1:5] for t in records[i].get("traj", []) if seg["start"] <= int(t[0]) <= seg["end"]}

    def conflict(a, b):
        common = set(obs[a]) & set(obs[b])
        if len(common) <= min_common:
            return False
        ious = [_box_iou(obs[a][f], obs[b][f]) for f in common]
        return float(np.median(ious)) < dup_iou

    cell = {}
    for k, i in enumerate(ids):
        cell.setdefault((lanes[k], cols[k]), []).append(k)
    # 옮길 수 있는 범위: 기존 줄·칸 범위 안 (밖으로 밀면 실제로 없는 줄/칸이 생긴다)
    lane_rng, col_rng = (min(lanes), max(lanes)), (min(cols), max(cols))
    moved = unresolved = 0
    for key in sorted(cell, key=lambda c: (c[1], c[0])):
        group = list(cell.get(key, []))
        if len(group) < 2:
            continue
        # 칸 중심에 가장 가까운(관측이 많은) 트랙을 기준으로 남긴다
        group.sort(key=lambda k: -pos[ids[k]][2])
        keep = [group[0]]
        for k in group[1:]:
            if not any(conflict(ids[k], ids[j]) for j in keep):
                keep.append(k)          # 같은 패널(시간이 안 겹치거나 중복 탐지) -> 같은 칸 유지
                continue
            ref = ids[keep[0]]
            du = pos[ids[k]][0] - pos[ref][0]
            dv = pos[ids[k]][1] - pos[ref][1]
            if abs(dv) / max(spacing, 1.0) >= abs(du) / max(pitch, 1.0):
                step = (1 if dv > 0 else -1, 0)
            else:
                step = (0, 1 if du > 0 else -1)
            placed = False
            # 벌어진 방향으로 1~3칸, 그래도 막히면 반대 축 방향(옆 줄/앞뒤 칸)도 시도
            other = (0, 1 if du > 0 else -1) if step[1] == 0 else (1 if dv > 0 else -1, 0)
            tries = [(step[0] * n, step[1] * n) for n in (1, 2, 3)] + [other]
            for d in tries:
                nk = (key[0] + d[0], key[1] + d[1])
                if not (lane_rng[0] <= nk[0] <= lane_rng[1] and col_rng[0] <= nk[1] <= col_rng[1]):
                    continue
                occupants = cell.get(nk, [])
                if not any(conflict(ids[k], ids[j]) for j in occupants):
                    cell[key].remove(k)
                    cell.setdefault(nk, []).append(k)
                    lanes[k], cols[k] = nk
                    moved += 1
                    placed = True
                    break
            if not placed:
                unresolved += 1
    # 밀려서 음수가 된 번호를 0부터 다시
    lo_l, lo_c = min(lanes), min(cols)
    lanes[:] = [l - lo_l for l in lanes]
    cols[:] = [c - lo_c for c in cols]
    return moved, unresolved


def build_manual_layout(doc: dict, segments: list[dict], params: dict | None = None) -> dict:
    p = _merge_params(params)
    segs = _clean_segments(segments)
    meta = doc.get("meta", {})
    W, H = (meta.get("frame_size") or [1920, 1080])[:2]
    records = doc.get("panels", [])
    usable = [i for i, r in enumerate(records)
              if r.get("status") != "rejected" and (p["include_insufficient"] or r.get("status") != "insufficient")]

    cells: dict[tuple, list[tuple]] = defaultdict(list)   # (row, lane, col) -> [(track idx, seg no)]
    ref_at: dict[tuple, tuple] = {}                         # (track idx, seg no) -> (기준선 시점 프레임, 박스)
    seg_info = []
    used_tracks = set()
    flows = {}

    # 1차: 구간별 위치 -> 칸/줄 (구간 로컬 번호)
    seg_local = []
    for sn, seg in enumerate(segs):
        idx = [i for i in usable
               if records[i].get("first_frame", 0) <= seg["end"] and records[i].get("last_frame", 0) >= seg["start"]]
        pos, size, diag = _segment_positions(records, idx, seg, W, H, p)
        flows[sn] = diag["flow"]
        if not pos or size is None:
            seg_info.append({**seg, "panels": 0, "tracks": 0, "diag": diag, "warning": "구간 안 화면 하단에서 추적된 패널이 없습니다."})
            seg_local.append(None)
            continue
        pw, ph = size
        ids = list(pos)
        us = [pos[i][0] for i in ids]
        vs = [pos[i][1] for i in ids]
        # 진행 방향: 같은 가로줄(슬라이스)의 패널은 u가 거의 같다 -> u를 묶어 슬라이스를 만들고,
        # 슬라이스 간격의 중앙값을 패널 피치로 쓴다 (박스 높이는 기울어진 패널에서 피치보다 커서 쓰지 않음).
        sl = _cluster_1d(us, p["slice_gap_ratio"] * ph)
        centers = sorted({k: float(np.median([u for u, l in zip(us, sl) if l == k])) for k in set(sl)}.values())
        diffs = [b - a for a, b in zip(centers, centers[1:])]
        pitch = float(np.median(diffs)) if diffs else ph
        u0 = centers[0]
        cols = [int(round((u - u0) / max(pitch, 1.0))) for u in us]
        lanes = _assign_lanes(vs, sl, pw)
        # 듬성한 줄(화면 가장자리에 걸친 조각, 옆 열 일부) 제외 후 줄 번호를 다시 0부터
        n_col = max(cols) + 1
        fill = defaultdict(set)
        for ln, c in zip(lanes, cols):
            fill[ln].add(c)
        keep = sorted(ln for ln in fill if len(fill[ln]) >= p["min_lane_fill"] * n_col)
        if keep:
            remap = {ln: n for n, ln in enumerate(keep)}
            kept = [k for k, ln in enumerate(lanes) if ln in remap]
            diag["dropped_lanes"] = len(fill) - len(keep)
            diag["dropped_tracks"] = len(ids) - len(kept)
            ids = [ids[k] for k in kept]
            cols = [cols[k] for k in kept]
            lanes = [remap[lanes[k]] for k in kept]
        diag["pitch_px"] = round(pitch, 1)
        # 동시에 보인 서로 다른 패널이 한 칸에 묶인 경우 이웃 칸으로 분리
        moved, unresolved = _resolve_conflicts(ids, lanes, cols, pos, records, seg, pitch,
                                               getattr(_assign_lanes, "last_spacing", pw))
        diag["conflicts_moved"] = moved
        diag["conflicts_unresolved"] = unresolved
        seg_local.append({"ids": ids, "lanes": lanes, "cols": cols, "pw": pw, "ph": ph, "diag": diag,
                          "ref": {i: (pos[i][3], pos[i][4]) for i in ids}})

    # 2차: 왕복 정렬 (같은 열의 out 구간을 기준으로 back 구간의 칸 번호를 뒤집는다)
    row_len = {}
    for sn, seg in enumerate(segs):
        loc = seg_local[sn]
        if loc and seg["direction"] == "out":
            row_len[seg["row"]] = max(row_len.get(seg["row"], 0), max(loc["cols"]) + 1)
    for sn, seg in enumerate(segs):
        loc = seg_local[sn]
        if not loc:
            continue
        n_lane = max(loc["lanes"]) + 1
        n_col = max(loc["cols"]) + 1
        mirror = seg["mirror"]   # 사용자가 지정한 값만 따른다 (흐름 부호로 자동 반전하지 않음)
        rl = row_len.get(seg["row"], n_col)
        for i, ln, c in zip(loc["ids"], loc["lanes"], loc["cols"]):
            lane = ((n_lane - 1 - ln) if mirror else ln) + seg["lane_offset"]
            col = (rl - 1 - c) if seg["direction"] == "back" else c
            col += seg["col_offset"]
            cells[(seg["row"], lane, col)].append((i, sn))
            ref_at[(i, sn)] = loc["ref"][i]
            used_tracks.add(i)
        seg_info.append({**seg, "panels": len(set(zip(loc["lanes"], loc["cols"]))), "tracks": len(loc["ids"]),
                         "lanes": n_lane, "cols": n_col, "mirrored": mirror,
                         "panel_px": [round(loc["pw"], 1), round(loc["ph"], 1)], "diag": loc["diag"]})
    seg_info.sort(key=lambda s: (s["start"]))

    if not cells:
        raise ValueError("지정한 구간들에서 위치를 정할 수 있는 패널이 없습니다. 구간 범위나 화면 띠 설정을 확인하세요.")

    # 3차: 패널 레코드 (칸 번호는 열마다 1부터)
    # 보정(오프셋)으로 음수가 된 줄/칸 번호를 열마다 0부터 다시 맞춘다
    rows_present = sorted({k[0] for k in cells})
    lane_min = {r: min(k[1] for k in cells if k[0] == r) for r in rows_present}
    cells = {(r, ln - lane_min[r], c): v for (r, ln, c), v in cells.items()}
    row_min_col = {r: min(k[2] for k in cells if k[0] == r) for r in rows_present}
    row_lanes = {r: max(k[1] for k in cells if k[0] == r) + 1 for r in rows_present}
    lane_h, pitch, aisle = 1.0, 1.08, 1.6
    row_base, base = {}, 0.0
    for r in rows_present:
        row_base[r] = base
        base += row_lanes[r] * lane_h + aisle

    out = []
    for (r, lane, col), mem in cells.items():
        recs = [records[i] for i, _ in mem]
        refs = {records[i].get("uid"): (sn, ref_at[(i, sn)]) for i, sn in mem}
        statuses = [m.get("status") for m in recs]
        final = max(statuses, key=lambda s: STATUS_RANK.get(s, 0))
        dirty_cls = sorted({c for m in recs if m.get("status") == "dirty" or m.get("with_dirty")
                            for c in (m.get("dirty_classes") or ["dust"])},
                           key=lambda c: DIRTY_ORDER.index(c) if c in DIRTY_ORDER else 9)
        label = None
        if final == "dirty" or (final == "crack" and dirty_cls):
            label = f"dirty_{dirty_cls[0]}" if len(dirty_cls) == 1 else f"dirty_{len(dirty_cls)}"
        judged = {s for s in statuses if s != "insufficient"}
        best = max(recs, key=lambda m: (STATUS_RANK.get(m.get("status"), 0), m.get("observations", 0)))
        c1 = col - row_min_col[r] + 1
        pid = f"R{r}-L{lane + 1}-C{c1:02d}" if row_lanes[r] > 1 else f"R{r}-C{c1:02d}"
        segs_used = sorted({sn for _, sn in mem})
        g = [round((col - row_min_col[r]) * pitch, 3), round(row_base[r] + lane * lane_h, 3)]
        out.append({
            "pid": pid, "row": r, "lane": lane + 1, "col": c1,
            "grid": g, "est": g,
            "status": final,
            "with_dirty": final == "crack" and bool(dirty_cls),
            "dirty_classes": dirty_cls if label else [],
            "dirty_label": label,
            "inconsistent": len(judged) > 1,
            "seen_in_segments": [segs[sn]["direction"] for sn in segs_used],
            "thumbs": best.get("thumbs", {}),
            "members": [{
                "uid": m.get("uid"), "track_id": m.get("track_id"), "status": m.get("status"),
                "first_frame": m.get("first_frame"), "last_frame": m.get("last_frame"),
                "observations": m.get("observations"), "dirty_label": m.get("dirty_label"),
                "thumbs": m.get("thumbs", {}),
                "dirty_dets": m.get("dirty_dets", []), "dirty_crop_size": m.get("dirty_crop_size"),
                # 이 칸에 배치된 근거: 해당 구간에서 기준선(화면 띠 중앙)에 가장 가까웠던 순간의 프레임과 박스
                "segment": refs[m.get("uid")][0] + 1,
                "ref_frame": refs[m.get("uid")][1][0],
                "ref_box": refs[m.get("uid")][1][1],
                "ref_quad": _quad_at(m, refs[m.get("uid")][1][0]),
            } for m in sorted(recs, key=lambda m: m.get("first_frame", 0))],
        })
    records_by_uid={r.get('uid'):r for r in records}
    for panel in out:
        panel.update(cell_consensus([records_by_uid[m.get('uid')] for m in panel['members']]))
    out.sort(key=lambda q: (q["row"], q["lane"], q["col"]))

    rows_out = []
    for r in rows_present:
        ps = [q for q in out if q["row"] == r]
        rows_out.append({"row": r, "lanes": row_lanes[r], "panels": len(ps), "cols": max(q["col"] for q in ps),
                         "grid_y": row_base[r], "crack": sum(q["status"] == "crack" for q in ps),
                         "dirty": sum(q["status"] == "dirty" for q in ps),
                         "both_ways": sum(len(set(q["seen_in_segments"])) > 1 for q in ps)})

    counts = defaultdict(int)
    for q in out:
        counts[q["status"]] += 1
    n_used = sum(len(q["members"]) for q in out)
    return {
        "session_id": doc.get("session_id"),
        "schema": 1,
        "mode": "manual",
        "created_at": time.time(),
        "params": p,
        "segments": seg_info,
        "units": "열/줄/칸 순번 (실측 위치 아님)",
        "scale": {"panel_short": lane_h, "panel_long": pitch, "pitch": pitch, "lane_h": lane_h, "aisle": aisle},
        "panels": out,
        "rows": rows_out,
        "path": [],
        "summary": {
            "panels": len(out),
            "crack": counts["crack"], "dirty": counts["dirty"],
            "clean": counts["clean"], "insufficient": counts["insufficient"],
            "inconsistent": sum(q["inconsistent"] for q in out),
            "rows": len(rows_out),
            "tracks_used": n_used,
            "tracks_merged": n_used - len(out),
            "tracks_excluded": len(records) - len(used_tracks),
            "both_ways": sum(r["both_ways"] for r in rows_out),
        },
        "diagnostics": {"mode": "manual", "segments": len(segs)},
    }


def motion_profile(doc: dict, band_top: float = 0.65, band_bottom: float = 0.95, step: int = 3) -> dict:
    """구간 지정 화면용: 프레임별 패널 이동량(화면 하단 띠 기준, 프레임당 px)과 탐지 수.

    dy > 0: 패널이 화면 아래로 흐름(전진), dy < 0: 위로 흐름(후진 또는 카메라가 아래로 기울어짐),
    |dx| 큼: 옆으로 이동하거나 요(yaw) 회전 중. 한 방향으로 꾸준한 구간이 반자동 지도에 쓰기 좋은 구간이다."""
    meta = doc.get("meta", {})
    W, H = (meta.get("frame_size") or [1920, 1080])[:2]
    y1, y2 = band_top * H, band_bottom * H
    obs = defaultdict(dict)
    count = defaultdict(int)
    for i, r in enumerate(doc.get("panels", [])):
        if r.get("status") == "rejected":
            continue
        for t in r.get("traj", []):
            f = int(t[0])
            count[f] += 1
            y = t[2] * H
            if y1 <= y <= y2:
                obs[f][i] = (t[1] * W, y)
    frames = sorted(obs)
    raw = {}
    for fa, fb in zip(frames, frames[1:]):
        common = [i for i in obs[fb] if i in obs[fa]]
        if common:
            df = fb - fa
            raw[fb] = (float(np.median([obs[fb][i][1] - obs[fa][i][1] for i in common])) / df,
                       float(np.median([obs[fb][i][0] - obs[fa][i][0] for i in common])) / df)
    n_frames = int(meta.get("frames_processed") or (max(count) + 1 if count else 0))
    series = []
    for f0 in range(0, n_frames, step):
        vals = [raw[f] for f in range(f0, f0 + step) if f in raw]
        n = max((count.get(f, 0) for f in range(f0, f0 + step)), default=0)
        if vals:
            series.append([f0, round(float(np.median([v[0] for v in vals])), 2),
                           round(float(np.median([v[1] for v in vals])), 2), n])
        else:
            series.append([f0, None, None, n])
    return {"frames": n_frames, "step": step, "band": [band_top, band_bottom], "series": series}
