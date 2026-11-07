/* SCR-03 패널 상태 */
window.PV = window.PV || {};

PV.roundsOf = (siteId) => Object.values(PV.inspections).filter((i) => i.site === siteId && PV.observations[i.id]).sort((a, b) => b.round - a.round);

PV.screens.panels = function (page, ctx) {
  const st = ctx.state;
  const siteId = ctx.params.site || st.site || ctx.site || ctx.sites[0];
  st.site = siteId;
  const site = PV.sites[siteId];
  const rounds = PV.roundsOf(siteId);
  const roundId = (ctx.params.round && PV.observations[ctx.params.round] && PV.inspections[ctx.params.round].site === siteId) ? ctx.params.round : (st.round && PV.inspections[st.round]?.site === siteId ? st.round : rounds[0]?.id);
  st.round = roundId;
  st.view = st.view || "map";
  st.filter = st.filter || "all";
  st.review = st.review || "all";
  st.zone = st.zone || "all";
  st.tab = st.tab || "evidence";
  st.page = st.page || 1;
  st.checked = st.checked || new Set();
  const canReview = ["epc", "master"].includes(ctx.role);
  const canRequest = ["owner", "epc", "master"].includes(ctx.role);
  const readOnly = ["drone", "maint", "total", "regional"].includes(ctx.role);

  const siteSel = PV.h("select", { class: "ctx-select", "aria-label": "발전소", onChange: (e) => { st.checked = new Set(); st.selected = null; PV.go("panels", { site: e.target.value }); } }, ...PV.allowedSites().map((s) => PV.h("option", { value: s }, PV.sites[s].name)));
  siteSel.value = siteId;
  const roundSel = PV.h("select", { class: "ctx-select", "aria-label": "점검 회차", disabled: !rounds.length, onChange: (e) => { st.checked = new Set(); st.selected = null; PV.go("panels", { site: siteId, round: e.target.value }); } }, ...(rounds.length ? rounds.map((r) => PV.h("option", { value: r.id }, `${r.round}회차 · 촬영 ${r.captureAt.slice(0, 10)}`)) : [PV.h("option", null, "회차 없음")]));
  if (roundId) roundSel.value = roundId;
  page.append(PV.titleBar("패널 상태", roundId ? `${PV.inspections[roundId].id} · 분석 ${PV.inspections[roundId].analysisAt}` : site.name, [PV.newResultsChip(ctx), siteSel, roundSel]));

  /* 빈 상태 */
  if (!site.zones.length) return emptyState("패널 등록정보가 없습니다", "설치자료·구역·영구 패널 ID를 먼저 등록해야 분석 결과를 패널에 연결할 수 있습니다.", [PV.h("button", { class: "btn btn--primary", onClick: () => PV.go("settings", { group: "발전소·패널" }) }, "기준정보 등록")]);
  if (!roundId) {
    const running = Object.values(PV.inspections).find((i) => i.site === siteId && i.status !== "종료");
    return emptyState("분석 결과가 있는 점검 회차가 없습니다", running ? `${running.id}(${running.status}) 진행 중입니다. 자료 인계가 끝나면 이 화면에서 판정을 확인할 수 있습니다.` : "점검을 요청하면 촬영·분석 후 판정이 표시됩니다.", [running ? PV.h("button", { class: "btn btn--primary", onClick: () => PV.go("drone", { id: running.id }) }, "진행 중 점검 열기") : PV.h("button", { class: "btn btn--primary", onClick: () => PV.forms.inspectionRequest(ctx) }, "점검 요청")]);
  }

  const ins = PV.inspections[roundId];
  const obs = PV.observations[roundId];
  const panels = PV.panelsOf(siteId).map((p) => ({ ...p, o: obs[p.id] || { j: "ok", review: "미검토", auto: true } }));
  const counts = { all: panels.length, ok: 0, soil: 0, dmg: 0, und: 0, unreviewed: 0 };
  panels.forEach((p) => { counts[p.o.j]++; if (!p.o.auto && p.o.review === "미검토") counts.unreviewed++; });
  const judged = panels.length - counts.und;
  const filtered = panels.filter((p) => (st.filter === "all" || p.o.j === st.filter) && (st.review === "all" || (st.review === "unreviewed" ? (!p.o.auto && p.o.review === "미검토") : p.o.review === st.review)) && (st.zone === "all" || p.zone === st.zone));
  if (st.selected && !panels.find((p) => p.id === st.selected)) st.selected = null;
  const selP = panels.find((p) => p.id === st.selected);

  const body = PV.h("div", { class: "body body--split has-strip", "data-focus": st.focus || "list" });
  // 도구 띠: 필터
  const chips = PV.h("div", { class: "hstack", style: { justifyContent: "space-between" } },
    PV.h("div", { class: "chips", role: "group", "aria-label": "판정 필터" },
      ...[["all", `전체 ${counts.all}`], ["soil", `오염 ${counts.soil}`], ["dmg", `파손 ${counts.dmg}`], ["und", `미판정 ${counts.und}`], ["ok", `외관 정상 ${counts.ok}`]].map(([k, l]) => PV.h("button", { class: "chip", "aria-pressed": String(st.filter === k), onClick: () => { st.filter = k; st.page = 1; ctx.rerender(); } }, l)),
      PV.h("button", { class: "chip", "aria-pressed": String(st.review === "unreviewed"), onClick: () => { st.review = st.review === "unreviewed" ? "all" : "unreviewed"; st.page = 1; ctx.rerender(); } }, PV.icon("user"), `검토 대기 ${counts.unreviewed}`),
      PV.h("select", { class: "ctx-select", style: { height: "28px" }, "aria-label": "구역", onChange: (e) => { st.zone = e.target.value; st.page = 1; ctx.rerender(); } }, PV.h("option", { value: "all" }, "모든 구역"), ...site.zones.map((z) => PV.h("option", { value: z, selected: st.zone === z }, `${z} 구역`)))),
    PV.h("div", { class: "hstack" },
      PV.h("div", { class: "seg", role: "group", "aria-label": "보기" }, PV.h("button", { "aria-pressed": String(st.view === "map"), onClick: () => { st.view = "map"; ctx.rerender(); } }, PV.icon("grid"), "배치도"), PV.h("button", { "aria-pressed": String(st.view === "list"), onClick: () => { st.view = "list"; ctx.rerender(); } }, PV.icon("list"), "목록")),
      PV.srcBadge(ins.source)));
  body.append(chips);

  const left = PV.h("div", { class: "card pane pane--list" });
  const summary = `등록 ${panels.length} · 판정 ${judged} (${((judged / panels.length) * 100).toFixed(1)}%) · 오염 비율 ${judged ? ((counts.soil / judged) * 100).toFixed(1) : "-"}%`;
  left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, st.view === "map" ? "패널 배치도" : "패널 목록"), PV.h("span", { class: "muted" }, summary), PV.h("div", { class: "card__tools" }, st.view === "map" && filtered.length !== panels.length ? PV.badge(`필터 ${filtered.length}개 강조`, "action") : null)));
  if (st.view === "map") {
    const fset = new Set(filtered.map((p) => p.id));
    const mapBody = PV.h("div", { class: "card__body", style: { display: "flex", padding: "10px" } });
    mapBody.append(PV.siteMap(siteId, { obs, selected: st.selected, checked: st.checked, dimFn: (p) => !fset.has(p.id), onPick: (p, e) => { if (e.ctrlKey || e.metaKey || e.shiftKey) toggleCheck(p.id); else { st.selected = p.id; st.focus = "detail"; } ctx.rerender(); } }));
    left.append(mapBody, PV.h("div", { class: "card__foot" }, PV.h("span", null, "Ctrl+클릭: 작업 대상 선택 · 목록 보기에서는 체크박스")));
  } else {
    const tbl = PV.table({ columns: [
      { label: "패널 ID", render: (p) => PV.h("span", { class: "mono" }, p.id), width: "90px" },
      { label: "구역", render: (p) => `${p.zone} 구역 ${p.row}행 ${p.col}열` },
      { label: "판정", render: (p) => PV.judgBadge(p.o.j) },
      { label: "세부", render: (p) => p.o.soil || p.o.pos || p.o.reason || (p.o.ai ? `AI ${PV.judgLabel[p.o.ai]} → 수정` : "-") },
      { label: "검토", render: (p) => p.o.auto ? PV.h("span", { class: "muted" }, "자동 (정상)") : PV.badge(p.o.review, p.o.review === "미검토" ? "action" : null) },
      { label: "작업", render: (p) => p.o.work ? PV.badge(p.o.work) : PV.h("span", { class: "muted" }, "-") }
    ], rows: filtered, rowKey: (p) => p.id, selected: st.selected, page: st.page, pageSize: 7, checks: true, checkedSet: st.checked, onCheck: (p, on) => { if (on) st.checked.add(p.id); else st.checked.delete(p.id); ctx.rerender(); }, onSelect: (p) => { st.selected = p.id; st.focus = "detail"; ctx.rerender(); }, onPage: (p) => { st.page = p; ctx.rerender(); }, emptyText: { title: "현재 필터에 해당하는 패널이 없습니다", desc: "필터를 초기화하면 전체 패널이 표시됩니다." } });
    left.append(tbl.wrap, PV.h("div", { class: "card__foot" }, tbl.pager, PV.h("button", { class: "btn btn--sm", onClick: () => { filtered.slice((st.page - 1) * 7, st.page * 7).forEach((p) => st.checked.add(p.id)); ctx.rerender(); } }, "현재 페이지 선택"), PV.h("button", { class: "btn btn--sm", onClick: () => { filtered.forEach((p) => st.checked.add(p.id)); ctx.rerender(); } }, `필터 결과 전체 선택 (${filtered.length})`)));
  }

  /* 우측 상세 */
  const right = PV.h("div", { class: "card pane pane--detail" });
  if (!selP) {
    right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "회차 요약")),
      PV.h("div", { class: "card__body stack" },
        PV.h("div", { class: "strip strip--2 panel-summary-stats" },
          PV.stat({ label: "판정 완료율", value: ((judged / panels.length) * 100).toFixed(1), unit: "%", sub: `${judged} / ${panels.length}` }),
          PV.stat({ label: "오염 판정 비율", value: judged ? ((counts.soil / judged) * 100).toFixed(1) : "-", unit: "%", sub: `${counts.soil} / ${judged}` })),
        PV.kv([["외관 정상", `${counts.ok}개`], ["오염", `${counts.soil}개`], ["육안상 파손", `${counts.dmg}개`], ["미판정", `${counts.und}개 (촬영 누락·분석 실패)`], ["검토 대기", `${counts.unreviewed}건`], ["촬영 · 분석", `${ins.captureAt} · ${ins.analysisAt}`]]),
        PV.h("p", { class: "small muted" }, "외관 분류 결과 · 전기적 상태를 뜻하지 않음")));
  } else {
    const o = selP.o;
    right.append(PV.h("div", { class: "card__head" }, PV.h("button", { class: "btn btn--sm back-to-list", onClick: () => { st.focus = "list"; ctx.rerender(); } }, PV.icon("chevronLeft"), "배치도"), PV.h("h2", { class: "mono" }, selP.id), PV.h("span", { class: "muted" }, `${selP.zone} 구역 ${selP.row}행 ${selP.col}열`),
      PV.h("div", { class: "card__tools" }, PV.h("button", { class: "icon-btn", "aria-label": "선택 해제", onClick: () => { st.selected = null; ctx.rerender(); } }, PV.icon("x")))));
    right.append(PV.tabs([{ key: "evidence", label: "판정·근거" }, { key: "review", label: "검토·조치" }, { key: "history", label: "이력" }], st.tab, (k) => { st.tab = k; ctx.rerender(); }));
    const b = PV.h("div", { class: "card__body stack" });
    right.append(b);
    if (st.tab === "evidence") {
      b.append(PV.h("div", { class: "hstack" }, PV.judgBadge(o.j), o.review && !o.auto ? PV.badge(`검토: ${o.review}`) : null, o.work ? PV.badge(`작업: ${o.work}`) : null),
        PV.panelFrame(o, { label: o.j === "und" ? "원본 없음 · 시연 자료" : "원본 이미지 · 시연 자료" }),
        PV.h("div", { class: "hstack" }, PV.h("button", { class: "btn btn--sm", disabled: o.j === "und", onClick: () => PV.dialog({ title: `${selP.id} 원본 이미지`, body: PV.panelFrame(o, { label: "확대 보기 · 시연 자료" }), actions: [{ label: "닫기" }] }) }, PV.icon("fit"), "확대"), PV.h("button", { class: "btn btn--sm", onClick: () => { const i = panels.findIndex((p) => p.id === selP.id); st.selected = panels[(i + 1) % panels.length].id; ctx.rerender(); } }, "다음 패널", PV.icon("chevronRight"))),
        PV.kv([["촬영일", o.j === "und" && o.reason?.includes("촬영") ? "미수집" : ins.captureAt.slice(0, 10)], ["분석 ID", PV.h("span", { class: "mono" }, `AN-${roundId.slice(-3)}-${selP.id}`)], ["분류", PV.judgLabel[o.j]], ["오염 종류", o.soil || (o.aiSoil ? `AI ${o.aiSoil} (수정됨)` : "-")], ["파손 위치", o.pos || "-"], ["미판정 사유", o.reason && o.j === "und" ? o.reason : "-"], ["RGB–IR", "대응 미확인 · 나란히 보기 비활성"]]));
    } else if (st.tab === "review") {
      const reasonIn = PV.h("input", { class: "input", placeholder: "수정 사유 (필수)" });
      const newJ = PV.h("select", { class: "select" }, ...Object.entries(PV.judgLabel).filter(([k]) => k !== "und").map(([k, l]) => PV.h("option", { value: k, selected: k === o.j }, l)));
      b.append(PV.kv([["AI 원본", PV.judgLabel[o.ai || o.j]], ["현재 검토 결과", o.review === "수정됨" ? `${PV.judgLabel[o.j]} (수정)` : PV.judgLabel[o.j]], ["검토자·시각", o.reviewer ? `${o.reviewer} · ${o.reviewedAt}` : "미검토"], ["수정 사유", o.reason && o.review === "수정됨" ? o.reason : "-"], ["작업 상태", o.work || "요청 없음"]], true),
        canReview && !o.auto ? PV.h("div", { class: "stack" },
          PV.h("div", { class: "hstack" }, PV.h("button", { class: "btn btn--sm", disabled: o.review === "확인 완료", onClick: () => { o.review = "확인 완료"; o.reviewer = ctx.user.name; o.reviewedAt = `${PV.TODAY} ${PV.sim.fmtMin(PV.sim.state.clockMin)}`; PV.toast(`${selP.id} 검토 완료`); ctx.rerender(); } }, PV.icon("check"), "검토 완료")),
          PV.h("div", { class: "divider" }), PV.h("div", { class: "section-title" }, "판정 수정"),
          PV.h("div", { class: "field" }, PV.h("label", null, "새 판정"), newJ), PV.h("div", { class: "field" }, PV.h("label", null, "사유"), reasonIn),
          PV.h("button", { class: "btn btn--sm", onClick: () => { if (!reasonIn.value.trim()) { reasonIn.setAttribute("aria-invalid", "true"); reasonIn.focus(); return; } o.ai = o.ai || o.j; o.j = newJ.value; o.review = "수정됨"; o.reviewer = ctx.user.name; o.reviewedAt = `${PV.TODAY} ${PV.sim.fmtMin(PV.sim.state.clockMin)}`; o.reason = reasonIn.value.trim(); PV.toast(`${selP.id} 판정 수정 · 원본 보존`); ctx.rerender(); } }, "판정 수정 저장"))
          : o.auto ? PV.note("검토 대상 아님 (외관 정상)") : PV.note("검토 권한 없음 · 기술 검토자 박준호"),
        PV.h("div", { class: "divider" }),
        PV.h("button", { class: "btn btn--sm", "aria-pressed": String(st.checked.has(selP.id)), disabled: readOnly, onClick: () => { toggleCheck(selP.id); ctx.rerender(); } }, st.checked.has(selP.id) ? [PV.icon("check"), "작업 대상에서 제외"] : [PV.icon("plus"), "작업 대상으로 선택"]));
    } else {
      const hist = Object.values(PV.inspections).filter((i) => i.site === siteId && PV.observations[i.id]).sort((a, b) => a.round - b.round).map((i) => { const ob = PV.observations[i.id][selP.id] || { j: "ok" }; return [`${i.round}회차 · ${i.captureAt.slice(0, 10)}`, PV.h("span", { class: "hstack" }, PV.judgBadge(ob.j), ob.review === "수정됨" ? PV.badge("판정 수정") : null)]; });
      const works = Object.values(PV.workOrders).filter((w) => w.site === siteId && w.items.some((it) => it.id === selP.id || it.id === `${selP.zone}구역`)).map((w) => [w.id, `${w.service} · ${w.state} · ${w.schedule.slice(0, 10)}`]);
      b.append(PV.h("div", { class: "section-title" }, "회차별 관측"), PV.kv(hist, true), PV.h("div", { class: "divider" }), PV.h("div", { class: "section-title" }, "관련 작업"), works.length ? PV.kv(works.map(([k, v]) => [PV.h("button", { class: "link-btn mono", onClick: () => PV.go("work", { id: k }) }, k), v]), true) : PV.h("p", { class: "small muted" }, "관련 작업이 없습니다."));
    }
  }
  body.append(left, right);
  page.append(body);

  /* 하단 행동 */
  const n = st.checked.size;
  const checkedPanels = panels.filter((p) => st.checked.has(p.id));
  const kinds = new Set(checkedPanels.map((p) => p.o.j));
  page.append(PV.h("footer", { class: "bar" },
    PV.h("span", { class: "bar__info" }, n ? `작업 대상 ${n}개 선택 (오염 ${checkedPanels.filter((p) => p.o.j === "soil").length} · 파손 ${checkedPanels.filter((p) => p.o.j === "dmg").length} · 기타 ${checkedPanels.filter((p) => !["soil", "dmg"].includes(p.o.j)).length})` : "작업 대상 없음"),
    PV.h("div", { class: "bar__actions" },
      n ? PV.h("button", { class: "btn", onClick: () => { st.checked = new Set(); ctx.rerender(); } }, "선택 해제") : null,
      canReview ? PV.h("button", { class: "btn", disabled: !n || !checkedPanels.some((p) => !p.o.auto && p.o.review === "미검토"), onClick: () => { let c = 0; checkedPanels.forEach((p) => { if (!p.o.auto && p.o.review === "미검토") { p.o.review = "확인 완료"; p.o.reviewer = ctx.user.name; p.o.reviewedAt = `${PV.TODAY} ${PV.sim.fmtMin(PV.sim.state.clockMin)}`; c++; } }); PV.toast(`${c}건 검토 완료`); ctx.rerender(); } }, PV.icon("check"), "선택 검토 완료") : null,
      canRequest ? PV.h("button", { class: "btn btn--primary", disabled: !n, onClick: () => requestWork(checkedPanels, kinds) }, "선택한 패널로 작업 요청", PV.icon("arrowRight")) : null)));

  function toggleCheck(id) { if (st.checked.has(id)) st.checked.delete(id); else st.checked.add(id); }

  function requestWork(list, kinds) {
    const soil = list.filter((p) => p.o.j === "soil").map((p) => p.id), dmg = list.filter((p) => p.o.j === "dmg").map((p) => p.id), other = list.filter((p) => !["soil", "dmg"].includes(p.o.j)).map((p) => p.id);
    const svc = { 세척: soil.length > 0, 정비: dmg.length > 0 };
    const cbs = Object.keys(svc).map((k) => { const cb = PV.h("input", { type: "checkbox" }); cb.checked = svc[k]; return [k, cb]; });
    PV.dialog({ title: "유지보수 요청 · 대상·서비스", body: PV.h("div", { class: "stack" },
      PV.kv([["발전소", site.name], ["점검 회차", `${ins.round}회차 (${roundId})`], ["오염 패널", soil.length ? soil.join(", ") : "-"], ["파손 패널", dmg.length ? dmg.join(", ") : "-"], ["기타", other.length ? `${other.join(", ")} (판정 근거 없음)` : "-"]]),
      PV.h("div", { class: "field" }, PV.h("label", null, "서비스 항목"), PV.h("div", { class: "hstack" }, ...cbs.map(([k, cb]) => PV.h("label", { class: "check" }, cb, `${k} ${k === "세척" ? `(${soil.length})` : `(${dmg.length})`}`))))),
      actions: [{ label: "취소" }, { label: "일정·배정으로", primary: true, fn: () => {
        const services = cbs.filter(([, cb]) => cb.checked).map(([k]) => k);
        if (!services.length) { PV.toast("서비스 항목을 하나 이상 선택하세요."); return false; }
        const id = `REQ-0${513 + Object.keys(PV.requests).length - 1}`;
        PV.requests[id] = { id, site: siteId, inspection: roundId, stage: 1, requester: ctx.user.name, approver: "김서연", assignee: ctx.user.name, due: "2026-11-09 18:00", panels: { soil, dmg, other }, services, note: "", wish: "2026-11-12 ~ 2026-11-16",
          vendors: [ { org: "ORG-CP", service: "세척", quote: null, slots: [["2026-11-13", 9, 12]], team: "1팀 (3명)", response: "응답 대기" }, { org: "ORG-TM", service: "정비", quote: null, slots: [], team: "정비 2팀", response: "가능 여부 확인 필요" }, { org: "ORG-TO", service: "종합", quote: null, slots: [], team: "미등록", response: "가능 여부 확인 필요" } ],
          selected: {}, schedule: {}, responses: { requester: "대기", vendor: "대기" } };
        PV.tasks.unshift({ id: `T-${1050 + Object.keys(PV.requests).length}`, site: siteId, title: `${ins.round}회차 ${services.join("·")} 요청 (${list.length}패널)`, stage: "요청 범위", assignee: ctx.role, assigneeLabel: ctx.user.name, next: "업체 확인·견적 요청", due: "2026-11-09 18:00", approver: "김서연", reviewer: "박준호", kind: "승인", link: { screen: "schedule", id }, changes: [[PV.sim.fmtMin(PV.sim.state.clockMin), `${ctx.user.name} 요청 생성 · 패널 ${list.length}개`]], roles: ["owner", "epc", "master", "maint", "total"] });
        list.forEach((p) => { if (obs[p.id]) obs[p.id].work = "요청"; });
        st.checked = new Set();
        PV.go("schedule", { id }); } }] });
  }

  function emptyState(title, desc, actions) {
    page.append(PV.h("div", { class: "body" }, PV.h("div", { class: "card", style: { flex: 1 } }, PV.h("div", { class: "empty" }, PV.h("h3", null, title), PV.h("p", null, desc), PV.h("div", { class: "hstack" }, ...actions)))));
    page.append(PV.h("footer", { class: "bar" }, PV.h("span", { class: "bar__info" }, site.name)));
  }
};
