/* Independent of the atlas module so import/data failures retain a way out. */
(()=>{
 const layer=document.getElementById('atlas-intro'),app=document.getElementById('atlas-app');
 if(!layer||!app)return;
 const status=document.getElementById('intro-status'),detail=document.getElementById('intro-detail');
 const retry=document.getElementById('intro-retry'),leave=document.getElementById('intro-leave');
 let closed=false,retryAction=()=>location.reload(),watchdog;
 const previousFocus=document.activeElement;
 function stage(text,note='',step='data'){
  if(closed)return;
  layer.dataset.phase=step;layer.classList.remove('intro-error');
  status.textContent=text;detail.textContent=note;
  for(const item of layer.querySelectorAll('[data-intro-step]')){
   if(item.dataset.introStep===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
  }
 }
 function fail(message='지도를 불러오지 못했습니다.'){
  if(closed)return;clearTimeout(watchdog);layer.classList.add('intro-error');layer.dataset.phase='error';
  status.textContent=message;detail.textContent='다시 시도하거나 지도 화면으로 나갈 수 있습니다.';
 }
 function arm(){clearTimeout(watchdog);watchdog=setTimeout(()=>fail('연결이 지연되고 있습니다.'),45000);}
 function dismiss(){
  if(closed)return;closed=true;clearTimeout(watchdog);
  const ownedFocus=layer.contains(document.activeElement);
  app.inert=false;document.documentElement.classList.remove('intro-open');
  layer.classList.add('intro-leaving');layer.setAttribute('aria-hidden','true');layer.inert=true;
  if(ownedFocus){const target=previousFocus!==document.body&&previousFocus?.isConnected?previousFocus:document.getElementById('current-title');target?.focus({preventScroll:true});}
  const finish=()=>{layer.hidden=true;};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)finish();
  else{layer.addEventListener('transitionend',finish,{once:true});setTimeout(finish,280);}
  window.removeEventListener('error',handleError,true);window.removeEventListener('unhandledrejection',handleRejection);
 }
 function handleError(event){if(event.target?.tagName==='SCRIPT'||event.error)fail('지도 프로그램을 시작하지 못했습니다.');}
 function handleRejection(){fail('지도를 준비하는 중 문제가 발생했습니다.');}
 retry.addEventListener('click',event=>{event.preventDefault();if(closed)return;stage('다시 지도를 불러오는 중…','','map');arm();retryAction();});
 leave.addEventListener('click',event=>{event.preventDefault();dismiss();});
 layer.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();dismiss();}
  if(event.key==='Tab'){
   const controls=[retry,leave],first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&(!controls.includes(document.activeElement)||document.activeElement===first)){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(!controls.includes(document.activeElement)||document.activeElement===last)){event.preventDefault();first.focus();}
  }
 });
 window.AtlasIntro={stage,fail,ready:dismiss,setRetry:fn=>{if(!closed)retryAction=fn;}};
 window.addEventListener('error',handleError,true);window.addEventListener('unhandledrejection',handleRejection);
 if(location.hash==='#intro-bypass'){dismiss();return;}
 app.inert=true;document.documentElement.classList.add('intro-open');
 document.getElementById('intro-title').focus({preventScroll:true});arm();
})();
