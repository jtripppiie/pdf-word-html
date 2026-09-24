import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import JSZip from 'jszip';
import {wordFixture} from './fixtures/word.mjs';

test.beforeEach(async({page})=>{
 if(!process.env.WORD_RELEASE_OVERLAY)return;
 for(const name of ['index.html','app.mjs','download-docx.mjs']){
  const path=name==='index.html'?'/':'/'+name;
  await page.route(new URL(path,process.env.TEST_URL).href,async route=>route.fulfill({contentType:name.endsWith('.html')?'text/html':'text/javascript',body:await readFile('/tmp/pdf-word-release-1.2.3/public/'+name,'utf8')}));
 }
});

test('Download Word preserves text, italic notes, images and editable TeX, and reopens',async({page})=>{
 await page.goto('/');await expect(page.locator('#download-word')).toBeDisabled();
 await page.locator('#file').setInputFiles({name:'word-export.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await wordFixture({picture:true})});
 await page.locator('#convert').click();await expect(page.locator('#status')).toContainText('Done:');
 await page.locator('#show-source').click();
 const html=await page.locator('#source').inputValue();
 await page.locator('#source').fill(html.replace('A real footnote.','A <em>real citation</em> footnote.'));
 const event=page.waitForEvent('download');await page.locator('#download-word').click();const download=await event;
 expect(download.suggestedFilename()).toBe('word-export.docx');
 const bytes=await readFile(await download.path()),zip=await JSZip.loadAsync(bytes);
 const documentXml=await zip.file('word/document.xml').async('string'),notes=await zip.file('word/footnotes.xml').async('string');
 expect(documentXml).toContain('Word equation sample');expect(documentXml).toContain('\\frac');expect(documentXml).toContain('w:footnoteReference');
 expect(notes).toContain('<w:i/>');expect(notes).toContain('real citation');expect(notes).toContain('<w:footnoteRef/>');
 expect(Object.keys(zip.files).filter(n=>n.startsWith('word/media/')&&!zip.files[n].dir)).toHaveLength(1);
 const xmlParts=await Promise.all(Object.keys(zip.files).filter(n=>/\.(xml|rels)$/.test(n)).map(async name=>({name,text:await zip.file(name).async('string')})));
 expect(await page.evaluate(parts=>parts.filter(p=>new DOMParser().parseFromString(p.text,'application/xml').querySelector('parsererror')).map(p=>p.name),xmlParts)).toEqual([]);
 await page.locator('#file').setInputFiles({name:'roundtrip.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:bytes});
 await page.locator('#convert').click();await expect(page.locator('#status')).toContainText('Done:');
 const frame=page.frameLocator('#preview');await expect(frame.locator('em').filter({hasText:'real citation'})).toHaveCount(1);await expect(frame.locator('img')).toHaveCount(1);await expect(frame.locator('body')).toContainText('Word equation sample');
 await page.locator('#show-source').click();await page.locator('#source').fill('');await expect(page.locator('#download-word')).toBeDisabled();
});
