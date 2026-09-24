// Exports the converted HTML as a .docx tuned for the PIIE Word publication importer.
// The importer reads: an "Article body"/"End of article body" boundary, Heading1-6
// and Quote paragraph styles, list numbering, standard Word tables, inline images
// (with an optional "Image filename:" instruction), typed MathJax as literal
// \(...\)/\[...\] text, and native Word footnotes. We emit exactly those shapes so a
// round trip stays lossless. Runs entirely in the browser; no server or paid service.
let zipReady;
async function getZip(){
 if(window.JSZip)return window.JSZip;
 return zipReady ||= new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/vendor/jszip.min.js';script.onload=()=>resolve(window.JSZip);script.onerror=()=>{zipReady=null;reject(Error('Could not load Word download support. Please try again.'));};document.head.append(script);});
}

const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const EMU_PER_PX=9525;
const MAX_IMAGE_EMU=5486400; // 6 inches of body width.
const MIME_EXT={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
const EXT_MIME={png:'image/png',jpg:'image/jpeg',webp:'image/webp',gif:'image/gif'};

const escXml=value=>String(value).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const escAttr=value=>String(value).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const pad2=n=>String(n).padStart(2,'0');

function safeLink(url){
 return !/[\x00-\x20\x7f]/.test(url)&&/^(https?:\/\/[^/]+|mailto:[^@]+@[^@]+)/i.test(url);
}

// Mirror the importer's ImageMetadata::shortSlug: at most four words and 32 characters.
function shortSlug(title){
 const words=String(title).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0,4);
 let slug='';
 for(const word of words){
  const next=slug?`${slug}-${word}`:word;
  if(next.length>32){if(!slug)slug=word.slice(0,32);break;}
  slug=next;
 }
 return slug||'publication';
}

function today(){
 const now=new Date();
 return `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
}

async function imageSize(blob){
 try{const bitmap=await createImageBitmap(blob);const size={w:bitmap.width,h:bitmap.height};bitmap.close?.();return size;}
 catch{
  return await new Promise(resolve=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{resolve({w:img.naturalWidth,h:img.naturalHeight});URL.revokeObjectURL(url);};img.onerror=()=>{resolve({w:600,h:400});URL.revokeObjectURL(url);};img.src=url;});
 }
}

function runXml(text,fmt){
 if(!text)return '';
 const props=[];
 if(fmt.b)props.push('<w:b/>');
 if(fmt.i)props.push('<w:i/>');
 if(fmt.va)props.push(`<w:vertAlign w:val="${fmt.va}"/>`);
 const rPr=props.length?`<w:rPr>${props.join('')}</w:rPr>`:'';
 return `<w:r>${rPr}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r>`;
}

function footnoteRun(id){
 return `<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:footnoteReference w:id="${id}"/></w:r>`;
}

function drawingRun(info){
 return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">`
  +`<wp:extent cx="${info.cx}" cy="${info.cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/>`
  +`<wp:docPr id="${info.id}" name="Picture ${info.id}" descr="${escAttr(info.alt||'')}"${info.alt?` title="${escAttr(info.alt)}"`:''}/>`
  +`<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>`
  +`<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">`
  +`<pic:pic><pic:nvPicPr><pic:cNvPr id="${info.id}" name="${escAttr(info.mediaName)}" descr="${escAttr(info.alt||'')}"/><pic:cNvPicPr/></pic:nvPicPr>`
  +`<pic:blipFill><a:blip r:embed="${info.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
  +`<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${info.cx}" cy="${info.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
  +`</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

// Serialize inline content of a node into Word runs, tracking hyperlinks and notes.
function inlineRuns(node,fmt,ctx){
 let out='';
 for(const child of node.childNodes){
  if(child.nodeType===3){out+=runXml(child.nodeValue,fmt);continue;}
  if(child.nodeType!==1)continue;
  const tag=child.tagName.toLowerCase();
  if(tag==='br'){out+='<w:r><w:br/></w:r>';continue;}
  if(tag==='img'){const info=ctx.imageMap.get(child.getAttribute('src')||'');if(info)out+=drawingRun(info);continue;}
  if(tag==='strong'||tag==='b'){out+=inlineRuns(child,{...fmt,b:true},ctx);continue;}
  if(tag==='em'||tag==='i'){out+=inlineRuns(child,{...fmt,i:true},ctx);continue;}
  if(tag==='sup'){out+=inlineRuns(child,{...fmt,va:'superscript'},ctx);continue;}
  if(tag==='sub'){out+=inlineRuns(child,{...fmt,va:'subscript'},ctx);continue;}
  if(tag==='a'){
   const href=child.getAttribute('href')||'';
   const note=href.match(/^#_ftn(\d+)$/);
   if(note){ctx.usedNotes.add(note[1]);out+=footnoteRun(note[1]);continue;}
   if(!ctx.plainLinks&&/^(https?:|mailto:)/i.test(href)&&safeLink(href)){
    const rId=`rId${ctx.relCounter++}`;
    ctx.rels.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escAttr(href)}" TargetMode="External"/>`);
    out+=`<w:hyperlink r:id="${rId}">${inlineRuns(child,fmt,ctx)}</w:hyperlink>`;continue;
   }
   out+=inlineRuns(child,fmt,ctx);continue;
  }
  out+=inlineRuns(child,fmt,ctx);
 }
 return out;
}

function paragraph(runs,style){
 const pPr=style?`<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`:'';
 return `<w:p>${pPr}${runs}</w:p>`;
}

function textParagraph(text){
 return `<w:p><w:r><w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`;
}

function walkList(listEl,depth,ctx){
 const kind=listEl.tagName.toLowerCase()==='ol'?'ol':'ul';
 const numId=ctx.numbering.length+1;
 ctx.numbering.push({numId,kind});
 let out='';
 for(const li of [...listEl.children].filter(n=>n.tagName&&n.tagName.toLowerCase()==='li')){
  const inline=li.ownerDocument.createElement('div');
  const sublists=[];
  for(const n of li.childNodes){
   if(n.nodeType===1&&['ul','ol'].includes(n.tagName.toLowerCase()))sublists.push(n);
   else inline.appendChild(n.cloneNode(true));
  }
  out+=`<w:p><w:pPr><w:numPr><w:ilvl w:val="${depth}"/><w:numId w:val="${numId}"/></w:numPr></w:pPr>${inlineRuns(inline,{},ctx)}</w:p>`;
  for(const sub of sublists)out+=walkList(sub,depth+1,ctx);
 }
 return out;
}

function tableXml(tableEl,ctx){
 const rows=[...tableEl.querySelectorAll('tr')];
 let cols=0;
 for(const tr of rows){
  let count=0;
  for(const cell of [...tr.children].filter(c=>/^(td|th)$/i.test(c.tagName)))count+=Math.max(1,parseInt(cell.getAttribute('colspan')||'1',10));
  cols=Math.max(cols,count);
 }
 cols=cols||1;
 const border='<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/>';
 let out=`<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${border}</w:tblBorders></w:tblPr><w:tblGrid>`;
 for(let c=0;c<cols;c++)out+=`<w:gridCol w:w="${Math.floor(9360/cols)}"/>`;
 out+='</w:tblGrid>';
 for(const tr of rows){
  const header=!!tr.closest('thead');
  out+=`<w:tr>${header?'<w:trPr><w:tblHeader/></w:trPr>':''}`;
  for(const cell of [...tr.children].filter(c=>/^(td|th)$/i.test(c.tagName))){
   const span=Math.max(1,parseInt(cell.getAttribute('colspan')||'1',10));
   const isTh=cell.tagName.toLowerCase()==='th';
   const tcPr=`<w:tcPr>${span>1?`<w:gridSpan w:val="${span}"/>`:''}</w:tcPr>`;
   out+=`<w:tc>${tcPr}<w:p>${inlineRuns(cell,{b:isTh},ctx)}</w:p></w:tc>`;
  }
  out+='</w:tr>';
 }
 return out+'</w:tbl>';
}

function emitImage(img,ctx){
 const info=ctx.imageMap.get(img.getAttribute('src')||'');
 if(!info)return;
 ctx.figure++;
 ctx.body+=`<w:p>${drawingRun(info)}</w:p>`;
 ctx.body+=textParagraph(`Image filename: ${ctx.date}-${ctx.slug}-figure-${pad2(ctx.figure)}.${info.ext}`);
}

function walkBlocks(container,ctx){
 for(const node of container.childNodes){
  if(node.nodeType===3){const t=node.nodeValue.trim();if(t)ctx.body+=paragraph(runXml(node.nodeValue,{}));continue;}
  if(node.nodeType!==1||ctx.skip.has(node))continue;
  const tag=node.tagName.toLowerCase();
  const embeddedImages=[...node.querySelectorAll?.('img')||[]];
  if(tag==='img'){emitImage(node,ctx);continue;}
  if(embeddedImages.length&&node.textContent.trim()===''){for(const img of embeddedImages)emitImage(img,ctx);continue;}
  if(/^h[1-6]$/.test(tag)){const level=Math.min(6,Math.max(1,parseInt(tag[1],10)-1));ctx.body+=paragraph(inlineRuns(node,{},ctx),`Heading${level}`);continue;}
  if(tag==='blockquote'){
   const kids=[...node.children].filter(c=>/^(p|h[1-6])$/i.test(c.tagName));
   if(kids.length)for(const kid of kids)ctx.body+=paragraph(inlineRuns(kid,{},ctx),'Quote');
   else ctx.body+=paragraph(inlineRuns(node,{},ctx),'Quote');
   continue;
  }
  if(tag==='ul'||tag==='ol'){ctx.body+=walkList(node,0,ctx);continue;}
  if(tag==='table'){ctx.body+=tableXml(node,ctx);continue;}
  if(tag==='p'){ctx.body+=paragraph(inlineRuns(node,{},ctx));continue;}
  walkBlocks(node,ctx);
 }
}

function stylesXml(){
 const headings=[];
 for(let level=1;level<=6;level++){
  const size=36-level*2;
  headings.push(`<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:pPr><w:keepNext/><w:outlineLvl w:val="${level-1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`);
 }
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  +`<w:styles xmlns:w="${W}">`
  +`<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>`
  +headings.join('')
  +`<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:pPr><w:ind w:left="720" w:right="720"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>`
  +`</w:styles>`;
}

function numberingXml(defs){
 if(!defs.length)return '';
 let abstracts='',nums='';
 for(const {numId,kind} of defs){
  let levels='';
  for(let ilvl=0;ilvl<9;ilvl++){
   const left=720*(ilvl+1);
   levels+=kind==='ol'
    ?`<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%${ilvl+1}."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr></w:lvl>`
    :`<w:lvl w:ilvl="${ilvl}"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${left}" w:hanging="360"/></w:pPr></w:lvl>`;
  }
  abstracts+=`<w:abstractNum w:abstractNumId="${numId}"><w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
  nums+=`<w:num w:numId="${numId}"><w:abstractNumId w:val="${numId}"/></w:num>`;
 }
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${W}">${abstracts}${nums}</w:numbering>`;
}

function footnotesXml(usedNotes,noteMap,ctx){
 // Footnote hyperlinks reference their own rels part, so give them an isolated context.
 const fnCtx={imageMap:ctx.imageMap,usedNotes:ctx.usedNotes,rels:[],relCounter:1,plainLinks:false};
 let notes='';
 for(const id of [...usedNotes].sort((a,b)=>Number(a)-Number(b))){
  const node=noteMap.get(id);
  const runs=node?inlineRuns(node,{},fnCtx):runXml('',{});
  notes+=`<w:footnote w:id="${id}"><w:p>${runs||'<w:r><w:t/></w:r>'}</w:p></w:footnote>`;
 }
 const xml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:footnotes xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
  +`<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>`
  +`<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>`
  +notes+`</w:footnotes>`;
 return {xml,rels:fnCtx.rels};
}

export async function createDownloadDocx(html,filename,{title,date}={}){
 const Zip=await getZip(),zip=new Zip();
 const doc=new DOMParser().parseFromString(html,'text/html');
 const stem=(filename||'document').replace(/\.(pdf|docx)$/i,'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-')||'document';
 const docTitle=(title||stem).trim();
 const ctx={body:'',rels:[],relCounter:4,numbering:[],imageMap:new Map(),usedNotes:new Set(),skip:new Set(),figure:0,date:date||today(),slug:shortSlug(docTitle)};

 // Prepare images: embed once per source, sized in EMUs with alt text preserved.
 const usedExtensions=new Set();
 let mediaIndex=0;
 for(const img of doc.querySelectorAll('img')){
  const src=img.getAttribute('src')||'';
  if(ctx.imageMap.has(src))continue;
  const match=src.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/);
  if(!match)continue;
  const mime=match[1],ext=MIME_EXT[mime],base64=match[2].replace(/\s/g,'');
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  const {w,h}=await imageSize(new Blob([bytes],{type:mime}));
  const scale=Math.min(1,MAX_IMAGE_EMU/Math.max(1,w*EMU_PER_PX));
  const cx=Math.max(1,Math.round(w*EMU_PER_PX*scale)),cy=Math.max(1,Math.round(h*EMU_PER_PX*scale));
  const rId=`rId${ctx.relCounter++}`,mediaName=`image${++mediaIndex}.${ext}`;
  usedExtensions.add(ext);
  ctx.rels.push(`<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${mediaName}"/>`);
  zip.file(`word/media/${mediaName}`,base64,{base64:true});
  ctx.imageMap.set(src,{rId,ext,cx,cy,alt:img.getAttribute('alt')||'',mediaName,id:mediaIndex});
 }

 // Set aside the trailing Notes section so its entries become native footnotes.
 const noteMap=new Map();
 const headings=[...doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6')];
 const notesHeading=headings.find(node=>node.textContent.trim().toLowerCase()==='notes');
 if(notesHeading){
  ctx.skip.add(notesHeading);
  for(let sibling=notesHeading.nextElementSibling;sibling;sibling=sibling.nextElementSibling){
   ctx.skip.add(sibling);
   const anchor=sibling.querySelector?.('a[id^="_ftn"]');
   const id=anchor&&anchor.id.match(/^_ftn(\d+)$/);
   if(id){
    const clone=sibling.cloneNode(true);
    clone.querySelectorAll('a[id^="_ftn"],a[name^="_ftn"]').forEach(node=>node.remove());
    while(clone.firstChild&&clone.firstChild.nodeType===3&&/^[\s.]*$/.test(clone.firstChild.nodeValue))clone.firstChild.remove();
    if(clone.firstChild&&clone.firstChild.nodeType===3)clone.firstChild.nodeValue=clone.firstChild.nodeValue.replace(/^[\s.]+/,'');
    noteMap.set(id[1],clone);
   }
  }
 }

 walkBlocks(doc.body,ctx);
 if(!ctx.body.trim())ctx.body=paragraph(runXml(' ',{}));

 const metadata=`<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="3000"/><w:gridCol w:w="6360"/></w:tblGrid><w:tr><w:tc><w:tcPr/><w:p><w:r><w:t>Publication title</w:t></w:r></w:p></w:tc><w:tc><w:tcPr/><w:p><w:r><w:t xml:space="preserve">${escXml(docTitle)}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`;

 const sectPr='<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>';
 const document_xml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  +`<w:document xmlns:w="${W}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">`
  +`<w:body>${metadata}${textParagraph('Article body')}${ctx.body}${textParagraph('End of article body')}${sectPr}</w:body></w:document>`;

 const rels=[
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>',
  ...ctx.rels,
 ];
 const imageDefaults=[...usedExtensions].map(ext=>`<Default Extension="${ext}" ContentType="${EXT_MIME[ext]}"/>`).join('');
 const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
  +`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
  +`<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
  +`<Default Extension="xml" ContentType="application/xml"/>${imageDefaults}`
  +`<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>`
  +`<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>`
  +`<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>`
  +`<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>`
  +`</Types>`;

 zip.file('[Content_Types].xml',contentTypes);
 zip.file('_rels/.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 zip.file('word/document.xml',document_xml);
 zip.file('word/_rels/document.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`);
 zip.file('word/styles.xml',stylesXml());
 zip.file('word/numbering.xml',numberingXml(ctx.numbering)||`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="${W}"/>`);
 const footnotes=footnotesXml(ctx.usedNotes,noteMap,ctx);
 zip.file('word/footnotes.xml',footnotes.xml);
 if(footnotes.rels.length)zip.file('word/_rels/footnotes.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${footnotes.rels.join('')}</Relationships>`);

 return {blob:await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}}),name:`${stem}.docx`,images:ctx.imageMap.size};
}
