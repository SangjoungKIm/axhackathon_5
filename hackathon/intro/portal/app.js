/* 앱 틀: 역할·맥락·라우팅·실시간 반영 */
window.PV = window.PV || {};
PV.screens = PV.screens || {};
PV.uiState = PV.uiState || {}; // 화면별 필터·페이지·선택 복원용

PV.app = {
  role: Object.hasOwn(PV.roles,localStorage.getItem("pv.role")) ? localStorage.getItem("pv.role") : "owner",
  site: localStorage.getItem("pv.site") || "",
  navMin: false,
  route: { screen: null, params: {} },
  liveFns: [],
  drafts: {} // 맥락별 초안 (발전소 변경 시 자동 연결 금지)
};

const SCREEN_META = {
  home:     { label: "홈·대시보드", icon: "home" },
  drone:    { label: "드론 점검",   icon: "drone" },
  panels:   { label: "패널 상태",   icon: "grid" },
  schedule: { label: "일정·배정",   icon: "calendar" },
  work:     { label: "작업·검수",   icon: "clipboard" },
  inbox:    { label: "알림·업무함", icon: "bell" },
  settings: { label: "설정",        icon: "settings" },
  sim:      { label: "시뮬레이션 제어", icon: "sliders" }
};

PV.roleDef = () => PV.roles[PV.app.role];
PV.user = () => PV.users[PV.app.role];
PV.allowedSites = () => PV.roleDef().sites;
PV.siteLabel = (id) => (id ? PV.sites[id].name : "전체 발전소");
PV.myNotifications = () => PV.notifications.filter((n) => {
  const site=n.site||PV.tasks.find(t=>t.id===n.task)?.site;
  return n.roles.includes(PV.app.role)&&(!site||PV.allowedSites().includes(site))&&(!PV.app.site||!site||site===PV.app.site);
});

PV.go = function (screen, params = {}) {
  const q = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  location.hash = `#/${screen}${q ? "?" + q : ""}`;
};

function parseHash() {
  const m = location.hash.match(/^#\/([a-z]+)(?:\?(.*))?$/);
  if (!m) return null;
  const params = {};
  (m[2] || "").split("&").filter(Boolean).forEach((kv) => { const [k, v] = kv.split("="); params[decodeURIComponent(k)] = decodeURIComponent(v || ""); });
  return { screen: m[1], params };
}

/* 역할 변경 (SUP-03 데모 전용) */
PV.setRole = function (role) {
  if (PV.app.role === role) return;
  PV.app.role = role;
  localStorage.setItem("pv.role", role);
  PV.app.drafts = {}; // 이전 사용자 초안 폐기
  PV.uiState = {};
  if (PV.app.site && !PV.allowedSites().includes(PV.app.site)) PV.setSite("");
  PV.renderShell();
  PV.go(PV.roleDef().home);
};

PV.setSite = function (site) {
  const prev = PV.app.site;
  if (prev === site) return;
  const hasDraft = Object.keys(PV.app.drafts).length > 0;
  const commit = () => {
    PV.app.site = site;
    localStorage.setItem("pv.site", site);
    Object.keys(PV.uiState).forEach((k) => { delete PV.uiState[k].selected; delete PV.uiState[k].checked; });
    if (PV.app.route.screen === "panels") { PV.uiState.panels = {}; PV.go("panels", site ? {site} : {}); }
    PV.renderShell();
    PV.renderRoute();
  };
  if (!hasDraft) return commit();
  PV.dialog({
    title: "발전소 변경",
    body: PV.h("p", null, `${PV.siteLabel(prev)}에서 작성 중인 초안이 있습니다. 새 발전소로 자동 연결되지 않습니다. 초안을 보관하고 이동할까요?`),
    actions: [
      { label: "초안 폐기 후 이동", fn: () => { PV.app.drafts = {}; commit(); } },
      { label: "초안 보관 후 이동", primary: true, fn: () => commit() }
    ]
  });
};

/* 좌측 메뉴·상단 바 */
PV.renderShell = function () {
  const app = document.getElementById("app");
  app.dataset.nav = PV.app.navMin ? "min" : "full";
  const def = PV.roleDef();
  const user = PV.user();
  const nav = app.querySelector(".nav");
  const unread = PV.myNotifications().filter((n) => n.unread).length;

  nav.innerHTML = "";
  nav.append(
    PV.h("div", { class: "nav__brand" }, PV.h("span", { class: "nav__mark", "aria-hidden": "true" }, PV.icon("sun")),
      PV.h("div", null, PV.h("div", { class: "nav__name" }, "PV 점검·유지보수"), PV.h("span", { class: "nav__role" }, def.label))),
    PV.h("nav", { class: "nav__list", "aria-label": "주 메뉴" },
      ...def.menu.map((key) => {
        const meta = SCREEN_META[key];
        const label = (def.menuLabels && def.menuLabels[key]) || meta.label;
        return PV.h("button", { class: "nav__item", "aria-current": PV.app.route.screen === key ? "page" : null, title: label, onClick: () => PV.go(key) },
          PV.icon(meta.icon), PV.h("span", null, label), key === "inbox" && unread ? PV.h("span", { class: "badge badge--count" }, unread) : null);
      }),
      PV.app.role !== "master" ? [PV.h("div", { class: "nav__sep" }), PV.h("button", { class: "nav__item", "aria-current": PV.app.route.screen === "sim" ? "page" : null, title: "시뮬레이션 제어 (데모)", onClick: () => PV.go("sim") }, PV.icon("sliders"), PV.h("span", null, "시뮬레이션 제어"))] : null),
    PV.h("div", { class: "nav__foot" }, PV.h("button", { class: "nav__item", "aria-label": PV.app.navMin ? "메뉴 펼치기" : "메뉴 접기", onClick: () => { PV.app.navMin = !PV.app.navMin; PV.renderShell(); } }, PV.icon(PV.app.navMin ? "chevronRight" : "chevronLeft"), PV.h("span", null, "메뉴 접기")))
  );

  const top = app.querySelector(".top");
  top.innerHTML = "";
  const sel = PV.h("select", { class: "ctx-select", "aria-label": "조직·발전소 선택", onChange: (e) => PV.setSite(e.target.value) },
    PV.h("option", { value: "" }, `전체 발전소 (${PV.allowedSites().length})`),
    ...PV.allowedSites().map((s) => PV.h("option", { value: s }, PV.sites[s].name)));
  sel.value = PV.app.site;
  const simState = PV.sim.state;
  top.append(
    PV.h("div", { class: "top__ctx" }, PV.h("span", { class: "small muted" }, PV.orgs[def.org].name), sel),
    PV.h("div", { class: "top__spacer" }),
    PV.h("button", { class: "sim-badge", "data-state": simState.running ? "running" : "paused", onClick: () => PV.go("sim"), title: "시뮬레이션 제어 열기" },
      PV.h("i", { class: "sim-badge__dot" }), PV.h("span", null, "시뮬레이션"), PV.h("span", { class: "mono", id: "sim-clock" }, `RUN-${String(simState.runId).padStart(2, "0")} · ${PV.sim.fmtMin(simState.clockMin)}`)),
    PV.h("button", { class: "icon-btn", "aria-label": `알림 ${unread}건`, onClick: () => PV.go("inbox") }, PV.icon("bell"), unread ? PV.h("span", { class: "icon-btn__count" }, unread) : null),
    PV.h("div", { class: "top__user" }, PV.h("span", { class: "avatar", "aria-hidden": "true" }, user.name.slice(0, 1)), PV.h("span", null, `${user.name} · ${user.title}`))
  );
};

/* 화면 렌더 */
PV.renderRoute = function () {
  const aliases={"#drone":"drone","#overview":"home","#logs":"work"};
  if(aliases[location.hash]){PV.go(aliases[location.hash]);return;}
  const r = parseHash();
  const def = PV.roleDef();
  if (!r || !PV.screens[r.screen]) { PV.go(def.home); return; }
  const allowed = def.menu.includes(r.screen) || r.screen === "sim";
  PV.app.route = r;
  PV.app.liveFns = [];
  const main = document.querySelector(".main");
  main.innerHTML = "";
  const page = PV.h("section", { class: "page", "aria-label": SCREEN_META[r.screen].label });
  main.append(page);
  PV.renderShell();
  if (!allowed) {
    page.classList.add("page--nobar");
    page.append(PV.h("header", { class: "title" }, PV.h("h1", null, "권한 없음")),
      PV.h("div", { class: "body" }, PV.h("div", { class: "empty" }, PV.h("h3", null, "이 화면을 볼 권한이 없습니다"), PV.h("p", null, `${def.label} 역할에는 ${SCREEN_META[r.screen].label} 메뉴가 없습니다.`), PV.h("button", { class: "btn", onClick: () => PV.go(def.home) }, "홈으로"))));
    return;
  }
  PV.uiState[r.screen] = PV.uiState[r.screen] || {};
  const ctx = { role: PV.app.role, def, user: PV.user(), site: PV.app.site, params: r.params, state: PV.uiState[r.screen],
    rerender: () => PV.renderRoute(), live: (fn) => PV.app.liveFns.push(fn), sites: PV.app.site ? [PV.app.site] : PV.allowedSites() };
  PV.screens[r.screen](page, ctx);
  requestAnimationFrame(() => { const first = page.querySelector(".title h1"); if (first) { first.setAttribute("tabindex", "-1"); } });
};

/* 제목 바 공통: 새 결과 반영 칩 */
PV.titleBar = function (title, meta, tools, opt = {}) {
  const el = PV.h("header", { class: "title" }, opt.back ? PV.h("span", { class: "crumb" }, PV.h("button", { onClick: opt.back.fn }, opt.back.label), PV.icon("chevronRight")) : null,
    PV.h("h1", null, title), meta ? PV.h("span", { class: "title__meta" }, meta) : null, PV.h("div", { class: "title__tools" }, tools));
  return el;
};
PV.newResultsChip = function (ctx) {
  const n = PV.sim.state.pendingNew;
  const chip = PV.h("button", { class: "chip", "aria-pressed": "false", id: "new-results", style: n ? null : { display: "none" }, onClick: () => { PV.sim.ackNew(); ctx.rerender(); } }, PV.icon("retry"), `새 결과 ${n}건 · 반영`);
  return chip;
};

/* 시뮬레이션 틱 → 상단 시계와 화면별 라이브 영역만 갱신 (선택·입력 유지) */
PV.sim.subscribe((s) => {
  const clock = document.getElementById("sim-clock");
  if (clock) clock.textContent = `RUN-${String(s.runId).padStart(2, "0")} · ${PV.sim.fmtMin(s.clockMin)}`;
  const badge = document.querySelector(".sim-badge");
  if (badge) badge.dataset.state = s.running ? "running" : "paused";
  const chip = document.getElementById("new-results");
  if (chip) { chip.style.display = s.pendingNew ? "" : "none"; chip.lastChild.textContent = `새 결과 ${s.pendingNew}건 · 반영`; }
  PV.app.liveFns.forEach((fn) => { try { fn(s); } catch (e) { console.error(e); } });
});

window.addEventListener("hashchange", PV.renderRoute);
window.addEventListener("DOMContentLoaded", () => {
  PV.renderShell();
  if (!location.hash) PV.go(PV.roleDef().home); else PV.renderRoute();
  window.addEventListener("keydown", (e) => { if (e.key === "Escape") { const open = [...document.querySelectorAll("dialog[open]")].at(-1); if (open) { e.preventDefault(); open.close(); open.remove(); } } });
});
