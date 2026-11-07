/* 화면 2 — 발전소 / 인버터 상세 */
function SiteTabs({ snap, site, setSite, unit }) {
  return (
    <div className="sitetabs" style={{ gridTemplateColumns: `repeat(${snap.sites.length}, 1fr)` }}>
      {snap.sites.map((s) => (
        <button key={s.id} className={'stab' + (s.id === site ? ' on' : '')} onClick={() => setSite(s.id)}>
          <span className="nm"><Dot c={ST[worstSt(s)].c} />{s.name}</span>
          <span className="meta"><span>{fmtN(s.cap, 1)} MW · {s.type}</span><b><PU x={fmtP(s.p, unit)} /></b></span>
        </button>
      ))}
    </div>
  );
}

function StringHeat({ s, invSel, setInv }) {
  const N = SIM.NSTR;
  const [hov, setHov] = useState(null);
  const ref = s.invs.find((v) => v.on && v.imp > 0)?.imp || 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
      <div className="heat" style={{ gridTemplateColumns: `58px repeat(${N}, 1fr)`, gridTemplateRows: `14px repeat(${s.inv}, minmax(0, 1fr))`, flex: 1, minHeight: 0 }}>
        <span />
        {Array.from({ length: N }, (_, k) => <span key={k} className="hlab" style={{ justifyContent: 'center' }}>{k % 2 === 0 ? String(k + 1).padStart(2, '0') : ''}</span>)}
        {s.invs.map((v) => (
          <React.Fragment key={v.id}>
            <span className="hlab" style={{ color: v.id === invSel ? 'var(--tx)' : null, fontWeight: v.id === invSel ? 600 : 400, cursor: 'pointer' }} onClick={() => setInv(v.id)}>INV-{v.no}</span>
            {v.strings.map((a, k) => {
              const r = ref ? a / ref : 0;
              const off = !v.on;
              const bg = off ? 'var(--panel2)' : heatColor(r, a === 0 && ref > 0);
              return <div key={k} className="hc" style={{ backgroundColor: bg, outline: v.id === invSel ? '1px solid color-mix(in oklch, var(--tx) 35%, transparent)' : null, backgroundImage: off ? 'repeating-linear-gradient(45deg, transparent 0 3px, var(--line) 3px 4px)' : null }}
                onMouseEnter={() => setHov({ v, k, a, r })} onMouseLeave={() => setHov(null)} onClick={() => setInv(v.id)} />;
            })}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 'calc(11.5px * var(--text-scale, 1))', color: 'var(--tx2)', height: 18 }}>
        {hov ? (
          <span className="mono">{hov.v.tag} / STR-{String(hov.k + 1).padStart(2, '0')} · <b style={{ color: 'var(--tx)' }}>{fmtN(hov.a, 2)} A</b> · 기준 대비 {hov.v.on ? fmtN(hov.r * 100, 1) + '%' : '—'}</span>
        ) : (
          <>
            <span className="legend"><span><i style={{ background: heatColor(1.02), height: 10, width: 14 }} />≥ 97%</span><span><i style={{ background: heatColor(0.9), height: 10, width: 14 }} />85–97%</span><span><i style={{ background: heatColor(0.7), height: 10, width: 14 }} />{'< 85%'}</span><span><i style={{ background: 'var(--crit)', height: 10, width: 14 }} />개방 (0 A)</span><span><i style={{ background: 'var(--panel2)', height: 10, width: 14, border: '1px solid var(--line2)' }} />인버터 정지</span></span>
            <span className="mini" style={{ marginLeft: 'auto' }}>기준 Imp {fmtN(ref, 2)} A · 셀 위에 마우스를 올리면 값 표시</span>
          </>
        )}
      </div>
    </div>
  );
}

function InvTable({ s, invSel, setInv, unit }) {
  return (
    <div className="scroll" style={{ height: '100%' }}>
      <table className="t">
        <thead><tr><th>인버터</th><th>상태</th><th className="r">AC 출력</th><th style={{ width: 70 }}>부하율</th><th className="r">효율</th><th className="r">DC 전압</th><th className="r">내부온도</th><th className="r">금일 발전량</th></tr></thead>
        <tbody>
          {s.invs.map((v) => (
            <tr key={v.id} className={v.id === invSel ? 'sel' : ''} onClick={() => setInv(v.id)}>
              <td className="num" style={{ fontWeight: 500 }}>{v.tag}</td>
              <td><StatusTag st={v.st} /></td>
              <td className="r num"><PU x={fmtP(v.ac, 'kW')} /></td>
              <td><Bar v={v.load} c={v.st === 'warn' ? 'var(--warn)' : 'var(--solar)'} /></td>
              <td className="r num">{v.eff ? fmtN(v.eff, 2) + '%' : '—'}</td>
              <td className="r num">{v.vdc ? fmtN(v.vdc, 0) + ' V' : '—'}</td>
              <td className={'r num ' + (v.temp > 60 ? 'dn' : '')}>{fmtN(v.temp, 1)}℃</td>
              <td className="r num"><PU x={fmtE(v.E, unit === 'kW' ? 'kW' : 'MW')} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InvDetail({ s, v, snap, alarms, go }) {
  const now = snap.now;
  const ser = useMemo(() => SIM.invSeries(v.id, 6 * 60 + 30, Math.floor(now / 5) * 5, 5), [v.id, Math.floor(now / 5)]);
  const unitCap = s.cap / s.inv;
  const rel = alarms.filter((a) => a.inv === v.id).slice(0, 3);
  const k = 1000;
  return (
    <Panel title={v.tag} sub={`정격 ${fmtN(unitCap * 1000, 0)} kW · 중앙형 3상`} right={<StatusTag st={v.st} />} bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="statbox" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        <div><label>AC 출력</label><b style={{ color: 'var(--solar)' }}>{fmtN(v.ac * 1000, 0)}<small>kW</small></b></div>
        <div><label>DC 입력</label><b>{fmtN(v.dc * 1000, 0)}<small>kW</small></b></div>
        <div><label>변환 효율</label><b>{v.eff ? fmtN(v.eff, 2) : '—'}<small>%</small></b></div>
        <div><label>DC 전압 / 전류</label><b>{fmtN(v.vdc, 0)}<small>V</small> {fmtN(v.idc, 0)}<small>A</small></b></div>
        <div><label>AC 전압 · 주파수</label><b>{fmtN(v.vac, 0)}<small>V</small> {fmtN(v.hz, 2)}<small>Hz</small></b></div>
        <div><label>역률 · 내부온도</label><b>{v.pf ? fmtN(v.pf, 3) : '—'} <span style={{ color: v.temp > 60 ? 'var(--crit)' : null }}>{fmtN(v.temp, 0)}</span><small>℃</small></b></div>
      </div>
      <div style={{ height: 150 }}>
        <div className="mini" style={{ marginBottom: 2 }}>금일 AC 출력 (kW)</div>
        <TimeChart height={136} x0={6 * 60 + 30} x1={18 * 60} now={now} xStep={120} yMaxL={niceMax(unitCap * 0.75)} fmtL={(x) => fmtN(x * k, 0)}
          series={[{ key: 'p', label: 'AC 출력', data: v.on ? [...ser, [now, v.ac]] : ser, color: v.st === 'warn' ? 'var(--warn)' : 'var(--solar)', kind: 'area' }]}
          tooltipFmt={{ p: (x) => fmtN(x * 1000, 0) + ' kW' }} />
      </div>
      <div>
        <div className="mini" style={{ marginBottom: 6 }}>스트링 전류 (A)</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 52 }}>
          {v.strings.map((a, i) => <div key={i} title={`STR-${i + 1}: ${fmtN(a, 2)} A`} style={{ flex: 1, height: Math.max(2, (a / (v.imp * 1.08 || 1)) * 100) + '%', background: v.imp && a / v.imp < 0.85 ? 'var(--crit)' : v.imp && a / v.imp < 0.97 ? 'var(--warn)' : 'var(--ok)', borderRadius: '1px 1px 0 0', opacity: v.on ? 0.9 : 0.25 }} />)}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <div className="mini" style={{ marginBottom: 4 }}>관련 알람</div>
        {rel.length ? rel.map((a) => (
          <div key={a.id} className="fi" style={{ gridTemplateColumns: '58px 44px 1fr' }} onClick={() => go('alarms', { alarm: a.id })}>
            <span className="mono">{hms(a.ts)}</span><span><SevTag sev={a.sev} /></span><p>{a.msg}</p>
          </div>
        )) : <div className="mini" style={{ padding: '8px 0' }}>최근 알람 없음</div>}
      </div>
    </Panel>
  );
}

function Detail({ snap, unit, alarms, go, site, setSite, inv, setInv }) {
  const s = snap.sites.find((x) => x.id === site) || snap.sites[0];
  const v = s.invs.find((x) => x.id === inv) || s.invs[0];
  const vs = s.Efc ? s.E / s.Efc - 1 : 0;
  return (
    <div className="main" style={{ gridTemplateColumns: '1fr 1fr 460px', gridTemplateRows: 'auto auto minmax(0,1fr) minmax(0,1fr)' }}>
      <div style={{ gridColumn: '1 / -1' }}><SiteTabs snap={snap} site={s.id} setSite={(id) => { setSite(id); setInv(null); }} unit={unit} /></div>
      <div className="kpis" style={{ gridColumn: '1 / 3', gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <div className="kpi"><label>현재 출력</label><PU x={fmtP(s.p, unit)} cls="kv" /><Bar v={s.p / s.cap} /></div>
        <div className="kpi"><label>금일 발전량</label><PU x={fmtE(s.E, unit)} cls="kv" /><div className="ksub"><span>예측대비 <b className={vs >= -0.03 ? 'up' : 'dn'}>{vs >= 0 ? '+' : ''}{fmtN(vs * 100, 1)}%</b></span></div></div>
        <div className="kpi"><label>PR</label><span className="kv">{fmtN(s.pr * 100, 1)}<small className="u">%</small></span><div className="ksub"><span>이용률 <b>{fmtN(s.cf * 100, 1)}%</b></span></div></div>
        <div className="kpi"><label>일사량 · 모듈온도</label><span className="kv">{fmtN(s.irr, 0)}<small className="u">W/m²</small></span><div className="ksub"><span>모듈 <b>{fmtN(s.modT, 1)}℃</b></span><span>기온 <b>{fmtN(s.air, 1)}℃</b></span></div></div>
        <div className="kpi"><label>금일 수익</label><span className="kv">{won(s.rev)}<small className="u">원</small></span><div className="ksub"><span>REC 가중치 <b>{s.w.toFixed(1)}</b></span></div></div>
        <div className="kpi"><label>CO₂ 저감</label><span className="kv">{fmtN(s.co2, 1)}<small className="u">t</small></span><div className="ksub"><span>{s.grid}</span></div></div>
      </div>
      <div style={{ gridRow: '2 / 5', gridColumn: 3, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}><InvDetail s={s} v={v} snap={snap} alarms={alarms} go={go} /></div>
      </div>
      <Panel title="출력 추이" sub={`${s.name} · 실측 vs 예측`} right={<>{s.gap && <span className="gaptag">수신 누락 {hhmm(s.gap[0])}~{hhmm(s.gap[1])}</span>}<Legend items={[{ label: '실측', c: 'var(--solar)' }, { label: '예측', c: 'var(--fc)', dash: true }, { label: '전일', c: 'var(--tx3)' }, { label: '일사량', c: 'var(--irr)' }]} /></>} bodyStyle={{ padding: '8px 10px 4px 4px' }}>
        <PowerChart snap={snap} unit={unit} siteId={s.id} />
      </Panel>
      <Panel title="스트링 전류 히트맵" sub={`인버터 ${s.inv}대 × 스트링 ${SIM.NSTR} · 수신 ${hms(s.lastRx)}`} bodyStyle={{ paddingTop: 10 }}>
        <StringHeat s={s} invSel={v.id} setInv={setInv} />
      </Panel>
      <Panel title="인버터 목록" sub={`가동 ${s.invRun}/${s.inv}`} right={<span className="legend">{['run', 'warn', 'fault', 'comm', 'off'].filter((k) => s.counts[k]).map((k) => <span key={k}><Dot c={ST[k].c} />{ST[k].label} {s.counts[k]}</span>)}</span>} style={{ gridColumn: '1 / 3' }} bodyStyle={{ paddingTop: 8, paddingBottom: 0 }}>
        <InvTable s={s} invSel={v.id} setInv={setInv} unit={unit} />
      </Panel>
    </div>
  );
}

Object.assign(window, { Detail });
