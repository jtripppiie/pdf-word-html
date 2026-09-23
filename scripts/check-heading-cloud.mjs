import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch();try{
 const page=await browser.newPage();await page.goto(process.env.TEST_URL||'https://pdf-to-html-250215174656.us-central1.run.app');
 await page.locator('#file').setInputFiles('output/heading-smoke.pdf');await page.locator('#convert').click();
 await page.waitForFunction(()=>!document.getElementById('convert').disabled,{},{timeout:300000});
 const status=await page.locator('#status').textContent();if(!status.startsWith('Done:'))throw Error(status);
 const html=await page.locator('#source').inputValue();const result=await page.evaluate(()=>{const doc=document.getElementById('preview').contentDocument;return {headings:[...doc.querySelectorAll('h2')].map(x=>x.textContent),paragraphs:[...doc.querySelectorAll('p')].map(x=>x.textContent),italic:[...doc.querySelectorAll('em')].map(x=>x.textContent)};});
 if(!result.headings.some(x=>x.includes('Generated Heading Test'))||result.headings.some(x=>x.includes('An emphasized passage'))||!result.paragraphs.some(x=>x.includes('An emphasized passage')))throw Error(JSON.stringify(result));
 await writeFile('output/heading-cloud.html',html);await writeFile('output/heading-cloud-audit.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();}
