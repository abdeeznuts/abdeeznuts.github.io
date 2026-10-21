let worker=null, pending=null, sequence=0, ready=false, releaseTimer;
export const phoneAIReady=()=>ready;
const notifyState=()=>globalThis.dispatchEvent?.(new Event('phone-ai-state'));
export function phoneAIError(message=''){
  const details=String(message).slice(0,1400);
  let text='Safari could not prepare the AI model. Try again, or create a curated itinerary.';
  if(/tensor-cache record|shard size|incomplete/i.test(details))text='A travel AI file is incomplete. Try again to repair it. Your natural voice download will be kept.';
  else if(/out of memory|memory access|allocation|device.*lost|buffer.*size/i.test(details))text='Your device ran out of working memory for AI. Close other apps and try again.';
  else if(/fetch|network|download|load failed|HTTP|CORS/i.test(details))text='The AI download was interrupted. Check your connection and try again; saved files will be reused.';
  else if(/quota|storage|disk/i.test(details))text='There is not enough website storage for AI. Free some space on your phone, then try again.';
  else if(/shader|WebGPU|GPUValidation|compile|compilation/i.test(details))text='Safari could not start this AI model on the phone. The curated planner is available while we resolve compatibility.';
  return Object.assign(new Error(text),{details});
}
export const isInstalledIPhone=()=>/iPhone/i.test(navigator.userAgent||'')&&
  (!!globalThis.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone===true);
export function autoPhoneAIEnabled(){
  try{return isInstalledIPhone()&&localStorage.getItem('uniworld-phone-ai-off')!=='1'}catch{return false}
}
export async function phoneAISupport(){
  if(!globalThis.isSecureContext || !navigator.gpu) return {supported:false,message:'Open in Safari on iOS 26 or later to check phone AI support. The curated planner is ready here.'};
  try {
    const adapter=await navigator.gpu.requestAdapter();
    if(!adapter || !adapter.features.has('shader-f16')) return {supported:false,message:'This browser cannot run the pocket model. Try updated Safari, or use the curated planner.'};
    return {supported:true,message:'This browser supports on-device AI. Download the model once to begin.'};
  }catch{return {supported:false,message:'Device AI is unavailable in this browser. The curated planner is ready.'}}
}
export function stopPhoneAI(reason='Stopped. You can try again or use the curated planner.'){
  clearTimeout(releaseTimer);
  worker?.terminate(); worker=null; ready=false;
  if(pending){clearTimeout(pending.timer);const reject=pending.reject;pending=null;reject(new DOMException(reason,'AbortError'))}
  notifyState();
}
function execute(action,input,onProgress){
  if(pending) return Promise.reject(new Error('A planner task is already running.'));
  clearTimeout(releaseTimer);
  if(!worker){
    worker=new Worker('/phone-ai-worker.js',{type:'module',name:'Uniworld pocket planner'});
    const activeWorker=worker;
    worker.onmessage=({data})=>{
      if(worker!==activeWorker || !pending || pending.id!==data.id)return;
      if(data.type==='progress'){pending.onProgress?.(data);return}
      const task=pending;pending=null;clearTimeout(task.timer);
      if(data.type==='error'){
        worker?.terminate();worker=null;ready=false;
        task.reject(phoneAIError(data.message));
      }else{
        ready=task.action!=='remove';task.resolve(data.result);
        // Release GPU memory after inactivity; downloaded files remain available for reuse.
        releaseTimer=setTimeout(()=>stopPhoneAI(),120000);
      }
      notifyState();
    };
    worker.onerror=()=>{if(worker===activeWorker)stopPhoneAI('Safari could not start phone AI. Retry or use the curated planner.')};
  }
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>stopPhoneAI('This took too long. Check Wi-Fi and retry, or use the curated planner.'),action==='load'?600000:300000);
    pending={id,action,resolve,reject,onProgress,timer};
    worker.postMessage({id,action,input});
  });
}
export async function loadPhoneAI(onProgress){
  if(ready){onProgress?.({stage:'ready',fraction:1,message:'Phone AI is ready. No new download is needed.'});return true}
  const support=await phoneAISupport();
  if(!support.supported)throw new Error(support.message);
  return execute('load',null,onProgress);
}
export const generatePhoneItinerary=(input,onProgress)=>execute('generate',input,onProgress);
export const askPhoneConcierge=(input,onProgress)=>execute('concierge',input,onProgress);
export const generateVoiceJourney=(input,onProgress)=>execute('voice-plan',input,onProgress);
export async function removePhoneAI(){
  stopPhoneAI();
  await execute('remove');
  stopPhoneAI();
}
addEventListener('pagehide',()=>stopPhoneAI());
