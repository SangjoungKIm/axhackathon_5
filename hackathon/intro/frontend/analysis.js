/* 실제 로컬 이미지 / 외부 결과 계약. 네트워크 요청이나 분석 실행을 하지 않는다. */
(function () {
  'use strict';
  const MB = 1024 * 1024;
  const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  function fail(message) { throw new Error(message); }
  function record(value, keys, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail(label + ': 객체가 필요합니다');
    for (const k of Object.keys(value)) if (!keys.includes(k)) fail(label + ': 허용되지 않은 키 ' + k);
  }
  function text(value, label) {
    if (typeof value !== 'string' || !value.trim()) fail(label + ': 빈 문자열은 허용되지 않습니다');
    return value;
  }
  function filename(value) {
    text(value, '파일명');
    if (/[\\/\x00-\x1f\x7f]/.test(value) || ['.', '..', '__proto__', 'constructor', 'prototype'].includes(value)) fail('안전하지 않은 파일명입니다');
    return value;
  }
  function layout(ins) {
    if (!ins || !Array.isArray(ins.zones) || !ins.zones.length || !Number.isSafeInteger(ins.rows) || !Number.isSafeInteger(ins.cols) || ins.rows < 1 || ins.cols < 1 || ins.rows * ins.cols * ins.zones.length > 100000) fail('점검 구역·행·열이 유효하지 않습니다');
    const ids = [], seen = new Set();
    for (const z of ins.zones) {
      if (typeof z !== 'string' || !/^[A-Z]+$/.test(z) || seen.has(z)) fail('구역은 중복 없는 영문 대문자여야 합니다');
      seen.add(z);
      for (let i = 1; i <= ins.rows * ins.cols; i++) ids.push(z + String(i).padStart(2, '0'));
    }
    return ids;
  }
  function iso(value) {
    text(value, 'analyzedAt');
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
    if (!m) fail('analyzedAt: 시간대가 포함된 ISO 시각이 필요합니다');
    const [, y, mo, d, h, mi, s, tz] = m;
    const year = +y, month = +mo, day = +d;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || +h > 23 || +mi > 59 || +s > 59 || (tz !== 'Z' && (+tz.slice(1, 3) > 23 || +tz.slice(4) > 59)) || !Number.isFinite(Date.parse(value))) fail('analyzedAt: 존재하지 않는 날짜 또는 시각입니다');
    return new Date(value).toISOString();
  }
  function normalize(value, ins) {
    record(value, ['source', 'analyzedAt', 'panels'], '결과');
    const source = text(value.source, 'source'), analyzedAt = iso(value.analyzedAt);
    const expected = new Set(layout(ins)), seen = new Set();
    if (!Array.isArray(value.panels) || !value.panels.length) fail('panels: 비어 있지 않은 배열이 필요합니다');
    const panels = value.panels.map((p) => {
      record(p, ['id', 'judgment', 'image', 'reason', 'soilType', 'dmgPos'], '패널');
      if (typeof p.id !== 'string' || !expected.has(p.id)) fail('범위 밖 패널 ID: ' + String(p.id));
      if (seen.has(p.id)) fail('중복 패널 ID: ' + p.id);
      seen.add(p.id);
      if (!['ok', 'soil', 'dmg', 'und'].includes(p.judgment)) fail(p.id + ': 유효하지 않은 judgment');
      const out = { id: p.id, judgment: p.judgment };
      for (const k of ['image', 'reason', 'soilType', 'dmgPos']) if (own(p, k)) out[k] = k === 'image' ? filename(p[k]) : text(p[k], p.id + '.' + k);
      return out;
    });
    return { panels, source, analyzedAt };
  }
  function parseResult(input, ins) {
    if (typeof input !== 'string' || !input.trim()) fail('분석 JSON을 입력하세요');
    let value;
    try { value = JSON.parse(input); } catch (e) { fail('JSON 문법 오류: ' + e.message); }
    return normalize(value, ins);
  }
  function metadata(files) {
    if (!Array.isArray(files) || files.length > 20) fail('이미지는 최대 20개입니다');
    let total = 0;
    const names = new Set();
    for (const f of files) {
      if (!f) fail('이미지 파일이 필요합니다');
      filename(f.name);
      if (names.has(f.name)) fail('중복 파일명: ' + f.name);
      names.add(f.name);
      if (!TYPES.includes(f.type)) fail(f.name + ': JPEG/PNG/WebP만 허용됩니다');
      if (!Number.isSafeInteger(f.size) || f.size <= 0 || f.size > 8 * MB) fail(f.name + ': 파일은 0바이트 초과, 개당 최대 8MB입니다');
      total += f.size;
    }
    if (total > 30 * MB) fail('이미지 합계는 최대 30MB입니다');
  }
  function assetsMap(assets) {
    metadata(assets);
    const map = new Map();
    for (const a of assets) {
      if (typeof a.dataUrl !== 'string' || !a.dataUrl.startsWith('data:' + a.type + ';base64,') || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.dataUrl.split(',')[1] || '')) fail(a.name + ': 유효하지 않은 이미지 데이터입니다');
      map.set(a.name, a);
    }
    return map;
  }
  async function readImages(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) fail('이미지를 선택하세요');
    metadata(files);
    const output = [];
    // 순차 디코딩으로 대용량 원본 여러 장의 동시 메모리 사용을 피한다.
    for (const file of files) {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error(file.name + ': 파일을 읽을 수 없습니다'));
        reader.onabort = () => reject(new Error(file.name + ': 읽기가 취소되었습니다'));
        reader.readAsDataURL(file);
      });
      // MIME 선언만 믿지 않고 파일 시그니처도 확인한다.
      const bytes = atob(String(dataUrl).split(',')[1] || '');
      const signature = file.type === 'image/jpeg' ? bytes.startsWith('\xff\xd8\xff') : file.type === 'image/png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
      if (!signature) fail(file.name + ': 실제 이미지 형식과 MIME이 일치하지 않습니다');
      await new Promise((resolve, reject) => {
        const image = new Image();
        const timer = setTimeout(() => finish(new Error(file.name + ': 이미지 디코딩 시간 초과')), 15000);
        function finish(error) { clearTimeout(timer); image.onload = image.onerror = null; image.src = ''; error ? reject(error) : resolve(); }
        image.onload = () => {
          if (!image.naturalWidth || !image.naturalHeight) finish(new Error(file.name + ': 빈 이미지입니다'));
          else if (typeof image.decode === 'function') image.decode().then(() => finish(), () => finish(new Error(file.name + ': 이미지 디코딩 실패')));
          else finish();
        };
        image.onerror = () => finish(new Error(file.name + ': 손상되었거나 디코딩할 수 없는 이미지입니다'));
        image.src = dataUrl;
      });
      output.push({ name: file.name, type: file.type, size: file.size, dataUrl });
    }
    return output;
  }
  function mergeAssets(existing, added) {
    const map = assetsMap(existing), fresh = assetsMap(added);
    for (const [name, a] of fresh) {
      const old = map.get(name);
      if (old && (old.type !== a.type || old.size !== a.size || old.dataUrl !== a.dataUrl)) fail('같은 파일명에 다른 내용이 있습니다: ' + name);
      if (!old) map.set(name, a);
    }
    const combined = Array.from(map.values());
    metadata(combined);
    return combined;
  }
  function buildObservations(ins, assets, result, previous) {
    const ids = layout(ins), map = assetsMap(assets);
    const normalized = result == null ? null : normalize(result, ins);
    const panels = new Map(normalized ? normalized.panels.map((p) => [p.id, p]) : []);
    const out = {};
    for (const id of ids) {
      const p = panels.get(id);
      let name = null;
      if (p && p.image) {
        if (!map.has(p.image)) fail(id + ': 결과의 이미지가 실제 업로드 파일에 없습니다: ' + p.image);
        name = p.image;
      } else {
        const matches = assets.filter((a) => /\.(jpe?g|png|webp)$/i.test(a.name) && a.name.replace(/\.(jpe?g|png|webp)$/i, '') === id);
        if (matches.length > 1) fail(id + ': 동일 패널의 이미지가 여러 개입니다. JSON image로 지정하세요');
        name = matches.length ? matches[0].name : null;
      }
      const j = p ? p.judgment : 'und';
      if (j !== 'und' && !name) fail(id + ': 미판정 이외의 결과에는 실제 연결 이미지가 필요합니다');
      const raw = { judgment: j, imageName: name, reason: p ? p.reason || null : null, soilType: p ? p.soilType || null : null, dmgPos: p ? p.dmgPos || null : null, present: !!p };
      const provenance = { source: normalized ? normalized.source : null, analyzedAt: normalized ? normalized.analyzedAt : null, raw };
      const next = { id, ai: j, j, review: '미검토', reviewer: null, reviewedAt: null, work: '요청 없음', img: name, imageName: name, undReason: j === 'und' ? (p && p.reason) || (!name ? '이미지 미연결 · 미판정' : '분석 결과 없음 · 미판정') : null, soilType: raw.soilType, dmgPos: raw.dmgPos, reason: null, str: '미연결', provenance };
      const old = previous && own(previous, id) ? previous[id] : null;
      if (old) {
        if (old.review !== '미검토') {
          // 근거 없는 레거시 검토를 새 원본으로 조용히 치환하지 않는다.
          if (!old.provenance || JSON.stringify(old.provenance.raw) !== JSON.stringify(raw) || old.provenance.source !== provenance.source || old.provenance.analyzedAt !== provenance.analyzedAt) fail(id + ': 사람 검토가 완료된 원본 변경은 허용되지 않습니다');
          const priorAsset = (ins.assets || []).find((a) => a.name === name);
          if (name && ins.assets && (!priorAsset || priorAsset.dataUrl !== map.get(name).dataUrl)) fail(id + ': 검토 당시 이미지 원본을 확인할 수 없거나 내용이 변경되었습니다');
          Object.assign(next, { j: old.j, review: old.review, reviewer: old.reviewer, reviewedAt: old.reviewedAt, reason: old.reason, soilType: old.soilType, dmgPos: old.dmgPos, undReason: old.undReason });
        }
        next.work = old.work == null ? '요청 없음' : old.work;
      }
      out[id] = next;
    }
    return out;
  }
  function summarize(ins, obs) {
    layout(ins);
    const files = Object.fromEntries(ins.zones.map((z) => [z, [ins.rows * ins.cols, 0, 0, 0]]));
    for (const z of ins.zones) for (let i = 1; i <= ins.rows * ins.cols; i++) {
      const id = z + String(i).padStart(2, '0');
      const o = obs && own(obs, id) ? obs[id] : null, v = files[z];
      const received = !!(o && typeof o.imageName === 'string' && o.imageName);
      // 사람 수정이 분석 성공 수를 만들지 않도록 원본 판정도 확인한다.
      const classified = received && o.j !== 'und' && ['ok', 'soil', 'dmg'].includes(o.ai) && !!(o.provenance && o.provenance.raw.present);
      if (received) v[1]++;
      if (classified) v[2]++; else v[3]++;
    }
    return files;
  }
  window.AXAnalysis = Object.freeze({ readImages, parseResult, buildObservations, summarize, mergeAssets });
})();
