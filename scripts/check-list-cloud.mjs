import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch();try{
 const page=await browser.newPage();await page.goto(process.env.TEST_URL||'https://pdf-to-html-250215174656.us-central1.run.app');
 const result=await page.evaluate(async()=>{
  const {structuredPdfHtml}=await import('/structured-pdf.mjs?verify='+Date.now());
  const item=(text)=>({type:'text',bbox:[.1,.2,.9,.3],content:[{type:'equation_inline',content:'\\bullet'},{type:'text',content:' '+text}]});
  const output=structuredPdfHtml({schema:'docvortex.middle',pages:[{page_idx:0,blocks:[item('First test item.'),item('Second test item.'),item('Third test item.'),item('Fourth test item.'),{type:'text',content:[{type:'text',content:'Following paragraph.'}]}]}]});
  const doc=new DOMParser().parseFromString(output.html,'text/html');return {html:output.html,items:doc.querySelectorAll('ul > li').length,equations:output.equations,following:doc.body.lastElementChild.textContent};
 });
 if(result.items!==4||result.equations!==0||result.following!=='Following paragraph.'||result.html.includes('\\bullet'))throw Error(JSON.stringify(result));
 await writeFile('output/list-cloud-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
