/* 운영 업무 기준 데이터 — 점검·패널 관측·요청·작업·알림·설정. 모든 값은 시연용 가상 자료 */
(function () {
  const ORGS = {
    'ORG-PLT': { name: '플랫폼 운영', type: '운영' },
    'ORG-HB': { name: '한빛솔라', type: '발전소 소유' },
    'ORG-RG': { name: '전남 서남권 에너지센터', type: '지역관리' },
    'ORG-SK': { name: '스카이뷰드론', type: '드론 운영' },
    'ORG-TM': { name: '태양정비', type: '정비·세척업체' },
    'ORG-CP': { name: '클린PV', type: '세척업체' },
  };
  const JUDG = { ok: '외관 정상', soil: '오염', dmg: '육안상 파손', und: '미판정' };
  const WORK_ST = ['요청 없음', '요청', '조율', '진행', '검수', '종료'];
  const pad = (n) => String(n).padStart(2, '0');

  function layout(zones, rows, cols) {
    const ids = [];
    zones.forEach((z) => { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) ids.push(z + pad(r * cols + c + 1)); });
    return ids;
  }
  function genObs(insId, zones, rows, cols, spec) {
    const ids = layout(zones, rows, cols);
    const out = {};
    ids.forEach((id, i) => {
      const soil = spec.soil && spec.soil[id], dmg = spec.dmg && spec.dmg[id], und = spec.und && spec.und[id], mod = spec.mod && spec.mod[id];
      const ai = soil ? 'soil' : dmg ? 'dmg' : und ? 'und' : mod ? mod.from : 'ok';
      const j = mod ? mod.to : ai;
      const unrev = (spec.unreviewed || []).includes(id);
      out[id] = {
        id, ai, j, soilType: soil || null, dmgPos: dmg || null, undReason: und || null,
        review: mod ? '수정됨' : und ? '미검토' : unrev ? '미검토' : spec.reviewAll ? '확인 완료' : '미검토',
        reviewer: mod || (!unrev && !und && spec.reviewAll) ? spec.reviewer : null,
        reviewedAt: mod ? mod.at : !unrev && !und && spec.reviewAll ? spec.reviewedAt : null,
        reason: mod ? mod.reason : null,
        work: (spec.work && spec.work[id]) || '요청 없음',
        img: und === '촬영 누락' ? null : 'IMG-' + (spec.imgBase + i),
        str: 'STR-' + pad(Math.floor(i / (ids.length / 20)) + 1),
      };
    });
    return out;
  }

  function init() {
    const inspections = {
      'INS-2026-031': { id: 'INS-2026-031', site: 'YA', inv: 'YA-17', round: 3, purpose: '정기 외관 점검', target: 'INV-17 어레이 A~F 구역', zones: ['A', 'B', 'C', 'D', 'E', 'F'], rows: 2, cols: 6,
        step: 4, stage: '분석 결과 검토', drone: '최민재', aircraft: 'M3E-02 (RGB)', source: '드론 촬영', image: 'IMG-0398', wish: '2026-11-04 ~ 11-06', note: '남측 진입로 이용, 수상 배수로 주변 주의',
        shotAt: '2026-11-05 10:12', detect: { n: 72, unlinked: 0 }, route: { ver: 2, reviewedBy: '최민재', reviewedAt: '11-05 09:40' },
        shoot: { total: 24, done: 24, fail: [], running: false, finished: true },
        files: { A: [12, 12, 12, 0], B: [12, 12, 12, 0], C: [12, 12, 12, 0], D: [12, 12, 12, 0], E: [12, 12, 11, 1], F: [12, 10, 9, 1] },
        handed: { to: '운영관리자', at: '11-05 14:10', policy: '명시적 보류 · 미판정 유지' }, reviewer: '운영관리자',
        log: [['11-05 14:10', 'inspection.handed_over', '운영관리자에게 인계 · F09·F10 미판정 유지'], ['11-05 13:20', 'analysis.completed', '분석 70/72 · 실패 2'], ['11-05 10:58', 'files.received', '수신 70/72 · 미수신 2 (F09·F10 동작)'], ['11-05 10:12', 'shoot.finished', '촬영 24/24 종료'], ['11-05 09:40', 'route.reviewed', '경로 v2 검토 완료 (최민재)']] },
      'INS-2026-022': { id: 'INS-2026-022', site: 'YA', inv: 'YA-17', round: 2, purpose: '정기 외관 점검', target: 'INV-17 어레이 A~F 구역', zones: ['A', 'B', 'C', 'D', 'E', 'F'], rows: 2, cols: 6,
        step: 4, stage: '종료', drone: '최민재', aircraft: 'M3E-02 (RGB)', source: '드론 촬영', image: 'IMG-0201', wish: '2026-10-18 ~ 10-20', note: '-',
        shotAt: '2026-10-20 09:48', detect: { n: 72, unlinked: 0 }, route: { ver: 1, reviewedBy: '최민재', reviewedAt: '10-20 09:10' },
        shoot: { total: 24, done: 24, fail: [], running: false, finished: true },
        files: { A: [12, 12, 12, 0], B: [12, 12, 12, 0], C: [12, 12, 12, 0], D: [12, 12, 12, 0], E: [12, 12, 12, 0], F: [12, 12, 12, 0] },
        handed: { to: '운영관리자', at: '10-20 15:30', policy: '누락 없음' }, reviewer: '운영관리자',
        log: [['10-20 15:30', 'inspection.handed_over', '운영관리자에게 인계'], ['10-20 09:48', 'shoot.finished', '촬영 24/24 종료']] },
      'INS-2026-033': { id: 'INS-2026-033', site: 'HN', inv: 'HN-06', round: 1, purpose: '민원·이상 신고 확인', target: 'INV-06 어레이 A~D 구역 (스트링 14~17 포함)', zones: ['A', 'B', 'C', 'D'], rows: 2, cols: 6,
        step: 2, stage: '촬영', drone: '최민재', aircraft: 'M3E-05 (RGB)', source: '드론 촬영', image: 'IMG-0511', wish: '2026-11-07', note: '스트링 전류 불균형 구간 우선 촬영',
        shotAt: null, detect: { n: 48, unlinked: 0 }, route: { ver: 2, reviewedBy: '최민재', reviewedAt: '11-07 11:05' },
        shoot: { total: 24, done: 0, fail: [], running: false, finished: false },
        files: null, handed: null, reviewer: '운영관리자',
        log: [['11-07 11:05', 'route.reviewed', '경로 v2 검토 완료 (최민재)'], ['11-07 10:50', 'detection.completed', '탐지 48 / 미연결 0'], ['11-06 15:00', 'image.registered', '전경 이미지 등록 IMG-0511']] },
      'INS-2026-034': { id: 'INS-2026-034', site: 'SM', inv: null, round: 1, purpose: '준공 후 첫 점검', target: '수상 어레이 A~D 구역', zones: ['A', 'B', 'C', 'D'], rows: 2, cols: 6,
        step: 0, stage: '담당 배정', drone: null, aircraft: '미지정', source: '미수집', image: null, wish: '2026-11-12 ~ 11-14', note: '수상 부유체 진입 불가 — 제방 이륙',
        shotAt: null, detect: null, route: null, shoot: { total: 24, done: 0, fail: [], running: false, finished: false }, files: null, handed: null, reviewer: null,
        log: [['11-06 18:20', 'inspection.requested', '한빛솔라 점검 요청 접수 · 담당 미배정']] },
    };
    const obs = {
      'INS-2026-031': genObs('INS-2026-031', ['A', 'B', 'C', 'D', 'E', 'F'], 2, 6, {
        soil: { A03: '조류 분변', A04: '조류 분변', B07: '먼지·황사', C02: '낙엽', C09: '먼지·황사', D05: '조류 분변', F01: '낙엽' },
        dmg: { B12: '셀 균열 (우하단)', E04: '프레임 변형 (좌측)' },
        und: { F09: '촬영 누락', F10: '분석 실패' },
        mod: { E11: { from: 'soil', to: 'ok', reason: '그림자 오분류 — 근접 이미지 재확인', at: '11-06 09:30' } },
        unreviewed: ['C09', 'D05', 'F01'], reviewAll: true, reviewer: '운영관리자', reviewedAt: '11-06 09:12', imgBase: 412,
        work: { A03: '조율', A04: '조율', B07: '조율', C02: '조율', C09: '조율', D05: '조율', F01: '조율', B12: '조율', E04: '조율' },
      }),
      'INS-2026-022': genObs('INS-2026-022', ['A', 'B', 'C', 'D', 'E', 'F'], 2, 6, {
        soil: { A01: '먼지·황사', A02: '먼지·황사', A05: '먼지·황사', B03: '조류 분변', B04: '먼지·황사', B08: '먼지·황사', B09: '먼지·황사' },
        dmg: { B12: '셀 균열 (우하단)', E04: '정션박스 변색' },
        reviewAll: true, reviewer: '운영관리자', reviewedAt: '10-21 10:05', imgBase: 210,
        work: { A01: '진행', A02: '진행', A05: '진행', B03: '진행', B04: '진행', B08: '진행', B09: '진행', B12: '검수', E04: '검수' },
      }),
    };

    const requests = {
      'REQ-0512': { id: 'REQ-0512', site: 'YA', inspection: 'INS-2026-031', step: 2, requester: '운영관리자', approver: '김서연', assignee: '김서연', due: '11-08 18:00',
        panels: { soil: ['A03', 'A04', 'B07', 'C02', 'C09', 'D05', 'F01'], dmg: ['B12', 'E04'] }, services: ['세척', '정비'],
        note: 'C02·F01 낙엽은 구역 주변 수목 정리 여부 함께 확인. B12는 정비 후 세척.', wish: '2026-11-10 ~ 11-14 오전', excluded: 'F09·F10 미판정 패널 (재촬영 후 판단)',
        vendors: [
          { org: 'ORG-CP', service: '세척', team: '1팀 (3명)', response: '견적 제출', quote: { version: 1, items: [['패널 세척', 7, 18000], ['출장비', 1, 60000]], tax: '별도', valid: '2026-11-14', hours: '2.5시간 (업체 제시)' }, slots: [['11-10', 9, 12], ['11-11', 13, 16], ['11-13', 9, 12]], accept: '대기' },
          { org: 'ORG-TM', service: '정비', team: '정비 2팀', response: '현장 확인 후 견적', quote: null, onsite: true, slots: [['11-12', 10, 13], ['11-14', 9, 12]], accept: '대기' },
        ],
        selected: { 'ORG-CP': true, 'ORG-TM': true }, schedule: {}, reqAccept: '대기', proposalDue: null, hold: null,
        changes: [['11-07 10:20', '클린PV 견적 v1 제출'], ['11-06 17:40', '태양정비 “현장 확인 후 견적” 응답'], ['11-06 11:02', '운영관리자 요청 생성 (패널 9개)']] },
      'REQ-0515': { id: 'REQ-0515', site: 'HN', inspection: null, step: 4, requester: '운영관리자', approver: '김서연', assignee: '김서연', due: '11-08 18:00',
        panels: { str: ['STR-14', 'STR-15', 'STR-16', 'STR-17'] }, services: ['세척', '정비'], basis: 'HN-INV-06 스트링 전류 불균형 (평균 대비 −31~−38%) — 관측값, 원인 미확정',
        note: '스트링 14~17 연결 어레이 표면 확인 후 세척. 커넥터 발열 여부 점검.', wish: '2026-11-09 ~ 11-10', excluded: '-',
        vendors: [
          { org: 'ORG-TM', service: '정비·세척', team: '정비 2팀', response: '견적 제출', quote: { version: 1, items: [['스트링 점검 (I-V 측정)', 4, 45000], ['어레이 세척 (스트링 단위)', 4, 30000], ['출장비', 1, 60000]], tax: '별도', valid: '2026-11-12', hours: '4시간 (업체 제시)' }, slots: [['11-09', 9, 13], ['11-10', 13, 17]], accept: '수락' },
          { org: 'ORG-CP', service: '세척', team: '2팀 (3명)', response: '현장 확인 후 견적', quote: null, onsite: true, slots: [['11-11', 9, 12]], accept: '대기' },
        ],
        selected: { 'ORG-TM': true }, schedule: { 'ORG-TM': ['11-09', 9, 13] }, reqAccept: '대기', proposalDue: '11-08 18:00', hold: '11-08 18:00',
        changes: [['12:40', '태양정비 업체 수락 (견적 v1 · 11-09 09:00~13:00)'], ['11:20', '클린PV “현장 확인 후 견적” 응답'], ['11:02', '운영관리자 요청 생성 (스트링 4개)']] },
    };

    const workOrders = {
      'WO-2088': { id: 'WO-2088', site: 'YA', service: '세척', team: '클린PV 1팀', vendor: 'ORG-CP', state: '진행', schedule: '2026-11-07 09:00~12:00', approver: '김서연', reviewer: '김서연', quoteVersion: 'v1', issuedAt: '2026-11-03 16:12', inspection: 'INS-2026-022', next: 'B구역 완료 보고',
        scope: 'A·B 구역 24패널 (2회차 오염 판정 기준)', note: 'B12는 정비 미완료로 접근 제한, 제외 후 사유 기록', targets: ['A01', 'A02', 'A05', 'B03', 'B04', 'B08', 'B09'],
        items: [
          { id: 'A구역', label: 'A구역 세척 (12패널)', state: 'done', reportedAt: '11-07 10:55', ev: { before: 1, after: 1 }, result: '12/12 완료', material: '순수 120L', review: null },
          { id: 'B구역', label: 'B구역 세척 (12패널)', state: 'progress', reportedAt: null, ev: { before: 1, after: 0 }, result: '진행 중 · B12 제외 예정', material: '-', review: null },
        ], cost: { base: 186000, extra: 0, tax: '별도' } },
      'WO-2075': { id: 'WO-2075', site: 'YA', service: '정비', team: '태양정비 2팀', vendor: 'ORG-TM', state: '검수 대기', schedule: '2026-11-05 09:00~11-06 17:00', approver: '김서연', reviewer: '김서연', quoteVersion: 'v2 (변경 승인 대기)', issuedAt: '2026-10-30 11:00', inspection: 'INS-2026-022', next: '항목별 검수',
        scope: '파손 2패널 (B12, E04) 정비', note: '모듈 교체 시 동일 규격 확인', targets: ['B12', 'E04'],
        items: [
          { id: 'B12', label: 'B12 모듈 교체', state: 'done', reportedAt: '11-06 16:30', ev: { before: 1, after: 1 }, result: '교체 완료 · 개방전압 정상 범위 (업체 보고)', material: '모듈 1장, 커넥터 2개', review: null },
          { id: 'E04', label: 'E04 정션박스 점검·배선 교정', state: 'hold', reportedAt: '11-06 16:28', ev: { before: 1, after: 0 }, result: '보류: 다이오드 부품 대기', material: '-', holdReason: '부품 대기 (입고 예정 11-14)', review: null },
          { id: 'ADD-1', label: '추가: B11 커넥터 교체 (범위 외)', state: 'progress', reportedAt: null, ev: { before: 0, after: 0 }, result: '변경 승인 필요 (+35,000원)', material: '커넥터 1개', review: null, change: { amount: 35000, approved: false } },
        ], cost: { base: 480000, extra: 35000, tax: '별도' } },
      'WO-2091': { id: 'WO-2091', site: 'YA', service: '정비', team: '태양정비 1팀', vendor: 'ORG-TM', state: '검수 대기', schedule: '2026-11-07 10:00~12:00', approver: '김서연', reviewer: '김서연', quoteVersion: 'v1', issuedAt: '2026-11-06 16:10', inspection: null, next: '항목별 검수',
        scope: 'YA-INV-05 STR-12 접속반 퓨즈 교체', note: '교체 후 스트링 전류 확인', targets: [], measure: { inv: 'YA-05', str: 11 },
        items: [{ id: 'STR-12', label: 'STR-12 퓨즈 교체 (15A)', state: 'done', reportedAt: '11-07 12:20', ev: { before: 1, after: 1 }, result: '퓨즈 교체 완료 (업체 보고)', material: '퓨즈 15A 2개', review: null }],
        cost: { base: 95000, extra: 0, tax: '별도' } },
      'WO-2094': { id: 'WO-2094', site: 'HN', service: '세척', team: '태양정비 2팀', vendor: 'ORG-TM', state: '예정', schedule: '2026-11-07 14:00~17:00', approver: '김서연', reviewer: '김서연', quoteVersion: 'v1', issuedAt: '2026-11-05 15:20', inspection: null, next: '작업 시작 보고',
        scope: 'B구역 정기 세척 (12패널)', note: '오후 작업 · 우천 시 연기', targets: [],
        items: [{ id: 'B구역', label: 'B구역 세척 (12패널)', state: 'todo', reportedAt: null, ev: { before: 0, after: 0 }, result: '-', material: '-', review: null }],
        cost: { base: 216000, extra: 0, tax: '별도' } },
      'WO-2061': { id: 'WO-2061', site: 'HN', service: '세척', team: '클린PV 2팀', vendor: 'ORG-CP', state: '완료', schedule: '2026-10-21 09:00~15:00', approver: '김서연', reviewer: '김서연', quoteVersion: 'v1', issuedAt: '2026-10-15 10:00', inspection: null, next: '-',
        scope: '전체 48패널', note: '-', targets: [],
        items: ['A', 'B', 'C', 'D'].map((z, i) => ({ id: z + '구역', label: z + '구역 세척 (12패널)', state: 'approved', reportedAt: '10-21 ' + ['11:00', '12:10', '13:40', '14:50'][i], ev: { before: 1, after: 1 }, result: '완료', material: '-', review: '승인' })),
        cost: { base: 640000, extra: 0, tax: '별도' } },
    };

    const notifications = [
      { id: 'N-1', at: '12:44', cause: '검토할 통신 두절 알람 1건 (SM-RTU-01)', task: 'T-1046', who: '태양정비 현장팀', next: 'RTU 재기동 결과 확인', unread: true, roles: ['master'] },
      { id: 'N-2', at: '12:40', cause: '태양정비 업체 수락 — 최종 수락 대기 (REQ-0515)', task: 'T-1045', who: '김서연', next: '견적·일정 확인 후 수락', unread: true, roles: ['owner', 'master'] },
      { id: 'N-3', at: '12:20', cause: 'STR-12 퓨즈 교체 완료 보고 (WO-2091)', task: 'T-1049', who: '김서연', next: '항목별 검수', unread: true, roles: ['owner', 'maint', 'master'] },
      { id: 'N-4', at: '12:12', cause: '해남 솔라팜 전력 수신 누락 20분 — 처리방침 필요', task: 'T-1047', who: '운영관리자', next: '누락 구간 처리방침 기록', unread: true, roles: ['owner', 'master'] },
      { id: 'N-5', at: '11:47', cause: '검토할 지락 고장 알람 1건 (YA-INV-17)', task: 'T-1044', who: '태양정비 정비 2팀', next: '절연저항 측정 · 지락 스트링 특정', unread: false, roles: ['owner', 'maint', 'master'] },
      { id: 'N-6', at: '11:05', cause: '해남 1회차 경로 v2 검토 완료 — 촬영 대기', task: 'T-1042', who: '최민재', next: '촬영 시뮬레이션 시작', unread: true, roles: ['drone', 'master'] },
      { id: 'N-7', at: '10:20', cause: '클린PV 견적 v1 제출 (REQ-0512)', task: 'T-1041', who: '김서연', next: '견적 비교 후 응답', unread: false, roles: ['owner', 'master'] },
      { id: 'N-8', at: '10:05', cause: '제안 요청 수신 — 견적 제출 필요 (REQ-0512)', task: 'T-1041', who: '정우성', next: '현장 확인 후 견적 제출', unread: true, roles: ['maint', 'master'] },
      { id: 'N-9', at: '09:00', cause: '오늘 작업 1건 (WO-2094 · 14:00 시작)', task: 'T-1050', who: '정우성', next: '작업 시작 보고', unread: true, roles: ['maint', 'master'] },
      { id: 'N-10', at: '어제', cause: '새만금 수상 초기 점검 요청 · 담당 미배정', task: 'T-1043', who: '운영 담당자', next: '드론 수행자 배정', unread: true, roles: ['drone', 'master'] },
      { id: 'N-11', at: '11-05', cause: '에너지센터 미조치 현황 공유 요청', task: 'T-1053', who: '김서연', next: '공유 범위 응답', unread: false, roles: ['owner', 'regional', 'master'] },
      { id: 'N-12', at: '11-05', cause: '공유 승인 발전소 1개소 추가 (영암 1단지)', task: 'T-1053', who: '이하늘', next: '조치 현황 확인', unread: true, roles: ['regional'] },
    ];

    const settings = {
      '발전소·패널': [
        { name: '영암 1단지', meta: '전남 영암 · 98.0 MW · 인버터 24', fields: [['발전소 이름', '영암 1단지'], ['소유 조직', '한빛솔라'], ['정비·세척', '태양정비 · 클린PV'], ['계통 연계', '154kV 영암 S/S'], ['점검 어레이 등록', 'INV-17 어레이 72패널 (A~F)'], ['상업운전', '2019.06']] },
        { name: '해남 솔라팜', meta: '전남 해남 · 52.4 MW · 인버터 14', fields: [['발전소 이름', '해남 솔라팜'], ['소유 조직', '한빛솔라'], ['정비·세척', '태양정비 · 클린PV'], ['계통 연계', '154kV 해남 S/S'], ['점검 어레이 등록', 'INV-06 어레이 48패널 (A~D)'], ['상업운전', '2020.03']] },
        { name: '새만금 수상', meta: '전북 군산 · 40.0 MW · 인버터 12', fields: [['발전소 이름', '새만금 수상'], ['소유 조직', '미확인'], ['정비·세척', '미지정'], ['계통 연계', '154kV 새만금 S/S'], ['점검 어레이 등록', '미등록 — 패널 기준정보 확인 필요'], ['상업운전', '2022.11']] },
      ],
      '조직·계정': [
        { name: '한빛솔라', meta: '발전소 소유 · 계정 3', fields: [['조직 유형', '발전소 소유'], ['대표 계정', '김서연 (운영팀장)'], ['접근 발전소', '영암 1단지, 해남 솔라팜']] },
        { name: '태양정비', meta: '정비·세척업체 · 계정 4', fields: [['조직 유형', '정비·세척업체'], ['대표 계정', '정우성 (견적·배차 담당)'], ['접근 발전소', '영암 1단지, 해남 솔라팜 (배정 작업 범위)']] },
        { name: '스카이뷰드론', meta: '드론 운영 · 계정 2', fields: [['조직 유형', '드론 운영'], ['대표 계정', '최민재 (드론 운영자)'], ['운항 권한', '확인된 범위에서만 실제 명령 활성화']] },
      ],
      '업체·자원': [
        { name: '태양정비', meta: '정비·세척 · 팀 2', fields: [['서비스', '정비, 세척'], ['가능 지역', '전남 서남권'], ['팀', '정비 1팀 (2명), 정비 2팀 (3명)'], ['반복 가용 패턴', '평일 09:00~17:00']] },
        { name: '클린PV', meta: '세척 · 팀 2', fields: [['서비스', '세척'], ['가능 지역', '전남 전역'], ['팀', '1팀 (3명), 2팀 (3명)'], ['반복 가용 패턴', '미등록 — 가능 여부 확인 필요']] },
      ],
      '위임·승인': [
        { name: '영암 1단지 승인 규칙', meta: '승인자 김서연', fields: [['비용 승인자', '김서연'], ['검수자', '김서연'], ['기술 검토자', '운영관리자'], ['위임', '없음']] },
        { name: '새만금 수상 승인 규칙', meta: '승인자 미지정', fields: [['비용 승인자', '미지정 (위임 만료 11-06)'], ['검수자', '미지정'], ['기술 검토자', '운영관리자'], ['위임', '만료']] },
      ],
      '운영 규칙': [
        { name: '응답 기한', meta: '제안 요청 48시간', fields: [['제안 요청 응답 기한', '48시간'], ['잠정 예약 만료', '24시간'], ['기한 초과 알림', '기한 경과 즉시']] },
        { name: '전력 결측 처리', meta: '10분 초과 결측 미적산', fields: [['표본 간격', '5분'], ['적분 방식', '사다리꼴'], ['결측 기준', '10분 초과'], ['결측 표시', '선 끊김 · 0 치환 금지']] },
        { name: '증빙 기준', meta: '전·후 각 1장 이상', fields: [['세척', '구역별 작업 전·후 각 1장'], ['정비', '항목별 작업 전·후 각 1장'], ['검수 기준', '합의 범위 항목별 승인']] },
      ],
    };
    return { inspections, obs, requests, workOrders, notifications, settings, settingsLog: [] };
  }

  /* 시뮬레이션 이벤트 시간표 (sim 경과 초) — 같은 시나리오 → 같은 결과 */
  const EVENTS = [
    { t: 20, id: 'EV-101', type: 'quote.submitted', target: 'REQ-0512', seq: 1, label: '태양정비 견적 v1 제출 (REQ-0512)' },
    { t: 45, id: 'EV-102', type: 'work.item_reported', target: 'WO-2088', seq: 1, label: 'WO-2088 B구역 완료 보고 (B12 제외)' },
    { t: 70, id: 'EV-103', type: 'schedule.proposed', target: 'REQ-0512', seq: 2, label: '태양정비 일정 제안 11-12 10:00~13:00' },
    { t: 95, id: 'EV-104', type: 'notification', target: 'T-1048', seq: 1, label: 'INV-09 출력 제한 지속 30분 — 담당 배정 필요' },
  ];
  const DUPS = [{ t: 50, id: 'EV-102', type: 'work.item_reported', target: 'WO-2088', seq: 1, label: 'WO-2088 B구역 완료 보고 (중복)' }, { t: 80, id: 'EV-099', type: 'quote.submitted', target: 'REQ-0512', seq: 0, label: '태양정비 견적 v0 (역순 도착)' }];
  const SCENARIOS = {
    normal: { label: '정상 완료', desc: '촬영 24동작 모두 성공, 견적·일정 응답 정상', fails: [], gap: false },
    partial: { label: '탐지·분석 일부 실패', desc: '촬영 동작 2건 실패 (9·17번), 실패 항목 재시도 필요', fails: [9, 17], gap: false },
    gap: { label: '전력 수신 누락', desc: '해남 11:50~12:10 전력 표본 누락, 0 발전으로 치환하지 않음', fails: [], gap: true },
    dup: { label: '중복·역순 이벤트', desc: '같은 event_id 중복 도착 · 오래된 sequence 역순 도착 → 무시', fails: [], gap: false, dup: true },
  };

  window.OPS = { ORGS, JUDG, WORK_ST, layout, init, EVENTS, DUPS, SCENARIOS };
})();
