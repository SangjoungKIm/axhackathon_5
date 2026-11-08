/* 홈 · 업무 현황 (명세 3.1 — 요약 띠 · 목록 6건 페이지 · 상세 · 하단 행동) + 점검 요청 양식 · 담당자 배정 */
const TASKS_INIT = [
  { id: 'T-1044', site: 'YA', kind: '고장 조치', title: 'INV-17 지락 고장 조치', stage: '진행', assignee: 'maint', assigneeLabel: '태양정비 정비 2팀', next: '절연저항(IR) 측정으로 지락 스트링 특정', due: '11-07 17:00', approver: '김서연', reviewer: '운영관리자', link: { screen: 'home', tab: 'detail', site: 'YA', inv: 'YA-17' },
    changes: [['11:58', '태양정비 정비 2팀 현장 출동'], ['11:47', '알람 확인(ACK) · 운영관리자'], ['11:42', 'INV-F012 지락 검출 · 인버터 정지']], roles: ['owner', 'maint', 'regional', 'master'] },
  { id: 'T-1047', site: 'HN', kind: '데이터', title: '전력 수신 누락 구간 처리방침 기록', stage: '검토 대기', assignee: 'master', assigneeLabel: '운영관리자', next: '누락 20분 미적산 유지 또는 재수신 요청 결정', due: '11-07 14:00', approver: '-', reviewer: '운영관리자', link: { screen: 'home', tab: 'power' },
    changes: [['12:12', '수신 재개 · 누락 20분 미적산 처리'], ['12:00', 'DAT-W001 수신 누락 감지']], roles: ['owner', 'master'] },
  { id: 'T-1046', site: 'SM', kind: '고장 조치', title: 'RTU 통신 두절 복구', stage: '진행', assignee: 'master', assigneeLabel: '운영관리자', next: '현장 RTU 전원·LTE 모듈 재기동 결과 확인', due: '11-07 15:00', approver: '-', reviewer: '운영관리자', link: { screen: 'home', tab: 'alarms' },
    changes: [['12:52', '현장팀 출동'], ['12:44', 'COM-W004 통신 두절 발생']], roles: ['master'] },
  { id: 'T-1048', site: 'YA', kind: '점검', title: 'INV-09 출력 제한(70%) 원인 점검', stage: '담당 배정', assignee: null, assigneeLabel: '미배정', next: '정비 담당자 배정 (인계 대상: 플랫폼 운영)', due: '11-07 18:00', approver: '김서연', reviewer: '-', link: { screen: 'home', tab: 'detail', site: 'YA', inv: 'YA-09' },
    changes: [['12:31', 'INV-W118 디레이팅 운전 전환']], roles: ['owner', 'master'] },
  { id: 'T-1045', site: 'HN', kind: '승인', title: 'INV-06 스트링 14~17 점검·세척 최종 수락 (REQ-0515)', stage: '최종 확인', assignee: 'owner', assigneeLabel: '김서연 (승인자)', next: '업체 수락 완료 — 견적·일정 확인 후 수락', due: '11-08 18:00', approver: '김서연', reviewer: '운영관리자', link: { screen: 'schedule', id: 'REQ-0515' },
    changes: [['12:40', '태양정비 업체 수락 (견적 v1 · 11-09 09:00~13:00)'], ['11:02', '운영관리자 요청 생성 (스트링 4개)']], roles: ['owner', 'maint', 'master'] },
  { id: 'T-1041', site: 'YA', kind: '승인', title: '3회차 세척·정비 범위 승인 (REQ-0512)', stage: '업체·견적', assignee: 'owner', assigneeLabel: '김서연 (승인자)', next: '견적 비교 후 업체 선택 · 일정 선택', due: '11-08 18:00', approver: '김서연', reviewer: '운영관리자', link: { screen: 'schedule', id: 'REQ-0512' },
    changes: [['10:20', '클린PV 견적 v1 제출'], ['11-06 17:40', '태양정비 “현장 확인 후 견적” 응답'], ['11-06 11:02', '운영관리자 요청 생성 (패널 9개)']], roles: ['owner', 'maint', 'master'] },
  { id: 'T-1049', site: 'YA', kind: '검수', title: 'INV-05 STR-12 퓨즈 교체 검수 (WO-2091)', stage: '검수 대기', assignee: 'owner', assigneeLabel: '김서연 (검수자)', next: '항목별 승인 또는 보완 요청 — 계측 전류 확인', due: '11-08 12:00', approver: '김서연', reviewer: '김서연', link: { screen: 'work', id: 'WO-2091' },
    changes: [['12:20', '태양정비 완료 보고 · 증빙 전·후 각 1장'], ['10:05', '작업 시작 보고']], roles: ['owner', 'maint', 'master'] },
  { id: 'T-1035', site: 'YA', kind: '검수', title: '2회차 파손 패널 정비 검수 (WO-2075)', stage: '검수 대기', assignee: 'owner', assigneeLabel: '김서연 (검수자)', next: '항목별 승인 · 추가 작업 변경 승인', due: '11-08 12:00', approver: '김서연', reviewer: '김서연', link: { screen: 'work', id: 'WO-2075' },
    changes: [['11-06 16:30', '태양정비 완료 보고 (B12) · E04 보류'], ['11-06 14:00', '추가 작업 변경 요청 +35,000원']], roles: ['owner', 'maint', 'master'] },
  { id: 'T-1038', site: 'YA', kind: '작업', title: 'A·B구역 세척 작업 (WO-2088)', stage: '진행', assignee: 'vendor', assigneeLabel: '클린PV 1팀', next: 'B구역 항목별 완료 보고', due: '11-07 18:00', approver: '김서연', reviewer: '김서연', link: { screen: 'work', id: 'WO-2088' },
    changes: [['10:55', 'A구역 완료 보고 · 증빙 2장'], ['09:02', '작업 시작 보고']], roles: ['owner', 'master'] },
  { id: 'T-1050', site: 'HN', kind: '작업', title: 'B구역 정기 세척 (WO-2094)', stage: '예정', assignee: 'maint', assigneeLabel: '태양정비 2팀', next: '14:00 작업 시작 보고', due: '11-07 14:00', approver: '김서연', reviewer: '김서연', link: { screen: 'work', id: 'WO-2094' },
    changes: [['11-05 15:20', '일정 확정 11-07 14:00~17:00']], roles: ['owner', 'maint', 'master'] },
  { id: 'T-1042', site: 'HN', kind: '점검', title: '1회차 드론 점검 촬영 (INS-2026-033)', stage: '촬영', assignee: 'drone', assigneeLabel: '최민재 (드론 운영자)', next: '촬영 시뮬레이션 진행 · 실패 동작 복구', due: '11-07 17:00', approver: '운영관리자', reviewer: '운영관리자', link: { screen: 'drone', id: 'INS-2026-033' },
    changes: [['11:05', '경로 v2 검토 완료 (최민재)'], ['10:50', '탐지 48 / 미연결 0']], roles: ['owner', 'drone', 'master'] },
  { id: 'T-1040', site: 'YA', kind: '검토', title: '3회차 오염 판정 기술 검토 (INS-2026-031)', stage: '진행', assignee: 'master', assigneeLabel: '운영관리자 (기술 검토자)', next: '미검토 관측 3건 확인', due: '11-07 11:00', approver: '-', reviewer: '운영관리자', link: { screen: 'panels', ins: 'INS-2026-031' },
    changes: [['11-06 09:30', 'E11 판정 수정 (오염 → 외관 정상)'], ['11-05 13:20', '분석 완료 70/72']], roles: ['master'] },
  { id: 'T-1043', site: 'SM', kind: '점검', title: '준공 후 첫 점검 · 담당 배정 (INS-2026-034)', stage: '담당 배정', assignee: null, assigneeLabel: '미배정', next: '드론 수행자 배정 (인계 대상: 운영 담당자)', due: '11-09 18:00', approver: '운영관리자', reviewer: '-', link: { screen: 'drone', id: 'INS-2026-034' },
    changes: [['11-06 18:20', '점검 요청 접수 · 담당 미배정']], roles: ['drone', 'master'] },
  { id: 'T-1053', site: 'YA', kind: '요청', title: '미조치 현황 공유 요청', stage: '상대 응답 대기', assignee: 'owner', assigneeLabel: '김서연', next: '지역관리자 요청에 공유 범위 응답', due: '11-10 18:00', approver: '김서연', reviewer: '-', link: null,
    changes: [['11-05 15:00', '에너지센터 요청 발송']], roles: ['owner', 'regional', 'master'] },
  { id: 'T-1055', site: 'SM', kind: '예외', title: '비용 승인자 부재 — 승인 담당 미지정', stage: '담당 배정', assignee: null, assigneeLabel: '미배정', next: '권한 있는 관리자 재지정 후 정상 담당자에게 반환', due: '11-07 12:00', approver: '미지정', reviewer: '-', link: { screen: 'settings', group: '위임·승인' },
    changes: [['11-06 18:00', '승인자 위임 만료 (11-06)']], roles: ['master'] },
  { id: 'T-1033', site: 'HN', kind: '작업', title: '전체 세척 작업 (WO-2061)', stage: '종료', assignee: null, assigneeLabel: '-', next: '-', due: null, approver: '김서연', reviewer: '김서연', link: { screen: 'work', id: 'WO-2061' },
    changes: [['10-22 10:00', '검수 승인 (4/4 구역)'], ['10-21 17:30', '완료 보고']], roles: ['owner', 'maint', 'master'] },
];
const STAGE_FLOW = ['접수', '담당 배정', '진행·조율', '검수 대기', '종료'];
const stageIdx = (s) => (s === '담당 배정' ? 1 : s === '검수 대기' ? 3 : s === '종료' ? 4 : 2);
const dueMin = (d) => (d && d.startsWith('11-07') ? parseInt(d.slice(6, 8), 10) * 60 + parseInt(d.slice(9, 11), 10) : null);
const isOver = (t, now) => t.stage !== '종료' && dueMin(t.due) != null && dueMin(t.due) < now;
const siteName = (id) => (SIM.SITES.find((s) => s.id === id) || { name: id }).name;

const PEOPLE = {
  drone: [['drone', '최민재 (스카이뷰드론)']],
  other: [['maint', '태양정비 정비 2팀'], ['owner', '김서연 (한빛솔라)'], ['master', '운영관리자 (플랫폼 운영)']],
};

function AssignModal({ task, onClose, onSave }) {
  const opts = task.kind === '점검' ? PEOPLE.drone : PEOPLE.other;
  const [who, setWho] = useState(opts[0][0]);
  const [why, setWhy] = useState('');
  const [err, setErr] = useState(null);
  return (
    <Modal title="담당자 배정" sub={task.id} onClose={onClose} actions={<><button className="btn" onClick={onClose}>취소</button><button className="btn pri" onClick={() => { if (!why.trim()) return setErr('변경 사유를 입력하세요'); onSave(who, opts.find((o) => o[0] === who)[1], why); }}>배정</button></>}>
      <div className="mini">{siteName(task.site)} · {task.title}</div>
      <Field label="현재 담당자"><div className="mono" style={{ color: task.assignee ? null : 'var(--warn)' }}>{task.assigneeLabel}</div></Field>
      <Field label={task.kind === '점검' ? '담당 수행자 (드론 수행자 후보)' : '새 담당자'} req>
        <select className="inp" value={who} onChange={(e) => setWho(e.target.value)}>{opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </Field>
      <Field label="변경 사유" req err={err}><textarea className="inp" value={why} onChange={(e) => { setWhy(e.target.value); setErr(null); }} placeholder="예: 현장 일정 확인 완료, 촬영 가능 인원 배정" /></Field>
      {task.kind === '점검' && <Note kind="info">점검 업무는 연결된 점검의 담당 수행자도 함께 갱신됩니다.</Note>}
    </Modal>
  );
}

function InspReqModal({ R, sites, draft, setDraft, onClose, onSubmit }) {
  const d = draft || { site: sites[0], purpose: '정기 외관 점검', from: '2026-11-12', to: '2026-11-14', note: '' };
  const [step, setStep] = useState(1);
  const set = (k, v) => setDraft({ ...d, [k]: v });
  const dateErr = d.to < d.from ? '종료일이 시작일보다 앞설 수 없습니다' : null;
  return (
    <Modal title="점검 요청" sub={`${step} / 2 · ${step === 1 ? '대상·목적' : '현장 일정·확인'}`} onClose={onClose} width={600}
      actions={step === 1 ? <><button className="btn" onClick={onClose}>닫기 (초안 보관)</button><button className="btn pri" disabled={!d.site} onClick={() => setStep(2)}>다음</button></>
        : <><button className="btn" onClick={() => setStep(1)}>이전</button><button className="btn pri" disabled={!!dateErr} onClick={() => onSubmit(d)}>요청 제출</button></>}>
      <Steps items={['대상·목적', '현장 일정·확인']} cur={step - 1} />
      {step === 1 ? (
        <>
          <Field label="발전소" req><select className="inp" value={d.site} onChange={(e) => set('site', e.target.value)}>{sites.map((s) => <option key={s} value={s}>{siteName(s)}</option>)}</select></Field>
          <Field label="점검 목적" req><select className="inp" value={d.purpose} onChange={(e) => set('purpose', e.target.value)}>{['정기 외관 점검', '준공 후 첫 점검', '작업 후 확인 점검', '민원·이상 신고 확인'].map((p) => <option key={p}>{p}</option>)}</select></Field>
          <Field label="요청자"><div>{R.user} · {R.org}</div></Field>
        </>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="희망 시작일" req><input type="date" className="inp" value={d.from} onChange={(e) => set('from', e.target.value)} /></Field>
            <Field label="희망 종료일" req err={dateErr}><input type="date" className="inp" value={d.to} onChange={(e) => set('to', e.target.value)} /></Field>
          </div>
          <Field label="현장 전달사항" hint="진입 경로 · 출입 연락 · 주의 구역"><textarea className="inp" value={d.note} onChange={(e) => set('note', e.target.value)} /></Field>
          <dl className="kv-list" style={{ background: 'var(--panel2)', padding: 12, borderRadius: 4 }}>
            <dt>발전소</dt><dd style={{ fontFamily: 'inherit' }}>{siteName(d.site)}</dd><dt>목적</dt><dd style={{ fontFamily: 'inherit' }}>{d.purpose}</dd><dt>희망 기간</dt><dd>{d.from} ~ {d.to}</dd>
          </dl>
          <Note kind="info">제출하면 점검(INS)과 “담당 배정” 업무가 생성됩니다. 담당 수행자는 마스터(플랫폼 운영)가 배정합니다.</Note>
        </>
      )}
    </Modal>
  );
}

function Tasks({ ctx }) {
  const { role, R, ops, upd, sites, now, go, can, params } = ctx;
  const mine = ops.tasks.filter((t) => t.roles.includes(role) && sites.includes(t.site));
  const bandsByRole = {
    regional: [['track', '조치 요청·응답 추적', (t) => t.stage !== '종료'], ['wait', '상대 응답 대기', (t) => t.stage === '상대 응답 대기'], ['prog', '전체 진행 업무', (t) => t.stage !== '종료' && t.stage !== '상대 응답 대기']],
    master: [['exc', '예외 업무 (미배정·기한 초과)', (t) => (!t.assignee || isOver(t, now)) && t.stage !== '종료'], ['all', '전체 진행', (t) => t.stage !== '종료'], ['review', '검수 대기', (t) => t.stage === '검수 대기'], ['done', '종료', (t) => t.stage === '종료']],
  };
  const bands = bandsByRole[role] || [
    ['mine', '내 처리 대기', (t) => t.assignee === role && t.stage !== '종료'],
    ['wait', '상대 응답 대기', (t) => t.stage !== '종료' && t.assignee !== role && (t.stage === '업체·견적' || t.stage === '상대 응답 대기' || t.stage === '최종 확인' || !t.assignee)],
    ['today', '오늘 예정', (t) => t.stage !== '종료' && t.due && t.due.startsWith('11-07')],
    ['review', '검수 대기', (t) => t.stage === '검수 대기'],
    ['all', '전체', (t) => true],
  ];
  const st = ctx.ui('tasks', { f: bands[0][0], page: 1, sel: null });
  const f = bands.find((b) => b[0] === st.f) ? st.f : bands[0][0];
  const fn = bands.find((b) => b[0] === f)[2];
  const list = mine.filter(fn).sort((a, b) => (isOver(b, now) - isOver(a, now)) || ((a.assignee === role ? 0 : 1) - (b.assignee === role ? 0 : 1)) || String(a.due).localeCompare(String(b.due)));
  const PER = 6;
  const page = Math.min(st.page, Math.max(1, Math.ceil(list.length / PER)));
  const rows = list.slice((page - 1) * PER, page * PER);
  const selId = params.task || st.sel;
  const cur = mine.find((t) => t.id === selId) || rows[0];
  const [modal, setModal] = useState(null);

  const open = () => {
    if (!cur) return;
    if (!cur.link) return go('inbox', { task: cur.id });
    const L = cur.link;
    if (L.screen === 'home') return go('home', { tab: L.tab, site: L.site, inv: L.inv });
    go(L.screen, L);
  };
  const target = cur && cur.link ? cur.link.screen : 'inbox';
  const assign = (who, label, why) => {
    upd((o) => {
      const t = o.tasks.find((x) => x.id === cur.id);
      t.assignee = who; t.assigneeLabel = label; if (t.stage === '담당 배정') t.stage = '진행';
      t.changes.unshift([hhmm(now), `${R.user} 담당 배정 → ${label} (사유: ${why})`]);
      if (t.link && t.link.screen === 'drone' && o.inspections[t.link.id]) { const ins = o.inspections[t.link.id]; ins.drone = '최민재'; if (ins.step === 0) { ins.stage = '자료 준비'; } ins.log.unshift([hhmm(now), 'inspection.assigned', `담당 수행자 최민재 배정 (${R.user})`]); t.next = '전경 이미지 등록 · 탐지 실행'; }
    });
    ctx.flash(`${cur.id} 담당자 배정 완료 → ${label}`);
    setModal(null);
  };

  return (
    <div className="pgrid" style={{ gridTemplateColumns: '1fr 600px', gridTemplateRows: 'auto minmax(0,1fr)' }}>
      <div className="band" style={{ gridColumn: '1 / -1', gridTemplateColumns: `repeat(${bands.length}, 1fr)` }}>
        {bands.map(([k, l, fn2]) => {
          const n = mine.filter(fn2).length;
          return <button key={k} className={f === k ? 'on' : ''} onClick={() => ctx.setUi('tasks', { f: k, page: 1 })}><label>{l}</label><b className={(k === 'exc' || k === 'mine') && n ? '' : ''}>{n}<small>건</small></b></button>;
        })}
      </div>

      <section className="panel">
        <header className="ph"><h3>업무 목록</h3><span className="ph-sub">{bands.find((b) => b[0] === f)[1]} · {list.length}건</span>
          <div className="ph-r"><Pager page={page} total={list.length} per={PER} onPage={(p) => ctx.setUi('tasks', { page: p })} /></div></header>
        <div className="pb" style={{ paddingTop: 8 }}>
          <table className="t">
            <thead><tr><th>발전소</th><th>업무</th><th>단계</th><th>현재 담당자</th><th>다음 행동</th><th className="r">기한</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} className={cur && t.id === cur.id ? 'sel' : ''} onClick={() => ctx.setUi('tasks', { sel: t.id })} style={{ height: 56 }}>
                  <td style={{ height: 56 }}>{siteName(t.site)}</td>
                  <td style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}><div style={{ fontWeight: t.assignee === role ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div><div className="mini mono">{t.id}</div></td>
                  <td><span className="stagepill">{t.stage}</span></td>
                  <td style={{ color: t.assignee ? (t.assignee === role ? 'var(--solar)' : null) : 'var(--warn)' }}>{t.assignee === role ? '나 · ' : ''}{t.assigneeLabel}</td>
                  <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--tx2)' }}>{t.next}</td>
                  <td className={'r num ' + (isOver(t, now) ? 'over' : '')}>{isOver(t, now) ? '⏱ ' : ''}{t.due || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <div className="empty" style={{ height: 240 }}>처리할 업무가 없습니다</div>}
          {role === 'regional' && <div className="mini" style={{ marginTop: 12 }}>집계 범위: 공유 승인 발전소 {R.shared.length}개 ({R.shared.map(siteName).join(', ')}) · 공유되지 않은 발전소는 지역 전체 모집단으로 표시하지 않습니다</div>}
        </div>
        <div className="actbar">
          {cur ? <span className="sel-t">선택 <b className="mono">{cur.id}</b> · {siteName(cur.site)} · {cur.title}</span> : <span className="sel-t">선택된 업무 없음</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flex: 'none' }}>
            {canDo(role, 'inspReq') && <button className="btn" onClick={() => setModal('insp')}>점검 요청{ctx.drafts.inspection ? ' (초안)' : ''}</button>}
            {canDo(role, 'assign') && cur && cur.stage !== '종료' && <button className="btn" onClick={() => setModal('assign')}>담당자 배정</button>}
            <button className="btn pri" disabled={!cur || !can(target)} title={cur && !can(target) ? '권한 없음' : null} onClick={open}>{cur && !can(target) ? '권한 없음' : '업무 처리 →'}</button>
          </div>
        </div>
      </section>

      {cur ? (
        <Panel title="업무 상세" sub={cur.id} right={<span className="stagepill">{cur.kind}</span>} bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="mini">{siteName(cur.site)} · {(SIM.SITES.find((x) => x.id === cur.site) || {}).region}</div>
            <h2 style={{ fontSize: 'calc(19px * var(--text-scale, 1))', fontWeight: 600, lineHeight: 1.35, marginTop: 4, textWrap: 'pretty' }}>{cur.title}</h2>
          </div>
          <div className="flowline">{STAGE_FLOW.map((s2, i) => <span key={s2} className={i < stageIdx(cur.stage) ? 'done' : i === stageIdx(cur.stage) ? 'cur' : ''}>{i === stageIdx(cur.stage) && i === 2 ? cur.stage : s2}</span>)}</div>
          {isOver(cur, now) && <Note kind="crit">기한 경과 — {cur.due} 기한이 지났으나 종료되지 않았습니다</Note>}
          {!cur.assignee && cur.stage !== '종료' && <Note kind="warn">미배정 — 현재 담당자가 없어 업무가 멈춰 있습니다{canDo(role, 'assign') ? '' : ' (배정 권한: 마스터)'}</Note>}
          <div className="statbox" style={{ gridTemplateColumns: '1fr' }}>
            <div><label>다음 행동</label><b style={{ fontSize: 'calc(15px * var(--text-scale, 1))', fontFamily: 'IBM Plex Sans KR', fontWeight: 600 }}>{cur.next}</b></div>
          </div>
          <dl className="kv-list">
            <dt>현재 담당자</dt><dd style={{ fontFamily: 'inherit', color: cur.assignee ? null : 'var(--warn)' }}>{cur.assigneeLabel}</dd>
            <dt>기한</dt><dd className={isOver(cur, now) ? 'over' : ''}>{cur.due ? '2026-' + cur.due : '—'}</dd>
            <dt>승인자</dt><dd style={{ fontFamily: 'inherit', color: cur.approver === '미지정' ? 'var(--crit)' : null }}>{cur.approver}</dd>
            <dt>검토자</dt><dd style={{ fontFamily: 'inherit' }}>{cur.reviewer}</dd>
          </dl>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <div className="mini" style={{ marginBottom: 4 }}>최근 변경</div>
            {cur.changes.slice(0, 5).map((c, i) => <div key={i} className="chg"><span className="mono">{c[0]}</span><span>{c[1]}</span></div>)}
          </div>
        </Panel>
      ) : <Panel title="업무 상세"><div className="empty">업무를 선택하세요</div></Panel>}

      {modal === 'assign' && cur && <AssignModal task={cur} onClose={() => setModal(null)} onSave={assign} />}
      {modal === 'insp' && <InspReqModal R={R} sites={sites} draft={ctx.drafts.inspection} setDraft={(d) => ctx.setDrafts({ ...ctx.drafts, inspection: d })} onClose={() => setModal(null)} onSubmit={(d) => { ctx.submitInspection(d); setModal(null); }} />}
    </div>
  );
}

Object.assign(window, { Tasks, TASKS_INIT, isOver, siteName, InspReqModal, AssignModal });
