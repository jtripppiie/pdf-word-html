// Generate local test inputs from the PDF, without any correction catalog.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {getDocument,Util} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {extractPage} from '../public/extract.mjs';
import {markPageEquations} from '../public/equations.mjs';
const directory='output/formula-eval-inputs';await mkdir(directory,{recursive:true});
const task=getDocument({data:new Uint8Array(await readFile(process.argv[2]||'wp26-1.pdf')),standardFontDataUrl:process.cwd()+'/node_modules/pdfjs-dist/standard_fonts/'}),pdf=await task.promise;
for(const n of [21,26,27,32]){
 const page=await pdf.getPage(n),viewport=page.getViewport({scale:2}),canvas=createCanvas(viewport.width,viewport.height);
 await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;await writeFile(`${directory}/page${n}.png`,canvas.toBuffer('image/png'));
 const text=await page.getTextContent(),extracted=extractPage(text.items,page.getViewport({scale:1}),Util.transform);
 await writeFile(`${directory}/page${n}-review.json`,JSON.stringify(markPageEquations(extracted,n),null,2));
}
await task.destroy();console.log('Local evaluation inputs prepared.');
