"""가상 지도 "사람 확정(수동 판정)".

왕복 촬영 등으로 같은 칸에 묶인 트랙끼리 자동 판정이 갈리거나(판정 불일치), 자동 판정이 틀렸을 때
사람이 칸 상세에서 최종 판정을 직접 정한다. 확정 결과는 세션 폴더의 review.json에 저장하고,
지도를 불러올 때마다 자동 판정 위에 덮어써서 지도 색·요약 수치에 반영한다.

판정 형식
- major: ["clean"] (정상은 단독) | ["dirty"] | ["crack"] | ["crack", "dirty"] (파손 + 오염)
- dirty_classes: 오염을 고른 경우 bird / dust / leaf 중 1개 이상 (복수 가능)
- boxes: {트랙 uid: [{"i": 박스 번호, "cls": "bird"|"dust"|"leaf"|"none"}]} — 오염 근거 박스별 수정(선택)
  ("none" = 오탐이라 제외). 세션에 박스 좌표가 저장된 경우(2026-10-26 이후 분석분)만 쓸 수 있다.

칸 식별: "지도 생성"을 다시 하면 칸 번호(pid)가 바뀔 수 있어, 칸에 묶인 트랙 uid 묶음으로 저장한다.
다시 만든 지도에서는 트랙 묶음이 같은 칸에, 같지 않으면 겹침(자카드) 0.5 이상인 칸 중 가장 많이 겹친 칸에 적용한다.
"""
from __future__ import annotations

import copy
import time

DIRTY_ORDER = ("bird", "dust", "leaf")
MAJORS = ("clean", "dirty", "crack")


def cell_key(panel: dict) -> str:
    members=panel.get("members", [])
    return "|".join(sorted({str(m.get("uid")) for m in members})) if members else "undetected:"+str(panel.get("pid"))


def validate(body: dict) -> dict:
    """화면에서 보낸 확정 내용을 검사해 정리된 dict로 돌려준다 (잘못되면 ValueError)."""
    major = [m for m in MAJORS if m in set(body.get("major") or [])]
    if not major:
        raise ValueError("대분류(정상 / 오염 / 파손)를 하나 이상 선택하세요.")
    if "clean" in major and len(major) > 1:
        raise ValueError("정상은 오염·파손과 함께 선택할 수 없습니다.")
    classes = [c for c in DIRTY_ORDER if c in set(body.get("dirty_classes") or [])]
    if "dirty" in major and not classes:
        raise ValueError("오염을 선택한 경우 오염 종류(bird / dust / leaf)를 하나 이상 선택하세요.")
    if "dirty" not in major:
        classes = []
    boxes = {}
    for uid, items in (body.get("boxes") or {}).items():
        clean_items = []
        for it in items or []:
            cls = str(it.get("cls"))
            if cls not in DIRTY_ORDER + ("none",):
                raise ValueError(f"박스 분류 값이 올바르지 않습니다: {cls}")
            clean_items.append({"i": int(it.get("i")), "cls": cls})
        if clean_items:
            boxes[str(uid)] = clean_items
    if "dirty" not in major:
        boxes = {}
    key = str(body.get("key") or "")
    if not key:
        raise ValueError("칸 식별값(key)이 없습니다.")
    return {
        "key": key,
        "pid": str(body.get("pid") or ""),
        "major": major,
        "dirty_classes": classes,
        "boxes": boxes,
        "note": str(body.get("note") or "")[:300],
        "at": time.time(),
    }


def _label(classes: list[str]) -> str | None:
    if not classes:
        return None
    return f"dirty_{classes[0]}" if len(classes) == 1 else f"dirty_{len(classes)}"


def _match(panels: list[dict], reviews: dict) -> dict[str, tuple[str, str]]:
    """pid -> (review key, "exact" | "overlap")"""
    out: dict[str, tuple[str, str]] = {}
    keys_of = {p["pid"]: set(cell_key(p).split("|")) for p in panels}
    used_pid = set()
    # 1) 트랙 묶음이 정확히 같은 칸
    by_key = {cell_key(p): p["pid"] for p in panels}
    pending = []
    for k in reviews:
        if k in by_key:
            out[by_key[k]] = (k, "exact")
            used_pid.add(by_key[k])
        else:
            pending.append(k)
    # 2) 많이 겹치는 칸 (지도를 다시 만들어 묶음이 조금 달라진 경우)
    for k in pending:
        ks = set(k.split("|"))
        best, best_j = None, 0.0
        for pid, s in keys_of.items():
            if pid in used_pid:
                continue
            j = len(ks & s) / max(1, len(ks | s))
            if j > best_j:
                best, best_j = pid, j
        if best is not None and best_j >= 0.5:
            out[best] = (k, "overlap")
            used_pid.add(best)
    return out


def apply_reviews(layout: dict, review_doc: dict | None) -> dict:
    """layout(자동 판정)에 사람 확정을 덮어쓴 사본을 돌려준다. 요약·열별 수치도 다시 센다."""
    lay = copy.deepcopy(layout)
    reviews = (review_doc or {}).get("reviews", {})
    matched = _match(lay.get("panels", []), reviews) if reviews else {}

    for p in lay.get("panels", []):
        p["review_key"] = cell_key(p)
        p["auto"] = {k: p.get(k) for k in ("status", "dirty_classes", "dirty_label", "with_dirty")}
        p["review"] = None
        hit = matched.get(p["pid"])
        if hit:
            k, how = hit
            r = reviews[k]
            major = r["major"]
            classes = list(r.get("dirty_classes") or [])
            if "crack" in major:
                status = "crack"
            elif "dirty" in major:
                status = "dirty"
            else:
                status = "clean"
            p["status"] = status
            p["dirty_classes"] = classes
            p["dirty_label"] = _label(classes)
            p["with_dirty"] = status == "crack" and "dirty" in major
            p["review"] = {**r, "match": how, "stored_key": k}
        p["needs_review"] = bool(p.get("inconsistent")) and p["review"] is None

    panels = lay.get("panels", [])
    s = lay.setdefault("summary", {})
    for st in ("crack", "dirty", "clean", "insufficient", "undetected"):
        s[st] = sum(1 for p in panels if p["status"] == st)
    s["reviewed"] = sum(1 for p in panels if p["review"])
    s["needs_review"] = sum(1 for p in panels if p["needs_review"])
    s["review_unmatched"] = len(reviews) - len(matched)
    for r in lay.get("rows", []):
        ps = [p for p in panels if p.get("row") == r.get("row")]
        r["crack"] = sum(p["status"] == "crack" for p in ps)
        r["dirty"] = sum(p["status"] == "dirty" for p in ps)
        r["undetected"] = sum(p["status"] == "undetected" for p in ps)
        r["detected"] = len(ps)-r["undetected"]
    return lay
