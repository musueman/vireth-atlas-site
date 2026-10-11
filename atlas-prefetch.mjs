export const PREFETCH_BUDGET=48*1024*1024;
export function nextMapAssets(maps,current,ancestors=[]){
 const excluded=new Set([current.id,...ancestors]),seen=new Set();
 const links=new Set([...(current.accessLinks||[]).map(x=>x.detailMapId),...(current.linkedSelectionTargets||[]).map(x=>x.mapId)]);
 return maps.filter(m=>!excluded.has(m.id)&&m.status==='ready'&&m.asset&&(m.parentMapId===current.id||links.has(m.id)))
  .filter(m=>{if(seen.has(m.asset))return false;seen.add(m.asset);return true;})
  .map(m=>({id:m.id,url:m.assetRevision?`${m.asset}?v=${encodeURIComponent(m.assetRevision)}`:m.asset,bytes:m.assetBytes}));
}

// The budget covers retained compressed blobs + reserved background transfers.
// Decoding and object URLs belong exclusively to the selected-image loader.
export function createAssetCache({fetchImage=fetch,budget=PREFETCH_BUDGET,concurrency=2,timeout=45000}={}){
 const cache=new Map(),running=new Map();let bytes=0,selected=null,context=null,userPaused=false,networkReason='',limit=concurrency;
 const abortError=()=>new DOMException('Cancelled','AbortError');
 const touch=url=>{const blob=cache.get(url);if(blob){cache.delete(url);cache.set(url,blob);}return blob;};
 const background=()=>[...running.values()].filter(e=>!e.foreground);
 const reserved=()=>background().reduce((n,e)=>n+e.expected,0);
 const protectedURLs=()=>new Set([selected,...(context?.targets||[]).map(x=>x.url)]);
 function evict(required){
  const protectedSet=protectedURLs();
  for(const [url,blob] of cache){if(bytes+reserved()+required<=budget)break;if(protectedSet.has(url))continue;cache.delete(url);bytes-=blob.size;}
  return bytes+reserved()+required<=budget;
 }
 function stats(){
  const targets=context?.targets||[],ready=targets.filter(x=>cache.has(x.url)).length;
  return {context:context?.id,ready,total:targets.length,available:context?.available||0,failed:context?.failed.size||0,
   skipped:context?.skipped||0,active:background().length,paused:userPaused,networkReason,
   done:!!context&&!context.queue.length&&!background().length,bytes,reservedBytes:reserved(),budget,concurrency:limit};
 }
 const emit=()=>context?.notify(stats());
 function cancel(entry){entry.abort.abort();if(running.get(entry.url)===entry)running.delete(entry.url);}
 function start(url,expected,foreground){
  const existing=running.get(url);if(existing){if(foreground)existing.foreground=true;return existing.promise;}
  const entry={url,expected,foreground,abort:new AbortController()};running.set(url,entry);
  const timer=setTimeout(()=>entry.abort.abort(),timeout);
  entry.promise=(async()=>{
   const response=await fetchImage(url,{signal:entry.abort.signal,priority:foreground?'high':'low'});
   if(!response.ok)throw Error(`HTTP ${response.status}`);
   let blob;
   if(response.body?.getReader){
    const reader=response.body.getReader(),chunks=[];let length=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
     if(entry.abort.signal.aborted)throw abortError();
     if(!entry.foreground&&length>expected)throw Error('Image exceeds reserved bytes');chunks.push(value);}
     blob=new Blob(chunks,{type:response.headers.get('content-type')||'image/webp'});
    }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
   }else blob=await response.blob();
   if(entry.abort.signal.aborted)throw abortError();
   if(!entry.foreground&&blob.size>expected)throw Error('Image exceeds reserved bytes');
   if(running.get(url)===entry)running.delete(url);
   if(blob.size<=budget&&evict(blob.size)){cache.set(url,blob);bytes+=blob.size;}
   return blob;
  })().finally(()=>{clearTimeout(timer);if(running.get(url)===entry)running.delete(url);});
  return entry.promise;
 }
 function pump(){
  const ctx=context;if(!ctx||userPaused||networkReason)return;
  while(background().length<limit&&ctx.queue.length){
   const target=ctx.queue.shift();if(cache.has(target.url))continue;
   if(!evict(target.bytes)){ctx.skipped++;ctx.targets=ctx.targets.filter(x=>x!==target);continue;}
   start(target.url,target.bytes,false).catch(error=>{if(context===ctx&&error.name!=='AbortError')ctx.failed.add(target.url);})
    .finally(()=>{if(context===ctx){emit();pump();}});
  }
  emit();
 }
 function activate(url){
  if(selected===url)return;
  selected=url;context=null;
  for(const entry of running.values()){if(entry.url===url)entry.foreground=true;else cancel(entry);}
 }
 function get(url,{signal}={}){
  if(signal?.aborted)return Promise.reject(abortError());
  const cached=touch(url);if(cached)return Promise.resolve(cached);
  const promise=start(url,0,true),entry=running.get(url);
  const cancelSelected=()=>cancel(entry);signal?.addEventListener('abort',cancelSelected,{once:true});
  return promise.finally(()=>signal?.removeEventListener('abort',cancelSelected));
 }
 function prepare(id,candidates,notify){
  if(context?.id===id){context.notify=notify;emit();return;}
  const targets=[],seen=new Set();let sum=cache.get(selected)?.size||0,skipped=0;
  for(const target of candidates){
   if(target.url===selected||seen.has(target.url))continue;seen.add(target.url);
   if(!Number.isFinite(target.bytes)||target.bytes<=0||sum+target.bytes>budget){skipped++;continue;}
   sum+=target.bytes;targets.push(target);
  }
  context={id,targets,queue:targets.filter(x=>!cache.has(x.url)),failed:new Set(),available:seen.size,skipped,notify};
  emit();pump();
 }
 function stopBackground(){
  if(!context)return;
  const active=background();for(const entry of active){cancel(entry);const target=context.targets.find(x=>x.url===entry.url);if(target&&!context.queue.includes(target))context.queue.unshift(target);}
  emit();
 }
 function setPaused(value){userPaused=value;if(value)stopBackground();else pump();emit();}
 function setNetwork(connection){
  const oldLimit=limit;
  networkReason=connection?.saveData?'데이터 절약 모드':/^(slow-2g|2g)$/.test(connection?.effectiveType||'')?'느린 연결':'';
  limit=connection?.effectiveType==='3g'?1:concurrency;
  if(networkReason||limit<oldLimit)stopBackground();if(!networkReason)pump();emit();
 }
 function dispose(){context=null;for(const e of running.values())cancel(e);cache.clear();bytes=0;selected=null;}
 function invalidate(url){const blob=cache.get(url);if(blob){bytes-=blob.size;cache.delete(url);}}
 return {activate,get,prepare,setPaused,setNetwork,stats,dispose,invalidate,has:url=>cache.has(url),pending:url=>running.has(url)};
}
