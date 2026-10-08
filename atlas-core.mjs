const copy=x=>structuredClone(x);
export function campaignLayer(data,id){
 const stage=data.campaign?.stages.find(s=>s.id===id);if(!stage)return null;
 const green=data.places.find(p=>p.row===15);
 const markers=[{id:'campaign-greenhallow',position:[green.x,green.y],label:'그린할로우 · '+stage.greenhollow}];
 if(id==='gorge')markers.push({id:'campaign-gorge',position:[...data.campaign.gorgeAnchor],label:'협곡 결전 · 후방 봉쇄 · 근사점'});
 return {...copy(stage),markers,facilityStateOverride:null,occupationPolygon:null};
}
export function searchDestinations(data,query){
 const q=query.trim().toLocaleLowerCase();if(!q)return [];
 const regions=data.maps.filter(m=>m.kind==='region'&&m.name.toLocaleLowerCase().includes(q)).map(m=>({name:m.name,mapId:m.id,kind:'region',ready:m.status==='ready'&&!!m.asset,note:m.description}));
 const places=data.places.filter(p=>(p.name+' '+p.region).toLocaleLowerCase().includes(q)).map(p=>({name:p.name,mapId:p.detailMapId||null,kind:'place',ready:!!p.detailMapId,note:p.rationale}));
 return [...regions,...places];
}
function boundsOK(b){if(!Array.isArray(b)||b.length!==4||!b.every(Number.isFinite)||b[2]<=0||b[3]<=0)throw new Error('Invalid map bounds');}
export function worldToLocal(p,b){boundsOK(b);return [(p[0]-b[0])/b[2],(p[1]-b[1])/b[3]];}
export function localToWorld(p,b){boundsOK(b);return [b[0]+p[0]*b[2],b[1]+p[1]*b[3]];}
export function visibleLabelIndexes(rectangles,gap=4){
 const accepted=[];
 for(const i of rectangles.map((_,i)=>i).sort((a,b)=>(rectangles[b].priority||0)-(rectangles[a].priority||0))){
  const r=rectangles[i];
  if(!accepted.some(j=>{const a=rectangles[j];return r.x<a.x+a.w+gap&&r.x+r.w+gap>a.x&&r.y<a.y+a.h+gap&&r.y+r.h+gap>a.y;}))accepted.push(i);
 }
 return accepted;
}
export function entryPath(maps,id){
 const byId=new Map(maps.map(m=>[m.id,m])),path=[],seen=new Set();let m=byId.get(id);
 while(m&&m.id!=='world'){
  if(seen.has(m.id)||m.status!=='ready'||!m.asset)return [];
  seen.add(m.id);path.unshift(m.id);m=byId.get(m.parentMapId);
 }
 return m?.id==='world'?path:[];
}
export function createNavigator(maps){
 const byId=new Map(maps.map(m=>[m.id,m]));const stack=[];
 const fresh=id=>{const m=byId.get(id);boundsOK(m.bounds);return {...copy(m),zoom:1,center:[m.bounds[0]+m.bounds[2]/2,m.bounds[1]+m.bounds[3]/2],labels:true,selected:null};};
 let state=fresh('world');
 return {
  current:()=>copy(state),
  update:patch=>{for(const key of ['zoom','center','labels','selected'])if(key in patch)state[key]=copy(patch[key]);},
  enter:id=>{const m=byId.get(id),linked=state.accessLinks?.some(link=>link.detailMapId===id)||state.linkedSelectionTargets?.some(target=>target.mapId===id);if(!m||(!linked&&m.parentMapId!==state.id)||m.status!=='ready'||!m.asset)return false;stack.push(copy(state));state=fresh(id);return true;},
  back:()=>{if(!stack.length)return false;state=stack.pop();return true;},
  breadcrumb:()=>[...stack.map(copy),copy(state)]
 };
}
export function mapAssetURL(map){return map.assetRevision?`${map.asset}?v=${encodeURIComponent(map.assetRevision)}`:map.asset;}
