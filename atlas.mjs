import {createMapLoader} from './atlas-loader.mjs?v=808a293e417e9333';
import {createNavigator,visibleLabelIndexes,entryPath,localToWorld,searchDestinations,campaignLayer,mapAssetURL} from './atlas-core.mjs?v=808a293e417e9333';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
let data;
try{data=await fetch('data/facility-master.json?v=808a293e417e9333').then(r=>{if(!r.ok)throw Error('지도 자료를 읽을 수 없습니다.');return r.json();});}
catch(error){$('loading').textContent='지도 자료를 불러오지 못했습니다. ';const retry=document.createElement('button');retry.textContent='다시 시도';retry.onclick=()=>location.reload();$('loading').append(retry);throw error;}
const imageLoader=createMapLoader();
$('production-status').textContent=`${data.maps.filter(m=>m.kind==='region'&&m.status==='ready').length}권역 ${data.maps.filter(m=>m.kind==='settlement'&&m.status==='ready').length}거점`;
for(const stage of data.campaign.stages){const option=document.createElement('option');option.value=stage.id;option.textContent=stage.label;$('campaign-stage').append(option);}
const nav=createNavigator(data.maps),map=$('map'),viewport=$('viewport');let depth=0,drag=null,ignoreClick=false;
const initialPath=entryPath(data.maps,location.hash.slice(1));
history.replaceState({atlasDepth:0,mapId:'world'},'','#world');
for(const id of initialPath){nav.enter(id);depth++;history.pushState({atlasDepth:depth,mapId:id},'',`#${id}`);}
const el=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;return n;};
function metrics(){const s=nav.current(),b=s.bounds,fit=Math.min(viewport.clientWidth/b[2],viewport.clientHeight/b[3]);const pixels=s.effectiveBasePixels||s.nativePixels;const density=Math.min(pixels[0]/b[2],pixels[1]/b[3]);return {fit,max:Math.max(1,Math.min(2.5,density/(fit*(devicePixelRatio||1))))};}
function camera(){const s=nav.current(),b=s.bounds,w=b[2]/s.zoom,h=b[3]/s.zoom;map.setAttribute('viewBox',[s.center[0]-w/2,s.center[1]-h/2,w,h].join(' '));$('zoom').textContent=s.zoom.toFixed(1)+'×';$('minus').disabled=s.zoom<=1;$('plus').disabled=s.zoom>=metrics().max-.01;const labels=[...map.querySelectorAll('.map-label')];labels.forEach(n=>n.style.visibility='visible');const visible=new Set(visibleLabelIndexes(labels.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,priority:+n.dataset.priority||0};})));labels.forEach((n,i)=>{if(!visible.has(i))n.style.visibility='hidden';});}
function showNote(text){$('selection').textContent=text;}
function representedFeatures(s){return [...data.features.filter(f=>f.mapId===s.id),...(data.representations||[]).filter(r=>r.mapId===s.id).map(r=>({...data.features.find(f=>f.id===r.featureId),displayWorldAnchor:localToWorld(r.artworkAnchor,s.bounds)}))];}
function selectFeature(f){nav.update({selected:f.id});for(const node of map.querySelectorAll('[data-feature-id]'))node.classList.toggle('selected',node.dataset.featureId===f.id);showNote(f.name+(nav.current().kind==='district'?' · 기존 기능과 새 세부 배치를 함께 보여주는 상세도입니다.'+(nav.current().id==='silverkeep-civic'?' 법정 계단은 보행 전용이며 마차는 광장 가장자리에서 승하차합니다.':''):' · 기능과 위치는 제작 상태표에서 구분합니다. 세부 건물 배치는 신규 설계입니다.'));}
function open(id,paint=true){if(ignoreClick)return;const target=data.maps.find(m=>m.id===id);if(!target)return;if(!nav.enter(id)){showNote(target.name+' · 상세 원화 준비 중입니다. 기존 그림을 확대한 대체 상세도는 제공하지 않습니다.');return;}depth++;history.pushState({atlasDepth:depth,mapId:id},'',`#${id}`);$('search').value='';if(paint)render();}
function back(){if(depth>0)history.back();}
window.addEventListener('popstate',e=>{const wanted=e.state?.atlasDepth??0;if(wanted<depth){while(depth>wanted){nav.back();depth--;}}else if(wanted>depth&&e.state?.mapId&&nav.enter(e.state.mapId)){depth++;}render();});
function polygonPath(g){if(!g)return '';const polys=g.type==='MultiPolygon'?g.coordinates:[g.coordinates];return polys.map(p=>p.map(r=>'M'+r.map(v=>v.join(',')).join('L')+'Z').join('')).join('');}
function interactive(node,id,name){node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label',name);node.append(el('title',{},name));node.addEventListener('click',()=>open(id));node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(id);}});for(const event of ['mouseenter','focus'])node.addEventListener(event,()=>{$('tooltip').textContent=name;$('tooltip').hidden=false;});for(const event of ['mouseleave','blur'])node.addEventListener(event,()=>{$('tooltip').hidden=true;});}
function label(x,y,text,size){return el('text',{x,y,'font-size':size,'stroke-width':size*.16,class:'map-label'},text);}
function render(){
 const s=nav.current(),b=s.bounds;map.replaceChildren();map.setAttribute('aria-label',s.name+' 지도');map.dataset.mapId=s.id;map.dataset.asset=s.asset;
 const image=el('image',{x:b[0],y:b[1],width:b[2],height:b[3],preserveAspectRatio:'none'});map.append(image);
 const display=state=>{
  if(map.dataset.mapId!==s.id||!image.isConnected)return;
  map.dataset.loadState=state.phase;map.setAttribute('aria-busy',String(state.phase==='loading'||state.phase==='preview'));
  if(state.url)image.setAttribute('href',state.url);else image.removeAttribute('href');
  const status=$('loading');status.hidden=state.phase==='ready';status.replaceChildren();
  if(state.phase==='ready')return;
  status.append(document.createTextNode(s.name+(state.phase==='error'?' · 지도를 불러오지 못했습니다. ':state.phase==='preview'?' · 미리보기 표시 중 · 원본 해상도 불러오는 중…':' · 지도 불러오는 중…')));
  if(state.phase==='error'){const retry=document.createElement('button');retry.textContent='다시 시도';retry.onclick=()=>imageLoader.select(mapAssetURL(s),s.previewAsset,display,true);status.append(retry);}
 };
 imageLoader.select(mapAssetURL(s),s.previewAsset,display);
 const fit=metrics().fit,fs=13/fit;
 for(const link of s.accessLinks||[]){
  const target=data.maps.find(m=>m.id===link.detailMapId),p=link.worldAnchor;if(!target||!p)continue;
  const dot=el('circle',{cx:p[0],cy:p[1],r:6/fit,class:'spot'});interactive(dot,target.id,(link.name||target.name)+' 접근점 · 상세지도 열기');map.append(dot);
  if(s.labels)map.append(label(p[0]+8/fit,p[1]-8/fit,link.name||data.places.find(v=>v.id===link.placeId)?.name||target.name,fs));
 }
 for(const child of data.maps.filter(m=>m.parentMapId===s.id)){
  if(child.navigationListOnly)continue;
  let shape;if(child.geometry)shape=el('path',{d:polygonPath(child.geometry),'fill-rule':'evenodd'});else if(child.clickPolygon)shape=el('polygon',{points:child.clickPolygon.map(p=>p.join(',')).join(' ')});else continue;
  if(child.geographicSelection){const outline=shape.cloneNode(false);outline.setAttribute('class','geographic-outline');outline.setAttribute('aria-hidden','true');map.append(outline);}
  shape.setAttribute('class','division '+(child.kind==='region'&&child.sovereign?'':'detail ')+(child.geographicSelection?'geographic-selection ':'')+(child.status==='ready'?'':'planned'));interactive(shape,child.id,child.name+(child.sovereign===false?' 비주권 탐색 구획':'')+(child.status==='ready'?' 상세지도 열기':' · 준비 중'));map.append(shape);
  if(s.labels){const c=child.bounds;const x=child.kind==='region'?c[0]+c[2]*.45:child.clickPolygon.reduce((a,p)=>a+p[0],0)/child.clickPolygon.length;const y=child.kind==='region'?c[1]+c[3]*.48:Math.min(...child.clickPolygon.map(p=>p[1]))-fs*.3;const displayName=s.kind==='region'&&child.kind==='settlement'?(data.places.find(p=>p.id===child.placeId)?.name||child.name):child.name;const t=label(x,y,displayName,fs);t.dataset.priority=child.status==='ready'?'1':'0';t.setAttribute('text-anchor','middle');map.append(t);}
 }
 for(const reference of s.linkedSelectionTargets||[]){
  const target=data.maps.find(m=>m.id===reference.mapId);if(!target||target.status!=='ready')continue;
  const shape=el('polygon',{points:reference.polygon.map(p=>p.join(',')).join(' '),class:'division detail geographic-selection'});
  const outline=shape.cloneNode(false);outline.setAttribute('class','geographic-outline');outline.setAttribute('aria-hidden','true');map.append(outline);
  interactive(shape,target.id,target.name+' 상세지도 열기');map.append(shape);
  if(s.labels){const x=reference.polygon.reduce((sum,p)=>sum+p[0],0)/reference.polygon.length,y=Math.min(...reference.polygon.map(p=>p[1]))-fs*.3;const t=label(x,y,data.places.find(p=>p.id===target.placeId)?.name||target.name,fs);t.dataset.priority='1';t.setAttribute('text-anchor','middle');map.append(t);}
 }
 const overviewPatches=(data.overviewDrawings||[]).filter(d=>d.parentMapId===s.id).flatMap(d=>d.patches);
 const overviewLinkedPlaces=new Set(overviewPatches.filter(p=>p.detailMapId).map(p=>p.placeId));
 if(s.kind==='region')for(const p of data.places.filter(p=>p.region===s.name&&!p.detailMapId&&!overviewLinkedPlaces.has(p.id))){
  const artwork=overviewPatches.find(a=>a.placeId===p.id&&a.footprintPolygon?.length);
  let marker=[p.x,p.y];
  if(artwork){
   // This is a screen callout, never a replacement for the canonical place anchor.
   const edge=artwork.footprintPolygon.reduce((a,b)=>b[0]>a[0]?b:a);
   marker=[edge[0]+8/fit,edge[1]];
   map.append(el('line',{x1:edge[0],y1:edge[1],x2:marker[0]-3/fit,y2:marker[1],class:'pending-leader','aria-hidden':'true'}));
  }
  const dot=el('circle',{cx:marker[0],cy:marker[1],r:3/fit,class:'spot'+(artwork?' pending-callout':''),tabindex:0,role:'button','aria-label':p.name+' 정보','data-place-id':p.id});dot.append(el('title',{},p.name));const select=()=>{nav.update({selected:p.id});showNote(p.name+' · '+p.rationale+' / 개별 상세도 준비 중');};dot.addEventListener('click',select);dot.addEventListener('keydown',e=>{if(e.key==='Enter')select();});map.append(dot);
 }
 for(const rep of s.placeRepresentations||[]){
  const p=data.places.find(p=>p.id===(rep.representsPlaceId||rep.placeId));
  if(!p||data.maps.some(m=>m.parentMapId===s.id&&m.placeId===p.id))continue;
  const uv=rep.imagePoint||rep.artworkAnchor||[rep.artworkPosition.u,rep.artworkPosition.v],pos=localToWorld(uv,b);
  const dot=el('circle',{cx:pos[0],cy:pos[1],r:4/fit,class:'spot',tabindex:0,role:'button','aria-label':p.name+' 개요 정보'});
  const select=()=>showNote(p.name+' · '+p.rationale+' / 생활권 개요의 위치 표시입니다. 개별 상세 지도는 장소 찾기에서 열 수 있습니다.');
  dot.append(el('title',{},p.name));dot.addEventListener('click',select);dot.addEventListener('keydown',e=>{if(e.key==='Enter')select();});map.append(dot);
  if(s.labels)map.append(label(pos[0]+5/fit,pos[1]-7/fit,p.name,fs));
 }
 if(s.labels)for(const way of (data.circulation||[]).filter(w=>w.mapId===s.id)){
  const pts=way.artworkPath.map(p=>localToWorld(p,b));const line=el('polyline',{points:pts.map(p=>p.join(',')).join(' '),class:'circulation '+way.mode,tabindex:0,role:'button','aria-label':way.name});line.append(el('title',{},way.name));const select=()=>showNote(way.name+' · '+(way.mode==='carriage'?'마차는 광장 가장자리 승하차 지점까지 접근합니다.':'보행 연결입니다. 계단에 마차 통행을 설정하지 않았습니다.'));line.addEventListener('click',select);line.addEventListener('keydown',e=>{if(e.key==='Enter')select();});map.append(line);
  if(way.endRole==='dropoff'){const p=pts.at(-1);map.append(el('rect',{x:p[0]-4/fit,y:p[1]-4/fit,width:8/fit,height:8/fit,class:'dropoff'}));map.append(label(p[0]+6/fit,p[1]+14/fit,'마차 승하차',fs));}
 }
 for(const f of representedFeatures(s)){
  const [x,y]=f.displayWorldAnchor;const dot=el('circle',{cx:x,cy:y,r:3.5/fit,class:'feature'+(s.selected===f.id?' selected':''),tabindex:0,role:'button','aria-label':f.name,'data-feature-id':f.id});dot.append(el('title',{},f.name));dot.addEventListener('click',()=>selectFeature(f));dot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectFeature(f);}});map.append(dot);if(s.labels)map.append(label(x+4/fit,y-7/fit,f.name,fs));
 }
 renderCampaign(s,fit,fs);
 $('current-title').textContent=s.name;$('description').textContent=s.description;$('labels').checked=s.labels;$('back').disabled=s.id==='world';$('asset-info').textContent=`출력 ${s.nativePixels.join(' × ')} px · 배경 기준정보 ${(s.effectiveBasePixels||s.nativePixels).join(' × ')} px. 새 시설 상세와 낮은 밀도의 주변 영역이 섞인 검토본이며, 8K 최종본은 아닙니다.`;
 $('breadcrumbs').replaceChildren();const trail=nav.breadcrumb();trail.forEach((m,i)=>{if(i)$('breadcrumbs').append(document.createTextNode('›'));const button=document.createElement('button');button.textContent=m.name;if(m.id===s.id){button.disabled=true;button.setAttribute('aria-current','page');}else button.onclick=()=>history.go(-(trail.length-1-i));$('breadcrumbs').append(button);});
 showNote(s.kind==='campaign'?'위 전황 선택기로 사건 단계를 바꿀 수 있습니다. 도상 사건 위치는 근사점이며 길의 세부는 새 설계입니다.':s.kind==='pass'?s.description+' · 행군시간과 실제 귀환 동선은 정하지 않았습니다.':s.kind==='district'?'시설과 접근 동선을 새로 그린 별도 원화입니다. 상위 지도 버튼으로 이전 배치에 돌아갈 수 있습니다.':s.kind==='settlement'?'새 상세 원화를 불러왔습니다. 구역 이름을 끄면 무문자 그림을 볼 수 있습니다.':s.id==='world'?'준비된 국가·권역 구획을 클릭해 지역도로 이동하세요. 점선 구획은 제작 상태를 구분합니다.':'지도에 표시된 구획을 선택하면 하위 상세 지도를 열 수 있습니다. 밝은 실선은 지형과 정주지를 따라 검토 중인 선택 경계입니다.');
 destinations();camera();
}
function renderCampaign(s,fit,fs){
 const inScope=s.id==='world'||nav.breadcrumb().some(m=>m.id==='tiris');document.querySelector('.campaign-panel').hidden=!inScope;if(!inScope)return;
 const layer=campaignLayer(data,$('campaign-stage').value),summary=$('campaign-summary');summary.hidden=!layer;
 if(!layer)return;
 summary.textContent=layer.summary+' 시설의 복구·영지권 반환·듀란 귀환 경로를 자동 확정하지 않습니다.';
 if(!['world','region','sector','campaign'].includes(s.kind))return;
 const color=layer.controller==='티리스'?'#51d7fa':layer.controller==='노르가르드'?'#ff7775':'#c994ed';
 for(const marker of layer.markers){const[x,y]=marker.position,b=s.bounds;if(x<b[0]||x>b[0]+b[2]||y<b[1]||y>b[1]+b[3])continue;
  const dot=el('circle',{cx:x,cy:y,r:7/fit,fill:'none',stroke:color,'stroke-width':2.5,'vector-effect':'non-scaling-stroke',class:'campaign-marker','data-event-id':marker.id,'pointer-events':'none'});dot.append(el('title',{},marker.label));map.append(dot);
  if(s.labels){const t=label(x+9/fit,y+18/fit,marker.label,fs);t.dataset.priority='2';map.append(t);}
 }
}
function destinationButton(name,status,action){const b=document.createElement('button');b.className='destination'+(status==='준비 중'?' planned':'');const t=document.createElement('strong');t.textContent=name;const statusText=document.createElement('span');statusText.textContent=status;b.append(t,statusText);b.onclick=action;return b;}
function destinations(){const s=nav.current(),q=$('search').value.trim().toLocaleLowerCase();$('destinations').replaceChildren();
 if(q){$('list-title').textContent='장소 검색 결과';const matches=searchDestinations(data,q);for(const p of matches){const status=(p.kind==='region'?'국가·권역 · ':'')+(p.ready?'상세도':'준비 중');$('destinations').append(destinationButton(p.name,status,()=>{if(!p.ready){showNote(p.name+' · '+(p.kind==='region'?'국가·권역':'장소')+' 상세 원화 준비 중'+(p.kind==='place'?' / '+p.note:''));return;}while(nav.current().id!=='world'){nav.back();}depth=0;history.replaceState({atlasDepth:0,mapId:'world'},'','#world');for(const step of entryPath(data.maps,p.mapId))open(step,false);render();}));}if(!matches.length)$('destinations').textContent='해당 지명을 찾지 못했습니다.';return;}
 $('list-title').textContent=s.kind==='settlement'?'시설·생활 공간':'다음 상세도';
 if(s.kind==='settlement'||s.kind==='district'){for(const child of data.maps.filter(m=>m.parentMapId===s.id))$('destinations').append(destinationButton(child.name,'상세 구획',()=>open(child.id)));for(const f of representedFeatures(s))$('destinations').append(destinationButton(f.name,'위치',()=>selectFeature(f)));if(s.kind==='district')$('list-title').textContent='시설과 출입 동선';if(s.id==='silverkeep-civic'){const note=document.createElement('p');note.textContent='금색: 마차 접근 · 청록 점선: 보행. 광장 승하차 후 법정 계단은 걸어서 이동합니다. 지명을 끄면 동선 표시도 숨깁니다.';$('destinations').append(note);}}
 else if(s.kind==='campaign'){$('list-title').textContent='협곡과 전황';$('destinations').textContent='북쪽 좁은목 → 중앙 골짜기 → 남쪽 접근로. 위 전황 선택기에서 사건 단계를 바꿀 수 있습니다. 부대의 정확한 봉쇄 수단과 듀란의 탈출 경로는 정해지지 않았습니다.';}
 else if(s.kind==='pass'){$('list-title').textContent=s.accessLinks?.length?'연결된 상세도':'도로 설계 검토';const note=document.createElement('p');note.textContent=s.id==='hesmarga-geographic-access'?'수레는 상부 환적장에서 멈춥니다. 계단은 인력 운반, 아래 부두의 경사로는 국소 운반 동선입니다.':s.description;$('destinations').append(note);for(const link of s.accessLinks||[]){const target=data.maps.find(m=>m.id===link.detailMapId);if(target)$('destinations').append(destinationButton(target.name,'접근점',()=>open(target.id)));}}else {for(const child of data.maps.filter(m=>m.parentMapId===s.id))$('destinations').append(destinationButton(child.name,child.status==='ready'?'열기':'준비 중',()=>open(child.id)));for(const reference of s.linkedSelectionTargets||[]){const target=data.maps.find(m=>m.id===reference.mapId);if(target)$('destinations').append(destinationButton(target.name,'열기',()=>open(target.id)));}}
}
function zoom(factor){const s=nav.current();nav.update({zoom:Math.max(1,Math.min(metrics().max,s.zoom*factor))});camera();}
const fit=()=>{const s=nav.current(),b=s.bounds;nav.update({zoom:1,center:[b[0]+b[2]/2,b[1]+b[3]/2]});camera();};
$('back').onclick=back;$('fit').onclick=fit;$('plus').onclick=()=>zoom((nav.current().zoom+.2)/nav.current().zoom);$('minus').onclick=()=>zoom((nav.current().zoom-.2)/nav.current().zoom);$('labels').onchange=()=>{nav.update({labels:$('labels').checked});render();};$('search').oninput=destinations;
$('campaign-stage').onchange=render;
$('focus-map').onclick=()=>{const focused=document.body.classList.toggle('map-focused');$('focus-map').setAttribute('aria-pressed',String(focused));$('focus-map').textContent=focused?'전체 화면 구성':'지도 집중보기';};
map.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.12:1/1.12);},{passive:false});
map.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,state:nav.current(),moved:false};});
map.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)<5&&!drag.moved)return;drag.moved=true;map.setPointerCapture(e.pointerId);const s=drag.state,b=s.bounds,scale=metrics().fit*s.zoom;nav.update({center:[Math.max(b[0],Math.min(b[0]+b[2],s.center[0]-dx/scale)),Math.max(b[1],Math.min(b[1]+b[3],s.center[1]-dy/scale))]});camera();});
map.addEventListener('pointerup',e=>{ignoreClick=!!drag?.moved;drag=null;if(map.hasPointerCapture(e.pointerId))map.releasePointerCapture(e.pointerId);setTimeout(()=>{ignoreClick=false;},0);});map.addEventListener('pointercancel',()=>{drag=null;});
new ResizeObserver(()=>{const s=nav.current();nav.update({zoom:Math.min(s.zoom,metrics().max)});camera();}).observe(viewport);
render();
