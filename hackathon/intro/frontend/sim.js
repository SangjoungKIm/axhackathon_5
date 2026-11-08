/* AX 발전소 — 시뮬레이션 데이터 엔진 (결정적 + 실시간 지터) */
(function () {
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const gauss = (r) => { let u = 0, v = 0; while (!u) u = r(); while (!v) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  // 11월 남서해안 기준 일출/일몰 (분)
  const SR = 7 * 60 + 2, SS = 17 * 60 + 29;
  const PEAK = 760; // W/m² (11월 청천 POA 최대)
  const CO2F = 0.4567; // tCO2/MWh
  const REC = 71850; // 원/REC
  const SMP = [138.2, 136.4, 134.9, 133.1, 133.0, 135.2, 139.4, 142.8, 140.1, 131.6, 122.3, 116.8, 114.2, 115.0, 119.4, 126.1, 135.7, 146.3, 151.2, 149.0, 146.5, 143.3, 141.0, 139.2];

  const SITES = [
    { id: 'YA', name: '교통문화연수원', region: '전남 영암', type: '지상형', cap: 98.0, inv: 24, ph: 0.3, dipT: 11 * 60 + 50, dipD: 0.32, dipW: 16, w: 1.0, cum: 412380, cod: '2019.06', grid: '154kV 영암 S/S', airOff: 0.4 },
  ];
  // 기존 6개 순서·값·난수 시드를 유지하고 뒤에만 추가한다. 용량 단위 MW.
  const DEMO_SITES = [];
  // 사례 키는 데이터 확장과 전력 엔진의 공통 계약이다. 열화상·실계측 진단이 아니다.
  const DEMO_CASES = [];
  DEMO_SITES.forEach(([id, name, region, type, cap, inv], i) => SITES.push({
    id, name, region, type, cap, inv,
    ph: 0.45 + i * 0.37, dipT: 580 + (i * 23) % 260,
    dipD: 0.14 + (i % 5) * 0.045, dipW: 12 + (i % 4) * 3,
    w: type === '수상형' ? 1.6 : type === '지붕형' ? 1.5 : 1,
    cum: Math.round(cap * (2400 + (i % 6) * 680)), cod: '2023.' + String(1 + i % 12).padStart(2, '0'),
    grid: '가상 ' + (cap >= 25 ? '154kV' : '22.9kV') + ' 연계점 ' + id,
    airOff: -1.8 + (i % 8) * 0.45,
    dataMode: 'demo', simulated: true, source: '가상 시연 자료',
    demoCase: DEMO_CASES[i].key, caseLabel: DEMO_CASES[i].label,
    ...(id === 'V7' ? { gap: [700, 735] } : {}),
  }));

  const INV_SCN = {
    'YA-17': { st: 'fault', der: 0 },
    'YA-09': { st: 'warn', der: 0.7 },
    'HN-06': { st: 'warn', der: 0.88 },
    'SM-03': { st: 'comm', der: 1 },
    'TA-02': { st: 'off', der: 0 },
    'V7-01': { st: 'comm', der: 1 },
    'V8-01': { st: 'warn', der: 0.58 },
    'V8-02': { st: 'warn', der: 0.65 },
    'V9-01': { st: 'fault', der: 0 },
    'VA-01': { st: 'off', der: 0 },
    'VI-01': { st: 'off', der: 0 },
  };
  const STR_SCN = {
    'YA-05': { 11: -1 },
    'YA-11': { 2: -0.22 },
    'HN-06': { 13: -0.34, 14: -0.38, 15: -0.31, 16: -0.36 },
    'SM-08': { 6: -0.15 },
    'GH-04': { 18: -0.12 },
    'YA-20': { 7: -0.09 },
    'V2-01': { 0: -0.16, 1: -0.16, 2: -0.16, 3: -0.16 },
    'V3-01': { 2: -0.24, 17: -0.19 },
    'V4-01': { 6: -0.27 },
    'V8-01': { 4: -0.32, 5: -0.29 },
  };
  const NSTR = 20;

  const clear = (t) => (t <= SR || t >= SS ? 0 : Math.pow(Math.sin((Math.PI * (t - SR)) / (SS - SR)), 1.25));
  function cloud(s, t) {
    let c = 0.94 + 0.035 * Math.sin(t / 17 + s.ph) + 0.025 * Math.sin(t / 5.3 + s.ph * 3);
    c -= s.dipD * Math.exp(-Math.pow((t - s.dipT) / s.dipW, 2));
    c -= 0.12 * s.dipD * Math.exp(-Math.pow((t - s.dipT - 140) / 9, 2));
    return Math.max(0.2, Math.min(1.02, c));
  }
  const irrAt = (s, t) => PEAK * clear(t) * cloud(s, t);
  const airAt = (s, t) => 6.2 + s.airOff + 8 * Math.max(0, Math.sin((Math.PI * (t - 450)) / 620)) + 0.3 * Math.sin(t / 31 + s.ph);
  const modAt = (s, t) => airAt(s, t) + (irrAt(s, t) / 1000) * (s.type === '수상형' ? 21 : 29);
  const windAt = (s, t) => 2.4 + 1.2 * Math.sin(t / 47 + s.ph) + 0.6 * Math.sin(t / 13 + s.ph * 2) + (s.type === '수상형' ? 1.4 : 0);
  const rawAt = (s, t) => (irrAt(s, t) / 1000) * 0.862 * (1 - 0.0037 * (modAt(s, t) - 25));
  const fcAt = (s, t) => ((PEAK * clear(t)) / 1000) * 0.862 * (0.935 + 0.02 * Math.sin(t / 40 + s.ph)) * (1 - 0.0037 * 6);

  const inGap = (s, t) => !!s.gap && t > s.gap[0] && t < s.gap[1];
  // 인버터 생성
  SITES.forEach((s, si) => {
    const r = rng(1000 + si * 77);
    s.invs = [];
    for (let i = 1; i <= s.inv; i++) {
      const no = String(i).padStart(2, '0');
      const key = s.id + '-' + no;
      const scn = INV_SCN[key] || { st: 'run', der: 1 };
      const strs = [];
      const sc = STR_SCN[key] || {};
      for (let k = 0; k < NSTR; k++) strs.push(sc[k] !== undefined ? sc[k] : gauss(r) * 0.018);
      s.invs.push({ id: key, tag: s.id + '-INV-' + no, no, st: scn.st, der: scn.der, f: 0.985 + r() * 0.03, effB: 97.7 + r() * 0.7, tB: 34 + r() * SITES.length, strDev: strs });
      if (s.simulated) Object.assign(s.invs[s.invs.length - 1], { dataMode: 'demo', simulated: true, source: '가상 시연 자료' });
    }
    s.avail = s.invs.reduce((a, v) => a + v.f * v.der, 0) / s.inv;
  });

  // 분 단위 사전 계산 (금일 적산용)
  SITES.forEach((s) => {
    const N = 1441;
    s.cE = new Float64Array(N); s.cF = new Float64Array(N); s.cH = new Float64Array(N); s.cR = new Float64Array(N); s.cY = new Float64Array(N);
    const ys = Object.assign({}, s, { ph: s.ph + 1.3, dipT: s.dipT + 95, dipD: s.dipD * 0.85 }); // 전일 동일 계측 지점
    for (let m = 1; m < N; m++) {
      s.cY[m] = s.cY[m - 1] + (s.cap * rawAt(ys, m) * s.avail) / 60;
      const a = inGap(s, m) ? 0 : (s.cap * rawAt(s, m) * s.avail) / 60; // MWh · 10분 초과 결측 구간은 적산하지 않음
      s.cE[m] = s.cE[m - 1] + a;
      s.cF[m] = s.cF[m - 1] + (s.cap * fcAt(s, m)) / 60;
      s.cH[m] = s.cH[m - 1] + irrAt(s, m) / 60 / 1000; // kWh/m²
      s.cR[m] = s.cR[m - 1] + a * 1000 * SMP[Math.floor((m - 1) / 60)];
    }
  });
  const at = (arr, t) => { const m = Math.max(0, Math.min(1439, Math.floor(t))); const f = t - m; return arr[m] + (arr[m + 1] - arr[m]) * f; };

  function snapshot(now, jit, ids) {
    const LIST = ids ? SITES.filter((x) => ids.includes(x.id)) : SITES;
    const J = () => 1 + (Math.random() - 0.5) * 2 * jit;
    const sites = LIST.map((s) => {
      const raw = rawAt(s, now) * J();
      const irr = irrAt(s, now) * J();
      const modT = modAt(s, now), air = airAt(s, now), wind = Math.max(0.3, windAt(s, now) * (1 + (Math.random() - 0.5) * 0.2));
      const E = at(s.cE, now), Efc = at(s.cF, now), H = at(s.cH, now), Ey = at(s.cY, now);
      const lastRx = Math.floor(now * 60) - (3 + ((s.ph * 10) | 0) % 5);
      const unitCap = s.cap / s.inv;
      const invs = s.invs.map((v) => {
        const on = v.st !== 'fault' && v.st !== 'off';
        const ac = on ? unitCap * raw * v.f * v.der * (1 + (Math.random() - 0.5) * 0.006) : 0;
        const load = ac / unitCap;
        const eff = on && ac > 0.01 ? v.effB - (load < 0.2 ? (0.2 - load) * 6 : 0) + (Math.random() - 0.5) * 0.05 : 0;
        const dc = eff ? ac / (eff / 100) : 0;
        const temp = on ? v.tB + load * 14 + (v.st === 'warn' && v.id === 'YA-09' ? 21 : 0) : 18 + air * 0.6;
        const imp = 10.4 * (irr / 1000);
        const strings = v.strDev.map((d) => (!on ? 0 : d <= -1 ? 0 : imp * (1 + d) * (1 + (Math.random() - 0.5) * 0.004)));
        const Einv = (E / s.avail) * (v.f * v.der) / s.inv;
        const vdc = on && ac > 0.01 ? 1048 - load * 120 + (Math.random() - 0.5) * 3 : 0;
        return { ...v, on, ac, dc, load, eff, temp, strings, imp, E: v.st === 'fault' ? Einv * 0.42 : v.st === 'off' ? 0 : Einv, vdc, idc: vdc ? (dc * 1e6) / vdc : 0, pf: on && ac > 0.01 ? 0.992 + Math.random() * 0.006 : 0, hz: 59.98 + Math.random() * 0.04, vac: on ? 658 + Math.random() * 5 : 0 };
      });
      const p = invs.reduce((a, v) => a + v.ac, 0);
      const fc = s.cap * fcAt(s, now);
      const counts = { run: 0, warn: 0, fault: 0, comm: 0, off: 0 };
      invs.forEach((v) => counts[v.st]++);
      const pr = H > 0.02 ? E / (s.cap * H) : 0;
      const revSmp = at(s.cR, now), revRec = E * s.w * REC;
      return { ...s, invs, Ey, lastRx, gapMin: s.gap ? s.gap[1] - s.gap[0] : 0, p, fc, irr, modT, air, wind, E, Efc, H, pr, cf: E / (s.cap * 24), eqh: E / s.cap, revSmp, revRec, rev: revSmp + revRec, co2: E * CO2F, counts, invRun: counts.run + counts.warn + counts.comm, avail: (counts.run + counts.warn + counts.comm) / s.inv };
    });
    const sum = (k) => sites.reduce((a, s) => a + s[k], 0);
    const cap = sum('cap');
    const tot = {
      p: sum('p'), fc: sum('fc'), cap, E: sum('E'), Efc: sum('Efc'), Ey: sum('Ey'), lastRx: Math.min(...sites.map((x) => x.lastRx)), gaps: sites.filter((x) => x.gap).map((x) => ({ id: x.id, name: x.name, from: x.gap[0], to: x.gap[1] })), cum: sum('cum') + sum('E'),
      irr: sites.reduce((a, s) => a + s.irr * s.cap, 0) / cap,
      H: sites.reduce((a, s) => a + s.H * s.cap, 0) / cap,
      revSmp: sum('revSmp'), revRec: sum('revRec'), rev: sum('rev'), co2: sum('co2'),
      invN: sum('inv'), invRun: sum('invRun'),
      counts: ['run', 'warn', 'fault', 'comm', 'off'].reduce((o, k) => ((o[k] = sites.reduce((a, s) => a + s.counts[k], 0)), o), {}),
    };
    tot.pr = tot.H > 0.02 ? tot.E / (cap * tot.H) : 0;
    tot.cf = tot.E / (cap * 24);
    tot.eqh = tot.E / cap;
    tot.co2cum = tot.cum * CO2F;
    tot.smp = SMP[Math.min(23, Math.floor(now / 60))];
    return { now, sites, tot, scope: ids || 'ALL' };
  }

  // 차트 시계열 (5분 간격)
  function series(siteId, kind, from, to, step) {
    step = step || 5;
    const list = siteId === 'ALL' ? SITES : Array.isArray(siteId) ? SITES.filter((s) => siteId.includes(s.id)) : SITES.filter((s) => s.id === siteId);
    const capT = list.reduce((a, s) => a + s.cap, 0);
    const out = [];
    for (let t = from; t <= to + 0.001; t += step) {
      let v = 0;
      if (kind === 'act') v = list.length === 1 && inGap(list[0], t) ? null : list.reduce((a, s) => a + (inGap(s, t) ? 0 : s.cap * rawAt(s, t) * s.avail), 0);
      else if (kind === 'mavg') v = list.reduce((a, s) => a + s.cap * fcAt(s, t) * (0.9 + 0.012 * Math.sin(s.ph)), 0);
      else if (kind === 'yavg') v = list.reduce((a, s) => a + s.cap * fcAt(s, t) * (0.83 + 0.015 * Math.cos(s.ph)), 0);
      else if (kind === 'yday') v = list.reduce((a, s) => a + s.cap * rawAt(Object.assign({}, s, { ph: s.ph + 1.3, dipT: s.dipT + 95, dipD: s.dipD * 0.85 }), t) * s.avail, 0);
      else if (kind === 'fc') v = list.reduce((a, s) => a + s.cap * fcAt(s, t), 0);
      else if (kind === 'irr') v = list.reduce((a, s) => a + irrAt(s, t) * s.cap, 0) / capT;
      else if (kind === 'mod') v = list.reduce((a, s) => a + modAt(s, t) * s.cap, 0) / capT;
      else if (kind === 'air') v = list.reduce((a, s) => a + airAt(s, t) * s.cap, 0) / capT;
      out.push([t, v]);
    }
    return out;
  }
  function invSeries(invId, from, to, step) {
    step = step || 5;
    const s = SITES.find((x) => x.id === invId.slice(0, 2));
    const v = s.invs.find((x) => x.id === invId);
    const out = [];
    for (let t = from; t <= to + 0.001; t += step) {
      let k = v.f * v.der;
      if (v.id === 'YA-17' && t > 11 * 60 + 42) k = 0;
      if (v.id === 'YA-17' && t <= 11 * 60 + 42) k = v.f;
      if (v.id === 'YA-09' && t < 12 * 60 + 31) k = v.f;
      if (v.st === 'off') k = 0;
      out.push([t, (s.cap / s.inv) * rawAt(s, t) * k]);
    }
    return out;
  }

  // ───────── 알람 ─────────
  const CAT = {
    'INV-F012': { sev: 'critical', eq: 'INV', msg: '지락(Ground Fault) 검출 — 인버터 정지', desc: 'DC 측 대지 누설전류가 설정값(300 mA)을 초과하여 보호 계전이 동작했습니다. 인버터가 계통에서 분리되었습니다.', act: ['DC 측 절연저항(IR) 측정으로 지락 스트링 특정', '해당 스트링 분리 후 인버터 재기동', '케이블 피복 손상·접속함 침수 여부 현장 점검'] },
    'INV-F031': { sev: 'critical', eq: 'INV', msg: 'IGBT 모듈 과열 트립', desc: 'IGBT 방열판 온도가 95℃를 초과하여 인버터가 트립되었습니다.', act: ['냉각팬 및 필터 막힘 점검', '외기 온도·함체 환기 상태 확인', '냉각 후 수동 리셋'] },
    'GRD-F002': { sev: 'critical', eq: 'MVT', msg: '계통 과전압(OVR) 보호 동작', desc: '연계점 전압이 정격의 110%를 초과하여 연계 차단기가 개방되었습니다.', act: ['한전 계통 상태 및 급전 지령 확인', '보호계전기 이벤트 기록 확인', '재투입 전 전압 안정 확인'] },
    'INV-W118': { sev: 'major', eq: 'INV', msg: 'IGBT 온도 상한 근접 — 출력 제한 운전(70%)', desc: '내부 온도 상승으로 인버터가 자동 디레이팅 모드로 전환되었습니다.', act: ['냉각팬 동작 상태 확인', '흡기 필터 청소 일정 앞당김', '출력 제한 해제 여부 모니터링'] },
    'COM-W004': { sev: 'major', eq: 'RTU', msg: 'RTU 통신 두절 (응답 없음 > 60s)', desc: '현장 RTU로부터 Modbus 응답이 수신되지 않습니다. 발전 데이터가 갱신되지 않습니다.', act: ['통신 회선(LTE/광) 상태 확인', 'RTU 전원 및 통신 모듈 재기동', '현장 데이터로거 로컬 저장 확인'] },
    'STR-W021': { sev: 'major', eq: 'STR', msg: '스트링 전류 불균형 (평균 대비 −35%)', desc: '동일 인버터 내 일부 스트링 전류가 평균 대비 크게 낮습니다. 음영·오염·모듈 손상 가능성이 있습니다.', act: ['해당 어레이 육안 점검(음영·오염)', 'I-V 커브 측정', '필요 시 모듈 세척 작업 지시'] },
    'STR-W030': { sev: 'minor', eq: 'STR', msg: '스트링 개방 — 퓨즈 단선 의심', desc: '스트링 전류가 0 A로 측정됩니다. 접속반 퓨즈 단선 또는 커넥터 이탈이 의심됩니다.', act: ['접속반 퓨즈 상태 확인 및 교체', 'MC4 커넥터 체결 상태 점검'] },
    'DC-W010': { sev: 'minor', eq: 'INV', msg: 'DC 절연저항 저하 (0.8 MΩ)', desc: '기동 전 절연저항 측정값이 경고 임계치(1.0 MΩ) 미만입니다.', act: ['우천·결로 여부 확인', '추세 모니터링 후 지속 시 현장 점검'] },
    'TR-W003': { sev: 'minor', eq: 'MVT', msg: '주변압기 유온 상승 (72℃)', desc: '변압기 상부 유온이 경고 임계치(70℃)를 초과했습니다.', act: ['냉각 팬 동작 확인', '부하율 및 외기온 추세 확인'] },
    'MET-W001': { sev: 'minor', eq: 'MET', msg: '일사계 측정값 편차 (POA vs 기준 12%)', desc: '경사면 일사계와 기준 일사계 간 편차가 큽니다. 센서 오염 가능성이 있습니다.', act: ['일사계 돔 세척', '교정 이력 확인'] },
    'PF-W002': { sev: 'minor', eq: 'INV', msg: '역률 저하 (0.94)', desc: '저출력 구간에서 역률이 설정값 미만입니다.', act: ['무효전력 제어 설정 확인'] },
    'KPX-I001': { sev: 'info', eq: 'SYS', msg: '전력거래소 출력제어 지령 해제', desc: '전력거래소(KPX) 출력제어 지령이 해제되어 정상 운전으로 복귀했습니다.', act: ['조치 불필요'] },
    'SYS-I010': { sev: 'info', eq: 'SYS', msg: '일일 데이터 백업 완료', desc: '전일 운전 데이터 백업이 정상 완료되었습니다.', act: ['조치 불필요'] },
    'INV-I002': { sev: 'info', eq: 'INV', msg: '인버터 기동 — MPPT 운전 진입', desc: 'DC 전압이 기동 전압에 도달하여 인버터가 운전을 시작했습니다.', act: ['조치 불필요'] },
    'DAT-W001': { sev: 'major', eq: 'RTU', msg: '전력 수신 누락 20분 (11:50~12:10) — 원인 확인 필요', desc: 'RTU로부터 5분 전력 표본이 20분간 수신되지 않았습니다. 해당 구간은 0 발전으로 치환하지 않고 발전량 적산에서 제외했습니다. 그래프는 선을 끊어 표시합니다.', act: ['RTU 통신 로그 확인', '누락 구간 처리방침(재수신·미적산 유지) 기록', '반복 시 통신 회선 점검 요청'] },
    'MNT-I005': { sev: 'info', eq: 'INV', msg: '계획 정비 — 인버터 수동 정지', desc: '정기 예방정비를 위해 인버터를 수동 정지했습니다. (작업지시 WO-26-1107-03)', act: ['정비 완료 후 재기동 및 상태 확인'] },
  };
  let seq = 24810;
  function mk(ts, siteId, invNo, code, state, extra) {
    const c = CAT[code];
    const s = SITES.find((x) => x.id === siteId);
    const eq = c.eq === 'INV' || c.eq === 'STR' ? `${siteId}-INV-${invNo}` + (c.eq === 'STR' && extra ? ` / STR-${extra}` : '') : c.eq === 'MVT' ? `${siteId}-MVT-01` : c.eq === 'RTU' ? `${siteId}-RTU-01` : c.eq === 'MET' ? `${siteId}-MET-01` : `${siteId}-SCADA`;
    const TASKMAP = { 'YA:INV-F012': 'T-1044', 'HN:STR-W021': 'T-1045', 'SM:COM-W004': 'T-1046', 'HN:DAT-W001': 'T-1047' };
    return { task: TASKMAP[siteId + ':' + code] || null, id: 'A-' + seq++, ts, site: siteId, siteName: s.name, eq, inv: c.eq === 'INV' || c.eq === 'STR' ? `${siteId}-${invNo}` : null, code, sev: c.sev, msg: c.msg, desc: c.desc, act: c.act, state, ackTs: state !== '미확인' ? ts + 120 + Math.floor(Math.random() * 600) : null, clrTs: state === '해제' ? ts + 900 + Math.floor(Math.random() * 1800) : null, isNew: false,
      ...(s.simulated ? { dataMode: 'demo', simulated: true, source: '가상 시연 자료' } : {}) };
  }
  const hms = (h, m, s) => h * 3600 + m * 60 + (s || 0);
  function initialAlarms() {
    const r = rng(42);
    const list = [
      mk(hms(0, 30, 2), 'YA', null, 'SYS-I010', '해제'),
      mk(hms(7, 9, 44), 'YA', '01', 'INV-I002', '해제'),
      mk(hms(8, 12, 37), 'YA', '05', 'STR-W030', '미확인', '12'),
      mk(hms(11, 42, 18), 'YA', '17', 'INV-F012', '확인'),
      mk(hms(12, 31, 5), 'YA', '09', 'INV-W118', '미확인'),
    ];
    const pool = ['PF-W002', 'DC-W010', 'MET-W001', 'INV-I002', 'TR-W003', 'KPX-I001'];
    for (let i = 0; i < 22; i++) {
      const s = SITES[Math.floor(r() * SITES.length)]; // 기존 6개 난수 표본은 추가 사례 수와 독립
      const code = pool[Math.floor(r() * pool.length)];
      const t = Math.floor(hms(6, 50) + r() * (hms(12, 20) - hms(6, 50)));
      list.push(mk(t, s.id, String(1 + Math.floor(r() * s.inv)).padStart(2, '0'), code, r() < 0.85 ? '해제' : '확인'));
    }
    list.push(...demoAlarms());
    list.sort((a, b) => b.ts - a.ts);
    return list;
  }
  function randomAlarm(tsSec) {
    const x = Math.random();
    const code = x < 0.03 ? 'INV-F031' : x < 0.16 ? ['STR-W021', 'INV-W118'][Math.floor(Math.random() * 2)] : x < 0.62 ? ['PF-W002', 'DC-W010', 'MET-W001', 'TR-W003'][Math.floor(Math.random() * 4)] : ['KPX-I001', 'INV-I002'][Math.floor(Math.random() * 2)];
    const s = SITES[Math.floor(Math.random() * SITES.length)];
    if (s.simulated) { const a = demoAlarms().find((x) => x.site === s.id); return { ...a, id: 'A-DEMO-LIVE-' + seq++, ts: tsSec, isNew: true }; }
    const a = mk(tsSec, s.id, String(1 + Math.floor(Math.random() * s.inv)).padStart(2, '0'), code, CAT[code].sev === 'info' ? '해제' : '미확인', code.startsWith('STR') ? String(1 + Math.floor(Math.random() * 20)).padStart(2, '0') : null);
    if (a.state === '해제') { a.ackTs = tsSec; a.clrTs = tsSec; }
    a.isNew = true;
    return a;
  }

  function demoAlarms() {
    return DEMO_CASES.map((c, i) => ({ id: 'A-DEMO-V2-' + c.site, ts: hms(9, i * 2), site: c.site,
      siteName: SITES.find((s) => s.id === c.site).name, eq: c.site + '-SCADA', inv: ['lowyield', 'inverterfault', 'scheduledmaintenance', 'sparewaiting'].includes(c.key) ? c.site + '-01' : null,
      code: 'DEMO-' + c.key.toUpperCase(), sev: c.key === 'inverterfault' ? 'critical' : ['commgap', 'lowyield', 'sparewaiting'].includes(c.key) ? 'major' : 'info',
      msg: '가상 ' + c.label, desc: '가상 시연 자료 · ' + c.detail + ' · 실제 경보·센서 진단 아님',
      act: ['가상 관련 업무 확인', '실제 조치 전 담당자·원본 자료 확인'],
      state: ['normal', 'completed'].includes(c.key) ? '해제' : '확인', ackTs: hms(9, i * 2) + 30,
      clrTs: ['normal', 'completed'].includes(c.key) ? hms(9, i * 2) + 60 : null, isNew: false,
      task: null, demoCase: c.key, dataMode: 'demo', simulated: true, source: '가상 시연 자료', sourceKind: 'synth' }));
  }
  window.SIM = { inGap, SITES, DEMO_CASES, demoAlarms, SR, SS, SMP, REC, CO2F, NSTR, snapshot, series, invSeries, initialAlarms, randomAlarm };
})();
