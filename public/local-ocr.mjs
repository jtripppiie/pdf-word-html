let worker,pendingReject,pendingTimer;
export function recognizeLocal(image,onStatus=()=>{}){
 worker ||= new Worker('/ocr-worker.mjs',{type:'module'});
 return new Promise((resolve,reject)=>{
  pendingReject=reject;const timer=pendingTimer=setTimeout(()=>{worker?.terminate();worker=null;reject(Error('Local equation recognition timed out.'));},180000);
  worker.onmessage=event=>{if(event.data.status){onStatus(event.data.status);return;}clearTimeout(timer);event.data.error?reject(Error(event.data.error)):resolve(event.data.tex);};
  worker.onerror=()=>{clearTimeout(timer);worker?.terminate();worker=null;reject(Error('This browser could not run local equation recognition.'));};
  worker.postMessage({image});
 });
}

export function cancelRecognition(){worker?.terminate();worker=null;clearTimeout(pendingTimer);pendingReject?.(Error('Equation recognition stopped.'));pendingReject=null;}
