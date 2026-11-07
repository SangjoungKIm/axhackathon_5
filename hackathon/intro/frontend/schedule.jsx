/* SCR-04 일정·배정 — 요청 범위 → 업체·견적 → 일정 → 최종 확인 */
const RSTEPS = ['요청 범위', '업체·견적', '일정', '최종 확인'];
const DAYS = ['11-09', '11-10', '11-11', '11-12', '11-13', '11-14', '11-15'];
const DOW = ['월', '화', '수', '목', '금', '토', '일'];
const HOURS = [9, 10, 11, 12, 13, 14, 15, 16];

function Schedule({ ctx }) {
  const { role, R, ops, sites, go, params } = ctx;
  const vendorRole = role === 'maint';
  const reqs = Object.values(ops.requests).filter((r) => sites.includes(r.site) && (!vendorRole || r.vendors.some((v) => v.org === R.vendorOrg)));
  const req = reqs.find((r) => r.id === params.id);
  if (req) return <ReqDetail key={req.id} ctx={ctx} req={req} />;
  return (
    <div className="page" style={{ padding: 0 }}>
      <TitleBar title={pageLabel(R, 'schedule')} meta={vendorRole ? `${ops.ORGS[R.vendorOrg].name}가 후보로 포함된 요청만 표시` : `${reqs.length}건`}>
        {canDo(role, 'workReq') && ctx.can('panels') && <button className="btn" onClick={() => go('panels', {})}>패널 상태에서 대상 선택</button>}
      </TitleBar>
      <section className="panel" style={{ flex: 1 }}>
        <header className="ph"><h3>{vendorRole ? '받은 요청' : '요청 목록'}</h3><span className="ph-sub">{reqs.length}건</span></header>
        <div className="pb">
          <table className="t">
            <thead><tr><th>요청 ID</th><th>발전소</th><th>서비스 · 대상</th><th>단계</th><th>현재 담당</th><th>승인자</th>{vendorRole && <th>자사 응답</th>}<th className="r">기한</th></tr></thead>
            <tbody>{reqs.map((r) => {
              const n = Object.values(r.panels).flat().length; const my = vendorRole && r.vendors.find((v) => v.org === R.vendorOrg);
              return <tr key={r.id} onClick={() => go('schedule', { id: r.id })} style={{ height: 52 }}><td className="num" style={{ height: 52 }}>{r.id}</td><td>{siteName(r.site)}</td><td>{r.services.join('·')} · {r.panels.str ? `스트링 ${n}개` : `패널 ${n}개`}</td><td><span className="stagepill">{r.cancelled ? '취소' : `${r.step}. ${RSTEPS[r.step - 1]}`}</span></td><td>{r.assignee}</td><td>{r.approver}</td>{vendorRole && <td>{my.response}</td>}<td className="r num">{r.due}</td></tr>;
            })}</tbody>
          </table>
          {!reqs.length && <div className="empty" style={{ height: 200 }}>받은 요청이 없습니다</div>}
        </div>
      </section>
    </div>
  );
}

function ReqDetail({ ctx, req }) {
  const { role, R, ops, upd, go, now } = ctx;
  const vendorRole = role === 'maint';
  const myV = vendorRole ? req.vendors.find((v) => v.org === R.vendorOrg) : null;
  const [S, setS] = useState(Math.min(3, req.step - 1));
  const [modal, setModal] = useState(null);
  const [sort, setSort] = useState('price');
  const [note, setNote] = useState(req.note);
  const cancelled = !!req.cancelled;
  const mut = (fn) => upd((o) => { const r = o.requests[req.id]; if (r && !r.cancelled) fn(r, o); });
  const chg = (r, msg) => r.changes.unshift([hhmm(now), msg]);
  const editable = !cancelled && canDo(role, 'reqEdit');
  const nTarget = Object.values(req.panels).flat().length;
  const selVendors = req.vendors.filter((v) => req.selected[v.org]);
  const task = ops.tasks.find((t) => t.link && t.link.id === req.id);
  const total = (v) => quoteSum(v.quote);
  const allSched = selVendors.length > 0 && selVendors.every((v) => req.schedule[v.org]);
  const accApprover = canDo(role, 'accept') && (role === 'master' || R.user === req.approver);

  const advance = (n) => { mut((r) => { r.step = Math.max(r.step, n + 1); }); setS(n); };

  const summary = (
    <Panel title="요청 요약" sub={req.id} bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <dl className="kv-list">
        <dt>발전소</dt><dd style={{ fontFamily: 'inherit' }}>{siteName(req.site)}</dd>
        <dt>대상</dt><dd>{req.panels.str ? `스트링 ${nTarget}개` : `패널 ${nTarget}개`}</dd>
        <dt>서비스</dt><dd style={{ fontFamily: 'inherit' }}>{req.services.join(' · ')}</dd>
        <dt>희망 기간</dt><dd>{req.wish}</dd>
        <dt>요청자</dt><dd style={{ fontFamily: 'inherit' }}>{req.requester}</dd>
        <dt>승인자</dt><dd style={{ fontFamily: 'inherit' }}>{req.approver}</dd>
        <dt>현재 담당</dt><dd style={{ fontFamily: 'inherit' }}>{req.assignee}</dd>
        <dt>기한</dt><dd>{req.due}</dd>
        {req.proposalDue && <><dt>제안 응답 기한</dt><dd>{req.proposalDue}</dd></>}
      </dl>
      {task && <div className="statbox" style={{ gridTemplateColumns: '1fr' }}><div><label>업무 {task.id} · 다음 행동</label><b style={{ fontSize: 'calc(13.5px * var(--text-scale, 1))', fontFamily: 'IBM Plex Sans KR', fontWeight: 600 }}>{task.next}</b></div></div>}
      <div className="mini" style={{ marginTop: 2 }}>최근 변경</div>
      <div style={{ overflow: 'hidden', flex: 1 }}>{req.changes.slice(0, 5).map((c, i) => <div key={i} className="chg"><span className="mono">{c[0]}</span><span>{c[1]}</span></div>)}</div>
    </Panel>
  );

  let body, actions;
  if (S === 0) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <table className="t"><thead><tr><th>대상</th><th>판정 근거</th><th>서비스</th></tr></thead><tbody>
          {req.panels.soil && req.panels.soil.map((p) => <tr key={p}><td className="num">{p}</td><td><Judg j="soil" /> <span className="mini">{ops.obs[req.inspection] && ops.obs[req.inspection][p] ? ops.obs[req.inspection][p].soilType : ''}</span></td><td>세척</td></tr>)}
          {req.panels.dmg && req.panels.dmg.map((p) => <tr key={p}><td className="num">{p}</td><td><Judg j="dmg" /> <span className="mini">{ops.obs[req.inspection] && ops.obs[req.inspection][p] ? ops.obs[req.inspection][p].dmgPos : ''}</span></td><td>정비</td></tr>)}
          {req.panels.str && req.panels.str.map((p) => <tr key={p}><td className="num">HN-INV-06 / {p}</td><td className="mini">{req.basis}</td><td>점검 · 세척</td></tr>)}
        </tbody></table>
        <Field label="현장 전달사항">{editable ? <textarea className="inp" value={note} onChange={(e) => setNote(e.target.value)} /> : <div style={{ color: 'var(--tx2)' }}>{req.note}</div>}</Field>
        <dl className="kv-list"><dt>범위에서 제외한 항목</dt><dd style={{ fontFamily: 'inherit' }}>{req.excluded}</dd></dl>
      </div>
    );
    actions = editable ? <button className="btn pri" onClick={() => { mut((r) => { r.note = note; }); advance(1); }}>업체 확인 →</button> : <><NoPerm text="요청 범위 편집 불가 (조회)" /><button className="btn" onClick={() => setS(1)}>다음 →</button></>;
  } else if (S === 1) {
    const vs = [...req.vendors].filter((v) => !vendorRole || v.org === R.vendorOrg).sort((a, b) => (sort === 'price' ? (total(a) ?? 1e12) - (total(b) ?? 1e12) : (a.slots[0] ? a.slots[0][0] : 'z').localeCompare(b.slots[0] ? b.slots[0][0] : 'z')));
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!vendorRole && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="mini">정렬</span><div className="seg"><button className={sort === 'price' ? 'on' : ''} onClick={() => setSort('price')}>견적 합계</button><button className={sort === 'date' ? 'on' : ''} onClick={() => setSort('date')}>빠른 일정</button></div><span className="mini" style={{ marginLeft: 'auto' }}>거리·평가 점수는 확보되지 않아 정렬 항목에서 제외</span></div>}
        <table className="t"><thead><tr>{editable && <th style={{ width: 26 }} />}<th>업체</th><th>서비스 · 팀</th><th>응답</th><th className="r">견적 합계</th><th>버전 · 세금</th><th>제시 작업시간</th><th>가능 일정</th></tr></thead><tbody>
          {vs.map((v) => <tr key={v.org} className={req.selected[v.org] ? 'sel' : ''} style={{ height: 52 }}>
            {editable && <td><input type="checkbox" className="chkbox" checked={!!req.selected[v.org]} onChange={(e) => mut((r) => { r.selected[v.org] = e.target.checked; })} /></td>}
            <td style={{ fontWeight: 600, height: 52 }}>{ops.ORGS[v.org].name}</td><td>{v.service} · {v.team}</td><td>{v.response}</td>
            <td className="r num" style={{ color: v.quote ? null : 'var(--tx3)' }}>{v.quote ? won2(total(v)) : v.onsite ? '현장 확인 후 견적' : '견적 미제출'}</td>
            <td className="num">{v.quote ? `v${v.quote.version} · 세금 ${v.quote.tax}` : '—'}</td><td>{v.quote ? v.quote.hours : '—'}</td>
            <td className="mini mono">{v.slots.length ? v.slots.map((s) => `${s[0]} ${s[1]}~${s[2]}시`).join(' · ') : '가능 여부 확인 필요'}</td></tr>)}
        </tbody></table>
        {(myV || selVendors[0]) && (myV || selVendors[0]).quote && <div>
          <div className="mini" style={{ marginBottom: 6 }}>견적 항목 · {ops.ORGS[(myV || selVendors[0]).org].name} v{(myV || selVendors[0]).quote.version} (유효 {(myV || selVendors[0]).quote.valid})</div>
          <table className="t"><thead><tr><th>항목</th><th className="r">수량</th><th className="r">단가</th><th className="r">금액</th></tr></thead><tbody>{(myV || selVendors[0]).quote.items.map((it, i) => <tr key={i}><td>{it[0]}</td><td className="r num">{it[1]}</td><td className="r num">{fmtN(it[2])}</td><td className="r num">{fmtN(it[1] * it[2])}</td></tr>)}</tbody></table>
        </div>}
      </div>
    );
    actions = <>
      {vendorRole && <button className="btn pri" onClick={() => setModal('quote')}>{myV.quote ? `견적 재제출 (v${myV.quote.version + 1})` : '견적 제출'}</button>}
      {editable && <button className="btn" disabled={!selVendors.length} onClick={() => { mut((r) => { r.proposalDue = '11-09 ' + hhmm(now); chg(r, `${R.user} 제안 요청 (응답 기한 48시간)`); }); ctx.flash('제안 요청 발송 — 응답 기한 48시간'); }}>제안 요청</button>}
      {(editable || vendorRole) && <button className="btn pri" disabled={editable && !selVendors.length} onClick={() => advance(2)}>일정 선택 →</button>}
    </>;
  } else if (S === 2) {
    const showV = vendorRole ? [myV] : selVendors;
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {showV.map((v) => {
          const pick = req.schedule[v.org];
          return (
            <div key={v.org}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}><b style={{ fontSize: 'calc(13px * var(--text-scale, 1))' }}>{ops.ORGS[v.org].name}</b><span className="mini">{v.team}</span><span className="mini mono" style={{ marginLeft: 'auto' }}>선택: {pick ? `${pick[0]} ${pick[1]}:00~${pick[2]}:00` : '—'}</span></div>
              <div className="cal">
                <span />{DAYS.map((d, i) => <span key={d} className="ch">{d} ({DOW[i]})</span>)}
                {HOURS.map((h) => <React.Fragment key={h}><span className="ct">{h}:00</span>{DAYS.map((d) => {
                  const sl = v.slots.find((s) => s[0] === d && h >= s[1] && h < s[2]);
                  const picked = pick && pick[0] === d && h >= pick[1] && h < pick[2];
                  const bk = !sl && (h === 12 || (d === '11-13' && h > 13));
                  return <span key={d} className={'cc ' + (picked ? 'pick' : sl ? 'av' : bk ? 'bk' : '')} onClick={() => sl && (editable || vendorRole) && mut((r) => { r.schedule[v.org] = sl; })} title={sl ? `${d} ${sl[1]}~${sl[2]}시 가능` : bk ? '예약됨' : '미확인'} />;
                })}</React.Fragment>)}
              </div>
            </div>
          );
        })}
        <div className="legend"><span><i style={{ background: 'color-mix(in oklch, var(--fc) 30%, var(--panel2))', height: 10, width: 14 }} />가능</span><span><i style={{ background: 'var(--panel2)', height: 10, width: 14 }} />예약 (타 고객 상세 비공개)</span><span><i style={{ background: 'radial-gradient(circle, var(--line2) 1px, transparent 1.3px) 0 0 / 5px 5px', height: 10, width: 14 }} />미확인</span><span><i style={{ background: 'var(--solar)', height: 10, width: 14 }} />선택</span><span className="mini">KST · 달력 선택은 확정이 아닌 제안</span></div>
      </div>
    );
    actions = <button className="btn pri" disabled={vendorRole ? !req.schedule[myV.org] : !allSched} onClick={() => { mut((r) => { chg(r, `${R.user} 일정 제안`); r.hold = '11-08 ' + hhmm(now); }); advance(3); }}>일정 제안 →</button>;
  } else {
    const sum = selVendors.reduce((a, v) => a + (total(v) || 0), 0);
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <table className="t"><thead><tr><th>업체 · 팀</th><th>서비스</th><th>일정</th><th className="r">견적</th><th>업체 수락</th></tr></thead><tbody>
          {selVendors.map((v) => { const p = req.schedule[v.org]; return <tr key={v.org}><td>{ops.ORGS[v.org].name} · {v.team}</td><td>{v.service}</td><td className="num">{p ? `${p[0]} ${p[1]}:00~${p[2]}:00` : '미정'}</td><td className="r num">{v.quote ? won2(total(v)) : '현장 확인 후 견적'}</td><td style={{ color: v.accept === '수락' ? 'var(--ok)' : 'var(--warn)' }}>{v.accept}</td></tr>; })}
        </tbody></table>
        <div className="statbox" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          <div><label>대상</label><b>{nTarget}<small>{req.panels.str ? '스트링' : '패널'}</small></b></div>
          <div><label>견적 총액 (세금 별도)</label><b>{fmtN(sum)}<small>원</small></b></div>
          <div><label>요청자 응답 ({req.approver})</label><b style={{ fontSize: 'calc(15px * var(--text-scale, 1))', fontFamily: 'IBM Plex Sans KR', color: req.reqAccept === '수락' ? 'var(--ok)' : 'var(--warn)' }}>{req.reqAccept}</b></div>
          <div><label>잠정 예약 만료</label><b style={{ fontSize: 'calc(15px * var(--text-scale, 1))' }}>{req.hold || '—'}</b></div>
        </div>
        <dl className="kv-list"><dt>범위에서 제외</dt><dd style={{ fontFamily: 'inherit' }}>{req.excluded}</dd><dt>승인 범위</dt><dd style={{ fontFamily: 'inherit' }}>{req.services.join(' · ')} · {req.panels.str ? req.panels.str.join(', ') : Object.values(req.panels).flat().join(', ')}</dd></dl>
        {!cancelled && req.issuedWorkOrderIds && req.issuedWorkOrderIds.length > 0 && <Note kind="info">작업지시 {req.issuedWorkOrderIds.join(', ')} 연결 유지 — 기존 지시는 재발행하지 않습니다.</Note>}
      </div>
    );
    const issue = (o, r) => {
      if (r.cancelled) return;
      // 변경 요청·재수락 시에도 최초 발행 연결을 보존한다.
      const issued = [...new Set([...(r.issuedWorkOrderIds || []), ...Object.values(o.workOrders).filter((w) => w.requestId === r.id).map((w) => w.id)])];
      if (issued.length) { r.issuedWorkOrderIds = issued; return; }
      const vendors = r.vendors.filter((v) => r.selected[v.org]);
      if (r.reqAccept !== '수락' || !vendors.length || !vendors.every((v) => v.accept === '수락' && r.schedule[v.org])) return;
      const orders = vendors.map((v) => {
        const services = r.services.filter((s) => v.service.split('·').map((x) => x.trim()).includes(s));
        const targets = [...new Set(r.panels.str ? (services.length ? r.panels.str : []) : services.flatMap((s) => s === '세척' ? (r.panels.soil || []) : s === '정비' ? (r.panels.dmg || []) : []))];
        return { v, services, targets };
      });
      if (orders.some(({ targets }) => !targets.length)) return;
      r.issuedWorkOrderIds = [];
      orders.forEach(({ v, services, targets }) => {
        let num = 2100 + Object.keys(o.workOrders).length;
        while (o.workOrders['WO-' + num]) num++;
        const wid = 'WO-' + num;
        const p = r.schedule[v.org];
        o.workOrders[wid] = { id: wid, requestId: r.id, site: r.site, service: services.join('·'), team: o.ORGS[v.org].name + ' ' + v.team, vendor: v.org, state: '예정', schedule: `2026-${p[0]} ${p[1]}:00~${p[2]}:00`, approver: r.approver, reviewer: r.approver, quoteVersion: v.quote ? 'v' + v.quote.version : '-', issuedAt: '2026-11-07 ' + hhmm(now), inspection: r.inspection, next: '작업 시작', scope: `${services.join('·')} ${targets.length}개 대상`, note: r.note, targets: r.panels.str ? [] : targets,
          items: targets.map((x) => ({ id: x, label: `${x} ${services.join('·')}`, state: 'todo', reportedAt: null, ev: { before: 0, after: 0 }, result: '-', material: '-', review: null })), cost: { base: quoteSum(v.quote) || 0, extra: 0, tax: v.quote ? v.quote.tax : '별도' } };
        r.issuedWorkOrderIds.push(wid);
        chg(r, `작업지시 ${wid} 자동 발행`);
      });
      const ids = r.issuedWorkOrderIds.join(', ');
      const t = o.tasks.find((x) => x.link && x.link.id === r.id); if (t) { t.stage = '확정'; t.next = `${ids} 작업 예정`; t.changes.unshift([hhmm(now), `양측 수락 → ${ids} 발행`]); t.assignee = 'maint'; t.assigneeLabel = vendors.map((v) => o.ORGS[v.org].name).join(' · '); }
      ctx.flash(`양측 수락 완료 — 작업지시 ${ids} 발행`);
    };
    actions = <>
      {accApprover && <button className="btn pri" disabled={req.reqAccept === '수락'} onClick={() => mut((r, o) => { r.reqAccept = '수락'; chg(r, `${R.user} 최종 수락${role === 'master' ? ' (승인자 대행)' : ''}`); issue(o, r); })}>수락</button>}
      {canDo(role, 'accept') && !accApprover && <NoPerm text={`수락은 승인자(${req.approver})만 가능`} />}
      {canDo(role, 'vAccept') && (myV || role === 'master') && <button className={'btn' + (role === 'master' ? '' : ' pri')} disabled={vendorRole ? myV.accept === '수락' : selVendors.every((v) => v.accept === '수락')} onClick={() => mut((r, o) => { r.vendors.forEach((v) => { if ((vendorRole && v.org === R.vendorOrg) || (!vendorRole && r.selected[v.org])) v.accept = '수락'; }); chg(r, `${R.user} 업체 수락`); issue(o, r); })}>업체 수락</button>}
      {canDo(role, 'change') && <button className="btn" onClick={() => setModal('change')}>변경 요청</button>}
      {canDo(role, 'change') && <button className="btn" onClick={() => { mut((r, o) => { r.cancelled = true; r.state = '취소'; r.reqAccept = '취소'; r.vendors.forEach((v) => { v.accept = '취소'; }); r.hold = null; const t = o.tasks.find((x) => x.link && x.link.id === r.id); if (t) { t.stage = '취소'; t.next = '요청 취소 · 수락·발행 불가'; t.changes.unshift([hhmm(now), `${R.user} 요청 취소`]); } chg(r, `${R.user} 요청 취소 · 잠정 예약 해제`); }); ctx.flash('요청 취소 — 잠정 예약 해제'); }}>요청 취소</button>}
    </>;
  }

  if (cancelled) actions = <NoPerm text="취소된 요청 — 수락·발행 및 변경 불가" />;

  return (
    <div className="page" style={{ padding: 0 }}>
      <TitleBar title={req.id} meta={`${cancelled ? '취소 · ' : ''}${siteName(req.site)} · ${req.services.join('·')} · 현재 담당 ${req.assignee} · 승인자 ${req.approver}`} back={{ label: pageLabel(R, 'schedule'), fn: () => go('schedule', {}) }} />
      <Steps items={RSTEPS} cur={S} done={Array.from({ length: req.step - 1 }, (_, i) => i).filter((i) => i !== S)} onPick={(i) => i < req.step && setS(i)} />
      <div className="pgrid" style={{ gridTemplateColumns: '1fr 440px' }}>
        <section className="panel">
          <header className="ph"><h3>{RSTEPS[S]}</h3><span className="ph-sub">{S === 2 ? '주간 일정표 11-09 ~ 11-15 (KST)' : S === 1 ? '업체 후보 · 실제 입력된 값으로만 정렬' : ''}</span><div className="ph-r"><Src k="synth" /></div></header>
          <div className="pb" style={{ overflow: 'auto' }}>{body}</div>
          <div className="actbar"><span className="sel-t">{req.id} · {RSTEPS[S]}{S === 1 && editable ? ` · 선택 업체 ${selVendors.length}` : ''}</span><div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flex: 'none' }}>{actions}</div></div>
        </section>
        {summary}
      </div>
      {!cancelled && modal === 'quote' && <QuoteModal v={myV} req={req} onClose={() => setModal(null)} onSave={(q, onsite) => { mut((r) => { const v = r.vendors.find((x) => x.org === R.vendorOrg); if (onsite) { v.response = '현장 확인 후 견적'; v.onsite = true; chg(r, `${ops.ORGS[v.org].name} 현장 확인 후 견적 응답`); } else { v.quote = q; v.response = '견적 제출'; chg(r, `${ops.ORGS[v.org].name} 견적 v${q.version} 제출`); } }); setModal(null); ctx.flash(onsite ? '응답 기록 — 현장 확인 후 견적' : '견적 제출 완료'); }} />}
      {!cancelled && modal === 'change' && <ChangeModal onClose={() => setModal(null)} onSave={(why) => { mut((r) => { r.step = 3; r.reqAccept = '대기'; r.vendors.forEach((v) => (v.accept = '대기')); chg(r, `${R.user} 변경 요청: ${why} (기존 범위 보존)`); }); setS(2); setModal(null); }} />}
    </div>
  );
}

function QuoteModal({ v, req, onClose, onSave }) {
  const n = Object.values(req.panels).flat().length;
  const [unit, setUnit] = useState(v.quote ? v.quote.items[0][2] : 30000);
  const [qty, setQty] = useState(n);
  const [extra, setExtra] = useState(60000);
  const [tax, setTax] = useState('별도');
  const [hours, setHours] = useState('3시간');
  const ver = v.quote ? v.quote.version + 1 : 1;
  const sum = Number(unit) * Number(qty) + Number(extra);
  return (
    <Modal title={`견적 제출 · v${ver}`} sub={req.id} onClose={onClose} width={600} actions={<><button className="btn" onClick={() => onSave(null, true)}>현장 확인 후 견적</button><button className="btn" onClick={onClose}>취소</button><button className="btn pri" disabled={!Number.isFinite(sum) || Number(unit) <= 0 || Number(qty) <= 0 || Number(extra) < 0 || !hours} onClick={() => onSave({ version: ver, items: [[req.services.join('·') + ' (대상 단위)', Number(qty), Number(unit)], ['출장비·추가비', 1, Number(extra)]], tax, valid: '2026-11-14', hours: hours + ' (업체 제시)' })}>견적 제출</button></>}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="단가 (원/대상)" req><input className="inp" type="number" value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
        <Field label="수량" req><input className="inp" type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
        <Field label="추가비 (출장비 등)"><input className="inp" type="number" value={extra} onChange={(e) => setExtra(e.target.value)} /></Field>
        <Field label="세금"><div className="seg"><button className={tax === '별도' ? 'on' : ''} onClick={() => setTax('별도')}>별도</button><button className={tax === '포함' ? 'on' : ''} onClick={() => setTax('포함')}>포함</button></div></Field>
        <Field label="제시 작업시간" req hint="업체 제시값 — 측정값·AI 예측 아님"><input className="inp" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        <Field label="합계"><b className="mono" style={{ fontSize: 'calc(18px * var(--text-scale, 1))' }}>{fmtN(sum)}원 <span className="mini">세금 {tax}</span></b></Field>
      </div>
      <Note kind="info">재제출 시 버전이 증가하고 이전 버전은 보존됩니다. 유효기간 2026-11-14.</Note>
    </Modal>
  );
}
function ChangeModal({ onClose, onSave }) {
  const [why, setWhy] = useState('');
  return (
    <Modal title="변경 요청" onClose={onClose} actions={<><button className="btn" onClick={onClose}>취소</button><button className="btn pri" disabled={!why.trim()} onClick={() => onSave(why)}>변경 요청</button></>}>
      <Field label="사유" req><textarea className="inp" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="예: 11-10 오전으로 일정 변경 희망" /></Field>
      <Note kind="info">일정 단계로 되돌아가며 기존 확정 범위는 보존되고 새 제안으로 처리됩니다.</Note>
    </Modal>
  );
}

Object.assign(window, { Schedule });
