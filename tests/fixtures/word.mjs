import JSZip from 'jszip';
const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',M='http://schemas.openxmlformats.org/officeDocument/2006/math';
const run=t=>`<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`;
const math=t=>`<m:r><m:t>${t}</m:t></m:r>`;
const frac=`<m:f><m:num><m:acc><m:accPr><m:chr m:val="̇"/></m:accPr><m:e>${math('c')}</m:e></m:acc></m:num><m:den>${math('c')}</m:den></m:f>`;
export async function wordFixture({unsupported=false,images=false,picture=false,pictureAlt=true,pictureType="image/png"}={}){
 const z=new JSZip();z.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
 z.file('_rels/.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
 z.file('word/_rels/document.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+['styles','numbering','footnotes','endnotes'].map((n,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${n}" Target="${n}.xml"/>`).join('')+'<Relationship Id="unsafe" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="javascript:alert(1)" TargetMode="External"/></Relationships>');
 z.file('word/styles.xml',`<w:styles xmlns:w="${W}"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/></w:style></w:styles>`);
 z.file('word/numbering.xml',`<w:numbering xmlns:w="${W}">${['bullet','decimal'].map((t,i)=>`<w:abstractNum w:abstractNumId="${i}"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${t}"/><w:lvlText w:val="${i?'%1.':'•'}"/></w:lvl></w:abstractNum><w:num w:numId="${i+1}"><w:abstractNumId w:val="${i}"/></w:num>`).join('')}</w:numbering>`);
 const list=(id,t)=>`<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${id}"/></w:numPr></w:pPr>${run(t)}</w:p>`;
 z.file('word/footnotes.xml',`<w:footnotes xmlns:w="${W}"><w:footnote w:id="1"><w:p>${run('A real footnote.')}</w:p></w:footnote></w:footnotes>`);
 z.file('word/endnotes.xml',`<w:endnotes xmlns:w="${W}"><w:endnote w:id="2"><w:p>${run('A real endnote.')}</w:p></w:endnote></w:endnotes>`);
 z.file('word/document.xml',`<w:document xmlns:w="${W}" xmlns:m="${M}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>
 <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run('Word equation sample')}</w:p>
 <w:p>${run('The inline equation ')}<m:oMath>${frac}${math('=σ(αz−θ−δ)')}</m:oMath>${run(' stays inside this paragraph.')}<w:r><w:footnoteReference w:id="1"/></w:r></w:p>
 <w:p>${run('A display equation follows.')}</w:p>
 <w:p><m:oMathPara><m:oMath><m:nary><m:naryPr><m:chr m:val="∫"/></m:naryPr><m:sub>${math('0')}</m:sub><m:sup>${math('∞')}</m:sup><m:e><m:sSup><m:e>${math('x')}</m:e><m:sup>${math('2')}</m:sup></m:sSup>${math('dx')}</m:e></m:nary></m:oMath></m:oMathPara></w:p>
 <w:p><m:oMathPara><m:oMath><m:limLow><m:e><m:groupChr><m:groupChrPr><m:chr m:val="⏟"/></m:groupChrPr><m:e>${math('x+y')}</m:e></m:groupChr></m:e><m:lim><m:r><m:rPr><m:nor/></m:rPr><m:t>explanatory label</m:t></m:r></m:lim></m:limLow></m:oMath></m:oMathPara></w:p>
 <w:p><w:pPr><w:pStyle w:val="Quote"/></w:pPr>${run('Quoted passage.')}</w:p>
 ${list(1,'Bullet one')}${list(1,'Bullet two')}${list(2,'Step one')}${list(2,'Step two')}
 <w:tbl><w:tr><w:tc><w:p>${run('Country')}</w:p></w:tc><w:tc><w:p>${run('Value')}</w:p></w:tc></w:tr><w:tr><w:tc><w:p>${run('Ukraine')}</w:p></w:tc><w:tc><w:p>${run('42')}</w:p></w:tc></w:tr></w:tbl>
 <w:p>${run('Ending with a note.')}<w:r><w:endnoteReference w:id="2"/></w:r><w:hyperlink r:id="unsafe">${run('Unsafe link')}</w:hyperlink></w:p>
 ${unsupported?'<w:p><m:oMath><m:unknown>'+math('x')+'</m:unknown></m:oMath></w:p>':''}
 ${images?'<w:p><w:r><w:object/></w:r></w:p>':''}
 <w:sectPr/></w:body></w:document>`);
 if(picture){
  const types=await z.file('[Content_Types].xml').async('string');z.file('[Content_Types].xml',types.replace('</Types>',`<Default Extension="png" ContentType="${pictureType}"/></Types>`));
  const rels=await z.file('word/_rels/document.xml.rels').async('string');z.file('word/_rels/document.xml.rels',rels.replace('</Relationships>','<Relationship Id="picture1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/chart.png"/></Relationships>'));
  z.file('word/media/chart.png','iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',{base64:true});
  const xml=await z.file('word/document.xml').async('string');
  const drawing=`<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:docPr id="1" name="Chart" descr="${pictureAlt?'Trade increased by 20 percent.':''}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:blipFill><a:blip r:embed="picture1"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  z.file('word/document.xml',xml.replace('<w:sectPr/>',drawing+'<w:sectPr/>'));
 }
 return z.generateAsync({type:'nodebuffer'});
}
