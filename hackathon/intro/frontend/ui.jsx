/* 공통 UI: 포맷, 패널, 차트 */
const { useState, useEffect, useRef, useMemo, useCallback } = React;

const fmtN = (v, d = 0) => (isFinite(v) ? v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
// 전력 (입력 MW)
function fmtP(mw, unit, opts = {}) {
  if (unit === 'kW') { const k = mw * 1000; return { v: fmtN(k, opts.kwd ?? (k < 100 ? 1 : 0)), u: 'kW' }; }
  return { v: fmtN(mw, opts.mwd ?? (mw < 10 ? 2 : 1)), u: 'MW' };
}
// 전력량 (입력 MWh)
function fmtE(mwh, unit, opts = {}) {
  if (unit === 'kW') { const k = mwh * 1000; return { v: fmtN(k, opts.kwd ?? 0), u: 'kWh' }; }
  return { v: fmtN(mwh, opts.mwd ?? (mwh < 10 ? 2 : 1)), u: 'MWh' };
}
const PU = ({ x, cls }) => <span className={cls}>{x.v}<small className="u">{x.u}</small></span>;
const hhmm = (t) => { const m = Math.floor(t + 1e-6); return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
const hms = (sec) => { sec = Math.floor(sec); return [Math.floor(sec / 3600) % 24, Math.floor(sec / 60) % 60, sec % 60].map((x) => String(x).padStart(2, '0')).join(':'); };
const won = (v) => (v >= 1e8 ? fmtN(v / 1e8, 2) + '억' : fmtN(v / 1e4, 0) + '만');

const ST = {
  run: { label: '정상', c: 'var(--ok)' },
  warn: { label: '경고', c: 'var(--warn)' },
  fault: { label: '고장', c: 'var(--crit)' },
  comm: { label: '통신두절', c: 'var(--comm)' },
  off: { label: '정지', c: 'var(--tx3)' },
};
const SEV = {
  critical: { label: '긴급', c: 'var(--crit)' },
  major: { label: '중대', c: 'var(--warn)' },
  minor: { label: '경미', c: 'var(--minor)' },
  info: { label: '정보', c: 'var(--tx3)' },
};

function Panel({ title, sub, right, children, className = '', style, bodyStyle }) {
  return (
    <section className={'panel ' + className} style={style}>
      {title && (
        <header className="ph">
          <h3>{title}</h3>
          {sub && <span className="ph-sub">{sub}</span>}
          <div className="ph-r">{right}</div>
        </header>
      )}
      <div className="pb" style={bodyStyle}>{children}</div>
    </section>
  );
}

function Dot({ c, pulse }) { return <i className={'dot' + (pulse ? ' pulse' : '')} style={{ background: c }} />; }
function StatusTag({ st }) { const s = ST[st]; return <span className="tag" style={{ '--c': s.c }}><Dot c={s.c} />{s.label}</span>; }
function SevTag({ sev }) { const s = SEV[sev]; return <span className="sev" style={{ '--c': s.c }}>{s.label}</span>; }

function Bar({ v, c = 'var(--solar)', h = 4 }) {
  return <div className="bar" style={{ height: h }}><i style={{ width: Math.max(0, Math.min(100, v * 100)) + '%', background: c }} /></div>;
}

function useSize() {
  const [s, setS] = useState({ w: 0, h: 0 });
  const roRef = useRef(null);
  const ref = useCallback((el) => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!el) return;
    const measure = () => setS((p) => (p.w === el.clientWidth && p.h === el.clientHeight ? p : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(el); roRef.current = ro;
  }, []);
  useEffect(() => () => roRef.current && roRef.current.disconnect(), []);
  return [ref, s];
}

const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; };

/* 시계열 차트: series = [{key,label,data:[[t,v]],color,kind:'area'|'line'|'dash'|'bars',axis:'l'|'r'}] */
function TimeChart({ series, x0, x1, now, yMaxL, yMaxR, fmtL, fmtR, unitL, unitR, xStep = 60, tooltipFmt, height }) {
  const [ref, { w, h: hh }] = useSize();
  const h = height || hh;
  const [hover, setHover] = useState(null);
  const pad = { l: 46, r: unitR ? 46 : 12, t: 10, b: 22 };
  const iw = Math.max(10, w - pad.l - pad.r), ih = Math.max(10, h - pad.t - pad.b);
  const X = (t) => pad.l + ((t - x0) / (x1 - x0)) * iw;
  const YL = (v) => pad.t + ih - (v / yMaxL) * ih;
  const YR = (v) => pad.t + ih - (v / (yMaxR || 1)) * ih;
  const segs = (d) => { const out = []; let cur = []; d.forEach((p) => { if (p[1] == null) { if (cur.length) out.push(cur); cur = []; } else cur.push(p); }); if (cur.length) out.push(cur); return out; };
  const path = (d, Y) => segs(d).map((sg) => sg.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1)).join('')).join('');
  const gaps = []; series.forEach((s) => { if (s.kind !== 'area') return; const sg = segs(s.data); for (let i = 1; i < sg.length; i++) gaps.push([sg[i - 1][sg[i - 1].length - 1][0], sg[i][0][0]]); });
  const ticks = []; for (let t = Math.ceil(x0 / xStep) * xStep; t <= x1; t += xStep) ticks.push(t);
  const yt = [0, 0.25, 0.5, 0.75, 1];
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * w;
    const t = x0 + ((px - pad.l) / iw) * (x1 - x0);
    if (t < x0 || t > x1) return setHover(null);
    setHover(t);
  };
  const near = (d, t) => { let best = null, bd = 1e9; for (const p of d) { if (p[1] == null) continue; const dd = Math.abs(p[0] - t); if (dd < bd) { bd = dd; best = p; } } return bd < 8 ? best : null; };
  return (
    <div ref={ref} className="chart" style={height ? { height } : null}>
      {w > 0 && (
        <svg width={w} height={h} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {yt.map((f) => (
            <g key={f}>
              <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih * (1 - f)} y2={pad.t + ih * (1 - f)} className="grid" />
              <text x={pad.l - 6} y={pad.t + ih * (1 - f) + 3} className="axl" textAnchor="end">{fmtL(yMaxL * f)}</text>
              {unitR && <text x={w - pad.r + 6} y={pad.t + ih * (1 - f) + 3} className="axl">{fmtR(yMaxR * f)}</text>}
            </g>
          ))}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={X(t)} x2={X(t)} y1={pad.t + ih} y2={pad.t + ih + 4} className="axis" />
              <text x={X(t)} y={h - 6} className="axl" textAnchor="middle">{hhmm(t).slice(0, 2)}</text>
            </g>
          ))}
          <text x={pad.l - 6} y={pad.t - 1} className="axl" textAnchor="end" style={{ display: 'none' }}>{unitL}</text>
          <line x1={pad.l} x2={w - pad.r} y1={pad.t + ih} y2={pad.t + ih} className="axis" />
          {now != null && now > x0 && now < x1 && <rect x={X(now)} y={pad.t} width={Math.max(0, w - pad.r - X(now))} height={ih} className="future" />}
          {series.map((s) => {
            const Y = s.axis === 'r' ? YR : YL;
            if (!s.data.length) return null;
            if (s.kind === 'bars') {
              const bw = Math.max(1, (iw / ((x1 - x0) / (s.step || 60))) * 0.62);
              return <g key={s.key}>{s.data.map((p) => <rect key={p[0]} x={X(p[0] + (s.step || 60) / 2) - bw / 2} y={Y(p[1])} width={bw} height={pad.t + ih - Y(p[1])} fill={s.color} opacity={s.op ?? 0.35} />)}</g>;
            }
            const d = path(s.data, Y);
            if (s.kind === 'area') {
              return (
                <g key={s.key}>
                  {segs(s.data).map((sg, i) => <path key={i} d={path(sg, Y) + `L${X(sg[sg.length - 1][0])},${pad.t + ih}L${X(sg[0][0])},${pad.t + ih}Z`} fill={s.color} opacity={0.16} />)}
                  <path d={d} fill="none" stroke={s.color} strokeWidth={s.sw || 1.8} />
                </g>
              );
            }
            return <path key={s.key} d={d} fill="none" stroke={s.color} strokeWidth={s.sw || 1.3} strokeDasharray={s.kind === 'dash' ? '4 3' : null} opacity={s.op ?? 1} />;
          })}
          {gaps.map(([a, b], i) => (
            <g key={'gap' + i}>
              <rect x={X(a)} y={pad.t} width={X(b) - X(a)} height={ih} className="gapzone" />
              <text x={(X(a) + X(b)) / 2} y={pad.t + 12} textAnchor="middle" className="gaptx">수신 누락</text>
            </g>
          ))}
          {now != null && now > x0 && now < x1 && (
            <g>
              <line x1={X(now)} x2={X(now)} y1={pad.t} y2={pad.t + ih} className="nowline" />
              <rect x={X(now) - 19} y={pad.t} width={38} height={14} className="nowtag" />
              <text x={X(now)} y={pad.t + 10} textAnchor="middle" className="nowtx">{hhmm(now)}</text>
            </g>
          )}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={pad.t + ih} className="cross" />
              {series.filter((s) => s.kind !== 'bars').map((s) => { const p = near(s.data, hover); return p ? <circle key={s.key} cx={X(p[0])} cy={(s.axis === 'r' ? YR : YL)(p[1])} r={3} fill={s.color} stroke="var(--panel)" strokeWidth={1.5} /> : null; })}
            </g>
          )}
        </svg>
      )}
      {hover != null && w > 0 && (
        <div className="tip" style={{ left: Math.min(X(hover) + 10, w - 170), top: 8 }}>
          <div className="tip-t">{hhmm(hover)}</div>
          {series.map((s) => { const p = near(s.data, hover); if (s.kind === 'area' && gaps.some(([a, b]) => hover > a && hover < b)) return <div key={s.key} className="tip-r"><i style={{ background: s.color }} />{s.label}<b style={{ color: 'var(--warn)' }}>결측</b></div>; return p ? <div key={s.key} className="tip-r"><i style={{ background: s.color }} />{s.label}<b>{(tooltipFmt && tooltipFmt[s.key] ? tooltipFmt[s.key] : (v) => fmtN(v, 1))(p[1])}</b></div> : null; })}
        </div>
      )}
    </div>
  );
}

function Legend({ items }) {
  return <div className="legend">{items.map((it) => <span key={it.label}><i className={it.dash ? 'dash' : ''} style={{ background: it.dash ? 'none' : it.c, borderColor: it.c }} />{it.label}</span>)}</div>;
}

function Spark({ data, w = 120, h = 28, c = 'var(--solar)', max }) {
  if (!data.length) return null;
  const m = max || Math.max(...data.map((d) => d[1])) || 1;
  const x0 = data[0][0], x1 = data[data.length - 1][0] || 1;
  const d = data.map((p, i) => (i ? 'L' : 'M') + (((p[0] - x0) / (x1 - x0 || 1)) * w).toFixed(1) + ',' + (h - (p[1] / m) * (h - 2) - 1).toFixed(1)).join('');
  return <svg width={w} height={h} className="spark"><path d={d + `L${w},${h}L0,${h}Z`} fill={c} opacity=".14" /><path d={d} fill="none" stroke={c} strokeWidth="1.3" /></svg>;
}

// 히트맵 셀 색
function heatColor(ratio, open) {
  if (open) return 'var(--crit)';
  if (ratio >= 0.97) return `color-mix(in oklch, var(--ok) ${Math.round(40 + Math.min(1, (ratio - 0.97) / 0.06) * 45)}%, var(--panel2))`;
  if (ratio >= 0.85) return `color-mix(in oklch, var(--warn) ${Math.round(45 + ((0.97 - ratio) / 0.12) * 50)}%, var(--panel2))`;
  return `color-mix(in oklch, var(--crit) ${Math.round(60 + Math.min(1, (0.85 - ratio) / 0.2) * 40)}%, var(--panel2))`;
}

function SourceLine({ children, style }) { return <div className="srcline" style={style}><i className="srcdot" />{children}</div>; }
Object.assign(window, { SourceLine, fmtN, fmtP, fmtE, PU, hhmm, hms, won, ST, SEV, Panel, Dot, StatusTag, SevTag, Bar, useSize, niceMax, TimeChart, Legend, Spark, heatColor });
