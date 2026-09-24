import {test,expect} from '@playwright/test';import {wordFixture} from './fixtures/word.mjs';import {writeFile} from 'node:fs/promises';
async function upload(page,options={}){await page.goto('/');await page.locator('#file').setInputFiles({name:'equations.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await wordFixture(options)});await page.locator('#convert').click();}
test('Word preserves inline and display math, semantic structure, and linked endnotes locally',async({page,baseURL})=>{
 const external=[];page.on('request',r=>{if(r.url().startsWith('http')&&new URL(r.url()).origin!==new URL(baseURL).origin)external.push(r.url());});await upload(page);await expect(page.locator('#status')).toContainText('3 native equations');
 const f=page.frameLocator('#preview');await expect(f.locator('mjx-container')).toHaveCount(3);await expect(f.locator('[data-mml-node="merror"]')).toHaveCount(0);await expect(f.locator('p').filter({hasText:'stays inside this paragraph.'}).locator('mjx-container')).not.toHaveAttribute('display','true');
 await expect(f.locator('h2')).toHaveText(['Word equation sample','Notes']);await expect(f.locator('blockquote')).toContainText('Quoted passage');await expect(f.locator('ul li')).toHaveCount(2);await expect(f.locator('ol li')).toHaveCount(2);await expect(f.locator('table tr')).toHaveCount(2);
 await expect(f.locator('a[name="_ftnref1"]')).toHaveAttribute('href','#_ftn1');await expect(f.locator('a[name="_ftn1"]')).toHaveAttribute('href','#_ftnref1');await expect(f.locator('a[name="_ftn2"]')).toHaveCount(1);await expect(f.locator('body > p').last()).toContainText('A real endnote.');
 const html=await page.locator('#source').inputValue();expect(html).toContain(String.raw`\(\frac{\dot{c}}{c}`);expect(html).toContain(String.raw`\int_{0}^{\infty`);expect(html).not.toMatch(/<img|<style|style=|javascript:|WORDMATH|<section|<main/);await expect(page.locator('#pdf-panel')).toBeHidden();await expect(page.locator('#pages,.pdf-controls')).toHaveCount(0);expect(external).toEqual([]);
 const download=page.waitForEvent('download');await page.locator('#download').click();expect((await download).suggestedFilename()).toBe('equations.zip');await writeFile('output/word-equations-sample.html',html);await writeFile('output/word-equations-sample.docx',await wordFixture());
});
test('Word conversion edits and original source persist in browser history',async({page})=>{await upload(page);await expect(page.locator('#status')).toContainText('Done:');await page.locator('#show-source').click();const html=await page.locator('#source').inputValue();await page.locator('#source').fill(html+'<p>Saved edit.</p>');await expect(page.locator('#history-status')).toHaveText('Saved locally.');await page.reload();await page.locator('.open-saved').first().click();await expect(page.locator('#status')).toContainText('Opened saved conversion');await expect(page.locator('#source')).toHaveValue(/Saved edit/);await expect(page.locator('#pdf-panel')).toBeHidden();await page.locator('#convert').click();await expect(page.locator('#status')).toContainText('3 native equations');await expect(page.locator('#source')).not.toHaveValue(/Saved edit/);});
test('unsupported Word math fails explicitly rather than dropping equations',async({page})=>{await upload(page,{unsupported:true});await expect(page.locator('#status')).toContainText('Unsupported Word equation structure');await expect(page.locator('#download')).toBeDisabled();});
test('legacy Word files and embedded equation objects get actionable errors',async({page})=>{await page.goto('/');await page.locator('#file').setInputFiles({name:'old.doc',mimeType:'application/msword',buffer:Buffer.from('old')});await expect(page.locator('#status')).toContainText('save it as .docx');await upload(page,{images:true});await expect(page.locator('#status')).toContainText('legacy embedded objects');await expect(page.locator('#download')).toBeDisabled();});

test('switching from Word to PDF restores the preview and converts all pages without page controls',async({page})=>{
 test.setTimeout(240000);
 await upload(page);await expect(page.locator('#status')).toContainText('Done:');
 const {PDFDocument,StandardFonts}=await import('pdf-lib');const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 for(let n=1;n<=3;n++){const p=pdf.addPage([612,792]);p.drawText('Full document content '+n,{x:60,y:700,font,size:12});}
 await page.locator('#file').setInputFiles({name:'whole.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await page.locator('#convert').click();await expect(page.locator('#status')).toContainText('Done: 3 pages',{timeout:180000});await expect(page.locator('#pdf-panel')).toBeVisible();await expect(page.locator('#pages,.pdf-controls,#pdf-prev,#pdf-next,#pdf-page')).toHaveCount(0);await expect(page.frameLocator('#preview').locator('body')).toContainText('Full document content 3');
});

test('Word pictures retain alt text, survive reopening, and export as ZIP files alongside native math',async({page})=>{
 await upload(page,{picture:true});await expect(page.locator('#status')).toContainText('Done:');
 const img=page.frameLocator('#preview').locator('img');await expect(img).toHaveCount(1);await expect(img).toHaveAttribute('alt','Trade increased by 20 percent.');
 await expect(page.frameLocator('#preview').locator('mjx-container')).toHaveCount(3);
 const html=await page.locator('#source').inputValue();
 const result=await page.evaluate(async html=>{const out=await(await import('/download-zip.mjs')).createDownloadZip(html,'pictures.docx');const zip=await window.JSZip.loadAsync(await out.blob.arrayBuffer());return {html:await zip.file('pictures.html').async('string'),files:Object.keys(zip.files)};},html);
 expect(result.files).toContain('images/figure-001.png');expect(result.html).toContain('src="images/figure-001.png"');expect(result.html).toContain('alt="Trade increased by 20 percent."');expect(result.html).not.toContain('data:image');
 await page.reload();await page.locator('.open-saved').first().click();await expect(page.frameLocator('#preview').locator('img')).toHaveAttribute('alt','Trade increased by 20 percent.');
});
test('Word pictures without alt text warn and unsupported formats do not silently disappear',async({page})=>{
 await page.goto('/');
 for(const options of [{picture:true,pictureAlt:false},{picture:true,pictureType:'image/x-emf'}]){
  const bytes=Array.from(await wordFixture(options));
  const result=await page.evaluate(async bytes=>{try{return await(await import('/word.mjs')).convertWord(new File([new Uint8Array(bytes)],'picture.docx'));}catch(e){return {error:e.message};}},bytes);
  if(options.pictureAlt===false){expect(result.warnings.join(' ')).toContain('no alt text');expect(result.html).toContain('<img');}
  else expect(result.error).toContain('unsupported format');
 }
});
