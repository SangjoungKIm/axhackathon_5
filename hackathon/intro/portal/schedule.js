/* SCR-04 일정·배정 */
window.PV = window.PV || {};

PV.screens.schedule = function (page, ctx) {
  const st = ctx.state;
  const vendorRole = ["maint", "total"].includes(ctx.role);
  const myOrg = ctx.def.org;
  const reqs = Object.values(PV.requests).filter((r) => ctx.sites.includes(r.site) && (!vendorRole || r.vendors.some((v) => v.org === myOrg)));
  const id = ctx.params.id;
  const req = id && PV.requests[id];

  /* 시뮬레이션 이벤트 반영 (견적 제출·일정 제안) */
  const r512 = PV.requests["REQ-0512"];
  if (PV.sim.has("quote.submitted", "REQ-0512")) { const v = r512.vendors.find((x) => x.org === "ORG-TO"); if (!v.quote) { v.quote = { version: 1, items: [["통합 작업 (세척 7 + 정비 2)", 1, 250000], ["출장비", 1, 60000]], tax: "별도", valid: "2026-11-15", hours: "5시간 (업체 제시)" }; v.response = "견적 제출"; v.slots = [["2026-11-14", 9, 15]]; } }
  if (PV.sim.has("schedule.proposed", "REQ-0512")) { const v = r512.vendors.find((x) => x.org === "ORG-TM"); v.response = "일정 제안"; if (!r512.schedule["ORG-TM"]) r512.schedule["ORG-TM"] = ["2026-11-12", 10, 13]; }

  if (!req) return renderList();
  return renderDetail(req);

  function renderList() {
    st.page = st.page || 1;
    const label = (ctx.def.menuLabels && ctx.def.menuLabels.schedule) || "일정·배정";
    page.append(PV.titleBar(label, PV.siteLabel(ctx.site), [PV.newResultsChip(ctx)]));
    const card = PV.h("div", { class: "card", style: { flex: 1 } });
    card.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, vendorRole ? "받은 요청" : "유지보수 요청"), PV.h("span", { class: "muted" }, `${reqs.length}건`)));
    const stages = ["요청 범위", "업체·견적", "일정", "최종 확인", "확정"];
    const tbl = PV.table({ columns: [
      { label: "요청", render: (r) => PV.h("span", { class: "mono" }, r.id), width: "110px" },
      { label: "발전소", render: (r) => PV.sites[r.site].name },
      { label: "서비스·대상", primary: true, render: (r) => `${r.services.join("·")} · 패널 ${r.panels.soil.length + r.panels.dmg.length + (r.panels.other?.length || 0)}개` },
      { label: "단계", render: (r) => PV.badge(stages[r.stage - 1], r.stage < 5 ? "action" : null) },
      { label: "담당", render: (r) => r.assignee },
      { label: "승인자", render: (r) => r.approver },
      { label: "기한", render: (r) => PV.h("span", { class: "mono" }, r.due.slice(5)) }
    ], rows: reqs, rowKey: (r) => r.id, selected: st.selected, page: st.page, pageSize: 7, onSelect: (r) => { st.selected = r.id; PV.go("schedule", { id: r.id }); }, onPage: (p) => { st.page = p; ctx.rerender(); }, emptyText: { title: "요청이 없습니다", desc: "패널 상태 화면에서 대상을 선택해 작업을 요청하면 여기에 표시됩니다." } });
    card.append(tbl.wrap, PV.h("div", { class: "card__foot" }, tbl.pager));
    page.append(PV.h("div", { class: "body" }, card), PV.h("footer", { class: "bar" }, PV.h("span", { class: "bar__info" }, `${reqs.length}건`), PV.h("div", { class: "bar__actions" }, !vendorRole ? PV.h("button", { class: "btn", onClick: () => PV.go("panels") }, "패널 상태에서 대상 선택") : null)));
  }

  function renderDetail(req) {
    const site = PV.sites[req.site];
    const d = (st.detail = st.detail || {}); d[req.id] = d[req.id] || { step: req.stage };
    const ds = d[req.id];
    if (ctx.params.step) ds.step = Number(ctx.params.step);
    const steps = ["요청 범위", "업체·견적", "일정", "최종 확인"];
    const isApprover = ctx.user.name === req.approver || ctx.role === "master";
    const canEdit = ["owner", "epc", "master"].includes(ctx.role);
    const allPanels = [...req.panels.dmg.map((p) => ({ id: p, j: "dmg" })), ...req.panels.soil.map((p) => ({ id: p, j: "soil" })), ...(req.panels.other || []).map((p) => ({ id: p, j: "ok" }))];
    const selVendors = req.vendors.filter((v) => req.selected[v.org]);
    const quoteTotal = (q) => q ? q.items.reduce((a, [, n, p]) => a + n * p, 0) : null;

    page.append(PV.titleBar(`${req.id} · ${site.name}`, `${req.services.join("·")} · 요청 ${req.requester} · 승인자 ${req.approver} · 기한 ${req.due}`, [PV.newResultsChip(ctx), PV.badge(req.stage >= 5 ? "확정" : `현재 단계: ${steps[req.stage - 1]}`, "action")], { back: { label: "요청 목록", fn: () => PV.go("schedule") } }));
    const body = PV.h("div", { class: "body body--split has-strip" });
    body.append(PV.h("div", { class: "hstack", style: { justifyContent: "space-between" } }, PV.stepper(steps, Math.min(ds.step, 4), { onPick: (n) => { if (n <= req.stage) { ds.step = n; ctx.rerender(); } } })));
    const left = PV.h("div", { class: "card pane pane--list" }), right = PV.h("div", { class: "card pane pane--detail" });
    body.append(left, right); page.append(body);
    const bar = PV.h("footer", { class: "bar" }); page.append(bar);
    const advance = (n) => { req.stage = Math.max(req.stage, n); ds.step = n; const t = PV.tasks.find((x) => x.link?.id === req.id); if (t) { t.stage = steps[Math.min(n, 4) - 1]; } ctx.rerender(); };

    /* 1. 요청 범위 */
    if (ds.step === 1) {
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "대상 패널·서비스"), PV.h("span", { class: "muted" }, `${allPanels.length}개 · 근거 ${req.inspection}`)));
      const tbl = PV.table({ columns: [{ label: "패널", render: (p) => PV.h("span", { class: "mono" }, p.id), width: "90px" }, { label: "구역", render: (p) => `${p.id[0]} 구역` }, { label: "판정 근거", render: (p) => PV.judgBadge(p.j) }, { label: "서비스", render: (p) => p.j === "dmg" ? "정비" : p.j === "soil" ? "세척" : PV.h("span", { class: "muted" }, "확인 필요") }, { label: "회차", render: () => PV.h("span", { class: "mono" }, req.inspection) }], rows: allPanels, rowKey: (p) => p.id, pageSize: 6, page: ds.p1 || 1, onPage: (p) => { ds.p1 = p; ctx.rerender(); } });
      left.append(tbl.wrap, PV.h("div", { class: "card__foot" }, tbl.pager));
      const note = PV.h("textarea", { class: "textarea", "aria-label": "현장 전달사항", disabled: !canEdit, onInput: (e) => { req.note = e.target.value; } }, req.note);
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "요청 요약")), PV.h("div", { class: "card__body stack" }, PV.whoBox(req.assignee, "업체 확인", req.approver, undefined), PV.kv([["발전소", site.name], ["대상 수", `${allPanels.length}개 (오염 ${req.panels.soil.length} · 파손 ${req.panels.dmg.length})`], ["서비스", PV.h("div", { class: "hstack" }, ...req.services.map((s) => PV.badge(s)))], ["희망 기간", req.wish]]), PV.h("div", { class: "field" }, PV.h("label", null, "현장 전달사항"), note)));
      bar.append(PV.h("span", { class: "bar__info" }, `대상 ${allPanels.length}개 · ${req.services.join("·")}`), PV.h("div", { class: "bar__actions" }, PV.h("button", { class: "btn btn--primary", disabled: !canEdit, onClick: () => advance(2) }, "업체 확인", PV.icon("arrowRight"))));
    }

    /* 2. 업체·견적 */
    if (ds.step === 2) {
      ds.sort = ds.sort || "quote";
      const rows = [...req.vendors].sort((a, b) => ds.sort === "quote" ? ((quoteTotal(a.quote) ?? 1e12) - (quoteTotal(b.quote) ?? 1e12)) : ((a.slots[0]?.[0] || "9") > (b.slots[0]?.[0] || "9") ? 1 : -1));
      const sortSel = PV.h("select", { class: "ctx-select", style: { height: "30px" }, "aria-label": "정렬", onChange: (e) => { ds.sort = e.target.value; ctx.rerender(); } }, PV.h("option", { value: "quote", selected: ds.sort === "quote" }, "제출 견적 순"), PV.h("option", { value: "slot", selected: ds.sort === "slot" }, "제안 일정 순"));
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, vendorRole ? "견적 제출" : "업체 후보 비교"), PV.h("div", { class: "card__tools" }, vendorRole ? null : sortSel)));
      if (vendorRole) {
        const v = req.vendors.find((x) => x.org === myOrg);
        renderQuoteForm(left, req, v);
      } else {
        const tbl = PV.table({ columns: [
          { label: "업체", primary: true, render: (v) => PV.h("span", null, PV.orgs[v.org].name, PV.h("span", { class: "sub" }, `${v.service} · ${v.team}`)) },
          { label: "응답", render: (v) => PV.badge(v.response, v.response === "견적 제출" || v.response === "일정 제안" ? "action" : v.response === "가능 여부 확인 필요" ? "und" : null) },
          { label: "견적 합계", num: true, render: (v) => v.quote ? PV.h("span", null, PV.fmtWon(quoteTotal(v.quote)), PV.h("span", { class: "sub" }, `v${v.quote.version} · 세금 ${v.quote.tax}`)) : PV.h("span", { class: "muted" }, v.onsite ? "현장 확인 후 견적" : "견적 미제출") },
          { label: "제시 작업시간", render: (v) => v.quote ? v.quote.hours : PV.h("span", { class: "muted" }, "미정") },
          { label: "가능 일정", wrap: true, render: (v) => v.slots.length ? v.slots.map((s) => `${s[0].slice(5)} ${String(s[1]).padStart(2, "0")}–${String(s[2]).padStart(2, "0")}`).join(", ") : PV.h("span", { class: "muted" }, "미확인 (일정 미등록)") }
        ], rows, rowKey: (v) => v.org, checks: true, checkedSet: new Set(Object.keys(req.selected).filter((k) => req.selected[k])), onCheck: (v, on) => { req.selected[v.org] = on; ctx.rerender(); }, pageSize: 6 });
        left.append(tbl.wrap);
      }
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "선택 업체·견적")), PV.h("div", { class: "card__body stack" }, PV.whoBox(req.assignee, selVendors.length ? "일정 선택" : "업체 선택 · 제안 요청", req.approver, undefined),
        selVendors.length ? PV.kv(selVendors.map((v) => [PV.orgs[v.org].name, v.quote ? `${PV.fmtWon(quoteTotal(v.quote))} (세금 ${v.quote.tax}) · ${v.quote.hours}` : v.onsite ? "현장 확인 후 견적" : "견적 미제출"]), true) : PV.note("비교할 업체를 선택하세요"),
        selVendors.some((v) => v.quote) ? PV.h("div", null, PV.h("div", { class: "section-title", style: { marginBottom: "6px" } }, "견적 항목"), ...selVendors.filter((v) => v.quote).map((v) => PV.kv(v.quote.items.map(([n, q, p]) => [n, `${q} × ${PV.fmtWon(p)} = ${PV.fmtWon(q * p)}`]), true))) : null));
      bar.append(PV.h("span", { class: "bar__info" }, `선택 ${selVendors.length}개 업체 · 견적 제출 ${req.vendors.filter((v) => v.quote).length}건`),
        PV.h("div", { class: "bar__actions" }, !vendorRole ? [PV.h("button", { class: "btn", onClick: () => { req.vendors.forEach((v) => { if (!v.quote && !v.onsite) v.response = "제안 요청 발송"; }); PV.toast("제안 요청 발송 · 응답 기한 48시간"); ctx.rerender(); } }, PV.icon("send"), "제안 요청"), PV.h("button", { class: "btn btn--primary", disabled: !selVendors.length || !canEdit, onClick: () => advance(3) }, "일정 선택", PV.icon("arrowRight"))] : null));
    }

    /* 3. 일정 */
    if (ds.step === 3) {
      const vendors = selVendors.length ? selVendors : req.vendors.filter((v) => v.org === myOrg);
      ds.vendor = ds.vendor && vendors.find((v) => v.org === ds.vendor) ? ds.vendor : vendors[0]?.org;
      const v = vendors.find((x) => x.org === ds.vendor);
      const vSel = PV.h("div", { class: "seg", role: "group", "aria-label": "업체" }, ...vendors.map((x) => PV.h("button", { "aria-pressed": String(x.org === ds.vendor), onClick: () => { ds.vendor = x.org; ctx.rerender(); } }, PV.orgs[x.org].name)));
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "주간 일정"), PV.h("span", { class: "muted" }, "11-09 (월) ~ 11-15 (일) · KST"), PV.h("div", { class: "card__tools" }, vSel)));
      const days = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"];
      const dn = ["월", "화", "수", "목", "금", "토", "일"];
      const week = PV.h("div", { class: "week", role: "grid", "aria-label": `${v ? PV.orgs[v.org].name : ""} 가능 일정` });
      week.append(PV.h("div", { class: "week__head" }, ""));
      days.forEach((dd, i) => week.append(PV.h("div", { class: "week__head" }, `${dd.slice(5)} (${dn[i]})`)));
      const unknown = !v || (!v.slots.length && v.team === "미등록");
      for (let h = 8; h < 18; h++) {
        week.append(PV.h("div", { class: "week__hour" }, `${String(h).padStart(2, "0")}:00`));
        days.forEach((dd, di) => {
          const free = v && v.slots.some((s) => s[0] === dd && h >= s[1] && h < s[2]);
          const busy = v && !unknown && (dd === "2026-11-10" && v.org === "ORG-TM" && h >= 9 && h < 12 || dd === "2026-11-13" && v.org === "ORG-CP" && h >= 13 && h < 17);
          const picked = v && req.schedule[v.org] && req.schedule[v.org][0] === dd && h >= req.schedule[v.org][1] && h < req.schedule[v.org][2];
          const cell = PV.h("div", { class: "week__cell", role: "gridcell", "data-free": String(!!free), "data-busy": String(!!busy), "data-unknown": String(!!unknown || (di >= 5)), "aria-selected": String(!!picked), tabindex: free ? "0" : null, "aria-label": `${dd} ${h}시 ${free ? "가능" : busy ? "예약됨" : "미확인"}`,
            onClick: free ? () => { const s = v.slots.find((s) => s[0] === dd && h >= s[1] && h < s[2]); req.schedule[v.org] = s; v.response = "일정 제안"; ctx.rerender(); } : null,
            onKeydown: free ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cell.click(); } } : null });
          week.append(cell);
        });
      }
      left.append(PV.h("div", { class: "card__body", style: { display: "flex", padding: "10px" } }, week), PV.h("div", { class: "card__foot" }, PV.h("span", { class: "hstack" }, PV.h("i", { class: "week__cell", style: { width: "14px", height: "14px", display: "inline-block", border: "1px solid var(--line)" }, "data-free": "true" }), "가능 시간", PV.h("i", { class: "week__cell", style: { width: "14px", height: "14px", display: "inline-block", border: "1px solid var(--line)" }, "data-busy": "true" }), "예약됨 (타 고객 상세 비공개)", PV.h("i", { class: "week__cell", style: { width: "14px", height: "14px", display: "inline-block", border: "1px solid var(--line)" }, "data-unknown": "true" }), "미확인 (일정 미등록)")));
      const picked = v && req.schedule[v.org];
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "선택 일정")), PV.h("div", { class: "card__body stack" }, PV.whoBox(req.assignee, picked ? "일정 제안" : "가능 시간 선택", req.approver, undefined),
        v ? PV.kv([["업체·팀", `${PV.orgs[v.org].name} · ${v.team}`], ["날짜", picked ? picked[0] : "-"], ["시작·종료", picked ? `${String(picked[1]).padStart(2, "0")}:00 – ${String(picked[2]).padStart(2, "0")}:00 KST` : "-"], ["제안 기한", "제안 후 24시간"]], true) : null,
        unknown ? PV.note("가용 일정 미등록 · 확인 필요", "warn") : null,
        v && v.slots.length ? PV.h("div", null, PV.h("div", { class: "section-title", style: { marginBottom: "6px" } }, "가능한 시간 목록"), PV.h("div", { class: "rows" }, ...v.slots.map((s) => PV.h("button", { class: "row", style: { gridTemplateColumns: "1fr auto" }, "aria-selected": String(picked === s), onClick: () => { req.schedule[v.org] = s; v.response = "일정 제안"; ctx.rerender(); } }, PV.h("span", { class: "row__title" }, `${s[0]} ${String(s[1]).padStart(2, "0")}:00–${String(s[2]).padStart(2, "0")}:00`), PV.h("span", { class: "row__meta" }, `${s[2] - s[1]}시간`))))) : null));
      const allPicked = vendors.every((x) => req.schedule[x.org]);
      bar.append(PV.h("span", { class: "bar__info" }, `일정 선택 ${vendors.filter((x) => req.schedule[x.org]).length} / ${vendors.length} 업체`), PV.h("div", { class: "bar__actions" }, PV.h("button", { class: "btn btn--primary", disabled: !allPicked, onClick: () => { advance(4); PV.toast("일정 제안 완료 · 양측 확인 대기"); } }, "일정 제안", PV.icon("arrowRight"))));
    }

    /* 4. 최종 확인 */
    if (ds.step >= 4) {
      const vendors = selVendors.length ? selVendors : req.vendors.filter((v) => req.schedule[v.org]);
      const total = vendors.reduce((a, v) => a + (quoteTotal(v.quote) || 0), 0);
      left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "승인 범위·견적·일정")));
      left.append(PV.h("div", { class: "card__body stack" },
        PV.kv([["발전소", site.name], ["대상 패널", `${allPanels.length}개 · 구역 ${[...new Set(allPanels.map((p) => p.id[0]))].join(", ")}`], ["서비스", req.services.join(" · ")], ["제외 항목", (req.panels.other || []).length ? `${req.panels.other.join(", ")} (판정 근거 없음 · 서비스 미지정)` : "없음"], ["승인자", req.approver], ["견적 총액", vendors.some((v) => v.quote) ? `${PV.fmtWon(total)} (세금 별도${vendors.some((v) => !v.quote) ? " · 일부 현장 확인 후 견적" : ""})` : "견적 미제출"]], true),
        PV.h("div", { class: "divider" }),
        ...vendors.map((v) => PV.h("div", { class: "stack", style: { gap: "6px" } }, PV.h("div", { class: "section-title" }, `${PV.orgs[v.org].name} · ${v.service}`), PV.kv([["팀", v.team], ["작업시간", v.quote?.hours || "미정 (현장 확인 후)"], ["일정", req.schedule[v.org] ? `${req.schedule[v.org][0]} ${String(req.schedule[v.org][1]).padStart(2, "0")}:00–${String(req.schedule[v.org][2]).padStart(2, "0")}:00` : "미선택"], ["견적", v.quote ? `v${v.quote.version} · ${PV.fmtWon(quoteTotal(v.quote))} · 유효 ${v.quote.valid}` : "미제출"]], true)))));
      const resp = req.responses;
      right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "양측 응답")), PV.h("div", { class: "card__body stack" },
        PV.whoBox(req.stage >= 5 ? "작업팀" : resp.requester === "대기" ? req.approver : "업체", req.stage >= 5 ? "작업지시 발행됨" : resp.requester === "대기" ? "수락 또는 변경 요청" : "업체 수락 대기", req.approver, undefined),
        PV.kv([["요청자(승인자)", resp.requester === "대기" ? PV.badge("응답 대기") : PV.badge(`${resp.requester}`, "action", "check")], ["업체", resp.vendor === "대기" ? PV.badge("응답 대기") : PV.badge(resp.vendor, "action", "check")], ["변경 사항", req.changeNote || "없음"], ["잠정 예약 만료", req.stage >= 5 ? "-" : "2026-11-08 18:00"]], true),
        req.stage >= 5 ? PV.note(`확정 · 작업지시 ${req.wo} 발행`) : null));
      const accept = (side) => {
        resp[side] = `수락 (v${vendors[0]?.quote?.version || 1})`;
        if (resp.requester !== "대기" && resp.vendor !== "대기") confirm(req, vendors);
        ctx.rerender();
      };
      bar.append(PV.h("span", { class: "bar__info" }, req.stage >= 5 ? `확정 완료 · ${req.wo}` : `응답: 요청자 ${resp.requester} · 업체 ${resp.vendor}`),
        PV.h("div", { class: "bar__actions" }, req.stage >= 5 ? PV.h("button", { class: "btn btn--primary", onClick: () => PV.go("work", { id: req.wo }) }, "작업지시 열기", PV.icon("arrowRight")) : [
          PV.h("button", { class: "btn", onClick: () => PV.dialog({ title: "요청 취소", body: PV.h("p", null, "잠정 예약을 해제하고 담당자에게 알립니다."), actions: [{ label: "돌아가기" }, { label: "요청 취소", primary: true, fn: () => { req.stage = 1; ds.step = 1; req.changeNote = "요청 취소 후 재작성"; PV.toast("요청 취소 · 점유 해제"); ctx.rerender(); } }] }) }, "취소"),
          PV.h("button", { class: "btn", onClick: () => { const inp = PV.h("input", { class: "input", placeholder: "예: 세척 일정을 11-11 오전으로" }); PV.dialog({ title: "변경 요청", body: PV.h("div", { class: "field" }, PV.h("label", null, "변경 내용·사유"), inp), actions: [{ label: "취소" }, { label: "변경 제안", primary: true, fn: () => { req.changeNote = inp.value || "변경 요청"; resp.requester = "대기"; resp.vendor = "대기"; req.stage = 3; ds.step = 3; PV.toast("변경 제안으로 처리 · 기존 범위 보존"); ctx.rerender(); } }] }); } }, "변경 요청"),
          isApprover && resp.requester === "대기" ? PV.h("button", { class: "btn btn--primary", onClick: () => accept("requester") }, PV.icon("check"), "수락") : null,
          (vendorRole || ctx.role === "master") && resp.vendor === "대기" ? PV.h("button", { class: "btn btn--primary", onClick: () => accept("vendor") }, PV.icon("check"), "업체 수락") : null,
          !vendorRole && ctx.role !== "master" && resp.requester !== "대기" && resp.vendor === "대기" ? PV.badge("업체 응답 대기 중", "und", "clock") : null]));
    }
  }

  function confirm(req, vendors) {
    const woId = `WO-${2089 + Object.keys(PV.workOrders).length - 3}`;
    const v = vendors[0];
    const site = PV.sites[req.site];
    const panels = [...req.panels.dmg, ...req.panels.soil];
    PV.workOrders[woId] = { id: woId, site: req.site, service: req.services.join("·"), team: `${PV.orgs[v.org].name} ${v.team}`, vendor: v.org, state: "예정", schedule: req.schedule[v.org] ? `${req.schedule[v.org][0]} ${String(req.schedule[v.org][1]).padStart(2, "0")}:00~${String(req.schedule[v.org][2]).padStart(2, "0")}:00` : "미정", approver: req.approver, reviewer: "박준호", quoteVersion: v.quote ? `v${v.quote.version}` : "현장 확인 후", issuedAt: `${PV.TODAY} ${PV.sim.fmtMin(PV.sim.state.clockMin)}`, inspection: req.inspection, next: "작업 시작",
      scope: `${panels.length}패널 (${req.inspection} 판정 기준)`, note: req.note || "-",
      items: panels.map((p) => ({ id: p, label: `${p} ${req.panels.dmg.includes(p) ? "정비" : "세척"}`, state: "pending", reportedAt: null, evidence: 0, result: "대기", material: "-" })), cost: { base: v.quote ? v.quote.items.reduce((a, [, n, p]) => a + n * p, 0) : 0, extra: 0, tax: "별도" } };
    req.stage = 5; req.wo = woId;
    const t = PV.tasks.find((x) => x.link?.id === req.id); if (t) { t.stage = "확정"; t.next = "작업지시 확인"; t.link = { screen: "work", id: woId }; t.changes.unshift([PV.sim.fmtMin(PV.sim.state.clockMin), `양측 수락 · 작업지시 ${woId} 발행`]); }
    PV.toast(`${req.id} 확정 · 작업지시 ${woId} 발행`, { label: "열기", fn: () => PV.go("work", { id: woId }) });
  }

  function renderQuoteForm(left, req, v) {
    const f = (v.draft = v.draft || { unit: 18000, qty: req.panels.soil.length || 1, extra: 60000, tax: "별도", hours: "2.5" });
    const num = (k, label, hint) => PV.h("div", { class: "field" }, PV.h("label", null, label), PV.h("input", { class: "input", type: "number", min: "0", value: f[k], onInput: (e) => { f[k] = Number(e.target.value); } }), hint ? PV.h("span", { class: "hint" }, hint) : null);
    const body = PV.h("div", { class: "card__body stack" },
      v.quote ? PV.note(`제출된 견적 v${v.quote.version} · ${PV.fmtWon(v.quote.items.reduce((a, [, n, p]) => a + n * p, 0))} · 유효 ${v.quote.valid}`) : null,
      PV.h("div", { class: "form-grid" }, num("unit", "단가 (원/패널)", null), num("qty", "수량 (패널)", null), num("extra", "추가비 (원)", null),
        PV.h("div", { class: "field" }, PV.h("label", null, "세금"), PV.h("select", { class: "select", onChange: (e) => { f.tax = e.target.value; } }, PV.h("option", null, "별도"), PV.h("option", null, "포함"))),
        PV.h("div", { class: "field" }, PV.h("label", null, "제시 작업시간 (시간)"), PV.h("input", { class: "input", value: f.hours, onInput: (e) => { f.hours = e.target.value; } }), PV.h("span", { class: "hint" }, "업체 제시값")),
        PV.h("label", { class: "check span2" }, PV.h("input", { type: "checkbox", onChange: (e) => { f.onsite = e.target.checked; } }), "현장 확인 후 견적")));
    left.append(body, PV.h("div", { class: "card__foot" }, PV.h("button", { class: "btn btn--primary btn--sm", onClick: () => { if (f.onsite) { v.onsite = true; v.response = "현장 확인 후 견적"; } else { v.quote = { version: (v.quote?.version || 0) + 1, items: [[`${v.service} 패널`, f.qty, f.unit], ["추가비", 1, f.extra]], tax: f.tax, valid: "2026-11-15", hours: `${f.hours}시간 (업체 제시)` }; v.response = "견적 제출"; } PV.toast("견적 제출 완료"); ctx.rerender(); } }, PV.icon("send"), "견적 제출")));
  }
};
