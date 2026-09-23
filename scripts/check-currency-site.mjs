import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch();try{
 const page=await browser.newPage();await page.goto(process.env.TEST_URL||'http://localhost:8081');
 const html=await page.evaluate(async()=>{const {siteMathHtml}=await import('/site-math.mjs');return siteMathHtml(String.raw`<p>In 2002 to <a href="https://example.com/exports">$6.7 billion in 2023</a>, compared with $5 billion. Already escaped: \$3.</p><p>\(x=\text{\$5}\)</p><p>\[y=\frac{1}{2}\]</p>`);});
 await page.goto('about:blank');await page.setContent(html);
 if(await page.locator('a').textContent()!=='$6.7 billion in 2023')throw Error('Currency failed before MathJax');
 await page.addScriptTag({type:'text/x-mathjax-config',content:String.raw`MathJax.Hub.Config({tex2jax:{inlineMath:[['$','$'],['\\(','\\)']],processEscapes:true,ignoreClass:'tex2jax_ignore'},showProcessingMessages:false,messageStyle:'none'});`});
 await page.addScriptTag({url:'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.0/MathJax.js?config=TeX-AMS-MML_HTMLorMML'});
 await page.evaluate(()=>new Promise(resolve=>MathJax.Hub.Queue(resolve)));
 const result=await page.evaluate(()=>({version:MathJax.version,equations:MathJax.Hub.getAllJax().length,errors:document.querySelectorAll('.MathJax_Error,.merror').length,link:document.querySelector('a').textContent,prose:document.querySelector('p').textContent}));
 if(result.equations!==2||result.errors||result.link!=='$6.7 billion in 2023'||result.prose.includes('\\$'))throw Error(JSON.stringify(result));
 await writeFile('output/currency-site-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
