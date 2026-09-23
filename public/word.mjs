import {officeMathToTex} from './word-math.mjs';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',M='http://schemas.openxmlformats.org/officeDocument/2006/math';
let libraries;
function loadScript(path){return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=path;s.onload=resolve;s.onerror=()=>reject(Error('Could not load the Word converter. Refresh and try again.'));document.head.append(s);});}
async function getLibraries(){return libraries ||= Promise.all([loadScript('/vendor/mammoth.browser.min.js'),loadScript('/vendor/jszip.min.js')]).catch(e=>{libraries=null;throw e;});}
function cleanHtml(doc){
 const allowed=new Set('p h2 blockquote ul ol li table thead tbody tfoot tr th td strong em b i u s sup sub a br hr img'.split(' '));
 for(const node of [...doc.body.querySelectorAll('*')]){
  if(!allowed.has(node.localName)){if(['script','style','iframe','object','img','svg','math'].includes(node.localName))node.remove();else node.replaceWith(...node.childNodes);continue;}
  if(node.localName==='img'&&!/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(node.getAttribute('src')||'')){node.remove();continue;}
  for(const a of [...node.attributes]){
   const ok=(node.localName==='img'&&['src','alt'].includes(a.name))||(node.localName==='a'&&['href','id','name','title'].includes(a.name))||(['td','th'].includes(node.localName)&&['colspan','rowspan'].includes(a.name)&&/^\d{1,3}$/.test(a.value))||(node.localName==='ol'&&a.name==='start'&&/^\d{1,6}$/.test(a.value));
   if(!ok)node.removeAttribute(a.name);
  }
  if(node.hasAttribute('href')&&!/^(?:#|https?:\/\/|mailto:)/i.test(node.getAttribute('href').trim()))node.removeAttribute('href');
 }
}
function endnotes(doc){
 const notes=[];let number=0;
 for(const ref of [...doc.querySelectorAll('a[href^="#footnote-"],a[href^="#endnote-"]')]){
  const note=doc.getElementById(ref.getAttribute('href').slice(1));if(!note)continue;
  number++;const oldRef=ref.id;ref.href=`#_ftn${number}`;ref.id=`_ftnref${number}`;ref.setAttribute('name',ref.id);ref.title='';ref.textContent=`[${number}]`;
  note.querySelectorAll('a').forEach(a=>{if(a.getAttribute('href')==='#'+oldRef)a.remove();});
  let first=note.querySelector('p');if(!first){first=doc.createElement('p');note.prepend(first);}
  const back=doc.createElement('a');back.href=`#_ftnref${number}`;back.id=`_ftn${number}`;back.setAttribute('name',back.id);back.title='';back.textContent=String(number);first.prepend(back,doc.createTextNode('. '));
  notes.push(...note.childNodes);const list=note.parentElement;note.remove();if(!list.children.length)list.remove();
 }
 if(notes.length){const h=doc.createElement('h2');h.textContent='Notes';doc.body.append(h,...notes);}
 return number;
}
export async function convertWord(file){
 await getLibraries();let zip;try{zip=await window.JSZip.loadAsync(await file.arrayBuffer());}catch{throw Error('This file could not be read as a Word .docx document. Save it as .docx in Word and try again.');}
 if(!zip.file('word/document.xml'))throw Error('This is not a Word .docx document.');
 const entries=Object.values(zip.files);if(entries.length>5000||entries.reduce((n,f)=>n+(f._data?.uncompressedSize||0),0)>80*1024*1024)throw Error('This Word document is too large when unpacked. Split it into smaller files.');
 const prefix='WORDMATH'+crypto.randomUUID().replaceAll('-',''),formulas=[],warnings=[];
 for(const path of ['word/document.xml','word/footnotes.xml','word/endnotes.xml']){
  if(!zip.file(path))continue;const xml=await zip.file(path).async('string');if(/<!DOCTYPE/i.test(xml))throw Error('This Word document contains unsupported XML declarations.');
  const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('The Word document contains unreadable XML.');
  if(doc.getElementsByTagNameNS(W,'object').length)throw Error('This Word file contains legacy embedded objects. Convert legacy equations to native Word equations and save as .docx before importing.');
  const roots=[...doc.getElementsByTagNameNS(M,'oMathPara'),...doc.getElementsByTagNameNS(M,'oMath')].filter(n=>n.localName==='oMathPara'||n.parentElement?.namespaceURI!==M||n.parentElement.localName!=='oMathPara');
  for(const root of roots){
   const tex=officeMathToTex(root),display=root.localName==='oMathPara';const token=prefix+'N'+formulas.length+'END';formulas.push({token,tex,display});
   const run=doc.createElementNS(W,'w:r'),t=doc.createElementNS(W,'w:t');t.textContent=token;run.append(t);root.replaceWith(run);
  }
  zip.file(path,new XMLSerializer().serializeToString(doc));
 }
 const patched=await zip.generateAsync({type:'arraybuffer'});
 let imageError;
 const result=await window.mammoth.convertToHtml({arrayBuffer:patched},{includeEmbeddedStyleMap:false,externalFileAccess:false,styleMap:[...[1,2,3,4,5,6].map(n=>`p[style-name='Heading ${n}'] => h2:fresh`),"p[style-name='Title'] => h2:fresh","p[style-name='Quote'] => blockquote > p:fresh","p[style-name='Intense Quote'] => blockquote > p:fresh"],convertImage:window.mammoth.images.imgElement(async image=>{
  try {
  if(!/^image\/(png|jpeg|gif|webp)$/.test(image.contentType))throw Error('A Word image uses an unsupported format. Replace it with PNG, JPEG, GIF, or WebP in Word and try again.');
  const data=await image.readAsBase64String();
  if(!image.altText?.trim())warnings.push('Some Word images have no alt text. Add descriptions using Word’s Alt Text control.');
  return {src:`data:${image.contentType};base64,${data}`,alt:image.altText||''};
  } catch(error) { imageError=error;throw error; }
 })});
 if(imageError)throw imageError;
 warnings.push(...result.messages.map(m=>m.message));
 const doc=new DOMParser().parseFromString(result.value,'text/html');
 for(const heading of [...doc.querySelectorAll('h1,h3,h4,h5,h6')]){const h=doc.createElement('h2');h.append(...heading.childNodes);heading.replaceWith(h);}
 const notes=endnotes(doc);cleanHtml(doc);
 const walker=doc.createTreeWalker(doc.body,NodeFilter.SHOW_TEXT),nodes=[];let n;while(n=walker.nextNode())nodes.push(n);
 const placed=new Set();
 for(const node of nodes)for(const f of formulas)if(node.textContent.includes(f.token)){placed.add(f.token);node.textContent=node.textContent.replaceAll(f.token,f.display?`\\[${f.tex}\\]`:`\\(${f.tex}\\)`);}
 if(doc.body.textContent.includes(prefix))throw Error('A Word equation could not be placed correctly.');
 // Refuse incomplete conversion if the document reader dropped an equation token.
 for(const f of formulas)if(!placed.has(f.token))throw Error('A Word equation was omitted during conversion. No HTML was exported.');
 if(!doc.body.textContent.trim()&&!doc.querySelector('img'))throw Error('No readable text was found in this Word document.');
 return {html:doc.body.innerHTML,notes,equations:formulas.length,warnings:[...new Set(warnings)]};
}
