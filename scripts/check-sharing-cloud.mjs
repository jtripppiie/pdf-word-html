import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import JSZip from 'jszip';
const url=process.env.TEST_URL;if(!url)throw Error('TEST_URL required');
// Only this generated, nonsensitive sample is shared by this acceptance check.
const html=await readFile('output/cloud-smoke.html','utf8');
const browser=await chromium.launch();let share,page;
try{
 const owner=await browser.newContext();page=await owner.newPage();await page.goto(url);
 const caps=await page.evaluate(()=>fetch('/api/capabilities').then(r=>r.json()));if(!caps.sharing||!caps.structuredPdf)throw Error('Capabilities missing');
 share=await page.evaluate(async html=>{const {publishShare}=await import('/share.mjs');return publishShare(html,'generated-sharing-test.pdf');},html);
 const recipient=await browser.newContext(),reader=await recipient.newPage();await reader.goto(share.url);
 await reader.frameLocator('#shared-preview').locator('mjx-container').waitFor();
 const result=await reader.evaluate(()=>{const doc=document.getElementById('shared-preview').contentDocument;return {equations:doc.querySelectorAll('mjx-container').length,errors:doc.querySelectorAll('[data-mml-node="merror"]').length,images:doc.querySelectorAll('img').length,notes:doc.querySelectorAll('[id^="_ftnref"]').length};});
 if(result.equations!==1||result.errors||result.images!==2||result.notes!==1)throw Error(JSON.stringify(result));
 const download=reader.waitForEvent('download');await reader.locator('#shared-download').click();const file=await download;const zip=await JSZip.loadAsync(await readFile(await file.path()));const exported=await zip.file('generated-sharing-test.html').async('string');
 if(Object.keys(zip.files).filter(f=>f.endsWith('.png')).length!==2||exported.includes('data:image'))throw Error('Shared ZIP missing separate image files');
 const updated=await page.evaluate(async({html,share})=>{const {publishShare}=await import('/share.mjs');return publishShare(html+'<p>Published edit: <span class="tex2jax_ignore">$</span>6.7 billion.</p>','generated-sharing-test.pdf',share);},{html,share});
 if(updated.url!==share.url)throw Error('Share URL changed');await reader.reload();await reader.frameLocator('#shared-preview').getByText('Published edit: $6.7 billion.').waitFor();
 await page.evaluate(async share=>{const {revokeShare}=await import('/share.mjs');await revokeShare(share);},share);share=null;
 await reader.reload();await reader.getByText('This shared link is unavailable or has expired.').waitFor();
 await writeFile('output/sharing-cloud-audit.json',JSON.stringify({...result,zipImages:2,updated:true,revoked:true},null,2));console.log({...result,zipImages:2,updated:true,revoked:true});
}finally{if(share&&page)await page.evaluate(async share=>{const {revokeShare}=await import('/share.mjs');await revokeShare(share);},share).catch(()=>{});await browser.close();}
