# Conversion baseline

Primary source: `wp25-11.pdf`, *How Export Restrictions Threaten Economic Security*, Chad P. Bown, May 2025. This 20-page paper is the starting baseline for further converter changes.

Current baseline checks:

- All 71 numbered notes appear after the article, under `<h2>Notes</h2>`.
- Inline `[N]` links and numbered return links use `_ftnN` / `_ftnrefN` anchors.
- The indented Sullivan quotation on page 3 uses `<blockquote><p>…</p></blockquote>`; the ordinary paragraph following it remains outside the quotation.
- All five numbered article headings use `<h2>`.
- The sentence crossing pages 13–14 joins “government of Australia itself?” in one paragraph.
- The sentence crossing pages 2–3 stays in one paragraph, preserving references 4 and 5.
- Indented paragraphs remain separate, including the opening introduction paragraphs.
- Long note 38 retains its complete sequence of citations.
- Running WP publication/date/page labels and the “WORKING PAPER” label are omitted.
- Output contains no document, main, or section wrappers, embedded stylesheet, meta tags, or `role="doc-footnote"` attributes.

Generated review output: `output/wp25-11.html`.

These automated checks cover the listed behaviors, not a complete editorial review. Image/table extraction, captions, and associated metadata are not implemented. Other formatting and reading-order details may still need review. The earlier `wp25-4.pdf` remains a secondary regression sample (51 notes).


## Rich-content baseline: wp26-1.pdf

This 84-page PDF is the reference for upcoming equation, table, and chart support. Page numbers below are physical PDF pages, not printed page labels.

- Pages 50–51 contain Tables 1–2, including captions, column headings, and numeric cells.
- Pages 52–69 contain Figures 1–22; several pages contain two figures. Preserve each chart with its own caption, source text, and document position.
- Pages 19–20 provide equation examples 5.1–5.7, inline variables, fractions, integrals, superscripts, and dotted/barred variables. Other math appears throughout the paper and appendix.
- The math font text mapping is unreliable: distinct displayed symbols can extract as identical Unicode text, and some characters extract as replacement characters. Simply wrapping extracted text in MathJax delimiters is not a valid conversion. Accurate math recognition or verified correction is needed.
- Display equations now have a local image fallback; full math recognition and table/chart extraction are not implemented. The converter must not be treated as a fully faithful conversion of this paper.

List regression coverage includes nested bullets, numbered sequences starting at 3, alphabetic markers, wrapped item text, footnote links inside items, and ordinary paragraphs following lists.


Equation regression: physical page 26 preserves three detected display equations as embedded images, including equation 5.17 and the unnumbered z-dot equation below it. The two supplied equations were independently transcribed from the screenshot to verify MathJax preview fractions, dot accents, grouping, and explicit numbering. The converter does not contain paper-specific TeX replacements. Tests also verify that editing and reopening keeps TeX intact and sends no external requests.


VAT regression: physical page 21 groups the display integral, its infinity/zero limits, fractions, and exp function into one image. The preceding terminal-VAT paragraph preserves three inline mathematical expressions, including overbars, while keeping prose editable. Equation geometry is retained from the PDF text items and the page is rendered once for all its crops. Visual review artifacts: `output/vat-integral.png` and `output/vat-inline.png`.


Alignment regression: physical pages 27–28 retain centered display formulas, including equation 5.18 with its right-hand number. Formula bounds, excluding the number, determine alignment; symmetric image whitespace keeps the formula centered when a number is present. The export uses paragraph alignment without embedded or inline styles. A left-aligned formula is not marked centered.


## Current no-image requirement (supersedes the image fallback above)

Equation-image output has been removed. The earlier crop/alignment screenshots document superseded behavior, not the current export contract. Current regression coverage preserves grouping, centering, prose, footnotes, lists, MathJax editing, and history while requiring no equation images. Unrecognized display and inline regions carry explicit transcription markers. Reopened legacy conversions replace generated equation images with markers, retaining other content and TeX.

Browser-local RapidLaTeXOCR is available only as an opt-in experiment. An end-to-end regression checks the z-dot example as real editable TeX, rejects image output, and confirms that unresolved expressions remain marked. Tests must not claim full formula accuracy: observed errors include c-dot becoming c-bar, lowercase z becoming uppercase Z, and invented notation for tiny inline crops. Inline OCR is therefore not offered. Draft display OCR still needs human verification.

Physical page 32 / printed page 31: the Delta expression with two explanatory underbraces now has an explicit reviewed TeX correction, matched by document and source-expression hashes. Regression coverage verifies actual MathJax without error nodes or image output, draft labeling for remaining expressions, manual correction persistence, and rejection of a different PDF. Other expressions still require review; this correction does not establish whole-document math accuracy.
