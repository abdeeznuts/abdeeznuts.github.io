export function createScreenAwake(nav=navigator,doc=document) {
  let wanted=false,disposed=false,lock=null,pending=false;
  const release=()=>{const previous=lock;lock=null;previous?.release().catch(()=>{})};
  const sync=async()=>{
    if(disposed||!wanted||doc.hidden){release();return}
    if(lock||pending||!nav.wakeLock)return;
    pending=true;
    try {
      const next=await nav.wakeLock.request('screen');
      if(disposed||!wanted||doc.hidden){await next.release();return}
      lock=next;next.addEventListener('release',()=>{if(lock===next)lock=null},{once:true});
    }catch{}finally{pending=false}
  };
  doc.addEventListener('visibilitychange',sync);
  return {set(value){wanted=value;sync()},dispose(){disposed=true;release();doc.removeEventListener('visibilitychange',sync)}};
}
