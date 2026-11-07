/* SCR-02 드론 점검 */
window.PV = window.PV || {};

PV.screens.drone = function (page, ctx) {
  const st = ctx.state;
  const list = Object.values(PV.inspections).filter((i) => ctx.sites.includes(i.site)).sort((a, b) => b.id.localeCompare(a.id));
  const id = ctx.params.id;
  const ins = id && PV.inspections[id];
  if (!ins) return renderList();
  return renderDetail(ins);

  /* ---------- 목록 상태 ---------- */
  function renderList() {
    st.page = st.page || 1;
    const label = (ctx.def.menuLabels && ctx.def.menuLabels.drone) || "드론 점검";
    page.append(PV.titleBar(label, PV.siteLabel(ctx.site), [PV.newResultsChip(ctx)]));
    const rows = ctx.role === "drone" ? list.filter(i => i.assignee === "drone") : list;
    const card = PV.h("div", { class: "card", style: { flex: 1 } });
    card.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "점검 목록"), PV.h("span", { class: "muted" }, `${rows.length}건`)));
    const tbl = PV.table({
      columns: [
        { label: "점검 ID", render: (i) => PV.h("span", { class: "mono" }, i.id), width: "140px" },
        { label: "발전소", render: (i) => PV.sites[i.site].name },
        { label: "회차·목적", primary: true, render: (i) => `${i.round}회차 · ${i.purpose}` },
        { label: "단계", render: (i) => PV.badge(i.status, i.status === "촬영" ? "action" : null, i.status === "촬영" ? "camera" : null) },
        { label: "담당 수행자", render: (i) => i.assignee ? PV.users[i.assignee].name : PV.badge("미배정", "und") },
        { label: "촬영일", render: (i) => i.captureAt ? PV.h("span", { class: "mono" }, i.captureAt.slice(0, 10)) : PV.h("span", { class: "muted" }, "미수집") },
        { label: "자료", render: (i) => PV.real?.jobsForInspection(i.id).length ? PV.real.inspectionSummary(i.id) : i.files.received ? `${i.files.received}건 수신 · 분석 ${i.files.analyzed}` : PV.h("span", { class: "muted" }, "-") }
      ],
      rows, rowKey: (i) => i.id, selected: st.selected, page: st.page, pageSize: 7,
      onSelect: (i) => { st.selected = i.id; PV.go("drone", { id: i.id }); }, onPage: (p) => { st.page = p; ctx.rerender(); },
      emptyText: { title: "배정된 점검이 없습니다", desc: "점검 요청이 접수되면 여기에 표시됩니다." }
    });
    card.append(tbl.wrap, PV.h("div", { class: "card__foot" }, tbl.pager));
    page.append(PV.h("div", { class: "body" }, card));
    page.append(PV.h("footer", { class: "bar" }, PV.h("span", { class: "bar__info" }, ctx.def.label),
      PV.h("div", { class: "bar__actions" }, ["owner", "epc", "master"].includes(ctx.role) ? PV.h("button", { class: "btn", onClick: () => PV.forms.inspectionRequest(ctx) }, "점검 요청") : null,
        ["epc", "master", "drone"].includes(ctx.role) ? PV.h("button", { class: "btn", onClick: () => uploadDialog(null) }, PV.icon("upload"), "보유 자료 업로드") : null)));
  }

  /* ---------- 상세 상태 ---------- */
  function renderDetail(ins) {
    const site = PV.sites[ins.site];
    const detailSt = (st.detail = st.detail || {});
    const key = ins.id;
    detailSt[key] = detailSt[key] || { step: ins.stage, tab: "steps" };
    const d = detailSt[key];
    if (ctx.params.step) d.step = Number(ctx.params.step);
    const uploadOnly = !!ins.uploadOnly;
    const steps = ["자료 준비", "탐지·경로 검토", "촬영", "자료 수신·인계"];

    const sel = PV.h("select", { class: "ctx-select", "aria-label": "점검 선택", onChange: (e) => PV.go("drone", { id: e.target.value }) }, ...list.map((i) => PV.h("option", { value: i.id }, `${i.id} · ${PV.sites[i.site].name} ${i.round}회차`)));
    sel.value = ins.id;
    const tabs = PV.tabs([{ key: "steps", label: "단계" }, { key: "log", label: "실행 기록" }], d.tab, (k) => { d.tab = k; ctx.rerender(); }, "tabs--plain");
    page.append(PV.titleBar(`${site.name} ${ins.round}회차`, `${ins.purpose} · ${ins.id}`, [PV.newResultsChip(ctx), tabs, sel], { back: { label: "점검 목록", fn: () => PV.go("drone") } }));

    if (d.tab === "log") return renderLog(ins);

    const body = PV.h("div", { class: "body body--split has-strip" });
    body.style.gridTemplateColumns = "minmax(520px, 70fr) minmax(300px, 30fr)";
    const stepperWrap = PV.h("div", { class: "hstack", style: { justifyContent: "space-between" } }, PV.stepper(steps, d.step, { skip: uploadOnly ? [2, 3] : null, onPick: (n) => { if (n <= ins.stage) { d.step = n; ctx.rerender(); } } }),
      PV.h("div", { class: "hstack" }, PV.badge(`현재 단계: ${ins.status}`, "action"), PV.srcBadge(ins.source)));
    body.append(stepperWrap);
    const left = PV.h("div", { class: "card pane pane--list" });
    const right = PV.h("div", { class: "card pane pane--detail" });
    body.append(left, right);
    page.append(body);
    const bar = PV.h("footer", { class: "bar" });
    page.append(bar);

    const canRun = ["drone", "epc", "master"].includes(ctx.role);
    const assigneeName = ins.assignee ? PV.users[ins.assignee].name : null;

    if (d.step === 1) {
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "전체 RGB 이미지"), PV.h("span", { class: "muted" }, ins.imageSrc || "등록된 이미지 없음")));
      if (ins.imageSrc) {
        const fr = PV.h("div", { class: "card__body", style: { display: "flex" } });
        const m = PV.siteMap(ins.site, { noJudg: true, noLegend: true, srcLabel: "전경 이미지 위 가상 배치 (시연 자료)" });
        fr.append(m); left.append(fr);
      } else {
        left.append(PV.h("div", { class: "empty" }, PV.icon("image"), PV.h("h3", null, "전경 이미지가 없습니다"), PV.h("p", null, "JPG · PNG · TIFF"), canRun ? PV.h("button", { class: "btn", onClick: () => uploadDialog(ins) }, PV.icon("upload"), "이미지 업로드") : null));
      }
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "점검 정보")),
        PV.h("div", { class: "card__body stack" },
          PV.whoBox(assigneeName || "미배정", ins.assignee ? "탐지 실행" : "담당 수행자 배정", ins.reviewer ? PV.users[ins.reviewer].name : "미지정", undefined),
          PV.kv([["발전소", site.name], ["목적", ins.purpose], ["기체", ins.assignee ? "SKY-01 (스카이뷰드론)" : "미지정"], ["자료 출처", ins.source], ["희망 기간", ins.wish || "-"], ["현장 전달", ins.note || "-"]]),
          !ins.assignee ? PV.note("담당 수행자 미배정 · 홈에서 배정", "warn") : null,
          !site.zones.length ? PV.note("패널 등록정보 없음 · 설정에서 등록", "warn") : null));
      const reason = !ins.imageSrc ? "유효한 입력 자료가 없습니다" : !ins.assignee ? "담당 수행자가 필요합니다" : !canRun ? "실행 권한이 없습니다" : null;
      bar.append(PV.h("span", { class: "bar__info" }, reason ? `탐지 실행 불가 · ${reason}` : "자료·담당자 확인됨"),
        PV.h("div", { class: "bar__actions" }, PV.h("button", { class: "btn btn--primary", disabled: !!reason, onClick: () => { ins.stage = Math.max(ins.stage, 2); ins.status = ins.stage === 2 ? "탐지·경로 검토" : ins.status; d.step = 2; PV.toast("탐지 실행 · 48개 탐지, 미연결 0"); ctx.rerender(); } }, "탐지 실행", PV.icon("arrowRight"))));
    }

    if (d.step === 2) {
      const n = PV.panelsOf(ins.site).length;
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "패널 탐지 영역·방문 순서·경로"), PV.h("span", { class: "muted" }, `경로 ${ins.mission?.routeVersion || "v1"} · 계획 좌표`)));
      left.append(PV.h("div", { class: "card__body", style: { display: "flex" } }, PV.siteMap(ins.site, { noJudg: true, noLegend: true, route: true, srcLabel: "경로는 계획 좌표 · 실제 GPS 없음" })));
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "검토 정보")),
        PV.h("div", { class: "card__body stack" },
          PV.whoBox(assigneeName, ins.stage > 2 ? "촬영" : "경로 검토 완료", undefined, undefined),
          PV.kv([["탐지 대상 수", `${n}개`], ["등록 패널 수", `${n}개`], ["연결 미확인", "0개"], ["경로 버전", ins.mission?.routeVersion || "v1"], ["좌표계·단위", "이미지 픽셀 · 변환 미확인"], ["대상 동작", `${n / 2}개 (2패널/동작)`], ["검토자·시각", ins.mission?.reviewedBy ? `${ins.mission.reviewedBy} · ${ins.mission.reviewedAt}` : "미검토"]], true)));
      bar.append(PV.h("span", { class: "bar__info" }, `대상 ${n}개 · 경로 ${ins.mission?.routeVersion || "v1"}`),
        PV.h("div", { class: "bar__actions" }, PV.h("button", { class: "btn", disabled: !canRun, onClick: () => { ins.mission = ins.mission || { planned: n / 2, done: 0, failed: 0, state: "검토 대기", routeVersion: "v1" }; ins.mission.routeVersion = "v" + (parseInt((ins.mission.routeVersion || "v0").slice(1), 10) + 1); PV.toast(`경로 ${ins.mission.routeVersion} 생성`); ctx.rerender(); } }, PV.icon("route"), "경로 생성"),
          PV.h("button", { class: "btn btn--primary", disabled: !canRun, onClick: () => { ins.mission = ins.mission || { planned: n / 2, done: 0, failed: 0, routeVersion: "v1" }; ins.mission.reviewedBy = ctx.user.name; ins.mission.reviewedAt = `${PV.TODAY} ${PV.sim.fmtMin(PV.sim.state.clockMin)}`; ins.mission.state = "준비"; ins.stage = Math.max(ins.stage, 3); ins.status = ins.stage === 3 ? "촬영" : ins.status; d.step = 3; ctx.rerender(); } }, "경로 검토 완료", PV.icon("check"))));
    }

    if (d.step === 3) {
      const live = ins.id === "INS-2026-033";
      const mapWrap = PV.h("div", { class: "card__body", style: { display: "flex", flexDirection: "column", gap: "10px" } });
      const statsBody = PV.h("div", { class: "card__body stack" });
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "경로와 실행 진행"), PV.h("span", { class: "muted" }, live ? "촬영 시뮬레이션 (실제 기체 명령 아님)" : "실행 기록")), mapWrap);
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "동작 처리 현황")), statsBody);
      const draw = () => {
        const demoPending=site.demo&&ins.mission&&!ins.captureAt;
        const cs = live ? PV.sim.captureState() : demoPending ? { planned:ins.mission.planned, done:ins.mission.done, failed:ins.mission.failed, pending:Math.max(0,ins.mission.planned-ins.mission.done-ins.mission.failed), finished:ins.mission.done+ins.mission.failed>=ins.mission.planned, failedActions:ins.mission.failed?[ins.mission.done+1]:[] } : { planned: ins.files.received / 2 || 36, done: ins.files.received / 2 || 36, failed: 0, finished: true, failedActions: [], pending: 0 };
        const perAction = 2;
        const doneUntil = cs.done + cs.failed;
        mapWrap.innerHTML = "";
        mapWrap.append(PV.siteMap(ins.site, { noJudg: true, noLegend: true, route: true, routePos: cs.finished ? undefined : Math.min(doneUntil * perAction, PV.panelsOf(ins.site).length - 1), srcLabel: "시뮬레이션 위치 (계획 좌표 기준)",
          progress: (p) => { const idx = PV.panelsOf(ins.site).findIndex((q) => q.id === p.id); const action = Math.floor(idx / perAction) + 1; if (cs.failedActions.includes(action)) return "fail"; if (action <= doneUntil) return "done"; if (action === doneUntil + 1 && !cs.finished) return "current"; return null; } }));
        const meter = PV.h("div", { class: "meter", role: "img", "aria-label": `성공 ${cs.done}, 실패 ${cs.failed}, 대기 ${cs.pending}` }, PV.h("i", { class: "ok", style: { width: `${(cs.done / cs.planned) * 100}%` } }), PV.h("i", { class: "fail", style: { width: `${(cs.failed / cs.planned) * 100}%` } }));
        mapWrap.append(meter);
        statsBody.innerHTML = "";
        const state = !live ? (cs.finished ? "촬영 종료" : ins.mission?.state === "일시정지" ? "일시정지" : ins.mission?.state === "실행" ? "실행 중" : "준비") : cs.finished ? "촬영 종료" : PV.sim.state.running ? "실행 중" : (cs.done ? "일시정지" : "준비");
        statsBody.append(
          PV.whoBox(assigneeName, cs.finished ? "자료 수신·인계" : "촬영 진행", undefined, undefined),
          PV.h("div", { class: "strip strip--2" },
            PV.stat({ label: "처리 진행률", value: `${Math.round(((cs.done + cs.failed) / cs.planned) * 100)}`, unit: "%", sub: `종료 동작 ${cs.done + cs.failed} / 예정 ${cs.planned}` }),
            PV.stat({ label: "성공 · 실패", value: `${cs.done}`, unit: `· ${cs.failed}`, sub: cs.failedActions.length ? `실패 동작 #${cs.failedActions.join(", #")}` : "실패 없음" })),
          PV.kv([["현재 상태", PV.badge(state, state === "실행 중" ? "action" : null)], ["경로 버전", ins.mission?.routeVersion || "v1"], ["위치 정보", "실제 GPS 없음 · 계획 좌표 시뮬레이션"], ["재촬영 대상", cs.failedActions.length ? `동작 #${cs.failedActions.join(", #")} (B구역 7~8, C구역 3~4 패널)` : "없음"]], true));
        bar.innerHTML = "";
        bar.append(PV.h("span", { class: "bar__info" }, live ? `시뮬레이션 RUN-${String(PV.sim.state.runId).padStart(2, "0")} · 시나리오: ${PV.sim.scenarios[PV.sim.state.scenario].label}` : (demoPending ? "더미 촬영 진행 현황 · 실제 기체 명령 아님" : `촬영 ${ins.captureAt}`)),
          PV.h("div", { class: "bar__actions" },
            live && !cs.finished ? [
              PV.sim.state.running ? PV.h("button", { class: "btn", onClick: () => PV.sim.pause() }, PV.icon("pause"), "일시정지") : PV.h("button", { class: "btn btn--primary", disabled: !canRun, onClick: () => PV.sim.start() }, PV.icon("play"), cs.done > PV.inspections["INS-2026-033"].mission.done ? "재개" : "촬영 시뮬레이션 시작"),
              PV.h("button", { class: "btn", disabled: !canRun, onClick: () => PV.dialog({ title: "촬영 종료", body: PV.h("p", null, `성공 ${cs.done} · 실패 ${cs.failed} · 미처리 ${cs.pending}. 촬영을 종료해도 자료 인계는 별도로 완료해야 합니다.`), actions: [{ label: "취소" }, { label: "종료", primary: true, fn: () => { PV.sim.pause(); ins.stage = 4; ins.status = "자료 수신·인계"; d.step = 4; ctx.rerender(); } }] }) }, PV.icon("square"), "종료")
            ] : PV.h("button", { class: "btn btn--primary", disabled:demoPending&&!cs.finished, onClick: () => { ins.stage = Math.max(ins.stage, 4); if (ins.status === "촬영") ins.status = "자료 수신·인계"; d.step = 4; ctx.rerender(); } }, "자료 수신으로", PV.icon("arrowRight"))));
      };
      draw();
      if (live) ctx.live(() => { if (d.step === 3) draw(); });
    }

    if (d.step === 4) {
      const live = ins.id === "INS-2026-033";
      const rs = live ? PV.sim.receiveState() : { received: ins.files.received, analyzedOk: ins.files.analyzed, analyzedFail: ins.files.failed };
      const missing = live ? Math.max(0, PV.panelsOf(ins.site).length - rs.received) : ins.files.missing;
      d.file = d.file || null;
      const batches = [];
      const zones = site.zones;
      const per = PV.panelsOf(ins.site).length / zones.length;
      let acc = 0;
      zones.forEach((z) => { const got = Math.max(0, Math.min(per, rs.received - acc)); acc += per; batches.push({ zone: z, planned: per, received: got, analyzed: got ? Math.max(0, Math.min(got, rs.analyzedOk + rs.analyzedFail - (acc - per))) : 0 }); });
      // 실패 파일을 특정 구역에 배치 (결정적)
      const failZone = rs.analyzedFail ? zones[Math.min(zones.length - 1, 3)] : null;
      const rows = batches.map((b) => ({ id: `${ins.id.slice(-3)}-${b.zone}`, zone: b.zone, planned: b.planned, received: b.received, ok: Math.max(0, b.analyzed - (b.zone === failZone ? rs.analyzedFail : 0) - (ins.id === "INS-2026-031" && b.zone === "F" ? 1 : 0)), fail: b.zone === failZone ? rs.analyzedFail : (ins.id === "INS-2026-031" && b.zone === "F" ? 1 : 0), missing: ins.id === "INS-2026-031" && b.zone === "D" ? 1 : Math.max(0, b.planned - b.received) }));
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "수신 파일"), PV.h("div", { class: "card__tools" }, PV.srcBadge(ins.source))));
      const tbl = PV.table({ columns: [
        { label: "묶음", render: (r) => PV.h("span", { class: "mono" }, r.id), width: "110px" },
        { label: "구역", primary: true, render: (r) => `${r.zone} 구역 (${r.planned}패널)` },
        { label: "수신", num: true, render: (r) => `${r.received} / ${r.planned}` },
        { label: "분석 성공", num: true, render: (r) => String(r.ok) },
        { label: "분석 실패", num: true, render: (r) => r.fail ? PV.badge(String(r.fail), "dmg", "alert") : "0" },
        { label: "미수신", num: true, render: (r) => r.missing ? PV.badge(String(r.missing), "und", "help") : "0" }
      ], rows, rowKey: (r) => r.id, selected: d.file, pageSize: 8, onSelect: (r) => { d.file = r.id; ctx.rerender(); } });
      left.append(tbl.wrap, PV.h("div", { class: "card__foot" }, tbl.pager));
      const reviewerSel = PV.h("select", { class: "select", "aria-label": "검토 담당자", onChange: (e) => { d.reviewer = e.target.value; } }, PV.h("option", { value: "" }, "검토 담당자 선택"), PV.h("option", { value: "epc" }, "박준호 (대한그린시공 · 기술 검토)"), PV.h("option", { value: "master" }, "운영관리자"));
      reviewerSel.value = d.reviewer || ins.reviewer || "";
      const selRow = rows.find((r) => r.id === d.file);
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "수신·분석·인계")),
        PV.h("div", { class: "card__body stack" },
          PV.whoBox(assigneeName, ins.status === "인계 완료" ? "검토 (인계 완료)" : "검토 담당자 인계", undefined, undefined),
          PV.h("div", { class: "strip strip--2" },
            PV.stat({ label: "수신", value: rs.received, unit: "건", sub: missing ? `미수신 ${missing}건` : "누락 없음" }),
            PV.stat({ label: "분석 처리", value: rs.received ? Math.round(((rs.analyzedOk + rs.analyzedFail) / rs.received) * 100) : 0, unit: "%", sub: `성공 ${rs.analyzedOk} · 실패 ${rs.analyzedFail}` })),
          selRow ? PV.h("div", { class: "stack" }, PV.h("div", { class: "section-title" }, `${selRow.zone} 구역 묶음`), PV.panelFrame({ j: selRow.fail ? "und" : "ok" }, { small: true, label: selRow.fail ? "분석 실패 파일 · 시연 자료" : "시연 자료" }), PV.kv([["원본 촬영 시각", ins.captureAt ? ins.captureAt.slice(0, 16) : `${PV.TODAY} ${PV.sim.fmtMin(PV.sim.state.clockMin)} (재생 시각)`], ["수신 시각", `${PV.TODAY} ${PV.sim.fmtMin(PV.sim.state.clockMin)}`], ["연결", `점검 ${ins.id} · 임무 ${ins.mission?.routeVersion || "-"}`]])) : PV.h("div", { class: "field" }, PV.h("label", null, "검토 담당자 (인계 필수)"), reviewerSel),
          selRow ? PV.h("div", { class: "field" }, PV.h("label", null, "검토 담당자 (인계 필수)"), reviewerSel) : null,
          ins.status === "인계 완료" ? PV.note(`인계 완료 · 검토자 ${PV.users[ins.reviewer].name} · 누락 1 재촬영 · 실패 1 미판정`) : null));
      const issues = rs.analyzedFail + missing;
      const canHandover = rs.received > 0 && (live ? PV.sim.captureState().finished || ins.status !== "촬영" : true);
      bar.append(PV.h("span", { class: "bar__info" }, issues ? `분석 실패 ${rs.analyzedFail} · 미수신 ${missing} · 처리방침 필요` : "실패·누락 없음"),
        PV.h("div", { class: "bar__actions" },
          PV.h("button", { class: "btn", disabled: !rs.analyzedFail || !canRun, onClick: () => PV.toast("실패 파일 재시도 예약 · 성공 결과 유지") }, PV.icon("retry"), "실패 항목 재시도"),
          ins.status === "인계 완료" ? PV.h("button", { class: "btn btn--primary", onClick: () => PV.go("panels", { site: ins.site, round: ins.id }) }, "결과 보기", PV.icon("arrowRight"))
            : PV.h("button", { class: "btn btn--primary", disabled: !canHandover || !canRun, onClick: () => handoverDialog(ins, d.reviewer || reviewerSel.value, rs, missing) }, PV.icon("send"), "자료 인계")));
    }
  }

  function handoverDialog(ins, reviewer, rs, missing) {
    if (!reviewer) { PV.toast("검토 담당자를 먼저 지정하세요."); return; }
    const policy = PV.h("select", { class: "select" }, PV.h("option", { value: "reshoot" }, "재촬영 요청 (구역·패널·동작 명시)"), PV.h("option", { value: "hold" }, "명시적 보류 · 미판정 유지"));
    PV.dialog({ title: "자료 인계", body: PV.h("div", { class: "stack" },
      PV.kv([["수신", `${rs.received}건`], ["분석 성공", `${rs.analyzedOk}건`], ["분석 실패", `${rs.analyzedFail}건`], ["미수신", `${missing}건`], ["검토 담당자", PV.users[reviewer].name]]),
      (rs.analyzedFail + missing) ? PV.h("div", { class: "field" }, PV.h("label", null, "누락·실패 항목 처리방침 (필수)"), policy) : PV.note("누락·실패 항목이 없습니다.")),
      actions: [{ label: "취소" }, { label: "인계 완료", primary: true, fn: () => {
        ins.reviewer = reviewer; ins.status = "인계 완료"; ins.stage = 4;
        ins.files = { received: rs.received, analyzed: rs.analyzedOk, failed: rs.analyzedFail, missing };
        ins.analysisAt = `${PV.TODAY} ${PV.sim.fmtMin(PV.sim.state.clockMin)}`;
        ins.captureAt = ins.captureAt || `${PV.TODAY} ${PV.sim.fmtMin(PV.SIM_START_MIN)}~${PV.sim.fmtMin(PV.sim.state.clockMin)}`;
        const t = PV.tasks.find((x) => x.link?.id === ins.id); if (t) { t.stage = "진행"; t.assignee = reviewer; t.assigneeLabel = `${PV.users[reviewer].name} (기술 검토자)`; t.next = "분석 결과 검토"; t.changes.unshift([PV.sim.fmtMin(PV.sim.state.clockMin), `자료 인계 · 검토자 ${PV.users[reviewer].name}`]); }
        PV.toast(`${ins.id} 자료를 ${PV.users[reviewer].name}에게 인계했습니다.`, { label: "결과 보기", fn: () => PV.go("panels", { site: ins.site, round: ins.id }) });
        ctx.rerender(); } }] });
  }

  function uploadDialog(ins) {
    if (PV.openRealUpload) return PV.openRealUpload(ctx, ins);
    const siteSel = PV.h("select", { class: "select" }, ...PV.allowedSites().map((s) => PV.h("option", { value: s }, PV.sites[s].name)));
    if (ins) siteSel.value = ins.site;
    PV.dialog({ title: "보유 자료 업로드", body: PV.h("div", { class: "stack" },
      PV.h("div", { class: "field" }, PV.h("label", null, "발전소"), siteSel),
      PV.h("div", { class: "field" }, PV.h("label", null, "파일"), PV.h("div", { class: "empty", style: { border: "1px dashed var(--line-strong)", borderRadius: "6px", padding: "20px" } }, PV.icon("upload"), PV.h("p", null, "RGB 전경·근접 이미지")), PV.h("span", { class: "hint" }, "촬영 계획·실행 단계는 ‘적용 없음’ 처리")),
      PV.h("div", { class: "check" }, PV.h("input", { type: "checkbox", id: "u-src", checked: true }), PV.h("label", { for: "u-src" }, "원본 촬영 시각 보존 (없으면 미수집)"))),
      actions: [{ label: "취소" }, { label: "업로드 시작", primary: true, fn: () => {
        const target = ins || PV.inspections["INS-2026-034"];
        target.imageSrc = "보유 RGB 자료 (업로드)"; target.uploadOnly = true; target.source = "사용자 입력";
        if (!target.site) target.site = siteSel.value;
        PV.toast("업로드 수신 완료");
        PV.go("drone", { id: target.id, step: 1 }); } }] });
  }

  function renderLog(ins) {
    const rows = PV.sim.state.log.filter((l) => l.target === ins.id);
    const body = PV.h("div", { class: "body" });
    const card = PV.h("div", { class: "card", style: { flex: 1 } });
    card.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "실행 기록"), PV.h("span", { class: "muted" }, `RUN-${String(PV.sim.state.runId).padStart(2, "0")} · 원천 시각과 재생 시각 구분`)));
    const logEl = PV.h("div", { class: "card__body log" });
    const draw = () => { const r = PV.sim.state.log.filter((l) => l.target === ins.id); logEl.innerHTML = ""; if (!r.length) logEl.append(PV.h("div", { class: "muted", style: { display: "block", border: 0 } }, "아직 처리된 이벤트가 없습니다. 촬영 단계에서 시뮬레이션을 시작하세요.")); r.forEach((l) => logEl.append(PV.h("div", { class: l.ignored ? "ignored" : null }, PV.h("span", { class: "t" }, l.t), PV.h("span", { class: "k" }, l.type), PV.h("span", null, l.ignored ? `${l.id} · ${l.ignored}` : l.id)))); };
    draw(); ctx.live(draw);
    card.append(logEl);
    body.append(card);
    page.append(body, PV.h("footer", { class: "bar" }, PV.h("span", { class: "bar__info" }, `${rows.length}건`), PV.h("div", { class: "bar__actions" }, PV.h("button", { class: "btn", onClick: () => PV.go("sim") }, "시뮬레이션 제어"))));
  }
};
