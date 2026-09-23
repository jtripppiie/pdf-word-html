"""Export actual model output as an HTML fragment, without any equation images."""
import json,re,html
from pathlib import Path
results=[]
for name in ['formula-v2-evaluation.json','formula-v2-extra-evaluation.json']:
 path=Path('output',name)
 if path.exists():results.extend(json.loads(path.read_text())['results'])
fragments=[]
for result in results:
 tex=result['raw_output'].split('<end_of_utterance>')[0]
 tex=re.sub(r'<loc_\d+>|</?formula>','',tex).strip()
 result['tex']=tex
 if result['page']==32:
  result['review']='FAILED: second underbrace label is incomplete and misspelled; not included in the successful sample.'
  continue
 result['review']='Visually checked for this evaluation only; not a general accuracy guarantee.'
 fragments.append(f'<h2>PDF page {result["page"]}, expression {result["item"]}</h2>\n<p>\\[{html.escape(tex)}\\]</p>')
Path('output/automatic-math-sample.html').write_text('\n'.join(fragments)+'\n')
Path('output/automatic-math-results.json').write_text(json.dumps(results,indent=2)+'\n')
print(f'Exported {len(fragments)} checked expressions; raw evaluation retains all {len(results)} cases.')
