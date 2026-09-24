# PDF and Word to HTML

A minimal PDF/Word-to-HTML portal. In automatic mode, PDFs are processed on the portal server and temporary files are deleted after conversion; Word conversion and saved history stay in the browser. Downloads omit page-level section wrappers, the “WORKING PAPER” label, viewport/CSP meta tags, and embedded or inline styles, so the content can inherit your site’s styling. Downloads are ZIP archives containing a clean HTML fragment and an `images/` folder. Image paths in the HTML are relative. HTML files are fragments without document, main, or section wrappers with paragraph tags, detected headings wrapped in `<h2>`, consistently indented multiline passages wrapped in `<blockquote><p>…</p></blockquote>`, bulleted and numbered lists (`<ul>`, `<ol>`, and `<li>`) with detected nesting and wrapped items, footnote anchors, and return links matching the site’s `[1]` reference format. The preview is sandboxed and HTML source can be edited before download.

## Run locally

The default `npm start` runs the automatic PDF parser (the installed local parser and equation models are required; see setup below). `npm run start:math` remains an alias. Use `npm run start:browser` only for the older browser-only converter. The Google portal now runs the automatic parser; Word conversion remains browser-local in both modes.

Live portal: https://pdf-to-html-250215174656.us-central1.run.app — revision `pdf-to-html-layout-122-20260924` (2026-09-24). Reconvert older saved PDF results to receive the new recognition, footnote recovery, and source chart/table images.

Use Node.js 22.13+ (Node 24 recommended).

```sh
npm ci
npm run build
npm start
```

Open http://localhost:8080. Tests: `npx playwright install chromium` then `npm test`. The primary baseline is `wp25-11.pdf` (20 pages, 71 notes), with `wp25-4.pdf` retained as an additional regression sample. Those PDFs and `wp26-1.pdf` are required for the full test suite. Tests regenerate `output/wp25-11.html` and `output/wp25-4.html`. See `BASELINE.md` for the baseline acceptance criteria.

## Deploy

Use `Dockerfile.math` for the automatic recognition engine. It includes the pinned local model caches and excludes user PDFs, outputs, and temporary files. Stage a revision before moving traffic:

```sh
docker build -f Dockerfile.math -t us-central1-docker.pkg.dev/project-6d7c1b56-cee5-450d-93e/cloud-run-source-deploy/pdf-to-html:math-zip-20260921-final .
docker push us-central1-docker.pkg.dev/project-6d7c1b56-cee5-450d-93e/cloud-run-source-deploy/pdf-to-html:math-zip-20260921-final
gcloud run deploy pdf-to-html --image us-central1-docker.pkg.dev/project-6d7c1b56-cee5-450d-93e/cloud-run-source-deploy/pdf-to-html:math-zip-20260921-final --project project-6d7c1b56-cee5-450d-93e --region us-central1 --memory 8Gi --cpu 2 --concurrency 4 --timeout 3600 --min-instances 0 --max-instances 1 --cpu-throttling --update-env-vars MINERU_PROCESSING_WINDOW_SIZE=2 --no-traffic --tag preview --quiet
```

`Dockerfile.cloud` is the equivalent remote-build variant: it downloads the same pinned public models and verifies the parser checksums inside Cloud Build, avoiding a multi-gigabyte local upload. The source staging directory must include only application files, licenses, and model manifests; never include user PDFs or generated outputs.

Only one PDF conversion runs per instance. Additional conversion requests receive a busy message. CPU recognition can take minutes for long papers; Cloud Run compute and registry storage are not guaranteed free. Validate the staged URL using the generated, nonsensitive `output/cloud-smoke.pdf` before promoting its revision.

The PDF fixtures and generated outputs are excluded from deployment. PDF.js and preview MathJax assets are bundled with the service. Automatic mode uploads PDFs to the portal’s own parser; it does not send them to a third-party recognition API. Cloud Run scales to zero when idle.

## Equations

The following browser-only limitations apply to `npm run start:browser`. The automatic parser mode instead detects inline/display math, supplements missing regions using PDF font-object geometry, recognizes TeX, and runs a second local recognizer on complex display formulas. It does not consult the document-specific reviewed-equation catalog. Recognition is not a mathematical proof of fidelity: valid TeX can still contain recognition errors.

Equation images are never generated for export. Detected math without TeX is marked explicitly as needing transcription. Original PDFs remain available alongside the output. Previously generated equation images in saved conversions are replaced with transcription markers when reopened, while surrounding prose and existing TeX are preserved.

Optional **Try local display-equation recognition (experimental)** runs RapidLaTeXOCR through ONNX Runtime Web in a browser worker. It is off by default because evaluation found symbol errors, including dot/bar confusion and variable case changes. Model files total about 180 MB and are loaded only when recognition is enabled and equations are found. No document data leaves the browser and no recognition API or account is used. Display equations get draft TeX; inline math remains marked for manual transcription. Detected ambiguous outputs and failures remain marked too. These checks do not catch every recognition error: review every generated equation. Stop equation recognition finishes the conversion with the remaining math marked for transcription.

Models and SHA-256 hashes are pinned in `ocr-models.json`; build downloads verify them. Assets are streamed by the server and cached in the browser. See `THIRD_PARTY_NOTICES.md` for upstream code/model attribution and licenses. The worker follows RapidLaTeXOCR's image normalization, resizer, encoder, and greedy decoder; the original Python evaluation used version 0.0.9. No Python or GPU is needed by portal users.

TeX in `\( ... \)` or `\[ ... \]` renders using locally bundled MathJax in the sandboxed preview. Export retains editable TeX without MathJax scripts or preview styles; the destination site supplies MathJax. Display-equation grouping keeps integral limits and fractions together. Center alignment is retained in paragraph markup; numbered OCR results use `\tag{...}`. General math detection and recognition remain incomplete.

## Limits

- 30 MB per PDF; at most 100 pages per PDF; the portal converts the entire document.
- Browser-only mode requires text-based PDFs. Automatic mode recognizes text and math and exports detected charts, figures, and tables as crops from the original PDF. Captions/source notes remain text. Captions associated with detected visuals also supply their image descriptions; uncaptained visuals retain a page-based description. Detection can still miss or misclassify regions.
- Paragraph and footnote detection is heuristic: text size, position, spacing, and raised note markers are used. Review unfamiliar layouts, columns, mathematical superscripts, and footnotes without raised reference markers.
- Footnotes are numbered across the document and collected at the end beneath `<h2>Notes</h2>`, using `_ftnN` / `_ftnrefN` named anchors with matching IDs; continuing footnote text can be joined from the immediately following selected page. Likely paragraph continuations across consecutive selected pages are joined using position, indentation, text size, and sentence-ending punctuation.
- Page number footers and WP publication/date/page labels in the top and bottom margins are removed. Headers and bibliographic formatting may require editing.
- A modern browser with JavaScript and WebAssembly support is required.

## Review and saved conversions

- Successful conversions automatically save the original PDF, selected-page text baseline, HTML, and timestamps in IndexedDB on the current browser profile and site origin.
- The compact history sidebar reopens or deletes individual conversions. HTML edits save automatically; failures are shown without preventing download. This is local storage, not cross-device sync or a backup. Clearing site data removes history, and browser storage limits apply.
- The review view shows a rendered PDF page beside the complete HTML output or source editor. Scroll together is enabled by default and links the previews using approximate passage/page coordinates; disable it for independent review. The PDF pane scrolls continuously and renders nearby pages on demand. Existing saved conversions fall back to matching their stored page text. Edits, removed text, and moved footnotes can make alignment approximate. Mapping data stays outside the exported HTML. On small screens the panels stack.
- An advisory automatic review runs after PDF conversion, reopening, and HTML edits. Text check lists potentially missing passages (two consecutive unmatched 12-word samples), excess repeated long paragraphs, broken internal links, duplicate IDs, and notes without incoming references. Source-page buttons open passage locations. Page sample counts match against the entire HTML, not a page-local output: they do not establish reading order or page fidelity. Short trailing passages are not sampled. Native extraction errors, removed headers, math, and text inside chart/table images can cause differences; no removals are automatically excused. The report never modifies HTML or blocks downloads, and failures leave conversion/export available. No new recognition model or server processing is involved.
- Text check compares normalized word occurrence counts between selected PDF pages and the current HTML. Fewer/extra occurrences are listed, with page links for source words. It does not compare order, structure, layout, images, or table semantics. Removed headers and changed numbering are expected differences; a zero count is not proof of an accurate conversion.
- Saved history remains in the user's browser during Cloud Run deployments. Different service URL hostnames have separate history.

Unconverted mathematical expressions make the result an explicitly labeled draft, with a `.draft.zip` download name. The collapsed Review equations control links each expression to its PDF page and accepts editable TeX, checks MathJax syntax, and saves the correction locally. Syntax validation cannot verify mathematical meaning. Draft downloads still contain unresolved markers; they are not publish-ready.

`public/reviewed-equations.json` contains one manually transcribed correction for wp26-1 physical page 32, the Delta formula with two underbraces. It applies on conversion or reopening history only when both the PDF SHA-256 and extracted-expression SHA-256 match. Existing TeX is never overwritten. This is an explicit document-specific editorial correction, not a general equation recognition solution.

## Word documents

The file picker and drop area accept `.pdf` and `.docx`. Older binary `.doc` files must be saved as `.docx` in Word first. The browser uses bundled Mammoth and JSZip, with no upload, account, or paid service. Word paragraphs, headings (normalized to h2), lists, blockquotes, tables, footnotes and endnotes are converted to a clean HTML fragment. Notes use the site's `_ftn` / `_ftnref` links and appear under a final Notes heading. External or unsafe link protocols and generated styling are removed.

Native Word Office Math (OMML) is read structurally into editable inline/display TeX before the document reader runs. Supported structures include fractions, scripts, radicals, accents, bars, integrals/sums with limits, delimiters, functions, matrices, equation arrays and labeled braces. No equation images or OCR are used for this path. Unsupported math structures fail conversion explicitly instead of silently dropping the math. Legacy embedded objects must be converted in Word first. Embedded PNG, JPEG, GIF, and WebP images are preserved with Word alt text and included as separate files in the ZIP. Unsupported image formats stop conversion with an explanation. Missing alt text produces a review notice. An equation stored only as a picture remains a picture; it cannot be recovered from native math structure. Complex documents still need review.

Word conversions and edits save in browser history with the original DOCX, and can be reopened or reconverted. The HTML preview supports fullscreen. Original-page preview, linked scrolling and PDF text comparison are PDF-only; Word uses a single HTML preview pane. PDF page-navigation and range controls have been removed; the PDF pane remains scrollable and uploads convert the full document.

Word regression fixtures exercise native inline fractions with a dot accent, a display integral, a labeled underbrace, headings, quotes, lists, tables, linked footnotes/endnotes, unsafe hyperlinks, saved edits/reconversion, legacy .doc guidance, and unsupported-math errors. No user-provided Word file was present for this implementation.

## Automatic PDF parser

The local CPU mode uses MinerU 4.0.5 for layout, text, math, and tables, supplemented by PDF math-font object bounds to recover small or unmapped inline glyphs. Complex display formulas are re-read with Docling CodeFormulaV2. Explanatory underbrace labels are retained from the first pass when the second pass drops their text. Both recognizers run locally with outbound model access disabled after setup. No PDF is sent to an inference API. Temporary PDF/crop files are deleted after the request; browser history remains local.

Install with Python 3.10+ and Node 22.13+. The CPU environments and model caches require several GB of disk and RAM:

```sh
python3 -m venv .pdf-runtime/venv
.pdf-runtime/venv/bin/python -m pip install -r requirements-pdf.txt
.pdf-runtime/venv/bin/python scripts/setup-pdf-parser.py
python3 -m venv .pdf-runtime/formula-venv
.pdf-runtime/formula-venv/bin/python -m pip install --upgrade pip
.pdf-runtime/formula-venv/bin/python -m pip install torch==2.14.0+cpu torchvision==0.29.0+cpu --index-url https://download.pytorch.org/whl/cpu
.pdf-runtime/formula-venv/bin/python -m pip install transformers==4.57.6 accelerate==1.15.0 pillow==12.3.0
.pdf-runtime/formula-venv/bin/python scripts/setup-equation-parser.py
PORT=8081 npm run start:math
```

Open http://localhost:8081. The parser converts all pages, including inline math. The same upload, side-by-side PDF/HTML preview, fullscreen, and browser history remain available. The page explains server processing when this mode is enabled. At most one PDF runs at a time, with a 30 MB/100-page limit and a 60-minute processing timeout. Closing the request stops its worker processes. Generated HTML has no equation images, stylesheets, page wrappers, or transcription markers. Detected charts, figures, and tables are cropped directly from the original PDF at double resolution and embedded as PNG images. Captions and source notes remain text. Recognized table cell contents are not used. Article equations remain editable TeX.

`pdf-parser-models.json` pins the CPU model revision and checksums. CodeFormulaV2 is pinned to `ecedbe111d15c2dc60bfd4a823cbe80127b58af4`. See `THIRD_PARTY_NOTICES.md` and `licenses/` for model provenance and license details. `.pdf-runtime` is excluded from Cloud Run uploads.

Reproduce the complete real-file portal check with `TEST_URL=http://127.0.0.1:8081 node scripts/check-math-portal.mjs wp26-1.pdf`. It saves the resulting HTML and a rendering audit under `output/`; that audit checks renderability, not mathematical equivalence. `scripts/inspect-structured-pdf.mjs` checks a saved MinerU JSON result without rerunning recognition.

The automatic backend is deployed on the live Cloud Run service. Its local container passed the four-page equation regression with 2 CPUs and a 4 GiB memory limit (about 3.53 GiB peak RAM). An 84-page local run recognized 276 expressions; after automatic crop/retry corrections, the full preview had no MathJax rendering errors, equation images, or transcription markers, and reopened from browser history. See `output/MATH-STATUS.md` for the audit and remaining recognition/footnote limitations. Cloud processing may incur charges even though no paid recognition API is used.

## Site MathJax compatibility

The destination site uses MathJax 2.7.0 with `TeX-AMS-MML_HTMLorMML`, inline `$...$` and `\(...\)`, and `processEscapes: true`. Generated equations use `\(...\)` and `\[...\]`; generated prose currency is escaped as `\$` to prevent the site's dollar delimiters from consuming ordinary sentences. The local preview displays escaped currency normally. Export contains no MathJax loader or configuration, because the site supplies those. Existing manually edited history is not rewritten for currency.

`scripts/check-site-mathjax.mjs output/wp26-1-site.html` tests the exact supplied CDN URL/configuration. This is an optional online compatibility check; normal local recognition and preview remain offline. `tests/site-math.spec.js` verifies currency protection, unchanged TeX, idempotence, and preview rendering. The full-paper site-compatible output and audit are under `output/`.

Automatic PDF note references are recovered from the original PDF text and coordinates before equation grouping. Source context restores omitted markers and distinguishes references from ordinary figure numbers. `tests/pdf-footnotes.spec.js` verifies all 25 wp26-1 references, matching endnotes/backlinks, actual navigation with synchronized scrolling, and reopening history. Existing saved results retain their original HTML until reconverted.

PDF visual regression: wp26-1 exports 41 chart images, four table images, and one figure image. The HTML is self-contained (about 6.7 MB), and images survive browser-history reopening. Existing saved results must be reconverted to include the images. Word tables remain native structured content.

## Share links

The Share button publishes the current converted HTML and its embedded chart/table images to a private Cloud Storage bucket. The original PDF or Word file stays in browser history and is not part of the shared record. Anyone holding the unguessable URL can view the result and download its HTML/images ZIP, without an account. Shared HTML is displayed in a script-disabled iframe; external requests and forms are blocked. The bucket is not public and no storage credentials or management tokens are returned by the read API.

Links expire seven days after publishing. Clicking Share again publishes edits at the same URL and renews the expiry. Stop sharing revokes that URL. The management token stays with the saved conversion in the creator’s browser; clearing browser storage removes the ability to update/revoke it, though the shared link still expires. Sharing does not send a message or email to anyone. Shared results are limited to 24 MB.

Cloud configuration: `PDF_SHARE_BUCKET=pdf-html-shares-250215174656`; the service account has `roles/storage.objectUser` on this bucket only. Uniform bucket access and public-access prevention are enabled. The seven-day object deletion policy is in `deployment/share-lifecycle.json`; soft delete is disabled for these temporary copies. Runtime expiry is enforced immediately even if lifecycle cleanup runs later. Tests use a temporary local directory via `PDF_SHARE_DIR` instead of cloud storage.

Normal dollar signs are exported as `<span class="tex2jax_ignore">$</span>` so currency is readable before MathJax loads and cannot become a `$...$` equation delimiter. Inline/display TeX remains untouched. Previously escaped prose currency is normalized on reopening saved results. Verified against the site’s MathJax 2.7.0 configuration, including linked amounts, single/double escapes, and currency inside genuine TeX.

PDF heading correction uses native font evidence after recognition. Unnumbered, body-sized italic-only blocks mislabeled as titles become emphasized paragraphs (`<p><em>…</em></p>`). Bold, larger, numbered headings and document titles are retained. The correction does not infer fonts where native text evidence is absent. Older saved conversions need reconversion to apply this parsing change. Regression coverage includes real wp26-1 font objects and retained section headings.

The structured PDF renderer recovers lists when the parser returns separate paragraphs with literal bullets or standalone leading TeX `\bullet`/`\textbullet` markers. These become semantic `<ul><li>` structures; consecutive numeric markers become `<ol><li>` with the correct starting number. PDF indentation preserves nested items. Actual inline expressions remain TeX, and ordinary following paragraphs stay outside the list. Existing saved results require reconversion to apply the updated rendering.

## Repository contents

Source code, tests, and model setup scripts are tracked. Uploaded PDF/DOCX files, generated conversions (`output/`), downloaded model environments (`.pdf-runtime/`), built vendor assets, and dependencies are excluded. Run `npm ci` and `npm run build` to prepare browser assets. Follow Automatic PDF parser setup before `npm start`; use `npm run start:browser` for Word conversion and the older browser-only PDF path without the Python models. The full regression suite requires the named baseline PDFs locally; they are not bundled in this repository.

The September 23 release preserves embedded Word images and their alt text, exports them in the existing ZIP, and uses associated PDF captions for image descriptions. Eighteen browser checks passed against the staged cloud revision. Recognition models were unchanged; these checks do not establish mathematical accuracy for every PDF expression.

## Italics patch 1.2.1 (live September 24, 2026)

Automatic PDF conversion now recovers inline italics, including citation titles in footnotes, from native PDF font evidence. It aligns source text within the detected block, requires a high overall match and unique matching context, and splits only the matched text spans. Text, hyperlink targets, existing styles, note numbering, and TeX are preserved. Scans, ambiguous matches, and unreadable native text are left unchanged rather than guessed. This patch targets the automatic parser; the older browser-only PDF converter is unchanged. Reconvert saved PDFs to recover italics; saved HTML is not rewritten.

Validation: all 10 Python tests passed, including real PDF citation fonts and mixed styled/plain notes. The actual local automatic parser converted `output/italics-smoke.pdf`; preview and ZIP retained italic citation text and both note links. The browser suite passed the new italic export check and 42 other checks; the share API check passed on rerun with matching test storage. Two existing local UI checks remain failing (mobile overflow and the missing-word page button); those pending UI changes are excluded from this patch release.

The prepared release at `/tmp/pdf-italics-release-1.2.1` contains only the updated font-recovery script, the current live page with a v1.2.1 label, and Docker/Cloud Build configuration. It derives from production image digest `135dd38137335db79773129038cb352a9393a7c74ee9406aac43b2685b25b001`. No PDFs, outputs, models, or unrelated local changes are in the upload. After user approval, Cloud Build `dac543f1-409f-4e5e-8949-df37713f1e63` produced image digest `2ee9e2d8e9d546900559d04368212569995019b8bf22d7ed9ddf17a12bca93ca`. The staged revision passed `scripts/check-italics-cloud.mjs`: italic citation text survived the preview and downloaded ZIP, and both footnote links matched. Revision `pdf-to-html-italics-121-20260924` now receives 100% of traffic and the `live` tag; the public URL displays v1.2.1. The prior revision remains available for rollback.


## Layout patch 1.2.2 (live September 24, 2026)

The conversion output now spans the full workspace row beneath history and upload settings. Mobile uses a single-column grid with no horizontal overflow. This release changes only the live HTML layout and stylesheet and retains the v1.2.1 parser/italics fix. Other pending local feature changes are not bundled into this design release.

Cloud Build `fee753ed-a177-4e41-821d-2aa105ba9136` produced image `sha256:31d53deea3140276ef82215f695c9a14c84ee84e8c43bf3f57797d691f0b0067`. Revision `pdf-to-html-layout-122-20260924` receives 100% of public traffic and the `live` tag. Staged checks at 1440px and 390px verified full-row output, no overflow, Word conversion, editing and ZIP download. The generated PDF check also verified italic citation text and forward/back footnote links in preview and ZIP. Scripts: `scripts/check-layout-cloud.mjs` and `scripts/check-italics-cloud.mjs`.
