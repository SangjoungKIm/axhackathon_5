/* 사용자(역할) 정의 — 사용자별 기능 명세 1장·4장 기준 + 접속 사용자 선택 화면 */
const SCREENS = {
  home: { short: '홈', label: '홈·대시보드', desc: '업무 현황 · 발전 현황 · 설비 상세 · 알람' },
  drone: { short: '점검', label: '드론 점검', desc: '자료 준비 → 탐지·경로 → 촬영 → 수신·인계' },
  panels: { short: '패널', label: '패널 상태', desc: '배치도/목록 · 판정·검토·작업 상태' },
  schedule: { short: '일정', label: '일정·배정', desc: '요청 범위 → 업체·견적 → 일정 → 최종 확인' },
  work: { short: '작업', label: '작업·검수', desc: '작업지시 · 수행 기록 · 증빙 · 검수·비용' },
  inbox: { short: '알림', label: '알림·업무함', desc: '원인 · 관련 업무 · 담당자 · 다음 행동' },
  settings: { short: '설정', label: '설정', desc: '발전소·패널 · 조직 · 업체 · 위임 · 규칙' },
};
const PAGES = SCREENS;

const ROLES = {
  owner: {
    key: 'owner', label: '발전소 사용자', org: '한빛솔라', orgType: '발전소 소유', user: '김서연', title: '운영팀장', mark: '발', vendorOrg: null,
    sites: ['YA', 'HN', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'VA'], menu: ['home', 'drone', 'panels', 'schedule', 'work', 'inbox'], home: 'home',
    labels: { home: '홈', drone: '내 점검', schedule: '승인할 일', work: '작업 이력' },
    homeTabs: ['tasks', 'power', 'detail', 'alarms'],
    scope: '점검 요청 · 견적·일정 최종 수락(승인자) · 작업 검수(검수자)',
  },
  regional: {
    key: 'regional', label: '지역관리자', org: '전남 서남권 에너지센터', orgType: '지역관리', user: '이하늘', title: '에너지센터 주임', mark: '지', vendorOrg: null,
    sites: ['YA', 'HN', 'SM', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'VA', 'VB', 'VC', 'VD', 'VE', 'VF'], shared: ['YA', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7'], menu: ['home', 'inbox'], home: 'home',
    labels: { home: '지역 현황', inbox: '요청·응답' },
    homeTabs: ['tasks', 'power'],
    scope: '공유 승인 범위 집계 조회 · 조치 요청·응답 추적 (실행 권한 없음)',
  },
  drone: {
    key: 'drone', label: '드론 수행자', org: '스카이뷰드론', orgType: '드론 운영', user: '최민재', title: '드론 운영자', mark: '드', vendorOrg: null,
    sites: ['YA', 'HN', 'SM', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'VA', 'VB', 'VC', 'VD', 'VE', 'VF'], menu: ['drone', 'panels', 'inbox'], home: 'drone',
    labels: { drone: '배정 점검', panels: '패널 상태(읽기)' },
    homeTabs: [],
    scope: '자료 준비 · 탐지 실행 · 경로 검토 · 촬영 시뮬레이션 · 자료 인계',
  },
  maint: {
    key: 'maint', label: '정비·세척 업체', org: '태양정비', orgType: '정비·세척업체', user: '정우성', title: '견적·배차 담당', mark: '정', vendorOrg: 'ORG-TM',
    sites: ['YA', 'HN', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'VA', 'VB', 'VC', 'VD', 'VE', 'VF', 'VG'], menu: ['schedule', 'work', 'inbox'], home: 'schedule',
    labels: { schedule: '요청·견적', work: '작업·보고' },
    homeTabs: [],
    scope: '자사 후보 요청 견적 제출 · 일정 제안 · 업체 수락 · 작업 수행·보고',
  },
  master: {
    key: 'master', label: '마스터', org: '플랫폼 운영', orgType: '운영', user: '운영관리자', title: '플랫폼 운영', mark: 'M', vendorOrg: null,
    sites: ['YA', 'HN', 'SM', 'GH', 'TA', 'SA', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9', 'VA', 'VB', 'VC', 'VD', 'VE', 'VF', 'VG', 'VH', 'VI'], menu: ['home', 'drone', 'panels', 'schedule', 'work', 'inbox', 'settings'], home: 'home',
    labels: { home: '예외 업무', settings: '조직·권한' },
    homeTabs: ['tasks', 'power', 'detail', 'alarms'],
    scope: '모든 화면·행동 가능 · 담당자 배정 · 기술 검토(판정 수정) · 예외 개입 · 대행 승인',
  },
};
const pageLabel = (role, p) => (role.labels && role.labels[p]) || SCREENS[p].label;

/* 기능 × 역할 권한표 (명세 4장) */
const ACT = {
  assign: ['master'],
  inspReq: ['owner', 'master'],
  upload: ['drone', 'master'],
  droneRun: ['drone', 'master'],
  review: ['master'],
  workReq: ['owner', 'master'],
  reqEdit: ['owner', 'master'],
  quote: ['maint', 'master'],
  slot: ['owner', 'maint', 'master'],
  accept: ['owner', 'master'],
  vAccept: ['maint', 'master'],
  change: ['owner', 'maint', 'master'],
  workDo: ['maint', 'master'],
  inspect: ['owner', 'master'],
  alarmAck: ['owner', 'master'],
  alarmClear: ['master'],
};
const canDo = (role, a) => !!ACT[a] && ACT[a].includes(role);
const SET_EDIT = { '발전소·패널': ['owner', 'master'], '조직·계정': ['master'], '업체·자원': ['maint', 'master'], '위임·승인': ['owner', 'master'], '운영 규칙': ['master'] };
const HOME_TABS = { tasks: '업무 현황', power: '발전 현황', detail: '설비 상세', alarms: '알람' };

function RoleSelect({ now, unit, onEnter, last, alarms, tasks, ops }) {
  const icons = {
    owner: <><path d="M4 17 7 6h14l3 11H4Z M6 12h16 M12 6l-1 11 M17 6l1 11 M14 17v5 M9 22h10" /></>,
    regional: <><path d="m4 7 7-3 7 3 6-3v17l-6 3-7-3-7 3V7Z M11 4v17 M18 7v17" /></>,
    drone: <><circle cx="14" cy="14" r="4"/><circle cx="5" cy="5" r="3"/><circle cx="23" cy="5" r="3"/><circle cx="5" cy="23" r="3"/><circle cx="23" cy="23" r="3"/><path d="m7 7 4 4 m6 6 4 4 M21 7l-4 4 M11 17l-4 4"/></>,
    maint: <><path d="M24 5a7 7 0 0 1-9 9L6 23a3 3 0 0 1-4-4l9-9a7 7 0 0 1 9-9l-5 5 5 4 4-5Z" /></>,
    master: <><path d="m14 2 10 4v7c0 6-10 13-10 13S4 19 4 13V6l10-4Z M9 13l3 3 7-7" /></>,
  };
  return (
    <main className="access-home">
      <div className="access-shell">
        <div className="access-grid" aria-label="접속 사용자 유형">
          {Object.values(ROLES).map((x) => <button key={x.key} type="button" className="access-card rs-card" aria-label={`${x.label}로 접속`} onClick={() => onEnter(x.key, x.home)}>
            <span className="access-card-top" aria-hidden="true"><span className="access-orbit" /><span className="access-icon"><svg viewBox="0 0 28 28" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">{icons[x.key]}</svg></span><span className="access-corner" /></span>
            <span className="access-card-bottom"><span className="access-title">{x.label}</span><span className="access-arrow" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14m-6-6 6 6-6 6" /></svg></span></span>
          </button>)}
        </div>
      </div>
    </main>
  );
}

Object.assign(window, { SCREENS, PAGES, ROLES, ACT, canDo, SET_EDIT, HOME_TABS, RoleSelect, pageLabel });
