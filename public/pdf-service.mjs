export async function convertPdfWithService(file,onProgress,signal) {
  const response=await fetch('/api/convert-pdf',{method:'POST',headers:{'Content-Type':'application/pdf'},body:file,signal});
  if(!response.ok)throw Error(await response.text()||'Could not start automatic PDF conversion.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result,lastStatus='Recognizing PDF equations…';
  function consume(line){
    if(!line.trim())return;
    const event=JSON.parse(line);
    if(event.error)throw Error(event.error);
    if(event.status){lastStatus=event.status;onProgress(lastStatus);}
    if(event.elapsed)onProgress(`${lastStatus} (${Math.floor(event.elapsed/60)}m ${event.elapsed%60}s)`);
    if(event.result)result=event.result;
  }
  try{
    while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let at;while((at=buffer.indexOf('\n'))>=0){consume(buffer.slice(0,at));buffer=buffer.slice(at+1);}}
    buffer+=decoder.decode();consume(buffer);
  }finally{await reader.cancel().catch(()=>{});}
  if(!result)throw Error('The PDF conversion ended before returning a result.');
  return result;
}
