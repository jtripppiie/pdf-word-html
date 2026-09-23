import { normalizedWords } from './compare.mjs';
const normalize=text=>normalizedWords(text).join(' ');
export class ScrollSync {
 constructor({iframe,viewer,enabled,isPreview,onPage}){Object.assign(this,{iframe,viewer,enabled,isPreview,onPage});this.anchors=[];this.lockUntil=0;this.generation=0;}
 ready(){return this.enabled.checked&&this.isPreview()&&this.anchors.length&&this.viewer.pdf;}
 connect(record){
  const generation=++this.generation;this.anchors=[];
  let doc,win;try{doc=this.iframe.contentDocument;win=this.iframe.contentWindow;if(!doc?.body)return;}catch{return;}
  const elements=[...doc.querySelectorAll('p,h2,li')].map(element=>{const copy=element.cloneNode(true);copy.querySelectorAll('[role="doc-noteref"],ul,ol').forEach(node=>node.remove());return {element,text:normalize(copy.textContent)};});
  let map=record?.reviewMap;
  if(!map?.length){
   // Older saved conversions have page text, but no coordinate map.
   const pages=(record?.sourcePages||[]).map(page=>({...page,normalized:normalize(page.text)}));map=[];
   for(const entry of elements){const sample=entry.text.split(' ').slice(0,8).join(' ');if(sample.length<15)continue;for(const page of pages){const offset=page.normalized.indexOf(sample);if(offset>=0){map.push({text:entry.text,page:page.number,y:.1+.8*offset/Math.max(1,page.normalized.length)});break;}}}
  }
  for(const item of map){
   let match,offset=0;
   if(item.id){const element=doc.getElementById(item.id)?.closest('p');if(element)match={element,text:normalize(element.textContent)};}
   else {const sample=normalize(item.text).split(' ').slice(0,8).join(' ');if(!sample)continue;match=elements.find(entry=>{const at=entry.text.indexOf(sample);if(at<0)return false;offset=at;return true;});}
   if(match&&Number.isFinite(item.y))this.anchors.push({element:match.element,fraction:offset/Math.max(1,match.text.length),page:item.page,y:item.y});
  }
  win.addEventListener('scroll',()=>{
   if(generation!==this.generation||!this.ready()||performance.now()<this.lockUntil)return;
   if(this.frame)return;this.frame=requestAnimationFrame(()=>{this.frame=null;if(generation===this.generation)this.fromHtml();});
  });
  this.fromPdf(this.viewer.position());
 }
 coordinates(){const win=this.iframe.contentWindow;return this.anchors.map(anchor=>({...anchor,top:anchor.element.getBoundingClientRect().top+win.scrollY+anchor.element.getBoundingClientRect().height*anchor.fraction})).sort((a,b)=>a.top-b.top);}
 fromPdf(position){
  if(!position||!this.ready()||performance.now()<this.lockUntil)return;
  const anchors=this.coordinates().filter(a=>a.page===position.number).sort((a,b)=>a.y-b.y);if(!anchors.length)return;
  let before=anchors[0],after=anchors.at(-1);for(const anchor of anchors){if(anchor.y<=position.ratio)before=anchor;if(anchor.y>=position.ratio){after=anchor;break;}}
  const fraction=after.y>before.y?Math.max(0,Math.min(1,(position.ratio-before.y)/(after.y-before.y))):0;
  this.lockUntil=performance.now()+120;
  this.iframe.contentWindow.scrollTo({top:Math.max(0,before.top+(after.top-before.top)*fraction-40),behavior:'instant'});
 }
 async fromHtml(){
  if(!this.ready()||performance.now()<this.lockUntil)return;
  const anchors=this.coordinates(),top=this.iframe.contentWindow.scrollY+40;if(!anchors.length)return;
  let before=anchors[0],after=anchors.at(-1);for(const anchor of anchors){if(anchor.top<=top)before=anchor;if(anchor.top>=top){after=anchor;break;}}
  let ratio=before.y;
  if(before.page===after.page&&after.top>before.top)ratio+=(after.y-before.y)*Math.max(0,Math.min(1,(top-before.top)/(after.top-before.top)));
  this.lockUntil=Infinity;const generation=this.generation;
  try{await this.viewer.show(before.page,ratio);if(generation===this.generation)this.onPage(before.page);}finally{this.lockUntil=performance.now()+120;}
 }
}
