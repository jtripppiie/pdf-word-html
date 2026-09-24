import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {wordFixture} from '../tests/fixtures/word.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.TEST_URL||'https://pdf-to-html-250215174656.us-central1.run.app';
 if(process.env.LAYOUT_OVERLAY){
  await page.route(base+'/',async route=>route.fulfill({contentType:'text/html',body:await readFile('/tmp/pdf-layout-release-1.2.2/public/index.html','utf8')}));
  await page.route('**/style.css',async route=>route.fulfill({contentType:'text/css',body:await readFile('/tmp/pdf-layout-release-1.2.2/public/style.css','utf8')}));
 }
 await page.goto(base);await page.locator('#file').setInputFiles({name:'layout-test.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await wordFixture()});await page.locator('#convert').click();
 await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Done:'),{},{timeout:30000});
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  const layout=await page.evaluate(()=>{const rect=q=>{const r=document.querySelector(q).getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};};return {workspace:rect('.workspace'),output:rect('.output'),settings:rect('.settings'),aside:rect('aside'),overflow:document.documentElement.scrollWidth>innerWidth};});
  if(layout.overflow||Math.abs(layout.output.width-layout.workspace.width)>2||layout.output.top<Math.max(layout.settings.bottom,layout.aside.bottom))throw Error(JSON.stringify({width,...layout}));
  await page.screenshot({path:`output/layout-${width}.png`,fullPage:true});console.log(JSON.stringify({width,...layout}));
 }
 await page.locator('#show-source').click();if(!(await page.locator('#source').inputValue()).includes('<p>'))throw Error('Missing editable output');
 const download=page.waitForEvent('download');await page.locator('#download').click();if(!(await download).suggestedFilename().endsWith('.zip'))throw Error('Download failed');
 if(errors.length)throw Error(errors.join('\n'));
}finally{await browser.close();}
