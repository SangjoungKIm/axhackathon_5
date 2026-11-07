/* 패널 배치도 SVG: 가상 배치 (실제 좌표·GPS 없음). 선택·판정·경로·진행 표시 */
window.PV = window.PV || {};

PV.siteMap = function (siteId, opt = {}) {
  const site = PV.sites[siteId];
  const panels = PV.panelsOf(siteId);
  const obs = opt.obs || {};
  const PW = 22, PH = 14, GAP = 3, ZGAP = 26, PADX = 24, PADY = 28;
  const zoneW = site.cols * (PW + GAP) - GAP;
  const zoneH = site.rows * (PH + GAP) - GAP;
  const perRow = site.zones.length > 3 ? 3 : site.zones.length;
  const zrows = Math.ceil(site.zones.length / perRow);
  const W = PADX * 2 + perRow * zoneW + (perRow - 1) * ZGAP;
  const H = PADY * 2 + zrows * zoneH + (zrows - 1) * ZGAP + 6;

  const wrap = PV.h("div", { class: "map" });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `${site.name} 패널 배치도`);
  let vb = { x: 0, y: 0, w: W, h: H };
  const setVb = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  setVb();
  svg.innerHTML = `<defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="#EEF1F5"/><rect width="2" height="5" fill="#C2CAD6"/></pattern></defs>`;

  const pos = {};
  site.zones.forEach((z, zi) => {
    const zx = PADX + (zi % perRow) * (zoneW + ZGAP);
    const zy = PADY + Math.floor(zi / perRow) * (zoneH + ZGAP);
    const lbl = document.createElementNS("http://www.w3.org/2000/svg", "text");
    lbl.setAttribute("x", zx); lbl.setAttribute("y", zy - 8); lbl.setAttribute("class", "zone-label"); lbl.textContent = `${z} 구역`;
    svg.append(lbl);
    panels.filter((p) => p.zone === z).forEach((p) => {
      const x = zx + (p.col - 1) * (PW + GAP), y = zy + (p.row - 1) * (PH + GAP);
      pos[p.id] = { x: x + PW / 2, y: y + PH / 2 };
      const o = obs[p.id];
      const j = opt.noJudg ? "ok" : (o?.j || (opt.undefinedDefault ? "und" : "ok"));
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "panel" + (opt.dimFn && opt.dimFn(p, o) ? " dim" : ""));
      g.dataset.j = j; g.dataset.id = p.id;
      g.setAttribute("role", "button"); g.setAttribute("tabindex", "0");
      g.setAttribute("aria-label", `${p.id} ${PV.judgLabel[j]}${opt.checked?.has(p.id) ? " 선택됨" : ""}`);
      if (opt.selected === p.id) g.setAttribute("aria-selected", "true");
      let inner = `<rect x="${x}" y="${y}" width="${PW}" height="${PH}" rx="1.5"/>`;
      if (opt.checked?.has(p.id)) inner += `<rect x="${x - 1.5}" y="${y - 1.5}" width="${PW + 3}" height="${PH + 3}" rx="2.5" fill="none" stroke="#1F4FBF" stroke-width="1.5"/>`;
      if (j === "soil") inner += `<g class="mark"><circle cx="${x + 5}" cy="${y + 4}" r=".9"/><circle cx="${x + 10}" cy="${y + 7}" r=".9"/><circle cx="${x + 15}" cy="${y + 4}" r=".9"/><circle cx="${x + 8}" cy="${y + 10}" r=".9"/></g>`;
      if (j === "dmg") inner += `<path class="mark" d="M${x + 7} ${y + 2} l3 4 -2 2 4 4"/>`;
      if (j === "und") inner += `<text x="${x + PW / 2}" y="${y + PH / 2 + 2.5}" text-anchor="middle" style="font-size:7px;fill:#65718A">?</text>`;
      if (opt.progress) {
        const st = opt.progress(p);
        if (st === "done") inner += `<path d="M${x + 7} ${y + 7} l3 3 5-6" fill="none" stroke="#1F4FBF" stroke-width="1.6" stroke-linecap="round"/>`;
        if (st === "fail") inner += `<path d="M${x + 7} ${y + 4} l8 6 M${x + 15} ${y + 4} l-8 6" fill="none" stroke="#B42318" stroke-width="1.6" stroke-linecap="round"/>`;
        if (st === "current") inner += `<rect x="${x - 1.5}" y="${y - 1.5}" width="${PW + 3}" height="${PH + 3}" rx="2.5" fill="none" stroke="#152033" stroke-width="1.5"/>`;
      }
      if (opt.labels) inner += `<text x="${x + PW / 2}" y="${y + PH + 7}" text-anchor="middle">${p.id}</text>`;
      g.innerHTML = inner;
      if (opt.onPick) {
        g.addEventListener("click", (e) => opt.onPick(p, e));
        g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); opt.onPick(p, e); } });
      }
      svg.append(g);
    });
  });

  /* 촬영 경로: 계획 좌표 기반 (실제 GPS 아님) */
  if (opt.route) {
    const order = panels.map((p) => p.id);
    const pts = order.map((id) => pos[id]);
    const d = pts.map((pt, i) => `${i ? "L" : "M"}${pt.x} ${pt.y}`).join(" ");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d); path.setAttribute("fill", "none"); path.setAttribute("stroke", "#152033"); path.setAttribute("stroke-width", "1"); path.setAttribute("stroke-dasharray", "3 2"); path.setAttribute("opacity", ".65"); path.style.pointerEvents = "none";
    svg.append(path);
    const start = pts[0];
    const s = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    s.setAttribute("cx", start.x); s.setAttribute("cy", start.y); s.setAttribute("r", "3.2"); s.setAttribute("fill", "#1F4FBF");
    svg.append(s);
    if (opt.routePos !== undefined && opt.routePos < pts.length) {
      const c = pts[opt.routePos];
      const cur = document.createElementNS("http://www.w3.org/2000/svg", "g");
      cur.innerHTML = `<circle cx="${c.x}" cy="${c.y}" r="6" fill="none" stroke="#152033" stroke-width="1.5"/><circle cx="${c.x}" cy="${c.y}" r="2" fill="#152033"/>`;
      cur.style.pointerEvents = "none";
      svg.append(cur);
    }
  }

  wrap.append(svg);

  /* 확대·축소·맞춤 */
  const zoom = (f) => { const cx = vb.x + vb.w / 2, cy = vb.y + vb.h / 2; vb.w = Math.min(W * 1.5, Math.max(W / 4, vb.w / f)); vb.h = vb.w * (H / W); vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2; setVb(); };
  const fit = () => { vb = { x: 0, y: 0, w: W, h: H }; setVb(); };
  wrap.append(PV.h("div", { class: "map__tools" },
    PV.h("button", { class: "icon-btn", "aria-label": "확대", onClick: () => zoom(1.3) }, PV.icon("plus")),
    PV.h("button", { class: "icon-btn", "aria-label": "축소", onClick: () => zoom(1 / 1.3) }, PV.icon("minus")),
    PV.h("button", { class: "icon-btn", "aria-label": "전체 맞춤", onClick: fit }, PV.icon("fit"))));

  // 드래그 이동 (키보드·버튼 대안은 위 도구와 목록 보기)
  let drag = null;
  svg.addEventListener("pointerdown", (e) => { if (e.target.closest(".panel")) return; drag = { x: e.clientX, y: e.clientY, vx: vb.x, vy: vb.y }; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener("pointermove", (e) => { if (!drag) return; const r = svg.getBoundingClientRect(); const k = vb.w / r.width; vb.x = drag.vx - (e.clientX - drag.x) * k; vb.y = drag.vy - (e.clientY - drag.y) * k; setVb(); });
  svg.addEventListener("pointerup", () => { drag = null; });

  if (!opt.noLegend) wrap.append(PV.h("div", { class: "map__legend" }, PV.badge("외관 정상", "ok"), PV.judgBadge("soil"), PV.judgBadge("dmg"), PV.judgBadge("und")));
  wrap.append(PV.h("div", { class: "map__src" }, PV.badge(opt.srcLabel || "가상 배치 · 실제 좌표 없음", "src")));
  return wrap;
};
