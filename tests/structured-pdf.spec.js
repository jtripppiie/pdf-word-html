import {test,expect} from '@playwright/test';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {readFile} from 'node:fs/promises';

test('structured PDF math stays inline or display TeX with continuous paragraphs and endnotes',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {structuredPdfHtml}=await import('/structured-pdf.mjs');
    return structuredPdfHtml({schema:'docvortex.middle',pages:[{page_idx:0,blocks:[
      {type:'header',content:[{type:'text',content:'Running header'}]},
      {type:'paragraph_title',content:[{type:'text',content:'Results'}]},
      {type:'text',bbox:[.1,.2,.9,.3],content:[{type:'text',content:'The return is '},{type:'equation_inline',content:'\\frac{\\alpha B}{1-\\gamma}'},{type:'text',content:' and continues'}]},
    ]},{page_idx:1,blocks:[
      {type:'text',continues_prev:true,content:[{type:'text',content:'on this page.'},{type:'hyperlink',url:'#note-one',content:[{type:'text',content:'1'}]}]},
      {type:'equation',content:'\\frac{\\dot c}{c}=\\sigma(\\alpha z-\\theta-\\delta)\\tag{5.17}',image_base64:'not-an-export'},
      {type:'page_footnote',anchor:'note-one',content:[{type:'text',content:'A note with '},{type:'equation_inline',content:'k^*'}]},
    ]}]});
  });
  await page.setContent(result.html);
  await expect(page.locator('p').first()).toContainText('\\(\\frac{\\alpha B}{1-\\gamma}\\) and continues on this page.');
  await expect(page.locator('p').nth(1)).toContainText('\\[\\frac{\\dot c}{c}');
  await expect(page.locator('h2')).toHaveText(['Results','Notes']);
  await expect(page.locator('#_ftnref1')).toHaveAttribute('href','#_ftn1');
  await expect(page.locator('#_ftn1')).toHaveAttribute('href','#_ftnref1');
  await expect(page.locator('img,section,main,style,meta')).toHaveCount(0);
  expect(result.equations).toBe(3);
  expect(result.reviewMap[0].page).toBe(1);
});

test('structured PDF tables strip executable HTML and missing equations fail explicitly',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {structuredPdfHtml}=await import('/structured-pdf.mjs');
    const data={schema:'docvortex.middle',pages:[{page_idx:0,blocks:[{type:'table_body',content:'<table onclick="alert(1)"><tr><td colspan="2" style="color:red">Value<img src=x onerror="alert(1)"><script>alert(1)</script></td></tr></table>'}]}]};
    const output=structuredPdfHtml(data);
    data.pages[0].blocks=[{type:'equation',content:'',image_base64:'fallback'}];
    try{structuredPdfHtml(data);}catch(e){output.error=e.message;}
    return output;
  });
  expect(result.html).toBe('<table><tbody><tr><td colspan="2">Value</td></tr></tbody></table>');
  expect(result.error).toMatch(/empty equation/);
});

test('portal uses automatic PDF math service, renders it, and reopens saved conversion',async({page})=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica);
  for(let i=0;i<2;i++)pdf.addPage().drawText('A source paragraph for the automatic converter.',{x:50,y:700,font,size:12});
  const result={schema:'docvortex.middle',pages:[{page_idx:0,blocks:[{type:'text',bbox:[.1,.1,.9,.2],content:[{type:'text',content:'The return is '},{type:'equation_inline',content:'\\frac{a}{b}'},{type:'text',content:'.'}]}]},{page_idx:1,blocks:[{type:'equation',content:'\\frac{\\dot c}{c}=\\sigma(\\alpha z-\\theta-\\delta)'}]}]};
  await page.route('**/api/capabilities',r=>r.fulfill({json:{structuredPdf:true}}));
  let uploads=0;
  await page.route('**/api/convert-pdf',async r=>{uploads++;expect(r.request().headers()['content-type']).toBe('application/pdf');expect(r.request().postDataBuffer().subarray(0,5).toString()).toBe('%PDF-');await r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({status:'Recognizing equations…'})+'\n'+JSON.stringify({result})+'\n'});});
  await page.goto('/');
  await page.locator('#file').setInputFiles({name:'automatic.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await expect(page.locator('#pdf-math-options')).toBeHidden();
  await page.locator('#convert').click();
  await expect(page.locator('#status')).toContainText('2 editable equations');
  await expect(page.locator('#equation-review')).toBeHidden();
  await expect(page.frameLocator('#preview').locator('mjx-container')).toHaveCount(2);
  await expect(page.frameLocator('#preview').locator('img')).toHaveCount(0);
  await expect(page.locator('#history-status')).toHaveText('Saved locally.');
  await page.reload();
  await page.locator('.open-saved').first().click();
  await expect(page.frameLocator('#preview').locator('mjx-container')).toHaveCount(2);
  expect(uploads).toBe(1);
});

test('real parser layout preserves linked footnotes, cross-page paragraph and indented quotation',async({page})=>{
  const data=JSON.parse(await readFile('tests/fixtures/baseline-layout.json','utf8'));
  await page.goto('/');
  const result=await page.evaluate(async data=>(await import('/structured-pdf.mjs')).structuredPdfHtml(data),data);
  await page.setContent(result.html);
  await expect(page.locator('a[id^="_ftnref"]')).toHaveCount(6);
  for(let n=1;n<=6;n++)await expect(page.locator(`#_ftnref${n}`)).toHaveAttribute('href',`#_ftn${n}`);
  await expect(page.locator('p').filter({hasText:'Those failures contributed'})).toContainText('security vulnerabilities, as Biden administration');
  await expect(page.locator('blockquote').filter({hasText:'Economic integration didn’t stop China'})).toHaveCount(1);
  await expect(page.locator('#_ftn1').locator('..')).toContainText('1. See Daniel Yergin');
  expect(result.warnings).toEqual([]);
});

test('mathematical notes remain complete and a continued footnote retains its number',async({page})=>{
  const data=JSON.parse(await readFile('tests/fixtures/math-notes-layout.json','utf8'));
  await page.goto('/');
  const result=await page.evaluate(async data=>(await import('/structured-pdf.mjs')).structuredPdfHtml(data),data);
  expect(result.notes).toBe(6);
  await page.setContent(result.html);
  await expect(page.locator('#_ftn4').locator('..')).toContainText('networks (road and rail, electricity and gas distribution, telecommunications) are estimated via indirect methods');
  await expect(page.locator('#_ftn1').locator('..')).toContainText('\\(');
  // This cropped fixture has three detected references; do not invent the others.
  for(const n of [1,3,5])await expect(page.locator(`#_ftnref${n}`)).toHaveAttribute('href',`#_ftn${n}`);
  expect(result.warnings).toContain('Some footnotes have no detected reference in the article.');
});

test('automatic recognition can be cancelled without saving incomplete HTML',async({page})=>{
  const pdf=await PDFDocument.create();pdf.addPage();
  await page.route('**/api/capabilities',r=>r.fulfill({json:{structuredPdf:true}}));
  await page.route('**/api/convert-pdf',async r=>{await new Promise(resolve=>setTimeout(resolve,1000));await r.fulfill({status:500,body:'Stopped test request'}).catch(()=>{});});
  await page.goto('/');
  await page.locator('#file').setInputFiles({name:'cancel.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())});
  await page.locator('#convert').click();
  await page.getByRole('button',{name:'Cancel conversion',exact:true}).click();
  await expect(page.locator('#status')).toHaveText('Conversion cancelled.');
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('.open-saved')).toHaveCount(0);
});


test('starred powers from recognition render without changing genuine nested exponents',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {structuredPdfHtml}=await import('/structured-pdf.mjs');
    const {renderMath}=await import('/math-preview.mjs');
    const result=structuredPdfHtml({schema:'docvortex.middle',pages:[{page_idx:0,blocks:[{type:'equation',content:'A \\bar{k}^{*}^{\\alpha-1}+x^{y^{z}}'}]}]});
    const doc=new DOMParser().parseFromString(result.html,'text/html');await renderMath(doc);
    return {html:result.html,errors:doc.querySelectorAll('[data-mml-node="merror"]').length};
  });
  expect(result.errors).toBe(0);
  expect(result.html).toContain('x^{y^{z}}');
  expect(result.html).toContain('^{* \\alpha-1}');
});

test('recovers native and math bullets, ordered starts and nesting without consuming equations or prose',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {structuredPdfHtml}=await import('/structured-pdf.mjs');
  const block=(content,x=.1,type='text')=>({type,bbox:[x,.1,.9,.2],content});
  const text=s=>({type:'text',content:s}),math=s=>({type:'equation_inline',content:s});
  const data={schema:'docvortex.middle',pages:[{page_idx:0,blocks:[
   block([text('Introduction')],.1,'paragraph_title'),
   block([math('\\bullet'),text(' First item with '),math('x+1'),text(' and a wrapped continuation.')]),
   block([text('• Nested detail')],.15),block([text('• Second item')]),
   block([text('Normal following paragraph.')]),
   block([text('3. Third numbered item')]),block([text('• Nested numbered detail')],.15),block([text('4. Fourth numbered item')]),
   block([text('2023. A year in ordinary prose.')]),block([math('x \\bullet y'),text(' is an actual expression.')]),
   {type:'list',content:[block([text('- Existing list item')])]}
  ]}]};
  const result=structuredPdfHtml(data),doc=new DOMParser().parseFromString(result.html,'text/html');
  return {...result,topBullets:doc.querySelector('body > ul').children.length,nested:doc.querySelectorAll('li > ul').length,ordered:doc.querySelector('ol').getAttribute('start'),orderedItems:doc.querySelector('ol').children.length};
 });
 expect(result.topBullets).toBe(2);expect(result.nested).toBe(2);expect(result.ordered).toBe('3');expect(result.orderedItems).toBe(2);
 expect(result.html).toContain('<li><p>Existing list item</p></li>');
 expect(result.equations).toBe(2);expect(result.html).toContain('\\(x+1\\)');expect(result.html).toContain('\\(x \\bullet y\\)');expect(result.html).not.toContain('\\(\\bullet\\)');expect(result.html).toContain('<p>Normal following paragraph.</p>');expect(result.html).toContain('<p>2023. A year in ordinary prose.</p>');
});

test('PDF images use their own captions, retain visible captions, and fall back without guessing',async({page})=>{
 await page.goto('/');
 const html=await page.evaluate(async()=>{
  const snapshot={src:'data:image/png;base64,AAAA',width:10,height:10};
  return (await import('/structured-pdf.mjs')).structuredPdfHtml({schema:'docvortex.middle',pages:[{page_idx:0,blocks:[
   {type:'chart',content:[{type:'chart_body',snapshot},{type:'chart_caption',content:[{type:'text',content:'Figure 3. Trade growth'}]}]},
   {type:'image',content:[{type:'image_body',snapshot}]}
  ]}]}).html;
 });
 await page.setContent(html);await expect(page.locator('img').nth(0)).toHaveAttribute('alt','Figure 3. Trade growth');await expect(page.locator('img').nth(1)).toHaveAttribute('alt','Figure from PDF page 1');await expect(page.locator('p').filter({hasText:'Figure 3. Trade growth'})).toHaveCount(1);
});
