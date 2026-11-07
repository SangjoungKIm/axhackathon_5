(function(){
 const ns='http://www.w3.org/2000/svg';
 const node=(tag,attrs={},text)=>{const e=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(text!==undefined)e.textContent=text;return e};
 PV.real.stateKey=p=>({clean:'ok',dirty:'soil',crack:'dmg',insufficient:'und',undetected:'miss'}[p.status]||'und');
 PV.real.stateLabel=p=>({clean:'외관 정상',dirty:'오염',crack:'육안상 파손',insufficient:'미판정',undetected:'미탐지'}[p.status]||'미판정');
 PV.real.badge=p=>PV.badge(PV.real.stateLabel(p),PV.real.stateKey(p)==='miss'?'und':PV.real.stateKey(p),p.status==='dirty'?'dust':p.status==='crack'?'crack':['undetected','insufficient'].includes(p.status)?'help':null);
 PV.realMap=function(layout,opt={}){
  const wrap=PV.h('div',{class:'map real-map'}),svg=node('svg',{role:'group','aria-label':'영상 분석 기반 태양광 패널 배치도'});let y=35;const rowY={};for(const r of layout.rows){rowY[r.row]=y;y+=r.lanes*23+40}const W=Math.max(440,62+Math.max(...layout.rows.map(r=>r.cols))*32),H=Math.max(290,y-10);let vb={x:0,y:0,w:W,h:H};const set=()=>svg.setAttribute('viewBox',`${vb.x} ${vb.y} ${vb.w} ${vb.h}`);set();
  const defs=node('defs'),hatch=node('pattern',{id:'real-hatch',width:6,height:6,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'});hatch.append(node('rect',{width:6,height:6,fill:'#eef1f5'}),node('rect',{width:2,height:6,fill:'#c2cad6'}));defs.append(hatch);svg.append(defs);
  for(const r of layout.rows)svg.append(node('text',{x:34,y:rowY[r.row]+r.lanes*11.5,'text-anchor':'end',class:'zone-label'},`${r.row}열`));
  for(const p of layout.panels){const x=46+(p.col-1)*32,py=rowY[p.row]+(p.lane-1)*23;const key=PV.real.stateKey(p),dim=opt.dimFn?.(p);const g=node('g',{class:'panel'+(dim?' dim':''),'data-j':key==='miss'?'und':key,'data-id':p.pid,'data-state':p.status,role:'button',tabindex:0,'aria-label':`${p.pid} ${PV.real.stateLabel(p)}`,'aria-selected':String(p.pid===opt.selected)});g.append(node('title',{},`${p.pid} · ${PV.real.stateLabel(p)}${p.synthetic?' · 관측 근거 없는 보완 위치':''}`));const rect=node('rect',{x,y:py,width:28,height:19,rx:2});if(key==='und'||key==='miss')rect.style.fill='url(#real-hatch)';g.append(rect);
   if(key==='soil'){const marks=node('g',{class:'mark'});for(const [dx,dy] of [[7,5],[14,4],[19,8],[12,12]])marks.append(node('circle',{cx:x+dx,cy:py+dy,r:1}));g.append(marks)}
   if(key==='dmg')g.append(node('path',{class:'mark',d:`M${x+10} ${py+3}l4 5-3 3 5 5`}));
   if(key==='miss'||key==='und')g.append(node('text',{x:x+14,y:py+13,'text-anchor':'middle',style:'font-size:10px;fill:#77889f'},'?'));
   if(key==='ok')g.append(node('text',{x:x+14,y:py+13,'text-anchor':'middle',class:'real-number'},String(p.col)));
   if(new Set(p.seen_in_segments).size>1)g.append(node('circle',{cx:x+24,cy:py+3,r:1.4,class:'real-marker'}));

   const pick=e=>opt.onPick?.(p,e);g.onclick=pick;g.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(e)}};svg.append(g)
  }
  wrap.append(svg);const zoom=f=>{const cx=vb.x+vb.w/2,cy=vb.y+vb.h/2;vb.w=Math.max(W/8,Math.min(W*1.5,vb.w/f));vb.h=vb.w*H/W;vb.x=cx-vb.w/2;vb.y=cy-vb.h/2;set()};wrap.append(PV.h('div',{class:'map__tools'},PV.h('button',{class:'icon-btn','aria-label':'배치도 확대',onClick:()=>zoom(1.3)},PV.icon('plus')),PV.h('button',{class:'icon-btn','aria-label':'배치도 축소',onClick:()=>zoom(1/1.3)},PV.icon('minus')),PV.h('button',{class:'icon-btn','aria-label':'배치도 전체 맞춤',onClick:()=>{vb={x:0,y:0,w:W,h:H};set()}},PV.icon('fit'))));
  let drag=null;svg.onpointerdown=e=>{if(e.target.closest('.panel'))return;drag={x:e.clientX,y:e.clientY,vx:vb.x,vy:vb.y};svg.setPointerCapture(e.pointerId)};svg.onpointermove=e=>{if(!drag)return;const rect=svg.getBoundingClientRect(),scale=vb.w/rect.width;vb.x=drag.vx-(e.clientX-drag.x)*scale;vb.y=drag.vy-(e.clientY-drag.y)*scale;set()};svg.onpointerup=()=>drag=null;svg.onpointercancel=()=>drag=null;svg.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.1:1/1.1)},{passive:false});
  wrap.append(PV.h('div',{class:'map__legend'},PV.badge('외관 정상','ok'),PV.judgBadge('soil'),PV.judgBadge('dmg'),PV.badge('미탐지·미판정','und','help')));return wrap
 };
})();
