import importlib.util
import unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('refine',Path(__file__).resolve().parents[1]/'scripts/refine-pdf-equations.py')
refine=importlib.util.module_from_spec(spec);spec.loader.exec_module(refine)

class FormulaFormattingTests(unittest.TestCase):
    def test_detects_invalid_groups_for_automatic_retry(self):
        self.assertTrue(refine.balanced_groups(r'\frac{x}{y}+\{a\}'))
        self.assertFalse(refine.balanced_groups(r'\frac{x}}{y}'))
        self.assertFalse(refine.balanced_groups(r'\frac{x}{y'))

    def test_aligns_multiple_lines_and_keeps_number_outside_alignment(self):
        tex=refine.normalize_tex(r'x &= y \\ &= z \tag{1}')
        self.assertEqual(tex,r'\begin{aligned}x &= y \\ &= z \end{aligned}\tag{1}')

    def test_normalizes_empty_script_but_preserves_real_nested_exponents(self):
        self.assertEqual(refine.normalize_tex(r'c ^ { ^ { * } }'),r'c ^{ * }')
        self.assertEqual(refine.normalize_tex(r'a^{b^{c}}'),r'a^{b^{c}}')

    def test_preserves_complete_descriptive_label_without_replacing_algebra(self):
        first=r'\underbrace{x^2}_{l o n g \: e x p l a n a t o r y \: l a b e l}'
        second=r'\underbrace{x^3}_{label}'
        merged=refine.preserve_labels(second,first)
        self.assertIn('x^3',merged)
        self.assertIn('l o n g',merged)
        self.assertNotIn('x^2',merged)
        self.assertEqual(refine.preserve_labels(r'\underbrace{x}_{b}',r'\underbrace{x}_{a}'),r'\underbrace{x}_{b}')

if __name__=='__main__':unittest.main()
