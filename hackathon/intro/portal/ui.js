/* UI 보조: 요소 생성, 아이콘, 공통 컴포넌트 */
window.PV = window.PV || {};
PV.screens = PV.screens || {};

/* append()에 null·false·배열이 섞여도 안전하게 */
(function () { const orig = Element.prototype.append; Element.prototype.append = function (...a) { return orig.apply(this, a.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false)); }; })();

PV.h = function (tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  const add = (c) => {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) return c.forEach(add);
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  };
  children.forEach(add);
  return el;
};

/* 아이콘 (Lucide 스타일 스트로크) */
const ICON_PATHS = {
  home: '<path d="M3 11 12 3l9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  drone: '<circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="m7 7 2 2m6-2-2 2M7 17l2-2m6 2-2-2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4a2 2 0 0 1 6 0M9 12h6M9 16h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  play: '<path d="m6 4 14 8-14 8z"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  square: '<rect x="5" y="5" width="14" height="14" rx="1"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  fit: '<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>',
  alert: '<path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  route: '<circle cx="6" cy="19" r="3"/><circle cx="18" cy="5" r="3"/><path d="M12 19h4.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H12"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  dust: '<circle cx="7" cy="8" r="1"/><circle cx="12" cy="6" r="1"/><circle cx="17" cy="9" r="1"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="14" r="1"/><circle cx="11" cy="18" r="1"/>',
  crack: '<path d="m6 3 4 7-3 3 5 4-2 4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  arrowRight: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  retry: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 12 10 5 10-5M2 17l10 5 10-5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  sliders: '<path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M1 14h6m2-6h6m2 8h6"/>'
};
PV.icon = function (name, cls) {
  const p = ICON_PATHS[name] || ICON_PATHS.info;
  const span = document.createElement("span");
  span.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${cls ? ` class="${cls}"` : ""}>${p}</svg>`;
  return span.firstChild;
};

/* 배지 */
PV.badge = function (text, kind, iconName) {
  return PV.h("span", { class: `badge${kind ? " badge--" + kind : ""}` }, iconName ? PV.icon(iconName) : null, text);
};
PV.judgBadge = function (j) {
  const icon = { soil: "dust", dmg: "crack", und: "help" }[j];
  return PV.badge(PV.judgLabel[j], j, icon);
};
PV.srcBadge = function (src) { return PV.badge(`출처: ${src}`, "src"); };

/* 토스트 */
PV.toast = function (msg, action) {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) { wrap = PV.h("div", { class: "toast-wrap", role: "status", "aria-live": "polite" }); document.body.append(wrap); }
  const t = PV.h("div", { class: "toast" }, msg, action ? PV.h("button", { class: "link-btn", onClick: () => { action.fn(); t.remove(); } }, action.label) : null);
  wrap.append(t);
  setTimeout(() => t.remove(), action ? 8000 : 3500);
};

/* 대화상자 */
PV.dialog = function ({ title, body, actions }) {
  const dlg = PV.h("dialog", { class: "modal" });
  const close = () => { dlg.close(); dlg.remove(); };
  dlg.append(
    PV.h("div", { class: "modal__head" }, title, PV.h("button", { class: "icon-btn", "aria-label": "닫기", onClick: close }, PV.icon("x"))),
    PV.h("div", { class: "modal__body" }, body),
    PV.h("div", { class: "modal__foot" }, ...(actions || []).map((a) => PV.h("button", { class: `btn${a.primary ? " btn--primary" : ""}`, onClick: () => { const ok = a.fn ? a.fn(dlg) : true; if (ok !== false) close(); } }, a.label)))
  );
  document.body.append(dlg);
  dlg.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  dlg.showModal();
  return dlg;
};

/* 탭 (WAI-ARIA, 방향키 지원) */
PV.tabs = function (items, current, onChange, extraClass) {
  const list = PV.h("div", { class: `tabs${extraClass ? " " + extraClass : ""}`, role: "tablist" });
  items.forEach((it, i) => {
    const b = PV.h("button", { class: "tab", role: "tab", "aria-selected": String(it.key === current), tabindex: it.key === current ? "0" : "-1", onClick: () => onChange(it.key) },
      it.label, it.count !== undefined ? PV.h("span", { class: "count" }, it.count) : null);
    b.addEventListener("keydown", (e) => {
      const btns = [...list.querySelectorAll(".tab")];
      let n = null;
      if (e.key === "ArrowRight") n = (i + 1) % btns.length;
      if (e.key === "ArrowLeft") n = (i - 1 + btns.length) % btns.length;
      if (e.key === "Home") n = 0; if (e.key === "End") n = btns.length - 1;
      if (n !== null) { e.preventDefault(); btns[n].focus(); }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(it.key); }
    });
    list.append(b);
  });
  return list;
};

/* 단계 표시 */
PV.stepper = function (steps, current, opt = {}) {
  const el = PV.h("div", { class: "stepper", "aria-label": "단계" });
  steps.forEach((s, i) => {
    if (i) el.append(PV.h("i", { class: "stepper__gap" }));
    const n = i + 1;
    const skip = opt.skip && opt.skip.includes(n);
    el.append(PV.h(opt.onPick ? "button" : "span", { class: "step", "aria-current": n === current ? "step" : null, "data-done": String(n < current && !skip), "data-skip": String(!!skip), onClick: opt.onPick ? () => opt.onPick(n) : null },
      PV.h("span", { class: "step__n" }, n < current && !skip ? PV.icon("check") : String(n)), s + (skip ? " (적용 없음)" : "")));
  });
  return el;
};

/* 표 + 페이지 이동 */
PV.table = function ({ columns, rows, rowKey, selected, onSelect, page = 1, pageSize = 6, onPage, emptyText, checks, onCheck, checkedSet }) {
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(page, pages);
  const slice = rows.slice((p - 1) * pageSize, p * pageSize);
  const wrap = PV.h("div", { class: "table-wrap" });
  if (!total) {
    wrap.append(PV.h("div", { class: "empty" }, PV.h("h3", null, emptyText?.title || "결과가 없습니다"), PV.h("p", null, emptyText?.desc || "")));
  } else {
    const thead = PV.h("thead", null, PV.h("tr", null,
      checks ? PV.h("th", { class: "check" }, PV.h("span", { class: "sr-only" }, "선택")) : null,
      ...columns.map((c) => PV.h("th", { class: c.num ? "num" : null, style: c.width ? { width: c.width } : null }, c.label))));
    const tbody = PV.h("tbody");
    slice.forEach((r) => {
      const key = rowKey(r);
      const tr = PV.h("tr", { tabindex: "0", "aria-selected": String(key === selected), onClick: () => onSelect && onSelect(r), onKeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect && onSelect(r); } } });
      if (checks) {
        const cb = PV.h("input", { type: "checkbox", "aria-label": `${key} 선택`, onClick: (e) => { e.stopPropagation(); onCheck(r, e.target.checked); } });
        cb.checked = checkedSet?.has(key) || false;
        tr.append(PV.h("td", { class: "check" }, cb));
      }
      columns.forEach((c) => { const v = c.render ? c.render(r) : r[c.key]; tr.append(PV.h("td", { class: [c.num ? "num" : "", c.primary ? "primary" : "", c.wrap ? "wrap" : ""].join(" ").trim() || null }, v)); });
      tbody.append(tr);
    });
    wrap.append(PV.h("table", { class: "tbl" }, thead, tbody));
  }
  const pager = PV.h("div", { class: "pager" },
    PV.h("span", null, `전체 ${total}건`),
    PV.h("span", { class: "spacer" }),
    pages > 1 ? [
      PV.h("button", { "aria-label": "이전 페이지", disabled: p <= 1, onClick: () => onPage(p - 1) }, PV.icon("chevronLeft")),
      PV.h("span", null, `${p} / ${pages}`),
      PV.h("button", { "aria-label": "다음 페이지", disabled: p >= pages, onClick: () => onPage(p + 1) }, PV.icon("chevronRight"))
    ] : null);
  return { wrap, pager, pages };
};

/* 요약 띠 항목 */
PV.stat = function ({ label, value, unit, sub, hero, pressed, onClick }) {
  const tag = onClick ? "button" : "div";
  return PV.h(tag, { class: "stat", "aria-pressed": onClick ? String(!!pressed) : null, onClick },
    PV.h("span", { class: "stat__label" }, label),
    PV.h("span", { class: `stat__value${hero ? " is-hero" : ""}` }, value, unit ? PV.h("small", null, unit) : null),
    sub ? PV.h("span", { class: "stat__sub" }, sub) : null);
};

/* 정의 목록 */
PV.kv = function (pairs, wide) {
  const dl = PV.h("dl", { class: `kv${wide ? " kv--wide" : ""}` });
  pairs.forEach(([k, v]) => { if (v === undefined || v === null) return; dl.append(PV.h("dt", null, k), PV.h("dd", null, v)); });
  return dl;
};

/* 담당자·다음 행동 상자 (모든 업무 상세의 같은 위치) */
PV.whoBox = function (owner, next, approver, reviewer) {
  return PV.h("div", { class: "who" },
    PV.h("div", { class: "who__box" }, PV.h("div", { class: "lbl" }, "현재 담당자"), PV.h("div", { class: "val" }, owner || "미배정")),
    PV.h("div", { class: "who__box" }, PV.h("div", { class: "lbl" }, "다음 행동"), PV.h("div", { class: "val" }, next || "-")),
    approver !== undefined ? PV.h("div", { class: "who__box" }, PV.h("div", { class: "lbl" }, "승인자"), PV.h("div", { class: "val" }, approver || "미지정")) : null,
    reviewer !== undefined ? PV.h("div", { class: "who__box" }, PV.h("div", { class: "lbl" }, "검수자"), PV.h("div", { class: "val" }, reviewer || "미지정")) : null);
};

/* 안내 */
PV.note = function (text, kind, iconName) { return PV.h("div", { class: `note${kind ? " note--" + kind : ""}` }, PV.icon(iconName || (kind === "dmg" ? "alert" : "info")), PV.h("span", null, text)); };

/* 시연용 패널 이미지 (실제 사진 없음 → 시연 자료로 표기) */
PV.panelFrame = function (obs, opt = {}) {
  const j = obs?.j || "ok";
  const cells = [];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) cells.push(`<rect x="${12 + c * 17.6}" y="${12 + r * 17.6}" width="16" height="16" fill="#2B3F5C" stroke="#1B2740" stroke-width=".6"/>`);
  let mark = "";
  if (j === "soil") mark = `<g fill="#E3B45A" opacity=".85"><ellipse cx="78" cy="48" rx="26" ry="14"/><ellipse cx="120" cy="80" rx="18" ry="9"/><circle cx="60" cy="95" r="6"/></g>`;
  if (j === "dmg") mark = `<path d="M110 30 l-14 22 10 12 -20 20 8 16" fill="none" stroke="#FEE4E2" stroke-width="2.2" stroke-linejoin="round"/><rect x="88" y="26" width="38" height="78" fill="none" stroke="#FFC940" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  if (j === "und") mark = `<rect x="0" y="0" width="200" height="130" fill="url(#noise)"/><text x="100" y="70" text-anchor="middle" font-size="12" fill="#CBD2CD" font-family="Pretendard Variable, sans-serif">이미지 없음</text>`;
  const svg = `<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><pattern id="noise" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#2A3346"/><rect width="3" height="3" fill="#333D52"/></pattern></defs><rect width="200" height="130" fill="#1B2335"/>${j === "und" ? "" : cells.join("")}${mark}</svg>`;
  const frame = PV.h("div", { class: `frame${opt.small ? " frame--sm" : ""}`, html: svg });
  frame.append(PV.badge(opt.label || "시연 자료", "ink"));
  return frame;
};

PV.fmtWon = (n) => n.toLocaleString("ko-KR") + "원";
PV.fmtNum = (n, d = 1) => Number(n).toLocaleString("ko-KR", { maximumFractionDigits: d, minimumFractionDigits: d });
