/* 추가형 시연 자료. 호출 계약: AXDemo.expand(ops) → 같은 객체.
 * 실제 업로드·분석·전사 좌표 슬롯에는 쓰지 않는다. 앱 시작/복원 연결은 호출자 소유.
 * text/babel로 tasks.jsx·roles.jsx 뒤에 순차 실행한다. */
(function () {
  'use strict';
  const SOURCE = '가상 시연 자료', AT = '시연 2026-11-07 10:00';
  const mark = (value) => Object.assign(value, { dataMode: 'demo', simulated: true, source: SOURCE });
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const rolesFor = (site, candidates) => candidates.filter((key) => window.ROLES[key].sites.includes(site));

  function expandV1(ops) {
    if (!ops || typeof ops !== 'object' || Array.isArray(ops)) throw new TypeError('AXDemo.expand: 운영 객체가 필요합니다');
    // 잘못된 기존 컬렉션은 교체하지 않고 명시적으로 거부한다.
    for (const key of ['inspections', 'obs', 'requests', 'workOrders']) {
      if (ops[key] !== undefined && (!ops[key] || typeof ops[key] !== 'object' || Array.isArray(ops[key]))) throw new TypeError('AXDemo.expand: ' + key + ' 형식을 확인하세요');
    }
    for (const key of ['tasks', 'notifications']) if (ops[key] !== undefined && !Array.isArray(ops[key])) throw new TypeError('AXDemo.expand: ' + key + ' 배열이 필요합니다');
    if (!window.SIM || !window.OPS || !window.ROLES || !Array.isArray(window.TASKS_INIT)) throw new Error('SIM·OPS·ROLES·TASKS_INIT 로드 후 호출하세요');
    for (const key of ['inspections', 'obs', 'requests', 'workOrders']) if (ops[key] === undefined) ops[key] = {};
    // 기존 업무 배열은 그대로 둔다. 없는 경우에만 기존 초기 업무를 복사한다.
    if (ops.tasks === undefined) ops.tasks = JSON.parse(JSON.stringify(window.TASKS_INIT));
    if (ops.notifications === undefined) ops.notifications = [];

    window.SIM.SITES.filter((s) => s.simulated && /^가상[ -]/.test(s.name)).forEach((site, index) => {
      const demoKey = 'AXDemo-v1-' + site.id;
      // 예약 ID에 실자료가 있으면 가족 전체에 같은 결정적 접미사를 쓴다.
      // demoKey는 사용자가 수정한 시연 레코드도 식별하여 재생성/덮어쓰기를 막는다.
      let ids;
      for (let n = 0; ; n++) {
        const suffix = site.id + (n ? '-' + n : '');
        ids = { pending: 'INS-DEMO-' + suffix + '-OPEN', sample: 'INS-DEMO-' + suffix + '-SAMPLE', request: 'REQ-DEMO-' + suffix, work: 'WO-DEMO-' + suffix,
          droneTask: 'T-DEMO-' + suffix + '-DRONE', requestTask: 'T-DEMO-' + suffix + '-REQ', workTask: 'T-DEMO-' + suffix + '-WORK', trackTask: 'T-DEMO-' + suffix + '-TRACK',
          droneNotice: 'N-DEMO-' + suffix + '-DRONE', workNotice: 'N-DEMO-' + suffix + '-WORK', trackNotice: 'N-DEMO-' + suffix + '-TRACK' };
        const occupied = (table, id) => own(table, id) && table[id]?.demoKey !== demoKey;
        const arrayOccupied = (array, id) => array.some((x) => x.id === id && x.demoKey !== demoKey);
        if (occupied(ops.inspections, ids.pending) || occupied(ops.inspections, ids.sample) || occupied(ops.requests, ids.request) || occupied(ops.workOrders, ids.work)) continue;
        if ((own(ops.obs, ids.sample) && !own(ops.inspections, ids.sample)) || (own(ops.obs, ids.pending) && !own(ops.inspections, ids.pending))) continue;
        if (['droneTask', 'requestTask', 'workTask', 'trackTask'].some((key) => arrayOccupied(ops.tasks, ids[key]))) continue;
        if (['droneNotice', 'workNotice', 'trackNotice'].some((key) => arrayOccupied(ops.notifications, ids[key]))) continue;
        break;
      }
      const record = (value) => mark(Object.assign(value, { demoKey }));
      const add = (table, value) => { if (!own(table, value.id)) table[value.id] = value; };
      const append = (array, value) => { if (!array.some((x) => x.id === value.id)) array.push(value); };
      const zones = index % 3 === 0 ? ['A', 'B', 'C', 'D'] : ['A', 'B'];
      const rows = 2, cols = 6, panels = window.OPS.layout(zones, rows, cols);
      const inv = site.invs[index % site.inv].id;
      const approver = window.ROLES.owner.sites.includes(site.id) ? '김서연' : '운영관리자';
      const baseInspection = () => record({ site: site.id, inv, zones: [...zones], rows, cols, aircraft: '가상 RGB 기체', image: null,
        target: '가상 ' + inv + ' 어레이 ' + zones.join('·') + '구역', wish: '2026-11-09 ~ 2026-11-14',
        note: '가상 시연 자료 · 실제 촬영·비행·외부 분석 결과가 아닙니다', reviewer: null });
      add(ops.inspections, Object.assign(baseInspection(), { id: ids.pending, round: 2, purpose: '가상 신규 점검 · 담당 배정',
        step: 0, stage: '담당 배정', drone: null, shotAt: null, detect: null, route: null, files: null, handed: null,
        shoot: mark({ total: panels.length / 3, done: 0, fail: [], running: false, finished: false }),
        log: [[AT, 'demo.inspection.requested', '가상 점검 요청 · 담당 미배정 · 실제 자료 미등록']] }));

      const sampleObs = {};
      panels.forEach((id, i) => {
        const j = i === 2 || i === 3 ? 'soil' : i === 11 ? 'dmg' : i === panels.length - 1 ? 'und' : 'ok';
        sampleObs[id] = record({ id, ai: j, j,
          soilType: j === 'soil' ? ['먼지·황사', '조류 분변', '낙엽'][index % 3] : null,
          dmgPos: j === 'dmg' ? '가상 셀 균열 (우하단)' : null, undReason: j === 'und' ? '가상 분석 실패' : null,
          review: j === 'und' || i === 3 ? '미검토' : '확인 완료',
          reviewer: j === 'und' || i === 3 ? null : '운영관리자', reviewedAt: j === 'und' || i === 3 ? null : AT,
          reason: '가상 시연 판정 · 실제 이미지 근거 없음', work: '요청 없음',
          img: j === 'und' ? null : 'IMG-DEMO-' + site.id + '-' + id,
          str: 'STR-' + String(1 + Math.floor(i * 20 / panels.length)).padStart(2, '0') });
      });
      const files = Object.fromEntries(zones.map((z) => {
        const fail = z === zones[zones.length - 1] ? 1 : 0;
        return [z, [rows * cols, rows * cols, rows * cols - fail, fail]];
      }));
      add(ops.inspections, Object.assign(baseInspection(), { id: ids.sample, round: 1, purpose: '가상 판정 완료 표본',
        step: 3, stage: '시연 분류 완료 · 원본 없음', drone: '최민재', shotAt: AT,
        detect: mark({ n: panels.length, unlinked: 0 }), route: null,
        shoot: mark({ total: panels.length / 3, done: panels.length / 3, fail: [], running: false, finished: true }), files,
        handed: mark({ to: '운영관리자', at: AT, policy: '가상 표본 인계 · 실제 촬영·분석·증빙 아님' }), reviewer: '운영관리자',
        log: [[AT, 'demo.sample.seeded', '가상 표본 분류·인계 · 미판정 1개 · 실제 이미지/좌표/분석 없음']] }));
      const sample = ops.inspections[ids.sample];
      if (!own(ops.obs, ids.sample) && sample.demoKey === demoKey && sample.dataMode === 'demo' && !sample.panorama && !sample.analysis && !sample.droneFlow && !sample.assets) ops.obs[ids.sample] = sampleObs;

      const phase = index % 4 + 1;
      const vendors = ['ORG-TM', 'ORG-CP'].map((org, i) => record({ org, service: i ? '세척' : '정비·세척', team: i ? '가상 세척팀' : '가상 정비팀',
        response: phase === 1 ? '응답 대기' : '견적 제출',
        quote: phase === 1 ? null : mark({ version: 1, items: [['가상 패널 작업', i ? 2 : 3, i ? 18000 : 45000], ['가상 출장비', 1, 60000]], tax: '별도', valid: '2026-11-14', hours: '3시간 (가상)' }),
        slots: [['11-09', 9, 12], ['11-11', 13, 16]], accept: phase === 4 && !i ? '수락' : '대기' }));
      add(ops.requests, record({ id: ids.request, site: site.id, inspection: ids.sample, step: phase,
        requester: '운영관리자', approver, assignee: phase === 2 && window.ROLES.maint.sites.includes(site.id) ? '정우성' : approver, due: '11-08 18:00',
        panels: { soil: ['A03', 'A04'], dmg: ['A12'] }, services: ['세척', '정비'],
        note: '가상 견적·일정 비교용 · 실제 작업 의뢰 아님', wish: '2026-11-09 ~ 2026-11-14', excluded: panels[panels.length - 1] + ' 가상 미판정',
        vendors, selected: phase >= 2 ? { 'ORG-TM': true } : {}, schedule: phase >= 3 ? { 'ORG-TM': ['11-09', 9, 12] } : {},
        reqAccept: '대기', proposalDue: phase >= 2 ? '11-08 18:00' : null, hold: phase === 4 ? '11-08 18:00' : null,
        changes: [[AT, '가상 요청 생성 · 단계 ' + phase + ' · 금액·일정은 합성값']] }));
      // 진행 중 요청과 이미 발행된 작업을 허위 연결하지 않는다. 작업은 독립 표본이다.
      const vendor = index % 5 === 4 ? 'ORG-CP' : 'ORG-TM';
      const state = ['예정', '진행', '검수 대기', '완료'][index % 4];
      const itemState = ['todo', 'progress', 'done', 'approved'][index % 4];
      const targets = vendor === 'ORG-CP' ? ['A03', 'A04'] : ['A03', 'A04', 'A12'];
      add(ops.workOrders, record({ id: ids.work, site: site.id, service: vendor === 'ORG-CP' ? '세척' : '정비·세척', vendor,
        team: window.OPS.ORGS[vendor].name + ' 가상팀', state, schedule: '2026-11-07 14:00~17:00 (시연)',
        approver, reviewer: approver, quoteVersion: 'v1 (가상)', issuedAt: AT, inspection: ids.sample,
        next: ['가상 작업 시작 보고', '가상 항목별 완료 보고', '가상 항목별 검수', '-'][index % 4],
        scope: '가상 표본 ' + targets.length + '패널', note: '독립 시연 작업 · 실제 발주/사진 아님 · 현재 요청과 별개', targets,
        items: targets.map((id) => record({ id, label: id + ' 가상 작업', state: itemState,
          reportedAt: index % 4 >= 2 ? AT : null, ev: mark({ before: index % 4 ? 1 : 0, after: index % 4 >= 2 ? 1 : 0 }),
          result: index % 4 >= 2 ? '가상 완료 보고 · 실제 증빙 없음' : '가상 작업 대기', material: '가상 자재', review: itemState === 'approved' ? '시연 승인' : null })),
        cost: mark({ base: targets.length * 45000 + 60000, extra: 0, tax: '별도' }) }));

      const task = (id, kind, title, stage, assignee, next, link, candidates) => {
        if (assignee && (!candidates.includes(assignee) || !window.ROLES[assignee].sites.includes(site.id))) assignee = 'master';
        return record({ id, site: site.id, kind, title: '가상 ' + title,
        stage, assignee, assigneeLabel: assignee ? window.ROLES[assignee].user : '미배정', next,
        due: '11-08 18:00', approver, reviewer: '운영관리자', link,
        changes: [[AT, SOURCE + ' 생성 · 실제 업무 아님']], roles: rolesFor(site.id, candidates) });
      };
      append(ops.tasks, task(ids.droneTask, '점검', '신규 점검 담당 배정', '담당 배정', null, '드론 수행자 배정 · 실제 원본 등록', { screen: 'drone', id: ids.pending }, ['owner', 'drone', 'master']));
      append(ops.tasks, task(ids.requestTask, '승인', '견적·일정 요청 검토', ['요청 범위', '업체·견적', '일정', '최종 확인'][phase - 1], phase === 2 ? 'maint' : 'owner', '가상 요청 범위·업체 응답 확인', { screen: 'schedule', id: ids.request }, ['owner', 'maint', 'master']));
      append(ops.tasks, task(ids.workTask, '작업', '표본 작업·검수', state === '완료' ? '종료' : state, state === '완료' ? null : state === '검수 대기' ? 'owner' : 'maint', '가상 작업 수행 기록·검수 확인', { screen: 'work', id: ids.work }, vendor === 'ORG-TM' ? ['owner', 'maint', 'master'] : ['owner', 'master']));
      append(ops.tasks, task(ids.trackTask, '요청', '지역 조치 현황 응답 추적', '상대 응답 대기', 'master', '가상 공유 승인 범위 내에서 현황 확인', { screen: 'inbox', task: ids.trackTask }, ['regional', 'master']));
      const notice = (id, taskId, cause, candidates) => record({ id, site: site.id, at: AT, cause: '가상 ' + site.name.replace(/^가상[ -]/, '') + ' · ' + cause,
        task: taskId, who: '시연 담당자', next: '관련 가상 업무 확인', unread: true, roles: rolesFor(site.id, candidates) });
      append(ops.notifications, notice(ids.droneNotice, ids.droneTask, '점검 담당 미배정', ['owner', 'drone', 'master']));
      append(ops.notifications, notice(ids.workNotice, ids.workTask, '작업 상태 ' + state, vendor === 'ORG-TM' ? ['owner', 'maint', 'master'] : ['owner', 'master']));
      append(ops.notifications, notice(ids.trackNotice, ids.trackTask, '지역 조치 현황 응답 대기', ['regional', 'master']));
    });
    ops.demoVersion = 1;
    return ops;
  }
  // V1은 변경하지 않는다. V2는 별도 ID 가족만 추가하고 기존 항목은 단 한 번도 수정하지 않는다.
  function expand(ops) {
    if (!ops || typeof ops !== 'object' || Array.isArray(ops)) throw new TypeError('운영 객체가 필요합니다');
    for (const k of ['inspections', 'obs', 'requests', 'workOrders']) if (ops[k] !== undefined && (!ops[k] || typeof ops[k] !== 'object' || Array.isArray(ops[k]))) throw new TypeError(k + ' 객체가 필요합니다');
    for (const k of ['tasks', 'notifications']) if (ops[k] !== undefined && !Array.isArray(ops[k])) throw new TypeError(k + ' 배열이 필요합니다');
    if (!window.SIM?.DEMO_CASES || !window.OPS || !window.ROLES) throw new Error('SIM·OPS·ROLES 로드 후 호출하세요');
    if (!ops.demoVersion) expandV1(ops);
    for (const k of ['inspections', 'obs', 'requests', 'workOrders']) if (ops[k] === undefined) ops[k] = {};
    if (ops.tasks === undefined) ops.tasks = JSON.parse(JSON.stringify(window.TASKS_INIT));
    if (ops.notifications === undefined) ops.notifications = [];
    // 처리/보호 이력을 저장하므로 삭제하거나 실제 자료로 전환한 가족을 다시 채우지 않는다.
    if (ops.demoV2Migration !== undefined && (!ops.demoV2Migration || typeof ops.demoV2Migration !== 'object' || Array.isArray(ops.demoV2Migration))) throw new TypeError('demoV2Migration 객체가 필요합니다');
    if (!ops.demoV2Migration) ops.demoV2Migration = {};
    window.SIM.DEMO_CASES.forEach((c, index) => {
      if (own(ops.demoV2Migration, c.site)) return;
      const suffix = 'CASE2-' + c.site;
      const ids = { current: 'INS-' + suffix, historic: 'INS-' + suffix + '-HISTORY', request: 'REQ-' + suffix,
        pastRequest: 'REQ-' + suffix + '-HISTORY', work: 'WO-' + suffix, pastWork: 'WO-' + suffix + '-HISTORY' };
      const links = [ ['DRONE', 'drone', ids.current, ['owner', 'drone', 'master']],
        ['REQ', 'schedule', ids.request, ['owner', 'maint', 'master']],
        ['WORK', 'work', ids.work, ['owner', 'maint', 'master']],
        ['TRACK', 'inbox', null, ['regional', 'master']] ];
      const taskId = (kind) => 'T-' + suffix + '-' + kind;
      const noticeId = (kind) => 'N-' + suffix + '-' + kind;
      const collisions = [['inspections', ids.current], ['inspections', ids.historic], ['obs', ids.current], ['obs', ids.historic],
        ['requests', ids.request], ['requests', ids.pastRequest], ['workOrders', ids.work], ['workOrders', ids.pastWork]];
      if (collisions.some(([table, id]) => own(ops[table], id)) || links.some(([kind]) => ops.tasks.some((t) => t.id === taskId(kind)) || ops.notifications.some((n) => n.id === noticeId(kind)))) {
        ops.demoV2Migration[c.site] = 'protected'; return;
      }
      const record = (v) => mark(Object.assign(v, { demoKey: 'AXDemo-v2-' + c.site, demoCase: c.key, caseLabel: c.label, sourceKind: 'synth' }));
      const site = window.SIM.SITES.find((s) => s.id === c.site);
      const zones = ['A', 'B', 'C', 'D'].slice(0, 2 + index % 3), rows = 2, cols = 6;
      const panels = window.OPS.layout(zones, rows, cols);
      const approver = window.ROLES.owner.sites.includes(c.site) ? window.ROLES.owner.user : window.ROLES.master.user;
      const key = c.key;
      const soilCounts = [0, panels.length, 4, 0, 0, 0, 0, 0, 0, 0, 5, 3, 6, 2, 4, 5, 2, 0];
      const dmgCounts = [0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 2, 1, 2, 0, 1, 0, 2];
      const undCounts = [0, 0, 0, 0, 3, 8, 0, 0, 0, 0, 1, 0, 0, 0, 0, 6, 5, 0];
      const issued = ['workprogress', 'inspectionpending', 'completed', 'partialexclusion', 'rainrecheck', 'sparewaiting', 'scheduledmaintenance'].includes(key);
      const state = key === 'completed' ? '완료' : key === 'inspectionpending' ? '검수 대기' : ['workprogress', 'partialexclusion', 'sparewaiting'].includes(key) ? '진행' : '예정';
      const next = { hotspot: '열화상 원본·센서 유무 확인 · 열 이상 미확정', missingimage: '누락 구역 실제 원본 요청', commgap: '수신 로그 확인 · 누락 구간 미적산 유지', lowyield: '합성 저출력 추세와 실제 원인 분리 확인', inverterfault: '담당자 점검 배정 · 원인 미확정', scheduledmaintenance: '가상 예방정비 일정 확인', quoteawait: '현장 확인 후 견적 제출 대기', approvalpending: '요청자 최종 승인 대기 · 미발행', workprogress: '남은 항목 완료 보고', inspectionpending: '완료 보고 항목별 검수', completed: '가상 종료 이력 보관', partialexclusion: '제외 대상 별도 재점검', rainrecheck: '가상 우천 종료 후 재촬영 일정 조율', sparewaiting: '가상 부품 호환 규격·입고 일정 확인' }[key] || '가상 ' + c.label + ' 범위 확인';
      function observations(historic) {
        const out = {};
        // 분변은 양 끝단에, 나머지는 구역을 순회하며 결정적으로 배치한다.
        const order = key === 'birdspotsoil' ? [0, panels.length - 1, 5, panels.length - 6, ...panels.map((_, i) => i).filter((i) => ![0, panels.length - 1, 5, panels.length - 6].includes(i))] : panels.map((_, i) => (i * 5 + index) % panels.length);
        const categories = {};
        const ns = historic ? Math.max(0, soilCounts[index] - 2) : soilCounts[index];
        const nd = historic ? Math.max(0, dmgCounts[index] - 1) : dmgCounts[index];
        const nu = historic ? (key === 'missingimage' ? 2 : 0) : undCounts[index];
        order.forEach((p, i) => categories[panels[p]] = i < ns ? 'soil' : i < ns + nd ? 'dmg' : i < ns + nd + nu ? 'und' : 'ok');
        panels.forEach((id, i) => {
          const j = categories[id], pending = j === 'und' || (!historic && i % 5 === index % 5 && key !== 'completed');
          out[id] = record({ id, ai: j, j, soilType: j === 'soil' ? '가상 ' + (key === 'birdspotsoil' ? '조류 분변 · 끝단 국소' : key === 'uniformsoil' ? '먼지·황사 · 균일 분포' : key === 'rainrecheck' ? '빗물 자국 의심' : '먼지·낙엽 혼합') : null,
            dmgPos: j === 'dmg' ? '가상 ' + (key === 'sparewaiting' ? '프레임 손상 의심 · 규격 확인 대기' : '표면 균열 모양 · 근접 확인 필요') + ' (' + id + ')' : null,
            undReason: j === 'und' ? '가상 ' + (key === 'hotspot' ? '열화상 센서·원본 없음 · 발열 미확정' : key === 'rainrecheck' ? '우천·반사로 재확인 대기' : '이미지 누락 · 원본 미수신') : null,
            review: pending ? '미검토' : '확인 완료', reviewer: pending ? null : '시연 검토자', reviewedAt: pending ? null : historic ? '시연 2026-10-20 10:00' : AT,
            reason: '가상 시연 분류 · 실제 이미지·센서 분석 아님', img: null,
            str: 'STR-' + String(1 + Math.floor(i * 20 / panels.length)).padStart(2, '0'),
            work: historic ? '종료' : '요청 없음' });
        });
        return out;
      }
      function inspection(id, historic, obs) {
        const time = historic ? '시연 2026-10-20 10:00' : AT;
        const files = Object.fromEntries(zones.map((z) => { const n = Object.values(obs).filter((o) => o.id[0] === z && o.j === 'und').length; return [z, [12, 12 - n, 12 - n, n]]; }));
        return record({ id, site: c.site, inv: c.site + '-01', round: historic ? 3 : 4, zones: [...zones], rows, cols,
          purpose: '가상 ' + c.label + (historic ? ' · 이전 회차 비교' : ' · 현재 사례'),
          target: '가상 ' + c.site + '-01 ' + zones.join('·') + '구역', wish: '2026-11-09 ~ 2026-11-15',
          note: '가상 시연 자료 · ' + c.detail + (historic ? ' · 이전 회차 합성 이력' : ' · ' + next),
          aircraft: '가상 RGB 기체 · 비행 없음', image: null, step: 3, stage: '가상 ' + c.label + ' · 원본 없음',
          drone: '시연 담당자', shotAt: null, sampleAt: time, detect: record({ n: panels.length, unlinked: 0 }), route: null,
          shoot: record({ total: panels.length / 3, done: 0, fail: [], running: false, finished: false }), files,
          handed: record({ to: '시연 검토자', at: time, policy: '합성 분류 표본 인계 · 실제 촬영·분석 아님' }), reviewer: '시연 검토자',
          log: [[time, 'demo.case.seeded', '가상 ' + c.label + ' · 합성 분류 · 실제 원본·좌표 없음']] });
      }
      const currentObs = observations(false), historicObs = observations(true);
      ops.inspections[ids.current] = inspection(ids.current, false, currentObs);
      ops.inspections[ids.historic] = inspection(ids.historic, true, historicObs);
      ops.obs[ids.current] = currentObs; ops.obs[ids.historic] = historicObs;
      const targetsFor = (obs) => ({ soil: Object.values(obs).filter((o) => o.j === 'soil').map((o) => o.id), dmg: Object.values(obs).filter((o) => o.j === 'dmg').map((o) => o.id) });
      function request(id, historic) {
        const obs = historic ? historicObs : currentObs, targets = targetsFor(obs);
        const hasPanelTargets = targets.soil.length + targets.dmg.length > 0;
        // 정상·통신·전력 사례는 정상 패널을 오염/파손으로 위장하지 않고 예방점검 범위를 명시한다.
        const reqPanels = hasPanelTargets ? targets : { soil: [], dmg: [] };
        const phase = historic || issued || key === 'approvalpending' ? 4 : key === 'quoteawait' ? 2 : key === 'normal' ? 1 : 2 + index % 2;
        const accepted = historic || issued;
        const activeDate = key === 'completed' ? '11-06' : issued && key !== 'rainrecheck' ? '11-07' : '11-' + String(9 + index % 6).padStart(2, '0');
        const slot = historic ? ['10-22', 9, 12] : [activeDate, issued ? 9 : 9 + index % 3, issued ? 12 : 12 + index % 3];
        const vendors = ['ORG-TM', 'ORG-CP'].map((org, vi) => record({ org, service: vi ? '세척' : '정비·세척·점검', team: '가상 ' + (vi ? '세척' : '정비') + (1 + index % 3) + '팀',
          response: !historic && key === 'quoteawait' ? (vi ? '응답 대기' : '현장 확인 후 견적') : '견적 제출', onsite: !historic && key === 'quoteawait' && !vi,
          quote: !historic && key === 'quoteawait' ? null : record({ version: 1 + index % 2, items: [['가상 ' + c.label + ' 범위 점검', Math.max(1, targets.soil.length + targets.dmg.length), 18000 + index * 1000 + vi * 5000], ['가상 출장', 1, 40000 + index * 2000]], tax: '별도', valid: historic ? '2026-10-25' : '2026-11-16', hours: (2 + index % 3) + '시간 (가상)' }),
          slots: [slot, historic ? ['10-23', 13, 16] : ['11-15', 13, 16]], accept: !vi && (accepted || key === 'approvalpending') ? '수락' : '대기' }));
        return record({ id, site: c.site, inspection: historic ? ids.historic : ids.current, step: phase, requester: '시연 운영자', approver,
          assignee: approver, due: historic ? '10-21 18:00' : '11-08 18:00', panels: reqPanels,
          services: hasPanelTargets ? [...(targets.soil.length ? ['세척'] : []), ...(targets.dmg.length ? ['정비'] : [])] : ['점검'],
          basis: '가상 ' + c.label + ' · ' + c.detail, note: '가상 시연 자료 · ' + (historic ? '이전 회차 범위 점검 이력' : next) + (!hasPanelTargets ? ' · 패널 오염·파손 작업 없음; 별도 예방·운영 점검' : ''),
          wish: historic ? '2026-10-22' : '2026-' + slot[0], excluded: Object.values(obs).filter((o) => o.j === 'und').map((o) => o.id).join('·') || '-',
          vendors, selected: phase >= 3 ? { 'ORG-TM': true } : {}, schedule: phase >= 3 ? { 'ORG-TM': slot } : {},
          reqAccept: accepted ? '수락' : '대기', proposalDue: '11-08 18:00', hold: phase === 4 && !accepted ? '11-08 18:00' : null,
          issuedWorkOrderIds: accepted ? [historic ? ids.pastWork : ids.work] : [],
          changes: [[historic ? '시연 2026-10-21 10:00' : AT, '가상 ' + c.label + (accepted ? ' · 양측 수락·가상 작업 연결' : ' · 미발행')]] });
      }
      ops.requests[ids.request] = request(ids.request, false); ops.requests[ids.pastRequest] = request(ids.pastRequest, true);
      function work(id, historic) {
        const obs = historic ? historicObs : currentObs, req = ops.requests[historic ? ids.pastRequest : ids.request];
        const targets = Object.values(req.panels).flat(), orderState = historic ? '완료' : state;
        const itemIds = targets.length ? targets : ['OPS-REVIEW', 'OPS-FOLLOWUP'];
        const accepted = historic || issued;
        const slot = req.vendors[0].slots[0];
        return record({ id, site: c.site, service: req.services.join('·'), vendor: 'ORG-TM', team: req.vendors[0].team,
          ...(accepted ? { requestId: req.id } : {}), inspection: historic ? ids.historic : ids.current,
          state: orderState, schedule: accepted ? '2026-' + slot[0] + ' ' + slot[1] + ':00~' + slot[2] + ':00 (가상)' : '가상 미정 · 현재 요청과 별개',
          approver, reviewer: approver, quoteVersion: req.vendors[0].quote ? 'v' + req.vendors[0].quote.version + ' (가상)' : '가상 미견적', issuedAt: accepted ? historic ? '시연 2026-10-21 10:00' : AT : null,
          scope: '가상 ' + c.label + ' · ' + (targets.length ? targets.length + '패널' : '운영·예방점검 2항목'),
          note: '가상 시연 자료 · 실제 발주·증빙 없음 · ' + (accepted ? '양측 수락된 가상 요청 연결' : '독립 작업 표본; 현재 미승인 요청과 연결하지 않음') + ' · ' + c.detail,
          targets, next: historic || key === 'completed' ? '가상 종료 이력 보관' : next,
          items: itemIds.map((pid, i) => {
            const itemState = historic || key === 'completed' ? 'approved' : key === 'inspectionpending' ? 'done' : key === 'sparewaiting' || key === 'rainrecheck' ? 'hold' : ['workprogress', 'partialexclusion'].includes(key) ? (i === 0 ? 'done' : 'progress') : 'todo';
            if (obs[pid]) obs[pid].work = historic || key === 'completed' ? '종료' : accepted ? key === 'inspectionpending' ? '검수' : orderState === '진행' ? '진행' : '조율' : '요청';
            return record({ id: pid, label: '가상 ' + pid + ' ' + c.label, state: itemState,
              reportedAt: ['approved', 'done', 'hold'].includes(itemState) ? historic ? '시연 2026-10-22 12:00' : AT : null,
              ev: record({ before: 0, after: 0 }), result: '가상 ' + (itemState === 'approved' ? '검수 종료 표본 · 실제 증빙 없음' : itemState === 'done' ? '완료 보고 표본 · 실제 증빙 없음' : next), material: key === 'sparewaiting' ? '가상 호환 부품 입고 대기' : '가상 미사용',
              holdReason: itemState === 'hold' ? '가상 ' + c.label + ' · ' + next : null, review: itemState === 'approved' ? '가상 승인 · 실제 증빙 없음' : null });
          }), cost: record({ base: req.vendors[0].quote ? req.vendors[0].quote.items.reduce((s, it) => s + it[1] * it[2], 0) : 0, extra: 0, tax: '별도' }) });
      }
      ops.workOrders[ids.work] = work(ids.work, false); ops.workOrders[ids.pastWork] = work(ids.pastWork, true);
      links.forEach(([kind, screen, id, candidates]) => {
        const roles = rolesFor(c.site, candidates), assignee = kind === 'DRONE' ? roles.includes('drone') ? 'drone' : 'master' : kind === 'TRACK' ? 'master' : state === '완료' ? null : roles.includes('owner') ? 'owner' : 'master';
        ops.tasks.push(record({ id: taskId(kind), site: c.site, kind: kind === 'DRONE' ? '점검' : kind === 'REQ' ? '승인' : kind === 'WORK' ? '작업' : '요청',
          title: '가상 ' + c.label + ' · ' + ({ DRONE: '원본 확인', REQ: '범위·승인', WORK: '작업 추적', TRACK: '공유 현황' }[kind]),
          stage: kind === 'WORK' ? state === '완료' ? '종료' : state : kind === 'REQ' ? issued ? '확정' : key === 'approvalpending' ? '승인 대기' : '범위 확인' : '확인 대기',
          assignee, assigneeLabel: assignee ? window.ROLES[assignee].user : '미배정', next: '가상 ' + next, due: '11-08 18:00', approver, reviewer: approver,
          link: screen === 'inbox' ? { screen, task: taskId(kind) } : { screen, id }, roles,
          changes: [[AT, '가상 ' + c.label + ' · 실제 업무 아님']] }));
        ops.notifications.push(record({ id: noticeId(kind), site: c.site, at: AT, cause: '가상 ' + site.name + ' · ' + c.label + ' · ' + kind,
          task: taskId(kind), who: '시연 담당자', next: '가상 ' + next, unread: key !== 'completed', roles }));
      });
      ops.demoV2Migration[c.site] = 'added';
    });
    attachPreviews(ops);
    ops.demoVersion = Math.max(2, Number(ops.demoVersion) || 0);
    return ops;
  }
  function previewAllowed(ins, obs) {
    const nonempty = (v) => Array.isArray(v) ? v.length > 0 : !!v && (typeof v !== 'object' || Object.keys(v).length > 0);
    return ins.dataMode === 'demo' && ins.simulated === true &&
      ['AXDemo-v1-' + ins.site, 'AXDemo-v2-' + ins.site].includes(ins.demoKey) &&
      !['panorama', 'droneFlow', 'assets', 'evidence', 'analysis'].some((k) => nonempty(ins[k])) &&
      !Object.values(obs || {}).some((o) => o.dataMode === 'actual' || ['assets', 'evidence', 'evidenceVideo', 'imageName', 'bbox'].some((k) => nonempty(o[k])));
  }
  // 실제 슬롯·관측·사용자 수정은 그대로 두고 별도 필드만 한 번 추가한다.
  function attachPreviews(ops) {
    Object.values(ops.inspections).forEach((ins) => {
      if (own(ins, 'demoPreview') || !previewAllowed(ins, ops.obs[ins.id])) return;
      const ids = window.OPS.layout(ins.zones, ins.rows, ins.cols), obs = ops.obs[ins.id] || {};
      const columns = ins.cols, totalRows = ins.rows * ins.zones.length;
      const panels = ids.map((id, i) => mark({ id, bbox: [0.06 + (i % columns) * .88 / columns, .16 + Math.floor(i / columns) * .76 / totalRows, .78 / columns, .6 / totalRows] }));
      const esc = (s) => String(s).replace(/[&<>"']/g, (x) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[x]));
      const colors = {ok:'#176078',soil:'#b37b23',dmg:'#b44053',und:'#6e7685'};
      const rects = panels.map((p) => { const [x,y,w,h] = p.bbox; return `<g><rect x="${x*1200}" y="${y*800}" width="${w*1200}" height="${h*800}" rx="3" fill="${colors[obs[p.id]?.j || 'und']}" stroke="#adc9dc"/><text x="${x*1200+6}" y="${y*800+19}" fill="#ffffff" font-size="14">${esc(p.id)}</text></g>`; }).join('');
      const image = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect width="1200" height="800" fill="#142634"/><text x="40" y="48" fill="#ffffff" font-family="sans-serif" font-size="26">가상 표본 · ${esc(ins.site)} · 가상 시연 자료</text><text x="40" y="82" fill="#aec3d2" font-family="sans-serif" font-size="18">합성 배치도 · 실제 촬영·GPS·영상 분석 아님</text>${rects}</svg>`;
      ins.demoPreview = mark({ version: 1, demoKey: ins.demoKey, draft: !ins.handed,
        panorama: mark({ name: ins.site + '-가상-전사도.svg', dataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(image) }),
        detection: mark({ panels, n: panels.length }),
        route: mark({ points: panels.map((p) => ({x:p.bbox[0]+p.bbox[2]/2,y:p.bbox[1]+p.bbox[3]/2})), coordinateSystem: 'synthetic-image' }),
        analysis: mark({ panels: panels.map((p) => mark({id:p.id, judgment:obs[p.id]?.j || 'und', reason:obs[p.id]?.reason || '가상 초안 · 분석 미실행'})) }),
        video: null, note: '가상 표본 · 읽기 전용 · 실제 촬영·비행·외부 분석·근거 영상 없음' });
    });
  }
  function preview(ins, obs) {
    return previewAllowed(ins, obs) && ins.demoPreview?.dataMode === 'demo' && ins.demoPreview?.simulated === true && ins.demoPreview.demoKey === ins.demoKey ? ins.demoPreview : null;
  }
  window.AXDemo = { expand, preview, cases: window.SIM.DEMO_CASES };
})();
