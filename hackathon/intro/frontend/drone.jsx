/* SCR-02 드론 점검 — 목록 / 상세(자료 준비 → 탐지·경로 검토 → 촬영 → 자료 수신·인계) */
const DSTEPS = ['자료 준비', '탐지·경로 검토', '촬영', '자료 수신·인계'];

function PanelGrid({ ins, obs, sel, onPick, checked, route, progress, compact }) {
  return (
    <div className="pmap" style={{ gridTemplateColumns: `repeat(${ins.zones.length > 4 ? 3 : 2}, 1fr)` }}>
      {ins.zones.map((z, zi) => (
        <div key={z} className="pzone">
          <span>{z}구역</span>
          <div className="pcells" style={{ gridTemplateColumns: `repeat(${ins.cols}, 1fr)` }}>
            {Array.from({ length: ins.rows * ins.cols }, (_, i) => {
              const id = z + String(i + 1).padStart(2, '0');
              const o = obs && obs[id];
              const ord = zi * ins.rows * ins.cols + i;
              const cls = ['pc', o ? o.j : '', sel === id ? 'sel' : '', checked && checked[id] ? 'chk' : '', o && o.review === '미검토' && o.j !== 'ok' ? 'rev' : '', route ? 'route' : ''].join(' ');
              const done = progress != null && Math.floor(ord / ((ins.rows * ins.cols * ins.zones.length) / ins.shoot.total)) < progress;
              return (
                <div key={id} className={cls} style={{ height: compact ? 24 : 30, background: done ? 'color-mix(in oklch, var(--fc) 30%, var(--panel2))' : undefined }} onClick={() => onPick && onPick(id)} title={o ? `${id} · ${OPS.JUDG[o.j]} · 검토 ${o.review}` : id}>
                  {id}
                  {route && i % 3 === 0 && <span className="ord">{Math.floor(ord / 3) + 1}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Drone({ ctx }) {
  const { role, R, ops, upd, sites, go, params, now } = ctx;
  const can2 = canDo(role, 'droneRun');
  const list = Object.values(ops.inspections).filter((i) => sites.includes(i.site)).sort((a, b) =>
    a.id === b.id ? 0 : a.id === 'INS-2026-031' ? -1 : b.id === 'INS-2026-031' ? 1 : b.id.localeCompare(a.id));
  const st = ctx.ui('drone', { page: 1 });
  const id = params.id;
  const ins = list.find((i) => i.id === id);
  const [modal, setModal] = useState(null);

  if (!ins) {
    const PER = 8;
    const rows = list.slice((st.page - 1) * PER, st.page * PER);
    return (
      <div className="page" style={{ padding: 0 }}>
        <TitleBar title={pageLabel(R, 'drone')} meta={`${list.length}건 · ${sites.length === 1 ? siteName(sites[0]) : '전체 발전소 (' + sites.length + ')'}`}>
          {canDo(role, 'upload') && <button className="btn" onClick={() => setModal('upload')}>보유 자료 업로드</button>}
          {canDo(role, 'inspReq') && <button className="btn pri" onClick={() => setModal('req')}>점검 요청</button>}
        </TitleBar>
        <section className="panel" style={{ flex: 1 }}>
          <header className="ph"><h3>점검 목록</h3><span className="ph-sub">{list.length}건</span><div className="ph-r"><Pager page={st.page} total={list.length} per={PER} onPage={(p) => ctx.setUi('drone', { page: p })} /></div></header>
          <div className="pb">
            <table className="t">
              <thead><tr><th>점검 ID</th><th>발전소</th><th>회차 · 목적</th><th>대상</th><th>단계</th><th>담당 수행자</th><th>촬영일</th><th className="r">수신 / 분석</th></tr></thead>
              <tbody>
                {rows.map((i) => {
                  const f = i.files ? Object.values(i.files).reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2]], [0, 0, 0]) : null;
                  return (
                    <tr key={i.id} onClick={() => go('drone', { id: i.id })} style={{ height: 52 }}>
                      <td className="num" style={{ height: 52 }}>{i.id}</td>
                      <td>{siteName(i.site)}</td>
                      <td>{i.round}회차 · {i.purpose}</td>
                      <td style={{ color: 'var(--tx2)' }}>{i.target}</td>
                      <td><span className="stagepill">{i.stage}</span></td>
                      <td style={{ color: i.drone ? null : 'var(--warn)' }}>{i.drone || '미배정'}</td>
                      <td className="num" style={{ color: i.shotAt ? null : 'var(--tx3)' }}>{i.shotAt || '미수집'}</td>
                      <td className="r num">{f ? `${f[1]}/${f[0]} · ${f[2]}/${f[0]}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!list.length && <div className="empty" style={{ height: 200 }}>배정된 점검이 없습니다</div>}
          </div>
        </section>
        {modal === 'req' && <InspReqModal R={R} sites={sites} draft={ctx.drafts.inspection} setDraft={(d) => ctx.setDrafts({ ...ctx.drafts, inspection: d })} onClose={() => setModal(null)} onSubmit={(d) => { ctx.submitInspection(d); setModal(null); }} />}
        {modal === 'upload' && <UploadModal sites={sites} onClose={() => setModal(null)} onSubmit={async (d) => {
          if (typeof ctx.submitUpload !== 'function') throw new Error('submitUpload 저장 콜백이 연결되지 않았습니다');
          const saved = await ctx.submitUpload(d);
          setModal(null);
          if (saved && (typeof saved === 'string' || saved.id)) go('drone', { id: typeof saved === 'string' ? saved : saved.id });
        }} />}
      </div>
    );
  }

  return role === 'drone' || window.AXDemo.preview(ins, ops.obs[ins.id]) ? <DroneFlow key={ins.id} ctx={ctx} ins={ins} /> : <DroneDetail key={ins.id} ctx={ctx} ins={ins} />;
}

function DroneDetail({ ctx, ins }) {
  const { role, R, ops, upd, go, now } = ctx;
  const can2 = canDo(role, 'droneRun');
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uploadInput = useRef(null);
  const busyRef = useRef(false);
  const step = ctx.ui('drone-' + ins.id, { step: Math.min(3, Math.max(0, ins.step)), tab: 'main' });
  const S = step.step;
  const setS = (n) => ctx.setUi('drone-' + ins.id, { step: n });
  let curX = null;
  const log = (type, msg) => curX && curX.log.unshift([hhmm(now), type, msg]);
  const lockedSeed = !!ins.handed && ins.dataMode !== 'actual';
  const mut = (fn) => upd((o) => { const x = o.inspections[ins.id]; if (x.handed && x.dataMode !== 'actual') return; curX = x; fn(x, o); });
  const obs = ops.obs[ins.id];
  const fTot = ins.files ? Object.values(ins.files).reduce((a, v) => [a[0] + v[0], a[1] + v[1], a[2] + v[2], a[3] + v[3]], [0, 0, 0, 0]) : null;
  const sh = ins.shoot;
  const task = ops.tasks.find((t) => t.link && t.link.id === ins.id);
  const actual = ins.dataMode === 'actual';
  const hasAssets = !!(ins.assets && ins.assets.length);
  const readyForHandover = (x, observations) => {
    if (!observations || !Object.keys(observations).length || !x.files || !Object.values(x.files).some((v) => v[1] > 0)) return false;
    if (x.dataMode !== 'actual') return true;
    if (!(x.assets && x.assets.length)) return false;
    const names = new Set(x.assets.map((a) => a.name));
    for (const z of x.zones) for (let i = 1; i <= x.rows * x.cols; i++) {
      const o = observations[z + String(i).padStart(2, '0')];
      if (!o || (o.imageName && !names.has(o.imageName))) return false;
    }
    return Object.values(observations).some((o) => o.imageName && names.has(o.imageName));
  };
  const canHandover = readyForHandover(ins, obs);
  const run = async (fn) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(e.message); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const registerAnalysis = async (payload) => {
    if (ins.handed) throw new Error('인계된 회차는 변경할 수 없습니다');
    if (typeof ctx.registerAnalysis !== 'function') throw new Error('registerAnalysis 저장 콜백이 연결되지 않았습니다');
    const effectiveResult = payload.result || ins.analysis || ins.analysisResult || null;
    window.AXAnalysis.buildObservations(ins, payload.assets, effectiveResult, obs);
    await ctx.registerAnalysis(ins.id, payload);
    mut((x) => { x.dataMode = 'actual'; x.shoot.running = false; });
  };
  const uploadSource = async (event) => {
    const files = Array.from(event.target.files || []); event.target.value = '';
    if (!files.length) return;
    await run(async () => {
      if (ins.handed) throw new Error('인계된 회차는 변경할 수 없습니다');
      const added = await window.AXAnalysis.readImages(files);
      const combined = window.AXAnalysis.mergeAssets(ins.assets || [], added);
      if (typeof ctx.registerImages === 'function') await ctx.registerImages(ins.id, combined);
      else await registerAnalysis({ assets: combined, result: ins.analysis || ins.analysisResult || null });
      mut((x) => { x.dataMode = 'actual'; x.shoot.running = false; x.imageName = added[0].name; x.image = added[0].name; x.source = '실제 이미지 업로드'; log('image.registered', '실제 전경 이미지 등록 · ' + added[0].name); });
    });
  };
  const receive = () => run(async () => {
    if (ins.handed) throw new Error('인계된 회차는 변경할 수 없습니다');
    if (actual) {
      await registerAnalysis({ assets: ins.assets || [], result: null });
      mut((x) => { x.step = 3; x.stage = '자료 수신·인계'; log('files.received', '실제 이미지 등록 · 외부 분석 결과 미등록'); });
    } else {
      // 실제 자산이 없는 시연 촬영은 사진이나 성공 건수를 생성하지 않는다.
      mut((x) => { x.step = 3; x.stage = '자료 수신·인계'; log('files.awaiting_upload', '시연 촬영 종료 · 실제 이미지와 외부 결과 업로드 필요'); });
    }
    setS(3);
  });

  // 촬영 시뮬레이션 진행
  useEffect(() => {
    if (!sh.running || actual || lockedSeed) return;
    const tm = setInterval(() => {
      mut((x) => {
        if (!x.shoot.running || x.dataMode === 'actual') return;
        x.shoot.done = Math.min(x.shoot.total, x.shoot.done + 1);
        if (ctx.scenario.fails.includes(x.shoot.done) && !x.shoot.fail.includes(x.shoot.done)) { x.shoot.fail.push(x.shoot.done); x.log.unshift([hhmm(ctx.nowRef.current), 'shoot.action_failed', `동작 ${x.shoot.done} 실패 (시뮬레이션)`]); }
        if (x.shoot.done >= x.shoot.total) { x.shoot.running = false; }
      });
    }, 700);
    return () => clearInterval(tm);
  }, [sh.running, ins.id, actual, lockedSeed]);

  const right = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <dl className="kv-list">
        <dt>발전소</dt><dd style={{ fontFamily: 'inherit' }}>{siteName(ins.site)}</dd>
        <dt>회차 · 목적</dt><dd style={{ fontFamily: 'inherit' }}>{ins.round}회차 · {ins.purpose}</dd>
        <dt>대상</dt><dd style={{ fontFamily: 'inherit' }}>{ins.target}</dd>
        <dt>담당 수행자</dt><dd style={{ fontFamily: 'inherit', color: ins.drone ? null : 'var(--warn)' }}>{ins.drone || '미배정'}</dd>
        <dt>기체</dt><dd>{ins.aircraft}</dd>
        <dt>자료 출처</dt><dd style={{ fontFamily: 'inherit' }}>{ins.source}</dd>
        <dt>희망 기간</dt><dd>{ins.wish}</dd>
        <dt>원본 촬영 시각</dt><dd style={{ color: ins.shotAt ? null : 'var(--tx3)' }}>{ins.shotAt || '미수집'}</dd>
      </dl>
      <div className="mini">현장 전달 · {ins.note}</div>
      {task && <div className="statbox" style={{ gridTemplateColumns: '1fr' }}><div><label>업무 {task.id} · 현재 담당자 {task.assigneeLabel}</label><b style={{ fontSize: 'calc(13.5px * var(--text-scale, 1))', fontFamily: 'IBM Plex Sans KR', fontWeight: 600 }}>{task.next}</b></div></div>}
    </div>
  );

  let body, actions;
  if (S === 0) {
    body = ins.imageName || ins.image ? (
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ins.imageName ? <AssetPreview assets={ins.assets || []} name={ins.imageName} h={'100%'} style={{ flex: 1 }} /> : actual ? <div className="empty">실제 전경 이미지 미등록</div> : <ImgSlot label={`전경 RGB 이미지 · ${ins.image}`} sub="드론 전경 사진 (시연 자료)" h={'100%'} style={{ flex: 1 }} />}
      </div>
    ) : <div className="empty" style={{ height: '100%', flexDirection: 'column', gap: 10 }}>전경 이미지 미등록<span className="mini">탐지 실행에는 대상 패널이 보이는 전체 RGB 사진이 필요합니다</span></div>;
    actions = can2 ? <>
      <button className="btn" disabled={busy} onClick={() => uploadInput.current && uploadInput.current.click()}>이미지 업로드</button>
      {actual ? <button className="btn pri" disabled={busy || !hasAssets} onClick={receive}>실제 자료 등록으로 →</button> : <button className="btn pri" disabled={!ins.image || !ins.drone} title={!ins.drone ? '담당 수행자 필요' : null} onClick={() => { mut((x) => { x.detect = { n: x.zones.length * x.rows * x.cols, unlinked: 0 }; x.step = Math.max(x.step, 1); x.stage = '탐지·경로 검토'; x.log.unshift([hhmm(now), 'detection.completed', `탐지 ${x.zones.length * x.rows * x.cols} / 미연결 0 (시연)`]); }); setS(1); }}>탐지 실행 (시연)</button>}
    </> : <NoPerm />;
  } else if (S === 1) {
    body = ins.detect ? <PanelGrid ins={ins} obs={null} route={!!ins.route} /> : <div className="empty">탐지 결과 없음 — 자료 준비 단계에서 탐지를 실행하세요</div>;
    actions = actual ? (can2 ? <button className="btn pri" disabled={busy} onClick={receive}>실제 자료 등록으로 →</button> : <NoPerm />) : can2 ? <>
      <button className="btn" disabled={!ins.detect} onClick={() => mut((x) => { x.route = { ver: (x.route ? x.route.ver : 0) + 1, reviewedBy: null, reviewedAt: null }; log('route.generated', `경로 v${x.route.ver} 생성`); })}>경로 생성</button>
      <button className="btn pri" disabled={!ins.route || ins.route.reviewedBy} onClick={() => { mut((x) => { x.route.reviewedBy = R.user; x.route.reviewedAt = hhmm(now); x.step = Math.max(x.step, 2); x.stage = '촬영'; log('route.reviewed', `경로 v${x.route.ver} 검토 완료 (${R.user})`); }); setS(2); }}>경로 검토 완료</button>
    </> : <NoPerm />;
  } else if (S === 2) {
    body = <PanelGrid ins={ins} obs={null} route progress={sh.done} />;
    actions = actual ? (can2 ? <><span className="mini">실제 자료 경로 · 시연 촬영과 무관</span><button className="btn pri" disabled={busy} onClick={receive}>자료 수신으로 →</button></> : <NoPerm />) : ins.source === '보유 자료 업로드' ? <span className="mini">보유 자료 업로드로 시작 — 촬영 단계 적용 없음</span> : can2 ? <>
      {!sh.running && !sh.finished && <button className="btn pri" disabled={!ins.route || !ins.route.reviewedBy} onClick={() => mut((x) => { x.shoot.running = true; log('shoot.started', sh.done ? '촬영 시뮬레이션 재개' : '촬영 시뮬레이션 시작 (실제 기체 명령 아님)'); })}>{sh.done ? '재개' : '촬영 시뮬레이션 시작'}</button>}
      {sh.running && <button className="btn" onClick={() => mut((x) => { x.shoot.running = false; log('shoot.paused', '일시정지'); })}>일시정지</button>}
      {!sh.finished && sh.done > 0 && <button className="btn" disabled={sh.running || sh.done < sh.total} onClick={() => mut((x) => { x.shoot.finished = true; x.log.unshift([hhmm(now), 'shoot.finished', `시연 촬영 ${x.shoot.done}/${x.shoot.total} 종료 · 실제 촬영 시각 미확인`]); })}>종료</button>}
      {(sh.finished || actual) && <button className="btn pri" disabled={busy} onClick={receive}>자료 수신으로 →</button>}
    </> : <NoPerm />;
  } else {
    body = ins.files ? (
      <>
        {actual && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
            <div className="mini">외부 분석 출처: {(ins.analysis || ins.analysisResult)?.source || '미등록'} · 분석 시각: {(ins.analysis || ins.analysisResult)?.analyzedAt || '미확인'} · 등록 결과 {(ins.analysis || ins.analysisResult)?.panels?.length || 0}개</div>
            {ins.imageName && <AssetPreview assets={ins.assets || []} name={ins.imageName} h={160} />}
          </div>
        )}
        <table className="t"><thead><tr><th>구역 묶음</th><th className="r">예정</th><th className="r">수신</th><th className="r">분석 성공</th><th className="r">실패·미수신</th><th>상태</th></tr></thead>
          <tbody>{Object.entries(ins.files).map(([z, v]) => <tr key={z}><td>{z}구역 근접 이미지</td><td className="r num">{v[0]}</td><td className="r num">{v[1]}</td><td className="r num">{v[2]}</td><td className={'r num ' + (v[3] ? 'dn' : '')}>{v[3]}</td><td>{v[3] ? <span className="judg" style={{ '--c': 'var(--warn)' }}>재시도 필요</span> : <span className="judg" style={{ '--c': 'var(--ok)' }}>완료</span>}</td></tr>)}</tbody>
        </table>
      </>
    ) : <div className="empty">수신 자료 없음</div>;
    actions = can2 && !ins.handed ? <>
      {actual || !hasAssets ? <button className="btn" disabled={busy} onClick={() => setModal('analysis')}>이미지 · 분석 결과 가져오기</button> : <button className="btn" disabled={!fTot || !fTot[3]} onClick={() => mut((x) => { Object.values(x.files).forEach((v) => { v[1] = v[0]; v[2] = v[0]; v[3] = 0; }); log('analysis.retried', '시연 실패 항목 재시도 → 성공'); })}>실패 항목 재시도 (시연)</button>}
      <button className="btn pri" disabled={busy || !canHandover} title={!canHandover ? '실제 수신 자료와 패널 관측 등록이 필요합니다' : null} onClick={() => setModal('handover')}>자료 인계</button>
    </> : ins.handed ? <><span className="mini">인계 완료 · {ins.handed.to} · {ins.handed.at} · {ins.handed.policy}</span>{ctx.can('panels') && ops.obs[ins.id] && <button className="btn pri" onClick={() => go('panels', { ins: ins.id })}>결과 보기 →</button>}</> : <NoPerm />;
  }

  if (lockedSeed && S < 3) actions = <span className="mini">인계된 시연 회차 · 원본 변경 불가</span>;

  const metr = S === 2 || S === 3;
  return (
    <div className="page" style={{ padding: 0 }}>
      <input ref={uploadInput} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden disabled={busy} onChange={uploadSource} />
      <TitleBar title={ins.id} meta={`${siteName(ins.site)} · ${ins.round}회차 · ${ins.stage}`} back={{ label: pageLabel(R, 'drone'), fn: () => go('drone', {}) }}>
        <div className="seg"><button className={step.tab === 'main' ? 'on' : ''} onClick={() => ctx.setUi('drone-' + ins.id, { tab: 'main' })}>진행</button><button className={step.tab === 'log' ? 'on' : ''} onClick={() => ctx.setUi('drone-' + ins.id, { tab: 'log' })}>실행 기록</button></div>
      </TitleBar>
      <Steps items={DSTEPS} cur={S} done={Array.from({ length: ins.step }, (_, i) => i).filter((i) => i !== S)} onPick={(i) => i <= Math.max(ins.step, 0) && setS(i)} />
      {error && <div role="alert"><Note>{error}</Note></div>}
      <div className="pgrid" style={{ gridTemplateColumns: '1fr 440px' }}>
        <section className="panel">
          {step.tab === 'log' ? (
            <><header className="ph"><h3>실행 기록</h3><span className="ph-sub">원천 시각 · 이벤트 · 내용</span><div className="ph-r"><Src k="replay" /></div></header>
              <div className="pb scroll"><div className="evlog">{ins.log.map((l, i) => <div key={i}><span>{l[0]}</span><span style={{ color: 'var(--tx3)' }}>재생</span><span>{l[1]}</span><span style={{ fontFamily: 'IBM Plex Sans KR' }}>{l[2]}</span></div>)}</div></div></>
          ) : (
             <><header className="ph"><h3>{DSTEPS[S]}</h3><span className="ph-sub">{S === 1 && ins.detect ? `탐지 ${ins.detect.n} · 미연결 ${ins.detect.unlinked}${ins.route ? ` · 경로 v${ins.route.ver}${ins.route.reviewedBy ? ' 검토 완료' : ' 미검토'}` : ''}` : S === 2 ? '계획 경로에 따른 시뮬레이션 위치 — 실시간 GPS 아님' : S === 3 ? '구역별 수신 파일 묶음' : '탐지 입력 이미지'}</span><div className="ph-r"><Src k={actual ? '사용자 제공 실제 자료 · 자동 분석 없음' : S === 0 ? 'input' : 'synth'} /></div></header>
              <div className="pb" style={{ overflow: 'auto' }}>{body}</div>
              <div className="actbar"><span className="sel-t">{ins.id} · {DSTEPS[S]}</span><div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div></div></>
          )}
        </section>
        <Panel title={metr ? '처리 현황' : '점검 정보'} bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {S === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="statbox" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                <div><label>처리 진행률</label><b>{fmtN((sh.done / sh.total) * 100, 0)}<small>%</small></b></div>
                <div><label>성공</label><b style={{ color: 'var(--ok)' }}>{sh.done - sh.fail.length}</b></div>
                <div><label>실패</label><b style={{ color: sh.fail.length ? 'var(--crit)' : null }}>{sh.fail.length}</b></div>
              </div>
              <div className="meter"><i style={{ width: ((sh.done - sh.fail.length) / sh.total) * 100 + '%', background: 'var(--ok)' }} /><i style={{ width: (sh.fail.length / sh.total) * 100 + '%', background: 'var(--crit)' }} /></div>
              <div className="mini">현재 상태 · {sh.running ? '촬영 중 (시뮬레이션)' : sh.finished ? '촬영 종료' : sh.done ? '일시정지' : '대기'} · 동작 {sh.done}/{sh.total}{sh.fail.length ? ` · 실패 동작 ${sh.fail.join(', ')}` : ''}</div>
              <Note kind="info">처리 진행률 100%가 모든 동작 성공을 뜻하지는 않습니다.</Note>
            </div>
          )}
          {S === 3 && fTot && (
            <div className="statbox" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <div><label>수신</label><b>{fTot[1]}<small>/ {fTot[0]}</small></b></div>
              <div><label>분석 성공</label><b>{fTot[2]}<small>/ {fTot[0]}</small></b></div>
              <div><label>실패·미수신</label><b style={{ color: fTot[3] ? 'var(--crit)' : null }}>{fTot[3]}</b></div>
              <div><label>검토 담당자</label><b style={{ fontSize: 'calc(14px * var(--text-scale, 1))', fontFamily: 'IBM Plex Sans KR' }}>{ins.reviewer || '미지정'}</b></div>
            </div>
          )}
          {right}
        </Panel>
      </div>
      {modal === 'analysis' && <AnalysisImportModal ins={ins} assets={ins.assets || []} onClose={() => setModal(null)} onSave={registerAnalysis} />}
      {modal === 'handover' && <HandoverModal ins={ins} fail={fTot ? fTot[3] : 0} onClose={() => setModal(null)} onSave={(to, policy) => { if (!canHandover) { setError('수신 자료와 관측이 먼저 등록되어야 합니다'); return; } mut((x, o) => { if (!readyForHandover(x, o.obs[x.id])) return; x.handed = { to, at: hhmm(now), policy }; x.reviewer = to; x.stage = '분석 결과 검토'; log('inspection.handed_over', `${to}에게 인계 · ${policy}`); const t = o.tasks.find((t2) => t2.link && t2.link.id === x.id); if (t) { t.stage = '분석 결과 검토'; t.assignee = 'master'; t.assigneeLabel = `${to} (기술 검토자)`; t.next = '분석 결과 판정 검토'; t.changes.unshift([hhmm(now), `${R.user} 자료 인계 → ${to}`]); } }); setModal(null); }} />}
    </div>
  );
}

function HandoverModal({ ins, fail, onClose, onSave }) {
  const [to, setTo] = useState('운영관리자');
  const [policy, setPolicy] = useState(fail ? '재촬영 요청' : '누락 없음');
  return (
    <Modal title="자료 인계" sub={ins.id} onClose={onClose} actions={<><button className="btn" onClick={onClose}>취소</button><button className="btn pri" disabled={!to} onClick={() => onSave(to, policy)}>인계</button></>}>
      <Field label="검토 담당자" req><select className="inp" value={to} onChange={(e) => setTo(e.target.value)}><option>운영관리자</option><option>김서연</option></select></Field>
      {fail > 0 ? <Field label={`누락·실패 ${fail}건 처리방침`} req><select className="inp" value={policy} onChange={(e) => setPolicy(e.target.value)}><option>재촬영 요청</option><option>명시적 보류 · 미판정 유지</option></select></Field> : <Note kind="info">누락·실패 항목 없음</Note>}
      <Note kind="info">촬영 종료만으로 인계 완료가 되지 않습니다. 인계 후 업무는 “분석 결과 검토” 단계로 넘어갑니다.</Note>
    </Modal>
  );
}
function UploadModal({ sites, onClose, onSubmit }) {
  const [site, setSite] = useState(sites[0]);
  const [assets, setAssets] = useState([]);
  const [json, setJson] = useState('');
  const [shotAt, setShotAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const shape = { zones: ['A', 'B', 'C', 'D'], rows: 2, cols: 6 };
  let result = null, validation = '';
  try {
    result = json.trim() ? window.AXAnalysis.parseResult(json, shape) : null;
    window.AXAnalysis.buildObservations(shape, assets, result);
  } catch (e) { validation = e.message; }
  const close = () => { if (!lock.current) onClose(); };
  const read = async (e) => {
    const files = Array.from(e.target.files || []); e.target.value = '';
    if (!files.length || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { setAssets(window.AXAnalysis.mergeAssets(assets, await window.AXAnalysis.readImages(files))); }
    catch (err) { setError(err.message); }
    finally { lock.current = false; setBusy(false); }
  };
  const readJson = async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (!file.size || file.size > 2 * 1048576) throw new Error('JSON 파일은 0바이트 초과, 최대 2MB입니다');
      const value = await file.text(); setJson(value);
      window.AXAnalysis.parseResult(value, shape);
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  };
  const submit = async () => {
    if (lock.current || validation || !assets.length || !sites.includes(site)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (shotAt) {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(shotAt)) throw new Error('촬영 시각을 확인하세요');
        window.AXAnalysis.parseResult(JSON.stringify({ source: '직접 입력 시각 검증', analyzedAt: shotAt + ':00Z', panels: [{ id: 'A01', judgment: 'und' }] }), shape);
      }
      if (typeof onSubmit !== 'function') throw new Error('업로드 저장 콜백이 연결되지 않았습니다');
      await onSubmit({ site, assets, result, shotAt: shotAt || null });
      lock.current = false; onClose();
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return (
    <Modal title="보유 자료 업로드" onClose={close} actions={<><button className="btn" disabled={busy} onClick={close}>취소</button><button className="btn pri" disabled={busy || !!validation || !assets.length || !sites.includes(site)} onClick={submit}>{busy ? '처리 중…' : '업로드'}</button></>}>
      <Field label="발전소" req><select className="inp" value={site} disabled={busy} onChange={(e) => setSite(e.target.value)}>{sites.map((s) => <option key={s} value={s}>{siteName(s)}</option>)}</select></Field>
      <Field label="실제 RGB 이미지" req hint="JPEG/PNG/WebP · 최대 20개 · 개당 8MB · 합계 30MB"><input className="inp" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={read} /></Field>
      {assets.length > 0 && <><AssetPreview assets={assets} name={assets[0].name} h={72} /><div className="mini">{assets.length}개 · {assets.map((a) => a.name).join(', ')}</div></>}
      <Field label="외부 분석 JSON 파일 (선택)" hint="최대 2MB. 파일 선택 또는 아래 입력란에 붙여넣기."><input className="inp" type="file" accept=".json,application/json" disabled={busy} onChange={readJson} /></Field>
      <Field label="외부 분석 JSON (선택)" hint="source·analyzedAt·panels 필수. 대상 A~D구역, 구역별 2×6패널(A01~D12)."><textarea className="inp" rows={3} value={json} disabled={busy} onChange={(e) => { setJson(e.target.value); setError(''); }} placeholder={'{"source":"외부 분석 출처","analyzedAt":"2026-11-07T01:00:00Z","panels":[{"id":"A01","judgment":"ok","image":"A01.jpg"}]}'} /></Field>
      {result && <div className="mini">출처: {result.source} · 결과 {result.panels.length}개 · {result.analyzedAt}</div>}
      <Field label="원본 촬영 시각 (직접 확인한 경우만 입력)" hint="기본값은 미확인입니다. EXIF를 추출하거나 업로드 시각으로 대체하지 않습니다."><input className="inp" type="datetime-local" value={shotAt} disabled={busy} onChange={(e) => setShotAt(e.target.value)} /></Field>
      <Note kind="info">촬영 단계는 적용 없음. 외부 결과가 없으면 미판정으로 등록하며 자동 분석하지 않습니다. JSON 판정: ok / soil / dmg / und. image는 실제 파일명, 선택 항목은 reason·soilType·dmgPos입니다.</Note>
      {(error || validation) && <div role="alert"><Note>{error || validation}</Note></div>}
    </Modal>
  );
}

Object.assign(window, { Drone, PanelGrid });
