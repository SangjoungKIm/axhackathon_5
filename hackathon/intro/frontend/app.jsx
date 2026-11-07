/* 앱 틀: 역할 · 조회 범위 · 라우팅 · 실시간 반영 · 시뮬레이션 이벤트 재생 */
const START_MIN = 13 * 60 + 5; // 시뮬레이션 시작 13:05 KST
const LS = 'ax-solar-v4';
const DISPLAY_LS = 'ax-solar-display-v1';
const displayPrefs = (() => { try { return JSON.parse(localStorage.getItem(DISPLAY_LS)) || {}; } catch { return {}; } })();
const saved = (() => {
  try {
    const value = JSON.parse(localStorage.getItem(LS));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (e) { return {}; }
})();
// 이전 버전·중단된 세션의 불완전한 라우트도 안전하게 복원한다.
const restoreRoute = () => {
  const r = saved.route;
  const screen = r && typeof r.screen === 'string' ? r.screen : (ROLES[saved.role]?.home || 'home');
  return { screen, params: r && r.params && typeof r.params === 'object' && !Array.isArray(r.params) ? r.params : {} };
};
const HOME_KEYS = { tasks: 'tasks', overview: 'power', power: 'power', detail: 'detail', alarms: 'alarms' };
const freshOps = () => AXDemo.expand({ ...OPS.init(), tasks: JSON.parse(JSON.stringify(TASKS_INIT)), ORGS: OPS.ORGS });
const freshSim = (runId = 1, scenario = 'partial') => ({ runId, scenario, running: true, speed: 1, elapsed: 0, seen: [], seqBy: {}, ignored: { dup: 0, stale: 0 }, log: [], applied: [] });

function useFit() {
  const [k, setK] = useState(1);
  useEffect(() => { const f = () => setK(Math.min(window.innerWidth / 1920, window.innerHeight / 1080)); f(); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return k;
}

function App() {
  const [t, setTweak] = useTweaks({ ...window.TWEAK_DEFAULTS, ...(['dark', 'light'].includes(displayPrefs.theme) ? { theme: displayPrefs.theme } : {}) });
  const textScale = 1;
  useEffect(() => { try { localStorage.setItem(DISPLAY_LS, JSON.stringify({ theme: t.theme, textScale })); } catch {} }, [t.theme, textScale]);
  const k = useFit();
  // 접속할 때는 저장된 이전 역할로 건너뛰지 않고 사용자 선택 홈을 먼저 표시한다.
  const [role, setRole] = useState(() => {
    try {
      const live = sessionStorage.getItem('ax-live-refresh') === '1';
      sessionStorage.removeItem('ax-live-refresh');
      return live && saved.role && ROLES[saved.role] ? saved.role : null;
    } catch { return null; }
  });
  const [lastRole, setLastRole] = useState(saved.lastRole || null);
  const R = role ? ROLES[role] : null;
  const [route, setRoute] = useState(restoreRoute);
  const [ctxSite, setCtxSite] = useState(saved.ctxSite || '');
  const [site, setSite] = useState(saved.site || 'YA');
  const [inv, setInv] = useState(saved.inv || 'YA-17');
  const [selAlarm, setSelAlarm] = useState(null);
  const t0 = useRef(performance.now());
  const [now, setNow] = useState(START_MIN);
  const nowRef = useRef(START_MIN); nowRef.current = now;
  const [snap, setSnap] = useState(() => SIM.snapshot(START_MIN, 0.004));
  const [alarms, setAlarms] = useState(() => SIM.initialAlarms());
  const [toast, setToast] = useState(null);
  const [pending, setPending] = useState([]);
  const [pendEv, setPendEv] = useState([]);
  const [ops, setOps] = useState(freshOps);
  const [sim, setSimS] = useState(() => freshSim());
  const [uiS, setUiS] = useState({});
  const [drafts, setDrafts] = useState({});
  const [flashMsg, setFlash] = useState(null);
  const [confirmSite, setConfirmSite] = useState(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const storageBlocked = useRef(false);
  const opsRef = useRef(ops); opsRef.current = ops;
  const saveQueue = useRef(Promise.resolve());
  useEffect(() => {
    let live = true;
    AXStore.read().then((record) => {
      if (!live) return;
      if (record) {
        const o = record.ops;
        if (record.version !== 1 || !o || !o.inspections || !o.obs || !o.requests || !o.workOrders || !Array.isArray(o.tasks) || !Array.isArray(o.notifications)) throw new Error('저장 자료 형식을 확인할 수 없습니다.');
        setOps(AXDemo.expand({ ...o, ORGS: OPS.ORGS }));
      }
      setStorageReady(true);
    }).catch((e) => { if (live) { storageBlocked.current = true; setStorageError('자료 복원 실패 · ' + e.message); setStorageReady(true); } });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!storageReady || storageBlocked.current) return;
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => AXStore.write(ops)).then(() => setStorageError('')).catch((e) => setStorageError('브라우저 자료 저장 실패 · ' + e.message));
  }, [ops, storageReady]);

  const sites = R ? (ctxSite && R.sites.includes(ctxSite) ? [ctxSite] : R.sites) : [];
  const scopeRef = useRef(null); scopeRef.current = R ? sites : null;

  useEffect(() => {
    try { localStorage.setItem(LS, JSON.stringify({ role, lastRole, route, site, inv, ctxSite })); }
    catch (e) { /* 저장이 차단된 미리보기에서도 현재 세션은 계속 동작한다. */ }
  }, [role, lastRole, route, site, inv, ctxSite]);
  useEffect(() => { if (R) setSnap(SIM.snapshot(nowRef.current, 0.004, sites)); }, [role, ctxSite]);
  useEffect(() => { if (!flashMsg) return; const id = setTimeout(() => setFlash(null), 4500); return () => clearTimeout(id); }, [flashMsg]);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 7000); return () => clearTimeout(id); }, [toast]);

  const upd = useCallback((fn) => setOps((p) => { const n = structuredClone(p); fn(n); return n; }), []);
  const setSim = (patch) => setSimS((s) => ({ ...s, ...patch }));
  const ui = (key, def) => ({ ...def, ...(uiS[key] || {}) });
  const setUi = (key, patch) => setUiS((u) => ({ ...u, [key]: { ...(u[key] || {}), ...patch } }));

  const can = (p) => {
    if (!R) return false;
    if (HOME_KEYS[p]) return R.menu.includes('home') && R.homeTabs.includes(HOME_KEYS[p]);
    if (p === 'sim') return false;
    return R.menu.includes(p);
  };
  const go = (screen, params = {}) => {
    if (HOME_KEYS[screen]) { params = { ...params, tab: HOME_KEYS[screen] }; screen = 'home'; }
    if (screen === 'home' && params.site) { setSite(params.site); setInv(params.inv || null); }
    if (params.alarm) setSelAlarm(params.alarm);
    setRoute({ screen, params });
  };
  const enter = (rk, page) => {
    const r = ROLES[rk];
    setSnap(SIM.snapshot(nowRef.current, 0.004, r.sites));
    setRole(rk); setLastRole(rk); setCtxSite('YA'); setUiS({}); setDrafts({});
    if (!r.sites.includes(site)) { setSite(r.sites[0]); setInv(null); }
    setRoute({ screen: page, params: {} }); setSelAlarm(null); setToast(null);
  };
  const logout = () => { setRole(null); setToast(null); setDrafts({}); setUiS({}); };
  const changeSite = (v) => {
    const doIt = () => {
      setCtxSite(v);
      // 이전 발전소의 상세 ID·필터·페이지를 새 범위에 재사용하지 않는다.
      setUiS({});
      setRoute((r) => ({ screen: r.screen, params: r.params.tab ? { tab: r.params.tab } : {} }));
      setSnap(SIM.snapshot(nowRef.current, 0.004, v ? [v] : R.sites));
      setConfirmSite(null);
      if (v) { setSite(v); setInv(null); }
    };
    if (Object.keys(drafts).length) setConfirmSite({ v, doIt }); else doIt();
  };

  // 1초 시계 + 이벤트 시간표 재생 (중복·역순 무시)
  useEffect(() => {
    const id = setInterval(() => {
      setNow(START_MIN + (performance.now() - t0.current) / 60000);
      setSimS((s) => {
        if (!s.running) return s;
        const el = s.elapsed + s.speed;
        const timeline = [...OPS.EVENTS, ...(OPS.SCENARIOS[s.scenario].dup ? OPS.DUPS : [])].filter((e) => e.t > s.elapsed && e.t <= el).sort((a, b) => a.t - b.t);
        if (!timeline.length) return { ...s, elapsed: el };
        const n = { ...s, elapsed: el, seen: [...s.seen], seqBy: { ...s.seqBy }, ignored: { ...s.ignored }, log: [...s.log], applied: [...s.applied] };
        const at = hhmm(nowRef.current);
        const fresh = [];
        timeline.forEach((e) => {
          if (n.seen.includes(e.id)) { n.ignored.dup++; n.log.unshift({ ...e, at, ign: 'event_id 중복 무시' }); return; }
          if ((n.seqBy[e.target] || 0) > e.seq) { n.ignored.stale++; n.log.unshift({ ...e, at, ign: '역순 sequence 무시' }); return; }
          n.seen.push(e.id); n.seqBy[e.target] = e.seq; n.applied.push(e.id); n.log.unshift({ ...e, at }); fresh.push(e);
        });
        if (fresh.length) setTimeout(() => setPendEv((P) => [...P, ...fresh]), 0);
        return n;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  // 전력 데이터 갱신
  useEffect(() => {
    const id = setInterval(() => {
      const n = START_MIN + (performance.now() - t0.current) / 60000;
      if (scopeRef.current) setSnap(SIM.snapshot(n, 0.006, scopeRef.current));
      if (Math.random() < 0.05 * t.refresh) {
        const a = SIM.randomAlarm(Math.floor(n * 60));
        setPending((P) => [a, ...P]);
        if ((a.sev === 'critical' || a.sev === 'major') && scopeRef.current && scopeRef.current.includes(a.site)) setToast(a);
      }
    }, t.refresh * 1000);
    return () => clearInterval(id);
  }, [t.refresh]);

  const applyEvent = (o, e) => {
    const at = hhmm(nowRef.current);
    if (e.type === 'quote.submitted') { const r = o.requests['REQ-0512']; const v = r.vendors.find((x) => x.org === 'ORG-TM'); if (v && !v.quote) { v.quote = { version: 1, items: [['파손 패널 정비 (현장 확인 후)', 2, 95000], ['출장비', 1, 60000]], tax: '별도', valid: '2026-11-15', hours: '3시간 (업체 제시)' }; v.response = '견적 제출'; r.changes.unshift([at, '태양정비 견적 v1 제출']); } }
    if (e.type === 'schedule.proposed') { const r = o.requests['REQ-0512']; const v = r.vendors.find((x) => x.org === 'ORG-TM'); v.response = '일정 제안'; r.changes.unshift([at, '태양정비 일정 제안 11-12 10:00~13:00']); }
    if (e.type === 'work.item_reported') { const w = o.workOrders['WO-2088']; const it = w.items[1]; if (it.state === 'progress') { it.state = 'done'; it.reportedAt = '11-07 ' + at; it.result = '11/12 완료 · B12 제외 (정비 후 세척)'; it.excluded = 'B12'; it.ev.after = 1; w.state = '검수 대기'; w.next = '항목별 검수'; const tk = o.tasks.find((x) => x.id === 'T-1038'); if (tk) { tk.stage = '검수 대기'; tk.assignee = 'owner'; tk.assigneeLabel = '김서연 (검수자)'; tk.next = 'A·B구역 검수'; tk.changes.unshift([at, 'B구역 완료 보고 (B12 제외)']); } } }
    o.notifications.unshift({ id: 'NE-' + e.id, at, cause: e.label, task: e.target === 'REQ-0512' ? 'T-1041' : e.target === 'WO-2088' ? 'T-1038' : 'T-1048', who: '-', next: e.type === 'notification' ? '정비 담당자 배정' : '확인', unread: true, roles: e.type === 'notification' ? ['owner', 'master'] : ['owner', 'master', 'maint'] });
  };
  const myPending = R ? pending.filter((a) => sites.includes(a.site)) : [];
  const nNew = (R && R.homeTabs.includes('alarms') ? myPending.length : 0) + (R ? pendEv.length : 0);
  const applyNew = () => {
    setAlarms((L) => [...pending, ...L.map((x) => ({ ...x, isNew: false }))]); setPending([]);
    const evs = pendEv; setPendEv([]); if (evs.length) upd((o) => evs.forEach((e) => applyEvent(o, e)));
  };
  const resetSim = () => {
    if (storageBlocked.current) { setFlash('자료 복원 오류를 먼저 해결하세요. 저장 자료 보호를 위해 초기화를 중단했습니다.'); return; }
    if (Object.values(opsRef.current.inspections).some((i) => i.dataMode === 'actual') && !window.confirm('등록한 실제 이미지·분석 결과와 업무 기록도 삭제됩니다. 초기화할까요?')) return;
    setOps(freshOps()); setSimS((s) => freshSim(s.runId + 1, s.scenario)); setPendEv([]); setUiS({}); setDrafts({}); setFlash('초기화 — 새 실행 ID 발급');
  };

  const nextIns = (o) => {
    const year = new Date().getFullYear();
    const n = Math.max(35, ...Object.keys(o.inspections).filter((id) => id.startsWith('INS-' + year + '-')).map((id) => Number(id.split('-').pop()) + 1));
    return `INS-${year}-${String(n).padStart(3, '0')}`;
  };
  const nextRound = (o, sid) => 1 + Math.max(0, ...Object.values(o.inspections).filter((i) => i.site === sid).map((i) => i.round));
  const submitInspection = (d) => {
    const id = nextIns(ops);
    upd((o) => {
      o.inspections[id] = { id, site: d.site, inv: null, round: 1, purpose: d.purpose, target: '등록 어레이 전체', zones: ['A', 'B', 'C', 'D'], rows: 2, cols: 6, step: 0, stage: '담당 배정', drone: null, aircraft: '미지정', source: '미수집', image: null, wish: `${d.from} ~ ${d.to}`, note: d.note || '-', shotAt: null, detect: null, route: null, shoot: { total: 24, done: 0, fail: [], running: false, finished: false }, files: null, handed: null, reviewer: null, log: [[hhmm(nowRef.current), 'inspection.requested', `${R.user} 점검 요청`]] };
      o.tasks.unshift({ id: 'T-' + (1060 + o.tasks.length), site: d.site, kind: '점검', title: `${d.purpose} · 담당 배정 (${id})`, stage: '담당 배정', assignee: null, assigneeLabel: '미배정', next: '드론 수행자 배정', due: '11-09 18:00', approver: '운영관리자', reviewer: '-', link: { screen: 'drone', id }, changes: [[hhmm(nowRef.current), `${R.user} 점검 요청 접수`]], roles: ['owner', 'drone', 'master'] });
    });
    upd((o) => { o.inspections[id].round = nextRound(opsRef.current, d.site); o.inspections[id].dataMode = 'actual'; o.inspections[id].assets = []; });
    setDrafts((x) => { const { inspection, ...r } = x; return r; });
    setFlash({ msg: '점검 요청 접수 — “담당 배정” 업무가 생성되었습니다', act: can('drone') ? () => go('drone', { id }) : null, actL: '점검 열기' });
  };
  const commitMaterials = async (next) => {
    if (!storageReady) throw new Error('저장 자료를 복원 중입니다. 잠시 후 다시 시도하세요.');
    if (storageBlocked.current) throw new Error('자료 복원에 실패해 기존 저장소 보호를 위해 등록을 중단했습니다.');
    saveQueue.current = saveQueue.current.catch(() => {}).then(() => AXStore.write(next));
    await saveQueue.current;
    opsRef.current = next; setOps(next); setStorageError('');
  };
  const submitUpload = async (d) => {
    if (!canDo(role, 'upload') || !sites.includes(d.site)) throw new Error('업로드 권한 또는 발전소 범위를 확인하세요.');
    if (!storageReady) throw new Error('자료 복원이 끝난 후 다시 시도하세요.');
    if (!d.assets?.length) throw new Error('실제 이미지 파일을 선택하세요.');
    const next = structuredClone(opsRef.current);
    const id = nextIns(next);
    const ins = { id, site: d.site, inv: null, round: nextRound(next, d.site), purpose: '보유 자료 등록', target: '등록 어레이 A~D 구역 (48패널)', zones: ['A', 'B', 'C', 'D'], rows: 2, cols: 6, step: 3, stage: '자료 수신·인계', drone: R.user, aircraft: '적용 없음', source: '보유 자료 업로드', dataMode: 'actual', assets: d.assets, image: d.assets[0].name, imageName: d.assets[0].name, wish: '-', note: '-', shotAt: d.shotAt || null, detect: null, route: null, shoot: { total: 24, done: 0, fail: [], running: false, finished: true }, handed: null, reviewer: null, log: [[new Date().toISOString(), 'files.uploaded', `실제 이미지 ${d.assets.length}개 등록 · 촬영 단계 적용 없음`]] };
    const obs = AXAnalysis.buildObservations(ins, d.assets, d.result || null);
    ins.files = AXAnalysis.summarize(ins, obs); ins.analysis = d.result || null;
    next.inspections[id] = ins; next.obs[id] = obs;
    next.tasks.unshift({ id: 'T-' + (1060 + next.tasks.length), site: d.site, kind: '점검', title: `등록 자료 인계 (${id})`, stage: '자료 수신·인계', assignee: role, assigneeLabel: R.user, next: '분석 결과 확인 후 자료 인계', due: '미정', approver: '운영관리자', reviewer: '-', link: { screen: 'drone', id }, changes: [[new Date().toISOString(), '실제 자료 등록']], roles: ['owner', 'drone', 'master'] });
    await commitMaterials(next);
    go('drone', { id }); setFlash('이미지·분석 결과 저장 완료 — 미등록 결과는 미판정으로 유지됩니다');
    return id;
  };
  const registerAnalysis = async (id, data) => {
    if (!storageReady) throw new Error('자료 복원이 끝난 후 다시 시도하세요.');
    const current = opsRef.current.inspections[id];
    if (!current || !sites.includes(current.site) || !canDo(role, 'droneRun')) throw new Error('자료 등록 권한이 없습니다.');
    if (current.handed) throw new Error('인계된 회차는 수정할 수 없습니다. 새 점검 회차를 등록하세요.');
    const next = structuredClone(opsRef.current);
    const ins = next.inspections[id];
    const assets = data.assets || ins.assets || [];
    const result = data.result || ins.analysis || null;
    const obs = AXAnalysis.buildObservations(ins, assets, result, next.obs[id]);
    ins.assets = assets; ins.dataMode = 'actual'; ins.analysis = result;
    ins.imageName = assets[0]?.name || null; ins.image = ins.imageName;
    ins.files = AXAnalysis.summarize(ins, obs); next.obs[id] = obs;
    ins.log.unshift([new Date().toISOString(), 'analysis.imported', result ? `${result.source} 분석 결과 연결 · ${result.panels.length}개` : `실제 자료 ${assets.length}개 연결 · 분석 미등록 패널은 미판정`]);
    await commitMaterials(next);
    setFlash('자료 연결·저장 완료 — 패널 상태에서 결과를 확인할 수 있습니다');
  };
  const registerImages = async (id, assets) => {
    const old = opsRef.current.inspections[id]?.assets || [];
    const combined = [...old];
    for (const asset of assets) {
      const prior = combined.find((a) => a.name === asset.name);
      if (prior && prior.dataUrl !== asset.dataUrl) throw new Error('같은 파일명의 다른 이미지가 있습니다: ' + asset.name);
      if (!prior) combined.push(asset);
    }
    return registerAnalysis(id, { assets: combined });
  };
  const createRequest = (ins, ids, svc) => {
    const id = 'REQ-0' + (516 + Object.keys(ops.requests).length - 2);
    upd((o) => {
      const obs = o.obs[ins.id];
      o.requests[id] = { id, site: ins.site, inspection: ins.id, step: 1, requester: R.user, approver: '김서연', assignee: R.user, due: '11-09 18:00', panels: { soil: ids.filter((x) => obs[x].j === 'soil'), dmg: ids.filter((x) => obs[x].j !== 'soil') }, services: svc, note: '', wish: '2026-11-10 ~ 11-14', excluded: '-',
        vendors: [{ org: 'ORG-TM', service: '정비·세척', team: '정비 2팀', response: '가능 여부 확인 필요', quote: null, slots: [['11-12', 10, 13]], accept: '대기' }, { org: 'ORG-CP', service: '세척', team: '1팀 (3명)', response: '가능 여부 확인 필요', quote: null, slots: [['11-11', 13, 16]], accept: '대기' }],
        selected: {}, schedule: {}, reqAccept: '대기', proposalDue: null, hold: null, changes: [[hhmm(nowRef.current), `${R.user} 요청 생성 (패널 ${ids.length}개)`]] };
      ids.forEach((x) => { obs[x].work = '요청'; });
      o.tasks.unshift({ id: 'T-' + (1060 + o.tasks.length), site: ins.site, kind: '승인', title: `${svc.join('·')} 범위 요청 (${id})`, stage: '요청 범위', assignee: role, assigneeLabel: R.user, next: '업체 확인', due: '11-09 18:00', approver: '김서연', reviewer: '운영관리자', link: { screen: 'schedule', id }, changes: [[hhmm(nowRef.current), '요청 생성']], roles: ['owner', 'maint', 'master'] });
    });
    setFlash(`유지보수 요청 ${id} 생성 · 패널 ${ids.length}개 작업 상태 “요청”`);
    return id;
  };

  const myAlarms = R ? alarms.filter((a) => sites.includes(a.site)) : alarms;
  const unread = R ? ops.notifications.filter((n) => n.roles.includes(role) && n.unread).length : 0;
  const sec = Math.floor(now * 60);
  const scr = route.screen;
  const allowed = R && (R.menu.includes(scr) || scr === 'sim');
  const homeTab = R && R.homeTabs.includes(route.params.tab) ? route.params.tab : R && R.homeTabs[0];
  const ctx = { role, R, ops, upd, sites, now, nowRef, go, can, params: route.params, ui, setUi, drafts, setDrafts, flash: setFlash, submitInspection, submitUpload, registerAnalysis, registerImages, createRequest, snap, scenario: OPS.SCENARIOS[sim.scenario], sim, setSim, resetSim, onRole: (rk) => enter(rk, ROLES[rk].home) };
  const navItems = R ? R.menu.filter((p) => p !== 'sim') : [];
  const unackN = myAlarms.filter((a) => a.state === '미확인').length;

  let content = null;
  if (R && !allowed) content = <div className="page"><TitleBar title="권한 없음" /><section className="panel" style={{ flex: 1 }}><div className="empty" style={{ flexDirection: 'column', gap: 10, display: 'flex' }}><b style={{ fontSize: 16 }}>이 화면을 볼 권한이 없습니다</b><span className="mini">{R.label} 역할에는 {SCREENS[scr] ? SCREENS[scr].label : scr} 메뉴가 없습니다.</span><button className="btn" onClick={() => go(R.home)}>홈으로</button></div></section></div>;
  else if (R && scr === 'home') content = (
    <div className="page">
      <div className="subnav">
        {R.homeTabs.map((k2) => <button key={k2} className={homeTab === k2 ? 'on' : ''} onClick={() => go('home', { tab: k2 })}>{k2 === 'tasks' && role === 'master' ? '예외 업무' : HOME_TABS[k2]}{k2 === 'alarms' && unackN > 0 && <span className="cnt2">{unackN}</span>}</button>)}
        <div className="sn-r"><span className="mini">{pageLabel(R, 'home')} · {ctxSite ? siteName(ctxSite) : `전체 발전소 (${R.sites.length})`}</span></div>
      </div>
      {homeTab === 'tasks' && <Tasks ctx={ctx} />}
      {homeTab === 'power' && <Overview snap={snap} unit={t.unit} alarms={myAlarms} go={go} can={can} role={role} onInspReq={(sid) => { setDrafts((d) => ({ ...d, inspection: { site: sid, purpose: '민원·이상 신고 확인', from: '2026-11-08', to: '2026-11-10', note: '' } })); go('home', { tab: 'tasks' }); setFlash('점검 요청 초안 생성 — 업무 현황 하단 “점검 요청 (초안)”에서 제출'); }} />}
      {homeTab === 'detail' && <Detail snap={snap} unit={t.unit} alarms={myAlarms} go={go} site={sites.includes(site) ? site : sites[0]} setSite={setSite} inv={inv} setInv={setInv} />}
      {homeTab === 'alarms' && <Alarms snap={snap} alarms={myAlarms} setAlarms={setAlarms} sel={selAlarm} setSel={setSelAlarm} go={go} perm={{ ack: canDo(role, 'alarmAck'), clear: canDo(role, 'alarmClear') }} can={can} />}
    </div>);
  else if (R) {
    const C = { drone: Drone, panels: Panels, schedule: Schedule, work: Work, inbox: Inbox, settings: Settings }[scr];
    content = <div className="page">{C ? <C ctx={ctx} /> : null}</div>;
  }

  return (
    <>
    <div className="stage readable-stage" data-theme={t.theme} data-role={role || 'entry'} data-text-size={textScale} style={{ '--text-scale': textScale }}>
      <div className="display-controls" role="group" aria-label="화면 표시 설정">
        <div className="display-theme" role="group" aria-label="테마"><button type="button" aria-pressed={t.theme === 'dark'} onClick={() => setTweak('theme', 'dark')}>다크</button><button type="button" aria-pressed={t.theme === 'light'} onClick={() => setTweak('theme', 'light')}>라이트</button></div>
      </div>
      {R && <header className="top">
        <div className="brand"><i className="brand-mark" /><b>AX 발전소</b>{!R && <span>통합 발전 모니터링</span>}</div>
        {R && <nav className="nav">
          {navItems.map((p) => <button key={p} className={scr === p ? 'on' : ''} onClick={() => go(p, {})}>{pageLabel(R, p)}{p === 'inbox' && unread > 0 && <span className="cnt">{unread}</span>}</button>)}
        </nav>}
        <div className="top-r">
          {R && <div className="ctxsel"><label>{R.org} · 조회 범위</label><select value={ctxSite} onChange={(e) => changeSite(e.target.value)}><option value="">전체 발전소 ({R.sites.length})</option>{R.sites.map((s) => <option key={s} value={s}>{siteName(s)}</option>)}</select></div>}
          {R && nNew > 0 && <button className="newchip" onClick={applyNew}>새 결과 <span className="mono">{nNew}</span>건 · 반영</button>}
          {R && <button className="bell" aria-label={`알림 ${unread}건`} onClick={() => go('inbox', {})}>🔔{unread > 0 && <span className="cnt">{unread}</span>}</button>}
          <div className="clock">{hms(sec)}</div>
          <div className="clock-d">2026.11.07<br />토요일 KST</div>
          {R && <><div className="vsep" /><button className="who" onClick={logout} title="사용자 전환"><span className="rs-av sm">{R.mark}</span><span className="who-t"><b>{R.user} · {R.title}</b><span>{R.label}</span></span><span className="who-x">전환</span></button></>}
        </div>
      </header>}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }} data-screen-label={!R ? '00 사용자 선택' : (SCREENS[scr] ? SCREENS[scr].label : scr) + (scr === 'home' && homeTab ? ' · ' + HOME_TABS[homeTab] : '')}>
        {!R && <RoleSelect now={now} unit={t.unit} alarms={alarms} tasks={ops.tasks} ops={ops} last={lastRole} onEnter={enter} />}
        {storageReady ? content : <div className="empty">저장 자료 복원 중…</div>}
      </div>
      {R && toast && R.homeTabs.includes('alarms') && (
        <div className="toast" onClick={() => { applyNew(); go('home', { tab: 'alarms', alarm: toast.id }); setToast(null); }} style={{ borderColor: SEV[toast.sev].c }}>
          <SevTag sev={toast.sev} />
          <div><div style={{ fontWeight: 600, fontSize: 13 }}>{toast.msg}</div><div className="mini">{toast.siteName} · <span className="mono">{toast.eq}</span> · {hms(toast.ts)}</div></div>
          <span className="mini" style={{ marginLeft: 8 }}>보기 →</span>
        </div>
      )}
      {flashMsg && <div className="flash">{typeof flashMsg === 'string' ? flashMsg : flashMsg.msg}{flashMsg.act && <button className="btn" style={{ padding: '2px 10px', marginLeft: 12 }} onClick={() => { flashMsg.act(); setFlash(null); }}>{flashMsg.actL}</button>}</div>}
      {confirmSite && <Modal title="발전소 변경" onClose={() => setConfirmSite(null)} actions={<><button className="btn" onClick={() => { setDrafts({}); confirmSite.doIt(); }}>초안 폐기 후 이동</button><button className="btn pri" onClick={() => confirmSite.doIt()}>초안 보관 후 이동</button></>}><p style={{ lineHeight: 1.6 }}>작성 중인 초안이 있습니다. 새 발전소로 자동 연결되지 않습니다. 초안을 보관하고 이동할까요?</p></Modal>}
    </div>
      {storageError && <div className="flash" role="alert">{storageError} · 현재 화면의 자료는 유지되지만 새로고침 전 저장 상태를 확인하세요.</div>}
      <TweaksPanel>
        <TweakSection label="화면">
          <TweakRadio label="테마" value={t.theme} options={[{ value: 'dark', label: '다크' }, { value: 'light', label: '라이트' }]} onChange={(v) => setTweak('theme', v)} />
          <TweakRadio label="전력 단위" value={t.unit} options={[{ value: 'kW', label: 'kW / kWh' }, { value: 'MW', label: 'MW / MWh' }]} onChange={(v) => setTweak('unit', v)} />
        </TweakSection>
        <TweakSection label="데이터">
          <TweakRadio label="갱신 주기" value={t.refresh} options={[{ value: 1, label: '1초' }, { value: 2, label: '2초' }, { value: 5, label: '5초' }]} onChange={(v) => setTweak('refresh', v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
