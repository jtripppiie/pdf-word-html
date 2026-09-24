import {publishShare,revokeShare} from './share.mjs';
import { createDownloadZip } from './download-zip.mjs';
import { createDownloadDocx } from './download-docx.mjs';
import { attachPdfSnapshots } from './pdf-snapshots.mjs';
import { nativeNoteReferences } from './pdf-note-references.mjs';
import { siteMathHtml } from './site-math.mjs';
import { convertWord } from './word.mjs';
import { structuredPdfHtml } from './structured-pdf.mjs';
import { convertPdfWithService } from './pdf-service.mjs';
import { applyReviewedEquations, unresolvedMath, replaceMath } from './math-review.mjs';
import { renderMath, validateTex } from './math-preview.mjs';
import { recognizePageMath, removeLegacyEquationImages } from './equations.mjs';
import { cancelRecognition } from './local-ocr.mjs';
import { extractPage, documentHtml, parsePages } from './extract.mjs';
import { saveConversion, readConversion, deleteConversion, listConversions } from './history.mjs';
import { PdfViewer } from './viewer.mjs';
import { compareText } from './compare.mjs';
import { reviewReport } from './review-report.mjs';
import { classifyCheck, checkVerdict } from './check-classify.mjs';
import { ScrollSync } from './scroll-sync.mjs';
import { setupFullscreen } from './fullscreen.mjs';
const $=id=>document.getElementById(id);
let selectedFile,html='',busy=false,view='preview',activeRecord=null;
let pdfjsPromise,previewUrl,saveQueue=Promise.resolve(),currentPdfPage=1,stopMath=false;
let structuredPdf=false;
let conversionAbort;
const capabilities=fetch('/api/capabilities').then(r=>r.ok?r.json():{}).then(value=>{structuredPdf=!!value.structuredPdf;updateFormat();}).catch(()=>{});
const isHtmlFullscreen=setupFullscreen($('html-panel'),$('fullscreen-html'),$('preview'));
const viewer=new PdfViewer($('pdf-scroll'),$('pdf-status'),position=>{updatePageControls(position.number);sync.fromPdf(position);});
const sync=new ScrollSync({iframe:$('preview'),viewer,enabled:$('sync-scroll'),isPreview:()=>view==='preview'&&!isHtmlFullscreen(),onPage:updatePageControls});
$('preview').addEventListener('load',async()=>{const doc=$('preview').contentDocument;try{await renderMath(doc);}catch{$('math-status').textContent='Equation preview could not render. The TeX remains in Edit HTML.';}if(doc===$('preview').contentDocument)sync.connect(activeRecord);});
$('sync-scroll').onchange=()=>{if($('sync-scroll').checked)sync.fromPdf(viewer.position());};
const getPdfjs=()=>pdfjsPromise ||= import('./vendor/pdf.mjs').then(lib=>{lib.GlobalWorkerOptions.workerSrc='/vendor/pdf.worker.mjs';return lib;});
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function historyStatus(message,error=false){$('history-status').textContent=message;$('history-status').classList.toggle('error',error);}
const isWord=()=>/\.docx$/i.test(selectedFile?.name||'');
function updateFormat(){const word=isWord();$('word-hint').hidden=!word;$('pdf-math-options').hidden=word||structuredPdf;$('recognize-math').disabled=busy||word||structuredPdf;$('pdf-panel').hidden=word;$('review').classList.toggle('word-review',word);$('sync-scroll').closest('label').hidden=word;}
function setBusy(value){busy=value;for(const id of ['file','new-conversion','recognize-math','equation-apply','equation-choice','equation-tex'])$(id).disabled=value;$('convert').disabled=value||!selectedFile;$('source').disabled=value;$('share').disabled=value||!html.trim();$('download-word').disabled=value||!html.trim();$('history-list').querySelectorAll('button').forEach(button=>button.disabled=value);updateFormat();}
function setView(next){
 view=next;
 for(const name of ['preview','source','check'])$('show-'+name).classList.toggle('active',name===next);
 $('review').hidden=!html||next==='check';
 $('source').hidden=next!=='source';$('preview').hidden=next!=='preview'||!html;
 $('text-check').hidden=next!=='check'||!html;
 $('sync-scroll').disabled=isWord()||next!=='preview'||!html;
 if(next==='preview'&&html){
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewUrl=URL.createObjectURL(new Blob(['<!doctype html><html><head><meta charset="UTF-8"><style>img{max-width:100%;height:auto}</style></head><body>',html,'</body></html>'],{type:'text/html;charset=utf-8'}));
  $('preview').src=previewUrl;
 }
 if(next==='check'&&html)renderCheck();
}
let reviewTimer;
function clearOutput(){clearTimeout(reviewTimer);$('review-summary').textContent='';$('share-panel').hidden=true;$('share').disabled=true;$('conversion-warning').textContent='';$('equation-review').hidden=true;$('download').textContent='Download ZIP';$('math-status').textContent='';html='';$('source').value='';$('preview').removeAttribute('src');if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;$('download').disabled=true;$('download-word').disabled=true;$('show-check').disabled=true;setView('preview');}
function showOutput(){$('share').disabled=busy||!activeRecord.html.trim();showShare();updateFormat();$('conversion-warning').textContent=(activeRecord.warnings||[]).join(' ');html=activeRecord.html;updateMathReview();$('source').value=html;$('download').disabled=!html.trim();$('download-word').disabled=!html.trim();$('show-check').disabled=!activeRecord.sourcePages?.length;setView('preview');refreshReviewReport();}
async function refreshHistory(){
 try{
  const records=await listConversions();$('history-list').replaceChildren();
  for(const record of records){
   const row=document.createElement('li');
   const open=document.createElement('button');open.className='open-saved'+(record.id===activeRecord?.id?' active':'');open.disabled=busy;open.append(record.name);
   const date=document.createElement('small');date.textContent=`${new Date(record.updatedAt).toLocaleString()} · ${record.format==='docx'?'Word document':record.pageCount+' pages'}`;open.append(date);open.onclick=()=>openSaved(record.id);
   const remove=document.createElement('button');remove.textContent='×';remove.className='remove-saved';remove.disabled=busy;remove.setAttribute('aria-label',`Delete saved conversion ${record.name}`);remove.onclick=async()=>{
    if(busy||!confirm(`Delete saved conversion “${record.name}” from this browser?`))return;
    setBusy(true);await saveQueue;
    try{await deleteConversion(record.id);if(activeRecord?.id===record.id){activeRecord=null;await reset();}historyStatus('Saved conversion deleted.');await refreshHistory();}catch{historyStatus('Could not delete this saved conversion.',true);}finally{setBusy(false);}
   };
   row.append(open,remove);$('history-list').append(row);
  }
  if(!records.length&&!activeRecord)historyStatus('No saved conversions yet.');
 }catch{historyStatus('Browser storage is unavailable. You can still convert and download files.',true);}
}
function persistActive(){
 if(!activeRecord)return saveQueue;
 activeRecord={...activeRecord,html,updatedAt:Date.now()};const snapshot=activeRecord;
 historyStatus('Saving locally…');
 saveQueue=saveQueue.then(async()=>{
  try{await saveConversion(snapshot);if(activeRecord?.id===snapshot.id)historyStatus('Saved locally.');await refreshHistory();}
  catch{historyStatus('Could not save—browser storage may be full or unavailable. Download the HTML to keep it.',true);}
 });
 return saveQueue;
}
async function reset(){
 await viewer.clear();activeRecord=null;selectedFile=null;$('file').value='';$('file-label').textContent='No file selected.';$('file-meta').textContent='Maximum 30 MB.';clearOutput();$('convert').disabled=true;status('Choose a PDF or Word .docx file to get started.');
}
async function choose(file){
 if(busy||!file)return;setBusy(true);await saveQueue;await reset();
 if(!/\.(pdf|docx)$/i.test(file.name)){status(/\.doc$/i.test(file.name)?'Open this older .doc file in Word and save it as .docx, then upload it.':'Please choose a PDF or Word .docx file.',true);setBusy(false);return;}
 if(file.size>30*1024*1024){status('This file exceeds the 30 MB limit.',true);setBusy(false);return;}
 selectedFile=file;const selection=new DataTransfer();selection.items.add(file);$('file').files=selection.files;$('file-label').textContent=file.name;$('file-meta').textContent=`${(file.size/1024/1024).toFixed(2)} MB`;
 status('Ready to convert.');setBusy(false);await refreshHistory();
}
async function loadPdf(file){
 const lib=await getPdfjs();
 const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),cMapUrl:'/vendor/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/standard_fonts/',wasmUrl:'/vendor/wasm/',isEvalSupported:false});
 task.onPassword=(update,reason)=>{const password=window.prompt(reason===1?'Enter the password for this PDF:':'Incorrect password. Try again:');if(password===null)task.destroy();else update(password);};
 try{return {task,pdf:await task.promise,lib};}catch(error){await task.destroy().catch(()=>{});throw error;}
}
function updatePageControls(number){$('pdf-scroll').dataset.currentPage=number;}
async function showPdfPage(number){
 if(!viewer.pdf||!Number.isInteger(number)||number<1||number>viewer.pdf.numPages)return;
 currentPdfPage=number;updatePageControls(number);
 try{await viewer.show(number);sync.fromPdf(viewer.position());}catch{$('pdf-status').textContent='Could not render this PDF page.';}
}
async function openSaved(id){
 if(busy)return;setBusy(true);await saveQueue;await capabilities;
 try{
  const record=await readConversion(id);if(!record)throw new Error('This saved conversion is no longer available.');
  const currencyHtml=siteMathHtml(record.html,{escapedOnly:true});if(currencyHtml!==record.html)record.html=currencyHtml;
  await viewer.clear();activeRecord=record;const original=record.sourceFile||record.pdf;selectedFile=new File([original],record.name,{type:record.format==='docx'?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'application/pdf'});const selection=new DataTransfer();selection.items.add(selectedFile);$('file').files=selection.files;$('file-label').textContent=record.name;$('file-meta').textContent=`${(original.size/1024/1024).toFixed(2)} MB`;
  if(record.format==='docx'){showOutput();status(`Opened saved conversion: ${record.name}`);historyStatus('Saved locally.');await refreshHistory();return;}
  const migrated=removeLegacyEquationImages(record.html);if(migrated.review.length){record.html=migrated.html;record.mathReview=[...(record.mathReview||[]),...migrated.review];record.mathStatus='Legacy equation images removed. Reconvert this PDF to recognize editable TeX locally.';}
  const reviewed=record.engine||structuredPdf?false:await applyReviewedEquations(record);showOutput();if(migrated.review.length||reviewed)await persistActive();status(structuredPdf&&!record.engine?`Opened an older conversion: ${record.name}. Click Convert to HTML to use the current converter and original chart/table images.`:`Opened saved conversion: ${record.name}`);historyStatus('Saved locally.');
  try{const {task,pdf}=await loadPdf(selectedFile);await viewer.attach(task,pdf);await showPdfPage(record.sourcePages[0]?.number||1);}catch{$('pdf-status').textContent='Could not open the original PDF. The saved HTML is still available.';}
  await refreshHistory();
 }catch(error){status(error.message,true);}finally{setBusy(false);}
}
function refreshReviewReport(){
 clearTimeout(reviewTimer);
 $('review-issues').replaceChildren();$('review-pages').replaceChildren();
 if(!activeRecord?.sourcePages?.length){$('review-summary').textContent='';return;}
 try{
  const report=reviewReport(activeRecord.sourcePages,html);
  if(report.issues.length){
   const by={};for(const item of report.issues)by[item.kind]=(by[item.kind]||0)+1;
   const label={passage:'passage differences (usually equations, figures, or removed headers)',duplicate:'repeated paragraphs',link:'broken links',note:'note-anchor problems'};
   const parts=Object.entries(by).sort((a,b)=>b[1]-a[1]).map(([kind,count])=>`${count} ${label[kind]||kind}`);
   $('review-summary').textContent=`Automatic review: ${report.issues.length} items to inspect in Text check (${parts.join(', ')}). Passage differences are usually benign — check broken links and note-anchor problems first. Downloads remain available.`;
  }else{
   $('review-summary').textContent='Automatic review: no passage or link issues detected. This does not verify reading order, images, or mathematical accuracy.';
  }
  if(!report.pages.some(page=>page.checked))$('review-summary').textContent+=' Not enough extracted PDF text for passage checks.';
  $('review-context').textContent=`Passages are compared with extracted PDF text, which can itself be incomplete. Removed headers, moved notes, and equations can cause differences.${report.images?' This output contains images; text inside chart or table images is not checked.':''} Nothing is removed or repaired by this report.`;
  for(const item of report.issues.slice(0,100)){
   const li=document.createElement('li');li.textContent=item.message+(item.excerpt?`: “${item.excerpt}…”`:'');
   if(item.page){const button=document.createElement('button');button.className='word-page';button.textContent=`PDF p. ${item.page}`;button.onclick=()=>{setView('preview');showPdfPage(item.page);};li.append(button);}
   $('review-issues').append(li);
  }
  if(!report.issues.length){const li=document.createElement('li');li.textContent='No issues detected by these checks.';$('review-issues').append(li);}
  if(report.issues.length>100){const li=document.createElement('li');li.textContent=`Showing 100 of ${report.issues.length} review items.`;$('review-issues').append(li);}
  for(const item of report.pages){
   const li=document.createElement('li');li.textContent=`Page ${item.page}: `+(item.checked?`${item.matched} of ${item.checked} sampled phrases found somewhere in the HTML.`:'Not enough extracted text for passage checks.');$('review-pages').append(li);
  }
 }catch{$('review-summary').textContent='Automatic review could not finish. Conversion and download remain available.';}
}
function renderCheck(){
 refreshReviewReport();
 const {missing,added}=compareText(activeRecord?.sourcePages||[],html);
 $('check-summary').textContent=`${missing.reduce((n,item)=>n+item.count,0)} word occurrences fewer in HTML; ${added.reduce((n,item)=>n+item.count,0)} extra. These are review prompts, not a conversion accuracy score.`;
 const groups=classifyCheck({missing,added});
 $('check-verdict').textContent=checkVerdict(groups);
 const notableList=$('notable-words');notableList.replaceChildren();
 if(!groups.notable.length){const li=document.createElement('li');li.textContent='Nothing left once math, numbers, and removed page furniture are set aside.';notableList.append(li);}
 for(const item of groups.notable.slice(0,50)){
  const li=document.createElement('li');
  li.textContent=`${item.word} — ${item.count} ${item.direction==='fewer'?'fewer in HTML':'extra in HTML'}`;
  if(item.pages&&item.pages.length){const button=document.createElement('button');button.className='word-page';button.textContent=`PDF p. ${item.pages.join(', ')}`;button.title='Open the first PDF page containing this word';button.onclick=()=>{setView('preview');showPdfPage(item.pages[0]);};li.append(button);}
  notableList.append(li);
 }
 if(groups.notable.length>50){const li=document.createElement('li');li.textContent=`Showing the first 50 of ${groups.notable.length} plain-word differences.`;notableList.append(li);}
 for(const [id,items] of [['missing-words',missing],['added-words',added]]){
  $(id).replaceChildren();
  if(!items.length){const li=document.createElement('li');li.textContent='None found.';$(id).append(li);}
  for(const item of items.slice(0,200)){
   const li=document.createElement('li');li.textContent=`${item.word} × ${item.count}`;
   if(item.pages){const button=document.createElement('button');button.className='word-page';button.textContent=`PDF p. ${item.pages.join(', ')}`;button.title='Open the first PDF page containing this word';button.onclick=()=>{setView('preview');showPdfPage(item.pages[0]);};li.append(button);}
   $(id).append(li);
  }
  if(items.length>200){const li=document.createElement('li');li.textContent=`Showing the first 200 of ${items.length} differing words.`;$(id).append(li);}
 }
}
$('file').addEventListener('change',event=>choose(event.target.files[0]));
for(const name of ['dragenter','dragover'])$('drop').addEventListener(name,event=>{event.preventDefault();$('drop').classList.add('drag');});
for(const name of ['dragleave','drop'])$('drop').addEventListener(name,event=>{event.preventDefault();$('drop').classList.remove('drag');});
$('drop').addEventListener('drop',event=>choose(event.dataTransfer.files[0]));
$('new-conversion').onclick=async()=>{if(busy)return;setBusy(true);await saveQueue;await capabilities;await reset();await refreshHistory();setBusy(false);};
for(const name of ['preview','source','check'])$('show-'+name).onclick=()=>setView(name);
$('source').addEventListener('input',()=>{html=$('source').value;$('download').disabled=!html.trim();$('download-word').disabled=!html.trim();updateMathReview();clearTimeout(reviewTimer);reviewTimer=setTimeout(refreshReviewReport,350);persistActive();});
$('stop-math').onclick=()=>{if(conversionAbort){conversionAbort.abort();status('Cancelling conversion…');return;}stopMath=true;cancelRecognition();$('stop-math').hidden=true;status('Stopping math recognition; remaining expressions will be marked for transcription.');};
$('convert').onclick=()=>convertDocument();
export async function convertDocument(range=''){
 if(!selectedFile||busy)return;stopMath=false;$('stop-math').hidden=isWord()||!$('recognize-math').checked;setBusy(true);await saveQueue;clearOutput();await viewer.clear();activeRecord=null;
 $('progress').hidden=false;$('progress').value=0;let task;
 try{
  await capabilities;
  if(isWord()){
   status('Reading your Word document locally…');const result=await convertWord(selectedFile);html=siteMathHtml(result.html);
   activeRecord={format:'docx',id:crypto.randomUUID(),name:selectedFile.name,sourceFile:selectedFile,html,sourcePages:[],reviewMap:[],range:'',pageCount:null,warnings:result.warnings,createdAt:Date.now(),updatedAt:Date.now()};
   showOutput();await persistActive();status(`Done: Word document converted, ${result.notes} linked notes, ${result.equations} native equations.${result.warnings.length?' Review the conversion notices below.':''}`);return;
  }
  let mathRecognized=0;const mathReview=[];
  status('Opening your PDF locally…');const loaded=await loadPdf(selectedFile);task=loaded.task;const {pdf,lib}=loaded;
  if(!range&&pdf.numPages>100)throw Error('This PDF exceeds the 100-page limit. Split it into smaller PDFs before uploading.');
  if(structuredPdf){
   conversionAbort=new AbortController();$('stop-math').textContent='Cancel conversion';$('stop-math').hidden=false;$('progress').removeAttribute('value');
   const parsed=await convertPdfWithService(selectedFile,status,conversionAbort.signal);
   if(parsed.pages.length!==pdf.numPages)throw Error('The parser did not return every PDF page.');
   status('Preparing text and original chart/table images…');
   const sourcePages=[];parsed.visualsAsImages=true;
   for(let number=1;number<=pdf.numPages;number++){const page=await pdf.getPage(number),content=await page.getTextContent(),viewport=page.getViewport({scale:1});sourcePages.push({number,text:content.items.map(item=>(item.str||'')+(item.hasEOL?'\n':'')).join('')});const native=extractPage(content.items,viewport,lib.Util.transform);parsed.pages[number-1].nativeNoteReferences=nativeNoteReferences(content.items,viewport,lib.Util.transform,native.bodySize,parsed.pages[number-1].blocks);await attachPdfSnapshots(page,parsed.pages[number-1].blocks,{signal:conversionAbort.signal});page.cleanup();}
   const result=structuredPdfHtml(parsed);html=siteMathHtml(result.html);
   activeRecord={id:crypto.randomUUID(),name:selectedFile.name,pdf:selectedFile,html,sourcePages,reviewMap:result.reviewMap,range:'',pageCount:pdf.numPages,warnings:result.warnings,mathReview:[],mathStatus:`${result.equations} editable equations recognized automatically, including inline math.`,engine:'mineru-4.0.5-basic',createdAt:Date.now(),updatedAt:Date.now()};
   showOutput();await viewer.attach(task,pdf);task=null;await showPdfPage(1);await persistActive();
   status(`Done: ${pdf.numPages} pages, ${result.equations} editable equations, ${result.notes} notes.`);return;
  }
  const pages=parsePages(range,pdf.numPages);const extractedPages=[],sourcePages=[];let notes=0,paragraphs=0;const emptyPages=[];
  for(let i=0;i<pages.length;i++){
   status(`Reading page ${pages[i]} (${i+1} of ${pages.length})…`);const page=await pdf.getPage(pages[i]);const content=await page.getTextContent();
   sourcePages.push({number:pages[i],text:content.items.map(item=>(item.str||'')+(item.hasEOL?'\n':'')).join('')});
   const previousNote=extractedPages.at(-1)?.notes.at(-1);const contiguous=i>0&&pages[i]===pages[i-1]+1;
   const extracted=extractPage(content.items,page.getViewport({scale:1}),lib.Util.transform,{canContinueNote:!!previousNote&&contiguous});
   const math=await recognizePageMath(page,extracted,pages[i],{enabled:$('recognize-math').checked&&!stopMath,onProgress:message=>status(message),cancelled:()=>stopMath});mathRecognized+=math.recognized;mathReview.push(...math.review);
   if(extracted.continuation&&previousNote)previousNote.text+=' '+extracted.continuation;
   notes+=extracted.notes.length;paragraphs+=extracted.paragraphs.length;if(!extracted.paragraphs.length)emptyPages.push(pages[i]);extractedPages.push(extracted);page.cleanup();$('progress').value=(i+1)/pages.length*100;await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!paragraphs)throw new Error('No selectable text found. This may be a scanned PDF; run OCR on it first, then try again.');
  const result=documentHtml(extractedPages,pages);html=siteMathHtml(result.html);
  const unresolved=mathReview.filter(item=>!item.tex).length;
  const mathStatus=mathReview.length?`${mathRecognized} display equations have draft TeX. Verify every result against the PDF; recognition can misread symbols.${unresolved?' '+unresolved+' expressions need transcription (marked in the HTML).':''}`:'';
  activeRecord={mathReview,mathStatus,id:crypto.randomUUID(),name:selectedFile.name,pdf:selectedFile,html,sourcePages,reviewMap:result.reviewMap,range,pageCount:pages.length,createdAt:Date.now(),updatedAt:Date.now()};
  await applyReviewedEquations(activeRecord);showOutput();await viewer.attach(task,pdf);task=null;await showPdfPage(pages[0]);await persistActive();
  status(`${unresolvedMath(html).length?'Conversion complete; HTML is a draft with unconverted equations:':'Done:'} ${pages.length} page${pages.length===1?'':'s'}, ${paragraphs} text blocks, ${notes} footnotes detected, ${result.linked} linked. Review the output${emptyPages.length?`; no text on pages ${emptyPages.join(', ')}`:''}${notes>result.linked?'; some notes need manual links':''}.`);
 }catch(error){status(error.name==='AbortError'?'Conversion cancelled.':error.name==='InvalidPDFException'?'This file could not be read as a PDF.':(error.message||'Conversion failed. Try another PDF.'),error.name!=='AbortError');}
 finally{if(task)await task.destroy().catch(()=>{});conversionAbort=null;$('stop-math').textContent='Stop equation recognition';$('stop-math').hidden=true;setBusy(false);$('progress').hidden=true;}
}
function showShare(){const share=activeRecord?.share;$('share-panel').hidden=!share;if(share){$('share-url').value=share.url;$('share-status').textContent='Link expires '+new Date(share.expiresAt).toLocaleString();}}
$('share').onclick=async()=>{
 if(!html||busy)return;const record=activeRecord;setBusy(true);
 try{const share=await publishShare(html,selectedFile?.name||'document',record.share);record.share=share;if(activeRecord?.id===record.id){activeRecord.share=share;await persistActive();showShare();try{await navigator.clipboard.writeText(share.url);$('share-status').textContent+=' · Link copied.';}catch{$('share-url').select();}}}
 catch(error){status(error.message,true);}finally{setBusy(false);}
};
$('share-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('share-url').value);$('share-status').textContent='Link copied.';}catch{$('share-url').select();$('share-status').textContent='Select and copy the link above.';}};
$('share-stop').onclick=async()=>{const record=activeRecord;if(!record?.share)return;$('share-stop').disabled=true;try{await revokeShare(record.share);delete record.share;if(activeRecord?.id===record.id){delete activeRecord.share;await persistActive();showShare();status('Shared link disabled. Your saved conversion is unchanged.');}}catch(error){status(error.message,true);}finally{$('share-stop').disabled=false;}};
$('download').onclick=async()=>{
 if(!html)return;$('download').disabled=true;
 try{const output=await createDownloadZip(html,selectedFile?.name,{draft:!!unresolvedMath(html).length});const url=URL.createObjectURL(output.blob),link=document.createElement('a');link.href=url;link.download=output.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 catch(error){status(error.message||'Could not create the ZIP download.',true);}
 finally{$('download').disabled=!html.trim();}
};
$('download-word').onclick=async()=>{
 if(!html||busy)return;$('download-word').disabled=true;$('download-word').textContent='Preparing…';
 try{const output=await createDownloadDocx(html,selectedFile?.name);const url=URL.createObjectURL(output.blob),link=document.createElement('a');link.href=url;link.download=output.name;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 catch(error){status(error.message||'Could not create the Word download.',true);}
 finally{$('download-word').textContent='Download Word';$('download-word').disabled=!html.trim();}
};
refreshHistory().then(()=>{if($('history-status').textContent==='Loading history…')historyStatus('Choose a saved conversion to reopen it.');});

function updateMathReview(){
 const items=unresolvedMath(html),previous=$('equation-choice').value;
 $('equation-choice').replaceChildren();
 for(const item of items){const option=document.createElement('option');option.value=item.id;option.textContent=item.text.replace(/^\[|\]$/g,'');$('equation-choice').append(option);}
 if(items.some(item=>item.id===previous))$('equation-choice').value=previous;
 $('equation-review').hidden=!items.length;$('equation-review-summary').textContent=`Review ${items.length} unconverted expressions`;
 $('download').textContent=items.length?'Download draft ZIP':'Download ZIP';
 const reviewed=activeRecord?.mathReview?.filter(item=>item.reviewed).length||0;
 const draft=activeRecord?.mathReview?.filter(item=>item.tex&&!item.reviewed).length||0;
 $('math-status').textContent=items.length?`Incomplete draft: ${items.length} mathematical expressions need transcription. Use Review equations below; the markers are not equations.${reviewed?' '+reviewed+' reviewed correction applied.':''}`:(activeRecord?.mathReview?.length?`No unconverted markers remain.${reviewed?' '+reviewed+' reviewed correction applied.':''} Check any experimental OCR output against the PDF.`:'');
 if(draft)$('math-status').textContent+=` ${draft} expressions have experimental draft TeX; verify every symbol against the PDF.`;
 if(activeRecord?.engine&&!items.length)$('math-status').textContent=activeRecord.mathStatus||'';
 if(structuredPdf&&items.length&&!activeRecord?.engine){$('equation-review').hidden=true;$('math-status').textContent='This saved result uses the older converter. Click Convert to HTML to recognize its equations automatically.';}
 if(activeRecord?.mathStatus?.startsWith('Legacy equation images removed'))$('math-status').textContent='Legacy equation images removed. '+$('math-status').textContent;
}
$('equation-choice').onchange=()=>{$('equation-tex').value='';$('equation-message').textContent='';};
$('equation-open-pdf').onclick=()=>{const item=activeRecord?.mathReview?.find(item=>item.id===$('equation-choice').value);if(item){if(view==='check')setView('preview');showPdfPage(item.page);}};
$('equation-apply').onclick=async()=>{
 const id=$('equation-choice').value,item=activeRecord?.mathReview?.find(item=>item.id===id);if(!item||busy)return;
 const tex=$('equation-tex').value.trim();if(!tex){$('equation-message').textContent='Enter the equation’s TeX first.';return;}
 setBusy(true);
 try{await validateTex(tex,item.display);html=replaceMath(html,id,tex,item.display);item.tex=tex;item.reviewed=true;item.provenance='User-entered TeX';activeRecord.html=html;$('source').value=html;updateMathReview();refreshReviewReport();setView('preview');await persistActive();$('equation-tex').value='';$('equation-message').textContent='Equation applied and saved.';}
 catch(error){$('equation-message').textContent=error.message;}finally{setBusy(false);}
};
