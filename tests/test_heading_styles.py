import importlib.util
import json
import unittest
from pathlib import Path

root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('heading_styles',root/'scripts/pdf-heading-styles.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class HeadingStylesTest(unittest.TestCase):
    def test_italic_alone_is_not_a_heading(self):
        for bold,size,text,demote in [(False,12,'Emphasized passage',True),(True,12,'Bold italic section',False),(False,16,'Large italic section',False),(False,12,'A. Numbered section',False)]:
            blocks=[{'type':'text','bbox':[0,.3,1,.8]}, {'type':'paragraph_title','bbox':[0,.1,1,.2],'content':[{'type':'text','content':text}]}]
            runs=[{'text':'Body paragraph with enough text','x':.2,'y':.4,'size':12,'italic':False,'bold':False}, {'text':text,'x':.2,'y':.15,'size':size,'italic':True,'bold':bold}]
            m.correct_page(blocks,runs)
            self.assertEqual(blocks[1]['type'],'text' if demote else 'paragraph_title')
            if demote:self.assertEqual(blocks[1]['content'][0]['styles'],['italic'])
    def test_baseline_preserves_real_sections_and_emphasis(self):
        data=json.loads((root/'tests/fixtures/wp26-1-automatic.json').read_text())
        # Restore the layout model's original title guess before correction.
        for page in data['pages']:
            for block in page['blocks']:
                if block.get('content')==[{'type':'text','content':'Foreign Direct Investment','styles':['italic']}]:
                    block['type']='paragraph_title';block['content'][0].pop('styles')
        m.correct_headings(root/'wp26-1.pdf',data)
        by_text={''.join(s.get('content','') for s in b.get('content',[]) if isinstance(s,dict) and s.get('type')=='text'):b for p in data['pages'] for b in p['blocks'] if isinstance(b.get('content'),list)}
        self.assertEqual(by_text['Foreign Direct Investment']['type'],'text')
        self.assertIn('italic',by_text['Foreign Direct Investment']['content'][0]['styles'])
        self.assertEqual(by_text['1. Introduction']['type'],'paragraph_title')
        self.assertEqual(by_text['A. Population and Human Capital']['type'],'paragraph_title')

if __name__=='__main__':unittest.main()
