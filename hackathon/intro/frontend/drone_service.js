/* 실제 외부 결과 어댑터. 탐지·분류 모델이나 모의 결과를 포함하지 않는다. */
(function () {
  'use strict';
  const MB = 1048576, SETTINGS = 'ax-drone-endpoints-v1';
  const fail = (m) => { throw new Error(m); };
  function object(v, keys, label) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(label + ': 객체가 필요합니다');
    for (const k of Object.keys(v)) if (!keys.includes(k)) fail(label + ': 허용되지 않은 키 ' + k);
  }
  function text(v, label) {
    if (typeof v !== 'string' || !v.trim() || v.length > 2000) fail(label + ': 1~2000자의 문자열이 필요합니다');
    return v.trim();
  }
  function ids(ins) {
    return ins.zones.flatMap((z) => Array.from({ length: ins.rows * ins.cols }, (_, i) => z + String(i + 1).padStart(2, '0')));
  }
  function detection(v, ins) {
    object(v, ['source', 'panels', 'route'], '탐지 결과');
    const source = text(v.source, 'source'), valid = new Set(ids(ins)), seen = new Set();
    if (!Array.isArray(v.panels) || v.panels.length > valid.size) fail('panels: 대상 범위 내 배열이 필요합니다');
    const panels = v.panels.map((p) => {
      object(p, ['id', 'bbox'], '탐지 패널');
      if (!valid.has(p.id) || seen.has(p.id)) fail('범위 밖 또는 중복 패널 ID: ' + String(p.id));
      seen.add(p.id);
      if (!Array.isArray(p.bbox) || p.bbox.length !== 4 || !p.bbox.every((n) => typeof n === 'number' && Number.isFinite(n))) fail(p.id + ': bbox는 숫자 4개입니다');
      const [x, y, w, h] = p.bbox;
      if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1 || y + h > 1) fail(p.id + ': bbox는 이미지 내부의 정규화 좌표여야 합니다');
      return { id: p.id, bbox: [...p.bbox] };
    });
    // 외부 route는 비행 명령으로 사용하지 않는다. 검증된 박스 중심에서만 이미지 경로를 만든다.
    return { source, panels };
  }
  function analysis(v, detected) {
    object(v, ['source', 'analyzedAt', 'panels'], '분석 결과');
    const source = text(v.source, 'source');
    if (!Array.isArray(v.panels) || !v.panels.length || v.panels.length > detected.length) fail('panels: 탐지 패널 범위의 비어 있지 않은 배열이 필요합니다');
    const valid = new Set(detected.map((p) => p.id)), seen = new Set();
    // 기존 엄격한 ISO 날짜 검증을 재사용하되 이미지 필수 계약은 호출하지 않는다.
    const first = window.AXAnalysis.parseResult(JSON.stringify({ source, analyzedAt: v.analyzedAt, panels: [{ id: 'A01', judgment: 'und' }] }), { zones: ['A'], rows: 1, cols: 1 });
    const panels = v.panels.map((p) => {
      object(p, ['id', 'judgment', 'reason'], '분석 패널');
      if (!valid.has(p.id) || seen.has(p.id)) fail('미탐지 또는 중복 패널 ID: ' + String(p.id));
      seen.add(p.id);
      if (!['ok', 'soil', 'dmg', 'und'].includes(p.judgment)) fail(p.id + ': judgment는 ok / soil / dmg / und입니다');
      const out = { id: p.id, judgment: p.judgment };
      if (p.reason !== undefined) out.reason = text(p.reason, 'reason');
      return out;
    });
    return { source, analyzedAt: first.analyzedAt, panels };
  }
  function writable(ins, previous) {
    if (ins.handed) fail('인계된 회차는 변경할 수 없습니다. 새 점검 회차를 사용하세요');
    if (Object.values(previous || {}).some((p) => p.review && p.review !== '미검토')) fail('사람 검토가 완료된 관측은 덮어쓸 수 없습니다. 새 점검 회차를 사용하세요');
  }
  function observations(ins, result, video, previous) {
    writable(ins, previous);
    if (!video || !video.key) fail('실제 영상 원본이 필요합니다');
    const normalized = analysis(result, ins.droneFlow.detection.panels);
    const byId = new Map(normalized.panels.map((p) => [p.id, p]));
    return Object.fromEntries(ins.droneFlow.detection.panels.map(({ id }) => {
      const p = byId.get(id), j = p ? p.judgment : 'und';
      return [id, { id, ai: j, j, img: null, imageName: null, evidenceVideo: video.key,
        review: '미검토', reviewer: null, reviewedAt: null, work: previous?.[id]?.work || '요청 없음',
        str: '미연결', reason: null, soilType: null, dmgPos: null,
        undReason: j === 'und' ? p?.reason || '외부 분석 결과 누락 또는 미판정' : null,
        provenance: { source: normalized.source, analyzedAt: normalized.analyzedAt,
          raw: { judgment: j, reason: p?.reason || null, present: !!p, evidenceVideo: video.key } } }];
    }));
  }
  function endpoint(value) {
    if (!value || !value.trim()) fail('엔진 미연결 · API 주소를 설정하거나 외부 결과 JSON을 가져오세요');
    let u; try { u = new URL(value.trim()); } catch { fail('API 주소는 절대 URL이어야 합니다'); }
    if (u.username || u.password || u.search || u.hash) fail('API 주소에 인증정보·쿼리·해시를 넣을 수 없습니다');
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname))) fail('API 주소는 HTTPS 또는 로컬호스트 HTTP만 허용합니다');
    return u.href;
  }
  function settings() {
    try { const v = JSON.parse(localStorage.getItem(SETTINGS)) || {}; return { detect: typeof v.detect === 'string' ? v.detect : '', analyze: typeof v.analyze === 'string' ? v.analyze : '' }; }
    catch { return { detect: '', analyze: '' }; }
  }
  function saveSettings(v) {
    const out = { detect: v.detect.trim() ? endpoint(v.detect) : '', analyze: v.analyze.trim() ? endpoint(v.analyze) : '' };
    try { localStorage.setItem(SETTINGS, JSON.stringify(out)); } catch { fail('브라우저 주소 설정 저장이 차단되었습니다'); }
    return out;
  }
  async function post(url, form, token, signal) {
    const address = endpoint(url);
    let response;
    try { response = await fetch(address, { method: 'POST', body: form, signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: token ? { Authorization: 'Bearer ' + token } : {} }); }
    catch (e) { if (signal.aborted) throw e; fail('API 요청 실패 · 네트워크·CORS·인증 설정을 확인하고 명시적으로 재시도하세요'); }
    if (!response.ok) fail('API 요청 실패 · HTTP ' + response.status + ' · 주소·권한·서버 상태를 확인하세요');
    const reader = response.body.getReader(), decoder = new TextDecoder(); let total = 0, value = '';
    try { while (true) { const { done, value: chunk } = await reader.read(); if (done) break; total += chunk.byteLength; if (total > 2 * MB) { await reader.cancel(); fail('API 결과 JSON은 최대 2MB입니다'); } value += decoder.decode(chunk, { stream: true }); } value += decoder.decode(); }
    finally { reader.releaseLock(); }
    try { return JSON.parse(value); } catch { fail('API가 유효한 JSON을 반환하지 않았습니다'); }
  }
  async function detect(url, panorama, token, signal) {
    const form = new FormData();
    const blob = await (await fetch(panorama.dataUrl)).blob();
    form.append('image', blob, panorama.name); form.append('kind', 'detect');
    return post(url, form, token, signal);
  }
  async function analyze(url, blob, ins, token, signal) {
    const form = new FormData(); form.append('video', blob, ins.droneFlow.video.name);
    form.append('kind', 'analyze'); form.append('inspectionId', ins.id);
    form.append('panels', JSON.stringify(ins.droneFlow.detection.panels));
    return post(url, form, token, signal);
  }
  let dbPromise;
  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open('ax-drone-media-v1', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('videos');
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { dbPromise = null; reject(new Error('영상 저장소를 열 수 없습니다')); };
      r.onblocked = () => { dbPromise = null; reject(new Error('다른 탭이 영상 저장소를 잠그고 있습니다')); };
    });
    return dbPromise;
  }
  async function media(action, key, blob) {
    const database = await db();
    return new Promise((resolve, reject) => {
      const tx = database.transaction('videos', action === 'get' ? 'readonly' : 'readwrite');
      const r = tx.objectStore('videos')[action](...(action === 'put' ? [blob, key] : [key]));
      tx.oncomplete = () => resolve(r.result);
      tx.onabort = tx.onerror = () => reject(new Error('영상 저장소 처리 실패 · 브라우저 저장 공간·권한을 확인하세요'));
    });
  }
  async function storeVideo(file) {
    if (!file || !['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type) || !file.size || file.size > 150 * MB) fail('영상은 MP4/WebM/MOV, 0바이트 초과 최대 150MB입니다');
    if (navigator.storage?.estimate) {
      const { quota, usage } = await navigator.storage.estimate();
      if (quota && quota - (usage || 0) < file.size + 8 * MB) fail('브라우저 저장 공간이 부족합니다. 공간 확보 후 재시도하세요');
    }
    const url = URL.createObjectURL(file);
    try {
      await new Promise((resolve, reject) => {
        const video = document.createElement('video'); video.preload = 'metadata';
        const timer = setTimeout(() => finish(new Error('영상 읽기 시간 초과')), 15000);
        function finish(err) { clearTimeout(timer); video.onloadedmetadata = video.onerror = null; video.removeAttribute('src'); video.load(); err ? reject(err) : resolve(); }
        video.onloadedmetadata = () => finish(video.videoWidth && video.videoHeight ? null : new Error('영상 트랙이 없는 파일입니다'));
        video.onerror = () => finish(new Error('이 브라우저에서 읽을 수 없는 영상 형식입니다')); video.src = url;
      });
    } finally { URL.revokeObjectURL(url); }
    const key = 'video-' + crypto.randomUUID();
    await media('put', key, file);
    return { key, name: file.name, size: file.size, type: file.type, uploadedAt: new Date().toISOString() };
  }
  function route(detected) {
    const remaining = detected.map((p) => ({ id: p.id, x: p.bbox[0] + p.bbox[2] / 2, y: p.bbox[1] + p.bbox[3] / 2, h: p.bbox[3] })).sort((a, b) => a.y - b.y || a.x - b.x);
    const rows = [];
    for (const p of remaining) { const row = rows.find((r) => Math.abs(r[0].y - p.y) <= Math.min(r[0].h, p.h) * 0.5); if (row) row.push(p); else rows.push([p]); }
    const points = rows.flatMap((row, i) => row.sort((a, b) => i % 2 ? b.x - a.x : a.x - b.x)).map(({ id, x, y }) => ({ id, x, y }));
    return { coordinateSystem: 'normalized-image', executable: false, label: '이미지 좌표 경로 · 실제 비행 명령 아님', points };
  }
  async function readJSON(file) {
    if (!file || !file.size || file.size > 2 * MB) fail('JSON은 0바이트 초과 최대 2MB입니다');
    try { return JSON.parse(await file.text()); } catch { fail('JSON 문법을 확인하세요'); }
  }
  function download(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.AXDrone = Object.freeze({ detection, analysis, observations, writable, ids, endpoint, settings, saveSettings, detect, analyze, storeVideo, getVideo: (key) => media('get', key), deleteVideo: (key) => media('delete', key), route, readJSON, download });
})();
