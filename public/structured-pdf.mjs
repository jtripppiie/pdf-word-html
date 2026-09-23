import {recoverLists,listMarker,stripListMarker} from './pdf-lists.mjs';
// Render semantic parser output. Math stays editable TeX; image fallbacks are forbidden.
export function structuredPdfHtml(documentData) {
  if (documentData.schema !== 'docvortex.middle' || !Array.isArray(documentData.pages)) throw Error('Unsupported PDF parser output.');
  const doc = document.implementation.createHTMLDocument('');
  const notes = [], reviewMap = [], warnings = new Set();
  // Use captions belonging to the same detected visual, never unrelated page text.
  const imageDescriptions = new WeakMap();
  const textOf = item => typeof item.content === 'string' ? item.content : (item.content || []).map(textOf).join('');
  function describe(block) {
    if (['image','chart','table'].includes(block.type) && Array.isArray(block.content)) {
      const captions = block.content.filter(child => child.type === `${block.type}_caption`);
      const description = captions.map(textOf).join(' ').replace(/\s+/g, ' ').trim();
      if (description) for (const child of block.content) if (child.type === `${block.type}_body`) imageDescriptions.set(child, description);
    }
    if (Array.isArray(block.content)) block.content.forEach(describe);
  }
  let equations = 0;
  const anchorMap = new Map(), pageNotes = new Map();
  for (const page of documentData.pages) for (const block of page.blocks) {
    if (block.type === 'page_footnote') {
      const number = notes.length + 1;
      const content=structuredClone(block.content), first=content[0];
      const label=first?.type==='text'&&first.content.match(/^\s*(\d{1,3}|[*†‡])(?:[.)]?\s+|$)/);
      const previous=notes.at(-1);
      if(!label&&previous&&previous.page===page.page_idx&&first?.type==='text'&&/^[a-z]/.test(first.content)&&Math.abs((previous.block.bbox?.[0]||0)-(block.bbox?.[0]||0))<.01){
        previous.block.content.push({type:'text',content:' '},...content);continue;
      }
      if(label){first.content=first.content.slice(label[0].length);pageNotes.set(`${page.page_idx+1}:${label[1]}`,number);}
      notes.push({block:{...block,content}, number, page: page.page_idx + 1});
      if (block.anchor) anchorMap.set(block.anchor, number);
    }
  }
  // Native PDF coordinates recover raised note numbers that visual recognition
  // flattened into prose or absorbed into an inline formula. Never infer a link
  // from an ordinary number without a matching source reference and page note.
  documentData=structuredClone(documentData);
  for (const page of documentData.pages) page.blocks.forEach(describe);
  for(const page of documentData.pages)for(const ref of page.nativeNoteReferences||[]){
    if(!pageNotes.has(`${page.page_idx+1}:${ref.marker}`))continue;
    const candidates=[],contexts=[];let alreadyLinked=false;
    function visit(block){
      if(['page_footnote','equation','header','footer','page_number'].includes(block.type))return;
      if(!Array.isArray(block.content))return;
      if(['image','table','chart','list','index'].includes(block.type)){block.content.forEach(visit);return;}
      const b=block.bbox;if(!b||ref.x<b[0]-.005||ref.x>b[2]+.005||ref.y<b[1]-.005||ref.y>b[3]+.005)return;
      if(block.content.some(s=>s.type==='text'&&s.styles?.includes('superscript')&&s.content.trim()===ref.marker)){alreadyLinked=true;return;}
      contexts.push(block);
      for(const [index,span] of block.content.entries()){
        const pattern=span.type==='text'?new RegExp(`(^|[^0-9])(${ref.marker})(?=[^0-9]|$)`,'g'):span.type==='equation_inline'?new RegExp(String.raw`\^\s*\{\s*`+[...ref.marker].join(String.raw`\s*`)+String.raw`\s*\}`,'g'):null;
        if(!pattern)continue;
        for(const match of span.content.matchAll(pattern))candidates.push({block,index,span,start:match.index+(span.type==='text'?match[1].length:0),end:match.index+match[0].length});
      }
    }
    page.blocks.forEach(visit);
    if(alreadyLinked)continue;
    if(ref.before){
      const normalized=text=>text.normalize('NFKC').toLowerCase().replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s/g,'');
      const before=normalized(ref.before);
      for(const length of [80,60,40,24,16,10]){
        if(before.length<length)continue;
        const suffix=before.slice(-length),matches=[];
        for(const block of contexts)for(const [index,span] of block.content.entries()){
          if(span.type!=='text')continue;
          let text='',offsets=[];
          for(let at=0;at<span.content.length;at++){const chars=normalized(span.content[at]);text+=chars;for(const ignored of chars)offsets.push(at+1);}
          let at=text.indexOf(suffix);
          while(at>=0){const start=offsets[at+suffix.length-1],flat=span.content.slice(start).match(new RegExp('^\\s*'+ref.marker+'(?=[^0-9]|$)'));matches.push({block,index,span,start,end:start+(flat?.[0].length||0)});at=text.indexOf(suffix,at+1);}
        }
        if(matches.length===1){candidates.splice(0,candidates.length,matches[0]);break;}
        if(matches.length>1)break;
      }
    }
    if(candidates.length===1){const {block,index,span,start,end}=candidates[0];block.content.splice(index,1,...(start?[{...span,content:span.content.slice(0,start)}]:[]),{type:'text',content:ref.marker,styles:['superscript']},...(end<span.content.length?[{...span,content:span.content.slice(end)}]:[]));}
  }
  const refs = new Map();
  function reference(number){
    const count=(refs.get(number)||0)+1;refs.set(number,count);
    const a=doc.createElement('a');a.href=`#_ftn${number}`;a.id=`_ftnref${number}${count>1?`-${count}`:''}`;
    a.name=a.id;a.title='';a.textContent=`[${number}]`;return a;
  }
  function math(tex, display) {
    if (typeof tex !== 'string' || !tex.trim()) throw Error('The PDF parser returned an empty equation.');
    // The recognizer can emit the star modifier and following power as two
    // adjacent superscripts. Keep their printed order in one TeX script.
    tex=tex.replace(/\^\s*\{\s*\*\s*\}\s*\^\s*\{([^{}]*)\}/g,'^{* $1}');
    equations++;
    return doc.createTextNode(display ? `\\[${tex}\\]` : `\\(${tex}\\)`);
  }
  function inline(spans, target, page, linkNotes=true) {
    for (const span of spans || []) {
      if (span.type === 'equation_inline') target.append(math(span.content, false));
      else if (span.type === 'hyperlink') {
        const number = anchorMap.get(span.url?.replace(/^#/, ''));
        const a = doc.createElement('a');
        if (number) {
          target.append(reference(number));continue;
        } else {
          if (/^(https?:\/\/|mailto:|#)/i.test(span.url || '')) a.setAttribute('href', span.url);
          inline(span.content, a, page, linkNotes);
        }
        target.append(a);
      } else if (span.type === 'text' || span.type === 'code_inline') {
        const number=linkNotes&&span.styles?.includes('superscript')&&pageNotes.get(`${page}:${span.content.trim()}`);
        if(number){target.append(reference(number));continue;}
        let node = doc.createTextNode(span.content);
        const tags = {bold:'strong', italic:'em', superscript:'sup', subscript:'sub'};
        for (const style of span.styles || []) if (tags[style]) { const el = doc.createElement(tags[style]); el.append(node); node = el; }
        target.append(node);
      } else throw Error(`Unsupported PDF inline content: ${span.type}`);
    }
  }
  function render(block, page, parent = doc.body) {
    const type = block.type;
    if (['header', 'footer', 'page_number', 'page_footnote'].includes(type)) return;
    let el;
    if (['table_body','chart_body','image_body'].includes(type)&&block.snapshot) {
      const {src,width,height}=block.snapshot;
      if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src||''))throw Error('Invalid PDF image snapshot.');
      el=doc.createElement('p');const img=doc.createElement('img');img.src=src;
      img.alt=imageDescriptions.get(block)||`${type==='table_body'?'Table':type==='chart_body'?'Chart':'Figure'} from PDF page ${page}`;
      if(Number.isFinite(width)&&width>0)img.width=Math.round(width);if(Number.isFinite(height)&&height>0)img.height=Math.round(height);
      el.append(img);
    } else if(documentData.visualsAsImages&&['table_body','chart_body','image_body'].includes(type))throw Error('A chart or table could not be captured from the original PDF.');
    else if (type === 'equation') { el = doc.createElement('p'); el.append(math(block.content, true)); }
    else if (['text','ref_text','doc_title','paragraph_title','aside_text','image_caption','image_footnote','table_caption','table_footnote','chart_caption','chart_footnote'].includes(type)) {
      el = doc.createElement(['doc_title','paragraph_title'].includes(type) ? 'h2' : 'p'); inline(block.content, el, page);
      if (el.textContent.trim() === 'WORKING PAPER') return;
      const margins=pageMargins.get(page);
      const quote=type==='text'&&block.bbox&&margins&&block.bbox[0]>margins.left+.018&&block.bbox[2]<margins.right-.018&&block.bbox[3]-block.bbox[1]>.035;
      if(quote){const wrapper=doc.createElement('blockquote');wrapper.append(el);el=wrapper;}
      if (block.continues_prev && parent.lastElementChild?.localName === el.localName && el.localName === 'p') {
        const previous = parent.lastElementChild;
        previous.append(doc.createTextNode(' '), ...el.childNodes); el = previous;
      }
    } else if (type === 'list' || type === 'index') {
      const markers=block.content.map(child=>listMarker(child,{knownList:true}));
      const ordered=block.list_kind?block.list_kind==='ol':markers.length>0&&markers.every((m,i)=>m?.kind==='ol'&&(i===0||m.value===markers[i-1].value+1));
      el = doc.createElement(ordered?'ol':'ul');
      const start=block.start??markers[0]?.value;if(ordered&&start!==undefined&&start!==1)el.setAttribute('start',start);
      for (const [index,original] of block.content.entries()) {
        const child=block.list_kind?original:stripListMarker(original,markers[index]);
        const li = doc.createElement('li'); render(child, page, li);
        for(const nested of child.nested_lists||[])render(nested,page,li);
        el.append(li);
      }
    } else if (['table', 'image', 'chart'].includes(type)) {
      for (const child of block.content) render(child, page, parent);
      return;
    } else if (type === 'table_body') {
      // Accept table structure only, never executable parser HTML or visual equation fallbacks.
      const parsed = new DOMParser().parseFromString(block.content || '', 'text/html');
      const table = parsed.querySelector('table');
      if (!table) throw Error('A PDF table could not be reconstructed.');
      const allowed = new Set(['table','thead','tbody','tfoot','tr','td','th','p','br','sup','sub','strong','em']);
      for (const node of [table, ...table.querySelectorAll('*')]) {
        if (!allowed.has(node.localName)) { if (['script','style','img','svg','iframe','object'].includes(node.localName)) node.remove(); else node.replaceWith(...node.childNodes); continue; }
        for (const attr of [...node.attributes]) if (!(['td','th'].includes(node.localName) && ['colspan','rowspan'].includes(attr.name) && /^[1-9]\d{0,2}$/.test(attr.value))) node.removeAttribute(attr.name);
      }
      el = doc.importNode(table, true);
    } else if (['image_body','chart_body'].includes(type)) {
      warnings.add('Figures are omitted from this HTML export. Their captions are retained.'); return;
    } else throw Error(`Unsupported PDF block: ${type}`);
    if (el.parentElement !== parent) parent.append(el);
    if (block.bbox) reviewMap.push({text:el.textContent, page, y:block.bbox[1]});
  }
  const pageMargins=new Map();
  for(const page of documentData.pages){
    const body=page.blocks.filter(b=>b.type==='text'&&b.bbox&&b.bbox[2]-b.bbox[0]>.4);
    if(body.length>=3)pageMargins.set(page.page_idx+1,{left:Math.min(...body.map(b=>b.bbox[0])),right:Math.max(...body.map(b=>b.bbox[2]))});
  }
  for (const page of documentData.pages) for (const block of recoverLists(page.blocks)) render(block, page.page_idx + 1);
  if (notes.length) {
    const heading = doc.createElement('h2'); heading.textContent = 'Notes'; doc.body.append(heading);
    for (const {block,number,page} of notes) {
      const p = doc.createElement('p'), a = doc.createElement('a');
      if(refs.has(number))a.href = `#_ftnref${number}`; a.id = `_ftn${number}`; a.name = a.id; a.title = ''; a.textContent = number;
      p.append(a, '. '); inline(block.content, p, page, false); doc.body.append(p);
      reviewMap.push({id:a.id, text:p.textContent, page, y:block.bbox?.[1] || .9});
      if (!refs.has(number)) warnings.add('Some footnotes have no detected reference in the article.');
    }
  }
  return {html:doc.body.innerHTML, equations, notes:notes.length, reviewMap, warnings:[...warnings]};
}
