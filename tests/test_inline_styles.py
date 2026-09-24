import copy
import importlib.util
import unittest
from pathlib import Path
root=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('styles',root/'scripts/pdf-heading-styles.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def run(text,italic=False):return {'text':text,'x':.4,'y':.85,'size':9,'italic':italic,'bold':False}
def note(content):return {'type':'page_footnote','bbox':[0,.8,1,.95],'content':content}
class InlineStylesTest(unittest.TestCase):
 def test_mixed_note_preserves_text_links_and_existing_styles(self):
  spans=[{'type':'text','content':'1 See '},{'type':'hyperlink','url':'https://example.org','content':[{'type':'text','content':'Journal of Economics','styles':['bold']}]},{'type':'text','content':', volume 2.'}]
  block=note(copy.deepcopy(spans));runs=[run('1 See '),run('Journal of Economics',True),run(', volume 2.')]
  m.recover_italics([block],runs)
  self.assertEqual(block['content'][0],spans[0]);self.assertEqual(block['content'][2],spans[2])
  self.assertEqual(block['content'][1]['url'],spans[1]['url'])
  self.assertEqual(block['content'][1]['content'][0]['styles'],['bold','italic'])
  saved=copy.deepcopy(block);m.recover_italics([block],runs);self.assertEqual(block,saved)
 def test_split_plain_span_and_keep_equation(self):
  block=note([{'type':'text','content':'See The Book, and '},{'type':'equation_inline','content':'x^2'}])
  m.recover_italics([block],[run('See '),run('The Book',True),run(', and x2')])
  self.assertEqual(''.join(s['content'] for s in block['content']),'See The Book, and x^2')
  self.assertEqual([s['content'] for s in block['content'] if 'italic' in s.get('styles',[])],['The Book'])
  self.assertEqual(block['content'][-1],{'type':'equation_inline','content':'x^2'})
 def test_unmatched_text_is_unchanged(self):
  block=note([{'type':'text','content':'Unrelated recognized words'}]);saved=copy.deepcopy(block)
  m.recover_italics([block],[run('Entirely different source',True)]);self.assertEqual(block,saved)
 def test_real_pdf_font_runs_restore_citation(self):
  with m.pdfium.PdfDocument(root/'wp25-11.pdf') as pdf:
   page=pdf[0];runs=m.source_runs(page);page.close()
  native=[r for r in runs if .71<r['y']<.80]
  self.assertTrue(any('Journal of International' in r['text'] and r['italic'] for r in native))
  text=' '.join(r['text'] for r in native)
  block={'type':'page_footnote','bbox':[0,.71,1,.80],'content':[{'type':'text','content':text}]}
  m.recover_italics([block],runs)
  self.assertEqual(''.join(s['content'] for s in block['content']),text)
  styled=' '.join(s['content'] for s in block['content'] if 'italic' in s.get('styles',[]))
  self.assertIn('Journal of International',styled);self.assertIn('Economic Law',styled)
if __name__=='__main__':unittest.main()
