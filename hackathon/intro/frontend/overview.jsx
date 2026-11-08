/* 화면 1 — 포트폴리오 종합 */
// 화면 스타일은 배포 HTML에 포함한다. 실행 중 외부 CSS를 다시 불러오지 않는다.
function worstSt(s) { return s.counts.fault ? 'fault' : s.counts.comm ? 'comm' : s.counts.warn ? 'warn' : 'run'; }

function KpiStrip({ snap, unit }) {
  const T = snap.tot;
  const vsFc = T.Efc ? T.E / T.Efc - 1 : 0;
  const vsY = T.Ey ? T.E / T.Ey - 1 : 0;
  return (
    <div className="kpis" style={{ gridColumn: '1 / -1' }}>
      <div className="kpi">
        <label><Dot c="var(--ok)" pulse />현재 발전출력<em>담당 {snap.sites.length}개소</em></label>
        <PU x={fmtP(T.p, unit)} cls="kv xl" />
        <Bar v={T.p / T.cap} h={4} />
        <div className="ksub"><span>설비 <b>{fmtP(T.cap, unit).v}</b> {fmtP(T.cap, unit).u}</span><span>부하율 <b>{fmtN((T.p / T.cap) * 100, 1)}%</b></span><span>예측 <b>{fmtP(T.fc, unit).v}</b></span></div>
      </div>
      <div className="kpi">
        <label>금일 발전량<em>00:00 ~ {hhmm(snap.now)}</em></label>
        <PU x={fmtE(T.E, unit)} cls="kv" />
        <div className="ksub"><span>예측 대비 <b className={vsFc >= 0 ? 'up' : 'dn'}>{vsFc >= 0 ? '+' : ''}{fmtN(vsFc * 100, 1)}%</b></span><span>예측 <b>{fmtE(T.Efc, unit).v}</b></span></div>
        <div className="ksub"><span title="과거 대비 관측 증감 — 원인별 손실·회복 효과가 아님">전일 동시각 <b className={vsY >= 0 ? 'up' : 'dn'}>{vsY >= 0 ? '+' : ''}{fmtN(vsY * 100, 1)}%</b></span><span>누적 <b>{fmtN(T.cum / 1000, 2)}</b> GWh</span></div>
      </div>
      <div className="kpi">
        <label>PR 성능비<em>목표 80.0%</em></label>
        <span className="kv">{fmtN(T.pr * 100, 1)}<small className="u">%</small></span>
        <Bar v={T.pr} c={T.pr >= 0.8 ? 'var(--ok)' : 'var(--warn)'} />
        <div className="ksub"><span>목표 대비 <b className={T.pr >= 0.8 ? 'up' : 'dn'}>{T.pr >= 0.8 ? '+' : ''}{fmtN((T.pr - 0.8) * 100, 1)}%p</b></span></div>
      </div>
      <div className="kpi">
        <label>이용률 · 가동률</label>
        <span className="kv">{fmtN(T.cf * 100, 1)}<small className="u">%</small></span>
        <Bar v={T.invRun / T.invN} c="var(--ok)" />
        <div className="ksub"><span>인버터 가동 <b>{T.invRun}/{T.invN}</b></span><span><b>{fmtN((T.invRun / T.invN) * 100, 1)}%</b></span></div>
      </div>
      <div className="kpi">
        <label>경사면 일사량 (POA)<em>용량가중평균</em></label>
        <span className="kv">{fmtN(T.irr, 0)}<small className="u">W/m²</small></span>
        <div className="ksub"><span>금일 적산 <b>{fmtN(T.H, 2)}</b> kWh/m²</span></div>
        <div className="ksub"><span>일출 07:02</span><span>일몰 17:29</span></div>
      </div>
      <div className="kpi">
        <label>금일 수익 (추정)<em>SMP + REC</em></label>
        <span className="kv">{won(T.rev)}<small className="u">원</small></span>
        <div className="ksub"><span>SMP <b>{fmtN(T.smp, 1)}</b> 원/kWh</span><span>REC <b>{fmtN(SIM.REC)}</b> 원</span></div>
        <div className="ksub"><span>SMP분 <b>{won(T.revSmp)}</b></span><span>REC분 <b>{won(T.revRec)}</b></span></div>
      </div>
      <div className="kpi">
        <label>CO₂ 저감량</label>
        <span className="kv">{fmtN(T.co2, 1)}<small className="u">tCO₂</small></span>
        <div className="ksub"><span>누적 <b>{fmtN(T.co2cum / 1000, 1)}</b> 천 t</span></div>
        <div className="ksub"><span>계수 {SIM.CO2F} tCO₂/MWh</span></div>
      </div>
    </div>
  );
}

function PowerChart({ snap, unit, siteId = 'ALL', height, cmp = 'yday' }) {
  const ids = siteId === 'ALL' ? snap.sites.map((s) => s.id) : siteId;
  const CMPL = { yday: '전일 실측', mavg: '전월 일평균 (2026-10)', yavg: '전년 동분기 일평균 (2025 4Q)' };
  const now = snap.now;
  const x0 = 6 * 60 + 30, x1 = 18 * 60;
  const act = useMemo(() => { const d = SIM.series(ids, 'act', x0, Math.floor(now / 5) * 5, 5); return d; }, [String(ids), Math.floor(now / 5)]);
  const cur = siteId === 'ALL' ? snap.tot.p : snap.sites.find((s) => s.id === siteId).p;
  const fc = useMemo(() => SIM.series(ids, 'fc', x0, x1, 5), [String(ids)]);
  const yd = useMemo(() => SIM.series(ids, cmp, x0, x1, 5), [String(ids), cmp]);
  const irr = useMemo(() => SIM.series(ids, 'irr', x0, Math.floor(now / 5) * 5, 5), [siteId, Math.floor(now / 5)]);
  const hourly = useMemo(() => {
    const out = [];
    for (let h = 7; h < 18; h++) { if (h * 60 >= now) break; const d = SIM.series(ids, 'act', h * 60, Math.min(now, h * 60 + 60), 5); const dv = d.filter((p) => p[1] != null); out.push([h * 60, dv.length ? dv.reduce((a, p) => a + p[1], 0) / dv.length : 0]); }
    return out;
  }, [siteId, Math.floor(now / 60)]);
  const cap = siteId === 'ALL' ? snap.tot.cap : snap.sites.find((s) => s.id === siteId).cap;
  const yMax = niceMax(Math.max(...fc.map((p) => p[1])) * 1.12);
  const k = unit === 'kW' ? 1000 : 1;
  return (
    <TimeChart
      height={height}
      x0={x0} x1={x1} now={now} xStep={60}
      yMaxL={yMax} yMaxR={1000}
      fmtL={(v) => fmtN(v * k, 0)} fmtR={(v) => fmtN(v, 0)} unitL={unit} unitR="W/m²"
      series={[
        { key: 'hr', label: '시간대 평균', data: hourly, color: 'var(--solar)', kind: 'bars', step: 60, op: 0.13 },
        { key: 'irr', label: '일사량', data: irr, color: 'var(--irr)', kind: 'line', axis: 'r', op: 0.75, sw: 1.1 },
        { key: 'yd', label: CMPL[cmp], data: yd, color: 'var(--tx3)', kind: 'line', sw: 1, op: 0.7 },
        { key: 'fc', label: '예측 출력', data: fc, color: 'var(--fc)', kind: 'dash', sw: 1.4 },
        { key: 'act', label: '실측 출력', data: (siteId !== 'ALL' && SIM.inGap(SIM.SITES.find((x) => x.id === siteId), now)) ? act : [...act, [now, cur]], color: 'var(--solar)', kind: 'area', sw: 2 },
      ]}
      tooltipFmt={{ yd: (v) => fmtP(v, unit).v + ' ' + fmtP(v, unit).u, act: (v) => fmtP(v, unit).v + ' ' + fmtP(v, unit).u, fc: (v) => fmtP(v, unit).v + ' ' + fmtP(v, unit).u, irr: (v) => fmtN(v, 0) + ' W/m²', hr: (v) => fmtP(v, unit).v + ' ' + fmtP(v, unit).u }}
    />
  );
}

function WeatherPanel({ snap }) {
  const T = snap.tot, S = snap.sites;
  const capW = (k) => S.reduce((a, s) => a + s[k] * s.cap, 0) / T.cap;
  const now = snap.now;
  const mod = useMemo(() => SIM.series('ALL', 'mod', 6 * 60 + 30, Math.floor(now / 5) * 5, 5), [Math.floor(now / 5)]);
  const air = useMemo(() => SIM.series('ALL', 'air', 6 * 60 + 30, Math.floor(now / 5) * 5, 5), [Math.floor(now / 5)]);
  return (
    <Panel title="기상 · 모듈 환경" sub="용량가중평균" right={<Legend items={[{ label: '모듈온도', c: 'var(--irr)' }, { label: '기온', c: 'var(--fc)' }]} />} bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="statbox" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <div><label>일사량 POA</label><b>{fmtN(T.irr, 0)}<small>W/m²</small></b></div>
        <div><label>모듈 온도</label><b>{fmtN(capW('modT'), 1)}<small>℃</small></b></div>
        <div><label>외기 온도</label><b>{fmtN(capW('air'), 1)}<small>℃</small></b></div>
        <div><label>풍속</label><b>{fmtN(capW('wind'), 1)}<small>m/s</small></b></div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <TimeChart x0={6 * 60 + 30} x1={18 * 60} now={now} xStep={120} yMaxL={50} fmtL={(v) => fmtN(v, 0) + '°'}
          series={[{ key: 'mod', label: '모듈온도', data: mod, color: 'var(--irr)', kind: 'line', sw: 1.6 }, { key: 'air', label: '기온', data: air, color: 'var(--fc)', kind: 'line', sw: 1.4 }]}
          tooltipFmt={{ mod: (v) => fmtN(v, 1) + ' ℃', air: (v) => fmtN(v, 1) + ' ℃' }} />
      </div>
    </Panel>
  );
}

function InverterMatrix({ snap, onPick }) {
  const c = snap.tot.counts;
  return (
    <Panel title="인버터 상태" sub={`${snap.tot.invN}대`} right={
      <div className="legend">{['run', 'warn', 'fault', 'comm', 'off'].map((k) => <span key={k}><Dot c={ST[k].c} />{ST[k].label} <b className="mono" style={{ color: 'var(--tx)' }}>{c[k]}</b></span>)}</div>
    }>
      <div className="invgrid">
        {snap.sites.map((s) => (
          <div className="invrow" key={s.id}>
            <label>{s.name}</label>
            <div className="cells">
              {s.invs.map((v) => {
                const bg = v.st === 'run' ? `color-mix(in oklch, var(--ok) ${Math.round(45 + v.load * 55)}%, var(--panel2))` : ST[v.st].c;
                return <div key={v.id} className="cell" style={{ background: bg }} title={`${v.tag} · ${ST[v.st].label} · ${fmtN(v.ac * 1000, 0)} kW`} onClick={() => onPick(s.id, v.id)}>{v.no}</div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SiteTable({ snap, unit, onPick, canOpen }) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLocaleLowerCase();
  const sites = snap.sites.filter((s) => [s.name, s.id, s.region].some((value) => String(value == null ? '' : value).toLocaleLowerCase().includes(term)));
  return (
    <Panel className="overview-sites" title="발전소별 현황" sub={canOpen ? '행 클릭 또는 Enter로 상세 보기' : null} right={<>
      <label className="overview-search">발전소 검색<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="이름 · ID · 지역" /></label>
      <span className="mini mono overview-site-count" role="status" aria-live="polite">{sites.length} / {snap.sites.length}개소</span>
      <span className="mini mono">갱신 {hms(snap.now * 60)}</span>
    </>}>
      <div className="overview-site-scroll scroll" role="region" aria-label="발전소별 현황 목록" tabIndex={0}>
      <table className="t" aria-label="발전소별 발전 및 수신 현황">
        <thead><tr>
          <th>발전소</th><th className="r">설비용량</th><th className="r">현재 출력</th><th style={{ width: 90 }}>부하율</th><th className="r">금일 발전량</th><th className="r">예측대비</th><th className="r">PR</th><th className="r">일사량</th><th className="r">인버터</th><th>금일 추이</th><th>상태</th>
        </tr></thead>
        <tbody>
          {sites.map((s) => {
            const vs = s.Efc ? s.E / s.Efc - 1 : 0; const ws = worstSt(s);
            return (
              <tr key={s.id} tabIndex={canOpen ? 0 : undefined} aria-label={canOpen ? `${s.name} 상세 보기` : undefined} onKeyDown={(e) => { if (canOpen && e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); onPick(s.id); } }} onClick={() => canOpen && onPick(s.id)} style={{ height: 52, cursor: canOpen ? 'pointer' : 'default' }}>
                <td style={{ height: 52 }}><div style={{ fontWeight: 600 }}>{s.name}{s.gap && <span className="gaptag" title={`수신 누락 ${hhmm(s.gap[0])}~${hhmm(s.gap[1])}`}>누락 {s.gapMin}분</span>}</div><div className="mini">{s.region} · {s.type}</div></td>
                <td className="r num">{fmtN(s.cap, 1)}<small className="u">MW</small></td>
                <td className="r num" style={{ color: 'var(--solar)', fontSize: 'calc(14px * var(--text-scale, 1))' }}><PU x={fmtP(s.p, unit)} /></td>
                <td><Bar v={s.p / s.cap} /><div className="mini mono" style={{ marginTop: 3 }}>{fmtN((s.p / s.cap) * 100, 1)}%</div></td>
                <td className="r num"><PU x={fmtE(s.E, unit)} /></td>
                <td className={'r num ' + (vs >= -0.03 ? '' : 'dn')}>{vs >= 0 ? '+' : ''}{fmtN(vs * 100, 1)}%</td>
                <td className={'r num ' + (s.pr < 0.78 ? 'dn' : '')}>{fmtN(s.pr * 100, 1)}%</td>
                <td className="r num">{fmtN(s.irr, 0)}</td>
                <td className="r num">{s.invRun}<span style={{ color: 'var(--tx3)' }}>/{s.inv}</span></td>
                <td><SiteSpark id={s.id} now={snap.now} cap={s.cap} /></td>
                <td><StatusTag st={ws} /><div className="mini mono" style={{ marginTop: 2 }}>수신 {hms(s.lastRx)}</div></td>
              </tr>
            );
          })}
          {!sites.length && <tr><td colSpan={11} className="overview-empty">검색 결과가 없습니다. 이름 · ID · 지역을 확인해 주세요.</td></tr>}
        </tbody>
      </table>
      </div>
    </Panel>
  );
}
function SiteSpark({ id, now, cap }) {
  const d = useMemo(() => SIM.series(id, 'act', 6 * 60 + 40, Math.floor(now / 10) * 10, 10), [id, Math.floor(now / 10)]);
  return <Spark data={d} w={110} h={26} max={cap * 0.72} />;
}

function AlarmFeed({ alarms, onPick, onAll, canOpen }) {
  const active = alarms.filter((a) => a.state !== '해제');
  const unack = alarms.filter((a) => a.state === '미확인').length;
  const bySev = (k) => active.filter((a) => a.sev === k).length;
  const list = [...active, ...alarms.filter((a) => a.state === '해제')].slice(0, 40);
  return (
    <Panel title="알람 · 이벤트" sub={`미확인 ${unack}건`} right={canOpen ? <button className="btn" style={{ padding: '3px 10px' }} onClick={onAll}>전체 보기</button> : <span className="mini">조회 전용</span>} style={{ gridRow: 'span 2' }} bodyStyle={{ display: 'flex', flexDirection: 'column', paddingTop: 10 }}>
      <div className="statbox" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 6 }}>
        {['critical', 'major', 'minor', 'info'].map((k) => <div key={k}><label style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot c={SEV[k].c} />{SEV[k].label}</label><b style={{ color: k !== 'info' && bySev(k) ? SEV[k].c : null }}>{bySev(k)}</b></div>)}
      </div>
      <div className="mini" style={{ padding: '6px 0 2px' }}>활성 알람 우선 · 최근순</div>
      <div className="feed scroll" style={{ flex: 1, minHeight: 0 }}>
        {list.map((a) => (
          <div key={a.id} className={'fi' + (a.isNew ? ' new' : '')} onClick={() => onPick(a.id)} style={{ opacity: a.state === '해제' ? 0.55 : 1 }}>
            <span className="mono">{hms(a.ts)}</span>
            <span><SevTag sev={a.sev} /></span>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontWeight: a.state === '미확인' ? 600 : 400 }}>{a.msg}</p>
              <p className="s">{a.siteName} · <span className="mono">{a.eq}</span> · {a.state}</p>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function NeedPanel({ snap, canReq, onReq, style }) {
  const now = snap.now;
  const rows = useMemo(() => snap.sites.map((s) => {
    const d = SIM.series(s.id, 'mavg', SIM.SR, Math.max(SIM.SR, Math.floor(now / 5) * 5), 5);
    const base = d.reduce((a, p) => a + p[1], 0) * 5 / 60;
    const r = base > 0 ? s.E / base - 1 : 0;
    const lv = r >= -0.1 ? 0 : r >= -0.25 ? 1 : 2;
    const week = Array.from({ length: 7 }, (_, i) => (i === 6 ? r : -0.03 + 0.05 * Math.sin(i * 1.7 + s.ph * 3) - (lv ? 0.02 * i : 0)));
    return { s, r, lv, week };
  }), [snap.sites.map((s) => s.id).join(','), Math.floor(now / 5)]);
  const [sel, setSel] = useState(0);
  const cur = rows[Math.min(sel, rows.length - 1)];
  const LV = [['정상', 'var(--ok)'], ['유의', 'var(--warn)'], ['점검', 'var(--crit)']];
  if (!cur) return null;
  return (
    <Panel title="패널 점검 필요도" sub="전월 평균 같은 시간대 대비 · 관측 증감" style={style} bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{rows.map((x, i) => <button key={x.s.id} className={'chip' + (x === cur ? ' on' : '')} style={{ padding: '3px 9px', fontSize: 'calc(12px * var(--text-scale, 1))' }} onClick={() => setSel(i)}><Dot c={LV[x.lv][1]} />{x.s.name}</button>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px', gap: 14, alignItems: 'end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span className="kv" style={{ fontSize: 'calc(26px * var(--text-scale, 1))', color: LV[cur.lv][1] }}>{cur.r >= 0 ? '+' : ''}{fmtN(cur.r * 100, 1)}<small className="u">%</small></span><b style={{ color: LV[cur.lv][1] }}>{LV[cur.lv][0]}</b></div>
          <div className="gauge">{LV.map((l, i) => <span key={i} className={i <= cur.lv ? 'on' : ''} style={{ '--c': LV[cur.lv][1] }} />)}</div>
          <div className="mini" style={{ display: 'flex', justifyContent: 'space-between' }}><span>정상 ≥ −10%</span><span>유의 −10~−25%</span><span>점검 &lt; −25%</span></div>
        </div>
        <div>
          <div className="mini" style={{ marginBottom: 4 }}>최근 7일</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 40 }}>{cur.week.map((w, i) => <div key={i} style={{ flex: 1, height: Math.max(3, Math.min(40, Math.abs(w) * 140)), background: w >= -0.1 ? 'var(--ok)' : w >= -0.25 ? 'var(--warn)' : 'var(--crit)', opacity: i === 6 ? 1 : 0.55, borderRadius: 1 }} />)}</div>
        </div>
      </div>
      {cur.lv === 1 && <Note kind="warn">유의 — 같은 시간대 발전량이 전월 평균보다 낮습니다. 일사·운영 조건 차이일 수 있습니다.</Note>}
      {cur.s.gap && <Note kind="info">수신 누락 {hhmm(cur.s.gap[0])}~{hhmm(cur.s.gap[1])} 구간은 적산에서 제외되어 증감에 반영됩니다.</Note>}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="mini">관측 증감이며 오염·파손 등 원인을 판정하지 않습니다</span>
        {canReq && cur.lv === 2 && <button className="btn pri" style={{ marginLeft: 'auto' }} onClick={() => onReq(cur.s.id)}>점검 요청</button>}
      </div>
    </Panel>
  );
}

function Overview({ snap, unit, alarms, go, can, role, onInspReq }) {
  const [cmp, setCmp] = useState('yday');
  const [detailTab, setDetailTab] = useState('sites');
  const showAlarms = can('alarms');
  const tabs = [['sites', '발전소별 현황'], ...(showAlarms ? [['alarms', '알람']] : []), ['need', '점검 필요'], ['inverters', '인버터 상태']];
  const activeTab = tabs.some(([key]) => key === detailTab) ? detailTab : 'sites';
  const tabKeyDown = (e, key) => {
    const index = tabs.findIndex(([id]) => id === key);
    const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1;
    if (next < 0) return;
    e.preventDefault();
    setDetailTab(tabs[next][0]);
    e.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
  };
  return (
    <div className="pgrid overview-dashboard">
      <KpiStrip snap={snap} unit={unit} />
      <div className="overview-chart">
      <Panel title="발전전력 추이" sub="오늘 5분 표본 · 비교선" right={<>
        <div className="seg">{[['yday', '전일'], ['mavg', '전월 평균'], ['yavg', '전년 동분기']].map(([k, l]) => <button key={k} className={cmp === k ? 'on' : ''} onClick={() => setCmp(k)}>{l}</button>)}</div>
        <Legend items={[{ label: '실측', c: 'var(--solar)' }, { label: '예측', c: 'var(--fc)', dash: true }, { label: '비교선', c: 'var(--tx3)' }, { label: '일사량 (우축)', c: 'var(--irr)' }]} /></>} bodyStyle={{ padding: '10px 10px 4px 4px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, minHeight: 0 }}><PowerChart snap={snap} unit={unit} cmp={cmp} /></div>
          <div className="overview-source">
             <SourceLine>출처 <b>합성 시뮬레이션 전력 표</b></SourceLine>
             <SourceLine>최근 표본 <b>{hms(snap.tot.lastRx)}</b></SourceLine>
             {snap.tot.gaps.length > 0 && <span className="overview-gap" tabIndex={0} title={`수신 누락 ${snap.tot.gaps.map((g) => `${g.name} ${hhmm(g.from)}~${hhmm(g.to)}`).join(', ')} · 0 치환 없이 적산 제외`} aria-label={`수신 누락 ${snap.tot.gaps.map((g) => `${g.name} ${hhmm(g.from)}~${hhmm(g.to)}`).join(', ')} · 0 치환 없이 적산 제외`}>수신 누락 {snap.tot.gaps.length}개소</span>}
             <details className="overview-source-details"><summary>산출 기준</summary><SourceLine>발전량 = 5분 표본 사다리꼴 적분 · 비교는 관측 증감</SourceLine></details>
          </div>
        </div>
      </Panel>
      </div>
      <div className="overview-weather"><WeatherPanel snap={snap} /></div>
      <div className="overview-detail">
        <div className="overview-detail-tabs" role="tablist" aria-label="발전소 운영 상세">
          {tabs.map(([key, label]) => <button type="button" key={key} id={`overview-tab-${key}`} role="tab" aria-selected={activeTab === key} aria-controls={`overview-content-${key}`} tabIndex={activeTab === key ? 0 : -1} onClick={() => setDetailTab(key)} onKeyDown={(e) => tabKeyDown(e, key)}>{label}</button>)}
        </div>
        {tabs.map(([key]) => <div key={key} className="overview-detail-content" id={`overview-content-${key}`} role="tabpanel" aria-labelledby={`overview-tab-${key}`} tabIndex={0} hidden={activeTab !== key}>
          {key === 'sites' && <SiteTable snap={snap} unit={unit} canOpen={can('detail')} onPick={(id) => go('home', { tab: 'detail', site: id })} />}
          {key === 'alarms' && <AlarmFeed alarms={alarms} canOpen={showAlarms} onPick={(id) => go('home', { tab: 'alarms', alarm: id })} onAll={() => go('home', { tab: 'alarms' })} />}
          {key === 'need' && <NeedPanel snap={snap} canReq={canDo(role, 'inspReq')} onReq={onInspReq} />}
          {key === 'inverters' && <InverterMatrix snap={snap} onPick={(sid, iid) => can('detail') && go('home', { tab: 'detail', site: sid, inv: iid })} />}
        </div>)}
      </div>
    </div>
  );
}

function OverviewOld({ snap, unit, alarms, go, can }) {
  return (
    <div className="main" style={{ gridTemplateColumns: '1fr 520px 420px', gridTemplateRows: 'auto 1fr auto' }}>
      <KpiStrip snap={snap} unit={unit} />
      <Panel title="발전 출력 추이" sub="실측 · 예측 · 전일 · 5분 순간 표본" right={<Legend items={[{ label: '실측 출력', c: 'var(--solar)' }, { label: '예측 출력', c: 'var(--fc)', dash: true }, { label: '전일 실측', c: 'var(--tx3)' }, { label: '일사량 (우축, W/m²)', c: 'var(--irr)' }, { label: '시간대 평균', c: 'color-mix(in oklch, var(--solar) 35%, transparent)' }]} />} bodyStyle={{ padding: '10px 10px 4px 4px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flex: 1, minHeight: 0 }}><PowerChart snap={snap} unit={unit} /></div>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 18, rowGap: 3, padding: '6px 0 2px 46px' }}>
            <SourceLine>출처 <b>시뮬레이션 RTU 전력 표</b></SourceLine>
            <SourceLine>마지막 수신 <b>{hms(snap.tot.lastRx)}</b></SourceLine>
            {snap.tot.gaps.length > 0 && <SourceLine style={{ color: 'var(--warn)' }}>수신 누락 {snap.tot.gaps.map((g) => `${g.name} ${hhmm(g.from)}~${hhmm(g.to)}`).join(', ')} · 0 치환 없이 적산 제외</SourceLine>}
            <SourceLine>발전량 = 5분 표본 사다리꼴 적분</SourceLine>
          </div>
        </div>
      </Panel>
      <WeatherPanel snap={snap} />
      <AlarmFeed alarms={alarms} canOpen={can('alarms')} onPick={(id) => go('alarms', { alarm: id })} onAll={() => go('alarms')} />
      <SiteTable snap={snap} unit={unit} canOpen={can('detail')} onPick={(id) => go('detail', { site: id })} />
      <InverterMatrix snap={snap} onPick={(sid, iid) => can('detail') && go('detail', { site: sid, inv: iid })} />
    </div>
  );
}

Object.assign(window, { Overview, PowerChart, worstSt });
