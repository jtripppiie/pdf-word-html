import {chromium} from '@playwright/test';
import {writeFile,readFile} from 'node:fs/promises';
import JSZip from 'jszip';
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.goto(process.env.TEST_URL||'http://127.0.0.1:8080');
 await page.locator('#file').setInputFiles('output/italics-smoke.pdf');await page.locator('#convert').click();
 await page.waitForFunction(()=>!document.getElementById('convert').disabled,{},{timeout:300000});
 const status=await page.locator('#status').textContent();if(!status.startsWith('Done:'))throw Error(status);
 const html=await page.locator('#source').inputValue();
 const audit=await page.evaluate(()=>{
  const doc=document.getElementById('preview').contentDocument,note=doc.getElementById('_ftn1')?.closest('p');
  return {note:note?.textContent,italics:[...note?.querySelectorAll('em')||[]].map(e=>e.textContent),forward:doc.getElementById('_ftnref1')?.getAttribute('href'),back:doc.getElementById('_ftn1')?.getAttribute('href')};
 });
 if(audit.italics.join(' ')!=='Journal of Economic History'||audit.forward!=='#_ftn1'||audit.back!=='#_ftnref1'||!audit.note.includes('volume 12, pages 20-24.'))throw Error(JSON.stringify(audit));
 const download=page.waitForEvent('download');await page.locator('#download').click();const file=await download;
 const zip=await JSZip.loadAsync(await readFile(await file.path()));const exported=await zip.file('italics-smoke.html').async('string');
 if(!exported.includes('<em>Journal of Economic History</em>'))throw Error('ZIP lost italics');
 await writeFile('output/italics-smoke.html',html);await writeFile('output/italics-smoke-audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
}finally{await browser.close();}
