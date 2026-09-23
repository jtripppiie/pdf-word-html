import { recognizeLocal } from './local-ocr.mjs';
import { hasMathGlyph, isMathOnly, hasRelation } from './math-layout.mjs';
// Preserve math visually; never guess TeX from unreliable PDF glyph maps.
export function isDisplayEquation(paragraph){
 return (paragraph.equation || (hasMathGlyph(paragraph.text)&&hasRelation(paragraph.text)&&isMathOnly(paragraph.text)))&&Number.isFinite(paragraph.startY)&&Number.isFinite(paragraph.endY);
}
// Ignore a separate right-hand equation number when finding the formula's center.
export function equationAlignment(fragments,bodyBounds,bodySize){
 const [bodyLeft,bodyRight]=bodyBounds;
 const core=fragments.filter(f=>!(f.x>bodyRight-bodySize*5 && /^\s*\(\d+(?:\.\d+)*\)\s*$/.test(f.text)));
 if(!core.length)return {centered:false};
 const left=Math.min(...core.map(f=>f.x)),right=Math.max(...core.map(f=>f.x+f.width));
 const center=(left+right)/2,tolerance=bodySize*.85;
 return {center,centered:left>bodyLeft+tolerance && Math.abs(center-(bodyLeft+bodyRight)/2)<=tolerance};
}
// Until a recognizer is verified, mark missing TeX explicitly instead of exporting images
// or presenting the PDF's damaged character mappings as valid mathematics.
export function markPageEquations(extracted,pageNumber){
 const review=[];
 const prose=extracted.paragraphs.filter(p=>!isDisplayEquation(p)&&p.text.length>100).flatMap(p=>p.fragments).filter(f=>Number.isFinite(f.x));
 const bodyBounds=prose.length?[Math.min(...prose.map(f=>f.x)),Math.max(...prose.map(f=>f.x+f.width))]:[extracted.leftMargin,612-extracted.leftMargin];
 function entry(text,display,fragments){const bounds=fragments.filter(f=>Number.isFinite(f.x));const id=`math-p${pageNumber}-${review.length+1}`;review.push({id,page:pageNumber,display,sourceText:text,bounds:{left:Math.min(...bounds.map(f=>f.x))-3,right:Math.max(...bounds.map(f=>f.x+f.width))+3,top:Math.min(...bounds.map(f=>f.y-f.size*(display?1.15:.9)))-(display?2:0),bottom:Math.max(...bounds.map(f=>f.y+f.size*(display?.35:.2)))+(display?2:0)}});return {text:`[${display?'Equation':'Math'} needs transcription — PDF page ${pageNumber}, item ${review.length}]`,superscript:false,mathReview:id};}
 for(const paragraph of extracted.paragraphs){
  if(isDisplayEquation(paragraph)){
   paragraph.equationCentered=equationAlignment(paragraph.fragments.filter(f=>Number.isFinite(f.x)),bodyBounds,extracted.bodySize).centered;
   const label=paragraph.fragments.find(f=>f.x>bodyBounds[1]-extracted.bodySize*5&&/^\s*\(\d+(?:\.\d+)*\)\s*$/.test(f.text));
   paragraph.fragments=[entry(paragraph.text,true,paragraph.fragments)];if(label)review.at(-1).number=label.text.trim().slice(1,-1);paragraph.blockquote=false;paragraph.heading=false;paragraph.list=null;paragraph.equation=true;continue;
  }
  const original=paragraph.fragments,fragments=[];
  for(let i=0;i<original.length;){
   const first=original[i];
   if(!Number.isFinite(first.x)||!isMathOnly(first.text)||/^\d+$/.test(first.text.trim())&&first.superscript){fragments.push(first);i++;continue;}
   let end=i+1;
   while(end<original.length){const previous=original[end-1],next=original[end];
    if(!Number.isFinite(next.x)||!isMathOnly(next.text)||(/^\d+$/.test(next.text.trim())&&next.superscript)||Math.abs(next.y-first.y)>first.size*.8||next.x-previous.x-previous.width>first.size*.65||next.x<previous.x-first.size)break;
    end++;
   }
   const run=original.slice(i,end);
   if(run.some(fragment=>hasMathGlyph(fragment.text))){const marked=entry(run.map(f=>f.text).join(''),false,run);marked.text=(first.text.match(/^\s*/)[0]||'')+marked.text;fragments.push(marked);}else fragments.push(...run);
   i=end;
  }
  paragraph.fragments=fragments;
 }
 return review;
}

export function removeLegacyEquationImages(html){
 const doc=new DOMParser().parseFromString(html,'text/html');let removed=0;const review=[];
 for(const img of doc.querySelectorAll('img')){
  if(!img.getAttribute('src')?.startsWith('data:image/')||!/^(?:Equation(?: \d+(?:\.\d+)*)?|Inline mathematical expression) from PDF page \d+/.test(img.alt))continue;
  const page=Number(img.alt.match(/PDF page (\d+)/)[1]),display=img.alt.startsWith('Equation');
  const span=doc.createElement('span');let id;do{id=`math-legacy-${++removed}`;}while(doc.getElementById(id));span.id=id;span.className='math-needs-review';span.textContent=`[${display?'Equation':'Math'} needs transcription — PDF page ${page}]`;img.replaceWith(span);review.push({id,page,display,sourceText:'Previously saved as an image. Consult the original PDF.'});
 }
 return {html:removed?doc.body.innerHTML:html,review};
}


export async function recognizePageMath(page,extracted,pageNumber,{enabled=true,onProgress=()=>{},cancelled=()=>false}={}){
 const review=markPageEquations(extracted,pageNumber);let recognized=0,failed=0,canvas;
 if(enabled&&review.length){
  const scale=3,viewport=page.getViewport({scale});
  try{
   canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
   await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
   for(const [index,item] of review.entries()){
    if(cancelled())break;
    if(!item.display)continue; // Inline recognition is not accurate enough to offer yet.
    onProgress(`Reading equation ${index+1} of ${review.length} on page ${pageNumber} locally…`);
    try{
     const b=item.bounds,left=Math.max(0,Math.floor(b.left*scale)),top=Math.max(0,Math.floor(b.top*scale)),right=Math.min(canvas.width,Math.ceil(b.right*scale)),bottom=Math.min(canvas.height,Math.ceil(b.bottom*scale));
     let image;
     if(item.display){const region=document.createElement('canvas');region.width=right-left;region.height=bottom-top;await page.render({canvasContext:region.getContext('2d'),viewport,transform:[1,0,0,1,-b.left*scale,-b.top*scale]}).promise;image=region.getContext('2d').getImageData(0,0,region.width,region.height);}else image=canvas.getContext('2d').getImageData(left,top,right-left,bottom-top);
     let tex=await recognizeLocal(image,onProgress);
     if(cancelled())break;
     if(/\\(?:mathcal|mathbb|mathfrak|cal)\b/.test(tex)||(/̇/.test(item.sourceText)&&!/\\dot\b/.test(tex)))throw Error('Ambiguous symbol recognition; manual transcription required.');
     if(item.number){const digits=[...item.number].map(c=>c==='.'?'\\.':c).join('\\s*');tex=tex.replace(new RegExp('(?:\\\\qquad\\s*)*\\(\\s*'+digits+'\\s*\\)\\s*$'),'').trim();tex+=` \\tag{${item.number}}`;}
     item.tex=tex;recognized++;
     for(const paragraph of extracted.paragraphs)for(const fragment of paragraph.fragments)if(fragment.mathReview===item.id){
      const space=fragment.text.match(/^\s*/)[0];fragment.text=space+(item.display?`\\[${tex}\\]`:`\\(${tex}\\)`);delete fragment.mathReview;
     }
    }catch(error){item.error=error.message;failed++;if(/browser|timed out|load|fetch/i.test(error.message))break;}
   }
  }catch(error){for(const item of review)if(!item.tex)item.error=error.message;failed=review.length-recognized;}
  finally{if(canvas){canvas.width=0;canvas.height=0;}}
 }
 return {review,recognized,failed};
}
