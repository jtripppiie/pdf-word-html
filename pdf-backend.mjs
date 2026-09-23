import {sharingEnabled} from './share-backend.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
let occupied=false;
let activeChild;
const python=process.env.PDF_PARSER_PYTHON;
function stopChild(child){if(!child?.pid)return;try{if(process.platform==='win32')child.kill('SIGTERM');else process.kill(-child.pid,'SIGTERM');}catch{}}
if(python)for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{stopChild(activeChild);process.exit(0);});
export async function pdfBackend(req,res) {
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/api/capabilities'&&req.method==='GET'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
    res.end(JSON.stringify({structuredPdf:!!python,sharing:sharingEnabled}));return true;
  }
  if(pathname!=='/api/convert-pdf')return false;
  if(!python){res.writeHead(503);res.end('The automatic PDF parser is not configured.');return true;}
  if(req.method!=='POST'){res.writeHead(405);res.end();return true;}
  if(req.headers['content-type']!=='application/pdf'){res.writeHead(415);res.end('Expected a PDF.');return true;}
  if(occupied){res.writeHead(409);res.end('Another PDF is being converted. Try again when it finishes.');return true;}
  occupied=true;let directory,child,timer,disconnected=false;
  const abort=()=>{disconnected=true;stopChild(child);};
  res.on('close',abort);
  const send=value=>{if(!res.destroyed)res.write(JSON.stringify(value)+'\n');};
  try{
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>30*1024*1024){res.writeHead(413);res.end('Maximum PDF size is 30 MB.');return true;}chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);
    if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-'))){res.writeHead(400);res.end('This file is not a PDF.');return true;}
    directory=await mkdtemp(join(tmpdir(),'pdf-html-'));
    const input=join(directory,'input.pdf'),output=join(directory,'result.json');
    await writeFile(input,bytes);
    if(disconnected)return true;
    res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    send({status:'Opening the PDF for automatic math recognition…'});
    child=spawn(python,[resolve('scripts/parse-pdf.py'),input,output],{detached:process.platform!=='win32',stdio:['ignore','pipe','pipe'],env:{...process.env,PYTHONUNBUFFERED:'1'}});activeChild=child;
    let remainder='',lastError='',started=Date.now();
    child.stdout.on('data',chunk=>{remainder+=chunk;let at;while((at=remainder.indexOf('\n'))>=0){const line=remainder.slice(0,at);remainder=remainder.slice(at+1);try{const event=JSON.parse(line);if(event.error)lastError=event.error;else if(event.status)send(event);}catch{}}});
    child.stderr.on('data',chunk=>{
      const message=chunk.toString();
      const window=message.match(/processing window (\d+)\/(\d+): pages ([\d-]+)\/(\d+)/);
      if(window)send({status:`Recognizing pages ${window[3]} of ${window[4]} (batch ${window[1]} of ${window[2]})…`});
    });
    timer=setInterval(()=>send({elapsed:Math.round((Date.now()-started)/1000)}),15000);
    const timeout=setTimeout(()=>{lastError='PDF conversion exceeded the 60-minute limit.';stopChild(child);},60*60*1000);
    let code;
    try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}finally{clearTimeout(timeout);}
    if(disconnected)return true;
    if(code!==0)throw Error(lastError||'Automatic PDF recognition failed.');
    send({result:JSON.parse(await readFile(output,'utf8'))});
  }catch(error){if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/x-ndjson'});send({error:error.message||'PDF conversion failed.'});}
  finally{clearInterval(timer);res.off('close',abort);activeChild=null;if(directory)await rm(directory,{recursive:true,force:true});occupied=false;if(!res.destroyed)res.end();}
  return true;
}
