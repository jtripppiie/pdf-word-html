import {readFile,writeFile} from 'node:fs/promises';
import {getDocument,Util} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {extractPage,documentHtml} from '../public/extract.mjs';
const pdf=await getDocument({data:new Uint8Array(await readFile('wp25-4.pdf')),standardFontDataUrl:`${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`}).promise;
let output='';
for(let n=1;n<=pdf.numPages;n++) {const p=await pdf.getPage(n); const t=await p.getTextContent();const x=extractPage(t.items,p.getViewport({scale:1}),Util.transform);const h=documentHtml([x],[n]);console.log(n,'paragraphs',x.paragraphs.length,'notes',x.notes.map(n=>n.marker).join(','),'linked',h.linked);output+=h.html+'\n';}
await writeFile('/tmp/pdf-sample-inspection.html',output);
