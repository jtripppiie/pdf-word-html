let zipReady;
async function getZip(){
 if(window.JSZip)return window.JSZip;
 return zipReady ||= new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/jszip.min.js';script.onload=()=>resolve(window.JSZip);script.onerror=()=>{zipReady=null;reject(Error('Could not load ZIP download support. Please try again.'));};document.head.append(script);});
}
export async function createDownloadZip(html,filename,{draft=false}={}){
 const Zip=await getZip(),zip=new Zip(),doc=new DOMParser().parseFromString(html,'text/html');
 const stem=(filename||'document').replace(/\.(pdf|docx)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-')||'document';
 const files=new Map();let index=0;
 for(const img of doc.querySelectorAll('img')){
  const src=img.getAttribute('src')||'';if(!src.startsWith('data:image/'))continue;
  const match=src.match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/);
  if(!match)throw Error('An embedded image cannot be packaged. Use PNG, JPEG, WebP, or GIF.');
  let path=files.get(src);
  if(!path){const kind=/^Table\b/.test(img.alt)?'table':/^Chart\b/.test(img.alt)?'chart':'figure';path=`images/${kind}-${String(++index).padStart(3,'0')}.${match[1]==='jpeg'?'jpg':match[1]}`;zip.file(path,match[2].replace(/\s/g,''),{base64:true});files.set(src,path);}
  img.setAttribute('src',path);
 }
 const name=stem+(draft?'.draft':'');zip.file(name+'.html','\uFEFF'+doc.body.innerHTML);
 return {blob:await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}}),name:name+'.zip',images:files.size};
}
