// Only the selected map owns a request. Decoded blobs are released on navigation.
export function createMapLoader({fetchImage=fetch, ImageClass=Image, urls=URL, timeout=45000,assetCache}={}) {
 let current;
 function select(asset, preview, notify, retry=false) {
  if(current?.asset===asset&&!retry){current.notify=notify;notify(current.state);return;}
  if(retry)assetCache?.invalidate(asset);
  if(current){current.abort.abort();for(const url of current.urls)urls.revokeObjectURL(url);}
  const task=current={asset,notify,abort:new AbortController(),urls:[],state:{phase:'loading'}};
  const previewAbort=new AbortController();
  task.abort.signal.addEventListener('abort',()=>previewAbort.abort(),{once:true});
  const emit=state=>{if(current===task&&!task.abort.signal.aborted){task.state=state;task.notify(state);}};
  const read=async (url,signal,isFull=false)=>{
   let blob;
   if(isFull&&assetCache)blob=await assetCache.get(url,{signal});
   else{const response=await fetchImage(url,{signal});if(!response.ok)throw Error(`HTTP ${response.status}`);blob=await response.blob();}
   if(signal.aborted)throw Error('cancelled');
   const objectURL=urls.createObjectURL(blob);task.urls.push(objectURL);
   const img=new ImageClass();
   signal.addEventListener('abort',()=>{
    img.src='';
    if(task.state.url!==objectURL){urls.revokeObjectURL(objectURL);task.urls=task.urls.filter(url=>url!==objectURL);}
   },{once:true});
   img.src=objectURL;try{await img.decode();}catch(error){if(isFull&&!signal.aborted)assetCache?.invalidate(url);throw error;}
   if(signal.aborted)throw Error('cancelled');
   return objectURL;
  };
  emit({phase:'loading'});
  let full=false;
  const timer=setTimeout(()=>{if(current!==task)return;emit({...task.state,phase:'error'});task.abort.abort();},timeout);
  task.abort.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
  if(preview&&!assetCache?.has(asset)&&!assetCache?.pending(asset))read(preview,previewAbort.signal).then(url=>{if(!full)emit({phase:'preview',url});}).catch(()=>{});
  read(asset,task.abort.signal,true).then(url=>{full=true;emit({phase:'ready',url});}).catch(()=>{full=true;emit({...task.state,phase:'error'});}).finally(()=>{previewAbort.abort();clearTimeout(timer);});
 }
 return {select};
}
