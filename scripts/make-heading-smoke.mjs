import {PDFDocument,StandardFonts} from 'pdf-lib';
import {writeFile} from 'node:fs/promises';
const pdf=await PDFDocument.create(),page=pdf.addPage([612,792]);
const roman=await pdf.embedFont(StandardFonts.TimesRoman),italic=await pdf.embedFont(StandardFonts.TimesRomanItalic),bold=await pdf.embedFont(StandardFonts.TimesRomanBold);
page.drawText('1. Generated Heading Test',{x:60,y:730,font:bold,size:16});
for(const [y,text] of [[690,'This generated document contains invented text for testing.'],[674,'The paragraph explains how ordinary emphasis should remain prose.'],[604,'This paragraph follows an italic phrase in the same body font size.'],[588,'It should remain separate from the actual numbered section heading.'],[540,'The final paragraph provides additional body text for font comparison.']])page.drawText(text,{x:60,y,font:roman,size:12});
page.drawText('An emphasized passage',{x:60,y:632,font:italic,size:12});
await writeFile('output/heading-smoke.pdf',await pdf.save());
