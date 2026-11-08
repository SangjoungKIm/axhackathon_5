/* Single-site deployment and migration of existing browser workspaces. */
(function () {
  'use strict';
  const SITE='YA', NAME='교통문화연수원';
  const rename=value=>{
    if(typeof value==='string')return value.startsWith('data:')?value:value.replaceAll('영암 1단지',NAME);
    if(Array.isArray(value))return value.map(rename);
    if(value&&typeof value==='object')for(const key of Object.keys(value))value[key]=rename(value[key]);
    return value;
  };
  function retainSite(ops) {
    if(!ops||typeof ops!=='object')return ops;
    for(const key of ['inspections','requests','workOrders'])if(ops[key]&&typeof ops[key]==='object')
      for(const [id,item] of Object.entries(ops[key]))if(item.site!==SITE)delete ops[key][id];
    if(ops.obs&&ops.inspections)for(const id of Object.keys(ops.obs))if(!ops.inspections[id])delete ops.obs[id];
    // Each visit starts a fresh upload session; discard previously cached media/jobs.
    if(ops.inspections?.['INS-2026-031'])delete ops.inspections['INS-2026-031'].inspection031;
    if(Array.isArray(ops.tasks))ops.tasks=ops.tasks.filter(task=>task.site===SITE);
    const taskIds=new Set((ops.tasks||TASKS_INIT).map(task=>task.id));
    if(Array.isArray(ops.notifications))ops.notifications=ops.notifications.filter(n=>n.site?n.site===SITE:taskIds.has(n.task));
    if(ops.settings){
      const keepName=item=>item.name?.includes('영암 1단지')||item.name?.includes(NAME);
      for(const group of ['발전소·패널','위임·승인'])if(Array.isArray(ops.settings[group]))ops.settings[group]=ops.settings[group].filter(keepName);
      for(const item of ops.settings['조직·계정']||[])if(Array.isArray(item.fields))item.fields=item.fields.map(([key,value])=>[key,key==='접근 발전소'?NAME:value]);
    }
    return rename(ops);
  }
  for(const role of Object.values(ROLES)){role.sites=[SITE];if(role.shared)role.shared=[SITE];}
  TASKS_INIT.splice(0,TASKS_INIT.length,...TASKS_INIT.filter(t=>t.site===SITE));rename(TASKS_INIT);
  const init=OPS.init;OPS.init=()=>retainSite(init());
  const expand=AXDemo.expand;AXDemo.expand=ops=>retainSite(expand(retainSite(ops)));
  const read=AXStore.read,write=AXStore.write;
  AXStore.read=async()=>{const record=await read();if(record?.version===1&&record.ops)record.ops=retainSite(record.ops);return record;};
  AXStore.write=ops=>write(retainSite(ops));
  try {
    const state=JSON.parse(localStorage.getItem('ax-solar-v4'))||{};
    state.site=SITE;state.ctxSite=SITE;
    if(!state.inv?.startsWith('YA-'))state.inv='YA-17';
    if(state.route?.params?.site&&state.route.params.site!==SITE)state.route={screen:'home',params:{}};
    localStorage.setItem('ax-solar-v4',JSON.stringify(state));
  } catch {}
  window.AXSingleSite={id:SITE,name:NAME,retain:retainSite};
})();
