"""Replay newly recognized crops into a saved parser result for regression testing.

All replacements come from model outputs keyed to the original page/block/TeX.
This utility is not part of production conversion and contains no transcriptions.
"""
import json,sys
from pathlib import Path
source,old_results,new_results,destination=map(Path,sys.argv[1:5])
payload=json.loads(source.read_text());old={r['key']:r for r in json.loads(old_results.read_text())}
changes=0
for result in json.loads(new_results.read_text()):
    previous=old[result['key']]
    if previous['tex']==result['tex']:continue
    page=next(p for p in payload['pages'] if p['page_idx']==result['page'])
    block=next(b for b in page['blocks'] if b['index']==result['index'])
    matches=[]
    def visit(value):
        if isinstance(value,dict):
            if value.get('content')==previous['tex']:matches.append(value)
            for child in value.values():visit(child)
        elif isinstance(value,list):
            for child in value:visit(child)
    visit(block)
    if len(matches)!=1:raise ValueError(f'Expected one exact equation target, found {len(matches)}: {result["key"]}')
    matches[0]['content']=result['tex'];changes+=1
Path(destination).write_text(json.dumps(payload))
print(f'Updated {changes} automatically recognized expressions.')
