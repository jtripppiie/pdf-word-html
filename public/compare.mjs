export function normalizedWords(text) {
  return (text.normalize('NFKC').replace(/[’‘]/g,"'").replace(/(\p{L})[-‐‑]\s*(\p{L})/gu,'$1$2').toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu) || []);
}
export function htmlText(html) {
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('script,style,template').forEach(node=>node.remove());
  doc.querySelectorAll('p,h1,h2,h3,h4,h5,h6,br,li,td,th').forEach(node=>node.append(' '));
  return doc.body.textContent;
}
export function compareText(sourcePages,html) {
  const source=new Map(),output=new Map();
  for(const page of sourcePages)for(const word of normalizedWords(page.text)) {
    if(!source.has(word))source.set(word,{count:0,pages:new Set()});
    const item=source.get(word);item.count++;item.pages.add(page.number);
  }
  for(const word of normalizedWords(htmlText(html)))output.set(word,(output.get(word)||0)+1);
  const missing=[],added=[];
  for(const [word,item] of source)if(item.count>(output.get(word)||0))missing.push({word,count:item.count-(output.get(word)||0),pages:[...item.pages]});
  for(const [word,count] of output)if(count>(source.get(word)?.count||0))added.push({word,count:count-(source.get(word)?.count||0)});
  return {missing,added};
}
