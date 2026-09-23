import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const html=await readFile(process.argv[2]||'output/wp26-1-final.html','utf8');
const browser=await chromium.launch();
try{
 const page=await browser.newPage();await page.setContent(html);
 await page.addScriptTag({type:'text/x-mathjax-config',content:String.raw`MathJax.Hub.Config({tex2jax:{inlineMath:[['$','$'],['\\(','\\)']],processEscapes:true,ignoreClass:'tex2jax_ignore'},showProcessingMessages:false,messageStyle:'none'});`});
 await page.addScriptTag({url:'https://cdnjs.cloudflare.com/ajax/libs/mathjax/2.7.0/MathJax.js?config=TeX-AMS-MML_HTMLorMML'});
 await page.evaluate(()=>new Promise(resolve=>MathJax.Hub.Queue(resolve)));
 const report=await page.evaluate(()=>({version:MathJax.version,equations:MathJax.Hub.getAllJax().length,errors:[...document.querySelectorAll('.MathJax_Error,.merror')].map(n=>n.textContent),unexpectedMath:MathJax.Hub.getAllJax().filter(j=>!j.originalText.includes('\\')&&/\$|billion|million|per year|,000/.test(j.originalText)).map(j=>j.originalText)}));
 await writeFile('output/site-mathjax-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
