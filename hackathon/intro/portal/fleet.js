/* Portfolio navigation for existing sites and ten additional demo sites. */
(function(){
 PV.renderFleet=function(page,ctx){
  page.classList.add('fleet-page');const body=PV.h('div',{class:'body fleet-body'}),allowed=PV.allowedSites(),scope=ctx.site?[ctx.site]:allowed;
  body.append(PV.h('div',{class:'strip fleet-strip'},PV.stat({label:'등록 발전소',value:Object.keys(PV.sites).length,unit:'개',sub:`기존 3개 + 신규 더미 10개 · 열람 가능 ${allowed.length}개`}),PV.stat({label:'추가된 더미 발전소',value:PV.demoSiteIds.length,unit:'개',sub:'발전량 · 패널 상태 · 유지보수 기록'}),PV.stat({label:'추가 설비 용량 · 더미',value:PV.fmtNum(PV.demoSiteIds.reduce((sum,id)=>sum+PV.sites[id].capacityKw,0)),unit:'kW',sub:'추가 발전소 10개의 가상 설비 용량'})));
  const state=ctx.state;state.fleetFilter=['all','demo'].includes(state.fleetFilter)?state.fleetFilter:'all';
  const grid=PV.h('div',{class:'fleet-grid'}),counter=PV.h('span',{class:'muted'}),search=PV.h('input',{class:'input fleet-search',type:'search',placeholder:'발전소 이름 또는 지역 검색','aria-label':'발전소 검색',value:state.fleetSearch||''});
  const filterBar=PV.h('div',{class:'chips'});
  const draw=()=>{
   grid.innerHTML='';filterBar.innerHTML='';
   [['all','전체'],['demo','더미 데이터']].forEach(([key,label])=>filterBar.append(PV.h('button',{class:'chip','aria-pressed':String(state.fleetFilter===key),onClick:()=>{state.fleetFilter=key;draw()}},label)));
   const term=(state.fleetSearch||'').trim().toLowerCase();let visible=0;
   scope.forEach(id=>{
    const site=PV.sites[id],assessment=site.demo?PV.demoAssessment(id):null;
    if(state.fleetFilter==='demo'&&!site.demo||term&&!`${site.name} ${site.region}`.toLowerCase().includes(term))return;
    visible++;const panels=PV.panelsOf(id),inspection=PV.roundsOf(id)[0],obs=PV.observations[inspection?.id]||{},soil=Object.values(obs).filter(o=>o.j==='soil').length,dmg=Object.values(obs).filter(o=>o.j==='dmg').length;
    const today=PV.powerSeries(id,'today').filter(s=>s.t<=PV.sim.state.clockMin),energy=PV.energyKwh(today);
    const actions=PV.h('div',{class:'fleet-site__actions'});
    if(ctx.def.menu.includes('panels'))actions.append(PV.h('button',{class:'btn',onClick:()=>PV.go('panels',{site:id})},'패널 배치도 보기'));
    if(['owner','epc','regional','master'].includes(ctx.role))actions.append(PV.h('button',{class:'btn btn--sm',onClick:()=>{PV.uiState.home=PV.uiState.home||{};PV.uiState.home.tab='power';PV.app.site=id;localStorage.setItem('pv.site',id);PV.go('home');PV.renderRoute()}},'발전 현황'));
    const card=PV.h('article',{class:'card fleet-site','data-site-id':id},PV.h('div',{class:'fleet-site__head'},PV.h('span',{class:'fleet-site__id'},id),PV.badge(site.demo?'더미 데이터':'기존 발전소','src')),PV.h('h3',null,site.name),assessment?PV.badge(`점검 필요도 · ${PV.levelMeta[assessment.level].label}`,assessment.level==='inspect'?'dmg':assessment.level==='watch'?'soil':'ok'):null,PV.h('p',{class:'small muted'},site.region),PV.h('div',{class:'fleet-metrics'},PV.h('div',null,PV.h('span',null,'설비 용량'),PV.h('strong',null,site.capacityKw?`${PV.fmtNum(site.capacityKw)} kW`:'미등록')),PV.h('div',null,PV.h('span',null,'오늘 발전량 · 더미'),PV.h('strong',null,today.length?`${PV.fmtNum(energy.kwh)} kWh`:'미수집'))),PV.h('p',{class:'fleet-site__status'},site.demo?`${site.demoCase.story} · 패널 ${panels.length}개 · 오염 ${soil} · 파손 ${dmg} · 연간 감소율 ${site.annualDecline.toFixed(2)}% (더미)`:`등록 패널 ${panels.length}개 · 시연용 현황`),actions);
    grid.append(card);
   });
   counter.textContent=`${visible}개 발전소`;
   if(!visible)grid.append(PV.h('p',{class:'muted'},'조건에 맞는 발전소가 없습니다.'));
  };
  search.oninput=()=>{state.fleetSearch=search.value;draw()};
  body.append(PV.h('div',{class:'fleet-heading'},PV.h('div',{class:'hstack'},PV.h('h2',null,'발전소 목록'),counter),filterBar,search),grid);draw();
  page.append(body,PV.h('footer',{class:'bar'},PV.h('span',{class:'bar__info'},'추가 발전소 10개의 발전량·패널 상태·유지보수 이력은 더미 데이터입니다.')));
 };
 const panels=PV.screens.panels;
 PV.screens.panels=function(page,ctx){if(!ctx.params.site&&!ctx.params.job&&!ctx.params.round&&!ctx.site){page.append(PV.titleBar('패널 상태','발전소별 가상지도'));PV.renderFleet(page,ctx);return}panels(page,ctx)};
})();
