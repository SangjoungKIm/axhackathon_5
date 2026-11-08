/* 드론 수행자 전용: 실제 원본 → 외부 탐지/분석 → 전사 위치 결과. */
const DF_STEPS = ['전사 촬영 및 경로 생성', '촬영 데이터 업로드 및 분석', '결과'];
const DF_JUDG = { ok: '정상', soil: '오염', dmg: '파손', und: '미판정' };

function DroneFlow({ ctx, ins }) {
  const preview = window.AXDemo.preview(ins, ctx.ops.obs[ins.id]);
  return preview ? <DemoDronePreview key={ins.id} ctx={ctx} ins={ins} preview={preview} /> : <ActualDroneFlow key={ins.id} ctx={ctx} ins={ins} />;
}

function DemoDronePreview({ctx, ins, preview}) {
  const [step, setStep] = useState(0), [selected, setSelected] = useState(null);
  const obs = ctx.ops.obs[ins.id] || {}, panels = preview.detection.panels;
  const cur = panels.find((p) => p.id === selected) || panels[0];
  const judgment = (id) => obs[id]?.j || 'und';
  return <div className="page df-flow" style={{padding:0}} data-demo-inspection={ins.id}>
    <TitleBar title={ins.id} meta={`${siteName(ins.site)} · ${ins.round}회차`} back={{label:pageLabel(ctx.R,'drone'),fn:()=>ctx.go('drone',{})}}><span className="df-tag">가상 시연 자료 · 읽기 전용</span></TitleBar>
    <nav className="df-steps" aria-label="드론 점검 3단계">{DF_STEPS.map((label,i)=><button key={label} aria-current={step===i?'step':undefined} onClick={()=>setStep(i)}><span className="df-step-no">{i+1}</span><span>{label}<small>{['가상 전사도와 합성 경로','가상 표본 분류 · 실제 영상 없음','가상 위치별 분류 맵'][i]}</small></span></button>)}</nav>
    <div className="df-status" role="status"><b>가상 시연 자료 · {preview.draft?'가상 초안':'합성 표본'} · 읽기 전용</b><span>실제 촬영·비행·외부 분석 아님 · 실제 데이터로 자동 전환하지 않습니다</span></div>
    <div className="pgrid df-grid"><section className="panel df-primary"><header className="ph"><h3>{['가상 전사도 · 표본 위치 및 경로','가상 분석 표본 · 영상 미생성','가상 패널 위치별 결과'][step]}</h3><div className="ph-r">합성 위치 {panels.length}개</div></header>
      <div className="pb df-preview"><div className="df-canvas"><div className="df-image-wrap" style={{'--df-ratio':1.5}}><img src={preview.panorama.dataUrl} alt={`${ins.site} 가상 표본 전사도 · 실제 촬영 아님`} /><svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="가상 표본 위치와 경로">{step===0&&<polyline className="df-route" points={preview.route.points.map((p)=>`${p.x*1000},${p.y*1000}`).join(' ')} />}{panels.map((p)=>{const [x,y,w,h]=p.bbox;return <g key={p.id} role="button" tabIndex="0" aria-label={`${p.id} 가상 ${DF_JUDG[judgment(p.id)]}`} className={`df-box df-${step===0?'detect':judgment(p.id)} ${cur?.id===p.id?'df-picked':''}`} onClick={()=>setSelected(p.id)} onKeyDown={(e)=>{if(e.key==='Enter')setSelected(p.id)}}><rect x={x*1000} y={y*1000} width={w*1000} height={h*1000}/><text x={x*1000+3} y={y*1000+19}>{p.id}</text></g>})}</svg></div></div></div>
      <footer className="actbar"><span className="df-foot">가상 표본 · 실제 원본·근거 영상 없음</span>{step<2&&<button className="btn" onClick={()=>setStep(step+1)}>다음 단계 →</button>}</footer>
    </section><aside className="panel"><header className="ph"><h3>{DF_STEPS[step]}</h3></header><div className="pb df-controls">
      <div className="df-source"><b>가상 시연 자료</b><span>{preview.note}</span><span>출처 · 앱 내부 결정적 합성 표본</span><span>{preview.draft?'미인계 가상 초안 · 실제 분석 미실행':'인계 표본의 편집 잠금 유지 · 미리보기만 제공'}</span></div>
      {step===1&&<div className="df-source"><b>실제 영상 없음 · 영상 생성·재생 아님</b><span>가상 전사도와 패널별 예시 분류를 보여줍니다. API 호출·영상 분석·관측 저장은 실행하지 않습니다.</span></div>}
      {step>0&&<div className="df-counts">{Object.entries(DF_JUDG).map(([j,label])=><div key={j} className={`df-${j}`}><span>{label}</span><b>{panels.filter((p)=>judgment(p.id)===j).length}</b></div>)}</div>}
      {cur&&<div className="df-source"><b>{cur.id} · 가상 {DF_JUDG[judgment(cur.id)]}</b><span>{obs[cur.id]?.reason || '가상 초안 · 분석 미실행'}</span><span>가상 이미지 좌표 · {cur.bbox.map((n)=>n.toFixed(3)).join(' · ')}</span></div>}
      {ctx.can('panels')&&Object.keys(obs).length>0&&<button className="btn" onClick={()=>ctx.go('panels',{ins:ins.id})}>이 발전소 패널 상태 보기</button>}
      <p className="df-hint">실제 자료는 별도 신규 점검 회차 또는 보유 자료 업로드로 등록하세요. 이 미리보기는 실제 업로드 필드와 분리되어 있습니다.</p>
    </div></aside></div>
  </div>;
}

function ActualDroneFlow({ ctx, ins }) {
  const service = window.AXDrone, flow = ins.droneFlow || {};
  const [step, setStep] = useState(0), [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [settings, setSettings] = useState(() => service.settings()), [token, setToken] = useState('');
  const [videoUrl, setVideoUrl] = useState(''), [videoReady, setVideoReady] = useState(false), [mediaError, setMediaError] = useState('');
  const [pending, setPending] = useState(null), [selected, setSelected] = useState(null);
  const [imageRatio, setImageRatio] = useState(1);
  const controller = useRef(null), live = useRef(true), lock = useRef(false), latest = useRef(null);
  latest.current = { ins, obs: ctx.ops.obs[ins.id] };
  const panels = flow.detection?.panels || [], result = flow.analysis;
  const results = new Map((result?.panels || []).map((p) => [p.id, p]));
  let protectedReason = '';
  try { service.writable(ins, ctx.ops.obs[ins.id]); } catch (e) { protectedReason = e.message; }
  const disabled = !!busy || !!protectedReason;
  useEffect(() => () => { live.current = false; controller.current?.abort(); }, []);
  useEffect(() => {
    let active = true, url = ''; setVideoReady(false); setVideoUrl(''); setMediaError('');
    if (flow.video?.key) service.getVideo(flow.video.key).then((blob) => {
      if (!active) return;
      if (!blob) { setMediaError('영상 원본이 브라우저 저장소에 없습니다. 다시 업로드하세요'); return; }
      url = URL.createObjectURL(blob); setVideoUrl(url); setVideoReady(true);
    }).catch((e) => { if (active) setMediaError(e.message); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [flow.video?.key]);
  const ensure = () => { service.writable(latest.current.ins, latest.current.obs); };
  const mutate = (fn) => {
    ensure();
    ctx.upd((o) => {
      const x = o.inspections[ins.id];
      // 재생성 가능한 React updater 내부에서는 throw나 비동기 부수효과를 하지 않는다.
      if (x.handed || Object.values(o.obs[ins.id] || {}).some((p) => p.review && p.review !== '미검토')) return;
      x.droneFlow = x.droneFlow || {}; fn(x, o);
    });
  };
  const run = async (label, fn) => {
    if (lock.current) return;
    lock.current = true; const abort = new AbortController(); controller.current = abort;
    setBusy(label); setError(''); setNotice('');
    try { ensure(); await fn(abort.signal); }
    catch (e) { if (live.current) setError(abort.signal.aborted ? '요청이 취소되었습니다. 저장된 결과는 유지됩니다' : e.message || '처리 실패'); }
    finally { lock.current = false; controller.current = null; if (live.current) setBusy(''); }
  };
  const fileEvent = (handler) => (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (file) handler(file);
  };
  const replaceOK = () => !(flow.detection || flow.analysis || pending) || window.confirm('기존 탐지·경로·영상 분석 연결이 초기화됩니다. 기존 관측은 새 결과를 명시적으로 저장할 때까지 유지됩니다. 계속할까요?');
  const uploadPanorama = (file) => run('전사 이미지 읽는 중', async () => {
    if (!replaceOK()) return;
    const [asset] = await AXAnalysis.readImages([file]);
    if (!live.current) return;
    mutate((x) => { x.panorama = asset; x.droneFlow = { video: x.droneFlow.video || null }; x.dataMode = 'actual'; if (x.shoot) x.shoot.running = false; });
    setPending(null); setSelected(null); setNotice('전사 이미지 등록 · 탐지 결과는 아직 없습니다');
  });
  const acceptDetection = (value, origin) => {
    const normalized = service.detection(value, latest.current.ins);
    if (!replaceOK()) return;
    const route = service.route(normalized.panels);
    mutate((x) => { x.droneFlow.detection = { ...normalized, importedAt: new Date().toISOString(), origin }; x.droneFlow.route = route; x.droneFlow.analysis = null; });
    setPending(null); setSelected(null); setNotice(`실제 탐지 결과 ${normalized.panels.length}개 연결 · 이미지 좌표 경로 생성`);
  };
  const detect = () => run('패널 탐지 요청 중', async (signal) => {
    if (!ins.panorama) throw new Error('전사 이미지를 먼저 업로드하세요');
    const value = await service.detect(settings.detect, ins.panorama, token, signal);
    if (!signal.aborted && live.current) acceptDetection(value, 'api');
  });
  const importDetection = (file) => run('탐지 JSON 검증 중', async () => {
    if (!ins.panorama) throw new Error('실제 전사 이미지를 먼저 업로드하세요');
    const value = await service.readJSON(file); if (live.current) acceptDetection(value, 'json');
  });
  const uploadVideo = (file) => run('영상 원본 저장 중', async () => {
    if (!panels.length) throw new Error('1단계에서 실제 탐지 결과를 먼저 연결하세요');
    if ((result || pending) && !window.confirm('영상을 교체하면 현재 영상 분석 연결이 초기화됩니다. 기존 관측은 새 결과 저장 전까지 유지됩니다. 계속할까요?')) return;
    const video = await service.storeVideo(file);
    if (!live.current) { await service.deleteVideo(video.key); return; }
    try { ensure(); mutate((x) => { x.droneFlow.video = video; x.droneFlow.analysis = null; }); }
    catch (e) { await service.deleteVideo(video.key); throw e; }
    // 과거 관측이 참조할 수 있는 이전 영상은 삭제하지 않는다.
    setPending(null); setNotice('실제 영상 원본을 브라우저에 저장했습니다. 분석은 아직 실행하지 않았습니다');
  });
  const analyze = () => run('영상 분석 요청 중', async (signal) => {
    if (!panels.length || !flow.video) throw new Error('탐지 결과와 실제 영상이 필요합니다');
    const blob = await service.getVideo(flow.video.key); if (!blob) throw new Error('영상 원본이 없습니다. 다시 업로드하세요');
    const value = await service.analyze(settings.analyze, blob, ins, token, signal);
    if (!signal.aborted && live.current) { setPending({ ...service.analysis(value, panels), origin: 'api', evidenceVideo: flow.video.key }); setNotice('분석 응답 검증 완료 · 결과 저장을 눌러 관측에 반영하세요'); }
  });
  const importAnalysis = (file) => run('분석 JSON 검증 중', async () => {
    if (!panels.length || !flow.video || !(await service.getVideo(flow.video.key))) throw new Error('실제 탐지 결과와 저장된 영상 원본이 필요합니다');
    const value = service.analysis(await service.readJSON(file), panels);
    if (live.current) { setPending({ ...value, origin: 'json', evidenceVideo: flow.video.key }); setNotice('외부 분석 검증 완료 · 출처를 확인한 뒤 결과를 저장하세요'); }
  });
  const save = () => run('결과 연결 중', async () => {
    if (!pending || pending.evidenceVideo !== flow.video?.key || !(await service.getVideo(flow.video.key))) throw new Error('현재 영상에 연결된 검증 결과가 필요합니다');
    const value = service.analysis({ source: pending.source, analyzedAt: pending.analyzedAt, panels: pending.panels }, panels);
    ensure();
    const mapped = service.observations(latest.current.ins, value, flow.video, latest.current.obs);
    mutate((x, o) => {
      x.droneFlow.analysis = { ...value, origin: pending.origin, evidenceVideo: flow.video.key, savedAt: new Date().toISOString() };
      x.dataMode = 'actual'; o.obs[x.id] = mapped;
      x.log = x.log || []; x.log.unshift([new Date().toISOString(), 'drone.analysis.saved', `${value.source} · 실제 영상 근거 · 결과 ${value.panels.length} / 탐지 ${panels.length}`]);
    });
    setPending(null); setStep(2); setNotice('관측에 연결했습니다. 브라우저 저장 실패 알림이 있는지 확인하세요');
  });
  const cur = panels.find((p) => p.id === selected) || panels[0];
  const currentResult = cur && results.get(cur.id);
  const map = ins.panorama ? <div className="df-canvas"><div className="df-image-wrap" style={{ '--df-ratio': imageRatio }}>
    <img src={ins.panorama.dataUrl} alt="업로드한 실제 전사 이미지" onLoad={(e) => setImageRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />
    <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-label="실제 탐지 위치 오버레이">
      {step === 0 && flow.route?.points.length > 1 && <polyline className="df-route" points={flow.route.points.map((p) => `${p.x * 1000},${p.y * 1000}`).join(' ')} />}
      {panels.map((p) => { const [x, y, w, h] = p.bbox, j = step === 2 ? results.get(p.id)?.judgment || 'und' : 'detect'; return <g key={p.id} role="button" tabIndex="0" aria-label={`${p.id} ${step === 2 ? DF_JUDG[j] : '탐지'}`} className={`df-box df-${j} ${cur?.id === p.id ? 'df-picked' : ''}`} onClick={() => setSelected(p.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(p.id); } }}><rect x={x * 1000} y={y * 1000} width={w * 1000} height={h * 1000} /><text x={x * 1000 + 3} y={y * 1000 + 19}>{p.id}</text><title>{p.id} · {DF_JUDG[j] || '실제 탐지 위치'}</title></g>; })}
    </svg>
  </div></div> : <div className="df-empty"><span className="df-empty-no">01</span><h3>실제 전사 이미지를 등록하세요</h3><p>기존 시연 배치를 탐지 위치로 사용하지 않습니다.<br />실제 이미지와 외부 탐지 결과가 필요합니다.</p></div>;

  return <div className="page df-flow" style={{ padding: 0 }}>
    <TitleBar title={ins.id} meta={`${siteName(ins.site)} · ${ins.round}회차`} back={{ label: pageLabel(ctx.R, 'drone'), fn: () => ctx.go('drone', {}) }}><span className="df-tag">{siteName(ins.site)} · 담당 {ins.drone || '미배정'}</span></TitleBar>
    <nav className="df-steps" aria-label="드론 점검 3단계">{DF_STEPS.map((label, i) => <button key={label} aria-current={step === i ? 'step' : undefined} onClick={() => setStep(i)}><span className="df-step-no">{i + 1}</span><span>{label}<small>{['실제 전사 이미지 → 탐지 → 이미지 경로', '실제 영상 → 외부 분석 → 기록', '전사 이미지 기반 위치 맵'][i]}</small></span></button>)}</nav>
    <div className="df-status" role="status"><b>{busy || (step === 1 ? (settings.analyze ? '영상 분석 API 주소 설정됨 · 연결 미확인' : '영상 분석 엔진 미연결 · 차단됨') : (settings.detect ? '탐지 API 주소 설정됨 · 연결 미확인' : '패널 탐지 엔진 미연결 · 차단됨'))}</b><span>자동 판정 없음 · API 실행 또는 외부 결과 JSON 가져오기</span>{busy && <button className="btn" onClick={() => controller.current?.abort()} disabled={!busy.includes('요청')}>요청 취소</button>}</div>
    {(error || protectedReason) && <div className="df-alert" role="alert">{error || protectedReason}</div>}
    {notice && <div className="df-notice" role="status">{notice}</div>}
    <div className="pgrid df-grid">
      <section className="panel df-primary"><header className="ph"><h3>{step === 1 ? '촬영 영상 원본' : step === 2 ? '전사 이미지 기반 위치 맵' : '전사 이미지 · 탐지 및 경로'}</h3><div className="ph-r">실제 탐지 {panels.length}개 / 기준 ID {service.ids(ins).length}개</div></header>
        <div className="pb df-preview">{step === 1 ? videoUrl ? <video controls src={videoUrl} preload="metadata" aria-label="업로드한 실제 촬영 영상" /> : <div className="df-empty"><span className="df-empty-no">02</span><h3>실제 촬영 영상이 필요합니다</h3><p>{mediaError || (!panels.length ? '1단계에서 전사 이미지와 실제 탐지 결과를 연결하세요.' : '파일 업로드는 로컬 저장만 수행합니다. 분석 버튼을 눌러야 외부 전송됩니다.')}</p></div> : map}</div>
        <footer className="actbar"><span className="df-foot">{step === 0 ? '이미지 좌표 경로 · 실제 비행 명령 아님' : step === 1 ? '원본은 별도 IndexedDB 저장 · 브라우저별 보관' : '탐지된 위치만 표시 · 누락 판정은 미판정 유지'}</span><div className="df-actions">{step === 0 && <button className="btn" disabled={!flow.route?.points.length} onClick={() => service.download({ inspectionId: ins.id, panorama: ins.panorama.name, source: flow.detection.source, ...flow.route }, `${ins.id}-image-route.json`)}>이미지 경로 JSON 다운로드</button>}{step < 2 && <button className="btn" onClick={() => setStep(step + 1)}>다음 단계 →</button>}</div></footer>
      </section>
      <aside className="panel"><header className="ph"><h3>{DF_STEPS[step]}</h3></header><div className="pb df-controls">
        {step === 0 && <>
          <label className="df-field">전사 이미지 업로드<input aria-label="전사 이미지 업로드" className="inp" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={fileEvent(uploadPanorama)} /><small>JPEG / PNG / WebP · 최대 8MB</small></label>
          {ins.panorama && <div className="df-file">{ins.panorama.name}<small>실제 업로드 원본 · 자산 목록과 분리 저장</small></div>}
          <button className="btn pri" disabled={disabled || !ins.panorama} onClick={detect}>패널 탐지 실행</button>
          {!settings.detect && <p className="df-blocked">패널 탐지 엔진 미연결 · API 실행 차단. 아래에서 실제 외부 탐지 JSON을 가져올 수 있습니다.</p>}
          <label className="df-field">외부 탐지 JSON 가져오기<input aria-label="외부 탐지 JSON 가져오기" className="inp" type="file" accept=".json,application/json" disabled={disabled || !ins.panorama} onChange={fileEvent(importDetection)} /></label>
          {flow.detection && <div className="df-source"><b>탐지 출처 · {flow.detection.source}</b><span>실제 탐지 {panels.length}개 · 미탐지 ID는 만들지 않음</span><span>박스 중심을 행별 왕복 연결한 이미지 경로입니다. GPS·고도·장애물·기체 명령은 포함하지 않습니다.</span></div>}
        </>}
        {step === 1 && <>
          {!panels.length && <p className="df-blocked">선행 조건: 1단계 실제 탐지 결과가 없습니다.</p>}
          <label className="df-field">실제 영상 파일 업로드<input aria-label="실제 영상 파일 업로드" className="inp" type="file" accept="video/mp4,video/webm,video/quicktime" disabled={disabled || !panels.length} onChange={fileEvent(uploadVideo)} /><small>MP4 / WebM / MOV · 최대 150MB · 브라우저 저장 공간 필요</small></label>
          {flow.video && <div className="df-file">{flow.video.name}<small>{(flow.video.size / 1048576).toFixed(1)}MB · {videoReady ? '원본 확인됨' : '원본 확인 필요'}</small></div>}
          {mediaError && <p role="alert" className="df-blocked">{mediaError}</p>}
          <button className="btn pri" disabled={disabled || !panels.length || !videoReady} onClick={analyze}>영상 분석</button>
          {!settings.analyze && <p className="df-blocked">영상 분석 엔진 미연결 · API 실행 차단. 실제 외부 분석 JSON을 가져오세요.</p>}
          <label className="df-field">외부 분석 JSON 가져오기<input aria-label="외부 분석 JSON 가져오기" className="inp" type="file" accept=".json,application/json" disabled={disabled || !panels.length || !videoReady} onChange={fileEvent(importAnalysis)} /></label>
          {pending && <div className="df-source"><b>저장 대기 · {pending.source}</b><span>{pending.analyzedAt} · 판정 {pending.panels.length} / 탐지 {panels.length}</span><span>외부 출처가 선언한 결과입니다. 원본과 판정의 진위는 제공 기관에 확인하세요.</span><button className="btn pri" disabled={disabled} onClick={save}>분석 결과 저장</button></div>}
          <p className="df-hint">버튼 실행 시에만 설정 주소로 원본을 전송합니다. 업로드와 분석은 별개입니다. 저장 전에는 기존 관측을 변경하지 않습니다.</p>
        </>}
        {step === 2 && <>
          <div className="df-counts">{Object.entries(DF_JUDG).map(([j, label]) => <div key={j} className={`df-${j}`}><span><i />{label}</span><b>{panels.filter((p) => (results.get(p.id)?.judgment || 'und') === j).length}</b></div>)}</div>
          {!result && <p className="df-blocked">저장된 영상 분석 결과가 없습니다. {panels.length ? '탐지 위치만 미판정으로 표시합니다.' : '전사 이미지와 실제 탐지 결과부터 등록하세요.'}</p>}
          {result && <div className="df-source"><b>분석 출처 · {result.source}</b><span>{result.analyzedAt}</span><span>근거 영상 · {flow.video?.name || '원본 연결 확인 필요'}</span><span>결과 {result.panels.length} / 실제 탐지 {panels.length} · 생략된 결과는 미판정</span></div>}
          {cur && <div className="df-source"><b>{cur.id} · {DF_JUDG[currentResult?.judgment || 'und']}</b><span>{currentResult?.reason || (currentResult ? '상세 사유 미제공' : '외부 판정 미등록')}</span><span>이미지 좌표 [x, y, w, h]<br />{cur.bbox.map((n) => n.toFixed(3)).join(' · ')}</span></div>}
          <p className="df-hint">색상과 패널 ID를 함께 표시합니다. 기존 패널 상태 화면의 가상 배치와 달리 이 화면은 제공된 실제 bbox만 사용합니다.</p>
        </>}
        <details className="df-settings"><summary>API 연결 설정 · 계약</summary><div className="df-settings-body">
          <label className="df-field">탐지 API 주소<input aria-label="탐지 API 주소" className="inp" type="url" value={settings.detect} disabled={!!busy} onChange={(e) => setSettings({ ...settings, detect: e.target.value })} /></label>
          <label className="df-field">영상 분석 API 주소<input aria-label="영상 분석 API 주소" className="inp" type="url" value={settings.analyze} disabled={!!busy} onChange={(e) => setSettings({ ...settings, analyze: e.target.value })} /></label>
          <label className="df-field">Bearer 토큰 (선택 · 메모리 전용)<input aria-label="Bearer 토큰" className="inp" type="password" autoComplete="off" value={token} disabled={!!busy} onChange={(e) => setToken(e.target.value)} /></label>
          <button className="btn" disabled={!!busy} onClick={() => { try { setSettings(service.saveSettings(settings)); setError(''); setNotice('API 주소만 저장했습니다. 외부 요청은 실행하지 않았습니다'); } catch (e) { setError(e.message); } }}>API 주소 저장</button>
          <p>HTTPS 또는 localhost HTTP만 허용. 주소에 인증정보·쿼리 금지. 서버는 이 화면의 출처에 대한 CORS를 허용해야 합니다. 토큰은 저장하지 않습니다.</p>
          <p>탐지: POST multipart · image, kind=detect. 응답 source, panels:[{'{id,bbox:[x,y,w,h]}'}]. bbox는 0~1 이미지 좌표. ID는 현재 기준 범위, 부분 탐지 허용. 외부 route는 실행하지 않으며 박스 중심 경로로 대체합니다.</p>
          <p>분석: POST multipart · video, kind=analyze, inspectionId, panels(JSON 탐지 목록). 응답 source, analyzedAt(시간대 포함 ISO), panels:[{'{id,judgment,reason?}'}]. judgment: ok/soil/dmg/und. 탐지 ID만 허용. JSON 최대 2MB.</p>
          <p>JSON 가져오기도 같은 응답 계약을 검증합니다. 출처 문자열은 전자서명이 아니며 진위를 자동 보증하지 않습니다. 영상은 이 브라우저에만 보관되어 저장소 삭제·기기 변경 시 복구되지 않습니다.</p>
        </div></details>
      </div></aside>
    </div>
  </div>;
}
Object.assign(window, { DroneFlow });
