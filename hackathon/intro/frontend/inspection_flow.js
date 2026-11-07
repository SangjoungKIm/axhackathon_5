/* INS-2026-031: real row OBB routing, existing video analysis, pinned map.
   Uses the supplied React components and theme; other inspections are unchanged. */
(function () {
  'use strict';
  const h = React.createElement;
  const api = path => new URL(path, new URL('./', location.href)).href;
  const labels = {clean:'외관 정상', dirty:'오염', crack:'육안상 파손', insufficient:'미판정', undetected:'미탐지'};
  const kinds = {clean:'ok', dirty:'soil', crack:'dmg', insufficient:'und', undetected:'und'};
  const subtypes = {bird:'새 배설물',dust:'먼지',leaf:'낙엽'};
  async function json(path, options) {
    const response = await fetch(api(path), options);
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(typeof data.detail === 'string' ? data.detail : `요청 실패 (${response.status})`);
      error.status = response.status; throw error;
    }
    return data;
  }
  function Empty({number,title,children}) {
    return h('div',{className:'df-empty'},h('span',{className:'df-empty-no'},number),h('h3',null,title),children);
  }
  function KV({rows}) {
    return h('dl',{className:'kv-list'},rows.map(([label,value])=>h(React.Fragment,{key:label},h('dt',null,label),h('dd',null,value))));
  }
  function Counts({layout}) {
    return h('div',{className:'df-counts'},['clean','dirty','crack','undetected'].map(state=>h('div',{key:state,className:'df-'+kinds[state]},h('span',null,labels[state]),h('b',null,layout.summary[state]||0))));
  }
  function RowOverlay({panorama,route}) {
    const [ratio,setRatio] = useState(1.5);
    const points=route?.waypoints||[];
    const font=Math.max(12,Math.min(route?.width||1000,route?.height||1000)*.021);
    return h('div',{className:'df-canvas'},h('div',{className:'df-image-wrap',style:{'--df-ratio':ratio}},
      h('img',{src:panorama.dataUrl,alt:'업로드한 전사 이미지',onLoad:e=>setRatio(e.currentTarget.naturalWidth/e.currentTarget.naturalHeight)}),
      route&&h('svg',{viewBox:`0 0 ${route.width} ${route.height}`,preserveAspectRatio:'none','aria-label':'패널 열 OBB와 지그재그 경로'},
        h('defs',null,h('marker',{id:'row-route-arrow',viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'},h('path',{d:'M0 0L10 5L0 10Z',fill:'var(--solar)'}))),
        route.rows.map(row=>h('polygon',{key:row.id,className:'row-obb',points:row.polygon.map(p=>p.join(',')).join(' ')})),
        points.slice(1).map((point,i)=>h('line',{key:'line-'+i,className:'row-route-line',x1:points[i].x,y1:points[i].y,x2:point.x,y2:point.y,markerEnd:'url(#row-route-arrow)'})),
        points.map(point=>h('g',{key:point.number,className:'row-waypoint'},
          h('circle',{cx:point.x,cy:point.y,r:font*.8}),
          h('text',{x:point.x,y:point.y,dy:'.35em',textAnchor:'middle',style:{fontSize:font}},point.number),
          h('title',null,`${point.number}번 · ${point.row}열 ${point.endpoint==='entry'?'진입':'종료'}`)))
      )));
  }
  function FixedMap({layout,selected,onSelect}) {
    const drag=useRef(null);
    const positions={};let y=35;
    for(const row of layout.rows){positions[row.row]=y;y+=row.lanes*23+40;}
    const W=Math.max(440,62+Math.max(...layout.rows.map(r=>r.cols))*32),H=Math.max(290,y-10);
    const [view,setView]=useState(()=>({x:0,y:0,w:W,h:H}));
    const zoom=factor=>setView(v=>{const width=Math.max(W/8,Math.min(W*1.5,v.w/factor)),height=width*H/W;return{x:v.x+(v.w-width)/2,y:v.y+(v.h-height)/2,w:width,h:height};});
    return h('div',{className:'fixed-map-canvas'},
      h('svg',{viewBox:`${view.x} ${view.y} ${view.w} ${view.h}`,role:'group','aria-label':'testload_1 고정 가상지도',className:'fixed-map-svg',
        onPointerDown:e=>{if(e.target.closest('.fixed-cell'))return;drag.current={x:e.clientX,y:e.clientY,view};e.currentTarget.setPointerCapture(e.pointerId);},
        onPointerMove:e=>{const d=drag.current;if(!d)return;const scale=d.view.w/e.currentTarget.getBoundingClientRect().width;setView({...d.view,x:d.view.x-(e.clientX-d.x)*scale,y:d.view.y-(e.clientY-d.y)*scale});},
        onPointerUp:()=>{drag.current=null;},onPointerCancel:()=>{drag.current=null;}},
        h('defs',null,h('pattern',{id:'fixed-map-hatch',width:6,height:6,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'},h('rect',{width:6,height:6,fill:'var(--panel2)'}),h('rect',{width:2,height:6,fill:'var(--line2)'}))),
        layout.rows.map(row=>h('text',{key:'row-'+row.row,x:34,y:positions[row.row]+row.lanes*11.5,textAnchor:'end',className:'fixed-row-label'},`${row.row}열`)),
        layout.panels.map(panel=>{
          const x=46+(panel.col-1)*32,py=positions[panel.row]+(panel.lane-1)*23;
          return h('g',{key:panel.pid,className:`fixed-cell fixed-${kinds[panel.status]} ${selected===panel.pid?'picked':''}`,'data-pid':panel.pid,'data-state':panel.status,role:'button',tabIndex:0,'aria-selected':selected===panel.pid,'aria-label':`${panel.pid} ${labels[panel.status]}`,onClick:()=>onSelect(panel.pid),onKeyDown:e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(panel.pid);}}},
            h('rect',{x,y:py,width:28,height:19,rx:2,fill:['insufficient','undetected'].includes(panel.status)?'url(#fixed-map-hatch)':undefined}),
            h('text',{x:x+14,y:py+12,textAnchor:'middle'},panel.status==='undetected'?'?':String(panel.col)),
            panel.status==='dirty'&&h('circle',{cx:x+24,cy:py+4,r:1.5,className:'fixed-dirty-dot'}),
            h('title',null,`${panel.pid} · ${labels[panel.status]}`));
        })),
      h('div',{className:'fixed-map-tools'},h('button',{className:'btn','aria-label':'지도 확대',onClick:()=>zoom(1.3)},'+'),h('button',{className:'btn','aria-label':'지도 축소',onClick:()=>zoom(1/1.3)},'−'),h('button',{className:'btn',onClick:()=>setView({x:0,y:0,w:W,h:H})},'전체 맞춤')));
  }
  function PanelDetails({panel,sourceJob}) {
    const [memberIndex,setMemberIndex]=useState(0);
    useEffect(()=>setMemberIndex(0),[panel?.pid]);
    if(!panel)return h('p',{className:'df-hint'},'지도에서 패널을 선택하세요.');
    const members=panel.members||[],member=members[Math.min(memberIndex,members.length-1)],crop=member?.reference_crop||member?.thumbs?.rep||panel.thumbs?.rep;
    const votes=panel.votes||{};
    const source=member?api(`api/jobs/${sourceJob}/reference/${member.ref_frame}/${member.track_id}`):null;
    return h('div',{className:'fixed-panel-details'},
      h('div',{className:'fixed-detail-title'},h('b',{className:'mono'},panel.pid),h('span',{className:'stagepill'},labels[panel.status])),
      h('div',{className:'fixed-detail-images'},
      source?h('a',{href:source,target:'_blank',rel:'noreferrer',title:'원본 위치 확대'},h('img',{className:'fixed-evidence',src:source,alt:`${panel.pid} 원본 영상에서의 위치`})):
        h('div',{className:'df-file'},'미탐지 · 관측 근거 없음'),
      crop&&h('img',{className:'fixed-crop',src:api(`api/jobs/${sourceJob}/files/${crop}`),alt:`${panel.pid} 분석 패널 이미지`})),
      h(KV,{rows:[['위치',`${panel.row}열 · ${panel.lane}줄 · ${panel.col}칸`],['판정',labels[panel.status]],['오염 종류',(panel.dirty_classes||[]).map(s=>subtypes[s]||s).join(' · ')||'—'],['누적 판정',`정상 ${votes.clean||0} / 오염 ${votes.dirty||0} / 파손 ${votes.crack||0}`],['관측 트랙',`${members.length}개`],['원본 구간',member?`F${member.first_frame} ~ F${member.last_frame}`:'—'],['기준 프레임',member?`F${member.ref_frame}`:'—']]}),
      members.length>1&&h('label',{className:'df-field'},'관측 근거 선택',h('select',{className:'inp',value:memberIndex,onChange:e=>setMemberIndex(Number(e.target.value))},members.map((m,i)=>h('option',{key:i,value:i},`${m.track_id} · F${m.ref_frame}`)))),
      h('p',{className:'df-hint'},'testload_1 고정 지도 · 원본 이미지를 누르면 확대할 수 있습니다.'));
  }
  function Inspection031({ctx,ins}) {
    const [step,setStep]=useState(0),[panorama,setPanorama]=useState(null),[route,setRoute]=useState(null);
    const [file,setFile]=useState(null),[videoUrl,setVideoUrl]=useState(''),[uploadProgress,setUploadProgress]=useState(null);
    const [jobId,setJobId]=useState(null),[job,setJob]=useState(null),[fixed,setFixed]=useState(null),[mapError,setMapError]=useState('');
    const [selected,setSelected]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
    const live=useRef(true),xhrRef=useRef(null),abortRef=useRef(null),lock=useRef(false);
    useEffect(()=>{live.current=true;return()=>{live.current=false;abortRef.current?.abort();xhrRef.current?.abort();};},[]);
    useEffect(()=>{if(!jobId||job?.status!=='done')return;let current=true;const c=new AbortController();json('api/inspections/INS-2026-031/fixed-map',{signal:c.signal}).then(d=>{if(current){setFixed(d);setMapError('');}}).catch(e=>{if(current)setMapError(e.message);});return()=>{current=false;c.abort();};},[jobId,job?.status]);
    useEffect(()=>{if(!file){setVideoUrl('');return;}const url=URL.createObjectURL(file);setVideoUrl(url);return()=>URL.revokeObjectURL(url);},[file]);
    useEffect(()=>{
      if(!jobId)return;let active=true,timer;const c=new AbortController();
      const poll=async()=>{try{const data=await json(`api/jobs/${jobId}`,{signal:c.signal});if(!active)return;setJob(data);if(!['done','error'].includes(data.status))timer=setTimeout(poll,1500);}catch(e){if(active){setError('분석 상태 확인 실패 · '+e.message);if(e.status===404)setJob({status:'error',stage:'이전 분석 기록 없음',error:e.message});else timer=setTimeout(poll,5000);}}};poll();
      return()=>{active=false;clearTimeout(timer);c.abort();};
    },[jobId]);
    const running=jobId&&(!job||!['done','error'].includes(job.status));
    const run=async(label,fn)=>{if(lock.current)return;lock.current=true;setBusy(label);setError('');setNotice('');try{await fn();}catch(e){if(live.current)setError(e.message||'처리 중 오류가 발생했습니다.');}finally{lock.current=false;if(live.current)setBusy('');}};
    const uploadPanorama=event=>{const next=event.target.files?.[0];event.target.value='';if(!next)return;run('전사 이미지 읽는 중',async()=>{const [asset]=await AXAnalysis.readImages([next]);if(!live.current)return;setPanorama(asset);setRoute(null);});};
    const detect=()=>run('태양광 패널 열 탐지 중',async()=>{
      const blob=await (await fetch(panorama.dataUrl)).blob();const form=new FormData();form.append('file',blob,panorama.name);
      const c=new AbortController();abortRef.current=c;const value=await json('api/rows/detect',{method:'POST',body:form,signal:c.signal});if(!live.current)return;
      setRoute(value);setNotice(value.row_count?`탐지 박스 ${value.detection_count}개를 ${value.row_count}개 열로 통합 · 경로 번호 ${value.waypoint_count}개`:'탐지된 패널 열이 없습니다. 다른 전사 이미지로 다시 시도하세요.');
    });
    const analyze=()=>run('영상 업로드 중',async()=>{
      const form=new FormData();form.append('file',file,file.name);form.append('site_id','S1');form.append('inspection_id',ins.id);
      setUploadProgress(0);setJobId(null);setJob(null);setFixed(null);setSelected(null);
      try {
        const data=await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhrRef.current=xhr;xhr.open('POST',api('api/analyze'));xhr.responseType='json';xhr.upload.onprogress=e=>{if(live.current&&e.lengthComputable)setUploadProgress(Math.round(e.loaded/e.total*100));};xhr.onload=()=>{const data=xhr.response;if(xhr.status>=200&&xhr.status<300&&data?.id)resolve(data);else reject(new Error(typeof data?.detail==='string'?data.detail:`영상 업로드 실패 (${xhr.status})`));};xhr.onerror=()=>reject(new Error('네트워크 연결을 확인하세요.'));xhr.onabort=()=>reject(new Error('영상 업로드가 취소되었습니다.'));xhr.send(form);});
        if(!live.current)return;setJobId(data.id);setJob(null);setNotice('업로드 완료 · 기존 분석 엔진에서 영상을 분석하고 있습니다.');
      } finally {if(live.current)setUploadProgress(null);xhrRef.current=null;}
    });
    const panel=fixed?.layout.panels.find(p=>p.pid===selected)||null;
    const savedVideo=job?.filename||'';
    const resultReady=!!jobId&&job?.status==='done';
    const status=busy||(step===0?(route?`열 ${route.row_count}개 · 경로 번호 ${route.waypoint_count}개`:'전사 이미지를 업로드하고 패널 탐지를 실행하세요.'):step===1?(running?(job?.stage||'분석 상태 확인 중'):job?.status==='done'?'영상 분석 완료':job?.status==='error'?'영상 분석 실패':'영상을 선택하고 영상 분석을 실행하세요.'):resultReady?'testload_1 고정 가상지도':'영상을 업로드하고 분석을 완료하세요.');
    const sourceJob=fixed?.source_job_id;
    let preview,controls;
    if(step===0){
      preview=panorama?h(RowOverlay,{panorama,route}):h(Empty,{number:'01',title:'전사 이미지를 업로드하세요'},h('p',null,'solar_row.pt로 패널 열을 탐지하고 비행 순서를 생성합니다.'));
      controls=h(React.Fragment,null,h('label',{className:'df-field'},'전사 이미지 업로드',h('input',{className:'inp',type:'file',accept:'image/jpeg,image/png,image/webp','aria-label':'전사 이미지 업로드',disabled:!!busy,onChange:uploadPanorama}),h('small',null,'JPEG / PNG / WebP · 최대 8MB')),panorama&&h('div',{className:'df-file'},panorama.name),
        h('button',{className:'btn pri',disabled:!!busy||!panorama,onClick:detect},'패널 탐지 실행'),
        route&&h(React.Fragment,null,h(KV,{rows:[['탐지 모델','solar_row.pt · 단일 클래스 OBB'],['원본 탐지 박스',`${route.detection_count}개`],['통합된 열',`${route.row_count}개`],['경로 번호',`${route.waypoint_count}개`],['열 방향',route.axis_angle_deg===null?'—':`${route.axis_angle_deg}°`]]}),h('div',{className:'row-waypoint-list'},route.waypoints.map(p=>h('span',{key:p.number,className:'stagepill'},`${p.number} · ${p.row}열 ${p.endpoint==='entry'?'진입':'종료'}`)))),
        h('button',{className:'btn pri',disabled:!!busy||!route?.waypoint_count,onClick:()=>window.alert('드론에게 비행 경로를 전송했습니다.')},'전송'),h('p',{className:'df-hint'},'전송은 완료 알림만 표시합니다. 경로는 업로드 이미지의 좌표를 기준으로 합니다.'));
    } else if(step===1){
      preview=videoUrl?h('video',{key:videoUrl,controls:true,src:videoUrl,preload:'metadata','aria-label':'선택한 촬영 영상'}):savedVideo?h('video',{controls:true,src:api(`api/jobs/${jobId}/source-video`),preload:'metadata','aria-label':'저장된 촬영 영상'}):h(Empty,{number:'02',title:'촬영 영상을 업로드하세요'},h('p',null,'testload_1 영상을 선택한 뒤 영상 분석 버튼을 누르세요.'));
      controls=h(React.Fragment,null,h('label',{className:'df-field'},'촬영 영상 업로드',h('input',{className:'inp',type:'file',accept:'.mp4,.mov,.avi,.mkv,.webm,.m4v','aria-label':'촬영 영상 업로드',disabled:!!busy||!!running,onChange:e=>{const next=e.target.files?.[0];if(next){setFile(next);setJobId(null);setJob(null);setFixed(null);setSelected(null);setMapError('');setError('');setNotice('');}}}),h('small',null,'MP4 / MOV / AVI / MKV / WebM · 최대 500MB · 10분')),
        (file||savedVideo)&&h('div',{className:'df-file'},file?.name||savedVideo),h('button',{className:'btn pri',disabled:!!busy||!!running||!file,onClick:analyze},running?'영상 분석 중':'영상 분석'),
        uploadProgress!==null&&h('div',{className:'df-source',role:'status'},h('b',null,`영상 업로드 ${uploadProgress}%`),h('progress',{max:100,value:uploadProgress})),
        job&&h('div',{className:'df-source',role:'status'},h('b',null,job.stage),h('progress',{max:100,value:job.progress||0}),h('span',null,`${Math.round(job.progress||0)}%`),job.status==='error'&&h('span',{className:'df-alert'},job.error||'영상 분석에 실패했습니다.')),
        job?.status==='done'&&h('button',{className:'btn pri',onClick:()=>setStep(2)},'결과 보기'),h('div',{className:'df-source'},h('b',null,'결과 지도 고정'),h('span',null,'영상은 실제로 분석합니다. 3단계에는 현재 저장된 testload_1 가상지도를 항상 표시합니다.')));
    } else {
      preview=!resultReady?h(Empty,{number:'03',title:'아직 분석 결과가 없습니다'},h('p',null,'촬영 영상을 업로드하고 영상 분석을 완료하면 결과가 표시됩니다.')):fixed?h(FixedMap,{layout:fixed.layout,selected,onSelect:setSelected}):h(Empty,{number:'03',title:mapError||'고정 지도를 불러오는 중…'});
      controls=!resultReady?h('p',{className:'df-hint'},'2단계에서 촬영 영상을 업로드하고 영상 분석을 실행하세요.'):fixed?(panel?h(React.Fragment,null,h('button',{className:'btn fixed-summary-back',onClick:()=>setSelected(null)},'← 결과 요약'),h(PanelDetails,{panel,sourceJob})):h(React.Fragment,null,h('div',{className:'df-source'},h('b',null,'testload_1 · 고정 가상지도'),h('span',null,`등록 패널 ${fixed.layout.panels.length}개 · 새 분석 결과와 분리 표시`)),h(Counts,{layout:fixed.layout}),h('p',{className:'df-hint'},'패널을 선택하면 이 영역에 상세정보가 표시됩니다.'))):h('p',{className:'df-alert'},mapError||'지도 데이터 로딩 중');
    }
    return h('div',{className:'page df-flow inspection-031',style:{padding:0},'data-inspection-id':ins.id},
      h(TitleBar,{title:ins.id,meta:`${siteName(ins.site)} · ${ins.round}회차`,back:{label:pageLabel(ctx.R,'drone'),fn:()=>ctx.go('drone',{})}},h('span',{className:'df-tag'},'열 탐지 · 영상 분석 · 고정 결과')),
      h('nav',{className:'df-steps','aria-label':'드론 점검 3단계'},DF_STEPS.map((label,i)=>h('button',{key:label,'aria-current':step===i?'step':undefined,onClick:()=>setStep(i)},h('span',{className:'df-step-no'},i+1),h('span',null,label,h('small',null,['OBB 열 탐지 → 양 끝 번호 → 지그재그 경로','촬영 영상 업로드 → 실제 분석','testload_1 고정 가상지도'][i]))))),
      h('div',{className:'df-status',role:'status'},h('b',null,status)),error&&h('div',{className:'df-alert',role:'alert'},error),notice&&h('div',{className:'df-notice',role:'status'},notice),
      h('div',{className:'pgrid df-grid'},h('section',{className:'panel df-primary'},h('header',{className:'ph'},h('h3',null,['전사 이미지 · 탐지 및 경로','촬영 데이터 업로드 및 분석','testload_1 패널 가상지도'][step]),h('div',{className:'ph-r'},step===2&&resultReady&&fixed?`${fixed.layout.panels.length}개 패널`:'')),h('div',{className:'pb df-preview'},preview),
        h('footer',{className:'actbar'},h('span',{className:'df-foot'},step===2?(resultReady?'고정 지도 · 패널을 클릭하면 상세 내역이 표시됩니다.':'영상 분석 완료 후 결과가 표시됩니다.'):step===0?'열의 긴 축 양 끝을 순서대로 연결합니다.':'기존 5프레임 간격 탐지·추적·누적 판정'),h('div',{className:'df-actions'},step>0&&h('button',{className:'btn',onClick:()=>setStep(step-1)},'이전 단계'),step<2&&h('button',{className:'btn',onClick:()=>setStep(step+1)},'다음 단계 →')))),
        h('aside',{className:'panel'},h('header',{className:'ph'},h('h3',null,step===2&&panel?'패널 상세정보':DF_STEPS[step])),h('div',{className:'pb df-controls'+(step===2&&panel?' fixed-detail-view':'')},controls))));
  }
  const original = DroneFlow;
  DroneFlow = function(props){return props.ins.id==='INS-2026-031'?h(Inspection031,{...props,key:props.ins.id}):h(original,props);};
  window.DroneFlow=DroneFlow;
})();
