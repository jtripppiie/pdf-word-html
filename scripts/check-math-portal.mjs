import JSZip from 'jszip';
import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const output=process.env.TEST_OUTPUT||'output/wp26-1-automatic';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1050}});
 page.on('pageerror',error=>console.error(error.message));
 page.on('response',async response=>{if(response.url().endsWith('/api/convert-pdf')&&response.ok()){try{const lines=(await response.text()).trim().split('\n').map(JSON.parse);const event=lines.find(item=>item.result);if(event)await writeFile(output+'.json',JSON.stringify(event.result));}catch{}}});
 if(process.env.TEST_RESULT_JSON){const result=JSON.parse(await readFile(process.env.TEST_RESULT_JSON,'utf8'));await page.route('**/api/convert-pdf',route=>route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({result})+'\n'}));}
 await page.goto(process.env.TEST_URL||'http://127.0.0.1:8081');
 await page.locator('#file').setInputFiles(process.argv[2]||'wp26-1.pdf');
 await page.locator('#convert').click();
 let last='';
 const timer=setInterval(async()=>{const message=await page.locator('#status').textContent().catch(()=>'');if(message!==last){last=message;console.log(message);}},10000);
 try{await page.waitForFunction(()=>!document.getElementById('convert').disabled,{},{timeout:3600000});}finally{clearInterval(timer);}
 const status=await page.locator('#status').textContent();
 if(!status.startsWith('Done:'))throw Error(status);
 await page.frameLocator('#preview').locator('mjx-container').first().waitFor();
 await page.waitForFunction(()=>! /\\\[|\\\(/.test(document.getElementById('preview').contentDocument.body.textContent),{},{timeout:120000});
 const html=await page.locator('#source').inputValue();
 const report=await page.evaluate(()=>{const doc=document.getElementById('preview').contentDocument;return {status:document.getElementById('status').textContent,math:document.getElementById('math-status').textContent,warnings:document.getElementById('conversion-warning').textContent,equations:doc.querySelectorAll('mjx-container').length,mathErrors:[...doc.querySelectorAll('[data-mml-node="merror"]')].map(n=>n.closest('mjx-container')?.getAttribute('aria-label')),tables:doc.querySelectorAll('table').length,images:doc.querySelectorAll('img').length,unexpectedImages:[...doc.querySelectorAll('img')].filter(img=>! /^(Table|Chart|Figure) from PDF page \d+$/.test(img.alt)).length,unconvertedMarkers:/needs transcription/.test(doc.body.textContent),notes:doc.querySelectorAll('a[id^="_ftn"]:not([id^="_ftnref"])').length,noteReferences:doc.querySelectorAll('a[id^="_ftnref"]').length};});
 await writeFile(output+'.html',html);
 await writeFile(output+'-audit.json',JSON.stringify(report,null,2));
 await page.screenshot({path:output+'-portal.png'});
 console.log(JSON.stringify(report,null,2));
 if(report.mathErrors.length||report.unconvertedMarkers||report.unexpectedImages)throw Error('Automatic math output failed rendering validation.');
 const download=page.waitForEvent('download');await page.locator('#download').click();const archive=await download;await archive.saveAs(output+'.zip');
 const zip=await JSZip.loadAsync(await readFile(output+'.zip'));const entry=Object.keys(zip.files).find(name=>name.endsWith('.html'));if(!entry)throw Error('ZIP has no HTML');const exported=await zip.file(entry).async('string');
 const sources=[...exported.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(match=>match[1]);if(sources.length!==report.images||sources.some(path=>!path.startsWith('images/')||!zip.file(path)))throw Error('ZIP image paths are missing or embedded.');
 console.log(`ZIP verified: ${entry}, ${sources.length} linked image assets.`);
 await page.reload();await page.locator('.open-saved').first().click();
 await page.frameLocator('#preview').locator('mjx-container').first().waitFor();
 console.log('Saved conversion reopened successfully.');
}finally{await browser.close();}
