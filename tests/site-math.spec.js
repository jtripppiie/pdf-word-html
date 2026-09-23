import {test,expect} from '@playwright/test';
test('site-compatible export protects currency without changing inline or display TeX',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {siteMathHtml}=await import('/site-math.mjs');const {renderMath}=await import('/math-preview.mjs');
  const input=String.raw`<p>Costs $40 billion and $20 billion; \(x=\text{\$5}\).</p><p>\[y=\frac{1}{2}\]</p><p>Already escaped: \$3. Double escaped: \\$6.7.</p>`;
  const html=siteMathHtml(input),doc=new DOMParser().parseFromString(html,'text/html');await renderMath(doc);
  return {html,again:siteMathHtml(html),text:doc.body.textContent,math:doc.querySelectorAll('mjx-container').length,errors:doc.querySelectorAll('[data-mml-node="merror"]').length};
 });
 expect(result.html).toContain('Costs <span class="tex2jax_ignore">$</span>40 billion and <span class="tex2jax_ignore">$</span>20 billion');
 expect(result.html).toContain('\\(x=\\text{\\$5}\\)');
 expect(result.again).toBe(result.html);
 expect(result.text).toContain('Costs $40 billion and $20 billion');
 expect(result.text).toContain('Already escaped: $3. Double escaped: $6.7.');
 expect(result.math).toBe(2);expect(result.errors).toBe(0);
});

test('linked currency displays without MathJax and saved escaped currency migrates without changing authored math',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {siteMathHtml}=await import('/site-math.mjs');
  const input=String.raw`<p>In 2002 to <a href="https://example.com/export?price=$5">\$6.7 billion in 2023</a>; \(x=\text{\$5}\), authored $x+1$.</p>`;
  const html=siteMathHtml(input,{escapedOnly:true}),doc=new DOMParser().parseFromString(html,'text/html');
  return {html,text:doc.querySelector('a').textContent,href:doc.querySelector('a').getAttribute('href'),again:siteMathHtml(html,{escapedOnly:true})};
 });
 expect(result.text).toBe('$6.7 billion in 2023');expect(result.href).toBe('https://example.com/export?price=$5');
 expect(result.html).toContain('authored $x+1$');expect(result.html).toContain(String.raw`\(x=\text{\$5}\)`);expect(result.again).toBe(result.html);
});
