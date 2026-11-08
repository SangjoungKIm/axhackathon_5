/* Floating chat UI. Only the same-origin proxy receives user questions. */
(function () {
  'use strict';
  const h=React.createElement;
  const {useState,useEffect,useRef}=React;
  const endpoint=path=>new URL(path,new URL('./',location.href)).href;
  function Icon({name}) {
    const paths={chat:'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 4V6a2 2 0 0 1 2-2Z',close:'m6 6 12 12M6 18 18 6',send:'m3 3 18 9-18 9 4-9-4-9Zm4 9h14',plus:'M12 5v14M5 12h14',stop:'M6 6h12v12H6Z'};
    return h('svg',{width:22,height:22,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.7,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:paths[name]}));
  }
  async function events(response,receive) {
    if(!response.headers.get('content-type')?.includes('application/x-ndjson'))throw new Error('챗봇 응답 형식을 확인할 수 없습니다.');
    const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let buffer='',completed=false;
    const line=value=>{if(!value.trim())return;const event=JSON.parse(value);receive(event);if(event.type==='turn.completed')completed=true;if(event.type==='turn.failed')throw new Error(event.message||'답변 생성이 중단되었습니다.');};
    try {
      while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});if(buffer.length>1048576)throw new Error('챗봇 응답이 너무 큽니다.');let cut;while((cut=buffer.indexOf('\n'))>=0){line(buffer.slice(0,cut));buffer=buffer.slice(cut+1);}}
      buffer+=decoder.decode();if(buffer.trim())line(buffer);if(!completed)throw new Error('답변 연결이 중단되었습니다. 새 대화를 시작해 주세요.');
    } finally {reader.releaseLock();}
  }
  function ChatWidget(){
    const [open,setOpen]=useState(false),[theme,setTheme]=useState('dark'),[health,setHealth]=useState('unknown');
    const [messages,setMessages]=useState([]),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[restart,setRestart]=useState(false);
    const textarea=useRef(null),launcher=useRef(null),end=useRef(null),controller=useRef(null),cid=useRef(null),locked=useRef(false);
    useEffect(()=>{const sync=()=>{const next=document.querySelector('.stage')?.dataset.theme||'dark';setTheme(previous=>previous===next?previous:next);};sync();const observer=new MutationObserver(sync);observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-theme']});return()=>observer.disconnect();},[]);
    useEffect(()=>{if(open){textarea.current?.focus();let live=true;fetch(endpoint('api/chat/health'),{credentials:'same-origin'}).then(async r=>{const doc=await r.json();if(live)setHealth(r.ok?doc.status:'unhealthy');}).catch(()=>{if(live)setHealth('unhealthy');});return()=>{live=false;};}},[open]);
    useEffect(()=>{end.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[messages,busy,open]);
    useEffect(()=>{if(!open)return;const key=e=>{if(e.key==='Escape'){setOpen(false);launcher.current?.focus();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[open]);
    const update=(id,patch)=>setMessages(previous=>previous.map(m=>m.id===id?{...m,...(typeof patch==='function'?patch(m):patch)}:m));
    const send=async value=>{
      const text=(value??draft).trim();if(!text||locked.current||restart)return;
      locked.current=true;setBusy(true);setError('');setDraft('');
      const uid=crypto.randomUUID(),aid=crypto.randomUUID();setMessages(previous=>[...previous,{id:uid,role:'user',text},{id:aid,role:'assistant',text:'',status:'generating'}]);
      const abort=new AbortController();controller.current=abort;let timedOut=false,answer='';const timer=setTimeout(()=>{timedOut=true;abort.abort();},125000);
      try {
        const response=await fetch(endpoint('api/chat/messages'),{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:text,conversation_id:cid.current}),signal:abort.signal});
        if(!response.ok){let message='챗봇 요청에 실패했습니다.';try{const data=await response.json();if(typeof data.detail==='string')message=data.detail;}catch{}throw new Error(message);}
        await events(response,event=>{if(event.type==='conversation.created')cid.current=event.conversation_id;if(event.type==='assistant.delta'&&typeof event.content==='string'){answer+=event.content;update(aid,{text:answer});}});
        if(!answer.trim())throw new Error('챗봇이 답변 텍스트를 보내지 않았습니다. 새 대화로 다시 시도해 주세요.');
        update(aid,{status:'completed'});setHealth('healthy');
      } catch(e){const message=abort.signal.aborted?(timedOut?'응답 시간이 초과되었습니다. 새 대화를 시작해 주세요.':'응답을 중지했습니다. 새 대화를 시작해 주세요.'):e.message||'연결 중 오류가 발생했습니다.';setError(message);update(aid,{status:abort.signal.aborted?'cancelled':'failed'});setRestart(!!cid.current);}
      finally{clearTimeout(timer);locked.current=false;controller.current=null;setBusy(false);textarea.current?.focus();}
    };
    const fresh=()=>{if(locked.current)return;cid.current=null;setMessages([]);setError('');setRestart(false);setDraft('');textarea.current?.focus();};
    const close=()=>{setOpen(false);launcher.current?.focus();};
    return h('div',{className:'axchat','data-theme':theme},
      open&&h('section',{className:'axchat-panel',role:'dialog','aria-label':'AI 도우미'},
        h('header',{className:'axchat-header'},h('span',{className:'axchat-mark'},h(Icon,{name:'chat'})),h('div',{className:'axchat-heading'},h('h2',null,'AI 도우미'),h('span',{className:'axchat-connection'},h('i',{'data-status':health}),health==='healthy'?'연결됨':health==='unhealthy'?'연결 확인 필요':'연결 확인 중')),
          h('button',{type:'button',className:'axchat-icon','aria-label':'새 대화',title:'새 대화',disabled:busy,onClick:fresh},h(Icon,{name:'plus'})),h('button',{type:'button',className:'axchat-icon','aria-label':'챗봇 창 닫기',onClick:close},h(Icon,{name:'close'}))),
        h('div',{className:'axchat-messages',role:'log','aria-label':'대화 내용','aria-live':'polite','aria-relevant':'additions text'},
          !messages.length&&h('div',{className:'axchat-welcome'},h('div',{className:'axchat-welcome-icon'},h(Icon,{name:'chat'})),h('h3',null,'무엇을 도와드릴까요?'),h('p',null,'궁금한 내용을 편하게 질문해 보세요.'),h('button',{className:'axchat-suggestion',type:'button',onClick:()=>send('어떤 도움을 받을 수 있나요?')},'어떤 도움을 받을 수 있나요? ↗')),
          messages.map(m=>h('article',{key:m.id,className:'axchat-message axchat-'+m.role,'data-status':m.status||'sent'},h('div',{className:'axchat-author'},m.role==='user'?'나':'AI 도우미'),h('div',{className:'axchat-bubble'},m.text||(m.status==='generating'?h('span',{className:'axchat-typing'},'답변을 작성하고 있어요',h('span',null,'…')):'응답을 받지 못했습니다.')),m.role==='assistant'&&h('div',{className:'axchat-turn-status'},({generating:'생성 중',completed:'답변 완료',cancelled:'중지됨',failed:'완료되지 않음'})[m.status]))),h('div',{ref:end})),
        error&&h('div',{className:'axchat-error',role:'alert'},error,restart&&h('button',{type:'button',onClick:fresh},'새 대화')),
        h('form',{className:'axchat-compose',onSubmit:e=>{e.preventDefault();send();}},h('label',{className:'sr-only',htmlFor:'axchat-input'},'챗봇 질문'),h('textarea',{ref:textarea,id:'axchat-input',rows:2,maxLength:8000,placeholder:restart?'새 대화를 시작해 주세요':'메시지를 입력하세요',value:draft,disabled:busy||restart,onChange:e=>setDraft(e.target.value),onKeyDown:e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}),
          busy?h('button',{type:'button',className:'axchat-send axchat-stop','aria-label':'답변 생성 중지',title:'답변 생성 중지',onClick:()=>controller.current?.abort()},h(Icon,{name:'stop'})):h('button',{type:'submit',className:'axchat-send','aria-label':'질문 보내기',disabled:!draft.trim()||restart},h(Icon,{name:'send'}))),
        h('footer',{className:'axchat-footer'},'AI가 생성한 답변입니다. 중요한 내용은 확인해 주세요.')),
      h('button',{ref:launcher,type:'button',className:'axchat-launcher','aria-label':open?'챗봇 닫기':'챗봇 열기','aria-expanded':open,'aria-haspopup':'dialog',onClick:()=>setOpen(v=>!v)},h(Icon,{name:open?'close':'chat'}),!open&&h('span',null,'AI 도우미')));
  }
  const root=document.createElement('div');root.id='axchat-root';document.body.append(root);ReactDOM.createRoot(root).render(h(ChatWidget));
  window.AXChatStream={events};
})();
