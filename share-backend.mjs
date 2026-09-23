import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
const bucket=process.env.PDF_SHARE_BUCKET,local=process.env.PDF_SHARE_DIR;
export const sharingEnabled=!!(bucket||local);
const lifetime=7*24*60*60*1000,limit=24*1024*1024;
let credential;
async function token(){
 if(credential?.until>Date.now())return credential.value;
 const res=await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error('Storage authentication failed');const data=await res.json();credential={value:data.access_token,until:Date.now()+(data.expires_in-60)*1000};return credential.value;
}
async function storage(method,id,record){
 if(local){await mkdir(local,{recursive:true});const path=join(local,id+'.json');if(method==='POST'||method==='PUT')return writeFile(path,JSON.stringify(record),{flag:method==='POST'?'wx':'w',mode:0o600});if(method==='DELETE')return unlink(path);return JSON.parse(await readFile(path,'utf8'));}
 const object=encodeURIComponent('shares/'+id+'.json');
 const url=['POST','PUT'].includes(method)?`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media${method==='POST'?'&ifGenerationMatch=0':''}&name=${object}`:`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${object}${method==='GET'?'?alt=media':''}`;
 const res=await fetch(url,{method:method==='PUT'?'POST':method,headers:{Authorization:`Bearer ${await token()}`,...(record?{'Content-Type':'application/json'}:{})},body:record?JSON.stringify(record):undefined,signal:AbortSignal.timeout(60000)});
 if(res.status===404)throw Object.assign(Error('Not found'),{code:'ENOENT'});
 if(!res.ok)throw Error('Share storage request failed');if(method==='GET')return res.json();
}
const hash=value=>createHash('sha256').update(value).digest('hex');
function respond(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow'});res.end(JSON.stringify(data));}
export async function shareBackend(req,res){
 const path=new URL(req.url,'http://localhost').pathname;
 if(path!=='/api/shares'&&!path.startsWith('/api/shares/'))return false;
 if(!sharingEnabled){respond(res,503,{error:'Sharing is available on the Google portal.'});return true;}
 try{
  if(path==='/api/shares'){
   if(req.method!=='POST'){respond(res,405,{error:'Use POST.'});return true;}
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){respond(res,415,{error:'Expected JSON.'});return true;}
   if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host){respond(res,403,{error:'Share from this portal.'});return true;}
   let size=0;const chunks=[];
   for await(const chunk of req){size+=chunk.length;if(size>limit){respond(res,413,{error:'This result is too large to share. Download its ZIP instead (24 MB sharing limit).'});return true;}chunks.push(chunk);}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{respond(res,400,{error:'Invalid share data.'});return true;}
   if(typeof data.html!=='string'||!data.html.trim()||typeof data.name!=='string'||data.name.length>250){respond(res,400,{error:'A converted document and filename are required.'});return true;}
   const id=randomBytes(24).toString('hex'),deleteToken=randomBytes(32).toString('hex'),createdAt=Date.now(),expiresAt=createdAt+lifetime;
   await storage('POST',id,{name:data.name,html:data.html,createdAt,expiresAt,deleteHash:hash(deleteToken)});
   respond(res,201,{id,path:'/shared.html#'+id,deleteToken,expiresAt});return true;
  }
  const id=path.slice('/api/shares/'.length);if(!/^[a-f0-9]{48}$/.test(id)){respond(res,404,{error:'This shared link is unavailable or has expired.'});return true;}
  if(!['GET','DELETE','PUT'].includes(req.method)){respond(res,405,{error:'Method not allowed.'});return true;}
  const record=await storage('GET',id);
  if(req.method==='DELETE'||req.method==='PUT'){
   const provided=(req.headers.authorization||'').replace(/^Bearer /,'');
   if(!/^[a-f0-9]{64}$/.test(provided)||!timingSafeEqual(Buffer.from(hash(provided)),Buffer.from(record.deleteHash))){respond(res,403,{error:'Only the browser that created this share can stop sharing it.'});return true;}
   if(req.method==='DELETE'){await storage('DELETE',id);respond(res,200,{deleted:true});return true;}
   if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']||'')){respond(res,415,{error:'Expected JSON.'});return true;}
   let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit){respond(res,413,{error:'This result is too large to share (24 MB limit).'});return true;}chunks.push(chunk);}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{respond(res,400,{error:'Invalid share data.'});return true;}
   if(typeof data.html!=='string'||!data.html.trim()||typeof data.name!=='string'||data.name.length>250){respond(res,400,{error:'A converted document and filename are required.'});return true;}
   const expiresAt=Date.now()+lifetime;await storage('PUT',id,{...record,html:data.html,name:data.name,expiresAt});respond(res,200,{id,path:'/shared.html#'+id,expiresAt});return true;
  }
  if(record.expiresAt<=Date.now()){respond(res,410,{error:'This shared link has expired.'});return true;}
  const {name,html,createdAt,expiresAt}=record;respond(res,200,{name,html,createdAt,expiresAt});
 }catch(error){respond(res,error.code==='ENOENT'?404:503,{error:error.code==='ENOENT'?'This shared link is unavailable or has expired.':'Sharing is temporarily unavailable. Please try again.'});}
 return true;
}
