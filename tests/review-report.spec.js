import {test,expect} from '@playwright/test';
import {PDFDocument,StandardFonts} from 'pdf-lib';

const passage=Array.from({length:36},(_,i)=>`word${i}`).join(' ');
async function report(page,pages,html){
 return page.evaluate(async({pages,html})=>(await import('/review-report.mjs')).reviewReport(pages,html),{pages,html});
}
test('finds missing passages, excess repeated paragraphs and broken note destinations',async({page})=>{
 await page.goto('/');
 const missing=Array.from({length:36},(_,i)=>`absent${i}`).join(' ');
 const result=await report(page,[{number:1,text:passage},{number:2,text:missing}],`<p>${passage}</p><p>${passage}</p><a href="#_ftn2">2</a><a id="_ftn1" name="_ftn1">1</a>`);
 expect(result.issues.map(i=>i.kind)).toEqual(['passage','duplicate','link','note']);
 expect(result.issues[0].page).toBe(2);
 expect(result.pages).toMatchObject([{matched:3,checked:3},{matched:0,checked:3}]);
});
test('allows legitimate repetition and named anchors without treating empty source as success',async({page})=>{
 await page.goto('/');
 const result=await report(page,[{number:1,text:passage},{number:2,text:passage},{number:3,text:''}],`<p>${passage}</p><p>${passage}</p><a href="#_ftn1" id="_ftnref1">1</a><a name="_ftn1" href="#_ftnref1">1</a><a href="#">Top</a><a href="#a%20b">Target</a><p id="a b">End</p>`);
 expect(result.issues).toEqual([]);
 expect(result.pages[2]).toEqual({page:3,words:0,checked:0,matched:0});
});
test('ignores script text, reports duplicate IDs, and leaves image text unverified',async({page})=>{
 await page.goto('/');
 const result=await report(page,[{number:1,text:passage}],`<script>${passage}</script><img src="data:image/png;base64,AA=="><a id="same"></a><a id="same"></a>`);
 expect(result.issues.map(i=>i.kind)).toEqual(['passage','link']);
 expect(result.images).toBe(1);
});
test('review updates after editing and reopening without changing HTML or blocking export',async({page})=>{
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),sheet=pdf.addPage();
 for(let i=0;i<3;i++)sheet.drawText(passage.split(' ').slice(i*12,(i+1)*12).join(' '),{x:40,y:720-i*24,size:10,font});
 await page.goto('/');
 await page.locator('#file').setInputFiles({name:'review.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
 await page.locator('#convert').click();
 await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/);
 await expect(page.locator('#review-summary')).toContainText('Automatic review:');
 await page.locator('#show-source').click();
 const original=await page.locator('#source').inputValue();
 const edited=original+'<a href="#missing-note">Review test</a>';
 await page.locator('#source').fill(edited);
 await expect(page.locator('#review-summary')).toContainText('items to inspect');
 await page.locator('#show-check').click();
 await expect(page.locator('#review-issues')).toContainText('Link has no destination: #missing-note');
 await expect(page.locator('#download')).toBeEnabled();
 await page.locator('#show-source').click();await expect(page.locator('#source')).toHaveValue(edited);
 await expect(page.locator('#history-status')).toHaveText('Saved locally.');
 await page.reload();await page.locator('.open-saved').first().click();
 await expect(page.locator('#review-summary')).toContainText('items to inspect');
 await page.locator('#show-source').click();await expect(page.locator('#source')).toHaveValue(edited);
 await page.locator('#source').fill(original);
 await page.locator('#show-check').click();await expect(page.locator('#review-issues')).not.toContainText('missing-note');
 const download=page.waitForEvent('download');await page.locator('#download').click();expect((await download).suggestedFilename()).toMatch(/\.zip$/);
});

test('a review failure cannot prevent conversion or ZIP download',async({page})=>{
 await page.route('**/review-report.mjs',route=>route.fulfill({contentType:'text/javascript',body:'export function reviewReport(){throw new Error("Review unavailable");}'}));
 const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
 pdf.addPage().drawText('A document that can still be downloaded.',{x:40,y:700,size:12,font});
 await page.goto('/');
 await page.locator('#file').setInputFiles({name:'fallback.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
 await page.locator('#convert').click();await expect(page.locator('#status')).toContainText(/Done:|Conversion complete;/);
 await expect(page.locator('#review-summary')).toContainText('Automatic review could not finish');
 const download=page.waitForEvent('download');await page.locator('#download').click();expect((await download).suggestedFilename()).toBe('fallback.zip');
});
