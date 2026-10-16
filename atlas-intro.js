/* Independent of the atlas module so import/data failures retain a way out. */
(()=>{
 const layer=document.getElementById('atlas-intro'),app=document.getElementById('atlas-app');
 if(!layer||!app)return;
 const status=document.getElementById('intro-status'),detail=document.getElementById('intro-detail');
 const retry=document.getElementById('intro-retry'),leave=document.getElementById('intro-leave');
 const progress=document.getElementById('intro-progress'),fill=document.getElementById('intro-fill'),percent=document.getElementById('intro-percent');
 const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
 let closed=false,retryAction=()=>location.reload(),watchdog;
 let mapReady=false,failed=false,visibleMs=0,lastFrame=null,frame=0,finishTimer=0;
 const previousFocus=document.activeElement;
 function paintProgress(value){
  const rounded=Math.floor(value);
  percent.textContent=rounded+'%';progress.setAttribute('aria-valuenow',rounded);
  fill.style.transform='scaleX('+(value/100)+')';
 }
 function stopProgress(){cancelAnimationFrame(frame);frame=0;lastFrame=null;clearTimeout(finishTimer);finishTimer=0;}
 function animate(){
  const time=performance.now();
  frame=0;if(closed||failed)return;
  if(!document.hidden&&lastFrame!==null)visibleMs+=time-lastFrame;
  lastFrame=document.hidden?null:time;
  const elapsed=Math.min(1,visibleMs/3000),value=95*(1-(1-elapsed)**2);
  paintProgress(reducedMotion.matches&&elapsed<1?Math.floor(value/10)*10:value);
  if(visibleMs>=3000&&mapReady){
   paintProgress(100);
   // The completed value gets a brief, visible beat before the existing fade.
   finishTimer=setTimeout(dismiss,180);return;
  }
  frame=requestAnimationFrame(animate);
 }
 function resumeProgress(){if(!frame&&!finishTimer&&!closed&&!failed)frame=requestAnimationFrame(animate);}
 function ready(){
  if(closed)return;mapReady=true;failed=false;clearTimeout(watchdog);layer.classList.remove('intro-error');
  status.textContent='지도가 준비됐습니다.';detail.textContent='잠시 후 지도가 펼쳐집니다.';
  resumeProgress();
 }
 function stage(text,note='',step='data'){
  if(closed)return;
  mapReady=false;failed=false;clearTimeout(finishTimer);finishTimer=0;resumeProgress();
  layer.dataset.phase=step;layer.classList.remove('intro-error');
  status.textContent=text;detail.textContent=note;
  for(const item of layer.querySelectorAll('[data-intro-step]')){
   if(item.dataset.introStep===step)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
  }
 }
 function fail(message='지도를 불러오지 못했습니다.'){
  if(closed)return;failed=true;mapReady=false;stopProgress();clearTimeout(watchdog);layer.classList.add('intro-error');layer.dataset.phase='error';
  status.textContent=message;detail.textContent='다시 시도하거나 지도 화면으로 나갈 수 있습니다.';
 }
 function arm(){clearTimeout(watchdog);watchdog=setTimeout(()=>fail('연결이 지연되고 있습니다.'),45000);}
 function dismiss(){
  if(closed)return;closed=true;stopProgress();clearTimeout(watchdog);
  const ownedFocus=layer.contains(document.activeElement);
  app.classList.add('desk-entered');
  app.inert=false;document.documentElement.classList.remove('intro-open');
  layer.classList.add('intro-leaving');layer.setAttribute('aria-hidden','true');layer.inert=true;
  if(ownedFocus){const target=previousFocus!==document.body&&previousFocus?.isConnected?previousFocus:document.getElementById('current-title');target?.focus({preventScroll:true});}
  const finish=()=>{layer.hidden=true;};
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)finish();
  else{layer.addEventListener('transitionend',finish,{once:true});setTimeout(finish,800);}
  window.removeEventListener('error',handleError,true);window.removeEventListener('unhandledrejection',handleRejection);
  document.removeEventListener('visibilitychange',resetFrameClock);
 }
 function handleError(event){if(event.target?.tagName==='SCRIPT'||event.error)fail('지도 프로그램을 시작하지 못했습니다.');}
 function handleRejection(){fail('지도를 준비하는 중 문제가 발생했습니다.');}
 function resetFrameClock(){lastFrame=null;}
 retry.addEventListener('click',event=>{event.preventDefault();if(closed)return;stopProgress();visibleMs=0;paintProgress(0);stage('다시 지도를 불러오는 중…','','map');arm();retryAction();});
 leave.addEventListener('click',event=>{event.preventDefault();dismiss();});
 layer.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();dismiss();}
  if(event.key==='Tab'){
   const controls=[retry,leave],first=controls[0],last=controls.at(-1);
   if(event.shiftKey&&(!controls.includes(document.activeElement)||document.activeElement===first)){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&(!controls.includes(document.activeElement)||document.activeElement===last)){event.preventDefault();first.focus();}
  }
 });
 window.AtlasIntro={stage,fail,ready,setRetry:fn=>{if(!closed)retryAction=fn;}};
 window.addEventListener('error',handleError,true);window.addEventListener('unhandledrejection',handleRejection);
 if(location.hash==='#intro-bypass'){dismiss();return;}
 document.addEventListener('visibilitychange',resetFrameClock);
 app.inert=true;document.documentElement.classList.add('intro-open');
 document.getElementById('intro-title').focus({preventScroll:true});arm();paintProgress(0);resumeProgress();
})();
