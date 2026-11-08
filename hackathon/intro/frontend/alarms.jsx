/* 화면 3 — 알람 관리 */
function Alarms({ snap, alarms, setAlarms, sel, setSel, go, perm = { ack: true, clear: true }, can = () => true }) {
  const [sevF, setSevF] = useState('all');
  const [stF, setStF] = useState('active');
  const [siteF, setSiteF] = useState('ALL');
  const [q, setQ] = useState('');
  const [checked, setChecked] = useState({});

  const list = alarms.filter((a) =>
    (sevF === 'all' || a.sev === sevF) &&
    (stF === 'all' || (stF === 'active' ? a.state !== '해제' : a.state === stF)) &&
    (siteF === 'ALL' || a.site === siteF) &&
    (!q || (a.msg + a.eq + a.code + a.siteName).toLowerCase().includes(q.toLowerCase())));
  const inScope = (x) => x && snap.sites.some((s) => s.id === x.site);
  const cur = [alarms.find((a) => a.id === sel), ...list].find(inScope);
  const nowSec = snap.now * 60;
  const active = alarms.filter((a) => a.state !== '해제');
  const cnt = (f) => alarms.filter(f).length;

  const ack = (ids) => setAlarms((L) => L.map((a) => (ids.includes(a.id) && a.state === '미확인' ? { ...a, state: '확인', ackTs: nowSec, isNew: false } : a)));
  const clear = (ids) => setAlarms((L) => L.map((a) => (ids.includes(a.id) && a.state !== '해제' ? { ...a, state: '해제', ackTs: a.ackTs || nowSec, clrTs: nowSec, isNew: false } : a)));
  const chkIds = Object.keys(checked).filter((k) => checked[k]);

  // 시간대 분포 (금일, 1시간 단위)
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, c: alarms.filter((a) => Math.floor(a.ts / 3600) === h && a.sev !== 'info').length, k: alarms.filter((a) => Math.floor(a.ts / 3600) === h && (a.sev === 'critical' || a.sev === 'major')).length }));
  const hmax = Math.max(4, ...hours.map((x) => x.c));
  const bySite = snap.sites.map((s) => ({ s, n: active.filter((a) => a.site === s.id).length }));

  return (
    <div className="main" style={{ gridTemplateColumns: '300px 1fr 480px', gridTemplateRows: 'minmax(0,1fr)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        <Panel title="활성 알람 요약" bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><span className="kv">{active.length}</span><span className="mini">건 활성 · 미확인 <b className="mono" style={{ color: 'var(--crit)' }}>{cnt((a) => a.state === '미확인')}</b></span></div>
          <div className="statbox" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {['critical', 'major', 'minor', 'info'].map((k) => <div key={k}><label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Dot c={SEV[k].c} />{SEV[k].label}</label><b>{active.filter((a) => a.sev === k).length}</b></div>)}
          </div>
        </Panel>
        <Panel title="발전소별 활성 알람" bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {bySite.map(({ s, n }) => (
            <button key={s.id} onClick={() => setSiteF(siteF === s.id ? 'ALL' : s.id)} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 22px', alignItems: 'center', gap: 8, textAlign: 'left', fontSize: 'calc(12.5px * var(--text-scale, 1))', color: siteF === s.id ? 'var(--tx)' : 'var(--tx2)', fontWeight: siteF === s.id ? 600 : 400 }}>
              <span>{s.name}</span><Bar v={n / Math.max(4, ...bySite.map((x) => x.n))} c={n ? 'var(--warn)' : 'var(--line)'} h={6} /><span className="mono" style={{ textAlign: 'right' }}>{n}</span>
            </button>
          ))}
        </Panel>
        <Panel title="시간대별 발생" sub="금일 · 정보 제외" style={{ flex: 1 }} bodyStyle={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2, minHeight: 60 }}>
            {hours.map((x) => (
              <div key={x.h} title={`${x.h}시 · ${x.c}건`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                <div style={{ height: ((x.c - x.k) / hmax) * 100 + '%', background: 'var(--minor)', opacity: 0.6 }} />
                <div style={{ height: (x.k / hmax) * 100 + '%', background: 'var(--crit)' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }} className="axl mono mini">{['00', '06', '12', '18', '24'].map((t) => <span key={t}>{t}</span>)}</div>
          <div className="legend" style={{ marginTop: 8 }}><span><i style={{ background: 'var(--crit)' }} />긴급·중대</span><span><i style={{ background: 'var(--minor)' }} />경미</span></div>
        </Panel>
      </div>

      <Panel title="알람 목록" sub={`${list.length}건`} right={
        <>
          {perm.ack && <button className="btn" disabled={!chkIds.length} onClick={() => { ack(chkIds); setChecked({}); }}>선택 확인 ({chkIds.length})</button>}
          {perm.clear && <button className="btn" disabled={!chkIds.length} onClick={() => { clear(chkIds); setChecked({}); }}>선택 해제</button>}
        </>
      } bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="seg">
            {[['active', '활성'], ['미확인', '미확인'], ['확인', '확인'], ['해제', '해제'], ['all', '전체']].map(([k, l]) => <button key={k} className={stF === k ? 'on' : ''} onClick={() => setStF(k)}>{l}</button>)}
          </div>
          <div className="seg">
            {[['all', '전체 등급'], ['critical', '긴급'], ['major', '중대'], ['minor', '경미'], ['info', '정보']].map(([k, l]) => <button key={k} className={sevF === k ? 'on' : ''} onClick={() => setSevF(k)}>{l}</button>)}
          </div>
          {siteF !== 'ALL' && <button className="chip on" onClick={() => setSiteF('ALL')}>{(snap.sites.find((s) => s.id === siteF) || { name: siteF }).name} ✕</button>}
          {!perm.ack && <span className="mini">조회 전용 · 확인·해제는 관제실/담당자</span>}
          <input className="search" placeholder="메시지 · 설비 · 코드 검색" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginLeft: 'auto' }} />
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0 }}>
          <table className="t">
            <thead><tr><th style={{ width: 26 }}><input type="checkbox" checked={list.length > 0 && list.every((a) => checked[a.id])} onChange={(e) => { const o = {}; if (e.target.checked) list.forEach((a) => (o[a.id] = true)); setChecked(o); }} /></th><th>발생시각</th><th>등급</th><th>발전소</th><th>설비</th><th>코드</th><th>메시지</th><th>상태</th><th className="r">경과</th></tr></thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className={(cur && a.id === cur.id ? 'sel' : '') + (a.isNew ? ' fi new' : '')} onClick={() => setSel(a.id)} style={{ display: 'table-row' }}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={!!checked[a.id]} onChange={(e) => setChecked({ ...checked, [a.id]: e.target.checked })} /></td>
                  <td className="num">{hms(a.ts)}</td>
                  <td><SevTag sev={a.sev} /></td>
                  <td>{a.siteName}</td>
                  <td className="num">{a.eq}</td>
                  <td className="num" style={{ color: 'var(--tx3)' }}>{a.code}</td>
                  <td style={{ maxWidth: 330, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: a.state === '미확인' ? 600 : 400 }}>{a.msg}</td>
                  <td><span className="tag" style={{ '--c': a.state === '미확인' ? 'var(--crit)' : a.state === '확인' ? 'var(--warn)' : 'var(--tx3)' }}><Dot c={a.state === '미확인' ? 'var(--crit)' : a.state === '확인' ? 'var(--warn)' : 'var(--tx3)'} pulse={a.state === '미확인' && a.sev === 'critical'} />{a.state}</span></td>
                  <td className="r num" style={{ color: 'var(--tx3)' }}>{a.state === '해제' ? '—' : dur(nowSec - a.ts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <div className="empty" style={{ height: 200 }}>조건에 맞는 알람이 없습니다</div>}
        </div>
      </Panel>

      {cur ? <AlarmDetail a={cur} snap={snap} nowSec={nowSec} ack={ack} clear={clear} go={go} perm={perm} can={can} /> : <Panel title="알람 상세"><div className="empty">알람을 선택하세요</div></Panel>}
    </div>
  );
}
const dur = (s) => { s = Math.max(0, Math.floor(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}시간 ${m}분` : `${m}분`; };

function AlarmDetail({ a, snap, nowSec, ack, clear, go, perm, can }) {
  const s = snap.sites.find((x) => x.id === a.site);
  if (!s) return <Panel title="알람 상세"><div className="empty">알람을 선택하세요</div></Panel>;
  const v = a.inv ? s.invs.find((x) => x.id === a.inv) : null;
  const steps = [
    { l: '발생', t: a.ts, on: true },
    { l: '확인', t: a.ackTs, on: !!a.ackTs },
    { l: '해제', t: a.clrTs, on: !!a.clrTs },
  ];
  return (
    <Panel title="알람 상세" sub={a.id} right={<SevTag sev={a.sev} />} bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="mono mini">{a.code}</div>
        <h2 style={{ fontSize: 'calc(19px * var(--text-scale, 1))', fontWeight: 600, lineHeight: 1.35, marginTop: 4, textWrap: 'pretty' }}>{a.msg}</h2>
        <p style={{ color: 'var(--tx2)', fontSize: 'calc(13px * var(--text-scale, 1))', lineHeight: 1.6, marginTop: 8, textWrap: 'pretty' }}>{a.desc}</p>
      </div>
      <dl className="kv-list">
        <dt>발전소</dt><dd style={{ fontFamily: 'inherit' }}>{a.siteName} · {s.region}</dd>
        <dt>설비</dt><dd>{a.eq}</dd>
        <dt>발생 시각</dt><dd>2026-11-07 {hms(a.ts)}</dd>
        <dt>경과</dt><dd>{a.state === '해제' ? '해제됨' : dur(nowSec - a.ts)}</dd>
        {a.task && <><dt>관련 업무</dt><dd>{a.task}{can('tasks') && <button className="btn" style={{ padding: '1px 8px', marginLeft: 8, fontSize: 'calc(11.5px * var(--text-scale, 1))' }} onClick={() => go('tasks', { task: a.task })}>업무 열기</button>}</dd></>}
        {v && <><dt>설비 현재값</dt><dd>{fmtN(v.ac * 1000, 0)} kW · {fmtN(v.temp, 1)}℃</dd></>}
      </dl>
      <div>
        <div className="mini" style={{ marginBottom: 10 }}>처리 이력</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', position: 'relative' }}>
          <div style={{ position: 'absolute', left: '16%', right: '16%', top: 5, height: 1, background: 'var(--line2)' }} />
          {steps.map((st) => (
            <div key={st.l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, position: 'relative' }}>
              <i style={{ width: 11, height: 11, borderRadius: '50%', background: st.on ? 'var(--solar)' : 'var(--panel)', border: '1.5px solid ' + (st.on ? 'var(--solar)' : 'var(--line2)') }} />
              <span style={{ fontSize: 'calc(12px * var(--text-scale, 1))', fontWeight: 500, color: st.on ? 'var(--tx)' : 'var(--tx3)' }}>{st.l}</span>
              <span className="mono mini">{st.on ? hms(st.t) : '—'}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <div className="mini" style={{ marginBottom: 8 }}>권장 조치</div>
        <ol style={{ paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {a.act.map((t, i) => <li key={i} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', fontSize: 'calc(13px * var(--text-scale, 1))', lineHeight: 1.5, color: 'var(--tx2)' }}><span className="mono" style={{ color: 'var(--tx3)' }}>{i + 1}.</span>{t}</li>)}
        </ol>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn pri" disabled={!perm.ack || a.state !== '미확인'} onClick={() => ack([a.id])} style={{ flex: 1 }}>알람 확인 (ACK)</button>
        <button className="btn" disabled={!perm.clear || a.state === '해제'} title={perm.clear ? null : '해제 권한 없음 — 관제실에서 처리'} onClick={() => clear([a.id])} style={{ flex: 1 }}>해제 처리</button>
        {a.inv && can('detail') && <button className="btn" onClick={() => go('detail', { site: a.site, inv: a.inv })}>설비 보기 →</button>}
      </div>
    </Panel>
  );
}

Object.assign(window, { Alarms });
