import {normalizedWords,htmlText} from './compare.mjs';

// Advisory only: native PDF extraction is not a ground-truth transcription.
// Index word sequences once, keeping work proportional to document length.
const WIDTH=12;
function indexWords(words) {
  const index=new Map();
  for(let i=0;i+WIDTH<=words.length;i++){
    const key=words.slice(i,i+WIDTH).join(' ');
    index.set(key,(index.get(key)||0)+1);
  }
  return index;
}
export function reviewReport(sourcePages,html) {
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('script,style,template').forEach(node=>node.remove());
  const outputWords=normalizedWords(htmlText(html)),outputIndex=indexWords(outputWords);
  const issues=[],pages=[],sourceIndex=new Map();
  for(const page of sourcePages){
    const words=normalizedWords(page.text||''),index=indexWords(words);
    for(const [key,count] of index)sourceIndex.set(key,(sourceIndex.get(key)||0)+count);
    let checked=0,matched=0,missingRun=[];
    const flush=()=>{
      // Two consecutive unmatched samples reduce noise from an isolated note marker.
      if(missingRun.length>=2)issues.push({kind:'passage',page:page.number,message:'Passage differs from extracted PDF text',excerpt:missingRun.slice(0,2).join(' ')});
      missingRun=[];
    };
    for(let i=0;i+WIDTH<=words.length;i+=WIDTH){
      const key=words.slice(i,i+WIDTH).join(' ');checked++;
      if(outputIndex.has(key)){matched++;flush();}else missingRun.push(key);
    }
    flush();pages.push({page:page.number,words:words.length,checked,matched});
  }
  // Repeated long paragraphs are flagged only when their opening phrase also
  // occurs more often in output than in the complete extracted source.
  const blocks=new Map();
  for(const node of doc.querySelectorAll('p,li')){
    if(node.querySelector('p,li'))continue;
    const words=normalizedWords(node.textContent||'');
    if(words.length<24)continue;
    const key=words.join(' '),entry=blocks.get(key)||{count:0,words};
    entry.count++;blocks.set(key,entry);
  }
  for(const {count,words} of blocks.values()){
    const expected=sourceIndex.get(words.slice(0,WIDTH).join(' '))||0;
    if(count>1&&expected>0&&count>expected)issues.push({kind:'duplicate',message:`Possible repeated paragraph (${count} copies)`,excerpt:words.slice(0,24).join(' ')});
  }
  const targets=new Map(),ids=new Set();
  for(const node of doc.querySelectorAll('[id],a[name]')){
    const id=node.id;
    if(id){if(ids.has(id))issues.push({kind:'link',message:`Duplicate link target: ${id}`});ids.add(id);}
    for(const key of new Set([id,node.getAttribute('name')].filter(Boolean)))targets.set(key,node);
  }
  const referenced=new Set();
  for(const node of doc.querySelectorAll('a[href^="#"]')){
    const href=node.getAttribute('href');if(href==='#')continue;
    let key=href.slice(1);try{key=decodeURIComponent(key);}catch{}
    referenced.add(key);
    if(!targets.has(key))issues.push({kind:'link',message:`Link has no destination: ${href}`});
  }
  for(const [key] of targets)if(/^_ftn\d+$/.test(key)&&!referenced.has(key))issues.push({kind:'note',message:`Note has no incoming reference: ${key}`});
  return {issues,pages,images:doc.querySelectorAll('img').length};
}
