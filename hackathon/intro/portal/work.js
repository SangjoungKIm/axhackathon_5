/* SCR-05 작업·검수 */
window.PV = window.PV || {};

PV.screens.work = function (page, ctx) {
  const st = ctx.state;
  const vendorRole = ["maint", "total"].includes(ctx.role);
  const myOrg = ctx.def.org;
  /* 시뮬레이션 이벤트 반영 */
  const w88 = PV.workOrders["WO-2088"];
  if (PV.sim.has("work.item_reported", "WO-2088") && w88.items[1].state === "progress") { w88.items[1].state = "done"; w88.items[1].reportedAt = PV.sim.fmtMin(PV.sim.state.clockMin); w88.items[1].result = "11/12 완료 · B12 제외 (정비 후 세척)"; w88.items[1].evidence = 2; w88.items[1].excluded = ["B12"]; w88.state = "검수 대기"; w88.next = "항목별 검수"; const t = PV.tasks.find((x) => x.id === "T-1038"); if (t) { t.stage = "검수 대기"; t.assignee = "owner"; t.assigneeLabel = "김서연 (검수자)"; t.next = "A·B구역 검수"; } }
  const w75 = PV.workOrders["WO-2075"];
  if (PV.sim.has("review.rejected", "WO-2075") && w75.items[2].state === "progress") { w75.items[2].state = "rework"; w75.items[2].review = "반려: 범위 외 작업은 변경 승인 후 진행"; }

  const all = Object.values(PV.workOrders).filter((w) => ctx.sites.includes(w.site) && (!vendorRole || w.vendor === myOrg || ctx.role === "total"));
  const id = ctx.params.id;
  const wo = id && PV.workOrders[id];
  if (!wo) return renderList();
  return renderDetail(wo);

  function renderList() {
    st.filter = st.filter || "all"; st.page = st.page || 1;
    const label = (ctx.def.menuLabels && ctx.def.menuLabels.work) || "작업·검수";
    page.append(PV.titleBar(label, PV.siteLabel(ctx.site), [PV.newResultsChip(ctx)]));
    const filters = ["all", "예정", "진행", "검수 대기", "보류", "재작업", "완료"];
    const count = (f) => all.filter((w) => f === "all" || w.state === f || (f === "재작업" && w.items.some((i) => i.state === "rework"))).length;
    const rows = all.filter((w) => st.filter === "all" || w.state === st.filter || (st.filter === "재작업" && w.items.some((i) => i.state === "rework")));
    const body = PV.h("div", { class: "body" });
    body.append(PV.h("div", { class: "chips", role: "group", "aria-label": "상태 필터" }, ...filters.map((f) => PV.h("button", { class: "chip", "aria-pressed": String(st.filter === f), onClick: () => { st.filter = f; st.page = 1; ctx.rerender(); } }, `${f === "all" ? "전체" : f} ${count(f)}`))));
    const card = PV.h("div", { class: "card", style: { flex: 1 } });
    card.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "작업 목록")));
    const tbl = PV.table({ columns: [
      { label: "작업번호", render: (w) => PV.h("span", { class: "mono" }, w.id), width: "100px" },
      { label: "발전소", render: (w) => PV.sites[w.site].name },
      { label: "서비스·범위", primary: true, render: (w) => PV.h("span", null, w.service, PV.h("span", { class: "sub" }, w.scope)) },
      { label: "담당팀", render: (w) => w.team },
      { label: "일정", render: (w) => PV.h("span", { class: "mono" }, w.schedule.slice(5, 16)) },
      { label: "상태", render: (w) => PV.badge(w.state, w.state === "검수 대기" ? "action" : null) },
      { label: "다음 행동", render: (w) => w.next }
    ], rows, rowKey: (w) => w.id, selected: st.selected, page: st.page, pageSize: 7, onSelect: (w) => { st.selected = w.id; PV.go("work", { id: w.id }); }, onPage: (p) => { st.page = p; ctx.rerender(); }, emptyText: { title: "해당 상태의 작업이 없습니다", desc: "필터를 바꾸거나 전체를 선택하세요." } });
    card.append(tbl.wrap, PV.h("div", { class: "card__foot" }, tbl.pager));
    body.append(card);
    page.append(body, PV.h("footer", { class: "bar" }, PV.h("span", { class: "bar__info" }, `${rows.length}건`), PV.h("div", { class: "bar__actions" }, vendorRole ? PV.h("button", { class: "btn btn--primary", onClick: () => { const today = all.find((w) => w.schedule.startsWith(PV.TODAY)); if (today) PV.go("work", { id: today.id, tab: "record" }); else PV.toast("오늘 예정된 작업이 없습니다."); } }, "오늘 작업 열기") : null)));
  }

  function renderDetail(wo) {
    const site = PV.sites[wo.site];
    const d = (st.detail = st.detail || {}); d[wo.id] = d[wo.id] || { tab: "order", item: wo.items[0]?.id };
    const ds = d[wo.id];
    if (ctx.params.tab) ds.tab = ctx.params.tab;
    const isReviewer = ctx.user.name === wo.reviewer || ctx.role === "master";
    const isVendor = vendorRole || ctx.role === "master";
    const item = wo.items.find((i) => i.id === ds.item) || wo.items[0];
    const tabs = PV.tabs([{ key: "order", label: "작업지시" }, { key: "record", label: "수행 기록" }, { key: "evidence", label: "증빙" }, { key: "review", label: "검수·비용" }], ds.tab, (k) => { ds.tab = k; ctx.rerender(); }, "tabs--plain");
    page.append(PV.titleBar(`${wo.id} · ${site.name}`, `${wo.service} · ${wo.team} · ${wo.schedule}`, [PV.newResultsChip(ctx), PV.badge(wo.state, wo.state === "검수 대기" ? "action" : null), tabs], { back: { label: "작업 목록", fn: () => PV.go("work") } }));
    const body = PV.h("div", { class: "body body--split" });
    const left = PV.h("div", { class: "card pane pane--list" }), right = PV.h("div", { class: "card pane pane--detail" });
    body.append(left, right); page.append(body);
    const bar = PV.h("footer", { class: "bar" }); page.append(bar);
    const stateLabel = { pending: "대기", progress: "진행", done: "완료 보고", hold: "보류", rework: "재작업", approved: "검수 승인" };
    const stateIcon = { pending: null, progress: "clock", done: "check", hold: "pause", rework: "retry", approved: "check" };
    const targetIds = new Set(); wo.items.forEach((i) => { if (/^[A-F]\d\d$/.test(i.id)) targetIds.add(i.id); else if (i.id.endsWith("구역")) PV.panelsOf(wo.site).filter((p) => p.zone === i.id[0]).forEach((p) => targetIds.add(p.id)); });
    const itemsList = () => PV.h("div", { class: "items" }, ...wo.items.map((i) => PV.h("button", { class: "item", "aria-selected": String(i.id === item?.id), onClick: () => { ds.item = i.id; ctx.rerender(); } },
      PV.h("span", { class: "item__state", "data-s": i.state, "aria-label": stateLabel[i.state] }, stateIcon[i.state] ? PV.icon(stateIcon[i.state]) : null),
      PV.h("span", null, PV.h("div", { class: "item__title" }, i.label), PV.h("div", { class: "item__sub" }, `${stateLabel[i.state]}${i.reportedAt ? " · " + i.reportedAt : ""} · ${i.result}`)),
      PV.h("span", { class: "hstack" }, i.evidence ? PV.badge(`증빙 ${i.evidence}`, null, "image") : null, i.state === "hold" ? PV.badge("부품 대기", "soil", "pause") : null, i.state === "rework" ? PV.badge("재작업", "dmg", "retry") : null))));

    if (ds.tab === "order") {
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "대상 배치도"), PV.h("span", { class: "muted" }, `${targetIds.size}패널`)));
      const obs = wo.inspection ? PV.observations[wo.inspection] : {};
      left.append(PV.h("div", { class: "card__body", style: { display: "grid", gridTemplateRows: "minmax(0, 1fr) auto", gap: "10px", padding: "10px" } }, PV.siteMap(wo.site, { obs, checked: targetIds, dimFn: (p) => !targetIds.has(p.id), noLegend: true, srcLabel: "지시 발행 범위 (스냅샷)" }), PV.h("div", { class: "hstack" }, ...wo.items.map((i) => PV.badge(i.label.split(" ")[0] + (i.id.endsWith("구역") ? "" : ""), null)))));
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "승인 범위")), PV.h("div", { class: "card__body stack" }, PV.whoBox(wo.state === "검수 대기" ? wo.reviewer : wo.team, wo.next, wo.approver, wo.reviewer),
        PV.kv([["범위", wo.scope], ["현장 전달", wo.note], ["일정", wo.schedule], ["견적 버전", wo.quoteVersion], ["지시서 발행", wo.issuedAt], ["근거 회차", wo.inspection ? PV.h("button", { class: "link-btn mono", onClick: () => PV.go("panels", { site: wo.site, round: wo.inspection }) }, wo.inspection) : "없음"]], true),
        PV.note("발행 시점 범위 고정 · 새 분석 결과로 자동 변경되지 않음")));
      bar.append(PV.h("span", { class: "bar__info" }, `지시서 ${wo.id} · ${wo.quoteVersion}`), PV.h("div", { class: "bar__actions" }, PV.h("button", { class: "btn", onClick: () => PV.toast("지시서 PDF 생성") }, PV.icon("file"), "지시서 출력"), isVendor && wo.state === "예정" ? PV.h("button", { class: "btn btn--primary", onClick: () => { wo.state = "진행"; wo.next = "항목별 완료 보고"; wo.items.forEach((i) => { if (i.state === "pending") i.state = "progress"; }); PV.toast("작업 시작 보고"); ctx.rerender(); } }, PV.icon("play"), "시작") : null));
    }

    if (ds.tab === "record") {
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "항목별 상태"), PV.h("span", { class: "muted" }, `${wo.items.filter((i) => ["done", "approved"].includes(i.state)).length} / ${wo.items.length} 항목 완료`)));
      const done = wo.items.filter((i) => ["done", "approved"].includes(i.state)).length, hold = wo.items.filter((i) => i.state === "hold").length, rw = wo.items.filter((i) => i.state === "rework").length;
      left.append(PV.h("div", { style: { padding: "10px 14px 0" } }, PV.h("div", { class: "meter", role: "img", "aria-label": `완료 ${done}, 보류 ${hold}, 재작업 ${rw}` }, PV.h("i", { class: "ok", style: { width: `${(done / wo.items.length) * 100}%` } }), PV.h("i", { class: "hold", style: { width: `${(hold / wo.items.length) * 100}%` } }), PV.h("i", { class: "fail", style: { width: `${(rw / wo.items.length) * 100}%` } }))), PV.h("div", { class: "card__body card__body--flush" }, itemsList()));
      const material = PV.h("input", { class: "input", value: item?.material || "", "aria-label": "자재", onInput: (e) => { item.material = e.target.value; } });
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, item ? item.label : "항목")), PV.h("div", { class: "card__body stack" }, PV.whoBox(wo.team, item?.state === "done" ? "검수 대기" : "완료 보고", undefined, wo.reviewer),
        item ? PV.kv([["상태", PV.badge(stateLabel[item.state], item.state === "hold" ? "soil" : item.state === "rework" ? "dmg" : null)], ["결과", item.result], ["보고 시각", item.reportedAt || "-"], ["보류 사유", item.holdReason || "-"], ["제외 대상", item.excluded ? item.excluded.join(", ") : "없음"], ["검수 의견", item.review || "-"]], true) : null,
        isVendor && item && !["approved"].includes(item.state) ? PV.h("div", { class: "field" }, PV.h("label", null, "자재"), material) : null));
      bar.append(PV.h("span", { class: "bar__info" }, `선택 항목: ${item?.label || "-"}`), PV.h("div", { class: "bar__actions" }, isVendor && item && ["progress", "pending", "rework"].includes(item.state) ? [
        PV.h("button", { class: "btn", onClick: () => { const inp = PV.h("input", { class: "input", placeholder: "예: 부품 대기 (입고 예정 11-14)" }); PV.dialog({ title: "보류", body: PV.h("div", { class: "field" }, PV.h("label", null, "보류 사유·다음 계획 (필수)"), inp), actions: [{ label: "취소" }, { label: "보류", primary: true, fn: () => { if (!inp.value.trim()) return false; item.state = "hold"; item.holdReason = inp.value.trim(); item.result = `보류: ${inp.value.trim()}`; item.reportedAt = PV.sim.fmtMin(PV.sim.state.clockMin); ctx.rerender(); } }] }); } }, PV.icon("pause"), "보류"),
        PV.h("button", { class: "btn", onClick: () => { const inp = PV.h("input", { class: "input", placeholder: "추가·제외 범위, 비용, 일정, 사유" }); PV.dialog({ title: "작업 변경 요청", body: PV.h("div", { class: "stack" }, PV.kv([["기존 승인 버전", wo.quoteVersion]]), PV.h("div", { class: "field" }, PV.h("label", null, "차이 입력"), inp), PV.note("승인자 재승인 후 진행 · 기존 범위 보존")), actions: [{ label: "취소" }, { label: "승인 요청", primary: true, fn: () => { wo.quoteVersion = wo.quoteVersion.replace(/ \(.*\)/, "") + " (변경 승인 대기)"; PV.toast("변경 승인 요청"); ctx.rerender(); } }] }); } }, "변경 요청"),
        PV.h("button", { class: "btn btn--primary", onClick: () => reportDialog(wo, item) }, PV.icon("check"), "완료 보고")] : null));
    }

    if (ds.tab === "evidence") {
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, `${item?.label || ""} · 작업 전후 이미지`), PV.h("span", { class: "muted" }, `증빙 ${item?.evidence || 0}장`)));
      const thumbs = PV.h("div", { class: "card__body" });
      if (item?.evidence) thumbs.append(PV.h("div", { class: "thumbs" }, PV.panelFrame({ j: wo.service.includes("세척") ? "soil" : "dmg" }, { label: "작업 전 · 시연 자료" }), PV.panelFrame({ j: "ok" }, { label: "작업 후 · 시연 자료" }), item.evidence > 2 ? PV.panelFrame({ j: "ok" }, { label: "추가 · 시연 자료" }) : null));
      else thumbs.append(PV.h("div", { class: "empty" }, PV.icon("camera"), PV.h("h3", null, "등록된 증빙이 없습니다"), PV.h("p", null, "필수 증빙: 전·후 각 1장 (세척 구역당 · 정비 패널당)")));
      left.append(thumbs);
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "증빙 정보")), PV.h("div", { class: "card__body stack" }, PV.kv([["대상", item?.label || "-"], ["설명", item?.result || "-"], ["수신 상태", item?.evidence ? PV.badge("업로드 완료", "action", "check") : PV.badge("미등록", "und")], ["사진 연결", item ? `${item.id} · ${wo.id}` : "-"]], true),
        PV.h("div", { class: "divider" }), PV.h("div", { class: "section-title" }, "항목 이동"), itemsList()));
      bar.append(PV.h("span", { class: "bar__info" }, item ? `${item.label} · 증빙 ${item.evidence}장` : ""), PV.h("div", { class: "bar__actions" }, isVendor && item && item.state !== "approved" ? PV.h("button", { class: "btn", onClick: () => { item.evidence++; PV.toast("사진 업로드 완료"); ctx.rerender(); } }, PV.icon("camera"), "사진 등록") : null, PV.h("button", { class: "btn btn--primary", onClick: () => { const i = wo.items.findIndex((x) => x.id === item.id); ds.item = wo.items[(i + 1) % wo.items.length].id; ctx.rerender(); } }, "다음 대상", PV.icon("arrowRight"))));
    }

    if (ds.tab === "review") {
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "완료·미완료·변경 내역")));
      const tbl = PV.table({ columns: [
        { label: "항목", primary: true, render: (i) => i.label },
        { label: "보고", render: (i) => PV.badge(stateLabel[i.state], i.state === "hold" ? "soil" : i.state === "rework" ? "dmg" : i.state === "approved" ? "ink" : i.state === "done" ? "action" : null) },
        { label: "증빙", num: true, render: (i) => String(i.evidence) },
        { label: "결과·사유", wrap: true, render: (i) => i.review || i.holdReason || i.result },
        { label: "", render: (i) => isReviewer && i.state === "done" ? PV.h("span", { class: "hstack", style: { justifyContent: "flex-end" } }, PV.h("button", { class: "btn btn--sm", onClick: (e) => { e.stopPropagation(); rejectDialog(wo, i); } }, "보완"), PV.h("button", { class: "btn btn--sm btn--primary", onClick: (e) => { e.stopPropagation(); i.state = "approved"; i.review = `검수 승인 · ${ctx.user.name} ${PV.sim.fmtMin(PV.sim.state.clockMin)}`; PV.toast(`${i.label} 승인`); ctx.rerender(); } }, "승인")) : null }
      ], rows: wo.items, rowKey: (i) => i.id, selected: item?.id, pageSize: 6, onSelect: (i) => { ds.item = i.id; ctx.rerender(); } });
      left.append(tbl.wrap, PV.h("div", { class: "card__foot" }, tbl.pager));
      const approved = wo.items.filter((i) => i.state === "approved").length, pendingReview = wo.items.filter((i) => i.state === "done").length, unresolved = wo.items.filter((i) => ["hold", "rework", "progress", "pending"].includes(i.state)).length;
      const opinion = PV.h("textarea", { class: "textarea", "aria-label": "검수 의견", disabled: !isReviewer, placeholder: "검수 의견" });
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "검수 의견·최종 비용")), PV.h("div", { class: "card__body stack" }, PV.whoBox(wo.reviewer, unresolved ? "미완료 항목 처리방침 합의" : pendingReview ? "항목 승인" : "작업 종료", wo.approver, wo.reviewer),
        PV.h("div", { class: "strip strip--2" }, PV.stat({ label: "검수 완료율", value: Math.round((approved / wo.items.length) * 100), unit: "%", sub: `${approved} / ${wo.items.length} 승인` }), PV.stat({ label: "미해결", value: unresolved, unit: "항목", sub: "보류·재작업·진행" })),
        wo.cost ? PV.kv([["승인 비용", `${PV.fmtWon(wo.cost.base)} (세금 ${wo.cost.tax})`], ["변경 비용", wo.cost.extra ? `+${PV.fmtWon(wo.cost.extra)} (변경 승인 대기)` : "없음"], ["최종 비용", wo.cost.extra ? `${PV.fmtWon(wo.cost.base)} + 승인 시 ${PV.fmtWon(wo.cost.extra)}` : PV.fmtWon(wo.cost.base)]], true) : PV.note("비용 정보 없음"),
        PV.h("div", { class: "field" }, PV.h("label", null, "검수 의견"), opinion)));
      const canClose = isReviewer && approved === wo.items.length;
      bar.append(PV.h("span", { class: "bar__info" }, canClose ? "전체 승인 완료" : unresolved ? `미완료 ${unresolved}항목 · 처리방침 필요` : `검수 대기 ${pendingReview}항목`),
        PV.h("div", { class: "bar__actions" }, isReviewer && wo.cost?.extra && !wo.extraApproved ? PV.h("button", { class: "btn", onClick: () => { wo.extraApproved = true; wo.quoteVersion = "v3 (변경 승인)"; PV.toast("변경 승인 완료"); ctx.rerender(); } }, "변경 승인") : null,
          isReviewer && unresolved ? PV.h("button", { class: "btn", onClick: () => PV.dialog({ title: "미완료 범위 처리방침", body: PV.h("p", null, "보류·재작업 항목을 완료 · 재작업 · 보류 유지 · 범위 제외 중 하나로 처리해야 종료할 수 있습니다."), actions: [{ label: "확인" }] }) }, "처리방침 합의") : null,
          PV.h("button", { class: "btn btn--primary", disabled: !canClose, onClick: () => { wo.state = "완료"; wo.next = "-"; const t = PV.tasks.find((x) => x.link?.id === wo.id); if (t) { t.stage = "종료"; t.next = "-"; } PV.toast(`${wo.id} 작업 종료 · 이력 보관`); ctx.rerender(); } }, PV.icon("check"), "작업 종료")));
    }
  }

  function reportDialog(wo, item) {
    const inp = PV.h("input", { class: "input", placeholder: "수행 결과", value: "" });
    const excl = PV.h("input", { class: "input", placeholder: "제외 패널 ID (쉼표 구분) · 사유 포함" });
    PV.dialog({ title: `완료 보고 · ${item.label}`, body: PV.h("div", { class: "stack" }, PV.kv([["포함 대상", item.id.endsWith("구역") ? `${item.id} 12패널` : item.id], ["증빙", `${item.evidence}장 ${item.evidence < 2 ? "(필수 증빙 부족: 전·후 각 1장)" : ""}`]]), PV.h("div", { class: "field" }, PV.h("label", null, "수행 결과 (필수)"), inp), PV.h("div", { class: "field" }, PV.h("label", null, "제외 대상·사유"), excl, PV.h("span", { class: "hint" }, "미완료 패널은 제외하고 사유 기록"))),
      actions: [{ label: "취소" }, { label: "완료 보고 제출", primary: true, fn: () => { if (!inp.value.trim()) { inp.setAttribute("aria-invalid", "true"); inp.focus(); return false; } if (item.evidence < 2) { PV.toast("필수 증빙(전·후 각 1장) 필요"); return false; } item.state = "done"; item.result = inp.value.trim(); item.reportedAt = PV.sim.fmtMin(PV.sim.state.clockMin); if (excl.value.trim()) item.excluded = excl.value.split(",").map((s) => s.trim()).filter(Boolean); if (wo.items.every((i) => ["done", "approved", "hold"].includes(i.state))) { wo.state = "검수 대기"; wo.next = "항목별 검수"; const t = PV.tasks.find((x) => x.link?.id === wo.id); if (t) { t.stage = "검수 대기"; t.assignee = "owner"; t.assigneeLabel = `${wo.reviewer} (검수자)`; t.next = "항목별 승인 또는 보완 요청"; } } PV.toast("완료 보고 제출 · 검수 대기"); ctx.rerender(); } }] });
  }
  function rejectDialog(wo, item) {
    const inp = PV.h("input", { class: "input", placeholder: "보완 내용 (필수)" });
    PV.dialog({ title: `보완 요청 · ${item.label}`, body: PV.h("div", { class: "stack" }, PV.h("div", { class: "field" }, PV.h("label", null, "보완 내용"), inp)), actions: [{ label: "취소" }, { label: "보완 요청", primary: true, fn: () => { if (!inp.value.trim()) { inp.focus(); return false; } item.state = "rework"; item.review = `반려: ${inp.value.trim()} · ${ctx.user.name}`; wo.state = "재작업"; wo.next = "반려 항목 보완"; PV.toast(`${item.label} 재작업으로 전환`); ctx.rerender(); } }] });
  }
};
