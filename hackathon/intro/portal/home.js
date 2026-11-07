/* SCR-01 홈·대시보드 */
window.PV = window.PV || {};

/* 공통: 업무 목록 (역할·발전소 범위) */
PV.visibleTasks = function (ctx) {
  return PV.tasks.filter((t) => t.roles.includes(ctx.role) && ctx.sites.includes(t.site));
};
PV.isOverdue = (t) => t.due && t.due.startsWith(PV.TODAY) && (parseInt(t.due.slice(11, 13), 10) * 60 + parseInt(t.due.slice(14, 16), 10)) < PV.sim.state.clockMin && t.stage !== "종료";
PV.openTask = function (t) {
  if (!t.link) { PV.go("inbox", { task: t.id }); return; }
  const p = { id: t.link.id };
  if (t.link.screen === "panels") { p.round = t.link.id; p.site = t.site; }
  PV.go(t.link.screen, p);
};

/* 점검 요청 양식 (11.1): 대상·목적 → 현장 일정·확인 */
PV.forms = PV.forms || {};
PV.forms.inspectionRequest = function (ctx) {
  const draft = PV.app.drafts.inspection || { site: ctx.site || "", purpose: "정기 외관 점검", from: "2026-11-12", to: "2026-11-14", note: "" };
  PV.app.drafts.inspection = draft;
  let step = 1;
  const body = PV.h("div", { class: "stack" });
  const dlg = PV.dialog({ title: "점검 요청", body, actions: [
    { label: "취소", fn: () => { delete PV.app.drafts.inspection; } },
    { label: "다음", primary: true, fn: () => {
      if (step === 1) {
        const err = !draft.site ? "발전소를 선택하세요" : null;
        if (err) { render(err); return false; }
        step = 2; render(); dlg.querySelector(".modal__foot .btn--primary").textContent = "요청 제출"; return false;
      }
      if (draft.to < draft.from) { render("종료일이 시작일보다 앞섭니다"); return false; }
      const id = `INS-2026-0${35 + Object.keys(PV.inspections).length - 4}`;
      PV.inspections[id] = { id, site: draft.site, round: (Object.values(PV.inspections).filter((i) => i.site === draft.site).length) + 1, purpose: draft.purpose, status: "자료 준비", stage: 1, assignee: null, reviewer: null, captureAt: null, analysisAt: null, imageSrc: null, files: { received: 0, analyzed: 0, failed: 0, missing: 0 }, source: "사용자 입력", wish: `${draft.from} ~ ${draft.to}`, note: draft.note };
      PV.tasks.unshift({ id: `T-${1044 + PV.tasks.length - 8}`, site: draft.site, title: `${PV.inspections[id].round}회차 점검 요청 · 담당 배정`, stage: "담당 배정", assignee: null, assigneeLabel: "미배정", next: "드론 수행자 배정 (인계 대상: 운영 담당자)", due: `${draft.from} 09:00`, approver: ctx.user.name, reviewer: "-", kind: "점검", link: { screen: "drone", id }, changes: [[PV.sim.fmtMin(PV.sim.state.clockMin), `${ctx.user.name} 점검 요청 제출`]], roles: ["owner", "epc", "drone", "master"] });
      delete PV.app.drafts.inspection;
      PV.toast(`점검 요청 ${id}이 접수되었습니다. 담당 배정을 기다립니다.`, { label: "점검 열기", fn: () => PV.go("drone", { id }) });
      ctx.rerender();
    } }
  ] });
  function render(err) {
    body.innerHTML = "";
    body.append(PV.stepper(["대상·목적", "현장 일정·확인"], step));
    if (step === 1) {
      const siteSel = PV.h("select", { class: "select", id: "f-site", onChange: (e) => { draft.site = e.target.value; } }, PV.h("option", { value: "" }, "발전소 선택"), ...PV.allowedSites().map((s) => PV.h("option", { value: s }, PV.sites[s].name)));
      siteSel.value = draft.site;
      const purpose = PV.h("select", { class: "select", id: "f-purpose", onChange: (e) => { draft.purpose = e.target.value; } }, ...["정기 외관 점검", "준공 후 첫 점검", "작업 후 확인 점검", "민원·이상 신고 확인"].map((p) => PV.h("option", null, p)));
      purpose.value = draft.purpose;
      body.append(PV.h("div", { class: "form-grid" },
        PV.h("div", { class: "field" }, PV.h("label", { for: "f-site" }, "발전소 (필수)"), siteSel, err ? PV.h("span", { class: "error" }, PV.icon("alert"), err) : null),
        PV.h("div", { class: "field" }, PV.h("label", { for: "f-purpose" }, "점검 목적 (필수)"), purpose),
        PV.h("div", { class: "field span2" }, PV.h("label", null, "요청자"), PV.h("div", { class: "input", style: { display: "flex", alignItems: "center", background: "var(--surface-2)" } }, `${ctx.user.name} · ${PV.orgs[ctx.user.org].name}`))));
    } else {
      body.append(PV.h("div", { class: "form-grid" },
        PV.h("div", { class: "field" }, PV.h("label", { for: "f-from" }, "희망 시작일 (KST)"), PV.h("input", { class: "input", type: "date", id: "f-from", value: draft.from, onChange: (e) => { draft.from = e.target.value; } })),
        PV.h("div", { class: "field" }, PV.h("label", { for: "f-to" }, "희망 종료일 (KST)"), PV.h("input", { class: "input", type: "date", id: "f-to", value: draft.to, "aria-invalid": err ? "true" : null, onChange: (e) => { draft.to = e.target.value; } }), err ? PV.h("span", { class: "error" }, PV.icon("alert"), err) : null),
        PV.h("div", { class: "field span2" }, PV.h("label", { for: "f-note" }, "현장 전달사항"), PV.h("textarea", { class: "textarea", id: "f-note", placeholder: "진입 경로, 출입 연락, 주의 구역 등", onInput: (e) => { draft.note = e.target.value; } }, draft.note))),
        PV.kv([["발전소", PV.sites[draft.site].name], ["목적", draft.purpose], ["요청자", ctx.user.name]]));
    }
  }
  render();
};

PV.screens.home = function (page, ctx) {
  const st = ctx.state;
  st.tab = st.tab || "sites";
  st.filter = st.filter || "mine";
  st.page = st.page || 1;
  const canPower = ["owner", "epc", "regional", "master"].includes(ctx.role);
  if (!canPower) st.tab = "tasks";

  const tabsEl = canPower ? PV.tabs([{ key: "sites", label: "발전소 현황" }, { key: "tasks", label: "업무 현황" }, { key: "power", label: "발전 현황" }], st.tab, (k) => { st.tab = k; ctx.rerender(); }, "tabs--plain") : null;
  const homeLabel = (ctx.def.menuLabels && ctx.def.menuLabels.home) || "홈";
  page.append(PV.titleBar(homeLabel, PV.siteLabel(ctx.site), [PV.newResultsChip(ctx), tabsEl]));

  if (st.tab === "sites") PV.renderFleet(page, ctx); else if (st.tab === "tasks") renderTasks(); else renderPower();

  /* ---------- 업무 현황 ---------- */
  function renderTasks() {
    const all = PV.visibleTasks(ctx);
    const open = all.filter((t) => t.stage !== "종료");
    const mine = open.filter((t) => t.assignee === ctx.role || (ctx.role === "master" && (!t.assignee || PV.isOverdue(t))));
    const waiting = open.filter((t) => t.assignee && t.assignee !== ctx.role);
    const today = open.filter((t) => t.due && t.due.startsWith(PV.TODAY));
    const review = open.filter((t) => t.stage === "검수 대기");
    const filters = {
      mine: { label: ctx.role === "master" ? "예외 업무 (미배정·기한 초과)" : ctx.role === "regional" ? "조치 요청·응답 추적" : "내 처리 대기", rows: mine },
      waiting: { label: "상대 응답 대기", rows: waiting },
      today: { label: "오늘 예정", rows: today },
      review: { label: "검수 대기", rows: review },
      all: { label: "전체 진행 업무", rows: open }
    };
    const stripKeys = ctx.role === "regional" ? ["mine", "waiting", "all"] : ["mine", "waiting", "today", "review"];
    const rows = (filters[st.filter] || filters.mine).rows;
    if (st.selected && !rows.find((t) => t.id === st.selected)) st.selected = rows[0]?.id || null;
    if (!st.selected && rows.length) st.selected = rows[0].id;
    const sel = PV.tasks.find((t) => t.id === st.selected);

    const body = PV.h("div", { class: "body body--split has-strip", "data-focus": st.focus || "list" });
    body.append(PV.h("div", { class: "strip" }, ...stripKeys.map((k) => PV.stat({ label: filters[k].label, value: filters[k].rows.length, unit: "건", pressed: st.filter === k, onClick: () => { st.filter = k; st.page = 1; st.selected = null; ctx.rerender(); } }))));

    const listCard = PV.h("div", { class: "card pane pane--list" });
    listCard.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, filters[st.filter].label), PV.h("span", { class: "muted" }, `${rows.length}건`)));
    const tbl = PV.table({
      columns: [
        { label: "발전소", render: (t) => PV.sites[t.site].name, width: "130px" },
        { label: "업무", primary: true, render: (t) => PV.h("span", null, t.title, PV.h("span", { class: "sub mono" }, t.id)) },
        { label: "단계", render: (t) => PV.badge(t.stage, t.stage === "검수 대기" ? "action" : null) },
        { label: "담당자", render: (t) => t.assigneeLabel },
        { label: "기한", render: (t) => t.due ? PV.h("span", { class: PV.isOverdue(t) ? "badge badge--outline-dmg" : "mono" }, PV.isOverdue(t) ? [PV.icon("clock"), t.due.slice(5)] : t.due.slice(5)) : PV.h("span", { class: "muted" }, "기한 없음") }
      ],
      rows, rowKey: (t) => t.id, selected: st.selected, page: st.page, pageSize: 6,
      onSelect: (t) => { st.selected = t.id; st.focus = "detail"; ctx.rerender(); }, onPage: (p) => { st.page = p; ctx.rerender(); },
      emptyText: { title: "처리할 업무가 없습니다", desc: "새 점검이 필요하면 아래에서 점검을 요청하세요." }
    });
    listCard.append(tbl.wrap, PV.h("div", { class: "card__foot" }, tbl.pager));

    const detail = PV.h("div", { class: "card pane pane--detail" });
    if (sel) {
      detail.append(PV.h("div", { class: "card__head" }, PV.h("button", { class: "btn btn--sm back-to-list", onClick: () => { st.focus = "list"; ctx.rerender(); } }, PV.icon("chevronLeft"), "목록"), PV.h("h2", null, "업무 상세"), PV.h("span", { class: "mono muted" }, sel.id)));
      detail.append(PV.h("div", { class: "card__body stack" },
        PV.h("div", null, PV.h("div", { class: "section-title" }, sel.title), PV.h("div", { class: "small muted" }, `${PV.sites[sel.site].name} · ${sel.kind} · ${sel.stage}`)),
        PV.whoBox(sel.assigneeLabel, sel.next, sel.approver, sel.reviewer),
        PV.isOverdue(sel) ? PV.note(`기한 경과 (${sel.due.slice(5)}) · 재지정 또는 인계 필요`, "warn", "clock") : null,
        !sel.assignee && sel.stage !== "종료" ? PV.note("미배정 · 담당자 지정 필요", "warn") : null,
        PV.h("div", null, PV.h("div", { class: "section-title", style: { marginBottom: "6px" } }, "최근 변경"), PV.h("div", { class: "rows" }, ...sel.changes.map(([t, c]) => PV.h("div", { class: "row", style: { padding: "6px 0", gridTemplateColumns: "auto 1fr" } }, PV.h("span", { class: "mono muted" }, t), PV.h("span", { class: "small" }, c))))),
        sel.due ? PV.kv([["기한", sel.due], ["업무 ID", PV.h("span", { class: "mono" }, sel.id)]]) : null));
    } else {
      detail.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "업무 상세")), PV.h("div", { class: "empty" }, PV.h("h3", null, "업무를 선택하세요")));
    }
    body.append(listCard, detail);
    if (ctx.role === "regional") body.append(PV.h("div", { style: { gridColumn: "1 / -1" } }, PV.note("집계 범위: 역할에 허용된 발전소와 현재 발전소 선택 기준")));
    page.append(body);

    const canAssign = ["epc", "master"].includes(ctx.role);
    const canRequest = ["owner", "epc", "master"].includes(ctx.role);
    page.append(PV.h("footer", { class: "bar" },
      PV.h("span", { class: "bar__info" }, sel ? `선택: ${sel.id} · ${sel.title}` : "선택된 업무 없음"),
      PV.h("div", { class: "bar__actions" },
        canRequest ? PV.h("button", { class: "btn", onClick: () => PV.forms.inspectionRequest(ctx) }, PV.icon("drone"), "점검 요청") : null,
        canAssign ? PV.h("button", { class: "btn", disabled: !sel || sel.stage === "종료", onClick: () => assignDialog(sel) }, PV.icon("user"), "담당자 배정") : null,
        PV.h("button", { class: "btn btn--primary", disabled: !sel, onClick: () => PV.openTask(sel) }, "업무 처리", PV.icon("arrowRight")))));
  }

  function assignDialog(t) {
    const cands = t.kind === "점검" ? [["drone", "최민재 (스카이뷰드론)"]] : [["epc", "박준호 (대한그린시공)"], ["owner", "김서연 (한빛솔라)"], ["maint", "정우성 (태양정비)"]];
    const sel = PV.h("select", { class: "select" }, ...cands.map(([k, l]) => PV.h("option", { value: k }, l)));
    PV.dialog({ title: `담당자 배정 · ${t.id}`, body: PV.h("div", { class: "stack" }, PV.kv([["업무", t.title], ["발전소", PV.sites[t.site].name], ["현재 담당", t.assigneeLabel]]), PV.h("div", { class: "field" }, PV.h("label", null, "새 담당자"), sel), PV.h("div", { class: "field" }, PV.h("label", null, "변경 사유"), PV.h("input", { class: "input", placeholder: "예: 승인자 부재로 재지정" }))),
      actions: [{ label: "취소" }, { label: "배정", primary: true, fn: () => {
        t.assignee = sel.value; t.assigneeLabel = sel.options[sel.selectedIndex].text; t.stage = t.stage === "담당 배정" ? "진행" : t.stage;
        t.next = t.kind === "점검" ? "전경 자료 등록 후 탐지 실행" : t.next;
        t.changes.unshift([PV.sim.fmtMin(PV.sim.state.clockMin), `${ctx.user.name}이(가) 담당자를 ${t.assigneeLabel}로 지정`]);
        if (t.link?.screen === "drone" && PV.inspections[t.link.id]) PV.inspections[t.link.id].assignee = sel.value;
        PV.toast(`${t.id} 담당자가 ${t.assigneeLabel}로 지정되었습니다.`); ctx.rerender(); } }] });
  }

  /* ---------- 발전 현황 ---------- */
  function renderPower() {
    const siteId = ctx.site || "S1";
    const site = PV.sites[siteId];
    st.cmp = PV.cmpBase[st.cmp] ? st.cmp : "lastyear";
    const body = PV.h("div", { class: "body body--split has-strip" });
    body.style.gridTemplateColumns = "minmax(520px, 70fr) minmax(300px, 30fr)";

    if (site.power !== "sim") {
      const stale = site.power === "stale";
      body.classList.remove("body--split", "has-strip");
      body.append(PV.h("div", { class: "card", style: { flex: 1 } }, PV.h("div", { class: "card__head" }, PV.h("h2", null, "발전 현황")),
        PV.h("div", { class: "empty" }, PV.h("h3", null, stale ? "전력 수신이 중단되었습니다" : "발전 자료가 연동되지 않았습니다"),
          PV.h("p", null, stale ? "마지막 수신 2026-11-07 08:20 · 24.6 kW. 0 발전으로 처리하지 않습니다." : "계측 지점 미등록 · 미수집"),
          PV.h("div", { class: "hstack" }, stale ? PV.badge("수신 중단", "und", "clock") : PV.badge("미연동", "und")))));
      page.append(body, PV.h("footer", { class: "bar" }, PV.h("span", { class: "bar__info" }, site.name), PV.h("div", { class: "bar__actions" }, PV.h("button", { class: "btn", onClick: () => PV.go("panels", { site: siteId }) }, "패널 상태 보기"), PV.h("button", { class: "btn btn--primary", onClick: () => PV.forms.inspectionRequest(ctx) }, "점검 요청"))));
      return;
    }

    const strip = PV.h("div", { class: "strip" });
    const chartCard = PV.h("div", { class: "card pane pane--list" });
    const side = PV.h("div", { class: "card pane pane--detail" });
    body.append(strip, chartCard, side);
    page.append(body);

    const draw = () => {
      const today = PV.sim.powerToday(siteId);
      const base = PV.cmpBase[st.cmp];
      const cmpAll = PV.powerSeries(siteId, st.cmp);
      const nowMin = PV.sim.state.clockMin;
      const last = today[today.length - 1];
      const e = PV.energyKwh(today);
      const cmpSame = cmpAll.filter((s) => s.t <= nowMin);
      const eCmp = PV.energyKwh(cmpSame);
      const delta = eCmp.kwh > 0 ? ((e.kwh - eCmp.kwh) / eCmp.kwh) * 100 : null;
      const staleMin = last ? nowMin - last.t : null;
      const gapNow = staleMin !== null && staleMin > 10;

      strip.innerHTML = "";
      strip.append(
        PV.stat({ label: "현재 발전전력", value: last ? PV.fmtNum(last.kw) : "—", unit: "kW", hero: true, sub: last ? `${PV.sim.fmtMin(last.t)} 표본${gapNow ? " · 수신 지연" : ""}` : "유효 표본 없음" }),
        PV.stat({ label: "오늘 발전량", value: PV.fmtNum(e.kwh), unit: "kWh", sub: e.gaps ? `누락 ${e.gaps}구간 제외` : (site.demo ? "06:35 ~ 현재" : "06:40 ~ 현재") }),
        PV.stat({ label: `${base.short} 평균 대비 (관측 증감)`, value: delta === null ? "미산출" : `${delta >= 0 ? "+" : ""}${PV.fmtNum(delta)}`, unit: delta === null ? "" : "%", sub: `기준 ${PV.fmtNum(eCmp.kwh)} kWh` }),
        PV.stat({ label: "정격용량", value: PV.fmtNum(site.capacityKw), unit: "kW", sub: `패널 ${PV.panelsOf(siteId).length}개` }));

      chartCard.innerHTML = "";
      const seg = PV.h("div", { class: "seg", role: "group", "aria-label": "비교선" },
        ...Object.values(PV.cmpBase).map((b) => PV.h("button", { "aria-pressed": String(st.cmp === b.key), onClick: () => { st.cmp = b.key; draw(); } }, b.label)));
      chartCard.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "발전전력 추이"), PV.h("span", { class: "muted" }, "kW · 오늘 5분 표본 · 비교선은 일평균 곡선"),
        PV.h("div", { class: "card__tools" }, PV.h("div", { class: "legend" }, PV.h("span", null, PV.h("i"), "오늘"), PV.h("span", null, PV.h("i", { class: "cmp" }), base.legend)), seg)));
      const chartBody = PV.h("div", { class: "card__body card__body--flush", style: { display: "flex", flexDirection: "column" } });
      chartCard.append(chartBody);
      chartBody.append(PV.lineChart({ main: today, cmp: cmpAll, nowMin, gaps: findGaps(today) }));
      chartCard.append(PV.h("div", { class: "card__foot" }, PV.badge("출처: 원천 로그 재생 (더미)", "src"), PV.h("span", null, "결측 구간은 적분·표시에서 제외")));

      side.innerHTML = "";
      const level = PV.levelOf(delta);
      const lm = PV.levelMeta[level];
      const canReq = ["owner", "epc", "master"].includes(ctx.role);
      const days = [...((PV.dailyDelta[siteId] || {})[st.cmp] || []), ["오늘", delta]];
      const gauge = PV.h("div", { class: "level", "data-level": level, role: "img", "aria-label": `점검 필요도 ${lm.label}` },
        ...["ok", "watch", "inspect"].map((k) => PV.h("div", { class: "level__seg", "data-k": k, "aria-current": k === level ? "true" : null }, PV.icon(PV.levelMeta[k].icon), PV.h("span", null, PV.levelMeta[k].label))));
      const trend = PV.h("div", { class: "trend", role: "img", "aria-label": `최근 7일 ${base.short} 평균 대비 증감` },
        ...days.map(([d, v]) => { const k = PV.levelOf(v); const h = v === null ? 0 : Math.min(100, Math.abs(v) * 3); return PV.h("div", { class: "trend__col", "data-k": k, title: `${d} ${v === null ? "미산출" : PV.fmtNum(v) + "%"}` }, PV.h("div", { class: "trend__bar" }, PV.h("i", { style: { height: `${h}%` } })), PV.h("span", { class: "trend__lbl" }, d === "오늘" ? d : d.slice(3))); }));
      side.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "패널 점검 필요도"), PV.h("div", { class: "card__tools" }, PV.badge(lm.label, level === "inspect" ? "dmg" : level === "watch" ? "soil" : level === "ok" ? "ok" : "und", lm.icon))),
        PV.h("div", { class: "card__body stack" },
          gauge,
          site.demo ? PV.note(`더미 시나리오 · ${site.demoCase.story}`) : null,
          PV.h("div", { class: "level__value" }, PV.h("b", null, delta === null ? "미산출" : `${delta >= 0 ? "+" : ""}${PV.fmtNum(delta)}%`), PV.h("span", { class: "muted" }, ` ${base.short} 평균 같은 시간대 대비 발전량`)),
          PV.h("div", { class: "divider" }),
          PV.h("div", { class: "section-title" }, `최근 7일 · ${base.short} 평균 대비`),
          trend,
          PV.h("div", { class: "divider" }),
          PV.h("p", { class: "small muted" }, `정상 ${PV.levelRule.watch}% 이상 · 유의 ${PV.levelRule.watch}~${PV.levelRule.inspect}% · 점검 ${PV.levelRule.inspect}% 미만 · 관측 증감, 원인 미확정`),
          level === "inspect" && canReq ? PV.h("button", { class: "btn btn--primary", onClick: () => PV.forms.inspectionRequest(ctx) }, PV.icon("drone"), "점검 요청") : level === "watch" ? PV.note("감소 추세 · 다음 비교 시 점검 단계 전환 가능", "warn") : null));
    };
    draw();
    ctx.live(() => { if (st.tab === "power") draw(); });

    page.append(PV.h("footer", { class: "bar" }, PV.h("span", { class: "bar__info" }, site.name),
      PV.h("div", { class: "bar__actions" }, PV.h("button", { class: "btn", onClick: () => PV.go("panels", { site: siteId }) }, "패널 상태 보기"), ["owner", "epc", "master"].includes(ctx.role) ? PV.h("button", { class: "btn btn--primary", onClick: () => PV.forms.inspectionRequest(ctx) }, "점검 요청") : null)));
  }
  function findGaps(series) { const g = []; for (let i = 1; i < series.length; i++) if (series[i].t - series[i - 1].t > 10) g.push({ from: series[i - 1].t, to: series[i].t }); return g; }
};

/* 라인 차트 (SVG) — 한 축, 결측은 선 끊김, 호버 크로스헤어 */
PV.lineChart = function ({ main, cmp, nowMin, gaps }) {
  const wrap = PV.h("div", { class: "chart", role: "img", "aria-label": "오늘과 비교 기간의 발전전력 추이" });
  const W = 800, H = 300, L = 44, R = 16, T = 16, B = 30;
  const x0 = 6 * 60 + 30, x1 = 17 * 60 + 30;
  const yMax = Math.ceil(Math.max(90, ...main.map((s) => s.kw), ...cmp.map((s) => s.kw)) / 20) * 20;
  const X = (t) => L + ((t - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - v / yMax) * (H - T - B);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("preserveAspectRatio", "none");
  let g = `<g class="grid">`;
  for (let v = 0; v <= yMax; v += 20) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/>`;
  g += `</g><g class="axis">`;
  for (let v = 0; v <= yMax; v += 20) g += `<text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end">${v}</text>`;
  for (let h = 7; h <= 17; h += 2) g += `<text x="${X(h * 60)}" y="${H - 8}" text-anchor="middle">${String(h).padStart(2, "0")}:00</text>`;
  g += `<line x1="${L}" x2="${W - R}" y1="${Y(0)}" y2="${Y(0)}"/></g>`;
  gaps.forEach((gp) => { g += `<rect class="gap-rect" x="${X(gp.from)}" y="${T}" width="${X(gp.to) - X(gp.from)}" height="${H - T - B}"/><text class="gap-text" x="${(X(gp.from) + X(gp.to)) / 2}" y="${T + 14}" text-anchor="middle">결측</text>`; });
  const path = (s, gapBreak) => { let d = ""; s.forEach((p, i) => { const brk = i === 0 || (gapBreak && p.t - s[i - 1].t > 10); d += `${brk ? "M" : "L"}${X(p.t).toFixed(1)} ${Y(p.kw).toFixed(1)} `; }); return d; };
  g += `<path class="s-cmp" d="${path(cmp, false)}"/>`;
  g += `<path class="s-main" d="${path(main, true)}"/>`;
  if (main.length) { const l = main[main.length - 1]; g += `<circle class="dot" cx="${X(l.t)}" cy="${Y(l.kw)}" r="4"/>`; }
  g += `<line class="cross" x1="${X(nowMin)}" x2="${X(nowMin)}" y1="${T}" y2="${H - B}" opacity=".5"/><text class="gap-text" x="${X(nowMin) + 4}" y="${H - B - 4}">현재 ${PV.sim.fmtMin(nowMin)}</text>`;
  g += `<g id="hover" style="display:none"><line class="cross" y1="${T}" y2="${H - B}"/><circle class="dot" r="4"/><circle class="dot dot--cmp" r="4"/></g>`;
  svg.innerHTML = g;
  wrap.append(svg);
  const tip = PV.h("div", { class: "tip", style: { display: "none" } });
  wrap.append(tip);
  const nearest = (s, t) => { let b = null; for (const p of s) if (Math.abs(p.t - t) <= 2.5 && (!b || Math.abs(p.t - t) < Math.abs(b.t - t))) b = p; return b; };
  svg.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const t = Math.round((x0 + ((px - L) / (W - L - R)) * (x1 - x0)) / 5) * 5;
    const hv = svg.querySelector("#hover");
    if (t < x0 || t > x1) { hv.style.display = "none"; tip.style.display = "none"; return; }
    const a = nearest(main, t), c = nearest(cmp, t);
    hv.style.display = "";
    hv.querySelector("line").setAttribute("x1", X(t)); hv.querySelector("line").setAttribute("x2", X(t));
    const [da, dc] = hv.querySelectorAll("circle");
    if (a) { da.style.display = ""; da.setAttribute("cx", X(a.t)); da.setAttribute("cy", Y(a.kw)); } else da.style.display = "none";
    if (c) { dc.style.display = ""; dc.setAttribute("cx", X(c.t)); dc.setAttribute("cy", Y(c.kw)); } else dc.style.display = "none";
    tip.style.display = ""; tip.style.left = `${(X(t) / W) * r.width}px`; tip.style.top = `${(Y(a ? a.kw : (c ? c.kw : 0)) / H) * r.height}px`;
    tip.innerHTML = `<b>${PV.sim.fmtMin(t)}</b><br>오늘 ${a ? PV.fmtNum(a.kw) + " kW" : (t > nowMin ? "미수신" : "결측")}<br>기준 ${c ? PV.fmtNum(c.kw) + " kW" : "-"}`;
  });
  svg.addEventListener("pointerleave", () => { svg.querySelector("#hover").style.display = "none"; tip.style.display = "none"; });
  return wrap;
};
