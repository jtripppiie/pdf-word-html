import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const input=process.argv[2]||'output/mineru/wp26-1.json';
const data=JSON.parse(await readFile(input,'utf8'));
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage();await page.goto(process.env.TEST_URL||'http://127.0.0.1:8081');
  const report=await page.evaluate(async data=>{
    const {structuredPdfHtml}=await import('/structured-pdf.mjs');
    const {renderMath}=await import('/math-preview.mjs');
    const result=structuredPdfHtml(data);
    const doc=new DOMParser().parseFromString(result.html,'text/html');await renderMath(doc);
    const errors=[...doc.querySelectorAll('[data-mml-node="merror"]')].map(n=>n.closest('mjx-container')?.getAttribute('aria-label'));
    return {...result,renderedEquations:doc.querySelectorAll('mjx-container').length,mathErrors:errors,tables:doc.querySelectorAll('table').length,tableRows:doc.querySelectorAll('tr').length,unconvertedMarkers:/needs transcription/.test(result.html),equationImages:doc.querySelectorAll('img').length};
  },data);
  await writeFile(input.replace(/\.json$/,'.html'),report.html);
  delete report.html;
  await writeFile(input.replace(/\.json$/,'.audit.json'),JSON.stringify(report,null,2));
  delete report.reviewMap;console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
