/* 시연용 기준 데이터. 모든 수치는 가상 시뮬레이션 자료이며 실제 현장 값이 아니다. */
window.PV = window.PV || {};

PV.TODAY = "2026-11-07";
PV.SIM_START_MIN = 11 * 60 + 40; // 11:40 KST (시뮬레이션 시작 시각)

PV.orgs = {
  "ORG-PLT": { id: "ORG-PLT", name: "플랫폼 운영", type: "운영" },
  "ORG-HB":  { id: "ORG-HB",  name: "한빛솔라",   type: "발전소 소유" },
  "ORG-YG":  { id: "ORG-YG",  name: "영광에너지", type: "발전소 소유" },
  "ORG-DG":  { id: "ORG-DG",  name: "대한그린시공", type: "시공업체" },
  "ORG-RG":  { id: "ORG-RG",  name: "영광군 에너지센터", type: "지역관리" },
  "ORG-SK":  { id: "ORG-SK",  name: "스카이뷰드론", type: "드론 운영" },
  "ORG-TM":  { id: "ORG-TM",  name: "태양정비",   type: "정비업체" },
  "ORG-CP":  { id: "ORG-CP",  name: "클린PV",     type: "세척업체" },
  "ORG-TO":  { id: "ORG-TO",  name: "토탈O&M",    type: "종합업체" }
};

/* 역할 정의: 메뉴와 기본 진입 화면 (설계서 2.2) */
PV.roles = {
  owner:    { key: "owner",    label: "발전소 사용자", home: "home",      menu: ["home", "drone", "panels", "schedule", "work", "inbox"], sites: ["S1", "S2"], org: "ORG-HB",
              menuLabels: { home: "홈", drone: "내 점검", schedule: "승인할 일", work: "작업 이력", panels: "패널 상태" } },
  epc:      { key: "epc",      label: "시공업체",      home: "home",      menu: ["home", "drone", "panels", "schedule", "work", "inbox", "settings"], sites: ["S1", "S2", "S3"], org: "ORG-DG",
              menuLabels: { home: "관리 현황", drone: "점검", panels: "패널 상태", schedule: "일정·배정", work: "작업·검수" } },
  regional: { key: "regional", label: "지역관리자",    home: "home",      menu: ["home", "inbox"], sites: ["S1", "S2", "S3"], org: "ORG-RG",
              menuLabels: { home: "지역 현황", inbox: "요청·응답" } },
  drone:    { key: "drone",    label: "드론 수행자",   home: "drone",     menu: ["drone", "panels", "inbox"], sites: ["S1", "S2", "S3"], org: "ORG-SK",
              menuLabels: { drone: "배정 점검", panels: "패널 상태(읽기)" } },
  maint:    { key: "maint",    label: "정비·세척 업체", home: "schedule", menu: ["schedule", "work", "inbox"], sites: ["S1", "S2"], org: "ORG-TM",
              menuLabels: { schedule: "요청·견적", work: "작업·보고" } },
  total:    { key: "total",    label: "종합업체",      home: "schedule",  menu: ["schedule", "work", "inbox"], sites: ["S1", "S2"], org: "ORG-TO",
              menuLabels: { schedule: "요청·견적", work: "통합 작업" } },
  master:   { key: "master",   label: "마스터",        home: "home",      menu: ["home", "drone", "panels", "schedule", "work", "inbox", "settings", "sim"], sites: ["S1", "S2", "S3"], org: "ORG-PLT",
              menuLabels: { home: "예외 업무", settings: "조직·권한" } }
};

PV.users = {
  owner:    { name: "김서연", title: "운영팀장", org: "ORG-HB" },
  epc:      { name: "박준호", title: "O&M 담당", org: "ORG-DG" },
  regional: { name: "이하늘", title: "에너지센터 주임", org: "ORG-RG" },
  drone:    { name: "최민재", title: "드론 운영자", org: "ORG-SK" },
  maint:    { name: "정우성", title: "견적·배차 담당", org: "ORG-TM" },
  total:    { name: "오세훈", title: "통합 책임자", org: "ORG-TO" },
  master:   { name: "운영관리자", title: "플랫폼 운영", org: "ORG-PLT" }
};

/* 발전소 */
PV.sites = {
  S1: { id: "S1", name: "영광 백수 1호", region: "전남 영광군 백수읍", owner: "ORG-HB", epc: "ORG-DG", capacityKw: 98.6, zones: ["A", "B", "C", "D", "E", "F"], rows: 2, cols: 6, power: "sim" },
  S2: { id: "S2", name: "영광 백수 2호", region: "전남 영광군 백수읍", owner: "ORG-HB", epc: "ORG-DG", capacityKw: 66.0, zones: ["A", "B", "C", "D"], rows: 2, cols: 6, power: "stale" },
  S3: { id: "S3", name: "함평 월야",     region: "전남 함평군 월야면", owner: "ORG-YG", epc: "ORG-DG", capacityKw: null, zones: [], rows: 0, cols: 0, power: "none" }
};

/* 패널 등록 정보 */
PV.panelsOf = function (siteId) {
  const s = PV.sites[siteId];
  const out = [];
  s.zones.forEach((z) => {
    for (let r = 0; r < s.rows; r++) for (let c = 0; c < s.cols; c++) {
      const n = r * s.cols + c + 1;
      out.push({ id: `${z}${String(n).padStart(2, "0")}`, zone: z, row: r + 1, col: c + 1, site: siteId });
    }
  });
  return out;
};

/* 점검 회차 */
PV.inspections = {
  "INS-2026-031": { id: "INS-2026-031", site: "S1", round: 3, purpose: "정기 외관 점검", status: "인계 완료", stage: 4, assignee: "drone", reviewer: "epc",
    captureAt: "2026-11-05 10:12~10:48", analysisAt: "2026-11-05 13:20", imageSrc: "RGB 전경 1장 + 근접 72장", files: { received: 72, analyzed: 70, failed: 1, missing: 1 }, source: "원천 로그 재생" },
  "INS-2026-022": { id: "INS-2026-022", site: "S1", round: 2, purpose: "정기 외관 점검", status: "종료", stage: 4, assignee: "drone", reviewer: "epc",
    captureAt: "2026-09-12 09:40~10:15", analysisAt: "2026-09-12 12:05", imageSrc: "RGB 전경 1장 + 근접 72장", files: { received: 72, analyzed: 72, failed: 0, missing: 0 }, source: "원천 로그 재생" },
  "INS-2026-033": { id: "INS-2026-033", site: "S2", round: 1, purpose: "준공 후 첫 점검", status: "촬영", stage: 3, assignee: "drone", reviewer: "epc",
    captureAt: null, analysisAt: null, imageSrc: "RGB 전경 1장", files: { received: 0, analyzed: 0, failed: 0, missing: 0 }, source: "합성 시뮬레이션",
    mission: { planned: 24, done: 9, failed: 1, state: "실행", routeVersion: "v2", reviewedBy: "최민재", reviewedAt: "2026-11-07 11:05" } },
  "INS-2026-034": { id: "INS-2026-034", site: "S3", round: 1, purpose: "초기 점검", status: "자료 준비", stage: 1, assignee: null, reviewer: null,
    captureAt: null, analysisAt: null, imageSrc: null, files: { received: 0, analyzed: 0, failed: 0, missing: 0 }, source: "사용자 입력" }
};

/* 관측(판정): 회차별 패널 상태. 기본은 외관 정상 */
PV.observations = {
  "INS-2026-031": {
    A03: { j: "soil", soil: "먼지", review: "확인 완료", reviewer: "박준호", reviewedAt: "2026-11-06 09:12" },
    A04: { j: "soil", soil: "먼지", review: "확인 완료", reviewer: "박준호", reviewedAt: "2026-11-06 09:12" },
    B07: { j: "soil", soil: "새똥", review: "확인 완료", reviewer: "박준호", reviewedAt: "2026-11-06 09:14" },
    B12: { j: "dmg", pos: "우하단", review: "확인 완료", reviewer: "박준호", reviewedAt: "2026-11-06 09:20", work: "진행" },
    C02: { j: "soil", soil: "낙엽", review: "미검토" },
    C09: { j: "soil", soil: "먼지", review: "미검토" },
    D05: { j: "soil", soil: "새똥", review: "확인 완료", reviewer: "박준호", reviewedAt: "2026-11-06 09:16" },
    D12: { j: "und", reason: "촬영 누락 (동작 #41 실패)", review: "미검토" },
    E04: { j: "dmg", pos: "중앙", review: "확인 완료", reviewer: "박준호", reviewedAt: "2026-11-06 09:21", work: "보류" },
    E11: { j: "ok", ai: "soil", aiSoil: "먼지", review: "수정됨", reviewer: "박준호", reviewedAt: "2026-11-06 09:30", reason: "구조물 그림자 오분류" },
    F01: { j: "soil", soil: "낙엽", review: "미검토" },
    F08: { j: "und", reason: "분석 실패 (모델 오류 E-114)", review: "미검토" }
  },
  "INS-2026-022": {
    B12: { j: "dmg", pos: "우하단", review: "확인 완료", reviewer: "박준호", reviewedAt: "2026-09-13 10:02" },
    E04: { j: "dmg", pos: "중앙", review: "확인 완료", reviewer: "박준호", reviewedAt: "2026-09-13 10:03" },
    A03: { j: "soil", soil: "먼지", review: "확인 완료", reviewer: "박준호", reviewedAt: "2026-09-13 10:05" },
    C09: { j: "soil", soil: "먼지", review: "확인 완료", reviewer: "박준호", reviewedAt: "2026-09-13 10:05" }
  }
};

PV.judgLabel = { ok: "외관 정상", soil: "오염", dmg: "육안상 파손", und: "미판정" };

/* 업무 건 */
PV.tasks = [
  { id: "T-1041", site: "S1", title: "3회차 세척·정비 범위 승인", stage: "업체·견적", assignee: "owner", assigneeLabel: "김서연 (승인자)", next: "견적 2건 비교 후 수락 또는 변경 요청", due: "2026-11-08 18:00", approver: "김서연", reviewer: "박준호", kind: "승인", link: { screen: "schedule", id: "REQ-0512" },
    changes: [["11-07 10:20", "클린PV 견적 v1 제출"], ["11-06 17:40", "태양정비 ‘현장 확인 후 견적’ 응답"], ["11-06 11:02", "박준호가 요청 생성 (패널 10개)"]], roles: ["owner", "epc", "master"] },
  { id: "T-1042", site: "S2", title: "1회차 드론 점검 촬영", stage: "촬영", assignee: "drone", assigneeLabel: "최민재", next: "촬영 시뮬레이션 진행 · 실패 동작 복구", due: "2026-11-07 17:00", approver: "박준호", reviewer: "박준호", kind: "점검", link: { screen: "drone", id: "INS-2026-033" },
    changes: [["11-07 11:05", "경로 v2 검토 완료 (최민재)"], ["11-07 10:50", "탐지 48 / 미연결 0"], ["11-06 15:00", "전경 이미지 등록"]], roles: ["owner", "epc", "drone", "master"] },
  { id: "T-1038", site: "S1", title: "A·B구역 세척 작업 (WO-2088)", stage: "진행", assignee: "maint", assigneeLabel: "클린PV 1팀", next: "B구역 항목별 완료 보고", due: "2026-11-07 18:00", approver: "김서연", reviewer: "김서연", kind: "작업", link: { screen: "work", id: "WO-2088" },
    changes: [["11-07 10:55", "A구역 완료 보고 · 증빙 2장"], ["11-07 09:02", "작업 시작 보고"], ["11-03 16:10", "일정 확정 11-07 09:00~12:00"]], roles: ["owner", "epc", "maint", "total", "master"] },
  { id: "T-1035", site: "S1", title: "2회차 파손 패널 정비 검수 (WO-2075)", stage: "검수 대기", assignee: "owner", assigneeLabel: "김서연 (검수자)", next: "항목별 승인 또는 보완 요청", due: "2026-11-08 12:00", approver: "김서연", reviewer: "김서연", kind: "검수", link: { screen: "work", id: "WO-2075" },
    changes: [["11-06 16:30", "태양정비 완료 보고 (B12) · E04 보류"], ["11-06 14:00", "추가 작업 변경 요청 +35,000원"], ["11-05 09:00", "작업 시작"]], roles: ["owner", "epc", "maint", "master"] },
  { id: "T-1040", site: "S1", title: "3회차 오염 판정 기술 검토", stage: "진행", assignee: "epc", assigneeLabel: "박준호 (기술 검토자)", next: "미검토 관측 3건 확인", due: "2026-11-07 11:00", approver: "-", reviewer: "박준호", kind: "검토", link: { screen: "panels", id: "INS-2026-031" },
    changes: [["11-06 09:30", "E11 판정 수정 (오염→외관 정상)"], ["11-06 09:12", "검토 시작"], ["11-05 13:20", "분석 완료 70/72"]], roles: ["epc", "master"] },
  { id: "T-1043", site: "S3", title: "초기 점검 요청 · 담당 배정", stage: "담당 배정", assignee: null, assigneeLabel: "미배정", next: "드론 수행자 배정 (인계 대상: 운영 담당자)", due: "2026-11-09 18:00", approver: "박준호", reviewer: "-", kind: "점검", link: { screen: "drone", id: "INS-2026-034" },
    changes: [["11-06 18:20", "영광에너지 점검 요청 접수"]], roles: ["epc", "drone", "master"] },
  { id: "T-1037", site: "S1", title: "미조치 현황 공유 요청", stage: "상대 응답 대기", assignee: "owner", assigneeLabel: "김서연", next: "지역관리자 요청에 공유 범위 응답", due: "2026-11-10 18:00", approver: "김서연", reviewer: "-", kind: "요청", link: null,
    changes: [["11-05 15:00", "영광군 에너지센터 요청 발송"]], roles: ["owner", "regional", "master"] },
  { id: "T-1033", site: "S2", title: "전체 세척 작업 (WO-2061)", stage: "종료", assignee: null, assigneeLabel: "-", next: "-", due: null, approver: "김서연", reviewer: "김서연", kind: "작업", link: { screen: "work", id: "WO-2061" },
    changes: [["10-22 10:00", "검수 승인 (48/48)"], ["10-21 17:30", "완료 보고"]], roles: ["owner", "epc", "maint", "master"] }
];

/* 유지보수 요청 (SCR-04) */
PV.requests = {
  "REQ-0512": {
    id: "REQ-0512", site: "S1", inspection: "INS-2026-031", stage: 2, requester: "박준호", approver: "김서연", assignee: "김서연", due: "2026-11-08 18:00",
    panels: { soil: ["A03", "A04", "B07", "C02", "C09", "D05", "F01"], dmg: ["B12", "E04"] },
    services: ["세척", "정비"], note: "C02·F01 낙엽은 구역 주변 수목 정리 여부 함께 확인. B12는 정비 후 세척.",
    wish: "2026-11-10 ~ 2026-11-14 오전",
    vendors: [
      { org: "ORG-CP", service: "세척", quote: { version: 1, items: [["패널 세척", 7, 18000], ["출장비", 1, 60000]], tax: "별도", valid: "2026-11-14", hours: "2.5시간 (업체 제시)" }, slots: [["2026-11-10", 9, 12], ["2026-11-11", 13, 16]], team: "1팀 (3명)", response: "견적 제출" },
      { org: "ORG-TM", service: "정비", quote: null, onsite: true, slots: [["2026-11-12", 10, 13]], team: "정비 2팀", response: "현장 확인 후 견적" },
      { org: "ORG-TO", service: "종합", quote: null, slots: [], team: "미등록", response: "가능 여부 확인 필요" }
    ],
    selected: { "ORG-CP": true, "ORG-TM": true },
    schedule: { "ORG-CP": null, "ORG-TM": null },
    responses: { requester: "대기", vendor: "대기" }
  }
};

/* 작업지시 (SCR-05) */
PV.workOrders = {
  "WO-2088": { id: "WO-2088", site: "S1", service: "세척", team: "클린PV 1팀", vendor: "ORG-CP", state: "진행", schedule: "2026-11-07 09:00~12:00", approver: "김서연", reviewer: "김서연", quoteVersion: "v1", issuedAt: "2026-11-03 16:12", inspection: "INS-2026-022", next: "B구역 완료 보고",
    scope: "A·B 구역 24패널 (2회차 오염 판정 기준)", note: "B12는 정비 미완료로 접근 제한, 제외 후 사유 기록",
    items: [
      { id: "A구역", label: "A구역 세척 (12패널)", state: "done", reportedAt: "11-07 10:55", evidence: 2, result: "12/12 완료", material: "순수 120L" },
      { id: "B구역", label: "B구역 세척 (12패널)", state: "progress", reportedAt: null, evidence: 1, result: "진행 중 · B12 제외 예정", material: "-" }
    ] },
  "WO-2075": { id: "WO-2075", site: "S1", service: "정비", team: "태양정비 2팀", vendor: "ORG-TM", state: "검수 대기", schedule: "2026-11-05 09:00~2026-11-06 17:00", approver: "김서연", reviewer: "김서연", quoteVersion: "v2 (변경 승인 대기)", issuedAt: "2026-10-30 11:00", inspection: "INS-2026-022", next: "항목별 검수",
    scope: "파손 2패널 (B12, E04) 정비", note: "모듈 교체 시 동일 규격 확인",
    items: [
      { id: "B12", label: "B12 모듈 교체", state: "done", reportedAt: "11-06 16:30", evidence: 2, result: "교체 완료 · 개방전압 정상 범위(업체 보고)", material: "모듈 1장, 커넥터 2개", review: null },
      { id: "E04", label: "E04 정션박스 점검·배선 교정", state: "hold", reportedAt: "11-06 16:28", evidence: 1, result: "보류: 다이오드 부품 대기", material: "-", holdReason: "부품 대기 (입고 예정 11-14)", review: null },
      { id: "ADD-1", label: "추가: B11 커넥터 교체 (범위 외)", state: "progress", reportedAt: null, evidence: 0, result: "변경 승인 필요 (+35,000원)", material: "커넥터 1개", review: null }
    ],
    cost: { base: 480000, extra: 35000, tax: "별도" } },
  "WO-2061": { id: "WO-2061", site: "S2", service: "세척", team: "클린PV 2팀", vendor: "ORG-CP", state: "완료", schedule: "2026-10-21 09:00~15:00", approver: "김서연", reviewer: "김서연", quoteVersion: "v1", issuedAt: "2026-10-15 10:00", inspection: null, next: "-",
    scope: "전체 48패널", note: "-",
    items: [
      { id: "A구역", label: "A구역 세척 (12패널)", state: "approved", reportedAt: "10-21 11:00", evidence: 2, result: "완료", material: "-" },
      { id: "B구역", label: "B구역 세척 (12패널)", state: "approved", reportedAt: "10-21 12:10", evidence: 2, result: "완료", material: "-" },
      { id: "C구역", label: "C구역 세척 (12패널)", state: "approved", reportedAt: "10-21 13:40", evidence: 2, result: "완료", material: "-" },
      { id: "D구역", label: "D구역 세척 (12패널)", state: "approved", reportedAt: "10-21 14:50", evidence: 2, result: "완료", material: "-" }
    ] }
};

/* 알림 */
PV.notifications = [
  { id: "N-1", at: "11:12", cause: "클린PV 견적 v1 제출", task: "T-1041", who: "김서연", next: "견적 비교 후 응답", unread: true, roles: ["owner", "epc", "master"] },
  { id: "N-2", at: "10:55", cause: "A구역 세척 완료 보고 (증빙 2장)", task: "T-1038", who: "김서연", next: "진행 확인", unread: true, roles: ["owner", "epc", "master"] },
  { id: "N-3", at: "10:50", cause: "S2 패널 탐지 완료 48 / 미연결 0", task: "T-1042", who: "최민재", next: "경로 검토", unread: false, roles: ["drone", "epc", "master"] },
  { id: "N-4", at: "09:30", cause: "E11 판정 수정 (오염 → 외관 정상)", task: "T-1040", who: "박준호", next: "미검토 3건 확인", unread: false, roles: ["epc", "master"] },
  { id: "N-5", at: "어제", cause: "WO-2075 추가 작업 변경 요청 +35,000원", task: "T-1035", who: "김서연", next: "변경 승인", unread: true, roles: ["owner", "master"] },
  { id: "N-6", at: "어제", cause: "함평 월야 초기 점검 요청 접수 · 담당 미배정", task: "T-1043", who: "운영 담당자", next: "드론 수행자 배정", unread: true, roles: ["epc", "drone", "master"] },
  { id: "N-7", at: "11-05", cause: "영광군 에너지센터 공유 요청", task: "T-1037", who: "김서연", next: "공유 범위 응답", unread: false, roles: ["owner", "regional", "master"] }
];

/* 발전전력 더미 (고정 시간표). 5분 순간 표본, kW. 결측 구간은 표본 자체가 없다.
   비교 기준은 여러 날을 평균한 곡선이라 순간 변동이 없다.
   - lastyear: 전년 동분기(2025년 4분기) 일평균 곡선
   - lastmonth: 전월(2026년 10월) 일평균 곡선 */
PV.cmpBase = {
  lastyear:  { key: "lastyear",  label: "전년 비교", short: "전년 동분기", legend: "전년 동분기 평균 (2025 4Q)", pk: 84.6, rise: 6 * 60 + 35, set: 17 * 60 + 35 },
  lastmonth: { key: "lastmonth", label: "전월 비교", short: "전월",       legend: "전월 평균 (2026-10)",        pk: 80.2, rise: 6 * 60 + 25, set: 17 * 60 + 50 }
};
PV.powerSeries = function (siteId, day) {
  if (siteId !== "S1") return [];
  const out = [];
  if (day !== "today") {
    const b = PV.cmpBase[day] || PV.cmpBase.lastyear;
    for (let t = b.rise; t <= b.set; t += 5) {
      const x = (t - b.rise) / (b.set - b.rise);
      const p = b.pk * Math.sin(Math.PI * x) ** 1.3;
      out.push({ t, kw: Math.max(0, Math.round(p * 10) / 10) });
    }
    return out;
  }
  const shape = { pk: 78.4, dips: [[9 * 60 + 35, 25, 0.55], [12 * 60 + 50, 40, 0.7]] };
  const rise = 6 * 60 + 40, set = 17 * 60 + 25;
  for (let t = rise; t <= set; t += 5) {
    if (t >= 11 * 60 + 5 && t <= 11 * 60 + 35) continue; // 수신 누락 구간
    const x = (t - rise) / (set - rise);
    let p = shape.pk * Math.sin(Math.PI * x) ** 1.35;
    shape.dips.forEach(([c, w, f]) => { const d = Math.exp(-((t - c) ** 2) / (2 * (w / 2) ** 2)); p *= 1 - (1 - f) * d; });
    p += Math.sin(t / 7.3) * 0.9 + Math.cos(t / 3.1) * 0.5;
    out.push({ t, kw: Math.max(0, Math.round(p * 10) / 10) });
  }
  return out;
};

/* 최근 6일 기준 대비 발전량 증감(%) 더미 (기준별). 오늘 값은 전력 표본에서 계산한다 */
PV.dailyDelta = {
  S1: { lastyear: [["11-01", -3.2], ["11-02", -4.8], ["11-03", -7.5], ["11-04", -11.6], ["11-05", -16.9], ["11-06", -24.3]],
        lastmonth: [["11-01", -1.1], ["11-02", -2.6], ["11-03", -5.0], ["11-04", -8.9], ["11-05", -13.4], ["11-06", -20.7]] }
};

/* 점검 필요도 3단계: 기준(전년 동분기·전월 평균) 같은 시간대 대비 발전량 관측 증감 (규칙 기반, 원인 미확정) */
PV.levelRule = { watch: -10, inspect: -25 };
PV.levelOf = function (delta) {
  if (delta === null || delta === undefined || Number.isNaN(delta)) return "none";
  if (delta < PV.levelRule.inspect) return "inspect";
  if (delta < PV.levelRule.watch) return "watch";
  return "ok";
};
PV.levelMeta = {
  ok:      { label: "정상", icon: "check",  desc: `기준 대비 ${PV.levelRule.watch}% 이상` },
  watch:   { label: "유의", icon: "alert",  desc: `기준 대비 ${PV.levelRule.watch}% ~ ${PV.levelRule.inspect}%` },
  inspect: { label: "점검", icon: "drone",  desc: `기준 대비 ${PV.levelRule.inspect}% 미만` },
  none:    { label: "미산출", icon: "help", desc: "비교 기준 없음" }
};

/* 설정 기준정보 */
PV.settings = {
  "발전소·패널": [
    { name: "영광 백수 1호", sub: "72패널 · 6구역 · 98.6 kW · 기준 이미지 2026-09-12", meta: "관리자: 김서연" },
    { name: "영광 백수 2호", sub: "48패널 · 4구역 · 66.0 kW · 기준 이미지 미등록", meta: "관리자: 김서연" },
    { name: "함평 월야", sub: "패널 등록 없음 · 정격용량 미확인", meta: "관리자: 미지정" }
  ],
  "조직·계정": Object.values(PV.users).map((u) => ({ name: `${u.name} · ${u.title}`, sub: PV.orgs[u.org].name, meta: "유효기간: 2027-03-31" })),
  "업체·자원": [
    { name: "클린PV", sub: "세척 · 전남 영광·함평 · 1팀(3명), 2팀(3명)", meta: "가용 패턴: 월~금 09–17" },
    { name: "태양정비", sub: "정비 · 전남 전역 · 정비 2팀", meta: "가용 패턴: 미등록 → 확인 필요" },
    { name: "토탈O&M", sub: "종합 · 광주·전남 · 팀 미등록", meta: "가용 패턴: 미등록" },
    { name: "스카이뷰드론", sub: "촬영 · 기체 2대 (SKY-01, SKY-02)", meta: "운항 담당: 최민재" }
  ],
  "위임·승인": [
    { name: "영광 백수 1·2호 비용 승인", sub: "승인자 김서연 · 대체 승인자 미지정", meta: "효력: 2026-01-01 ~" },
    { name: "3회차 기술 검토", sub: "검토자 박준호 (대한그린시공)", meta: "범위: INS-2026-031" }
  ],
  "운영 규칙": [
    { name: "견적 응답 기한", sub: "요청 후 48시간 (운영 기준안, 확정 전)", meta: "DEC-08" },
    { name: "잠정 예약 만료", sub: "제안 후 24시간 (운영 기준안)", meta: "DEC-08" },
    { name: "필수 증빙", sub: "세척: 구역당 전·후 각 1장 / 정비: 패널당 전·후 각 1장", meta: "DEC-10" }
  ]
};
