/* SUP-01 설정 · SUP-02 알림·업무함 · SUP-03 시뮬레이션 제어 */
window.PV = window.PV || {};

/* ---------- 설정 ---------- */
PV.screens.settings = function (page, ctx) {
  const st = ctx.state;
  const groups = Object.keys(PV.settings);
  st.group = ctx.params.group || st.group || groups[0];
  const items = PV.settings[st.group];
  st.item = st.item && items[st.item] ? st.item : 0;
  const perm = { "발전소·패널": ["owner", "epc", "master"], "조직·계정": ["master"], "업체·자원": ["maint", "total", "master"], "위임·승인": ["owner", "master"], "운영 규칙": ["master"] };
  const canEdit = perm[st.group].includes(ctx.role);
  page.append(PV.titleBar("설정", null, [PV.h("div", { class: "seg", role: "group", "aria-label": "설정 그룹" }, ...groups.map((g) => PV.h("button", { "aria-pressed": String(g === st.group), onClick: () => { st.group = g; st.item = 0; ctx.rerender(); } }, g)))]));
  const body = PV.h("div", { class: "body body--split" });
  const left = PV.h("div", { class: "card pane pane--list" });
  left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, st.group), PV.h("span", { class: "muted" }, `${items.length}건`)));
  left.append(PV.h("div", { class: "card__body card__body--flush rows" }, ...items.map((it, i) => PV.h("button", { class: "row", "aria-selected": String(i === st.item), onClick: () => { st.item = i; ctx.rerender(); } }, PV.h("span", { class: "row__icon" }, PV.icon(st.group === "조직·계정" ? "user" : st.group === "업체·자원" ? "layers" : st.group === "운영 규칙" ? "sliders" : "grid")), PV.h("span", null, PV.h("div", { class: "row__title" }, it.name), PV.h("div", { class: "row__sub" }, it.sub)), PV.h("span", { class: "row__meta" }, it.meta)))));
  const sel = items[st.item];
  const right = PV.h("div", { class: "card pane pane--detail" });
  right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "선택 항목 편집")), PV.h("div", { class: "card__body stack" },
    PV.h("div", { class: "field" }, PV.h("label", null, "이름"), PV.h("input", { class: "input", value: sel.name, disabled: !canEdit })),
    PV.h("div", { class: "field" }, PV.h("label", null, "내용"), PV.h("textarea", { class: "textarea", disabled: !canEdit }, sel.sub)),
    PV.h("div", { class: "field" }, PV.h("label", null, "메타"), PV.h("input", { class: "input", value: sel.meta, disabled: !canEdit })),
    canEdit ? null : PV.note(`편집 권한 없음 · ${perm[st.group].map((r) => PV.roles[r].label).join("·")}`, "warn")));
  body.append(left, right);
  page.append(body, PV.h("footer", { class: "bar" }, PV.h("span", { class: "bar__info" }, `${st.group} · ${sel.name}`), PV.h("div", { class: "bar__actions" }, PV.h("button", { class: "btn btn--primary", disabled: !canEdit, onClick: () => PV.toast("저장 · 변경 이력 기록") }, "저장"))));
};

/* ---------- 알림·업무함 ---------- */
PV.screens.inbox = function (page, ctx) {
  const st = ctx.state;
  const list = PV.myNotifications();
  st.sel = ctx.params.task ? (list.find((n) => n.task === ctx.params.task)?.id || st.sel) : st.sel;
  const sel = list.find((n) => n.id === st.sel) || list[0];
  const label = (ctx.def.menuLabels && ctx.def.menuLabels.inbox) || "알림·업무함";
  page.append(PV.titleBar(label, `미읽음 ${list.filter((n) => n.unread).length}건`, [PV.newResultsChip(ctx), PV.h("button", { class: "btn btn--sm", onClick: () => { list.forEach((n) => { n.unread = false; }); ctx.rerender(); } }, "모두 읽음")]));
  const body = PV.h("div", { class: "body body--split" });
  const left = PV.h("div", { class: "card pane pane--list" });
  left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "내 알림"), PV.h("span", { class: "muted" }, `${list.length}건`)));
  if (!list.length) left.append(PV.h("div", { class: "empty" }, PV.h("h3", null, "알림이 없습니다")));
  else left.append(PV.h("div", { class: "card__body card__body--flush rows" }, ...list.map((n) => PV.h("button", { class: `row${n.unread ? " row--unread" : ""}`, "aria-selected": String(sel?.id === n.id), onClick: () => { st.sel = n.id; n.unread = false; ctx.rerender(); } }, PV.h("span", { class: "row__icon" }, PV.icon("bell")), PV.h("span", null, PV.h("div", { class: "row__title" }, n.cause), PV.h("div", { class: "row__sub" }, `${n.task} · 담당 ${n.who} · 다음: ${n.next}`)), PV.h("span", { class: "row__meta mono" }, n.at)))));
  const right = PV.h("div", { class: "card pane pane--detail" });
  if (sel) {
    const t = PV.tasks.find((x) => x.id === sel.task);
    right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "알림 상세")), PV.h("div", { class: "card__body stack" }, PV.kv([["발생 원인", sel.cause], ["관련 업무", t ? `${t.id} · ${t.title}` : sel.task], ["발전소", t ? PV.sites[t.site].name : "-"], ["현재 담당자", sel.who], ["다음 행동", sel.next], ["시각", sel.at]], true), t ? PV.whoBox(t.assigneeLabel, t.next, t.approver, t.reviewer) : null));
  }
  body.append(left, right);
  const t = sel && PV.tasks.find((x) => x.id === sel.task);
  page.append(body, PV.h("footer", { class: "bar" }, PV.h("span", { class: "bar__info" }, sel ? `${sel.task} · ${sel.next}` : ""), PV.h("div", { class: "bar__actions" }, PV.h("button", { class: "btn btn--primary", disabled: !t, onClick: () => PV.openTask(t) }, "관련 업무 열기", PV.icon("arrowRight")))));
};

/* ---------- 시뮬레이션 제어 ---------- */
PV.screens.sim = function (page, ctx) {
  const s = PV.sim.state;
  page.classList.add("page--nobar");
  page.append(PV.titleBar("시뮬레이션 제어", "데모 운영자용 · 실제 운영 자료에 영향 없음", [PV.badge("데모 전용", "ink")]));
  const body = PV.h("div", { class: "body sim-grid" });
  const left = PV.h("div", { class: "card pane" });
  const right = PV.h("div", { class: "card pane" });
  body.append(left, right); page.append(body);

  const clockStat = PV.stat({ label: "시뮬레이션 시각", value: PV.sim.fmtMin(s.clockMin), sub: `시작 ${PV.sim.fmtMin(PV.SIM_START_MIN)} · 1초 = 1분 × ${s.speed}` });
  const countStat = PV.stat({ label: "처리 이벤트", value: s.applied.length, unit: "건", sub: `중복 무시 ${s.ignored.dup} · 역순 무시 ${s.ignored.stale}` });
  const playBtn = PV.h("button", { class: "btn", onClick: () => { if (PV.sim.state.running) PV.sim.pause(); else PV.sim.start(); } });
  const speedSeg = PV.h("div", { class: "seg", role: "group", "aria-label": "배속" }, ...[1, 2, 5].map((x) => PV.h("button", { "data-speed": x, "aria-pressed": String(s.speed === x), onClick: () => PV.sim.setSpeed(x) }, `${x}×`)));
  const runLabel = PV.h("span", { class: "mono muted" }, `RUN-${String(s.runId).padStart(2, "0")}`);
  const scnHint = PV.h("span", { class: "hint" }, PV.sim.scenarios[s.scenario].desc);
  const syncControls = () => {
    runLabel.textContent = `RUN-${String(s.runId).padStart(2, "0")}`;
    clockStat.querySelector(".stat__value").textContent = PV.sim.fmtMin(s.clockMin);
    clockStat.querySelector(".stat__sub").textContent = `시작 ${PV.sim.fmtMin(PV.SIM_START_MIN)} · 1초 = 1분 × ${s.speed}`;
    countStat.querySelector(".stat__value").firstChild.textContent = s.applied.length;
    countStat.querySelector(".stat__sub").textContent = `중복 무시 ${s.ignored.dup} · 역순 무시 ${s.ignored.stale}`;
    playBtn.innerHTML = ""; playBtn.className = s.running ? "btn" : "btn btn--primary";
    playBtn.append(PV.icon(s.running ? "pause" : "play"), s.running ? "일시정지" : "시작");
    speedSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.speed) === s.speed)));
    scnHint.textContent = PV.sim.scenarios[s.scenario].desc;
  };
  const drawLeft = () => {
    left.innerHTML = "";
    left.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "실행"), runLabel));
    const scn = PV.h("select", { class: "select", "aria-label": "시나리오", onChange: (e) => { PV.sim.reset(e.target.value); } }, ...Object.entries(PV.sim.scenarios).map(([k, v]) => PV.h("option", { value: k, selected: k === s.scenario }, v.label)));
    left.append(PV.h("div", { class: "card__body stack" },
      PV.h("div", { class: "strip strip--2" }, clockStat, countStat),
      PV.h("div", { class: "field" }, PV.h("label", null, "시나리오 (변경 시 새 실행 ID로 초기화)"), scn, scnHint),
      PV.h("div", { class: "hstack" }, playBtn, speedSeg,
        PV.h("button", { class: "btn", onClick: () => PV.dialog({ title: "초기화", body: PV.h("p", null, "실행 데이터를 초기화하고 새 실행 ID를 발급합니다."), actions: [{ label: "취소" }, { label: "초기화", primary: true, fn: () => PV.sim.reset() }] }) }, PV.icon("reset"), "초기화")),
      PV.h("div", { class: "divider" }),
      PV.h("div", { class: "section-title" }, "역할 체험 (데모 전용)"),
      PV.h("div", { class: "role-grid" }, ...Object.values(PV.roles).map((r) => PV.h("button", { class: "role-card", "aria-pressed": String(ctx.role === r.key), onClick: () => PV.setRole(r.key) }, PV.h("b", null, r.label), PV.h("span", null, `${PV.users[r.key].name} · ${PV.orgs[r.org].name}`))))));
    syncControls();
  };
  const log = PV.h("div", { class: "card__body log", "aria-live": "off" });
  const drawRight = () => {
    log.innerHTML = "";
    if (!s.log.length) log.append(PV.h("div", { class: "muted", style: { display: "block", border: 0 } }, "아직 처리된 이벤트가 없습니다."));
    s.log.forEach((l) => log.append(PV.h("div", { class: l.ignored ? "ignored" : null }, PV.h("span", { class: "t" }, l.t), PV.h("span", { class: "k" }, l.type), PV.h("span", null, `${l.target} · ${l.id}${l.ignored ? " · " + l.ignored : ""}`))));
  };
  right.append(PV.h("div", { class: "card__head" }, PV.h("h2", null, "이벤트 로그"), PV.h("span", { class: "muted" }, "시뮬레이션 시각 · 중복·역순은 취소선")), log, PV.h("div", { class: "card__foot" }, PV.h("span", null, `시간표 ${PV.sim.timeline.length}건`)));
  drawLeft(); drawRight();
  ctx.live(() => { syncControls(); drawRight(); });
};
