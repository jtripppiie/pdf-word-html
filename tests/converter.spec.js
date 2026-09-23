import {test,expect} from '@playwright/test';
// Exercise focused extraction cases through the module API; the portal has no range controls.
async function setTestRange(page,range){await page.evaluate(async range=>{const {convertDocument}=await import('/app.mjs');document.getElementById('convert').onclick=()=>convertDocument(range);},range);}
const noteSelector = 'p:has(> a[name^="_ftn"]:not([name^="_ftnref"]))';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {mkdir,writeFile} from 'node:fs/promises';
async function fixture(pageCount=1){const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);const page=pdf.addPage([612,792]);page.drawText('A sentence with a note',{x:60,y:710,size:12,font});page.drawText('1',{x:187,y:714,size:8,font});page.drawText('and a wrapped paragraph.',{x:60,y:694,size:12,font});page.drawText('1',{x:60,y:114,size:7,font});page.drawText('A footnote with <script> text.',{x:68,y:110,size:10,font});if(pageCount>1){const second=pdf.addPage([612,792]);second.drawText('Second original page',{x:60,y:710,size:12,font});}return Buffer.from(await pdf.save());}
test('joins wrapped lines, escapes markup, links footnotes, and downloads HTML',async({page})=>{
 await page.goto('/');await page.locator('#file').setInputFiles({name:'sample.pdf',mimeType:'application/pdf',buffer:await fixture()});await page.locator('#convert').click();await expect(page.locator('#status')).toContainText('1 linked.');const frame=page.frameLocator('#preview');await expect(frame.locator('body > p').filter({hasNot:frame.locator('a[name^="_ftn"]:not([name^="_ftnref"])')})).toHaveCount(1);await expect(frame.locator('[role=doc-noteref]')).toHaveAttribute('href','#_ftn1');await expect(frame.locator(noteSelector)).toContainText('A footnote with <script> text.');await expect(frame.locator('script')).toHaveCount(0);const download=page.waitForEvent('download');await page.locator('#download').click();expect((await download).suggestedFilename()).toBe('sample.zip');await page.locator('#show-source').click();await expect(page.locator('#source')).toBeVisible();await page.locator('#source').fill('<!doctype html><html><body><p>Edited text</p></body></html>');await page.locator('#show-preview').click();await expect(frame.locator('p')).toHaveText('Edited text');
});
test('handles bad files and invalid ranges without stale downloads',async({page})=>{await page.goto('/');await page.locator('#file').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('not a PDF')});await page.locator('#convert').click();await expect(page.locator('#status')).toHaveClass('error');await expect(page.locator('#download')).toBeDisabled();await page.locator('#file').setInputFiles({name:'sample.pdf',mimeType:'application/pdf',buffer:await fixture()});await setTestRange(page,'2-9');await page.locator('#convert').click();await expect(page.locator('#status')).toContainText('between 1 and 1');});
test('converts the supplied 50-page paper with all 51 linked footnotes',async({page})=>{
 test.setTimeout(60000);const requests=[];const errors=[];page.on('request',r=>{if(r.method()!=='GET')requests.push(r.url());});page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await page.locator('#file').setInputFiles('wp25-4.pdf');await page.locator('#convert').click();await expect(page.locator('#status')).toContainText('51 footnotes detected, 51 linked.',{timeout:45000});const frame=page.frameLocator('#preview');await expect(frame.locator(noteSelector)).toHaveCount(51);await expect(frame.locator('[role=doc-noteref]')).toHaveCount(51);await expect(frame.locator('ul > li').filter({hasText:'Increase labor utilization'})).toHaveCount(1);
 await expect(frame.locator('section,main')).toHaveCount(0);
 await expect(frame.locator('h2').filter({hasText:/^Notes$/})).toHaveCount(1);
 await expect(frame.locator('h2').filter({hasText:'I Introduction'})).toHaveCount(1);
 await expect(frame.locator('h1,h3,h4,h5,h6')).toHaveCount(0);
 await expect(frame.locator('body > :last-child > a')).toHaveAttribute('name','_ftn51');
 await expect(frame.locator('#_ftnref1')).toHaveText('[1]');
 await expect(frame.locator('#_ftn1')).toHaveAttribute('name','_ftn1');
 await expect(frame.locator('#_ftn1')).toHaveAttribute('href','#_ftnref1');
 await frame.locator('#_ftnref1').click();
 await expect(frame.locator(':target')).toHaveAttribute('id','_ftn1');
 await frame.locator('#_ftn1').click();
 await expect(frame.locator(':target')).toHaveAttribute('id','_ftnref1');
await expect(frame.locator(noteSelector).filter({has:frame.locator('#_ftn24')})).toContainText('ingenuity knowing no bounds');await expect(frame.locator('body > p').filter({hasNot:frame.locator('a[name^="_ftn"]:not([name^="_ftnref"])')}).filter({hasText:/^The world and especially advanced economies/})).toContainText('and Europe.');expect(requests).toEqual([]);expect(errors).toEqual([]);await page.locator('#show-source').click();const html=await page.locator('#source').inputValue();await mkdir('output',{recursive:true});await writeFile('output/wp25-4.html',html);await page.locator('#show-preview').click();await expect(frame.locator('h2').first()).toBeVisible();expect(await frame.locator('body').evaluate(body=>[...body.querySelectorAll('a[href^="#"]')].every(a=>body.querySelector(a.getAttribute('href'))))).toBe(true);await page.screenshot({path:'output/desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'output/mobile.png',fullPage:true});
});

test('removes working-paper running labels while preserving body citations', async ({page}) => {
 const pdf=await PDFDocument.create();const font=await pdf.embedFont(StandardFonts.Helvetica);
 for(let n=1;n<=2;n++) {
   const sheet=pdf.addPage([612,792]);
   sheet.drawText(`WP 25-11 | MAY 2025 ${n}`,{x:60,y:760,size:9,font});
   sheet.drawText('WP 25-11',{x:60,y:30,size:9,font});
   sheet.drawText('| MAY 2025',{x:160,y:30,size:9,font});
   sheet.drawText(String(n),{x:540,y:30,size:9,font});
   sheet.drawText('Body text remains in the output.',{x:60,y:650,size:12,font});
   sheet.drawText('WP 25-11 | MAY 2025 7',{x:60,y:450,size:12,font});
 }
 await page.goto('/');
 await page.locator('#file').setInputFiles({name:'running-labels.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
 await page.locator('#convert').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/);
 const frame=page.frameLocator('#preview');
 await expect(frame.locator('p')).toHaveCount(4);
 await expect(frame.locator('p').filter({hasText:/^WP 25-11 \| MAY 2025 7$/})).toHaveCount(2);
 await expect(frame.locator('p').filter({hasText:'Body text remains'})).toHaveCount(2);
});

test('wp25-11 baseline: clean headings, paragraphs, and all 71 endnotes', async ({page}) => {
 test.setTimeout(60000);
 await page.goto('/');await page.locator('#file').setInputFiles('wp25-11.pdf');
 await page.locator('#convert').click();await expect(page.locator('#status')).toContainText('71 footnotes detected, 71 linked.',{timeout:45000});
 const frame=page.frameLocator('#preview');
 await expect(frame.locator(noteSelector)).toHaveCount(71);
 await expect(frame.locator('[role=doc-noteref]')).toHaveCount(71);
 for(const heading of ['1. INTRODUCTION','2. A SIMPLE ECONOMIC FRAMEWORK','3. FEARS OVER EXPORT RESTRICTIONS','4. DISCIPLINES IN THE GATT/WTO AND ELSEWHERE','5. THINKING AHEAD','Notes']) {
   await expect(frame.locator('h2').filter({hasText:new RegExp('^'+heading.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})).toHaveCount(1);
 }
 await expect(frame.locator('h2').filter({hasText:'How Export Restrictions'})).toHaveCount(1);
 await expect(frame.locator('p').filter({hasText:/^The world trading system/})).toHaveText('The world trading system is experiencing a period of upheaval. Unchecked use of industrial policy and tariffs in the name of economic and national security is putting strain on international cooperation even among like-minded countries with common fears about their economic vulnerabilities.');
 const quote = frame.locator('blockquote').filter({hasText:'Economic integration didn’t stop China'});
 await expect(quote).toHaveCount(1);
 await expect(quote.locator('p')).toHaveCount(1);
 await expect(quote).toContainText('exploited for economic or geopolitical leverage.');
 await expect(quote).not.toContainText('Today, achieving');
 await expect(frame.locator('body > p').filter({hasText:/^Today, achieving/})).toHaveCount(1);
 const australia = frame.locator('p').filter({hasText:'stronger desire to keep an Australian mine open'});
 await expect(australia).toHaveCount(1);
 await expect(australia).toContainText('the government of Australia itself?');
 await expect(australia).toContainText('countries to agree on, let alone coordinate, industrial policy.');
 const continued = frame.locator('p').filter({hasText:'Those failures contributed'});
 await expect(continued).toHaveCount(1);
 await expect(continued).toContainText('security vulnerabilities, as Biden administration National Security Advisor Jake Sullivan noted');
 await expect(continued.locator('#_ftnref4')).toHaveCount(1);
 await expect(continued.locator('#_ftnref5')).toHaveCount(1);
 await expect(frame.locator(noteSelector).filter({has:frame.locator('#_ftn38')})).toContainText('Announcement No. 23 of 2023');
 await expect(frame.locator(noteSelector).filter({has:frame.locator('#_ftn38')})).toContainText('4 April 2025');
 await expect(frame.locator('body > :last-child > a')).toHaveAttribute('name','_ftn71');
 await frame.locator('#_ftnref71').click();await expect(frame.locator(':target')).toHaveAttribute('id','_ftn71');
 await frame.locator('#_ftn71').click();await expect(frame.locator(':target')).toHaveAttribute('id','_ftnref71');
 await page.locator('#show-source').click();const html=await page.locator('#source').inputValue();
 expect(html).not.toMatch(/<\/?(?:section|main|html|head|body|style|meta)(?:\s|>)/i);
 expect(html).not.toContain('role="doc-footnote"');expect(html).not.toContain('WP 25-11');expect(html).not.toContain('WORKING PAPER');
 await mkdir('output',{recursive:true});await writeFile('output/wp25-11.html',html);
});

test('page continuation respects gaps, headings, indents, and completed paragraphs', async () => {
 const {documentHtml} = await import('../public/extract.mjs');
 const makePage = (text, options={}) => ({notes:[],bodySize:12,leftMargin:60,height:800,paragraphs:[{text,fragments:[{text,superscript:false}],heading:false,x:60,size:12,startY:80,endY:700,...options}]});
 const a=makePage('This continues,');const b=makePage('on the next page.');
 expect(documentHtml([a,b]).html).toBe('<p>This continues, on the next page.</p>');
 expect(documentHtml([makePage('the government of'),makePage('Australia itself?')]).html).toBe('<p>the government of Australia itself?</p>');
 for(const pages of [[a,makePage('A heading',{heading:true})],[a,makePage('An indented paragraph',{x:80})],[makePage('A complete sentence.'),b],[a,{...b,paragraphs:[]},b]]) {
   expect(documentHtml(pages).html.match(/<(?:p|h2)>/g)).toHaveLength(2);
 }
 expect(documentHtml([a,b],[2,4]).html.match(/<p>/g)).toHaveLength(2);
});

test('saves multiple PDFs locally, restores edits and originals, and flags text changes', async ({page}) => {
 await page.goto('/');
 for(const name of ['alpha.pdf','beta.pdf']) {
  await page.locator('#file').setInputFiles({name,mimeType:'application/pdf',buffer:await fixture(name==='beta.pdf'?2:1)});
  await page.locator('#convert').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/);
  await expect(page.locator('#history-status')).toHaveText('Saved locally.');
  expect(await page.locator('#pdf-canvas').evaluate(canvas=>canvas.width)).toBeGreaterThan(0);
  if(name==='beta.pdf'){
   const first=await page.locator('#pdf-canvas').evaluate(canvas=>canvas.toDataURL());
   await page.locator('#pdf-scroll').evaluate(c=>c.scrollTop=c.querySelector('[data-page="2"]').offsetTop);await expect(page.locator('#pdf-scroll')).toHaveAttribute('data-current-page','2');
   await expect.poll(()=>page.locator('#pdf-canvas').evaluate(canvas=>canvas.toDataURL())).not.toBe(first);
  }
  if(name==='alpha.pdf') {
   await page.locator('#show-source').click();const original=await page.locator('#source').inputValue();
   await page.locator('#source').fill(original.replace('A sentence with a note','A with a note')+'\n<p>Unique editorial addition.</p>');
   await expect(page.locator('#history-status')).toHaveText('Saved locally.');
  }
 }
 await expect(page.locator('.open-saved')).toHaveCount(2);
 await page.reload();await expect(page.locator('.open-saved')).toHaveCount(2);
 await page.locator('.open-saved').filter({hasText:'alpha.pdf'}).click();
 await expect(page.locator('#convert')).toBeEnabled();
 await expect(page.locator('#file-label')).toHaveText('alpha.pdf');
 await expect(page.frameLocator('#preview').locator('p').filter({hasText:'Unique editorial addition.'})).toHaveCount(1);
 expect(await page.locator('#pdf-canvas').evaluate(canvas=>canvas.width)).toBeGreaterThan(0);
 await page.locator('#show-check').click();
 await expect(page.locator('#missing-words')).toContainText('sentence × 1');
 await expect(page.locator('#added-words')).toContainText('editorial × 1');
 await page.locator('#missing-words li').filter({hasText:'sentence × 1'}).getByRole('button').click();
 await expect(page.locator('#review')).toBeVisible();await expect(page.locator('#pdf-scroll')).toHaveAttribute('data-current-page','1');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Delete saved conversion beta.pdf',exact:true}).click();
 await expect(page.locator('.open-saved')).toHaveCount(1);await page.reload();await expect(page.locator('.open-saved')).toHaveCount(1);
});

test('local storage failures do not prevent conversion or downloads', async ({page}) => {
 await page.addInitScript(()=>{indexedDB.open=()=>{throw new Error('Storage unavailable');};});
 await page.goto('/');await page.locator('#file').setInputFiles({name:'sample.pdf',mimeType:'application/pdf',buffer:await fixture()});
 await page.locator('#convert').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/);
 await expect(page.locator('#history-status')).toContainText('Could not save');await expect(page.locator('#download')).toBeEnabled();
});

test('scrolls PDF and HTML together and allows independent scrolling', async ({page}) => {
 test.setTimeout(60000);
 await page.goto('/');await page.locator('#file').setInputFiles('wp25-11.pdf');await page.locator('#convert').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/);
 const frame=page.frameLocator('#preview');
 await page.locator('#pdf-scroll').evaluate(c=>c.scrollTop=c.querySelector('[data-page="4"]').offsetTop);
 await expect.poll(()=>frame.locator('body').evaluate(()=>scrollY)).toBeGreaterThan(1000);
 await page.waitForTimeout(160);
 await frame.locator('h2').filter({hasText:'5. THINKING AHEAD'}).evaluate(element=>element.scrollIntoView());
 await expect(page.locator('#pdf-scroll')).toHaveAttribute('data-current-page','19');
 await page.locator('#sync-scroll').uncheck();
 await frame.locator('h2').filter({hasText:'1. INTRODUCTION'}).evaluate(element=>element.scrollIntoView());await page.waitForTimeout(200);
 await expect(page.locator('#pdf-scroll')).toHaveAttribute('data-current-page','19');
 await page.locator('#sync-scroll').check();await page.waitForTimeout(160);
 const before=await frame.locator('body').evaluate(()=>scrollY);
 await page.locator('#pdf-scroll').evaluate(container=>{container.scrollTop=container.querySelector('[data-page="8"]').offsetTop;});
 await expect(page.locator('#pdf-scroll')).toHaveAttribute('data-current-page','8');
 await expect.poll(()=>frame.locator('body').evaluate(()=>scrollY)).toBeLessThan(before);
 // Older history entries have raw page text but no precise coordinate map.
 await page.evaluate(async()=>{const {listConversions,readConversion,saveConversion}=await import('/history.mjs');const list=await listConversions();const record=await readConversion(list[0].id);delete record.reviewMap;await saveConversion(record);});
 await page.reload();await page.locator('.open-saved').filter({hasText:'wp25-11.pdf'}).click();await expect(page.locator('#convert')).toBeEnabled();await page.waitForTimeout(160);
 await frame.locator('h2').filter({hasText:'5. THINKING AHEAD'}).evaluate(element=>element.scrollIntoView());await expect(page.locator('#pdf-scroll')).toHaveAttribute('data-current-page','19');
});

test('exports nested bullets and numbered lists without splitting wrapped items', async ({page})=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),sheet=pdf.addPage([612,792]);
 const text=(s,x,y,size=12)=>sheet.drawText(s,{x,y,size,font});
 text('List examples',60,740);text('• First item',78,700);text('1',145,704,8);text('continues on the next line.',90,684);
 text('• Nested item',96,660);text('• Another nested item',96,640);text('• Second top-level item',78,616);
 text('A paragraph outside the list.',60,585);
 text('3. Third step',60,552);text('continued explanation.',78,536);text('4. Fourth step',60,514);
 text('Another ordinary paragraph.',60,482);text('a) Alpha item',78,448);text('b) Beta item',78,426);
 text('1',60,114,7);text('A note inside a list.',68,110,10);
 await page.goto('/');await page.locator('#file').setInputFiles({name:'lists.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});await page.locator('#convert').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/);
 const frame=page.frameLocator('#preview');await expect(frame.locator('body > ul > li')).toHaveCount(2);await expect(frame.locator('body > ul > li > ul > li')).toHaveCount(2);
 await expect(frame.locator('body > ul > li').first()).toContainText('continues on the next line.');await expect(frame.locator('body > ul > li').first().locator('#_ftnref1')).toHaveCount(1);
 await expect(frame.locator('ol[start="3"] > li')).toHaveCount(2);await expect(frame.locator('ol[start="3"] > li').first()).toHaveText('Third step continued explanation.');await expect(frame.locator('ol[type="a"] > li')).toHaveCount(2);
 await expect(frame.locator('body > p').filter({hasText:'A paragraph outside the list.'})).toHaveCount(1);
 expect(await frame.locator('li').allTextContents()).not.toContain('• First');
});

test('renders reviewed wp26-1 equations without images and preserves editable MathJax',async({page,baseURL})=>{
 const external=[];page.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!==new URL(baseURL).origin)external.push(request.url());});
 await page.goto('/');await page.locator('#recognize-math').uncheck();await page.locator('#file').setInputFiles('wp26-1.pdf');await setTestRange(page,'26');await page.locator('#convert').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/);
 const frame=page.frameLocator('#preview');await expect(frame.locator('p[align="center"] > mjx-container')).toHaveCount(3);await expect(frame.locator('.math-needs-review')).toHaveCount(0);await expect(page.locator('#math-status')).toContainText('reviewed correction');
 await expect(frame.locator('img')).toHaveCount(0);
 const original=await page.locator('#source').inputValue();expect(original).not.toContain('<blockquote><p>𝑐𝑐');expect(original).not.toContain('data:image');
 await page.locator('#show-source').click();
 const tex=String.raw`<p>The consumption Euler equation for the market setting is</p>
<p>\[\frac{\dot{c}}{c}=\sigma(\alpha z-\theta-\delta).\tag{5.17}\]</p>
<p>The appendix derives equation (5.17). It also shows that the dynamics of the average product of capital, \(z\), follow</p>
<p>\[\frac{\dot{z}}{z}=(1-\alpha)\left(\frac{B}{\alpha}-z\right),\]</p>
<p>rather than equation (5.15).</p>`;
 await page.locator('#source').fill(tex);await page.locator('#show-preview').click();await expect(frame.locator('mjx-container')).toHaveCount(3);await expect(frame.locator('[data-mml-node="mfrac"]')).toHaveCount(3);await expect(frame.locator('[data-mml-node="merror"]')).toHaveCount(0);
 await page.locator('#preview').screenshot({path:'output/mathjax-equations.png'});
 expect(await page.locator('#source').inputValue()).toBe(tex);expect(external).toEqual([]);
 await expect(page.locator('#history-status')).toHaveText('Saved locally.');await page.reload();await page.locator('.open-saved').first().click();await expect(page.frameLocator('#preview').locator('mjx-container')).toHaveCount(3);
});


test('renders the complete reviewed VAT integral and inline math without images',async({page})=>{
 await page.goto('/');await page.locator('#recognize-math').uncheck();await page.locator('#file').setInputFiles('wp26-1.pdf');await setTestRange(page,'21');await page.locator('#convert').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/);
 const frame=page.frameLocator('#preview'),paragraph=frame.locator('p').filter({hasText:'If there is a desired terminal'});
 await expect(paragraph).toHaveCount(1);await expect(paragraph.locator('mjx-container')).toHaveCount(3);
 await expect(paragraph).toContainText('then the desired initial VAT');
 const equation=paragraph.locator('xpath=following-sibling::p[1]');await expect(equation.locator('mjx-container')).toHaveCount(1);
 await equation.screenshot({path:'output/vat-integral.png'});await paragraph.screenshot({path:'output/vat-inline.png'});
 await expect(frame.locator('p').filter({hasText:/^∞$|^0 1 −/})).toHaveCount(0);
 const source=await page.locator('#source').inputValue();expect(source).not.toContain('𝑃𝑃�exp');expect(source).not.toContain('𝜏𝜏̅');
 expect(source).not.toContain('<img');
 await expect(frame.locator('p').filter({hasText:'In the case we have analyzed'})).toHaveCount(1);
});

test('centers display formulas independently of right-hand equation numbers',async({page})=>{
 await page.goto('/');await page.locator('#recognize-math').uncheck();await page.locator('#file').setInputFiles('wp26-1.pdf');await setTestRange(page,'27-28');await page.locator('#convert').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/);
 const frame=page.frameLocator('#preview');const numbered=frame.locator('#math-p28-2');
 const centered=frame.locator('p[align="center"] > .math-needs-review, p[align="center"] > mjx-container');expect(await centered.count()).toBeGreaterThan(5);
 const target=centered.last();
 const geometry=await target.evaluate(element=>{const box=element.getBoundingClientRect(),p=element.parentElement.getBoundingClientRect();return {imageCenter:box.x+box.width/2,paragraphCenter:p.x+p.width/2};});expect(Math.abs(geometry.imageCenter-geometry.paragraphCenter)).toBeLessThan(1);
 const html=await page.locator('#source').inputValue();expect(html).toContain('<p align="center"><span');expect(html).not.toMatch(/<style|style=|<img/);
 const leftAligned=await page.evaluate(async()=>{const {equationAlignment}=await import('/equations.mjs');return equationAlignment([{text:'x = y',x:72,width:100}],[72,540],12).centered;});expect(leftAligned).toBe(false);
});

test('experimental local OCR retains draft TeX alongside reviewed corrections, never images',async({page,baseURL})=>{
 test.setTimeout(120000);const external=[];page.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!==new URL(baseURL).origin)external.push(request.url());});
 await page.goto('/');await expect(page.locator('#recognize-math')).not.toBeChecked();await page.locator('#recognize-math').check();await page.locator('#file').setInputFiles('wp26-1.pdf');await setTestRange(page,'26');await page.locator('#convert').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/,{timeout:100000});
 const html=await page.locator('#source').inputValue();expect(html).not.toMatch(/<img|data:image/);expect(html.replace(/\s/g,'')).toContain(String.raw`\frac{\dot{z}}{z}=(1-\alpha)\left(\frac{B}{\alpha}-z\right)`);
 await expect(page.locator('#math-status')).toContainText('draft TeX');await expect(page.locator('#math-status')).toContainText('reviewed correction');expect(external).toEqual([]);
 await expect(page.frameLocator('#preview').locator('mjx-container').first()).toBeVisible();await expect(page.frameLocator('#preview').locator('img')).toHaveCount(0);
});

test('reopening a saved conversion removes legacy equation images and preserves prose and TeX',async({page})=>{
 await page.goto('/');await page.locator('#file').setInputFiles('wp26-1.pdf');await setTestRange(page,'26');await page.locator('#convert').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/);await expect(page.locator('#history-status')).toHaveText('Saved locally.');
 await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('pdf-html-conversions',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});await new Promise((resolve,reject)=>{const tx=db.transaction('conversions','readwrite'),store=tx.objectStore('conversions'),request=store.getAll();request.onsuccess=()=>{const r=request.result[0];r.html='<p>Keep this text.</p><p align="center"><img src="data:image/png;base64,AAAA" alt="Equation 5.17 from PDF page 26; preserved as an image."></p><p>\\(x+1\\)</p>';store.put(r);};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();});
 await page.reload();await page.locator('.open-saved').first().click();await expect(page.locator('#math-status')).toContainText('Legacy equation images removed');const html=await page.locator('#source').inputValue();expect(html).not.toContain('<img');expect(html).toContain('Keep this text.');expect(html).toContain(String.raw`\(x+1\)`);expect(html).toContain('needs transcription');
});

test('stopping local recognition finishes the PDF with explicit no-image math markers',async({page})=>{
 test.setTimeout(45000);await page.goto('/');await page.locator('#recognize-math').check();await page.locator('#file').setInputFiles('wp26-1.pdf');await setTestRange(page,'26-28');await page.locator('#convert').click();
 await expect(page.locator('#status')).toContainText('Loading local equation model',{timeout:15000});await page.locator('#stop-math').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/,{timeout:20000});
 const html=await page.locator('#source').inputValue();expect(html).not.toMatch(/<img|data:image/);expect(html).toContain('needs transcription');await expect(page.locator('#convert')).toBeEnabled();await expect(page.locator('#stop-math')).toBeHidden();
});

test('page 32 reviewed equation is editable MathJax and remaining math has a draft review workflow',async({page})=>{
 await page.goto('/');await page.locator('#file').setInputFiles('wp26-1.pdf');await setTestRange(page,'32');await page.locator('#convert').click();await expect(page.locator('#status')).toContainText('Conversion complete;');
 const source=await page.locator('#source').inputValue();expect(source).toContain(String.raw`\underbrace`);expect(source).toContain('deviation from planner steady state');expect(source).not.toContain('id="math-p32-21"');expect(source).not.toContain('<img');
 const frame=page.frameLocator('#preview');await expect(frame.locator('mjx-container')).toHaveCount(1);await expect(frame.locator('[data-mml-node="merror"]')).toHaveCount(0);
 await expect(page.locator('#download')).toHaveText('Download draft ZIP');await page.locator('#equation-review-summary').click();
 const id=await page.locator('#equation-choice').inputValue();await page.locator('#equation-apply').click();await expect(page.locator('#equation-message')).toContainText('Enter the equation');
 await page.locator('#equation-tex').fill(String.raw`\tau`);await page.locator('#equation-apply').click();await expect(page.locator('#equation-message')).toHaveText('Equation applied and saved.');expect(await page.locator('#source').inputValue()).not.toContain(`id="${id}"`);
 await page.reload();await page.locator('.open-saved').first().click();await expect(page.locator('#source')).toHaveValue(/deviation from planner steady state/);
 const guarded=await page.evaluate(async()=>{const {applyReviewedEquations}=await import('/math-review.mjs');const record={pdf:new Blob(['different PDF']),html:'<span id="x" class="math-needs-review">needs transcription</span>',mathReview:[{id:'x',page:32,display:true,sourceText:'test'}]};return {applied:await applyReviewedEquations(record),html:record.html};});expect(guarded.applied).toBe(0);expect(guarded.html).toContain('needs transcription');
});

test('repairs reported passages on pages 21 and 26–27, including existing saved drafts',async({page})=>{
 await page.goto('/');await page.locator('#file').setInputFiles('wp26-1.pdf');await setTestRange(page,'21,26-27');await page.locator('#convert').click();await expect(page.locator('#status')).toContainText('Done:');
 const check=async()=>{
  const html=await page.locator('#source').inputValue();expect(html).not.toContain('needs transcription');expect(html).not.toContain('<img');
  expect(html).toContain(String.raw`capital is \(\frac{\alpha Ak^{\alpha-1}-(\gamma r^*+\theta)}{1-\gamma}\). In the competitive market model`);
  expect(html).toContain(String.raw`If \(\nu\) is the shadow price of \(k\) and \(\mu\) is the shadow price`);
  expect(html).toContain(String.raw`\nu(1-\alpha)A\omega^\alpha u^{-\alpha}=\mu(1-\gamma)B`);
  expect(html).toContain(String.raw`\nu(1-\alpha)A\omega^\alpha u^{-\alpha}=\mu B`);
  await expect(page.frameLocator('#preview').locator('mjx-container').first()).toBeVisible();await expect(page.frameLocator('#preview').locator('[data-mml-node="merror"]')).toHaveCount(0);
 };await check();
 await page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('pdf-html-conversions',1);r.onsuccess=()=>resolve(r.result);});
  const record=await new Promise(resolve=>{const r=db.transaction('conversions').objectStore('conversions').getAll();r.onsuccess=()=>resolve(r.result[0]);});
  const lib=await import('/vendor/pdf.mjs'),{extractPage,documentHtml}=await import('/extract.mjs'),{markPageEquations}=await import('/equations.mjs');
  const pdf=await lib.getDocument({data:new Uint8Array(await record.pdf.arrayBuffer()),standardFontDataUrl:'/vendor/standard_fonts/'}).promise,extracted=[];record.mathReview=[];
  for(const n of [21,26,27]){const p=await pdf.getPage(n),t=await p.getTextContent(),x=extractPage(t.items,p.getViewport({scale:1}),lib.Util.transform);record.mathReview.push(...markPageEquations(x,n));extracted.push(x);}
  record.html=documentHtml(extracted,[21,26,27]).html;await pdf.cleanup();
  await new Promise(resolve=>{const tx=db.transaction('conversions','readwrite');tx.objectStore('conversions').put(record);tx.oncomplete=resolve;});db.close();
 });
 await page.reload();await page.locator('.open-saved').first().click();await expect(page.locator('#status')).toContainText('Opened saved conversion');await check();await expect(page.locator('#history-status')).toHaveText('Saved locally.');
});
