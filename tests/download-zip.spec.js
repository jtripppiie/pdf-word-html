import {test,expect} from '@playwright/test';
test('ZIP contains clean HTML and distinct image files with relative links',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const {createDownloadZip}=await import('/download-zip.mjs');
  const canvas=document.createElement('canvas');canvas.width=4;canvas.height=3;const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,4,3);const image=canvas.toDataURL('image/png');
  const html=String.raw`<p>Return \(x+1\).<a href="#_ftn1" id="_ftnref1">[1]</a></p><p><img src="${image}" alt="Chart from PDF page 1" width="4" height="3"></p><p><img src="${image}" alt="Same chart"></p><h2>Notes</h2><p><a href="#_ftnref1" id="_ftn1">1</a>. Note.</p>`;
  const output=await createDownloadZip(html,'example.pdf'),zip=await window.JSZip.loadAsync(await output.blob.arrayBuffer());
  return {name:output.name,images:output.images,files:Object.keys(zip.files),html:await zip.file('example.html').async('string'),image:await zip.file('images/chart-001.png').async('base64'),original:image.split(',')[1]};
 });
 expect(result.name).toBe('example.zip');expect(result.images).toBe(1);
 expect(result.files).toEqual(expect.arrayContaining(['example.html','images/chart-001.png']));
 expect(result.image).toBe(result.original);
 expect(result.html.match(/src="images\/chart-001.png"/g)).toHaveLength(2);
 expect(result.html).not.toContain('data:image');expect(result.html).not.toContain('<style');
 expect(result.html).toContain('\\(x+1\\)');expect(result.html).toContain('href="#_ftn1"');expect(result.html).toContain('href="#_ftnref1"');
});
