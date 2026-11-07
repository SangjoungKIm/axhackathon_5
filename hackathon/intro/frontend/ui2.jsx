/* 업무 화면 공통 컴포넌트: 대화상자 · 탭 · 단계 · 페이지 · 이미지 자리 · 양식 */
function Modal({ title, sub, onClose, children, actions, width = 560 }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return (
    <div className="mdl-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mdl" style={{ width }} role="dialog" aria-label={title}>
        <header className="ph" style={{ height: 48, flexShrink: 0 }}><h3 style={{ fontSize: 'calc(15px * var(--text-scale, 1))' }}>{title}</h3>{sub && <span className="ph-sub">{sub}</span>}<div className="ph-r"><button className="btn" style={{ padding: '3px 9px' }} onClick={onClose} aria-label="닫기">✕</button></div></header>
        <div className="mdl-b" style={{ minHeight: 0 }}>{children}</div>
        {actions && <footer className="mdl-f" style={{ flexShrink: 0 }}>{actions}</footer>}
      </div>
    </div>
  );
}
function Tabs({ items, value, onChange, right }) {
  return (
    <div className="tabs" role="tablist">
      {items.map(([k, l, n]) => <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}{n != null && <span className="mono tabn">{n}</span>}</button>)}
      {right && <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>}
    </div>
  );
}
function Steps({ items, cur, done = [], onPick }) {
  return (
    <div className="steps">
      {items.map((l, i) => {
        const st = done.includes(i) ? 'done' : i === cur ? 'cur' : i < cur ? 'done' : '';
        return <button key={l} className={'step ' + st} onClick={() => onPick && onPick(i)} disabled={!onPick}><span className="mono">{st === 'done' ? '✓' : i + 1}</span>{l}</button>;
      })}
    </div>
  );
}
function Pager({ page, total, per, onPage }) {
  const n = Math.max(1, Math.ceil(total / per));
  return (
    <div className="pager">
      <span className="mini mono">{total ? (page - 1) * per + 1 : 0}–{Math.min(total, page * per)} / {total}</span>
      <button className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
      <span className="mono mini">{page} / {n}</span>
      <button className="btn" disabled={page >= n} onClick={() => onPage(page + 1)}>›</button>
    </div>
  );
}
function ImgSlot({ label, sub, h = 160, style }) {
  return <div className="imgslot" style={{ height: h, ...style }}><span className="mono">{label}</span>{sub && <span className="mini">{sub}</span>}</div>;
}
// 알 수 없는 컴포넌트나 업무 액션은 접지 않고, 읽을 수 있는 안내만 접습니다.
function guidanceText(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) {
    const parts = node.map(guidanceText);
    return parts.some((part) => part === null) ? null : parts.join('');
  }
  if (!React.isValidElement(node)) return null;
  const { type, props } = node;
  if (type !== React.Fragment && (typeof type !== 'string' || !/^(span|b|strong|em|i|small|code|br|p|div|ul|ol|li)$/.test(type))) return null;
  if (props.role || props.tabIndex != null || props.contentEditable || Object.keys(props).some((key) => /^on[A-Z]/.test(key))) return null;
  return type === 'br' ? '\n' : guidanceText(props.children);
}
const guidanceWrap = { minWidth: 0, maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere', wordBreak: 'normal' };
function Guidance({ children, limit, summary, className, detailsClassName }) {
  const ref = React.useRef(null);
  const [inAlert, setInAlert] = React.useState(true);
  React.useLayoutEffect(() => {
    setInAlert(Boolean(ref.current && ref.current.closest('[role~="alert"]')));
  });
  const text = guidanceText(children);
  const fold = !inAlert && text !== null && Array.from(text.trim()).length > limit;
  return <div ref={ref} className={fold ? undefined : className} style={guidanceWrap}>{fold ? <details className={detailsClassName || className}><summary style={{ cursor: 'pointer' }}>{summary}</summary><div style={guidanceWrap}>{children}</div></details> : children}</div>;
}
function Field({ label, req, children, err, hint }) {
  return (
    <div className="fld" style={guidanceWrap}><label style={{ display: 'flex', flexDirection: 'column', gap: 5, ...guidanceWrap }}><span className="fld-l">{label}{req && <em> *</em>}</span>{children}</label>{err ? <span className="fld-e" style={guidanceWrap}>{err}</span> : hint ? <div className="fld-h" style={guidanceWrap}><Guidance limit={30} summary="도움말" className="inline-help">{hint}</Guidance></div> : null}</div>
  );
}
function Note({ kind = 'warn', children }) {
  return kind === 'info' ? <Guidance limit={35} summary="안내" className="note note-info" detailsClassName="compact-note note note-info">{children}</Guidance> : <div className={'note note-' + kind} style={guidanceWrap}>{children}</div>;
}
function Src({ k, title }) {
  const original = { replay: '원천 로그 재생', synth: '합성 시뮬레이션', input: '사용자 입력', model: '분석 결과 (시연 자료)' };
  const short = { replay: '로그', synth: '시연', input: '입력', model: '시연 분석' };
  const label = short[k] || (typeof k === 'string' && /외부 결과/.test(k) ? '외부 결과' : typeof k === 'string' && /등록 자료|사용자.*실제.*자료/.test(k) ? '등록 자료' : k);
  return <span className="src" title={title == null ? original[k] || k : title} style={guidanceWrap}>{label}</span>;
}
function Judg({ j }) {
  const m = { ok: ['외관 정상', 'var(--tx3)'], soil: ['오염', 'var(--warn)'], dmg: ['육안상 파손', 'var(--crit)'], und: ['미판정', 'var(--tx3)'] };
  return <span className={'judg judg-' + j} style={{ '--c': m[j][1] }}>{j === 'soil' ? '◐' : j === 'dmg' ? '▲' : j === 'und' ? '?' : '○'} {m[j][0]}</span>;
}
function NoPerm({ text = '실행 권한이 없습니다' }) { return <span className="mini" style={{ color: 'var(--tx3)' }}>🔒 {text}</span>; }
function TitleBar({ title, meta, back, children }) {
  return (
    <div className="tbar">
      {back && <button className="crumb" onClick={back.fn}>{back.label} ›</button>}
      <h1>{title}</h1>
      {meta && <details className="title-meta" style={guidanceWrap}><summary>상세</summary><div className="title-meta-body" style={guidanceWrap}>{meta}</div></details>}
      <div className="tbar-r">{children}</div>
    </div>
  );
}
const won2 = (v) => (v == null ? '견적 미제출' : fmtN(v, 0) + '원');
const quoteSum = (q) => (q ? q.items.reduce((a, it) => a + it[1] * it[2], 0) : null);

Object.assign(window, { Modal, Tabs, Steps, Pager, ImgSlot, Field, Note, Src, Judg, NoPerm, TitleBar, won2, quoteSum });
