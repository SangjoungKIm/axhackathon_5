/* Fixed demo scenarios. Actual inference files and S1 data are untouched; S2 also has demo scenarios. */
(function(){
 const entries=[
  ['영광 홍농 솔라','전남 영광군 홍농읍',120,4,3,8],
  ['영광 법성 그린','전남 영광군 법성면',180,5,3,10],
  ['함평 나산 햇빛','전남 함평군 나산면',95,3,3,8],
  ['함평 해보 에너지','전남 함평군 해보면',250,6,4,10],
  ['장성 황룡 솔라','전남 장성군 황룡면',150,4,4,8],
  ['장성 동화 햇살','전남 장성군 동화면',320,6,4,12],
  ['나주 문평 그린','전남 나주시 문평면',200,5,4,10],
  ['나주 공산 에너지','전남 나주시 공산면',450,6,5,12],
  ['무안 현경 솔라','전남 무안군 현경면',280,5,4,12],
  ['무안 청계 햇빛','전남 무안군 청계면',500,6,5,14],
  ['영광 백수 2호','전남 영광군 백수읍',66,4,2,6,'S2']
 ];
 const cases=[
  {level:'ok',delta:-3,story:'세척 후 발전량 회복 · 정기 관리',soil:31,damage:0,missing:0,work:'완료',stage:5,kind:'먼지'},
  {level:'watch',delta:-18,story:'먼지 누적 · 세척 견적 비교',soil:6,damage:47,missing:1,work:'예정',stage:2,kind:'먼지'},
  {level:'inspect',delta:-36,story:'새똥·파손 복합 · 긴급 정비',soil:4,damage:13,missing:2,work:'진행',stage:4,kind:'새똥'},
  {level:'ok',delta:-5,story:'안정 운영 · 완료 보고 검수',soil:39,damage:0,missing:0,work:'검수 대기',stage:4,kind:'낙엽'},
  {level:'watch',delta:-21,story:'낙엽 오염 증가 · 업체 일정 조율',soil:5,damage:37,missing:1,work:'진행',stage:3,kind:'낙엽'},
  {level:'inspect',delta:-40,story:'오염 확산 · 세척 품질 미달 재작업',soil:3,damage:19,missing:3,work:'재작업',stage:5,kind:'먼지'},
  {level:'ok',delta:-2,story:'모듈 교체 후 회복 · 후속 점검 준비',soil:43,damage:0,missing:0,work:'완료',stage:1,kind:'먼지'},
  {level:'watch',delta:-17,story:'국부 파손 · 부품 입고 대기',soil:8,damage:23,missing:1,work:'보류',stage:2,kind:'새똥'},
  {level:'inspect',delta:-34,story:'발전량 급감 · 촬영 누락 재점검',soil:4,damage:17,missing:6,work:'검수 대기',stage:3,kind:'낙엽'},
  {level:'ok',delta:-4,story:'예방 정비 완료 · 다음 작업 승인',soil:47,damage:0,missing:0,work:'예정',stage:4,kind:'먼지'},
  {level:'ok',delta:-6,story:'정기 세척 후 안정 운영 · 작업 결과 검수',soil:17,damage:0,missing:0,work:'검수 대기',stage:4,kind:'먼지'}
 ];
 const allRoles=['owner','epc','drone','maint','total','master'];
 const names={owner:'김서연 (승인·검수)',epc:'박준호 (기술 검토)',drone:'최민재 (촬영)',maint:'정우성 (정비)',total:'오세훈 (통합 작업)',regional:'이하늘 (지역관리)'};
 const quote=(service,quantity,rate,version=1)=>({version,items:[[service,Math.max(1,quantity),rate],['출장비',1,60000]],tax:'별도',valid:'2026-11-20',hours:'3시간 (시연 견적)'});
 PV.demoSiteIds=[];PV.demoDataSiteIds=[];
 entries.forEach(([name,region,capacityKw,zones,rows,cols,existingId],index)=>{
  const id=existingId||`S${index+4}`,inspection=`INS-2026-${104+index}`,previous=`INS-2026-${204+index}`,upcoming=`INS-2026-${304+index}`,count=zones*rows*cols,c=cases[index];
  if(!existingId)PV.demoSiteIds.push(id);PV.demoDataSiteIds.push(id);
  PV.sites[id]={id,name,region,capacityKw,zones:'ABCDEF'.slice(0,zones).split(''),rows,cols,owner:'ORG-HB',epc:'ORG-DG',power:'sim',demo:true,annualDecline:0.45+index*.06,demoCase:c};
  Object.values(PV.roles).forEach(role=>{if(!role.sites.includes(id))role.sites.push(id)});
  const panels=PV.panelsOf(id);
  function observations(old=false){
   const obs={};panels.forEach((panel,n)=>{
    const review=n%3===0?'확인 완료':n%3===1?'미검토':'수정됨';
    const reviewed=review==='미검토'?{}:{reviewer:'박준호',reviewedAt:old?'2026-10-13 10:20':'2026-11-06 09:30'};
    if(n>=count-c.missing&&!old)obs[panel.id]={j:'und',reason:n%2?'촬영 누락 · 재촬영 배정':'흔들림으로 분석 실패 · 재분석 대기',review:'미검토'};
    else if(c.damage&&(n+index)%c.damage===0)obs[panel.id]={j:'dmg',pos:['중앙','우하단','좌측 프레임'][n%3],review,...reviewed,work:c.work};
    else if((n+index)%(old&&c.level==='ok'?7:c.soil)===0)obs[panel.id]={j:'soil',soil:n%3===0?c.kind:['먼지','새똥','낙엽'][(n+index)%3],review:review==='수정됨'?'확인 완료':review,...reviewed};
    else if(n%29===0&&!old)obs[panel.id]={j:'ok',ai:'soil',aiSoil:'먼지',review:'수정됨',reason:'구조물 그림자를 오염으로 분류하여 정상으로 수정',reviewer:'박준호',reviewedAt:'2026-11-06 09:35'};
   });return obs;
  }
  PV.observations[inspection]=observations();PV.observations[previous]=observations(true);
  PV.inspections[inspection]={id:inspection,site:id,round:2,purpose:`${c.level==='inspect'?'이상 징후 확인':'정기 외관'} 점검 (더미)`,status:c.missing?'검토·보완 대기':'인계 완료',stage:4,assignee:'drone',reviewer:'epc',captureAt:'2026-11-05 10:00~10:35',analysisAt:'2026-11-05 13:20',imageSrc:`시연 패널 ${count}장`,files:{received:count-Math.ceil(c.missing/2),analyzed:count-c.missing,failed:Math.floor(c.missing/2),missing:Math.ceil(c.missing/2)},source:'더미 데이터'};
  PV.inspections[previous]={id:previous,site:id,round:1,purpose:'이전 정기 점검 (더미)',status:'종료',stage:4,assignee:'drone',reviewer:'epc',captureAt:'2026-10-12 09:00~09:35',analysisAt:'2026-10-12 12:00',imageSrc:`시연 패널 ${count}장`,files:{received:count,analyzed:count,failed:0,missing:0},source:'더미 데이터'};
  const pendingStage=1+index%3;
  PV.inspections[upcoming]={id:upcoming,site:id,round:existingId?4:3,purpose:c.missing?'누락 패널 재촬영 (더미)':'작업 후 확인 점검 (더미)',status:['자료 준비','경로 검토','촬영'][pendingStage-1],stage:pendingStage,assignee:index===6?null:'drone',reviewer:'epc',captureAt:null,analysisAt:null,imageSrc:pendingStage>1?'시연 전경 이미지':null,files:{received:0,analyzed:0,failed:0,missing:0},source:'더미 데이터',mission:{planned:count/2,done:pendingStage===3?Math.floor(count/4):0,failed:pendingStage===3?1:0,state:pendingStage===3?'일시정지':'준비',routeVersion:`v${1+index%2}`,reviewedBy:'최민재',reviewedAt:'2026-11-07 09:00'}};
  const history=c.level==='ok'?[-11,-9,-7,-5,-4,-3]:c.level==='watch'?[-8,-10,-12,-14,-16,c.delta]:[-12,-17,-21,-26,-30,c.delta];
  PV.dailyDelta[id]={lastyear:history.map((v,d)=>[`11-0${d+1}`,v]),lastmonth:history.map((v,d)=>[`11-0${d+1}`,Math.round(((1+v/100)*84.6/80.2-1)*1000)/10])};
  const soil=panels.filter(p=>PV.observations[inspection][p.id]?.j==='soil').map(p=>p.id),damage=panels.filter(p=>PV.observations[inspection][p.id]?.j==='dmg').map(p=>p.id);
  const request=`REQ-DEMO-${index+1}`,workId=`WO-DEMO-${index+1}`,historyId=`WO-HISTORY-${index+1}`;
  const service=damage.length?'정비·세척':'세척',vendor=damage.length?'ORG-TM':'ORG-CP';
  const itemStates={'완료':['approved','approved'],'예정':['pending','pending'],'진행':['done','progress'],'검수 대기':['done','done'],'재작업':['approved','rework'],'보류':['done','hold']}[c.work];
  const targets=[...(damage.length?damage:soil),...panels.map(p=>p.id)].filter((v,n,a)=>a.indexOf(v)===n).slice(0,2);
  PV.workOrders[workId]={id:workId,site:id,service,team:vendor==='ORG-TM'?'태양정비 2팀':'클린PV 1팀',vendor,state:c.work,schedule:c.work==='예정'?'2026-11-11 09:00~12:00':'2026-11-07 09:00~12:00',approver:'김서연',reviewer:'김서연',quoteVersion:index===5?'v2 (보완 작업)':'v1',issuedAt:'2026-11-03 16:00',inspection:previous,next:({'완료':'다음 회차 상태 확인','예정':'일정에 맞춰 작업 시작','진행':'남은 대상 완료 보고','검수 대기':'사진·작업 결과 검수','재작업':'미흡 항목 보완 후 재보고','보류':'부품 입고 확인 후 재개'})[c.work],scope:`${targets.join(', ')} ${service} (더미)`,note:c.story+' · 시연용 작업 기록',items:targets.map((pid,n)=>({id:pid,label:`${pid} ${damage.length?'모듈·커넥터 점검':'패널 세척'}`,state:itemStates[n],reportedAt:itemStates[n]==='pending'?null:'11-07 10:20',evidence:itemStates[n]==='pending'?0:itemStates[n]==='progress'?1:2,result:({'pending':'시작 전','progress':'작업 진행 중','done':'완료 보고 · 검수 대기','approved':'검수 승인 완료','rework':'세척 잔여 오염 · 재작업 요청','hold':'커넥터 부품 입고 대기'})[itemStates[n]],material:damage.length?'커넥터 2개':'순수 120L',...(itemStates[n]==='hold'?{holdReason:'부품 입고 예정 2026-11-12'}:{}),...(itemStates[n]==='rework'?{review:'반려: 패널 가장자리 오염 잔류 · 추가 세척 후 사진 제출'}:{})})),cost:{base:240000+index*25000,extra:index===5?35000:0,tax:'별도'}};
  PV.workOrders[historyId]={...PV.workOrders[workId],id:historyId,service:'세척',vendor:'ORG-CP',team:'클린PV 2팀',state:'완료',schedule:'2026-10-20 09:00~12:00',issuedAt:'2026-10-16 14:00',quoteVersion:'v1',next:'종료',scope:'A구역 예방 세척 (더미)',note:'이전 회차 오염 개선 완료',items:[{id:'A구역',label:'A구역 예방 세척',state:'approved',reportedAt:'10-20 12:00',evidence:2,result:'세척·검수 완료',material:'순수 150L',review:'김서연 · 검수 승인'}]};
  const vendors=[{org:'ORG-CP',service:'세척',quote:quote('패널 세척',soil.length,16000+index*500),slots:[['2026-11-10',9,12],['2026-11-11',13,16]],team:'1팀 (3명)',response:c.stage>=3?'일정 제안':'견적 제출'},
                 {org:'ORG-TM',service:'정비',quote:index%3===1&&c.stage<3?null:quote('모듈 점검',damage.length,45000),onsite:index%3===1,slots:c.stage>=3?[['2026-11-12',13,16]]:[],team:'정비 2팀',response:index%3===1&&c.stage<3?'현장 확인 후 견적':'견적 제출'},
                 {org:'ORG-TO',service:'종합',quote:index%2?quote('통합 유지보수',1,300000+index*10000):null,slots:index%2?[['2026-11-13',9,12]]:[],team:index%2?'통합 1팀':'미등록',response:index%2?'견적 제출':'가능 여부 확인 필요'}];
  const selected={'ORG-CP':c.stage>=2,'ORG-TM':c.stage>=2&&damage.length>0},schedule=Object.fromEntries(vendors.map(v=>[v.org,c.stage>=4&&selected[v.org]?v.slots[0]||null:null]));
  PV.requests[request]={id:request,site:id,inspection,stage:c.stage,requester:'박준호',approver:'김서연',assignee:c.stage===2?'김서연':c.stage===3?'클린PV 배차 담당':'김서연',due:'2026-11-10 18:00',panels:{soil:soil.slice(0,8),dmg:damage.slice(0,3)},services:damage.length?['세척','정비']:['세척'],note:c.story+' (더미)',wish:'2026-11-10 ~ 2026-11-14 오전',vendors,selected,schedule,responses:{requester:c.stage===5||c.stage===4&&index%2?'수락':'대기',vendor:c.stage===5?'수락':'대기'},...(c.stage===5?{wo:workId}:{}),...(index===4?{changeNote:'낙엽 제거 후 세척 순서로 일정 변경 요청'}:{})};
  function task(suffix,title,kind,stage,assignee,next,link,due,roles=allRoles){
   const tid=`T-DEMO-${index+1}-${suffix}`;
   PV.tasks.push({id:tid,site:id,title:`${title} (더미)`,kind,stage,assignee,assigneeLabel:assignee?names[assignee]:'미배정',next,due,approver:'김서연',reviewer:'박준호',link,changes:[['11-07 10:30',next],['11-06 16:00',c.story],['11-05 13:20','2회차 점검 결과 수신']],roles});return tid;
  }
  const reviewTask=task('REVIEW','2회차 패널 상태·점검 계획 확인','검토','진행','owner',c.level==='ok'?'회복 추세 확인 및 정기 관리 계획 승인':'감소 추세·문제 패널 확인 후 조치 범위 결정',{screen:'panels',id:inspection},'2026-11-07 17:00',['owner','epc','master']);
  const approvalTask=task('APPROVAL',`${service} 요청·견적·일정 승인`,'승인',c.stage===5?'종료':['요청 범위','업체·견적','일정 조율','최종 확인'][c.stage-1],'owner',c.stage===5?'양측 수락 및 작업지시 발행 완료':c.stage===2?'견적 2~3건 비교 후 업체 선택':'요청 범위·제안 일정 확인 후 응답',{screen:'schedule',id:request},index%3===0?'2026-11-07 10:00':'2026-11-09 18:00',['owner','epc','maint','total','master']);
  const workTask=task('WORK',`${service} 작업·결과 ${c.work}`,'작업',c.work==='완료'?'종료':c.work,c.work==='검수 대기'?'owner':'maint',PV.workOrders[workId].next,{screen:'work',id:workId},'2026-11-07 18:00',allRoles);
  const droneTask=task('CAPTURE',PV.inspections[upcoming].purpose.replace(' (더미)',''),'점검',index===6?'담당 배정':['자료 준비','경로 검토','촬영'][pendingStage-1],index===6?null:'drone',c.missing?'미수집 패널 재촬영 및 자료 업로드':'현장 일정 확인 후 점검 진행',{screen:'drone',id:upcoming},'2026-11-08 16:00',['owner','epc','drone','master']);
  task('TECH','오염·파손 분류 기술 검토','검토',index%2?'진행':'상대 응답 대기','epc',c.missing?'흔들림·누락 자료 보완 후 재판정':'미검토 판정 확인 및 그림자 오탐 수정',{screen:'panels',id:inspection},index%2?'2026-11-07 11:00':'2026-11-09 15:00',['owner','epc','master']);
  const regionTask=task('SHARE','지역 유지보수 현황 공유 요청','요청','상대 응답 대기','regional','운영 현황 공유 요청 회신 확인',null,'2026-11-10 18:00',['owner','regional','master']);
  [[reviewTask,'점검 결과 확인 요청','김서연',['owner','epc','master']],[approvalTask,'견적·일정 응답 요청','김서연',['owner','epc','maint','total','master']],[workTask,`${c.work} 작업 보고`,'담당자',['owner','epc','maint','total','master']],[droneTask,'후속 점검·재촬영 배정','최민재',['drone','epc','master']],[regionTask,'발전소 운영 현황 공유 요청','이하늘',['regional','owner','master']]].forEach(([tid,cause,who,roles],n)=>PV.notifications.push({id:`N-DEMO-${index+1}-${n}`,site:id,at:`10:${String(10+n*5).padStart(2,'0')}`,cause:`${name} · ${cause} (더미)`,task:tid,who,next:PV.tasks.find(t=>t.id===tid).next,unread:n%2===0,roles}));
  if(existingId)PV.settings['발전소·패널']=PV.settings['발전소·패널'].filter(s=>s.name!==name);
  PV.settings['발전소·패널'].push({name,sub:`${count}패널 · ${zones}구역 · ${capacityKw} kW · 더미 데이터`,meta:`시나리오: ${c.story}`});
 });
 // Keep S2's original live simulation mission, now between the saved and planned rounds.
 PV.inspections['INS-2026-033'].round=3;
 PV.inspections['INS-2026-033'].purpose='세척 후 드론 후속 점검';
 const originalS2Task=PV.tasks.find(t=>t.id==='T-1042');
 if(originalS2Task)originalS2Task.title='3회차 드론 점검 촬영';
 const originalPower=PV.powerSeries;
 PV.powerSeries=function(siteId,day){
  const site=PV.sites[siteId];if(!site?.demo)return originalPower(siteId,day);
  const scale=site.capacityKw/98.6,c=site.demoCase;
  // All comparisons share daylight samples; only magnitude differs. This keeps
  // normal/watch/inspect scenarios stable for either baseline and simulation time.
  const magnitude=day==='today'?1+c.delta/100:day==='lastmonth'?80.2/84.6:1;
  return originalPower('S1','lastyear').filter(s=>!(day==='today'&&siteId==='S12'&&s.t>=605&&s.t<=615)).map(s=>({t:s.t,kw:Math.round(Math.max(0,s.kw*scale*magnitude*(day==='today'?1+.008*Math.sin(s.t/23+site.capacityKw):1))*10)/10}));
 };
 PV.demoAssessment=function(siteId,comparison='lastyear',now=PV.sim.state.clockMin){
  const energy=PV.energyKwh(PV.powerSeries(siteId,'today').filter(s=>s.t<=now));
  const base=PV.energyKwh(PV.powerSeries(siteId,comparison).filter(s=>s.t<=now));
  const delta=base.kwh>0?(energy.kwh/base.kwh-1)*100:null;
  return {delta,level:PV.levelOf(delta)};
 };
})();
