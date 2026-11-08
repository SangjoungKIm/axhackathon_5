/* SCR-05 작업·검수 — 목록 / 상세(작업지시 · 수행 기록 · 증빙 · 검수·비용) */
const WST = { todo: ['예정', 'var(--tx3)'], progress: ['진행', 'var(--fc)'], done: ['완료 보고', 'var(--ok)'], hold: ['보류', 'var(--warn)'], rework: ['재작업', 'var(--crit)'], approved: ['검수 승인', 'var(--solar)'] };
const WItem = ({ s }) => <span className="judg" style={{ '--c': WST[s][1] }}>● {WST[s][0]}</span>;

function Work({ ctx }) {
  const { role, R, ops, sites, go, params } = ctx;
  const all = Object.values(ops.workOrders).filter((w) => sites.includes(w.site) && (role !== 'maint' || w.vendor === R.vendorOrg));
  const st = ctx.ui('work', { f: '전체' });
  const wo = all.find((w) => w.id === params.id);
  if (wo) return <WorkDetail key={wo.id} ctx={ctx} wo={wo} startTab={params.tab} />;
  const F = ['전체', '예정', '진행', '검수 대기', '재작업', '완료'];
  const list = all.filter((w) => st.f === '전체' || w.state === st.f);
  const today = all.find((w) => w.schedule.startsWith('2026-11-07') && ['예정', '진행'].includes(w.state)) || all.find((w) => w.schedule.startsWith('2026-11-07') && w.state !== '완료');
  return (
    <div className="page" style={{ padding: 0 }}>
      <TitleBar title={pageLabel(R, 'work')} meta={role === 'maint' ? `${ops.ORGS[R.vendorOrg].name} 작업만 표시` : `${all.length}건`}>
        <div className="seg">{F.map((k) => <button key={k} className={st.f === k ? 'on' : ''} onClick={() => ctx.setUi('work', { f: k })}>{k} <span className="mono mini">{k === '전체' ? all.length : all.filter((w) => w.state === k).length}</span></button>)}</div>
        {canDo(role, 'workDo') && today && <button className="btn pri" onClick={() => go('work', { id: today.id, tab: 'record' })}>오늘 작업 열기</button>}
      </TitleBar>
      <section className="panel" style={{ flex: 1 }}>
        <header className="ph"><h3>작업 목록</h3><span className="ph-sub">{list.length}건</span></header>
        <div className="pb">
          <table className="t">
            <thead><tr><th>작업번호</th><th>발전소</th><th>서비스 · 범위</th><th>담당팀</th><th>일정</th><th>상태</th><th>다음 행동</th></tr></thead>
            <tbody>{list.map((w) => <tr key={w.id} onClick={() => go('work', { id: w.id })} style={{ height: 52 }}><td className="num" style={{ height: 52 }}>{w.id}</td><td>{siteName(w.site)}</td><td>{w.service} · {w.scope}</td><td>{w.team}</td><td className="num">{w.schedule}</td><td><span className="stagepill">{w.state}</span></td><td style={{ color: 'var(--tx2)' }}>{w.next}</td></tr>)}</tbody>
          </table>
          {!list.length && <div className="empty" style={{ height: 200 }}>현재 필터에 해당하는 작업이 없습니다</div>}
        </div>
      </section>
    </div>
  );
}

function WorkDetail({ ctx, wo, startTab }) {
  const { role, R, ops, upd, go, now, snap } = ctx;
  const [tab, setTab] = useState(startTab || 'order');
  const [selI, setSelI] = useState(wo.items[0].id);
  const [modal, setModal] = useState(null);
  const it = wo.items.find((x) => x.id === selI) || wo.items[0];
  const doer = canDo(role, 'workDo') && (role !== 'maint' || wo.vendor === R.vendorOrg);
  const inspector = canDo(role, 'inspect') && (role === 'master' || R.user === wo.reviewer);
  const mut = (fn) => upd((o) => { const w = o.workOrders[wo.id]; fn(w, w.items.find((x) => x.id === it.id), o); });
  const task = ops.tasks.find((t) => t.link && t.link.id === wo.id);
  const upTask = (o, stage, next, msg) => { const t = o.tasks.find((x) => x.link && x.link.id === wo.id); if (t) { t.stage = stage; t.next = next; t.changes.unshift([hhmm(now), msg]); if (stage === '검수 대기') { t.assignee = 'owner'; t.assigneeLabel = `${wo.reviewer} (검수자)`; } } };
  const checkAllReported = (w, o) => { if (w.items.every((x) => ['done', 'hold', 'approved'].includes(x.state)) && w.state !== '완료') { w.state = '검수 대기'; w.next = '항목별 검수'; upTask(o, '검수 대기', '항목별 승인 또는 보완 요청', '모든 항목 보고 → 검수 대기'); } };
  const nDone = wo.items.filter((x) => ['done', 'approved'].includes(x.state)).length;
  const nAppr = wo.items.filter((x) => x.state === 'approved').length;
  const unresolved = wo.items.filter((x) => ['hold', 'rework', 'progress', 'todo'].includes(x.state));
  const changeItems = wo.items.filter((x) => x.change);
  const meas = wo.measure && snap.sites.find((s) => s.id === wo.site);
  const measInv = meas && meas.invs.find((v) => v.id === wo.measure.inv);

  const tabs = [['order', '작업지시'], ['record', '수행 기록', wo.items.length], ['evidence', '증빙'], ['review', '검수·비용']];
  let left, right, actions = null;

  if (tab === 'order') {
    const insObs = wo.inspection && ops.obs[wo.inspection];
    left = insObs ? <PanelGrid ins={ops.inspections[wo.inspection]} obs={Object.fromEntries(Object.entries(insObs).map(([k, v]) => [k, wo.targets.includes(k) ? v : { ...v, j: 'ok' }]))} compact /> : <div className="empty" style={{ height: '100%', flexDirection: 'column', gap: 6 }}>{wo.measure ? `대상: ${wo.measure.inv.replace('-', '-INV-')} / STR-${String(wo.measure.str + 1).padStart(2, '0')}` : '대상 배치도 없음 — 구역 단위 작업'}<span className="mini">{wo.scope}</span></div>;
    right = <dl className="kv-list">
      <dt>승인 범위</dt><dd style={{ fontFamily: 'inherit' }}>{wo.scope}</dd><dt>담당팀</dt><dd style={{ fontFamily: 'inherit' }}>{wo.team}</dd><dt>일정</dt><dd>{wo.schedule}</dd>
      <dt>다음 행동</dt><dd style={{ fontFamily: 'inherit' }}>{wo.next}</dd><dt>승인자</dt><dd style={{ fontFamily: 'inherit' }}>{wo.approver}</dd><dt>검수자</dt><dd style={{ fontFamily: 'inherit' }}>{wo.reviewer}</dd>
      <dt>견적 버전</dt><dd>{wo.quoteVersion}</dd><dt>발행 시각</dt><dd>{wo.issuedAt}</dd><dt>근거 회차</dt><dd>{wo.inspection || '—'}</dd><dt>현장 전달</dt><dd style={{ fontFamily: 'inherit' }}>{wo.note}</dd></dl>;
    actions = <><button className="btn" onClick={() => ctx.flash('지시서 출력 (시연)')}>지시서 출력</button>{doer && wo.state === '예정' && <button className="btn pri" onClick={() => { mut((w, x, o) => { w.state = '진행'; w.items.forEach((i) => { if (i.state === 'todo') i.state = 'progress'; }); w.next = '항목별 완료 보고'; upTask(o, '진행', '항목별 완료 보고', `${R.user} 작업 시작 보고`); }); setTab('record'); }}>작업 시작</button>}</>;
  } else if (tab === 'record') {
    left = <table className="t"><thead><tr><th>항목</th><th>상태</th><th>보고 시각</th><th>결과</th></tr></thead><tbody>{wo.items.map((x) => <tr key={x.id} className={x.id === it.id ? 'sel' : ''} onClick={() => setSelI(x.id)}><td>{x.label}</td><td><WItem s={x.state} /></td><td className="num">{x.reportedAt || '—'}</td><td style={{ color: 'var(--tx2)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.result}</td></tr>)}</tbody></table>;
    right = <><div className="meter" style={{ marginBottom: 4 }}>{['approved', 'done', 'hold', 'rework'].map((k) => <i key={k} style={{ width: (wo.items.filter((x) => x.state === k).length / wo.items.length) * 100 + '%', background: WST[k][1] }} />)}</div>
      <div className="mini">완료 보고 {nDone}/{wo.items.length} · 작업 완료율은 검수 승인율과 다릅니다</div>
      <dl className="kv-list"><dt>항목</dt><dd style={{ fontFamily: 'inherit' }}>{it.label}</dd><dt>상태</dt><dd><WItem s={it.state} /></dd><dt>결과</dt><dd style={{ fontFamily: 'inherit' }}>{it.result}</dd><dt>보고 시각</dt><dd>{it.reportedAt || '—'}</dd><dt>자재</dt><dd style={{ fontFamily: 'inherit' }}>{it.material}</dd>{it.holdReason && <><dt>보류 사유</dt><dd style={{ fontFamily: 'inherit' }}>{it.holdReason}</dd></>}{it.excluded && <><dt>제외 대상</dt><dd>{it.excluded}</dd></>}{it.review && <><dt>검수</dt><dd style={{ fontFamily: 'inherit' }}>{it.review}</dd></>}</dl>
      {measInv && <Note kind="info">계측 참고 · {measInv.tag} STR-{String(wo.measure.str + 1).padStart(2, '0')} 현재 {fmtN(measInv.strings[wo.measure.str], 2)} A — 관측값이며 작업 효과를 확정하지 않음</Note>}</>;
    actions = doer ? <>
      <button className="btn" disabled={['done', 'approved'].includes(it.state)} onClick={() => setModal('material')}>자재 입력</button>
      <button className="btn" disabled={['done', 'approved', 'hold'].includes(it.state)} onClick={() => setModal('hold')}>보류</button>
      <button className="btn" onClick={() => setModal('chgreq')}>작업 변경 요청</button>
      <button className="btn pri" disabled={!['progress', 'rework'].includes(it.state)} onClick={() => setModal('report')}>완료 보고</button>
    </> : <NoPerm text="작업 수행 권한 없음 — 조회" />;
  } else if (tab === 'evidence') {
    left = <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="mini">작업 전 ({it.ev.before})</span>{it.ev.before ? <ImgSlot label={`BEFORE · ${it.id}`} sub="현장 사진 (시연 자료)" h={'100%'} style={{ flex: 1 }} /> : <div className="imgslot" style={{ flex: 1 }}><span>미등록</span></div>}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="mini">작업 후 ({it.ev.after})</span>{it.ev.after ? <ImgSlot label={`AFTER · ${it.id}`} sub="현장 사진 (시연 자료)" h={'100%'} style={{ flex: 1 }} /> : <div className="imgslot" style={{ flex: 1 }}><span>미등록</span></div>}</div>
    </div>;
    right = <><dl className="kv-list"><dt>대상</dt><dd style={{ fontFamily: 'inherit' }}>{it.label}</dd><dt>수신 상태</dt><dd style={{ fontFamily: 'inherit' }}>{it.ev.before + it.ev.after ? '업로드 완료' : '없음'}</dd><dt>사진 연결</dt><dd>{wo.id} / {it.id}</dd><dt>필수 증빙</dt><dd style={{ fontFamily: 'inherit', color: it.ev.before && it.ev.after ? 'var(--ok)' : 'var(--warn)' }}>전·후 각 1장 {it.ev.before && it.ev.after ? '충족' : '미달'}</dd></dl>
      <div style={{ display: 'flex', gap: 6 }}>{wo.items.map((x) => <button key={x.id} className={'chip' + (x.id === it.id ? ' on' : '')} onClick={() => setSelI(x.id)}>{x.id}</button>)}</div></>;
    actions = doer ? <><button className="btn" onClick={() => mut((w, x) => { x.ev.before += 1; })}>작업 전 사진 등록</button><button className="btn" onClick={() => mut((w, x) => { x.ev.after += 1; })}>작업 후 사진 등록</button><button className="btn pri" onClick={() => { const i = wo.items.findIndex((x) => x.id === it.id); setSelI(wo.items[(i + 1) % wo.items.length].id); }}>다음 대상 →</button></> : <NoPerm text="사진 등록 권한 없음" />;
  } else {
    left = <table className="t"><thead><tr><th>항목</th><th>상태</th><th>결과</th><th>검수</th>{inspector && <th />}</tr></thead><tbody>{wo.items.map((x) => <tr key={x.id} className={x.id === it.id ? 'sel' : ''} onClick={() => setSelI(x.id)} style={{ height: 50 }}>
      <td style={{ height: 50 }}>{x.label}</td><td><WItem s={x.state} /></td><td className="mini" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.result}</td><td className="mini">{x.review || '—'}</td>
      {inspector && <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: 'nowrap' }}><button className="btn" style={{ padding: '2px 9px' }} disabled={x.state !== 'done'} onClick={() => upd((o) => { const y = o.workOrders[wo.id].items.find((z) => z.id === x.id); y.state = 'approved'; y.review = `승인 · ${R.user} ${hhmm(now)}`; })}>승인</button> <button className="btn" style={{ padding: '2px 9px' }} disabled={x.state !== 'done'} onClick={() => { setSelI(x.id); setModal('reject'); }}>보완 요청</button></td>}
    </tr>)}</tbody></table>;
    const c = wo.cost; const extraOk = changeItems.every((x) => x.change.approved);
    right = <><div className="statbox" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}><div><label>검수 완료율</label><b>{fmtN((nAppr / wo.items.length) * 100, 0)}<small>%</small></b></div><div><label>미해결 항목</label><b style={{ color: unresolved.length ? 'var(--warn)' : null }}>{unresolved.length}</b></div></div>
      <dl className="kv-list"><dt>기본 비용</dt><dd>{fmtN(c.base)}원</dd><dt>추가 비용</dt><dd>{fmtN(c.extra)}원 {c.extra ? (extraOk ? '(승인)' : '(변경 승인 대기)') : ''}</dd><dt>세금</dt><dd style={{ fontFamily: 'inherit' }}>{c.tax}</dd><dt>최종 비용</dt><dd><b>{fmtN(c.base + (extraOk ? c.extra : 0))}원</b></dd></dl>
      {unresolved.length > 0 && <Note kind="warn">보류·재작업·미완료 {unresolved.length}건 — 처리방침 합의 후 종료할 수 있습니다{wo.policy ? ` · 합의: ${wo.policy}` : ''}</Note>}
      <Note kind="info">검수 승인은 패널의 이미지 판정을 정상으로 바꾸지 않습니다.</Note></>;
    const canClose = wo.items.every((x) => x.state === 'approved' || (wo.policy && ['hold', 'rework', 'progress'].includes(x.state)));
    actions = inspector ? <>
      {changeItems.length > 0 && <button className="btn" disabled={changeItems.every((x) => x.change.approved)} onClick={() => mut((w) => { w.items.forEach((x) => { if (x.change) { x.change.approved = true; x.result = '변경 승인됨 · 수행 가능'; } }); w.quoteVersion = 'v2 (변경 승인)'; })}>변경 승인 (+{fmtN(changeItems.reduce((a, x) => a + x.change.amount, 0))}원)</button>}
      {unresolved.length > 0 && <button className="btn" disabled={!!wo.policy} onClick={() => mut((w) => { w.policy = '보류 항목 별도 작업으로 이관 (11-14 이후)'; })}>처리방침 합의</button>}
      <button className="btn pri" disabled={!canClose || wo.state === '완료'} onClick={() => { mut((w, x, o) => { w.state = '완료'; w.next = '-'; upTask(o, '종료', '-', `${R.user} 작업 종료 · 이력 보관`); const t = o.tasks.find((y) => y.link && y.link.id === wo.id); if (t) { t.assignee = null; t.assigneeLabel = '-'; } }); ctx.flash(`${wo.id} 작업 종료 — 이력 보관`); }}>작업 종료</button>
    </> : <NoPerm text={`검수는 지정 검수자(${wo.reviewer})만 가능 — 조회`} />;
  }

  return (
    <div className="page" style={{ padding: 0 }}>
      <TitleBar title={wo.id} meta={`${siteName(wo.site)} · ${wo.service} · ${wo.team} · ${wo.state}`} back={{ label: pageLabel(R, 'work'), fn: () => go('work', {}) }}>
        {task && <span className="mini">업무 {task.id} · 다음 행동: {task.next}</span>}
      </TitleBar>
      <section className="panel" style={{ flex: 1 }}>
        <Tabs items={tabs} value={tab} onChange={setTab} right={<Src k="synth" />} />
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 440px' }}>
          <div className="pb" style={{ overflow: 'auto', borderRight: '1px solid var(--line)' }}>{left}</div>
          <div className="pb" style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>{right}</div>
        </div>
        <div className="actbar"><span className="sel-t">{wo.id} · {tab === 'order' ? '작업지시' : it.label}</span><div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>{actions}</div></div>
      </section>
      {modal === 'report' && <ReportModal it={it} onClose={() => setModal(null)} onSave={(res, exc) => { mut((w, x, o) => { x.state = 'done'; x.result = res; x.excluded = exc || null; x.reportedAt = '11-07 ' + hhmm(now); checkAllReported(w, o); }); setModal(null); ctx.flash(`${it.id} 완료 보고 제출`); }} />}
      {modal === 'hold' && <SimpleModal title="보류" fields={['보류 사유', '다음 계획']} onClose={() => setModal(null)} onSave={(v) => { mut((w, x, o) => { x.state = 'hold'; x.holdReason = v[0]; x.result = '보류: ' + v[0] + ' · ' + v[1]; x.reportedAt = '11-07 ' + hhmm(now); checkAllReported(w, o); }); setModal(null); }} />}
      {modal === 'material' && <SimpleModal title="자재 입력" fields={['사용 자재']} onClose={() => setModal(null)} onSave={(v) => { mut((w, x) => { x.material = v[0]; }); setModal(null); }} />}
      {modal === 'chgreq' && <SimpleModal title="작업 변경 요청" fields={['추가·제외 범위', '추가 비용 (원)', '일정 영향']} note="승인자 재승인 대기 상태가 됩니다. 기존 승인 범위와의 차이를 보존합니다." onClose={() => setModal(null)} onSave={(v) => { mut((w, x) => { w.items.push({ id: 'ADD-' + (w.items.length + 1), label: '추가: ' + v[0], state: 'progress', reportedAt: null, ev: { before: 0, after: 0 }, result: `변경 승인 필요 (+${fmtN(+v[1] || 0)}원)`, material: '-', review: null, change: { amount: +v[1] || 0, approved: false } }); w.cost.extra += +v[1] || 0; }); setModal(null); ctx.flash('작업 변경 요청 — 승인자 재승인 대기'); }} />}
      {modal === 'reject' && <SimpleModal title={`보완 요청 · ${it.id}`} fields={['반려 사유']} note="해당 항목만 재작업으로 전환됩니다." onClose={() => setModal(null)} onSave={(v) => { mut((w, x, o) => { x.state = 'rework'; x.review = '보완 요청: ' + v[0]; w.state = '재작업'; upTask(o, '진행', `${x.id} 재작업`, `${R.user} 보완 요청 (${x.id})`); }); setModal(null); }} />}
    </div>
  );
}

function ReportModal({ it, onClose, onSave }) {
  const [res, setRes] = useState('');
  const [exc, setExc] = useState('');
  const evOk = it.ev.before >= 1 && it.ev.after >= 1;
  return (
    <Modal title={`완료 보고 · ${it.id}`} onClose={onClose} actions={<><button className="btn" onClick={onClose}>취소</button><button className="btn pri" disabled={!res.trim() || !evOk} onClick={() => onSave(res, exc)}>보고 제출</button></>}>
      <Field label="수행 결과" req><textarea className="inp" value={res} onChange={(e) => setRes(e.target.value)} placeholder="예: 11/12 완료 · B12 제외 (정비 후 세척)" /></Field>
      <Field label="제외 대상 · 사유"><input className="inp" value={exc} onChange={(e) => setExc(e.target.value)} placeholder="예: B12 — 정비 미완료로 접근 제한" /></Field>
      <Field label="필수 증빙">{evOk ? <span style={{ color: 'var(--ok)' }}>작업 전 {it.ev.before}장 · 작업 후 {it.ev.after}장 — 충족</span> : <span className="fld-e">작업 전·후 각 1장 이상 필요 (현재 전 {it.ev.before} · 후 {it.ev.after}) — 증빙 탭에서 등록</span>}</Field>
    </Modal>
  );
}
function SimpleModal({ title, fields, note, onClose, onSave }) {
  const [v, setV] = useState(fields.map(() => ''));
  return (
    <Modal title={title} onClose={onClose} actions={<><button className="btn" onClick={onClose}>취소</button><button className="btn pri" disabled={v.some((x, i) => i < 2 && !String(x).trim())} onClick={() => onSave(v)}>저장</button></>}>
      {fields.map((f, i) => <Field key={f} label={f} req={i < 2}><input className="inp" value={v[i]} onChange={(e) => setV(v.map((x, j) => (j === i ? e.target.value : x)))} /></Field>)}
      {note && <Note kind="info">{note}</Note>}
    </Modal>
  );
}

Object.assign(window, { Work });
