let corrections;
async function sha256(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');}
export async function applyReviewedEquations(record){
 if(!record.mathReview?.some(item=>!item.tex))return 0;
 try{corrections ||= await fetch('/reviewed-equations.json').then(response=>{if(!response.ok)throw Error();return response.json();});}catch{return 0;}
 const digest=await sha256(await record.pdf.arrayBuffer()),matches=corrections.filter(item=>item.pdfSha256===digest);if(!matches.length)return 0;
 const doc=new DOMParser().parseFromString(record.html,'text/html');let applied=0;
 // Some reviewed passages need reading-order repair as well as TeX. Match the
 // exact unedited paragraphs, scoped to the full PDF hash, before replacing them.
 for(const correction of matches.filter(c=>c.passage)){
  const {ids,htmlSha256,html}=correction.passage;
  const entries=ids.map(id=>record.mathReview.find(item=>item.id===id));
  const targets=ids.map(id=>doc.getElementById(id));
  if(entries.some(item=>!item||item.tex)||targets.some(node=>!node?.classList.contains('math-needs-review')))continue;
  const paragraphs=[...new Set(targets.map(node=>node.closest('p')))];
  if(paragraphs.some(node=>!node)||paragraphs.some((node,i)=>i&&paragraphs[i-1].nextElementSibling!==node))continue;
  if(await sha256(new TextEncoder().encode(paragraphs.map(node=>node.outerHTML).join('')))!==htmlSha256)continue;
  const replacement=new DOMParser().parseFromString(html,'text/html');
  paragraphs[0].before(...replacement.body.childNodes);paragraphs.forEach(node=>node.remove());
  for(const item of entries){item.tex='Reviewed passage correction';item.reviewed=true;item.provenance=correction.provenance;applied++;}
 }
 for(const item of record.mathReview){
  const target=doc.getElementById(item.id);if(item.tex||!target?.classList.contains('math-needs-review'))continue;
  const sourceDigest=await sha256(new TextEncoder().encode(item.sourceText));
  const correction=matches.find(c=>c.page===item.page&&c.display===item.display&&c.sourceSha256===sourceDigest);if(!correction)continue;
  const space=target.textContent.match(/^\s*/)[0];
  target.replaceWith(doc.createTextNode(space+(item.display?`\\[${correction.tex}\\]`:`\\(${correction.tex}\\)`)));item.tex=correction.tex;item.reviewed=true;item.provenance=correction.provenance;applied++;
 }
 if(applied)record.html=doc.body.innerHTML;
 return applied;
}
export function unresolvedMath(html){
 const doc=new DOMParser().parseFromString(html,'text/html');
 return [...doc.querySelectorAll('.math-needs-review')].filter(element=>/needs transcription/.test(element.textContent)).map(element=>({id:element.id,text:element.textContent}));
}
export function replaceMath(html,id,tex,display){
 const doc=new DOMParser().parseFromString(html,'text/html'),target=doc.getElementById(id);
 if(!target?.classList.contains('math-needs-review'))throw Error('This equation has already changed. Reopen the review list.');
 const space=target.textContent.match(/^\s*/)[0];target.replaceWith(doc.createTextNode(space+(display?`\\[${tex}\\]`:`\\(${tex}\\)`)));return doc.body.innerHTML;
}
