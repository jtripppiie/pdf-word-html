import {test,expect} from '@playwright/test';
import {wordFixture} from './fixtures/word.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import JSZip from 'jszip';
test('shared URL opens in another browser, preserves currency/math/notes, updates, downloads and revokes',async({page,browser})=>{
 await page.goto('/');await page.locator('#file').setInputFiles({name:'share-test.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await wordFixture()});await page.locator('#convert').click();await expect(page.locator('#status')).toContainText('Done:');
 await page.locator('#show-source').click();await page.locator('#source').fill((await page.locator('#source').inputValue())+'<p>Exports: <a href="https://example.com"><span class="tex2jax_ignore">$</span>6.7 billion</a>.</p>');
 await page.locator('#share').click();await expect(page.locator('#share-url')).toHaveValue(/\/shared.html#[a-f0-9]{48}$/);const url=await page.locator('#share-url').inputValue();
 const other=await browser.newContext(),reader=await other.newPage();
 try{
  await reader.goto(url);await expect(reader.locator('#shared-name')).toHaveText('share-test.docx');const frame=reader.frameLocator('#shared-preview');await expect(frame.locator('mjx-container')).toHaveCount(3);await expect(frame.locator('body')).toContainText('$6.7 billion');await expect(frame.locator('#_ftnref1')).toHaveAttribute('href','#_ftn1');
  const download=reader.waitForEvent('download');await reader.locator('#shared-download').click();const file=await download;const zip=await JSZip.loadAsync(await readFile(await file.path()));expect(await zip.file('share-test.html').async('string')).toContain('tex2jax_ignore');
  await page.locator('#source').fill((await page.locator('#source').inputValue())+'<p>Published edit.</p>');await page.locator('#share').click();await expect(page.locator('#share')).toBeEnabled();await expect(page.locator('#share-url')).toHaveValue(url);await reader.reload();await expect(frame.locator('body')).toContainText('Published edit.');
  await page.reload();await page.locator('.open-saved').first().click();await expect(page.locator('#share-url')).toHaveValue(url);await page.locator('#share-stop').click();await expect(page.locator('#share-panel')).toBeHidden();await reader.reload();await expect(reader.locator('#shared-status')).toContainText('unavailable');await expect(reader.locator('#shared-download')).toBeDisabled();
 }finally{await other.close();}
});
test('share API protects deletion, hides management tokens, enforces expiry and rejects malformed requests',async({request})=>{
 const created=await request.post('/api/shares',{data:{html:'<p>Sample</p>',name:'sample.pdf',pdf:'must not be stored'}});expect(created.status()).toBe(201);const share=await created.json();
 const read=await request.get('/api/shares/'+share.id);const record=await read.json();expect(record).not.toHaveProperty('deleteHash');expect(record).not.toHaveProperty('deleteToken');expect(record).not.toHaveProperty('pdf');
 expect((await request.delete('/api/shares/'+share.id)).status()).toBe(403);expect((await request.put('/api/shares/'+share.id,{data:{html:'bad',name:'bad'}})).status()).toBe(403);
 expect((await request.post('/api/shares',{headers:{'Content-Type':'text/plain'},data:'{}'})).status()).toBe(415);expect((await request.post('/api/shares',{data:{html:4,name:'bad'}})).status()).toBe(400);
 const path=process.env.PDF_SHARE_DIR+'/'+share.id+'.json';const stored=JSON.parse(await readFile(path));stored.expiresAt=Date.now()-1;await writeFile(path,JSON.stringify(stored));expect((await request.get('/api/shares/'+share.id)).status()).toBe(410);
 expect((await request.delete('/api/shares/'+share.id,{headers:{Authorization:'Bearer '+share.deleteToken}})).status()).toBe(200);
});
