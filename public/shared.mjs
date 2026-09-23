import {renderMath} from './math-preview.mjs';
import {createDownloadZip} from './download-zip.mjs';
import {siteMathHtml} from './site-math.mjs';
const status=document.getElementById('shared-status'),button=document.getElementById('shared-download'),frame=document.getElementById('shared-preview');
let record,url;
try{
 const id=location.hash.slice(1);if(!/^[a-f0-9]{48}$/.test(id))throw Error('This shared link is invalid.');
 const response=await fetch('/api/shares/'+id);record=await response.json();if(!response.ok)throw Error(record.error||'This shared link is unavailable.');
 record.html=siteMathHtml(record.html,{escapedOnly:true});document.getElementById('shared-name').textContent=record.name;document.title=record.name+' — Shared conversion';
 status.textContent='Shared copy · Link expires '+new Date(record.expiresAt).toLocaleDateString();
 frame.onload=()=>renderMath(frame.contentDocument).catch(()=>{status.textContent+=' · Some equations could not be displayed.';});
 // No scripts execute in the document sandbox. Block external requests and forms.
 url=URL.createObjectURL(new Blob(['<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data:; style-src \'unsafe-inline\'; font-src data:; base-uri \'none\'; form-action \'none\'"><style>img{max-width:100%;height:auto}</style>',record.html],{type:'text/html'}));
 frame.src=url;frame.hidden=false;button.disabled=false;
}catch(error){status.textContent=error.message;status.classList.add('error');}
button.onclick=async()=>{button.disabled=true;try{const output=await createDownloadZip(record.html,record.name,{draft:/needs transcription/.test(record.html)});const link=document.createElement('a'),download=URL.createObjectURL(output.blob);link.href=download;link.download=output.name;link.click();setTimeout(()=>URL.revokeObjectURL(download),10000);}catch(error){status.textContent=error.message;}finally{button.disabled=false;}};
window.addEventListener('pagehide',()=>{if(url)URL.revokeObjectURL(url);});
