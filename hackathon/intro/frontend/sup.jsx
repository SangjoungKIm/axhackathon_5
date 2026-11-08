/* SUP-01 설정 · SUP-02 알림·업무함 · SUP-03 시뮬레이션 제어 */
function Settings({ ctx }) {
  const { role, R, ops, upd, now } = ctx;
  const groups = Object.keys(ops.settings);
  const st = ctx.ui('settings', { g: ctx.params.group || groups[0], i: 0 });
  const g = st.g, items = ops.settings[g], item = items[st.i] || items[0];
  const canEdit = SET_EDIT[g].includes(role);
  const [draft, setDraft] = useState(null);
  const vals = draft || item.fields.map((f) => f[1]);
  return (
    <div className="page" style={{ padding: 0 }}>
      <TitleBar title={pageLabel(R, 'settings')}>
        <div className="seg">{groups.map((k) => <button key={k} className={g === k ? 'on' : ''} onClick={() => { ctx.setUi('settings', { g: k, i: 0 }); setDraft(null); }}>{k}</button>)}</div>
      </TitleBar>
      <div className="pgrid" style={{ gridTemplateColumns: '420px 1fr' }}>
        <Panel title={g} sub={`${items.length}건`} bodyStyle={{ padding: 0 }}>
          {items.map((x, i) => <button key={x.name} onClick={() => { ctx.setUi('settings', { i }); setDraft(null); }} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '13px 16px', width: '100%', textAlign: 'left', borderBottom: '1px solid var(--line)', background: i === st.i ? 'var(--sel)' : null }}><b style={{ fontSize: 'calc(13.5px * var(--text-scale, 1))' }}>{x.name}</b><span className="mini">{x.meta}</span></button>)}
        </Panel>
        <section className="panel">
          <header className="ph"><h3>{item.name}</h3><span className="ph-sub">{item.meta}</span><div className="ph-r">{canEdit ? <span className="tag" style={{ '--c': 'var(--ok)' }}><Dot c="var(--ok)" />편집 가능</span> : <span className="tag" style={{ '--c': 'var(--tx3)' }}><Dot c="var(--tx3)" />편집 권한 없음</span>}</div></header>
          <div className="pb" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignContent: 'start' }}>
            {item.fields.map((f, i) => <Field key={f[0]} label={f[0]}><input className="inp" value={vals[i]} disabled={!canEdit} onChange={(e) => setDraft(vals.map((v, j) => (j === i ? e.target.value : v)))} style={{ opacity: canEdit ? 1 : 0.7, color: /미등록|미확인|미지정/.test(vals[i]) ? 'var(--warn)' : null }} /></Field>)}
            {!canEdit && <div style={{ gridColumn: '1 / -1' }}><Note kind="info">{g} 그룹 편집 권한: {SET_EDIT[g].map((k) => ROLES[k].label).join(' · ')}</Note></div>}
            {ops.settingsLog.filter((l) => l[1] === item.name).length > 0 && <div style={{ gridColumn: '1 / -1' }}><div className="mini" style={{ marginBottom: 4 }}>변경 이력</div>{ops.settingsLog.filter((l) => l[1] === item.name).map((l, i) => <div key={i} className="chg"><span className="mono">{l[0]}</span><span>{l[2]}</span></div>)}</div>}
          </div>
          <div className="actbar"><span className="sel-t">{g} · {item.name}</span><div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>{canEdit ? <><button className="btn" disabled={!draft} onClick={() => setDraft(null)}>되돌리기</button><button className="btn pri" disabled={!draft} onClick={() => { upd((o) => { const it = o.settings[g][st.i]; const ch = it.fields.map((f, i) => (f[1] !== vals[i] ? `${f[0]}: ${f[1]} → ${vals[i]}` : null)).filter(Boolean); it.fields = it.fields.map((f, i) => [f[0], vals[i]]); o.settingsLog.unshift([hhmm(now), it.name, `${R.user} · ${ch.join(', ')}`]); }); setDraft(null); ctx.flash('저장 — 변경 이력 기록'); }}>저장</button></> : <NoPerm text="편집 권한 없음" />}</div></div>
        </section>
      </div>
    </div>
  );
}

function Inbox({ ctx }) {
  const { role, R, ops, upd, go, can } = ctx;
  const mine = ops.notifications.filter((n) => n.roles.includes(role));
  const st = ctx.ui('inbox', { sel: null });
  const routeTask = ctx.params.task || null;
  const routeChanged = st.routeTask !== routeTask;
  const linked = mine.find((n) => n.task === routeTask);
  const cur = (routeChanged && linked) || mine.find((n) => n.id === st.sel) || linked || mine[0];
  useEffect(() => {
    if (routeChanged) ctx.setUi('inbox', { routeTask, sel: cur ? cur.id : null });
  }, [routeTask, st.routeTask, cur && cur.id]);
  const task = cur && ops.tasks.find((t) => t.id === cur.task);
  const target = task && task.link ? task.link.screen : null;
  useEffect(() => { if (cur && cur.unread) upd((o) => { const n = o.notifications.find((x) => x.id === cur.id); if (n) n.unread = false; }); }, [cur && cur.id]);
  return (
    <div className="page" style={{ padding: 0 }}>
      <TitleBar title={pageLabel(R, 'inbox')} meta={`미읽음 ${mine.filter((n) => n.unread).length}건 · 알림을 읽은 것만으로 업무가 해결되지 않습니다`}>
        <button className="btn" onClick={() => upd((o) => o.notifications.forEach((n) => { if (n.roles.includes(role)) n.unread = false; }))}>모두 읽음</button>
      </TitleBar>
      <div className="pgrid" style={{ gridTemplateColumns: '1fr 520px' }}>
        <section className="panel">
          <header className="ph"><h3>내 알림</h3><span className="ph-sub">{mine.length}건</span></header>
          <div className="pb scroll">
            <table className="t"><thead><tr><th style={{ width: 70 }}>시각</th><th>발생 원인</th><th>관련 업무</th><th>현재 담당</th><th>다음 행동</th></tr></thead><tbody>
              {mine.map((n) => <tr key={n.id} className={cur && cur.id === n.id ? 'sel' : ''} onClick={() => ctx.setUi('inbox', { sel: n.id })} style={{ height: 50 }}>
                <td className="num" style={{ height: 50 }}>{n.unread && <Dot c="var(--crit)" />} {n.at}</td><td style={{ fontWeight: n.unread ? 600 : 400 }}>{n.cause}</td><td className="num">{n.task}</td><td>{n.who}</td><td style={{ color: 'var(--tx2)' }}>{n.next}</td></tr>)}
            </tbody></table>
            {!mine.length && <div className="empty" style={{ height: 200 }}>알림이 없습니다</div>}
          </div>
        </section>
        {cur ? (
          <Panel title="알림 상세" sub={cur.id} bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <h2 style={{ fontSize: 'calc(18px * var(--text-scale, 1))', fontWeight: 600, lineHeight: 1.4 }}>{cur.cause}</h2>
            <dl className="kv-list"><dt>시각</dt><dd>{cur.at}</dd><dt>관련 업무</dt><dd>{cur.task}</dd>{task && <><dt>발전소</dt><dd style={{ fontFamily: 'inherit' }}>{siteName(task.site)}</dd></>}<dt>현재 담당자</dt><dd style={{ fontFamily: 'inherit' }}>{task ? task.assigneeLabel : cur.who}</dd><dt>다음 행동</dt><dd style={{ fontFamily: 'inherit' }}>{task ? task.next : cur.next}</dd>{task && <><dt>승인자</dt><dd style={{ fontFamily: 'inherit' }}>{task.approver}</dd><dt>검토자</dt><dd style={{ fontFamily: 'inherit' }}>{task.reviewer}</dd></>}</dl>
            {task && <div className="flowline">{['접수', '담당 배정', '진행·조율', '검수 대기', '종료'].map((s, i) => { const k = task.stage === '담당 배정' ? 1 : task.stage === '검수 대기' ? 3 : task.stage === '종료' ? 4 : 2; return <span key={s} className={i < k ? 'done' : i === k ? 'cur' : ''}>{i === k && i === 2 ? task.stage : s}</span>; })}</div>}
            <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
              <button className="btn pri" disabled={!task || !task.link || !can(target)} onClick={() => { const L = task.link; if (L.screen === 'home') go('home', { tab: L.tab, site: L.site, inv: L.inv }); else go(L.screen, L); }}>{task && task.link && !can(target) ? '권한 없음' : '관련 업무 열기 →'}</button>
            </div>
          </Panel>
        ) : <Panel title="알림 상세"><div className="empty">알림이 없습니다</div></Panel>}
      </div>
    </div>
  );
}

Object.assign(window, { Settings, Inbox });
