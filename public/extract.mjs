import { groupEquationLines, hasMathGlyph } from './math-layout.mjs';
// PDF text has coordinates, not paragraphs. Reconstruct lines, then paragraphs.
export const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function extractPage(items, viewport, transform, { canContinueNote = false } = {}) {
  let words = items.filter(x => x.str?.trim()).map(x => {
    const t = transform(viewport.transform, x.transform);
    return { text: x.str, x: t[4], y: t[5], size: Math.hypot(t[2], t[3]), width: x.width * viewport.scale };
  });
  // Remove publication/page labels before they can merge into body text or notes.
  const marginLines = [];
  for (const word of words) {
    if (word.y >= viewport.height * .12 && word.y <= viewport.height * .88) continue;
    let line = marginLines.find(line => Math.abs(line.y - word.y) < 4);
    if (!line) { line = { y: word.y, words: [] }; marginLines.push(line); }
    line.words.push(word);
  }
  const runningLabel = /^(?:\d+\s*)?WP\s*\d{2,4}\s*[-–—]\s*\d+\s*[|¦]\s*(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s+\d{4}(?:\s*\d+)?$/i;
  const runningWords = new Set();
  for (const line of marginLines) {
    const text = line.words.sort((a,b) => a.x-b.x).map(word => word.text.trim()).join(' ').replace(/\s+/g, ' ').trim();
    if (runningLabel.test(text)) for (const word of line.words) runningWords.add(word);
  }
  words = words.filter(word => !runningWords.has(word));
  words = words.filter(w => !(/^\d+$/.test(w.text.trim()) && (w.x > viewport.width * .4) && (w.y > viewport.height * .92 || w.y < viewport.height * .05)));
  const weighted = new Map();
  const topWords = words.filter(w => w.y < viewport.height * .4 && w.text.trim().length > 3);
  const upperWords = topWords.reduce((count, word) => count + word.text.length, 0) >= 200 ? topWords : words.filter(w => w.y < viewport.height * .65 && w.text.trim().length > 3);
  for (const w of upperWords.length ? upperWords : words) { const s = Math.round(w.size * 2) / 2; weighted.set(s, (weighted.get(s) || 0) + w.text.length); }
  const bodySize = [...weighted].sort((a,b) => b[1]-a[1])[0]?.[0] || 12;
  // Small text in an outer sidebar has its own reading order.
  const sidebar = words.filter(w => w.x > viewport.width * .72 && w.size < bodySize * .82 && !/^[\d*†‡]+$/.test(w.text.trim()) && !hasMathGlyph(w.text) && !/^[∗*+−=]+$/.test(w.text.trim()));
  const sideSet = new Set(sidebar);
  words = words.filter(w => !sideSet.has(w));
  const lines = [];
  for (const w of words.sort((a,b) => a.y-b.y || a.x-b.x)) {
    let line = lines.find(l => Math.abs(l.y-w.y) < Math.max(2, bodySize * .38));
    if (!line) { line = { y: w.y, words: [] }; lines.push(line); }
    line.words.push(w);
  }
  for (const line of lines) {
    line.words.sort((a,b)=>a.x-b.x);
    line.size = Math.max(...line.words.map(w=>w.size));
    line.y = Math.max(...line.words.filter(w=>w.size >= line.size * .9).map(w=>w.y));
    line.x = line.words[0].x;
    line.end = Math.max(...line.words.map(w=>w.x+w.width));
    line.text = line.words.map((w,i,a) => (i && w.x > a[i-1].x+a[i-1].width+1 ? ' ' : '')+w.text).join('').trim();
  }
  lines.sort((a,b)=>a.y-b.y);
  const leftMargin = Math.min(...lines.map(line => line.x));
  const references = new Set(words.filter(w => w.size < bodySize * .8 && /^\d{1,3}$/.test(w.text.trim())).map(w => w.text.trim()));
  const marker = /^(\d{1,3}|[*†‡])(?:[.)]|\s)\s*(\S.*)$/;
  const body = [], notes = [], continuation = [];
  let activeNote = null;
  for (const line of lines) {
    const match = line.text.match(marker);
    const isNoteArea = line.y > viewport.height * .4 && line.size < bodySize * .94;
    if (isNoteArea && match && line.x <= leftMargin + 3 && references.has(match[1])) { activeNote = { marker: match[1], text: match[2], startY: line.y }; notes.push(activeNote); }
    else if (activeNote && isNoteArea) { activeNote.text = joinText(activeNote.text, line.text); }
    else if (canContinueNote && isNoteArea && notes.length === 0 && /^[a-z]/.test(line.text) && line.size < bodySize * .94) { continuation.push(line); }
    else if (isNoteArea && continuation.length && notes.length === 0) { continuation.push(line); }
    else { activeNote = null; body.push(line); }
  }
  groupEquationLines(body,bodySize);
  const isHeading = line => line.size > bodySize * 1.22 || (!/[|¦]/.test(line.text) && /[A-Z]{3}/.test(line.text) && line.text === line.text.toUpperCase() && line.text.length < 160 && line.size >= bodySize);
  const candidates = body.map(line => line.equationGroup!==undefined || isHeading(line) ? null : listMarker(line.text));
  const listMarkers = candidates.map((candidate,index) => {
    if (!candidate) return null;
    if (candidate.strong) return candidate;
    const line=body[index];
    const peer=candidates.some((other,at)=>other && at!==index && other.tag===candidate.tag && other.type===candidate.type && Math.abs(body[at].x-line.x)<4 && Math.abs(body[at].y-line.y)<260 && (candidate.tag==='ul'||Math.abs(other.value-candidate.value)===1));
    const next=body[index+1];
    const hanging=next && !candidates[index+1] && next.y-line.y<bodySize*1.7 && next.x>line.x+bodySize*.7;
    return peer || hanging ? candidate : null;
  });
  const paragraphs = [];
  let current = null, previous = null;
  for (const [lineIndex,line] of body.entries()) {
    // Omit isolated page numbers in the outer page margins.
    if (/^\d+$/.test(line.text) && (line.y > viewport.height * .92 || line.y < viewport.height * .05)) continue;
    const equation=line.equationGroup!==undefined;
    const heading = !equation && isHeading(line);
    const list = listMarkers[lineIndex];
    const gap = previous ? line.y-previous.y : Infinity;
    const outOfList = current?.list && !list && line.x < current.list.contentX - bodySize*.4;
    const sameEquation=equation&&previous?.equationGroup===line.equationGroup;
    const newParagraph = !sameEquation && (!current || equation || previous?.equationGroup!==undefined || heading || current.heading || !!list || outOfList || gap > bodySize * 1.65 || (previous && line.x > previous.x + bodySize * 1.3 && !current.list));
    const fragments = line.words.map((w,i,a) => ({ text: (i && w.x > a[i-1].x+a[i-1].width+1 ? ' ' : '')+w.text, superscript: w.size < bodySize * .85 && w.y < line.y-1, x:w.x, y:w.y, width:w.width, size:w.size }));
    let text=line.text;
    if(list){
      text=text.slice(list.prefix.length);let remaining=list.prefix.length;
      for(const fragment of fragments){const length=Math.min(remaining,fragment.text.length);fragment.text=fragment.text.slice(length);remaining-=length;}
      const first=line.words[0];
      list.contentX=first.text.trim().length>list.prefix.trim().length
        ? first.x+first.width*Math.min(1,list.prefix.length/first.text.length)
        : (line.words[1]?.x || line.x+list.prefix.length*bodySize*.5);
    }
    if (newParagraph) { current = { text, fragments, heading, list, equation, x: line.x, startY: line.y, endY: line.y, size: line.size, lineStarts: [] }; paragraphs.push(current); }
    else { current.text = joinText(current.text,line.text); current.fragments.push({text:' ',superscript:false}, ...fragments); }
    current.lineStarts.push(line.x);
    current.endY = line.y;
    previous = line;
  }
  for (const paragraph of paragraphs) {
    paragraph.blockquote = !paragraph.equation && !paragraph.heading && !paragraph.list && paragraph.lineStarts.length >= 2
      && paragraph.lineStarts.every(x => x > leftMargin + bodySize * .8)
      && paragraph.size <= bodySize * 1.05
      && !/^(?:[•●▪]|\d+[.)]\s)/.test(paragraph.text);
  }
  if (sidebar.length) {
    const text = sidebar.sort((a,b)=>a.y-b.y || a.x-b.x).map(w=>w.text).join(' ');
    paragraphs.push({text, fragments:[{text, superscript:false}], heading:false});
  }
  return { paragraphs, notes, bodySize, leftMargin, height: viewport.height, continuation: continuation.map(l=>l.text).join(' ') };
}
function listMarker(text) {
  const bullet=text.match(/^([•●▪◦‣⁃–-])\s*/);
  if(bullet) return {tag:'ul',type:'',prefix:bullet[0],strong:/[•●▪◦‣⁃]/.test(bullet[1])};
  const ordered=text.match(/^(?:(\d{1,3}|[a-zA-Z]|[ivxlcdmIVXLCDM]{2,6})[.)]|\((\d{1,3}|[a-zA-Z]|[ivxlcdmIVXLCDM]{2,6})\))\s+/);
  if(!ordered)return null;
  const marker=ordered[1]||ordered[2];let type='1',value=Number(marker);
  if(!Number.isFinite(value)){
    if(/^[ivxlcdm]+$/i.test(marker)&&!(marker.length===1&&!/[ivx]/i.test(marker))){
      type=marker===marker.toUpperCase()?'I':'i';const values={i:1,v:5,x:10,l:50,c:100,d:500,m:1000};value=0;const letters=marker.toLowerCase();for(let i=0;i<letters.length;i++)value+=(values[letters[i]]<(values[letters[i+1]]||0)?-1:1)*values[letters[i]];
    }else{type=marker===marker.toUpperCase()?'A':'a';value=marker.toLowerCase().charCodeAt(0)-96;}
  }
  return {tag:'ol',type,value,prefix:ordered[0],strong:false};
}
function renderBlocks(blocks,pageNumbers){
  const root=[],stack=[];let previousPage;
  for(const block of blocks){
    if(previousPage!==undefined&&block.pageIndex!==previousPage&&pageNumbers[block.pageIndex]!==pageNumbers[previousPage]+1)stack.length=0;
    previousPage=block.pageIndex;
    if(!block.list){stack.length=0;const tag=block.heading?'h2':'p';const html=`<${tag}${block.equationCentered?' align="center"':''}>${block.content}</${tag}>`;root.push(block.blockquote?`<blockquote>${html}</blockquote>`:html);continue;}
    const marker=block.list,tolerance=block.size*.6;
    while(stack.length && block.x<stack.at(-1).indent-tolerance)stack.pop();
    let list=stack.at(-1);
    if(list&&Math.abs(block.x-list.indent)<=tolerance&&(list.tag!==marker.tag||list.type!==marker.type)){stack.pop();list=stack.at(-1);}
    if(!list||block.x>list.indent+tolerance){
      const next={tag:marker.tag,type:marker.type,start:marker.value,indent:block.x,items:[]};
      if(list?.items.length)list.items.at(-1).children.push(next);else root.push(next);
      stack.push(next);list=next;
    }
    list.items.push({content:block.content,value:marker.value,children:[]});
  }
  function render(node){
    if(typeof node==='string')return node;
    const attrs=node.tag==='ol'?`${node.type!=='1'?` type="${node.type}"`:''}${node.start!==1?` start="${node.start}"`:''}`:'';
    let expected=node.start;
    const items=node.items.map(item=>{const value=node.tag==='ol'&&item.value!==expected?` value="${item.value}"`:'';expected=item.value+1;return `<li${value}>${item.content}${item.children.map(render).join('')}</li>`;}).join('\n');
    return `<${node.tag}${attrs}>\n${items}\n</${node.tag}>`;
  }
  return root.map(render).join('\n');
}
function joinText(a,b) { return a.endsWith('-') ? a+b : a+' '+b; }
export function documentHtml(pages, pageNumbers = pages.map((_, index) => index + 1)) {
  let number = 0;
  const allNotes = [];
  const reviewMap = [];
  const blocks = [];
  pages.forEach((page, pageIndex) => {
    const notes = new Map(page.notes.map(note => {
      const entry = { ...note, number: ++number, references: 0 };
      reviewMap.push({id:`_ftn${entry.number}`,page:pageNumbers[pageIndex],y:(note.startY || page.height * .85)/page.height});
      allNotes.push(entry);
      return [note.marker, entry];
    }));
    page.paragraphs.filter(paragraph => !(paragraph.heading && paragraph.text.trim().toUpperCase() === 'WORKING PAPER')).forEach((paragraph, paragraphIndex) => {
      const content = paragraph.fragments.map(fragment => {
        if(fragment.mathReview)return `<span id="${escapeHtml(fragment.mathReview)}" class="math-needs-review">${escapeHtml(fragment.text)}</span>`;
        const note = !paragraph.equation && fragment.superscript && notes.get(fragment.text.trim());
        if (note) {
          const reference = ++note.references;
          const target = `_ftnref${note.number}${reference > 1 ? `-${reference}` : ''}`;
          const space = fragment.text.match(/^\s*/)[0];
          return `${space}<a href="#_ftn${note.number}" name="${target}" id="${target}" title="" role="doc-noteref">[${note.number}]</a>`;
        }
        return escapeHtml(fragment.text);
      }).join('').replace(/- (?=[a-z0-9])/gi, '-');
      const plainText = paragraph.fragments.filter(fragment => !fragment.superscript).map(fragment => fragment.text).join('').trim();
      reviewMap.push({text:plainText,page:pageNumbers[pageIndex],y:paragraph.startY/page.height});
      const previous = blocks.at(-1);
      const continues = paragraphIndex === 0 && previous && !previous.heading && !paragraph.heading
        && !!previous.blockquote === !!paragraph.blockquote
        && !paragraph.list && !paragraph.equation && !previous.equation
        && previous.pageIndex === pageIndex - 1 && pageNumbers[pageIndex] === pageNumbers[pageIndex - 1] + 1
        && previous.endY > previous.height * .35 && paragraph.startY < page.height * .2
        && (previous.list ? Math.abs(paragraph.x-previous.list.contentX)<page.bodySize*.6 : paragraph.x <= page.leftMargin + page.bodySize * .5)
        && Math.abs(paragraph.size - previous.size) < page.bodySize * .15
        && !/[.!?;:]["'’”)]*$/.test(previous.plainText)
        && (/^[a-z]/.test(plainText) || /[,-]$/.test(previous.plainText)
          || (/^[A-Z]/.test(plainText) && /[a-z]$/.test(previous.plainText)))
        && !/^(?:[•●▪]|\d+[.)]\s)/.test(plainText);
      if (continues) {
        previous.content += (previous.plainText.endsWith('-') ? '' : ' ') + content;
        previous.plainText += ' ' + plainText;
        previous.endY = paragraph.endY;
        previous.pageIndex = pageIndex;
        previous.height = page.height;
      } else {
        blocks.push({ ...paragraph, content, plainText, pageIndex, height: page.height });
      }
    });
  });
  const footnotes = allNotes.length ? `\n<h2>Notes</h2>\n${allNotes.map(note => {
    // Unmatched notes keep a valid destination without a broken return link.
    const backlink = note.references ? ` href="#_ftnref${note.number}"` : '';
    return `<p><a${backlink} name="_ftn${note.number}" id="_ftn${note.number}" title="">${note.number}</a>. ${escapeHtml(note.text)}</p>`;
  }).join('\n')}` : '';
  const body = renderBlocks(blocks,pageNumbers);
  return { html: body + footnotes, reviewMap, linked: allNotes.filter(note => note.references > 0).length };
}
export function parsePages(input, count) {
  if (!input.trim()) { if(count>100) throw new Error('Select up to 100 pages per conversion.'); return Array.from({length:count},(_,i)=>i+1); }
  const result = new Set();
  for(const part of input.replace(/[–—]/g,'-').split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if(!match) throw new Error('Use page numbers like 1-3, 5, 8.');
    const a=Number(match[1]), b=Number(match[2] || match[1]);
    if(a<1 || b>count || a>b) throw new Error(`Choose pages between 1 and ${count}, in ascending ranges.`);
    if(b-a+1>100) throw new Error('Select up to 100 pages per conversion.');
    for(let n=a;n<=b;n++) result.add(n);
    if(result.size>100) throw new Error('Select up to 100 pages per conversion.');
  }
  return [...result].sort((a,b)=>a-b);
}
