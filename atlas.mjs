import {createAssetCache,nextMapAssets} from './atlas-prefetch.mjs?v=e4e8efca64d62e54';
import {createMapLoader} from './atlas-loader.mjs?v=e4e8efca64d62e54';
import {createNavigator,layoutMapLabels,placeMapCallout,softBoundaryPath,entryPath,localToWorld,searchDestinations,campaignLayer,mapAssetURL,regionHoverGeometry} from './atlas-core.mjs?v=e4e8efca64d62e54';
const $=id=>document.getElementById(id),ns='http://www.w3.org/2000/svg';
let data;
try{data=await fetch('data/facility-master.json?v=e4e8efca64d62e54').then(r=>{if(!r.ok)throw Error('지도 자료를 읽을 수 없습니다.');return r.json();});}
catch(error){window.AtlasIntro?.fail('지도 자료를 불러오지 못했습니다.');$('loading').textContent='지도 자료를 불러오지 못했습니다. ';const retry=document.createElement('button');retry.textContent='다시 시도';retry.onclick=()=>location.reload();$('loading').append(retry);throw error;}
data.mapRedirects=data.maps.filter(m=>m.status==='redirect');
data.maps=data.maps.filter(m=>m.status!=='redirect');
const assetCache=createAssetCache(),imageLoader=createMapLoader({assetCache});
const connection=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
const updateNetwork=()=>assetCache.setNetwork(connection);updateNetwork();connection?.addEventListener?.('change',updateNetwork);
$('prefetch-toggle').onclick=()=>assetCache.setPaused(!assetCache.stats().paused);
function prefetchStatus(state){
 if(state.context!==nav.current().id)return;
 const line=$('prefetch');line.hidden=!state.available;line.dataset.context=state.context;
 line.dataset.ready=state.ready;line.dataset.total=state.total;line.dataset.failed=state.failed;line.dataset.cacheBytes=state.bytes;line.dataset.budget=state.budget;
 const reason=state.networkReason||(state.paused?'일시 중지':'');
 $('prefetch-status').textContent=reason?`다음 지도 준비 · ${reason}`:`다음 지도 ${state.done?'준비 종료':'준비 중'} ${state.ready}/${state.total}${state.failed?` · 실패 ${state.failed} (선택하면 재시도)`:''}${state.skipped?` · ${state.skipped}개는 선택 시 불러오기`:''}`;
 $('prefetch-toggle').textContent=state.paused?'재개':'중지';$('prefetch-toggle').disabled=!!state.networkReason;
}
let prefetchSelection=null;
let lastRevealedMap=null;
window.addEventListener('pagehide',()=>assetCache.dispose());
$('production-status').textContent=`${data.maps.filter(m=>m.kind==='region'&&!m.exploration&&m.status==='ready').length}권역 · ${data.maps.filter(m=>m.exploration&&m.status==='ready').length}탐험지 · ${data.maps.filter(m=>m.kind==='settlement'&&m.status==='ready').length}거점`;
for(const stage of data.campaign.stages){const option=document.createElement('option');option.value=stage.id;option.textContent=stage.label;$('campaign-stage').append(option);}
const nav=createNavigator(data.maps),map=$('map'),viewport=$('viewport');let depth=0,drag=null,ignoreClick=false,pressedArtwork=null;
const initialPath=entryPath([...data.maps,...data.mapRedirects],location.hash.slice(1));
history.replaceState({atlasDepth:0,mapId:'world'},'','#world');
for(const id of initialPath){nav.enter(id);depth++;history.pushState({atlasDepth:depth,mapId:id},'',`#${id}`);}
const el=(tag,attrs={},text)=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text)n.textContent=text;return n;};
function metrics(){const s=nav.current(),b=s.bounds,fit=Math.min(viewport.clientWidth/b[2],viewport.clientHeight/b[3]);const pixels=s.effectiveBasePixels||s.nativePixels;const density=Math.min(pixels[0]/b[2],pixels[1]/b[3]);return {fit,max:Math.max(1,Math.min(2.5,density/(fit*(devicePixelRatio||1))))};}
function camera(){const s=nav.current(),b=s.bounds,w=b[2]/s.zoom,h=b[3]/s.zoom;map.setAttribute('viewBox',[s.center[0]-w/2,s.center[1]-h/2,w,h].join(' '));for(const layer of map.querySelectorAll('[data-cutout]'))layer.style.setProperty('--cutout-lift',`${-4/(metrics().fit*s.zoom)}px`);$('zoom').textContent=s.zoom.toFixed(1)+'×';$('minus').disabled=s.zoom<=1;$('plus').disabled=s.zoom>=metrics().max-.01;layoutLabels();layoutMapPins();if(hoveredArtwork)liftArtwork(hoveredArtwork);}

function layoutLabels(){
 const labels=[...map.querySelectorAll('.map-label')],matrix=map.getScreenCTM();if(!matrix)return;
 const view=map.getBoundingClientRect(),frame={x:view.left+8,y:view.top+8,w:view.width-16,h:view.height-16};
 const visible=[];
 for(const n of labels){
  const x=Number(n.dataset.anchorX??n.getAttribute('x')),y=Number(n.dataset.anchorY??n.getAttribute('y'));
  n.dataset.anchorX=x;n.dataset.anchorY=y;n.setAttribute('x',x);n.setAttribute('y',y);
  n.style.transformOrigin=`${x}px ${y}px`;
  const point=new DOMPoint(x,y).matrixTransform(matrix);
  const anchorOutside=point.x<view.left||point.x>view.right||point.y<view.top||point.y>view.bottom;
  const target=n.dataset.labelTarget&&map.querySelector(`[data-hover-target="${n.dataset.labelTarget}"]`),r=target?.getBoundingClientRect();
  const targetVisible=r&&r.right>view.left&&r.left<view.right&&r.bottom>view.top&&r.top<view.bottom;
  n.style.visibility=anchorOutside&&!targetVisible?'hidden':'visible';
  if(n.style.visibility==='hidden')continue;
  const b=n.getBBox(),a=new DOMPoint(x+(b.x-x)*1.08,y+(b.y-y)*1.08).matrixTransform(matrix);
  visible.push({n,x,y,rect:{x:a.x,y:a.y,w:b.width*matrix.a*1.08,h:b.height*matrix.d*1.08}});
 }
 const positions=layoutMapLabels(visible.map(v=>v.rect),frame);
 visible.forEach((v,i)=>{const x=v.x+(positions[i].x-v.rect.x)/matrix.a,y=v.y+(positions[i].y-v.rect.y)/matrix.d;v.n.setAttribute('x',x);v.n.setAttribute('y',y);v.n.style.transformOrigin=`${x}px ${y}px`;});
}
function showNote(text){$('selection').textContent=text;}
let mapPins=[];
const mapCallout=document.createElement('div');
mapCallout.className='atlas-map-callout';mapCallout.hidden=true;mapCallout.setAttribute('role','tooltip');mapCallout.id='atlas-map-callout';
const calloutText=document.createElement('span');mapCallout.append(calloutText);viewport.append(mapCallout);
const calloutLeader=document.createElement('div');calloutLeader.className='atlas-callout-leader';calloutLeader.hidden=true;viewport.append(calloutLeader);
function mountMapPins(){
 mapPins=[];mapCallout.hidden=true;calloutLeader.hidden=true;
 const pinDefs=el('defs'),outline=el('filter',{id:'atlas-pin-outline',x:'-50%',y:'-50%',width:'200%',height:'200%','color-interpolation-filters':'sRGB'});
 outline.append(el('feMorphology',{in:'SourceAlpha',operator:'dilate',radius:1,result:'expanded'}),el('feFlood',{'flood-color':'#fff',result:'white'}),el('feComposite',{in:'white',in2:'expanded',operator:'in',result:'border'}));
 const merge=el('feMerge');merge.append(el('feMergeNode',{in:'border'}),el('feMergeNode',{in:'SourceGraphic'}));outline.append(merge);pinDefs.append(outline);map.append(pinDefs);
 // Preserve all existing click actions, including informational and pending places.
 for(const text of map.querySelectorAll('.map-label')){
  if(!text.dataset.labelTarget&&text.previousElementSibling?.dataset.hoverTarget)text.dataset.labelTarget=text.previousElementSibling.dataset.hoverTarget;
 }
 const ids=new Set([...map.querySelectorAll('[data-hover-target]')].map(n=>n.dataset.hoverTarget));
 for(const id of ids){
  const source=map.querySelector(`[data-hover-target="${id}"]`);
  const name=map.querySelector(`[data-label-target="${id}"]`);
  let hit=map.querySelector(`circle[data-hover-target="${id}"]`);
  if(!hit&&!name)continue;
  const x=hit?+hit.getAttribute('cx'):+name.getAttribute('x'),y=hit?+hit.getAttribute('cy'):+name.getAttribute('y');
  if(!hit){hit=el('circle',{cx:x,cy:y,tabindex:0,role:'button','aria-label':source.getAttribute('aria-label')});attachCutoutHover(hit,id);hit.addEventListener('click',()=>source.dispatchEvent(new MouseEvent('click')));hit.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();source.dispatchEvent(new MouseEvent('click'));}});map.append(hit);}
  hit.classList.add('atlas-pin-hit');hit.setAttribute('aria-describedby','atlas-map-callout');
  hit.querySelector('title')?.remove();source.querySelector('title')?.remove();
  const destination=data.maps.find(m=>m.id===id);
  const major=destination&&!destination.exploration&&['region','settlement'].includes(destination.kind);
  const size=major?28:22;
  const art=el('image',{href:`ui-assets/map-callouts-v1/${major?'compass-pin-v1':'exploration-pin-v2'}.png`,class:`atlas-pin-art ${major?'is-major':'is-secondary'}`,'data-pin-target':id,'aria-hidden':'true',preserveAspectRatio:'xMidYMid meet'});map.append(art);
  mapPins.push({id,hit,art,x,y,size,name:name?.textContent||source.getAttribute('aria-label')});
 }
 layoutMapPins();
}
function layoutMapPins(){
 const m=map.getScreenCTM();if(!m)return;
 map.querySelector('#atlas-pin-outline feMorphology')?.setAttribute('radius',1/m.a);
 const view=map.getBoundingClientRect(),visible=[];
 for(const p of mapPins){const a=new DOMPoint(p.x,p.y).matrixTransform(m);const minZoom=data.maps.find(m=>m.id===p.id)?.markerMinZoom||1;const outside=nav.current().zoom<minZoom||a.x<view.left||a.x>view.right||a.y<view.top||a.y>view.bottom;p.art.style.display=p.hit.style.display=outside?'none':'';if(!outside)visible.push({p,a});}
 const positions=layoutMapLabels(visible.map(({a})=>({x:a.x-14,y:a.y-14,w:28,h:28})),{x:view.left+8,y:view.top+8,w:view.width-16,h:view.height-16},2);
 for(const [i,{p}] of visible.entries()){
  const a=new DOMPoint(positions[i].x+14,positions[i].y+14).matrixTransform(m.inverse());p.displayX=a.x;p.displayY=a.y;
  p.hit.setAttribute('cx',a.x);p.hit.setAttribute('cy',a.y);
  const bridge=cutoutHits.find(h=>h.id===p.id)?.bridge;if(bridge)bridge[0]=[a.x,a.y];
  const size=p.size/m.a;p.art.setAttribute('x',a.x-size/2);p.art.setAttribute('y',a.y-size*.76);p.art.setAttribute('width',size);p.art.setAttribute('height',size);
  // SVG filter lengths use map units; compensate so the halo remains visible at fit zoom.
  p.art.style.setProperty('--pin-pixel',`${1/m.a}px`);
  p.hit.setAttribute('r',14/m.a);
 }
}
function showMapCallout(id){
 const pin=mapPins.find(p=>p.id===id);mapCallout.hidden=!pin||!nav.current().labels;calloutLeader.hidden=true;
 for(const p of mapPins)p.art.classList.toggle('is-active',p===pin);
 if(mapCallout.hidden)return;
 calloutText.textContent=pin.name;
 const outer=viewport.getBoundingClientRect(),v={left:outer.left+viewport.clientLeft,top:outer.top+viewport.clientTop,width:viewport.clientWidth,height:viewport.clientHeight},m=map.getScreenCTM();if(!m)return;
 const point=new DOMPoint(pin.displayX??pin.x,pin.displayY??pin.y).matrixTransform(m),anchor={x:point.x-v.left,y:point.y-v.top};
 anchor.y-=pin.size*.26;
 if(anchor.x<0||anchor.x>v.width||anchor.y<0||anchor.y>v.height){mapCallout.hidden=true;return;}
 // Reserve the visible halo too; hidden pins must not displace the callout.
 const obstacles=mapPins.filter(p=>p.art.style.display!=='none').map(p=>{const r=p.art.getBoundingClientRect(),halo=p===pin?7:4;return{x:r.left-v.left-halo,y:r.top-v.top-halo,w:r.width+halo*2,h:r.height+halo*2};});
 const artworkObstacles=[];
 // Protect the artwork itself, not just the marker above it. Mask images live in
 // SVG defs and have no DOM client rect, so project their registered frames.
 const bounds=nav.current().bounds;
 // World territories cover most land; treating them as building obstacles sends
 // the nameplate across the continent. On world maps reserve markers only.
 for(const entry of nav.current().id==='world'?[]:cutoutManifest.maps[nav.current().id]?.targets||[]){
  const f=cutoutHits.find(h=>h.id===entry.id)?.footprint||entry.frame||entry.clip;if(!f)continue;
  const a=new DOMPoint(bounds[0]+f[0]*bounds[2],bounds[1]+f[1]*bounds[3]).matrixTransform(m);
  const w=f[2]*bounds[2]*m.a,h=f[3]*bounds[3]*m.d;
  artworkObstacles.push({x:a.x-v.left-8,y:a.y-v.top-12,w:w+16,h:h+20});
 }
 for(const n of map.querySelectorAll('.map-label:not([data-label-target])')){const r=n.getBoundingClientRect();obstacles.push({x:r.left-v.left,y:r.top-v.top,w:r.width,h:r.height});}
 const w=Math.min(224,Math.max(152,pin.name.length*13+48),v.width-16),h=w/3;
 let box=placeMapCallout(anchor,{w,h},{w:v.width,h:v.height},[...obstacles,...artworkObstacles]);
 if(box.overlap>0){
  // Broad bounding boxes also contain empty courtyards and gaps between buildings.
  // Refine only congested views using conservative occupied alpha tiles.
  const tiles=(nav.current().id==='world'?[]:cutoutHits).flatMap(hit=>(hit.tiles||[hit.footprint||hit.frame]).map(f=>{const a=new DOMPoint(bounds[0]+f[0]*bounds[2],bounds[1]+f[1]*bounds[3]).matrixTransform(m);return{x:a.x-v.left-3,y:a.y-v.top-7,w:f[2]*bounds[2]*m.a+6,h:f[3]*bounds[3]*m.d+10};}));
  box=placeMapCallout(anchor,{w,h},{w:v.width,h:v.height},[...obstacles,...tiles]);
  if(box.overlap>0)for(const compactWidth of [184,152,128]){
   if(compactWidth>=w)continue;
   const compact=placeMapCallout(anchor,{w:compactWidth,h:compactWidth/3},{w:v.width,h:v.height},[...obstacles,...tiles]);
   if(compact.overlap<box.overlap)box=compact;
   if(box.overlap===0)break;
  }
 }
 if(nav.current().id==='world'&&Math.hypot(box.x+box.w/2-anchor.x,box.y+box.h/2-anchor.y)>160){
  const distance=b=>Math.hypot(b.x+b.w/2-anchor.x,b.y+b.h/2-anchor.y)+(w-b.w)*.25;
  for(const width of [184,152,128]){
   const compact=placeMapCallout(anchor,{w:width,h:Math.max(56,width/3)},{w:v.width,h:v.height},obstacles);
   if(compact.overlap<=box.overlap&&distance(compact)<distance(box))box=compact;
  }
 }
 mapCallout.style.fontSize=box.w<w?'11px':'';
 mapCallout.style.padding=box.w<w?(box.side==='below'?`${box.h*.28}px 16px ${box.h*.12}px`:`${box.h*.12}px 16px ${box.h*.28}px`):'';
 mapCallout.style.width=box.w+'px';mapCallout.style.height=box.h+'px';mapCallout.style.left=box.x+'px';mapCallout.style.top=box.y+'px';
 mapCallout.dataset.side=box.side;
 // A short tether keeps the association explicit when collision avoidance shifts the nameplate.
 const tx=box.x+box.w/2,ty=box.side==='above'?box.y+box.h*.87:box.y+box.h*.13;
 const dx=anchor.x-tx,dy=anchor.y-ty,length=Math.hypot(dx,dy);
 calloutLeader.hidden=length<14;
 Object.assign(calloutLeader.style,{left:tx+'px',top:ty+'px',width:Math.max(0,length-10)+'px',transform:`rotate(${Math.atan2(dy,dx)}rad)`});
}
function representedFeatures(s){return [...data.features.filter(f=>f.mapId===s.id),...(data.representations||[]).filter(r=>r.mapId===s.id).map(r=>({...data.features.find(f=>f.id===r.featureId),displayWorldAnchor:localToWorld(r.artworkAnchor,s.bounds)}))];}
function selectFeature(f){nav.update({selected:f.id});for(const node of map.querySelectorAll('[data-feature-id]'))node.classList.toggle('selected',node.dataset.featureId===f.id);showNote(f.name+(nav.current().kind==='district'?' · 기존 기능과 새 세부 배치를 함께 보여주는 상세도입니다.'+(nav.current().id==='silverkeep-civic'?' 법정 계단은 보행 전용이며 마차는 광장 가장자리에서 승하차합니다.':''):' · 기능과 위치는 제작 상태표에서 구분합니다. 세부 건물 배치는 신규 설계입니다.'));}
function open(id,paint=true){if(ignoreClick)return;const target=data.maps.find(m=>m.id===id);if(!target)return;if(!nav.enter(id)){showNote(target.name+' · 상세 원화 준비 중입니다. 기존 그림을 확대한 대체 상세도는 제공하지 않습니다.');return;}depth++;history.pushState({atlasDepth:depth,mapId:id},'',`#${id}`);$('search').value='';if(paint)render();}
function back(){if(depth>0)history.back();}
window.addEventListener('popstate',e=>{const wanted=e.state?.atlasDepth??0;if(wanted<depth){while(depth>wanted){nav.back();depth--;}}else if(wanted>depth&&e.state?.mapId&&nav.enter(e.state.mapId)){depth++;}render();});
// Round only the presentation contour; the approved hit polygon remains unchanged.
function artworkContour(points){
 const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
 const start=mix(points.at(-1),points[0],.82);
 return 'M'+start.join(',')+points.map((p,i)=>{
  const next=points[(i+1)%points.length],exit=mix(p,next,.18),end=mix(p,next,.82);
  return 'Q'+p.join(',')+' '+exit.join(',')+'L'+end.join(',');
 }).join('')+'Z';
}
function contourNode(shape,points){
 const outline=points?.length?el('path',{d:artworkContour(points)}):shape.cloneNode(false);
 outline.setAttribute('class','geographic-outline');outline.setAttribute('aria-hidden','true');return outline;
}
function polygonPath(g){if(!g)return '';const polys=g.type==='MultiPolygon'?g.coordinates:[g.coordinates];return polys.map(p=>p.map(r=>'M'+r.map(v=>v.join(',')).join('L')+'Z').join('')).join('');}
let hoveredArtwork=null;
let worldHoverPoint=null;
function updateRegionClip(id){
 if(nav.current().id!=='world'||!id)return;
 const region=data.maps.find(m=>m.id===id),path=map.querySelector(`[data-region-clip="${id}"]`);
 if(!path||!region?.geometry)return;
 const anchor=region.labelAnchor||[region.bounds[0]+region.bounds[2]/2,region.bounds[1]+region.bounds[3]/2];
 path.setAttribute('d',polygonPath(regionHoverGeometry(region.geometry,worldHoverPoint,anchor)));
}
let hoverReleaseTimer;
function releaseArtwork(){clearTimeout(hoverReleaseTimer);hoverReleaseTimer=setTimeout(()=>liftArtwork(null),110);}
let cutoutHits=[];
function cutoutAt(event,preferred=null){
 const matrix=map.getScreenCTM();if(!matrix)return null;
 const point=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()),b=nav.current().bounds;
 const u=(point.x-b[0])/b[2],v=(point.y-b[1])/b[3];
 // Small objects take precedence when the illustration contains nested objects.
 return cutoutHits.find(hit=>{
  if(preferred&&hit.id!==preferred)return false;
  const [x,y,w,h]=hit.frame,px=Math.floor((u-x)/w*hit.width),py=Math.floor((v-y)/h*hit.height);
  return px>=0&&py>=0&&px<hit.width&&py<hit.height&&hit.alpha[(py*hit.width+px)*4+3]>100;
 })?.id||null;
}
function onMarkerBridge(event,id){
 const bridge=cutoutHits.find(h=>h.id===id)?.bridge,m=map.getScreenCTM();if(!bridge||!m)return false;
 const a=new DOMPoint(...bridge[0]).matrixTransform(m),b=new DOMPoint(...bridge[1]).matrixTransform(m);
 const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
 const t=length?Math.max(0,Math.min(1,((event.clientX-a.x)*dx+(event.clientY-a.y)*dy)/length)):0;
 return Math.hypot(event.clientX-a.x-t*dx,event.clientY-a.y-t*dy)<=6;
}
function pointerArtwork(event){
 const direct=event.target.closest('[data-hover-target]');
 if(nav.current().id==='world'){
  const matrix=map.getScreenCTM(),p=matrix&&new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
  const marked=direct&&!direct.classList.contains('division')&&data.maps.find(m=>m.id===direct.dataset.hoverTarget);
  worldHoverPoint=marked?.labelAnchor||(p?[p.x,p.y]:null);
 }
 // Markers are explicit choices; overlapping invisible polygons are not.
 if(direct&&!direct.classList.contains('division'))return direct.dataset.hoverTarget;
 if(hoveredArtwork){
  if(cutoutAt(event,hoveredArtwork)||onMarkerBridge(event,hoveredArtwork))return hoveredArtwork;
  const own=map.querySelector(`.division[data-hover-target="${hoveredArtwork}"]`),matrix=own?.getScreenCTM();
  if(matrix&&own.isPointInFill(new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse())))return hoveredArtwork;
 }
 return cutoutAt(event)||direct?.dataset.hoverTarget||null;
}
function liftArtwork(id){
 if(id&&(travelPending||map.dataset.loadState!=='ready'))id=null;
 clearTimeout(hoverReleaseTimer);hoverReleaseTimer=null;
 hoveredArtwork=id;
 updateRegionClip(id);
 const target=id&&map.dataset.loadState==='ready'?map.querySelector(`[data-cutout="${id}"][data-ready="true"]`):null;
 map.classList.toggle('cutout-active',!!target);
 for(const label of map.querySelectorAll('[data-label-target]'))label.classList.toggle('cutout-label-active',!!target&&label.dataset.labelTarget===id);
 const activeLabel=target&&map.querySelector('.cutout-label-active');
 const labelRect=node=>{const b=node.getBBox(),m=map.getScreenCTM(),x=+node.getAttribute('x'),y=+node.getAttribute('y'),scale=node===activeLabel?1.08:.78;const a=new DOMPoint(x+(b.x-x)*scale,y+(b.y-y)*scale).matrixTransform(m),z=new DOMPoint(x+(b.x+b.width-x)*scale,y+(b.y+b.height-y)*scale).matrixTransform(m);return{left:a.x,top:a.y,right:z.x,bottom:z.y};};
 const activeRect=activeLabel&&labelRect(activeLabel);
 for(const label of map.querySelectorAll('.map-label')){
  const r=labelRect(label);
  label.classList.toggle('cutout-label-obscured',!!activeRect&&label!==activeLabel&&r.left<activeRect.right+6&&r.right>activeRect.left-6&&r.top<activeRect.bottom+4&&r.bottom>activeRect.top-4);
 }
 for(const layer of map.querySelectorAll('[data-cutout]'))layer.classList.toggle('is-lifted',layer===target);
 showMapCallout(id);
}
// Manifests register real raster masks only; missing masks never become polygon cutouts.
const cutoutManifest=await fetch('ui-assets/cutouts-v1/manifest.json?v=e4e8efca64d62e54').then(r=>r.ok?r.json():{maps:{}}).catch(()=>({maps:{}}));
function mountCutouts(s,image){
 const entries=cutoutManifest.maps[s.id]?.targets||[];
 if(!entries.length)return;
 const b=s.bounds,fit=metrics().fit,defs=el('defs');map.append(defs);
 const shade=el('rect',{x:b[0],y:b[1],width:b[2],height:b[3],class:'cutout-shade','aria-hidden':'true'});image.after(shade);
 for(const [i,entry] of entries.entries()){
  // Political/navigation regions have explicit boundaries; SAM terrain fragments
  // cannot represent them. Clip the unchanged raster to the same selection path.
  const region=s.id==='world'&&map.querySelector(`.division[data-hover-target="${entry.id}"]`);
  if(region){
   const clipId=`region-artwork-${i}`,clip=el('clipPath',{id:clipId,clipPathUnits:'userSpaceOnUse'});
   const path=el(region.localName,region.localName==='path'?{d:region.getAttribute('d'),'clip-rule':'evenodd','data-region-clip':entry.id}:{points:region.getAttribute('points')});
   clip.append(path);defs.append(clip);
   const layer=el('g',{'data-cutout':entry.id,'data-ready':'true',class:'artwork-cutout region-artwork','aria-hidden':'true'});
   layer.append(el('image',{href:image.getAttribute('href')||'',x:b[0],y:b[1],width:b[2],height:b[3],preserveAspectRatio:'none','clip-path':`url(#${clipId})`}));
   map.append(layer);region.classList.add('has-cutout-target');continue;
  }
  const maskId=`structure-alpha-${i}`,clipId=`structure-clip-${i}`;
  const mask=el('mask',{id:maskId,maskUnits:'userSpaceOnUse',x:b[0],y:b[1],width:b[2],height:b[3],style:'mask-type:alpha'});
  const frame=entry.frame||[0,0,1,1];
  const maskImage=el('image',{x:b[0]+frame[0]*b[2],y:b[1]+frame[1]*b[3],width:frame[2]*b[2],height:frame[3]*b[3],preserveAspectRatio:'none'});mask.append(maskImage);defs.append(mask);
  const layer=el('g',{'data-cutout':entry.id,class:'artwork-cutout','aria-hidden':'true',style:`--cutout-lift:${-4/fit}px`});
  const cropped=el('g',{'mask':`url(#${maskId})`});
  if(entry.clip){const c=entry.clip,clip=el('clipPath',{id:clipId,clipPathUnits:'userSpaceOnUse'});clip.append(el('rect',{x:b[0]+c[0]*b[2],y:b[1]+c[1]*b[3],width:c[2]*b[2],height:c[3]*b[3]}));defs.append(clip);cropped.setAttribute('clip-path',`url(#${clipId})`);}
  cropped.append(el('image',{href:image.getAttribute('href')||'',x:b[0],y:b[1],width:b[2],height:b[3],preserveAspectRatio:'none'}));layer.append(cropped);map.append(layer);
  maskImage.addEventListener('load',()=>{layer.dataset.ready='true';if(layer.isConnected&&hoveredArtwork===entry.id)liftArtwork(entry.id);});
  maskImage.addEventListener('error',()=>{layer.remove();if(hoveredArtwork===entry.id)liftArtwork(null);});
  maskImage.setAttribute('href',entry.mask);
  const raster=new Image();raster.onload=()=>{
   if(!layer.isConnected)return;
   const canvas=document.createElement('canvas'),ratio=Math.min(1,384/Math.max(raster.width,raster.height));
   canvas.width=Math.max(1,Math.round(raster.width*ratio));canvas.height=Math.max(1,Math.round(raster.height*ratio));
   const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(raster,0,0,canvas.width,canvas.height);
   if(entry.clip){const c=entry.clip;context.globalCompositeOperation='destination-in';context.fillRect((c[0]-frame[0])/frame[2]*canvas.width,(c[1]-frame[1])/frame[3]*canvas.height,c[2]/frame[2]*canvas.width,c[3]/frame[3]*canvas.height);}
   try{
    const hit={id:entry.id,frame,width:canvas.width,height:canvas.height,alpha:context.getImageData(0,0,canvas.width,canvas.height).data};
    let minX=hit.width,minY=hit.height,maxX=-1,maxY=-1;
    for(let y=0;y<hit.height;y++)for(let x=0;x<hit.width;x++)if(hit.alpha[(y*hit.width+x)*4+3]>100){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    if(maxX>=0)hit.footprint=[frame[0]+minX/hit.width*frame[2],frame[1]+minY/hit.height*frame[3],(maxX-minX+1)/hit.width*frame[2],(maxY-minY+1)/hit.height*frame[3]];
    hit.tiles=[];const stepX=Math.ceil(hit.width/16),stepY=Math.ceil(hit.height/16);
    for(let y=0;y<hit.height;y+=stepY){let start=-1;
     for(let x=0;x<=hit.width;x+=stepX){let occupied=false;
      if(x<hit.width)for(let py=y;py<Math.min(y+stepY,hit.height)&&!occupied;py++)for(let px=x;px<Math.min(x+stepX,hit.width);px++)if(hit.alpha[(py*hit.width+px)*4+3]>100){occupied=true;break;}
      if(occupied&&start<0)start=x;
      if(start>=0&&(!occupied||x+stepX>=hit.width)){const end=occupied?hit.width:x;hit.tiles.push([frame[0]+start/hit.width*frame[2],frame[1]+y/hit.height*frame[3],(end-start)/hit.width*frame[2],Math.min(stepY,hit.height-y)/hit.height*frame[3]]);start=-1;}
     }
    }
    const marker=map.querySelector(`circle[data-hover-target="${entry.id}"]`);
    if(marker){
     const start=[+marker.getAttribute('cx'),+marker.getAttribute('cy')];let nearest=null,best=Infinity;
     for(let y=0;y<hit.height;y+=2)for(let x=0;x<hit.width;x+=2){
      if(hit.alpha[(y*hit.width+x)*4+3]<180)continue;
      const point=[b[0]+(frame[0]+(x+.5)/hit.width*frame[2])*b[2],b[1]+(frame[1]+(y+.5)/hit.height*frame[3])*b[3]];
      const distance=(point[0]-start[0])**2+(point[1]-start[1])**2;if(distance<best){best=distance;nearest=point;}
     }
     if(nearest)hit.bridge=[start,nearest];
    }
    cutoutHits.push(hit);cutoutHits.sort((a,b)=>a.frame[2]*a.frame[3]-b.frame[2]*b.frame[3]);
    if(hoveredArtwork===entry.id)showMapCallout(entry.id);
   }catch{/* Existing keyboard and polygon targets still work if pixel reads are unavailable. */}
  };raster.src=entry.mask;
  for(const node of map.querySelectorAll('[data-hover-target]'))if(node.dataset.hoverTarget===entry.id){node.classList.add('has-cutout-target');if(node.nextElementSibling?.classList.contains('map-label'))node.nextElementSibling.dataset.labelTarget=entry.id;}
 }
 map.classList.add('has-artwork-cutouts');
}
function attachCutoutHover(node,id){
 node.dataset.hoverTarget=id;
 node.addEventListener('mouseenter',e=>liftArtwork(map.contains(node)?pointerArtwork(e):id));
 node.addEventListener('focus',()=>liftArtwork(map.contains(node)&&pressedArtwork?pressedArtwork:id));
 for(const event of ['mouseleave','blur'])node.addEventListener(event,releaseArtwork);
}
function interactive(node,id,name){attachCutoutHover(node,id);node.setAttribute('tabindex','0');node.setAttribute('role','button');node.setAttribute('aria-label',name);node.append(el('title',{},name));node.addEventListener('click',e=>{if(ignoreClick)return;const target=e.detail&&node.classList.contains('division')?pressedArtwork||pointerArtwork(e)||id:id;const feature=representedFeatures(nav.current()).find(f=>f.id===target);if(feature)selectFeature(feature);else open(target);});node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(id);}});for(const event of ['mouseenter','focus'])node.addEventListener(event,()=>{if(travelPending||map.dataset.loadState!=='ready')return;$('tooltip').textContent=(map.contains(node)&&hoveredArtwork!==id?map.querySelector(`[data-hover-target="${hoveredArtwork}"]`)?.getAttribute('aria-label'):null)||name;$('tooltip').hidden=false;});for(const event of ['mouseleave','blur'])node.addEventListener(event,()=>{$('tooltip').hidden=true;});}
function label(x,y,text,size){return el('text',{x,y,style:`transform-origin:${x}px ${y}px`,'font-size':size,'stroke-width':size*.16,class:'map-label'},text);}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let activeTransition=null, releaseTransition=null, cameraFrame=0;
let travelPending=false, travelAnimationDone=true, travelGeneration=0;
function settleMapTravel(){
 if(travelAnimationDone&&['ready','error'].includes(map.dataset.loadState)){
  travelPending=false;delete viewport.dataset.traveling;
 }
}
function render(){
 cancelAnimationFrame(cameraFrame);
 const generation=++travelGeneration;
 const changing=map.dataset.mapId && map.dataset.mapId!==nav.current().id;
 releaseTransition?.(); releaseTransition=null;
 activeTransition?.skipTransition();
 travelAnimationDone=true;
 if(changing||travelPending){
  travelPending=true;viewport.dataset.traveling='true';pressedArtwork=null;
  liftArtwork(null);$('tooltip').hidden=true;
 }
 if(!changing || reducedMotion.matches || !document.startViewTransition){paintMap();settleMapTravel();return;}
 travelAnimationDone=false;
 const previous=data.maps.find(m=>m.id===map.dataset.mapId);
 document.documentElement.dataset.mapTravel=previous?.parentMapId===nav.current().id?'out':'in';
 activeTransition=document.startViewTransition(()=>new Promise(resolve=>{
  // Release the browser snapshot on success or error; never hold navigation indefinitely.
  const timer=setTimeout(resolve,1500);
  releaseTransition=()=>{clearTimeout(timer);resolve();};
  paintMap();
 }));
 activeTransition.finished.catch(()=>{}).then(()=>{
  // A cancelled transition must not unlock hover for a newer navigation.
  if(generation!==travelGeneration)return;
  travelAnimationDone=true;settleMapTravel();
 });
}
function paintMap(){
 const s=nav.current(),b=s.bounds;
 if(map.dataset.mapId!==s.id){const journal=document.querySelector('.journal-content');if(journal)journal.scrollTop=0;}
 const backdrop=$('map-backdrop');backdrop.hidden=true;backdrop.removeAttribute('src');
 if(prefetchSelection!==mapAssetURL(s)){prefetchSelection=mapAssetURL(s);assetCache.activate(prefetchSelection);$('prefetch').hidden=true;$('prefetch').dataset.context=s.id;}
 hoveredArtwork=null;cutoutHits=[];map.classList.remove('cutout-active','has-artwork-cutouts');map.replaceChildren();map.setAttribute('aria-label',s.name+' 지도');map.dataset.mapId=s.id;map.dataset.asset=s.asset;
 const image=el('image',{x:b[0],y:b[1],width:b[2],height:b[3],preserveAspectRatio:s.exploration?'xMidYMid meet':'none'});
 map.append(image);
 const retryFirstMap=()=>imageLoader.select(mapAssetURL(s),s.previewAsset,display,true);
 window.AtlasIntro?.setRetry(retryFirstMap);
 const display=state=>{
  if(map.dataset.mapId!==s.id||!image.isConnected)return;
  map.dataset.loadState=state.phase;map.setAttribute('aria-busy',String(state.phase==='loading'||state.phase==='preview'));
  if(state.url){image.setAttribute('href',state.url);for(const cutout of map.querySelectorAll('[data-cutout] image'))cutout.setAttribute('href',state.url);backdrop.src=state.url;backdrop.hidden=false;}else{image.removeAttribute('href');backdrop.hidden=true;backdrop.removeAttribute('src');}
  const status=$('loading');status.hidden=state.phase==='ready';status.replaceChildren();
  if(state.phase==='ready'||state.phase==='error'){releaseTransition?.();releaseTransition=null;settleMapTravel();}
  if(state.phase==='ready'){
   liftArtwork(hoveredArtwork);
   if(lastRevealedMap!==s.id){lastRevealedMap=s.id;image.classList.add('map-arrival');}
   if(window.AtlasIntro)window.AtlasIntro.ready();else document.getElementById('atlas-intro')?.remove();
   // Give the selected image a paint opportunity before starting low-priority work.
   requestAnimationFrame(()=>requestAnimationFrame(()=>{if(map.dataset.mapId===s.id&&image.isConnected)assetCache.prepare(s.id,nextMapAssets(data.maps,s,nav.breadcrumb().map(m=>m.id)),prefetchStatus);}));
   return;
  }
  if(state.phase==='error')window.AtlasIntro?.fail(s.name+' 지도를 불러오지 못했습니다.');
  else window.AtlasIntro?.stage(s.name+' 지도를 펼치는 중…',state.phase==='preview'?'미리보기가 준비됐습니다. 원래 해상도를 불러옵니다.':'지도 그림을 불러오고 있습니다.',state.phase==='preview'?'preview':'map');
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
  if(child.kind==='region'){
   const geometry=child.geometry||{type:'Polygon',coordinates:[child.clickPolygon]};
   // One path drives the visible boundary, pointer hit area and lifted raster clip.
   // Use the actual repartitioned geography, not a display-only displaced curve.
   const boundary=polygonPath(geometry);
   shape=el('path',{d:boundary,'fill-rule':'evenodd'});
   const outline=el('path',{d:boundary,class:'region-outline'+(child.exploration?' exploration-outline':''),'fill-rule':'evenodd','aria-hidden':'true','data-boundary-target':child.id});
   map.append(outline);shape.dataset.softBoundary='true';
  }else if(child.geographicSelection){const outline=contourNode(shape,child.clickPolygon);map.append(outline);}
  shape.setAttribute('class','division '+(child.exploration?'exploration-selection ':'')+(child.kind==='region'&&child.sovereign?'':'detail ')+(child.geographicSelection?'geographic-selection ':'')+(child.status==='ready'?'':'planned'));if(!child.geographicSelection&&child.kind!=='region')shape.classList.add('entry-zone');
  interactive(shape,child.id,child.name+(child.sovereign===false?' 비주권 탐색 구획':'')+(child.status==='ready'?' 상세지도 열기':' · 준비 중'));map.append(shape);
  if(!child.geographicSelection&&child.kind!=='region'&&child.clickPolygon?.length){const pts=child.clickPolygon,x=pts.reduce((v,p)=>v+p[0],0)/pts.length,y=pts.reduce((v,p)=>v+p[1],0)/pts.length;const beacon=el('circle',{cx:x,cy:y,r:4/fit,class:'entry-beacon'});interactive(beacon,child.id,child.name+' 표식 · 상세지도 열기');map.append(beacon);}
  if(s.labels){const c=child.bounds;const x=child.labelAnchor?.[0]??(child.kind==='region'?c[0]+c[2]*.45:child.clickPolygon.reduce((a,p)=>a+p[0],0)/child.clickPolygon.length);const y=child.labelAnchor?.[1]??(child.kind==='region'?c[1]+c[3]*.48:Math.min(...child.clickPolygon.map(p=>p[1]))-fs*.3);const displayName=s.kind==='region'&&child.kind==='settlement'?(data.places.find(p=>p.id===child.placeId)?.name||child.name):child.name;const t=label(x,y,displayName,fs);t.dataset.labelTarget=child.id;t.dataset.priority=child.status==='ready'?'1':'0';t.setAttribute('text-anchor','middle');map.append(t);}
 }
 for(const reference of s.linkedSelectionTargets||[]){
  const target=data.maps.find(m=>m.id===reference.mapId);if(!target||target.status!=='ready')continue;
  const shape=el('polygon',{points:reference.polygon.map(p=>p.join(',')).join(' '),class:'division detail geographic-selection'});
  const outline=contourNode(shape,reference.polygon);map.append(outline);
  interactive(shape,target.id,target.name+' 상세지도 열기');map.append(shape);
  if(s.labels){const x=reference.polygon.reduce((sum,p)=>sum+p[0],0)/reference.polygon.length,y=Math.min(...reference.polygon.map(p=>p[1]))-fs*.3;const t=label(x,y,data.places.find(p=>p.id===target.placeId)?.name||target.name,fs);t.dataset.labelTarget=target.id;t.dataset.priority='1';t.setAttribute('text-anchor','middle');map.append(t);}
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
  const dot=el('circle',{cx:marker[0],cy:marker[1],r:3/fit,class:'spot'+(artwork?' pending-callout':''),tabindex:0,role:'button','aria-label':p.name+' 정보','data-place-id':p.id});dot.append(el('title',{},p.name));const select=()=>{nav.update({selected:p.id});showNote(p.name+' · '+p.rationale+' / 개별 상세도 준비 중');};dot.addEventListener('click',select);dot.addEventListener('keydown',e=>{if(e.key==='Enter')select();});attachCutoutHover(dot,p.id);map.append(dot);if(s.labels){const t=label(marker[0]+5/fit,marker[1]-7/fit,p.name,fs);t.dataset.labelTarget=p.id;map.append(t);}
 }
 for(const rep of s.placeRepresentations||[]){
  const p=data.places.find(p=>p.id===(rep.representsPlaceId||rep.placeId));
  if(!p||data.maps.some(m=>m.parentMapId===s.id&&m.placeId===p.id))continue;
  const uv=rep.imagePoint||rep.artworkAnchor||[rep.artworkPosition.u,rep.artworkPosition.v],pos=localToWorld(uv,b);
  const dot=el('circle',{cx:pos[0],cy:pos[1],r:4/fit,class:'spot',tabindex:0,role:'button','aria-label':p.name+' 개요 정보'});
  const select=()=>showNote(p.name+' · '+p.rationale+' / 생활권 개요의 위치 표시입니다. 개별 상세 지도는 장소 찾기에서 열 수 있습니다.');
  attachCutoutHover(dot,p.id);dot.append(el('title',{},p.name));dot.addEventListener('click',select);dot.addEventListener('keydown',e=>{if(e.key==='Enter')select();});map.append(dot);
  if(s.labels)map.append(label(pos[0]+5/fit,pos[1]-7/fit,p.name,fs));
 }
 if(s.labels)for(const way of (data.circulation||[]).filter(w=>w.mapId===s.id)){
  const pts=way.artworkPath.map(p=>localToWorld(p,b));const line=el('polyline',{points:pts.map(p=>p.join(',')).join(' '),class:'circulation '+way.mode,tabindex:0,role:'button','aria-label':way.name});line.append(el('title',{},way.name));const select=()=>showNote(way.name+' · '+(way.mode==='carriage'?'마차는 광장 가장자리 승하차 지점까지 접근합니다.':'보행 연결입니다. 계단에 마차 통행을 설정하지 않았습니다.'));line.addEventListener('click',select);line.addEventListener('keydown',e=>{if(e.key==='Enter')select();});map.append(line);
  if(way.endRole==='dropoff'){const p=pts.at(-1);map.append(el('rect',{x:p[0]-4/fit,y:p[1]-4/fit,width:8/fit,height:8/fit,class:'dropoff'}));map.append(label(p[0]+6/fit,p[1]+14/fit,'마차 승하차',fs));}
 }
 for(const f of representedFeatures(s)){
  const [x,y]=f.displayWorldAnchor;const dot=el('circle',{cx:x,cy:y,r:3.5/fit,class:'feature'+(s.selected===f.id?' selected':''),tabindex:0,role:'button','aria-label':f.name,'data-feature-id':f.id});attachCutoutHover(dot,f.id);dot.append(el('title',{},f.name));dot.addEventListener('click',()=>selectFeature(f));dot.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectFeature(f);}});map.append(dot);if(s.labels)map.append(label(x+4/fit,y-7/fit,f.name,fs));
 }
 renderCampaign(s,fit,fs);
 $('current-title').textContent=s.name;$('description').textContent=s.description;$('labels').checked=s.labels;$('back').disabled=s.id==='world';$('asset-info').textContent=`출력 ${s.nativePixels.join(' × ')} px · 배경 기준정보 ${(s.effectiveBasePixels||s.nativePixels).join(' × ')} px. 새 시설 상세와 낮은 밀도의 주변 영역이 섞인 검토본이며, 8K 최종본은 아닙니다.`;
 $('breadcrumbs').replaceChildren();const trail=nav.breadcrumb();trail.forEach((m,i)=>{if(i)$('breadcrumbs').append(document.createTextNode('›'));const button=document.createElement('button');button.textContent=m.name;if(m.id===s.id){button.disabled=true;button.setAttribute('aria-current','page');}else button.onclick=()=>history.go(-(trail.length-1-i));$('breadcrumbs').append(button);});
 showNote(s.exploration?'선택한 해안·육지 구간의 지형도입니다. 떨어진 구역은 상위 지도에서 별도로 선택할 수 있으며, 던전·유적은 추후 추가됩니다.':s.kind==='campaign'?'위 전황 선택기로 사건 단계를 바꿀 수 있습니다. 도상 사건 위치는 근사점이며 길의 세부는 새 설계입니다.':s.kind==='pass'?s.description+' · 행군시간과 실제 귀환 동선은 정하지 않았습니다.':s.kind==='district'?'시설과 접근 동선을 새로 그린 별도 원화입니다. 상위 지도 버튼으로 이전 배치에 돌아갈 수 있습니다.':s.kind==='settlement'?'새 상세 원화를 불러왔습니다. 구역 이름을 끄면 무문자 그림을 볼 수 있습니다.':s.id==='world'?'국가·권역 또는 해안의 탐험 구역을 선택해 지형도로 이동하세요. 청록빛 경계는 탐험 지형 구역입니다.':'지도에 표시된 구획을 선택하면 하위 상세 지도를 열 수 있습니다. 마을에 포인터를 올려 상세도 진입 대상을 확인하세요. 금빛 표식도 상세도 진입점을 뜻합니다.');
 mountMapPins();
 mountCutouts(s,image);
 // Lifted artwork must not cover its name or the keyboard/click markers.
 for(const overlay of map.querySelectorAll('.map-label,.feature,.spot,.entry-beacon,.atlas-pin-art,.atlas-pin-hit'))map.append(overlay);
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
function destinationButton(name,status,action,targetId){const b=document.createElement('button');b.className='destination'+(status==='준비 중'?' planned':'');const t=document.createElement('strong');t.textContent=name;const statusText=document.createElement('span');statusText.textContent=status;b.append(t,statusText);b.onclick=action;if(targetId)attachCutoutHover(b,targetId);return b;}
function destinations(){const s=nav.current(),q=$('search').value.trim().toLocaleLowerCase();$('destinations').replaceChildren();
 if(q){$('list-title').textContent='장소 검색 결과';const matches=searchDestinations(data,q);for(const p of matches){const status=p.redirect?(p.targetName+' 지도 · 열기'):(p.kind==='region'?(p.exploration?'탐험 구역 · ':'국가·권역 · '):'')+(p.ready?'상세도':'준비 중');$('destinations').append(destinationButton(p.name,status,()=>{if(!p.ready){showNote(p.name+' · '+(p.kind==='region'?'국가·권역':'장소')+' 상세 원화 준비 중'+(p.kind==='place'?' / '+p.note:''));return;}while(nav.current().id!=='world'){nav.back();}depth=0;history.replaceState({atlasDepth:0,mapId:'world'},'','#world');for(const step of entryPath(data.maps,p.mapId))open(step,false);render();}));}if(!matches.length)$('destinations').textContent='해당 지명을 찾지 못했습니다.';return;}
 $('list-title').textContent=s.kind==='settlement'?'시설·생활 공간':'다음 상세도';
 if(s.kind==='settlement'||s.kind==='district'){for(const child of data.maps.filter(m=>m.parentMapId===s.id))$('destinations').append(destinationButton(child.name,'상세 구획',()=>open(child.id),child.id));for(const f of representedFeatures(s))$('destinations').append(destinationButton(f.name,'위치',()=>selectFeature(f),f.id));if(s.kind==='district')$('list-title').textContent='시설과 출입 동선';if(s.id==='silverkeep-civic'){const note=document.createElement('p');note.textContent='금색: 마차 접근 · 청록 점선: 보행. 광장 승하차 후 법정 계단은 걸어서 이동합니다. 지명을 끄면 동선 표시도 숨깁니다.';$('destinations').append(note);}}
 else if(s.kind==='campaign'){$('list-title').textContent='협곡과 전황';$('destinations').textContent='북쪽 좁은목 → 중앙 골짜기 → 남쪽 접근로. 위 전황 선택기에서 사건 단계를 바꿀 수 있습니다. 부대의 정확한 봉쇄 수단과 듀란의 탈출 경로는 정해지지 않았습니다.';}
 else if(s.kind==='pass'){$('list-title').textContent=s.accessLinks?.length?'연결된 상세도':'도로 설계 검토';const note=document.createElement('p');note.textContent=s.id==='hesmarga-geographic-access'?'수레는 상부 환적장에서 멈춥니다. 계단은 인력 운반, 아래 부두의 경사로는 국소 운반 동선입니다.':s.description;$('destinations').append(note);for(const link of s.accessLinks||[]){const target=data.maps.find(m=>m.id===link.detailMapId);if(target)$('destinations').append(destinationButton(target.name,'접근점',()=>open(target.id),target.id));}}else {for(const child of data.maps.filter(m=>m.parentMapId===s.id))$('destinations').append(destinationButton(child.name,child.status==='ready'?(child.exploration?'탐험 지형도':'열기'):'준비 중',()=>open(child.id),child.id));for(const reference of s.linkedSelectionTargets||[]){const target=data.maps.find(m=>m.id===reference.mapId);if(target)$('destinations').append(destinationButton(target.name,'열기',()=>open(target.id),target.id));}}
}
function zoom(factor){cancelAnimationFrame(cameraFrame);const s=nav.current();nav.update({zoom:Math.max(1,Math.min(metrics().max,s.zoom*factor))});camera();}
const fit=()=>{
 cancelAnimationFrame(cameraFrame);
 const s=nav.current(),b=s.bounds,target=[b[0]+b[2]/2,b[1]+b[3]/2],start=performance.now();
 const step=now=>{if(nav.current().id!==s.id)return;const t=reducedMotion.matches?1:Math.min(1,(now-start)/360),ease=1-(1-t)**3;
 nav.update({zoom:s.zoom+(1-s.zoom)*ease,center:s.center.map((v,i)=>v+(target[i]-v)*ease)});camera();
 if(t<1)cameraFrame=requestAnimationFrame(step);};
 cameraFrame=requestAnimationFrame(step);
};
$('back').onclick=back;$('fit').onclick=fit;$('plus').onclick=()=>zoom((nav.current().zoom+.2)/nav.current().zoom);$('minus').onclick=()=>zoom((nav.current().zoom-.2)/nav.current().zoom);$('labels').onchange=()=>{nav.update({labels:$('labels').checked});render();};$('search').oninput=destinations;
$('campaign-stage').onchange=render;
$('focus-map').onclick=()=>{const change=()=>{const focused=document.body.classList.toggle('map-focused');$('focus-map').setAttribute('aria-pressed',String(focused));$('focus-map').textContent=focused?'전체 화면 구성':'지도 집중보기';};if(document.startViewTransition&&!reducedMotion.matches){activeTransition?.skipTransition();activeTransition=document.startViewTransition(change);activeTransition.finished.catch(()=>{});}else change();};
map.addEventListener('wheel',e=>{e.preventDefault();zoom(e.deltaY<0?1.12:1/1.12);},{passive:false});
map.addEventListener('pointermove',e=>{
 if(e.pointerType==='touch'||drag?.moved)return;
 const id=pointerArtwork(e);
 if(id){if(id!==hoveredArtwork||hoverReleaseTimer)liftArtwork(id);else updateRegionClip(id);}else if(!hoverReleaseTimer)releaseArtwork();
});
map.addEventListener('pointerleave',()=>liftArtwork(null));
map.addEventListener('click',e=>{
 if(ignoreClick||e.target.closest('[data-hover-target]'))return;
 const id=cutoutAt(e);if(!id)return;
 const feature=representedFeatures(nav.current()).find(f=>f.id===id);
 if(feature)selectFeature(feature);else if(data.maps.some(m=>m.id===id))open(id);
 else{const node=map.querySelector(`[data-hover-target="${id}"]`);node?.dispatchEvent(new MouseEvent('click',{bubbles:false}));}
});
map.addEventListener('pointerdown',e=>{if(e.button!==0)return;pressedArtwork=pointerArtwork(e);cancelAnimationFrame(cameraFrame);drag={x:e.clientX,y:e.clientY,state:nav.current(),moved:false};});
map.addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)<5&&!drag.moved)return;drag.moved=true;map.setPointerCapture(e.pointerId);const s=drag.state,b=s.bounds,scale=metrics().fit*s.zoom;nav.update({center:[Math.max(b[0],Math.min(b[0]+b[2],s.center[0]-dx/scale)),Math.max(b[1],Math.min(b[1]+b[3],s.center[1]-dy/scale))]});camera();});
map.addEventListener('pointerup',e=>{ignoreClick=!!drag?.moved;drag=null;if(map.hasPointerCapture(e.pointerId))map.releasePointerCapture(e.pointerId);setTimeout(()=>{ignoreClick=false;pressedArtwork=null;},0);});map.addEventListener('pointercancel',()=>{drag=null;pressedArtwork=null;});
new ResizeObserver(()=>{const s=nav.current();nav.update({zoom:Math.min(s.zoom,metrics().max)});camera();}).observe(viewport);
render();
// Font loading changes measured text widths after the initial collision pass.
document.fonts?.ready.then(()=>camera());
