const glyph=/[\u{1D400}-\u{1D7FF}�∫∑∏∞]/u;
const functions=new Set(['exp','log','ln','sin','cos','tan','cot','sec','csc','sinh','cosh','tanh','lim','max','min','sup','inf','det','arg']);
export const hasMathGlyph=text=>glyph.test(text);
export function isMathOnly(text){
 if(!text.trim())return false;
 const words=text.match(/[A-Za-z]+/g)||[];
 return words.every(word=>word.length===1||functions.has(word)) && !/[;:?!]/.test(text);
}
export const hasRelation=text=>/[=≡<>≤≥⟺→]/.test(text);
// Before paragraph reconstruction: keep numerators, limits, and denominators together.
export function groupEquationLines(lines,bodySize){
 for(let start=0;start<lines.length;){
  if(!isMathOnly(lines[start].text)){start++;continue;}
  let end=start+1;
  while(end<lines.length&&isMathOnly(lines[end].text)&&lines[end].y-lines[end-1].y<bodySize*1.8)end++;
  const text=lines.slice(start,end).map(line=>line.text).join(' ');
  if(hasMathGlyph(text)&&hasRelation(text))for(let i=start;i<end;i++)lines[i].equationGroup=start;
  start=end;
 }
}
