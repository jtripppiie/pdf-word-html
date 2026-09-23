import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
await mkdir('public/vendor', { recursive: true });
for (const path of ['build/pdf.mjs', 'build/pdf.worker.mjs', 'cmaps', 'standard_fonts', 'wasm']) {
  await cp(`node_modules/pdfjs-dist/${path}`, `public/vendor/${path.split('/').at(-1)}`, { recursive: true });
}

await cp('node_modules/mathjax/es5', 'public/vendor/mathjax', { recursive: true });

await mkdir('public/vendor/ort', {recursive:true});
for(const file of ['ort.wasm.min.mjs','ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])await cp(`node_modules/onnxruntime-web/dist/${file}`,`public/vendor/ort/${file}`);
await mkdir('public/vendor/latex-ocr', {recursive:true});
const models=JSON.parse(await readFile('ocr-models.json','utf8'));
for(const model of models){
 const path=`public/vendor/latex-ocr/${model.name}`;
 let bytes;try{bytes=await readFile(path);}catch{}
 if(!bytes||createHash('sha256').update(bytes).digest('hex')!==model.sha256){
  const response=await fetch(model.url);if(!response.ok)throw Error(`Could not download ${model.name}`);
  bytes=Buffer.from(await response.arrayBuffer());
  if(createHash('sha256').update(bytes).digest('hex')!==model.sha256)throw Error(`Checksum mismatch for ${model.name}`);
  await writeFile(path,bytes);
 }
}

await cp('THIRD_PARTY_NOTICES.md','public/THIRD_PARTY_NOTICES.txt');
await cp('node_modules/mammoth/mammoth.browser.min.js','public/vendor/mammoth.browser.min.js');
await cp('node_modules/jszip/dist/jszip.min.js','public/vendor/jszip.min.js');
await cp('node_modules/mammoth/LICENSE','public/vendor/mammoth-LICENSE.txt');
await cp('node_modules/jszip/LICENSE.markdown','public/vendor/jszip-LICENSE.txt');
