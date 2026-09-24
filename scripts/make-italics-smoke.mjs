import {PDFDocument,StandardFonts} from 'pdf-lib';
import {mkdir,writeFile} from 'node:fs/promises';
const pdf=await PDFDocument.create(),regular=await pdf.embedFont(StandardFonts.TimesRoman),italic=await pdf.embedFont(StandardFonts.TimesRomanItalic),bold=await pdf.embedFont(StandardFonts.TimesRomanBold);
const page=pdf.addPage([612,792]);
page.drawText('Generated Italics Test',{x:60,y:720,size:20,font:bold});
const body=['This generated document checks citation formatting in a footnote.', 'The ordinary paragraph must remain readable and retain its words.', 'The citation below contains an italic title followed by regular text.', 'No private document content is included in this conversion test.'];
body.forEach((text,i)=>page.drawText(text,{x:60,y:660-i*24,size:12,font:regular}));
page.drawText('1',{x:60+regular.widthOfTextAtSize(body[0],12)+2,y:665,size:8,font:regular});
page.drawLine({start:{x:60,y:160},end:{x:240,y:160},thickness:.5});
let x=60;for(const [text,font] of [['1 See ',regular],['Journal of Economic History',italic],[', volume 12, pages 20-24.',regular]]){page.drawText(text,{x,y:140,size:10,font});x+=font.widthOfTextAtSize(text,10);}
await mkdir('output',{recursive:true});await writeFile('output/italics-smoke.pdf',await pdf.save());
