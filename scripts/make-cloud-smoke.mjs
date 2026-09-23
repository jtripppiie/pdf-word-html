import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {writeFile} from 'node:fs/promises';
const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.TimesRoman),italic=await pdf.embedFont(StandardFonts.TimesRomanItalic),bold=await pdf.embedFont(StandardFonts.TimesRomanBold);
const page=pdf.addPage([612,792]);page.drawText('Generated conversion test',{x:60,y:724,size:18,font:bold});
const line='This test document contains only invented data.';page.drawText(line,{x:60,y:690,size:12,font});page.drawText('1',{x:60+font.widthOfTextAtSize(line,12)+2,y:695,size:7,font});
page.drawText('Table 1. Sample annual values',{x:140,y:626,size:13,font:bold});
const rows=[['Year','North','South','Total'],['2021','10','20','30'],['2022','15','25','40'],['2023','20','30','50'],['2024','25','35','60'],['2025','30','40','70']];
for(let i=0;i<=rows.length;i++)page.drawLine({start:{x:70,y:605-i*35},end:{x:540,y:605-i*35},thickness:.7});
for(let c=0;c<=4;c++)page.drawLine({start:{x:70+c*117.5,y:605},end:{x:70+c*117.5,y:395},thickness:.7});
rows.forEach((row,r)=>row.forEach((value,c)=>page.drawText(value,{x:85+c*117.5,y:582-r*35,size:12,font:r?font:bold})));
page.drawLine({start:{x:60,y:143},end:{x:260,y:143},thickness:.6});page.drawText('1 This is a generated footnote for deployment testing.',{x:60,y:122,size:9,font});
const second=pdf.addPage([612,792]);second.drawText('Equation and chart test',{x:60,y:724,size:18,font:bold});second.drawText('The following equation and chart contain invented values.',{x:60,y:687,size:12,font});
second.drawText('x + 1',{x:240,y:635,size:18,font:italic});second.drawLine({start:{x:236,y:629},end:{x:283,y:629},thickness:1});second.drawText('y',{x:254,y:607,size:18,font:italic});second.drawText('= 2',{x:298,y:620,size:18,font});second.drawText('(1)',{x:522,y:620,size:12,font});
second.drawText('Figure 1. Sample values',{x:170,y:532,size:13,font:bold});second.drawLine({start:{x:130,y:300},end:{x:490,y:300},thickness:1});second.drawLine({start:{x:130,y:300},end:{x:130,y:500},thickness:1});
for(let i=0;i<4;i++){second.drawRectangle({x:160+i*80,y:300,width:45,height:55+i*35,color:rgb(.15,.4,.7)});second.drawText(String(2022+i),{x:164+i*80,y:279,size:11,font});}
for(let i=0;i<=4;i++)second.drawText(String(i*10),{x:108,y:297+i*45,size:10,font});
second.drawText('Source: Generated test data.',{x:160,y:248,size:10,font});
await writeFile('output/cloud-smoke.pdf',await pdf.save());
