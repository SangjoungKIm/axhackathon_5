/* 실시간 시뮬레이션 엔진: 고정 이벤트 시간표를 재생한다.
   - 같은 시나리오·초기 상태 → 같은 결과
   - event_id 중복 제거, sequence 역순 무시
   - 1 실제 초 = 1 시뮬레이션 분 (배속 적용) */
window.PV = window.PV || {};

PV.sim = (function () {
  const listeners = new Set();
  const state = {
    runId: 1,
    scenario: "partial",
    running: false,
    speed: 1,
    clockMin: PV.SIM_START_MIN, // 시뮬레이션 시각 (분)
    seen: new Set(),            // 처리한 event_id
    seqByTarget: {},            // target → 마지막 sequence
    ignored: { dup: 0, stale: 0 },
    log: [],                    // 최근 처리 로그
    applied: [],                // 적용된 이벤트 (화면 상태 파생용)
    cursor: 0,
    pendingNew: 0,              // "새 결과 있음" 카운트
    gapExtra: false,
    stepTimer: null
  };

  const scenarios = {
    normal:  { label: "정상 완료", desc: "촬영 24동작 모두 성공, 견적·일정 응답 정상" },
    partial: { label: "탐지·분석 일부 실패", desc: "촬영 동작 2건 실패, 분석 1건 실패 후 재시도" },
    gap:     { label: "전력 수신 누락", desc: "11:50~12:10 전력 표본 누락, 0 발전으로 치환하지 않음" },
    dup:     { label: "중복·역순 이벤트", desc: "같은 event_id 재전송과 오래된 sequence 수신" }
  };

  /* 시간표: at = 시작 후 경과 분 */
  function buildTimeline(scn) {
    const ev = [];
    let seq = 100;
    const push = (at, type, target, payload, opt = {}) => ev.push({ event_id: opt.id || `E-${state.runId}-${ev.length + 1}`, at, type, target, payload, sequence: opt.seq ?? seq++, simulated_at: PV.SIM_START_MIN + at, source_type: opt.src || "합성 시뮬레이션" });

    // 전력 표본: 5분마다 (S1)
    for (let m = 5; m <= 240; m += 5) {
      const t = PV.SIM_START_MIN + m;
      if (scn === "gap" && t >= 11 * 60 + 50 && t <= 12 * 60 + 10) continue;
      push(m, "power.sample_received", "S1", { t }, { src: "원천 로그 재생" });
    }
    // S2 촬영 임무: 동작 11~24 (1~10은 초기 상태: 성공 9 · 실패 1)
    const failSet = scn === "normal" ? new Set() : new Set([14, 19]);
    let m = 1;
    for (let a = 11; a <= 24; a++, m += 1) {
      push(m, failSet.has(a) ? "capture.failed" : "capture.completed", "INS-2026-033", { action: a, reason: failSet.has(a) ? "짐벌 각도 오류" : null });
    }
    // 실패 동작 재시도
    if (failSet.size) { push(m + 1, "capture.completed", "INS-2026-033", { action: 14, retry: true }); push(m + 2, "capture.completed", "INS-2026-033", { action: 19, retry: true }); m += 2; }
    push(m + 1, "mission.finished", "INS-2026-033", {});
    // 자료 수신·분석
    for (let i = 1; i <= 6; i++) push(m + 1 + i, "image.received", "INS-2026-033", { count: i === 6 && scn !== "normal" ? 6 : 8 }); // 실패 동작 #7의 2패널은 미수신
    push(m + 9, "analysis.completed", "INS-2026-033", { ok: 46, failed: scn === "normal" ? 0 : 2 });
    if (scn !== "normal") push(m + 12, "analysis.completed", "INS-2026-033", { ok: 2, failed: 0, retry: true });
    // 업무 이벤트
    push(8, "quote.submitted", "REQ-0512", { org: "ORG-TO", total: 310000 });
    push(12, "work.item_reported", "WO-2088", { item: "B구역", result: "11/12 완료 · B12 제외 (정비 후 세척)" });
    push(15, "schedule.proposed", "REQ-0512", { org: "ORG-TM", slot: ["2026-11-12", 10, 13] });
    push(22, "review.rejected", "WO-2075", { item: "ADD-1", reason: "범위 외 작업은 변경 승인 후 진행" });
    // 중복·역순
    if (scn === "dup") {
      push(18, "capture.completed", "INS-2026-033", { action: 12 }, { id: `E-${state.runId}-11`, seq: 111 }); // 같은 event_id 재전송
      push(20, "capture.completed", "INS-2026-033", { action: 11 }, { seq: 105 }); // 오래된 sequence
    }
    ev.sort((a, b) => a.at - b.at || a.sequence - b.sequence);
    return ev;
  }

  let timeline = buildTimeline(state.scenario);

  function emit() { listeners.forEach((fn) => fn(state)); }

  function apply(e) {
    if (state.seen.has(e.event_id)) { state.ignored.dup++; log(e, "중복 무시"); return; }
    const last = state.seqByTarget[e.target] ?? -1;
    if (e.sequence < last && e.type.startsWith("capture")) { state.ignored.stale++; log(e, "역순 무시"); return; }
    state.seen.add(e.event_id);
    state.seqByTarget[e.target] = Math.max(last, e.sequence);
    state.applied.push(e);
    if (!e.type.startsWith("power")) state.pendingNew++;
    log(e);
  }
  function log(e, ignored) {
    state.log.unshift({ t: fmtMin(e.simulated_at), type: e.type, target: e.target, ignored, id: e.event_id });
    if (state.log.length > 80) state.log.pop();
  }

  function tick() {
    state.clockMin += 1;
    const elapsed = state.clockMin - PV.SIM_START_MIN;
    while (state.cursor < timeline.length && timeline[state.cursor].at <= elapsed) { apply(timeline[state.cursor]); state.cursor++; }
    emit();
  }

  function start() {
    if (state.running) return;
    state.running = true;
    schedule();
    emit();
  }
  function schedule() {
    clearInterval(state.stepTimer);
    state.stepTimer = setInterval(tick, 1000 / state.speed);
  }
  function pause() { state.running = false; clearInterval(state.stepTimer); emit(); }
  function setSpeed(s) { state.speed = s; if (state.running) schedule(); emit(); }
  function reset(scn) {
    pause();
    state.runId += 1;
    if (scn) state.scenario = scn;
    state.clockMin = PV.SIM_START_MIN;
    state.seen = new Set(); state.seqByTarget = {}; state.ignored = { dup: 0, stale: 0 };
    state.log = []; state.applied = []; state.cursor = 0; state.pendingNew = 0;
    timeline = buildTimeline(state.scenario);
    emit();
  }
  function ackNew() { state.pendingNew = 0; emit(); }

  /* 파생 상태 */
  function captureState() {
    const base = PV.inspections["INS-2026-033"].mission;
    let done = base.done, failed = base.failed, finished = false;
    const failedActions = new Set([7]); // 초기 실패 동작
    const retried = new Set();
    state.applied.forEach((e) => {
      if (e.target !== "INS-2026-033") return;
      if (e.type === "capture.completed") { done++; if (e.payload.retry) { failedActions.delete(e.payload.action); retried.add(e.payload.action); failed--; } }
      if (e.type === "capture.failed") { failed++; failedActions.add(e.payload.action); }
      if (e.type === "mission.finished") finished = true;
    });
    return { planned: base.planned, done, failed, finished, failedActions: [...failedActions], retried: [...retried], pending: base.planned - done - failed };
  }
  function receiveState() {
    let received = 0, analyzedOk = 0, analyzedFail = 0;
    state.applied.forEach((e) => {
      if (e.target !== "INS-2026-033") return;
      if (e.type === "image.received") received += e.payload.count;
      if (e.type === "analysis.completed") { analyzedOk += e.payload.ok; if (e.payload.retry) analyzedFail -= e.payload.ok; else analyzedFail += e.payload.failed; }
    });
    return { received, analyzedOk, analyzedFail: Math.max(0, analyzedFail) };
  }
  function powerToday(siteId = "S1") {
    const all = PV.powerSeries(siteId, "today");
    const visible = all.filter((s) => s.t <= state.clockMin);
    if (state.scenario === "gap") return visible.filter((s) => !(s.t >= 11 * 60 + 50 && s.t <= 12 * 60 + 10 && s.t > PV.SIM_START_MIN));
    return visible;
  }
  function has(type, target, pred) { return state.applied.some((e) => e.type === type && e.target === target && (!pred || pred(e))); }

  function fmtMin(m) { const h = Math.floor(m / 60), mm = m % 60; return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`; }

  return { state, scenarios, start, pause, setSpeed, reset, ackNew, captureState, receiveState, powerToday, has, fmtMin,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    get timeline() { return timeline; } };
})();

/* 발전량 계산: 순간 표본 사다리꼴 적분 (허용 간격 10분 이내만) */
PV.energyKwh = function (series, maxGapMin = 10) {
  let kwh = 0, gaps = 0;
  for (let i = 1; i < series.length; i++) {
    const dt = series[i].t - series[i - 1].t;
    if (dt > maxGapMin) { gaps++; continue; }
    kwh += ((series[i - 1].kw + series[i].kw) / 2) * (dt / 60);
  }
  return { kwh: Math.round(kwh * 10) / 10, gaps };
};
