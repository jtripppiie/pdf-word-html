import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
test('automatic PDF preserves source chart/table images, linked notes, and saved history',async({page})=>{
 test.setTimeout(60000);
 const result=JSON.parse(await readFile('tests/fixtures/wp26-1-automatic.json','utf8'));
 const expectedImages=[];
 const textOf=block=>typeof block.content==='string'?block.content:(block.content||[]).map(textOf).join('');
 for(const pageData of result.pages)for(const block of pageData.blocks){
  if(!['table','chart','image'].includes(block.type)||!Array.isArray(block.content))continue;
  const caption=block.content.filter(child=>child.type===`${block.type}_caption`).map(textOf).join(' ').replace(/\s+/g,' ').trim();
  for(const child of block.content)if(child.type===`${block.type}_body`)expectedImages.push({type:block.type,alt:caption||`${block.type==='table'?'Table':block.type==='chart'?'Chart':'Figure'} from PDF page ${pageData.page_idx+1}`});
 }
 expect(expectedImages.filter(i=>i.type==='table')).toHaveLength(4);
 expect(expectedImages.filter(i=>i.type==='chart')).toHaveLength(41);
 expect(expectedImages.filter(i=>i.type==='image')).toHaveLength(1);
 const table=result.pages.flatMap(p=>p.blocks).find(b=>b.type==='table');table.content.find(b=>b.type==='table_body').content='<table><tr><td>INCORRECT RECOGNIZED TABLE VALUE</td></tr></table>';
 await page.route('**/api/capabilities',r=>r.fulfill({json:{structuredPdf:true}}));
 await page.route('**/api/convert-pdf',r=>r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({result})+'\n'}));
 await page.goto('/');await page.locator('#file').setInputFiles('wp26-1.pdf');await page.locator('#convert').click();
 await expect(page.locator('#status')).toContainText('25 notes.',{timeout:30000});
 const frame=page.frameLocator('#preview');
 const epochs=frame.locator('ul').filter({hasText:'In the 1990s, the economy collapsed'});
 await expect(epochs.locator(':scope > li')).toHaveCount(4);
 await expect(epochs.locator('mjx-container')).toHaveCount(0);
 await expect(epochs.locator('li').first()).toContainText('introduced the hryvnia.');
 await expect(frame.locator('p > em').filter({hasText:/^Foreign Direct Investment$/})).toHaveCount(1);
 await expect(frame.locator('h2').filter({hasText:/^Foreign Direct Investment$/})).toHaveCount(0);
 await expect(frame.locator('h2').filter({hasText:/^1\. Introduction$/})).toHaveCount(1);
 await expect(frame.locator('a[id^="_ftnref"]')).toHaveCount(25);
 await expect(frame.locator('img')).toHaveCount(46);
 expect(await frame.locator('img').evaluateAll(images=>images.map(image=>image.alt).sort())).toEqual(expectedImages.map(image=>image.alt).sort());
 await expect(frame.locator('p').filter({hasText:/^Figure 3\. Convergence in output per capita$/}).locator('xpath=following-sibling::*[1]/img')).toHaveAttribute('alt','Figure 3. Convergence in output per capita');
 await expect(frame.locator('table')).toHaveCount(0);
 await expect(frame.locator('body')).not.toContainText('INCORRECT RECOGNIZED TABLE VALUE');
 await expect.poll(()=>frame.locator('img').first().evaluate(img=>img.complete&&img.naturalWidth>img.width)).toBe(true);
 await expect(frame.locator('h2').filter({hasText:/^Notes$/})).toHaveCount(1);
 for(let n=1;n<=25;n++){
  await expect(frame.locator(`#_ftnref${n}`)).toHaveAttribute('href',`#_ftn${n}`);
  await expect(frame.locator(`#_ftn${n}`)).toHaveAttribute('href',`#_ftnref${n}`);
 }
 await expect(frame.locator('#_ftnref7').locator('..')).toContainText('(Figure 7).[7]');
 await expect(frame.locator('#_ftnref10').locator('..')).toContainText('European Union.[10]');
 await expect(page.locator('#conversion-warning')).not.toContainText('footnotes');
 for(const n of [7,10,16,25]){
  await frame.locator(`#_ftnref${n}`).click();await page.waitForTimeout(300);
  await expect(frame.locator(`#_ftn${n}`)).toBeInViewport();
  await frame.locator(`#_ftn${n}`).click();await page.waitForTimeout(300);
  await expect(frame.locator(`#_ftnref${n}`)).toBeInViewport();
 }
 const download=page.waitForEvent('download');await page.locator('#download').click();const file=await download;await file.saveAs('output/wp26-1.zip');
 const zip=await JSZip.loadAsync(await readFile('output/wp26-1.zip'));expect(Object.keys(zip.files).filter(n=>n.endsWith('.png'))).toHaveLength(46);
 const exported=await zip.file('wp26-1.html').async('string');expect(exported).toContain('src="images/chart-');expect(exported).not.toContain('data:image/');
 await page.reload();await page.locator('.open-saved').first().click();
 await expect(frame.locator('a[id^="_ftnref"]')).toHaveCount(25);
 await expect(frame.locator('img')).toHaveCount(46);
 expect(await frame.locator('img').evaluateAll(images=>images.map(image=>image.alt).sort())).toEqual(expectedImages.map(image=>image.alt).sort());
 await expect(frame.locator('table')).toHaveCount(0);
 await expect(frame.locator('body')).not.toContainText('INCORRECT RECOGNIZED TABLE VALUE');
 await expect.poll(()=>frame.locator('img').first().evaluate(img=>img.complete&&img.naturalWidth>img.width)).toBe(true);
});
