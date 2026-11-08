/* 기존 공통 양식·모달 스타일만 사용하는 실제 자료 입력 UI */
function AssetPreview({ assets = [], name, h = 160, style, label }) {
  const asset = assets.find((a) => a.name === name);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [name, asset && asset.dataUrl]);
  return <div className="imgslot" style={{ height: h, ...style }}>
    {asset && !failed ? <img src={asset.dataUrl} alt={label || name} onError={() => setFailed(true)} style={{ width: '100%', height: '100%', minHeight: 0, objectFit: 'contain' }} /> : <span>{name ? `이미지 열람 불가 · ${name}` : '실제 이미지 미연결'}</span>}
  </div>;
}

function AnalysisImportModal({ ins, onClose, onSave, assets = [] }) {
  const [added, setAdded] = useState([]);
  const [json, setJson] = useState(() => ins.analysis ? JSON.stringify(ins.analysis, null, 2) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const existing = assets.length ? assets : (ins.assets || []);
  let combined = [], result = null, validation = '';
  try {
    combined = window.AXAnalysis.mergeAssets(existing, added);
    result = json.trim() ? window.AXAnalysis.parseResult(json, ins) : null;
    window.AXAnalysis.buildObservations(ins, combined, result || ins.analysis || null);
  } catch (e) { validation = e.message; }
  const close = () => { if (!lock.current) onClose(); };
  const read = async (event) => {
    const files = Array.from(event.target.files || []); event.target.value = '';
    if (!files.length || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const fresh = await window.AXAnalysis.readImages(files);
      const next = window.AXAnalysis.mergeAssets(added, fresh);
      window.AXAnalysis.mergeAssets(existing, next);
      setAdded(next);
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  };
  const readJson = async (event) => {
    const file = event.target.files && event.target.files[0]; event.target.value = '';
    if (!file || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (!file.size || file.size > 2 * 1048576) throw new Error('JSON 파일은 0바이트 초과, 최대 2MB입니다');
      const value = await file.text();
      setJson(value);
      window.AXAnalysis.parseResult(value, ins);
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  };
  const save = async () => {
    if (lock.current || validation || !combined.length) return;
    lock.current = true; setBusy(true); setError('');
    try {
      if (typeof onSave !== 'function') throw new Error('자료 저장 콜백이 연결되지 않았습니다');
      await onSave({ assets: combined, result });
      lock.current = false; onClose();
    } catch (e) { setError(e.message); }
    finally { lock.current = false; setBusy(false); }
  };
  return <Modal title="실제 이미지 · 외부 분석 결과 등록" sub={ins.id} onClose={close} width={640} actions={<><button className="btn" disabled={busy} onClick={close}>취소</button><button className="btn pri" disabled={busy || !!validation || !combined.length} onClick={save}>{busy ? '처리 중…' : '등록'}</button></>}>
    <Field label="실제 이미지" hint="JPEG/PNG/WebP · 최대 20개 · 개당 8MB · 합계 30MB. 같은 이름·같은 바이트는 재사용하며 다른 내용은 거부합니다."><input className="inp" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={read} /></Field>
    <div className="mini">기존 {existing.length}개 · 추가 {added.length}개 · 합계 {combined.length}개{combined.length ? ` · ${(combined.reduce((n, a) => n + a.size, 0) / 1048576).toFixed(1)}MB` : ''}</div>
    {combined.length > 0 && <><AssetPreview assets={combined} name={combined[0].name} h={120} /><div className="mini">{combined.map((a) => a.name).join(', ')}</div></>}
    <Field label="외부 분석 JSON 파일 (선택)" hint="최대 2MB. 선택한 파일 내용은 아래 입력란에서 확인·수정할 수 있습니다."><input className="inp" type="file" accept=".json,application/json" disabled={busy} onChange={readJson} /></Field>
    <Field label="외부 분석 JSON (선택)" hint={ins.analysis ? '기존 결과를 불러왔습니다. 입력을 비워도 저장된 분석 결과는 유지됩니다.' : '기존 분석 결과가 없는 신규 자료에서 JSON을 생략하면 모든 패널은 미판정입니다.'}><textarea className="inp" rows={7} value={json} disabled={busy} onChange={(e) => { setJson(e.target.value); setError(''); }} placeholder={'{"source":"외부 분석 출처","analyzedAt":"2026-11-07T01:00:00Z","panels":[{"id":"A01","judgment":"ok","image":"A01.jpg","reason":"판정 근거"}]}'} /></Field>
    <Note kind="info">source, analyzedAt(시간대 포함 ISO), 비어 있지 않은 panels 필수. judgment: ok / soil / dmg / und. 선택 항목: image, reason, soilType, dmgPos. 대상 {ins.zones.join('·')}구역 · {ins.rows}행 × {ins.cols}열. 파일명 또는 확장자를 뺀 정확한 패널 ID만 연결합니다. 여기서는 분석을 실행하지 않습니다.</Note>
    {(result || ins.analysis) && <div className="mini">출처: {(result || ins.analysis).source} · 분석 시각: {(result || ins.analysis).analyzedAt} · 결과 {(result || ins.analysis).panels.length}개</div>}
    {(error || validation) && <div role="alert"><Note>{error || validation}</Note></div>}
  </Modal>;
}

Object.assign(window, { AssetPreview, AnalysisImportModal });
