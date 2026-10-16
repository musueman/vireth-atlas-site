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
 const regions=data.maps.filter(m=>m.kind==='region'&&m.name.toLocaleLowerCase().includes(q)).map(m=>({name:m.name,mapId:m.id,kind:'region',exploration:!!m.exploration,ready:m.status==='ready'&&!!m.asset,note:m.description}));
 const places=data.places.filter(p=>(p.name+' '+p.region).toLocaleLowerCase().includes(q)).map(p=>({name:p.name,mapId:p.detailMapId||null,kind:'place',ready:!!p.detailMapId,note:p.rationale}));
 const aliases=(data.mapRedirects||[]).filter(m=>m.name.toLocaleLowerCase().includes(q)).map(m=>({name:m.name,mapId:m.redirectMapId,kind:'region',redirect:true,targetName:data.maps.find(t=>t.id===m.redirectMapId)?.name,ready:data.maps.some(t=>t.id===m.redirectMapId&&t.status==='ready'),note:m.redirectReason}));
 return [...regions,...aliases,...places];
}
export function regionHoverGeometry(g,point,anchor){
 if(!g||g.type!=='MultiPolygon')return g;
 const inside=(ring,p)=>{if(!p)return false;let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;};
 const contains=(poly,p)=>inside(poly[0],p)&&!poly.slice(1).some(r=>inside(r,p));
 const poly=g.coordinates.find(p=>contains(p,point))||g.coordinates.find(p=>contains(p,anchor))||g.coordinates[0];
 return poly?{type:'Polygon',coordinates:poly}:g;
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
 while(m?.status==='redirect'){if(seen.has(m.id))return [];seen.add(m.id);m=byId.get(m.redirectMapId);}
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

// Reserve the expanded extent so hover never reflows neighbouring names.
export function layoutMapLabels(rectangles, viewport, gap=4){
 const placed=[];
 return rectangles.map(r=>{
  const candidates=[[0,0]];
  for(let step=12;step<=180;step+=12)for(const [x,y] of [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]])candidates.push([x*step,y*step]);
  let best=null,bestScore=Infinity;
  for(const [dx,dy] of candidates){
   const x=Math.max(viewport.x,Math.min(r.x+dx,viewport.x+viewport.w-r.w)),y=Math.max(viewport.y,Math.min(r.y+dy,viewport.y+viewport.h-r.h));
   const box={x,y,w:r.w,h:r.h};
   const overlap=placed.reduce((sum,a)=>sum+Math.max(0,Math.min(x+r.w+gap,a.x+a.w+gap)-Math.max(x,a.x))*Math.max(0,Math.min(y+r.h+gap,a.y+a.h+gap)-Math.max(y,a.y)),0);
   const score=overlap*10000+Math.hypot(x-r.x,y-r.y);
   if(score<bestScore){best=box;bestScore=score;}if(overlap===0&&dx===0&&dy===0)break;
  }
  placed.push(best);return best;
 });
}

// Screen-space placement keeps rendered callouts away from map controls and names.
// Presentation only: preserve separate rings/islands and bound each corner trim.
export function softBoundaryPath(geometry,maxTrim=8){
 const polys=geometry.type==='MultiPolygon'?geometry.coordinates:[geometry.coordinates];
 return polys.flatMap(poly=>poly.map(ring=>{
  let points=ring.filter((p,i)=>!i||p[0]!==ring[i-1][0]||p[1]!==ring[i-1][1]);
  if(points.length>1&&points[0][0]===points.at(-1)[0]&&points[0][1]===points.at(-1)[1])points.pop();
  if(points.length<3)return '';
  // Remove redundant straight samples before softening long ruler-like cuts.
  points=points.filter((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>1e-7||(p[0]-a[0])*(b[0]-p[0])+(p[1]-a[1])*(b[1]-p[1])<=0;});
  points=points.flatMap((p,i)=>{
   const q=points[(i+1)%points.length],length=Math.hypot(q[0]-p[0],q[1]-p[1]);
   if(length<40)return [p];
   // Canonical direction makes a shared edge identical when traversed backwards.
   const forward=p[0]<q[0]||p[0]===q[0]&&p[1]<q[1],a=forward?p:q,b=forward?q:p;
   const count=Math.ceil(length/24),mid=[];
   for(let j=1;j<count;j++){
    const t=j/count,offset=Math.sin(Math.PI*t)*Math.sin(t*Math.PI*3+(a[0]+a[1])*.03)*Math.min(6,length*.035);
    mid.push([a[0]+(b[0]-a[0])*t-(b[1]-a[1])/length*offset,a[1]+(b[1]-a[1])*t+(b[0]-a[0])/length*offset]);
   }
   return [p,...(forward?mid:mid.reverse())];
  });
  const corners=points.map((p,i)=>{
   const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length];
   const a=Math.hypot(prev[0]-p[0],prev[1]-p[1]),b=Math.hypot(next[0]-p[0],next[1]-p[1]);
   const trim=Math.min(maxTrim,a*.22,b*.22);
   const toward=(q,d)=>p.map((v,j)=>v+(q[j]-v)*trim/d);
   return {p,enter:toward(prev,a),exit:toward(next,b)};
  });
  return 'M'+corners.at(-1).exit.join(',')+corners.map(c=>'L'+c.enter.join(',')+'Q'+c.p.join(',')+' '+c.exit.join(',')).join('')+'Z';
 })).join('');
}
export function placeMapCallout(anchor,size,view,obstacles=[]){
 const w=Math.min(size.w,view.w-16),h=Math.min(size.h,view.h-16),candidates=[];
 for(const distance of [18,30,42,54,78,102,126,150,174,198,222])for(const dx of [0,-24,24,-48,48,-96,96,-144,144,-192,192,-240,240]){
  candidates.push([anchor.x-w/2+dx,anchor.y-distance-h,'above'],[anchor.x-w/2+dx,anchor.y+distance,'below']);
 }
 // Sample the edges of free space as well as fixed offsets. Dense maps can have
 // a valid gap only a few pixels away from the old sampling grid.
 const xs=new Set([8,view.w-w-8,anchor.x-w/2]),ys=new Set([8,view.h-h-8]);
 for(const b of obstacles){xs.add(b.x-w-6);xs.add(b.x+b.w+6);ys.add(b.y-h-6);ys.add(b.y+b.h+6);}
 for(const x of xs)for(const y of ys){if(y+h<=anchor.y-12)candidates.push([x,y,'above']);else if(y>=anchor.y+12)candidates.push([x,y,'below']);}
 let best,score=Infinity;
 for(const [px,py,side] of candidates){
  const x=Math.max(8,Math.min(px,view.w-w-8)),y=Math.max(8,Math.min(py,view.h-h-8));
  const overlap=obstacles.reduce((sum,b)=>sum+Math.max(0,Math.min(x+w+4,b.x+b.w)-Math.max(x-4,b.x))*Math.max(0,Math.min(y+h+4,b.y+b.h)-Math.max(y-4,b.y)),0);
  if(side==='above'&&y+h>anchor.y-12||side==='below'&&y<anchor.y+12)continue;
  const cost=overlap*10000+Math.hypot(x+w/2-anchor.x,y+h/2-anchor.y)+Math.abs(x+w/2-anchor.x)*2+(side==='below'?12:0);
  if(cost<score){score=cost;best={x,y,w,h,side,overlap};}
 }
 return best||{x:8,y:8,w,h,side:'above',overlap:Infinity};
}
