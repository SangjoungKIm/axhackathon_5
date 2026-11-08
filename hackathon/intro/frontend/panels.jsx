/* SCR-03 패널 상태 — 배치도/목록 65% · 선택 패널 상세 35% · 하단 선택·작업 요청 */
function Panels({ ctx }) {
  const { role, R, ops, upd, sites, go, params, now } = ctx;
  const rounds = Object.values(ops.inspections).filter((i) => sites.includes(i.site) && ops.obs[i.id]).sort((a, b) => b.round - a.round || b.id.localeCompare(a.id));
  const st = ctx.ui('panels', { ins: null, view: 'map', jf: 'all', rf: 'all', zone: 'all', sel: null, tab: 'evidence', checked: {}, page: 1 });
  const routeIns = rounds.find((i) => i.id === params.ins);
  const routeChanged = st.routeIns !== (params.ins || null);
  const insId = (routeChanged && routeIns ? routeIns.id : null) || (rounds.find((i) => i.id === st.ins) || {}).id || (routeIns && routeIns.id) || (rounds[0] && rounds[0].id);
  useEffect(() => {
    if (routeChanged || st.ins !== insId) ctx.setUi('panels', { routeIns: params.ins || null, ins: insId || null, sel: null, checked: {}, page: 1, zone: 'all' });
  }, [params.ins, insId, st.ins, st.routeIns]);
  const [modal, setModal] = useState(null);
  const readOnly = role === 'drone';
  const canReview = canDo(role, 'review');
  const canSelect = canDo(role, 'workReq');
  if (!insId) return <div className="page" style={{ padding: 0 }}><TitleBar title={pageLabel(R, 'panels')} /><section className="panel" style={{ flex: 1 }}><div className="empty">분석 결과가 있는 점검 회차가 없습니다 · 점검을 먼저 진행하세요</div></section></div>;
  const ins = ops.inspections[insId];
  const obs = ops.obs[insId];
  const preview = window.AXDemo.preview(ins, obs);
  const all = Object.values(obs);
  const flt = all.filter((o) => (st.jf === 'all' || o.j === st.jf) && (st.rf === 'all' || o.review === '미검토') && (st.zone === 'all' || o.id[0] === st.zone));
  const cur = obs[st.sel] || flt[0] || all[0];
  const checked = !routeChanged && st.ins === insId ? Object.fromEntries(Object.entries(st.checked || {}).filter(([id]) => obs[id])) : {};
  const nChk = Object.keys(checked).filter((k) => checked[k]).length;
  const cnt = (j) => all.filter((o) => o.j === j).length;
  const valid = all.filter((o) => o.j !== 'und').length;
  const setChecked = (c) => ctx.setUi('panels', { checked: c });
  const setP = (o) => ctx.setUi('panels', o);
  const rev = (fn) => upd((x) => fn(x.obs[insId]));

  const reviewDone = (ids) => { rev((O) => ids.forEach((id) => { if (O[id].review === '미검토') { O[id].review = '확인 완료'; O[id].reviewer = R.user; O[id].reviewedAt = hhmm(now); } })); ctx.flash(`검토 완료 ${ids.length}건 · 검토자 ${R.user}`); };
  const PER = 12;
  const rows = flt.slice((st.page - 1) * PER, st.page * PER);

  return (
    <div className="page" style={{ padding: 0 }}>
      <TitleBar title={pageLabel(R, 'panels')} meta={`${siteName(ins.site)} · ${ins.round}회차 · 촬영 ${ins.shotAt || '미수집'} · 분석 ${ins.handed ? ins.handed.at : '진행 중'}`}>
        <select className="inp" style={{ width: 230 }} value={insId} onChange={(e) => setP({ ins: e.target.value, sel: null, checked: {}, page: 1 })}>{rounds.map((r) => <option key={r.id} value={r.id}>{siteName(r.site)} · {r.round}회차 ({r.id})</option>)}</select>
        <div className="seg">{[['all', '전체'], ['soil', '오염'], ['dmg', '파손'], ['und', '미판정'], ['ok', '외관 정상']].map(([k, l]) => <button key={k} className={st.jf === k ? 'on' : ''} onClick={() => setP({ jf: k, page: 1 })}>{l}</button>)}</div>
        <div className="seg"><button className={st.rf === 'all' ? 'on' : ''} onClick={() => setP({ rf: 'all' })}>검토 전체</button><button className={st.rf === 'wait' ? 'on' : ''} onClick={() => setP({ rf: 'wait' })}>검토 대기</button></div>
        <select className="inp" style={{ width: 96 }} value={st.zone} onChange={(e) => setP({ zone: e.target.value, page: 1 })}><option value="all">전 구역</option>{ins.zones.map((z) => <option key={z} value={z}>{z}구역</option>)}</select>
        <div className="seg"><button className={st.view === 'map' ? 'on' : ''} onClick={() => setP({ view: 'map' })}>배치도</button><button className={st.view === 'list' ? 'on' : ''} onClick={() => setP({ view: 'list' })}>목록</button></div>
      </TitleBar>
      <div className="band" style={{ gridTemplateColumns: 'repeat(7,1fr)', flex: 'none' }}>
        <button><label>등록 패널</label><b>{all.length}</b></button>
        <button><label>판정 완료율</label><b>{fmtN((valid / all.length) * 100, 1)}<small>%</small></b></button>
        <button><label>오염 판정 비율</label><b>{valid ? fmtN((cnt('soil') / valid) * 100, 1) : '—'}<small>%</small></b></button>
        <button onClick={() => setP({ jf: 'soil' })}><label>오염</label><b style={{ color: 'var(--warn)' }}>{cnt('soil')}</b></button>
        <button onClick={() => setP({ jf: 'dmg' })}><label>육안상 파손</label><b style={{ color: 'var(--crit)' }}>{cnt('dmg')}</b></button>
        <button onClick={() => setP({ jf: 'und' })}><label>미판정</label><b>{cnt('und')}</b></button>
        <button onClick={() => setP({ rf: 'wait' })}><label>미검토</label><b style={{ color: 'var(--fc)' }}>{all.filter((o) => o.review === '미검토').length}</b></button>
      </div>
      <div className="pgrid" style={{ gridTemplateColumns: '1fr 520px' }}>
        <section className="panel">
          <header className="ph"><h3>{st.view === 'map' ? '패널 배치도' : '패널 목록'}</h3><span className="ph-sub">가상 배치 · 실제 좌표·GPS 없음 · 필터 결과 {flt.length}</span>
            <div className="ph-r"><span className="legend"><span><Judg j="soil" /></span><span><Judg j="dmg" /></span><span><Judg j="und" /></span><span><Judg j="ok" /></span><span><i style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fc)' }} />미검토</span></span></div></header>
          <div className="pb" style={{ overflow: 'auto' }}>
            {st.view === 'map' ? (
              <PanelGrid ins={ins} obs={Object.fromEntries(Object.entries(obs).map(([k, v]) => [k, flt.includes(v) ? v : { ...v, j: v.j, dim: true }]))} sel={cur && cur.id} checked={checked}
                onPick={(id) => { setP({ sel: id }); }} />
            ) : (
              <table className="t">
                <thead><tr>{canSelect && <th style={{ width: 26 }} />}<th>패널 ID</th><th>구역·스트링</th><th>이미지 판정</th><th>사람 검토</th><th>작업 처리</th><th>근거</th></tr></thead>
                <tbody>{rows.map((o) => <tr key={o.id} className={cur && cur.id === o.id ? 'sel' : ''} onClick={() => setP({ sel: o.id })}>
                  {canSelect && <td onClick={(e) => e.stopPropagation()}><input type="checkbox" className="chkbox" checked={!!checked[o.id]} onChange={(e) => setChecked({ ...checked, [o.id]: e.target.checked })} /></td>}
                  <td className="num">{o.id}</td><td>{o.id[0]}구역 · {o.str}</td><td><Judg j={o.j} /></td><td style={{ color: o.review === '미검토' ? 'var(--fc)' : 'var(--tx2)' }}>{o.review}</td><td>{o.work}</td><td className="mini">{o.soilType || o.dmgPos || o.undReason || '—'}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="actbar">
            {canSelect ? <span className="sel-t">선택 <b>{nChk}</b>개 패널{nChk ? ` · ${Object.keys(checked).filter((k) => checked[k]).slice(0, 8).join(', ')}${nChk > 8 ? ' …' : ''}` : ''}</span> : <span className="sel-t">{readOnly ? '읽기 전용 — 작업 대상 선택·검토·작업 요청 불가' : '조회'}</span>}
            {st.view === 'list' && <Pager page={st.page} total={flt.length} per={PER} onPage={(p) => setP({ page: p })} />}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {canSelect && <><button className="btn" onClick={() => { const c = { ...checked }; (st.view === 'list' ? rows : flt).forEach((o) => (c[o.id] = true)); setChecked(c); }}>{st.view === 'list' ? '현재 페이지 선택' : '필터 결과 전체 선택'}</button>
                <button className="btn" disabled={!nChk} onClick={() => setChecked({})}>선택 해제</button></>}
              {canReview && <button className="btn" disabled={!Object.keys(checked).some((k) => checked[k] && obs[k].review === '미검토')} onClick={() => { reviewDone(Object.keys(checked).filter((k) => checked[k] && obs[k].review === '미검토')); }}>선택 검토 완료</button>}
              {canSelect && <button className="btn pri" disabled={!nChk} onClick={() => setModal('req')}>선택한 패널로 작업 요청</button>}
            </div>
          </div>
        </section>

        <section className="panel">
          <header className="ph"><h3>{cur.id}</h3><span className="ph-sub">{cur.id[0]}구역 · {cur.str} · {ins.id}</span><div className="ph-r"><Src k={ins.dataMode === 'actual' ? '등록 자료 · 외부 결과' : 'model'} /></div></header>
          <Tabs items={[['evidence', '판정·근거'], ['review', '검토·조치'], ['history', '이력']]} value={st.tab} onChange={(v) => setP({ tab: v })} />
          <div className="pb" style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
            {st.tab === 'evidence' && <>
              {preview ? <div className="df-source"><b>가상 시연 자료 · {cur.id} 가상 표본</b><img src={preview.panorama.dataUrl} alt={`${ins.site} ${cur.id} 가상 표본 배치도 · 실제 근접 촬영 아님`} style={{width:'100%',height:200,objectFit:'contain'}} /><span>합성 전사도 · 실제 이미지·센서 분석 아님</span></div> : cur.imageName ? <AssetPreview assets={ins.assets || []} name={cur.imageName} h={200} /> : cur.img ? <ImgSlot label={`원본 근접 RGB · ${cur.img}`} sub={`촬영 ${ins.shotAt || '미수집'} · 분석 ID AN-${insId.slice(-3)}-${cur.id}`} h={200} /> : <div className="imgslot" style={{ height: 200 }}><span>이미지 없음 — {cur.undReason}</span></div>}
              {ins.dataMode === 'actual' && <div className="mini">분석 출처 · {ins.analysis ? `${ins.analysis.source} · ${ins.analysis.analyzedAt}` : '결과 미등록 — 자동 판정하지 않음'}<br />원본 촬영 시각 · {ins.shotAt || '미확인'}</div>}
              <div className="statbox" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                <div><label>이미지 판정</label><b style={{ fontSize: 'calc(14px * var(--text-scale, 1))' }}><Judg j={cur.j} /></b></div>
                <div><label>사람 검토</label><b style={{ fontSize: 'calc(14px * var(--text-scale, 1))', fontFamily: 'IBM Plex Sans KR' }}>{cur.review}</b></div>
                <div><label>작업 처리</label><b style={{ fontSize: 'calc(14px * var(--text-scale, 1))', fontFamily: 'IBM Plex Sans KR' }}>{cur.work}</b></div>
              </div>
              <dl className="kv-list">
                <dt>오염 종류</dt><dd style={{ fontFamily: 'inherit' }}>{cur.soilType || '—'}</dd>
                <dt>파손 위치</dt><dd style={{ fontFamily: 'inherit' }}>{cur.dmgPos || '—'}</dd>
                <dt>미판정 사유</dt><dd style={{ fontFamily: 'inherit' }}>{cur.undReason || '—'}</dd>
                <dt>RGB–IR 대응</dt><dd style={{ fontFamily: 'inherit', color: 'var(--tx3)' }}>미확인 — 독립 자료로만 열람</dd>
              </dl>
              <Note kind="info">세 상태(이미지 판정 · 사람 검토 · 작업 처리)는 독립입니다. 작업 완료가 과거 관측의 판정을 바꾸지 않습니다.</Note>
            </>}
            {st.tab === 'review' && <>
              <dl className="kv-list">
                <dt>{ins.dataMode === 'actual' ? '등록 원본 판정' : 'AI 원본 판정'}</dt><dd><Judg j={cur.ai} /></dd>
                <dt>현재 검토 결과</dt><dd><Judg j={cur.j} /> <span className="mini">({cur.review})</span></dd>
                <dt>검토자 · 시각</dt><dd style={{ fontFamily: 'inherit' }}>{cur.reviewer ? `${cur.reviewer} · ${cur.reviewedAt}` : '—'}</dd>
                {cur.reason && <><dt>수정 사유</dt><dd style={{ fontFamily: 'inherit' }}>{cur.reason}</dd></>}
              </dl>
              {canReview ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn pri" disabled={cur.review !== '미검토'} onClick={() => reviewDone([cur.id])}>검토 완료</button>
                  <button className="btn" onClick={() => setModal('fix')}>판정 수정</button>
                </div>
              ) : <NoPerm text="기술 검토 권한이 없습니다 (마스터)" />}
              {canSelect && <button className="btn" onClick={() => setChecked({ ...checked, [cur.id]: !checked[cur.id] })}>{checked[cur.id] ? '작업 대상에서 제외' : '작업 대상으로 추가'}</button>}
            </>}
            {st.tab === 'history' && <>
              <div className="mini">회차별 관측</div>
              {Object.values(ops.inspections).filter((i) => i.site === ins.site && ops.obs[i.id] && ops.obs[i.id][cur.id]).map((i) => (
                <div key={i.id} className="chg" style={{ gridTemplateColumns: '120px 1fr auto' }}><span className="mono">{i.round}회차 · {i.shotAt ? i.shotAt.slice(5, 10) : '—'}</span><span><Judg j={ops.obs[i.id][cur.id].j} /></span><span className="mini">{ops.obs[i.id][cur.id].work}</span></div>
              ))}
              <div className="mini" style={{ marginTop: 6 }}>관련 작업</div>
              {Object.values(ops.workOrders).filter((w) => w.site === ins.site && w.targets && w.targets.includes(cur.id)).map((w) => (
                <div key={w.id} className="chg" style={{ gridTemplateColumns: '80px 1fr auto' }}><span className="mono">{w.id}</span><span>{w.service} · {w.state}</span>{ctx.can('work') && <button className="btn" style={{ padding: '1px 8px' }} onClick={() => go('work', { id: w.id })}>열기</button>}</div>
              ))}
            </>}
          </div>
        </section>
      </div>
      {modal === 'fix' && <FixModal o={cur} onClose={() => setModal(null)} onSave={(to, why) => { rev((O) => { O[cur.id].j = to; O[cur.id].review = '수정됨'; O[cur.id].reviewer = R.user; O[cur.id].reviewedAt = hhmm(now); O[cur.id].reason = why; }); ctx.flash(`${cur.id} 판정 수정 (AI 원본 보존)`); setModal(null); }} />}
      {modal === 'req' && <WorkReqModal ins={ins} obs={obs} ids={Object.keys(checked).filter((k) => checked[k])} onClose={() => setModal(null)} onSave={(svc) => { const id = ctx.createRequest(ins, Object.keys(checked).filter((k) => checked[k]), svc); setChecked({}); setModal(null); go('schedule', { id }); }} />}
    </div>
  );
}

function FixModal({ o, onClose, onSave }) {
  const [to, setTo] = useState(o.j === 'ok' ? 'soil' : 'ok');
  const [why, setWhy] = useState('');
  return (
    <Modal title="판정 수정" sub={o.id} onClose={onClose} actions={<><button className="btn" onClick={onClose}>취소</button><button className="btn pri" disabled={!why.trim()} onClick={() => onSave(to, why)}>수정 저장</button></>}>
      <Field label="AI 원본 판정"><div><Judg j={o.ai} /> <span className="mini">— 보존됩니다</span></div></Field>
      <Field label="새 판정" req><div className="seg">{['ok', 'soil', 'dmg'].map((k) => <button key={k} className={to === k ? 'on' : ''} onClick={() => setTo(k)}>{OPS.JUDG[k]}</button>)}</div></Field>
      <Field label="사유" req err={!why.trim() ? '사유는 필수입니다' : null}><textarea className="inp" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="예: 그림자 오분류 — 근접 이미지 재확인" /></Field>
    </Modal>
  );
}
function WorkReqModal({ ins, obs, ids, onClose, onSave }) {
  const g = { soil: ids.filter((i) => obs[i].j === 'soil'), dmg: ids.filter((i) => obs[i].j === 'dmg'), etc: ids.filter((i) => !['soil', 'dmg'].includes(obs[i].j)) };
  const [svc, setSvc] = useState({ 세척: g.soil.length > 0, 정비: g.dmg.length > 0 });
  return (
    <Modal title="선택한 패널로 작업 요청" sub={`${siteName(ins.site)} · ${ins.round}회차`} onClose={onClose} width={600} actions={<><button className="btn" onClick={onClose}>취소</button><button className="btn pri" disabled={!svc.세척 && !svc.정비} onClick={() => onSave(Object.keys(svc).filter((k) => svc[k]))}>요청 생성 → 일정·배정</button></>}>
      <dl className="kv-list">
        <dt>오염 패널</dt><dd>{g.soil.join(', ') || '—'}</dd>
        <dt>파손 패널</dt><dd>{g.dmg.join(', ') || '—'}</dd>
        <dt>기타 (정상·미판정)</dt><dd>{g.etc.join(', ') || '—'}</dd>
      </dl>
      <Field label="서비스" req><div style={{ display: 'flex', gap: 16 }}>{['세척', '정비'].map((k) => <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" className="chkbox" checked={svc[k]} onChange={(e) => setSvc({ ...svc, [k]: e.target.checked })} />{k}</label>)}</div></Field>
      <Note kind="info">AI 분류만으로 비용이 드는 작업을 확정하지 않습니다. 요청(REQ)과 업무가 생성되고, 패널 작업 상태가 “요청”으로 바뀝니다.</Note>
    </Modal>
  );
}

Object.assign(window, { Panels });
