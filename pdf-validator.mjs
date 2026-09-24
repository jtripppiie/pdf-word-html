// Advisory, warn-only validation of the parser JSON payload. Never throws and
// never blocks a conversion; it only surfaces issues for logging and review.
// Three concerns: parser-output schema, equation (TeX) well-formedness, and
// self-contained fidelity/sanity signals derivable from the payload alone.

const MAX_ISSUES = 300;

// Block/span types the HTML renderer knows how to consume. Unknown types are
// reported as warnings (the parser may add types) rather than hard failures.
const KNOWN_BLOCK_TYPES = new Set([
  'header', 'footer', 'page_number', 'page_footnote',
  'text', 'ref_text', 'doc_title', 'paragraph_title', 'aside_text',
  'equation', 'list', 'index', 'table', 'image', 'chart',
  'table_body', 'chart_body', 'image_body',
  'image_caption', 'image_footnote', 'table_caption', 'table_footnote',
  'chart_caption', 'chart_footnote',
]);
const KNOWN_SPAN_TYPES = new Set([
  'text', 'code_inline', 'equation_inline', 'hyperlink',
  'table_caption', 'table_body', 'table_footnote',
  'chart_caption', 'chart_body', 'chart_footnote',
  'image_caption', 'image_body', 'image_footnote',
]);
// Blocks that carry no reader-visible prose; a page with only these is "empty".
const NON_CONTENT_TYPES = new Set(['header', 'footer', 'page_number']);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

// Structural bracket/environment balance of a TeX string. Returns a short
// reason when malformed, or null when it looks well-formed.
function texProblem(tex) {
  if (typeof tex !== 'string' || !tex.trim()) return 'empty equation';
  let braces = 0;
  for (let i = 0; i < tex.length; i++) {
    const ch = tex[i];
    if (ch === '\\') { i++; continue; } // skip the escaped character, e.g. \{ \} \\
    if (ch === '{') braces++;
    else if (ch === '}') { braces--; if (braces < 0) return 'unbalanced braces'; }
    else if (ch === '$') return 'stray "$" delimiter';
  }
  if (braces !== 0) return 'unbalanced braces';
  const lefts = (tex.match(/\\left(?![a-zA-Z])/g) || []).length;
  const rights = (tex.match(/\\right(?![a-zA-Z])/g) || []).length;
  if (lefts !== rights) return 'unmatched \\left/\\right';
  const begins = [...tex.matchAll(/\\begin\s*\{([^{}]*)\}/g)].map(m => m[1]);
  const ends = [...tex.matchAll(/\\end\s*\{([^{}]*)\}/g)].map(m => m[1]);
  if (begins.length !== ends.length) return 'unmatched \\begin/\\end';
  if (begins.sort().join('\u0000') !== ends.sort().join('\u0000')) return 'mismatched \\begin/\\end environment';
  return null;
}

// True for degenerate "equations" that are almost certainly mis-detected list
// bullets or stray single characters rather than real math. Informational only.
function isDegenerateEquation(tex) {
  const trimmed = tex.trim();
  return trimmed === '\\bullet' || trimmed === '\\cdot' || /^[A-Za-z0-9]$/.test(trimmed);
}

export function validateParserOutput(payload) {
  const issues = [];
  const counts = { pages: 0, blocks: 0, equations: 0, notes: 0, images: 0, textChars: 0, emptyPages: 0, emptyTextBlocks: 0, degenerateEquations: 0 };
  let truncated = false;
  const add = (severity, kind, message, extra = {}) => {
    if (issues.length >= MAX_ISSUES) { truncated = true; return; }
    issues.push({ severity, kind, message, ...extra });
  };

  try {
    if (!payload || typeof payload !== 'object') {
      add('error', 'schema', 'Parser output is not an object.');
      return finalize(issues, counts, truncated);
    }
    if (payload.schema !== 'docvortex.middle') {
      add('error', 'schema', `Unexpected schema: ${JSON.stringify(payload.schema)}`);
    }
    if (!Array.isArray(payload.pages) || payload.pages.length === 0) {
      add('error', 'schema', 'Parser output has no pages array.');
      return finalize(issues, counts, truncated);
    }
    if (payload.pages.length > 100) {
      add('warning', 'fidelity', `Document has ${payload.pages.length} pages (over the 100-page limit).`);
    }

    // Walk inline spans of a block, validating type/content and math.
    const walkSpans = (spans, pageNumber) => {
      if (!Array.isArray(spans)) return;
      for (const span of spans) {
        if (!span || typeof span !== 'object' || typeof span.type !== 'string') {
          add('warning', 'schema', 'Inline span is missing a type.', { page: pageNumber });
          continue;
        }
        if (!KNOWN_SPAN_TYPES.has(span.type)) {
          add('warning', 'schema', `Unknown inline span type: ${span.type}`, { page: pageNumber });
        }
        if (span.type === 'equation_inline') {
          counts.equations++;
          const problem = texProblem(span.content);
          if (problem) add(problem === 'empty equation' ? 'error' : 'warning', 'math', `Inline equation ${problem}.`, { page: pageNumber, excerpt: excerpt(span.content) });
          else if (typeof span.content === 'string' && isDegenerateEquation(span.content)) counts.degenerateEquations++;
        } else if (span.type === 'hyperlink') {
          if (Array.isArray(span.content)) walkSpans(span.content, pageNumber);
        } else if (typeof span.content === 'string') {
          counts.textChars += span.content.length;
        }
      }
    };

    const validateBbox = (bbox, pageNumber, type) => {
      if (bbox === undefined) return;
      if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(isFiniteNumber)) {
        add('warning', 'schema', `Block "${type}" has a malformed bbox.`, { page: pageNumber });
        return;
      }
      const [x0, y0, x1, y1] = bbox;
      const inRange = v => v >= -0.02 && v <= 1.02; // normalized coordinates, small tolerance
      if (![x0, y0, x1, y1].every(inRange)) add('warning', 'schema', `Block "${type}" bbox is outside the page.`, { page: pageNumber });
      if (x1 < x0 || y1 < y0) add('warning', 'schema', `Block "${type}" bbox has inverted coordinates.`, { page: pageNumber });
    };

    // Recursively validate a block and its children.
    const walkBlock = (block, pageNumber) => {
      counts.blocks++;
      if (!block || typeof block !== 'object' || typeof block.type !== 'string') {
        add('warning', 'schema', 'Block is missing a type.', { page: pageNumber });
        return;
      }
      const { type } = block;
      if (!KNOWN_BLOCK_TYPES.has(type)) add('warning', 'schema', `Unknown block type: ${type}`, { page: pageNumber });
      validateBbox(block.bbox, pageNumber, type);

      if (type === 'page_footnote') counts.notes++;
      if (['image', 'chart', 'image_body', 'chart_body'].includes(type)) counts.images++;

      if (type === 'equation') {
        counts.equations++;
        const problem = texProblem(block.content);
        if (problem) add(problem === 'empty equation' ? 'error' : 'warning', 'math', `Display equation ${problem}.`, { page: pageNumber, excerpt: excerpt(block.content) });
        else if (typeof block.content === 'string' && isDegenerateEquation(block.content)) counts.degenerateEquations++;
        return;
      }

      if (typeof block.content === 'string') {
        if (['text', 'ref_text', 'doc_title', 'paragraph_title', 'aside_text'].includes(type) && !block.content.trim()) counts.emptyTextBlocks++;
        counts.textChars += block.content.length;
      } else if (Array.isArray(block.content)) {
        const childBlocks = block.content.filter(c => c && typeof c === 'object' && KNOWN_BLOCK_TYPES.has(c.type) && (Array.isArray(c.content) || c.type.endsWith('_body')));
        if (childBlocks.length && ['list', 'index', 'table', 'image', 'chart'].includes(type)) {
          for (const child of block.content) walkBlock(child, pageNumber);
        } else {
          walkSpans(block.content, pageNumber);
        }
        for (const nested of block.nested_lists || []) walkBlock(nested, pageNumber);
      } else if (block.content !== undefined && block.content !== null) {
        add('warning', 'schema', `Block "${type}" has non-string, non-array content.`, { page: pageNumber });
      }
    };

    for (const page of payload.pages) {
      counts.pages++;
      const pageNumber = isFiniteNumber(page?.page_idx) ? page.page_idx + 1 : counts.pages;
      if (!page || typeof page !== 'object') { add('warning', 'schema', 'Page entry is not an object.', { page: pageNumber }); continue; }
      if (!isFiniteNumber(page.page_idx)) add('warning', 'schema', 'Page is missing a numeric page_idx.', { page: pageNumber });
      if (!Array.isArray(page.blocks)) { add('warning', 'schema', 'Page has no blocks array.', { page: pageNumber }); continue; }
      const contentBlocks = page.blocks.filter(b => b && typeof b === 'object' && !NON_CONTENT_TYPES.has(b.type));
      if (contentBlocks.length === 0) { counts.emptyPages++; add('warning', 'fidelity', 'Page has no readable content blocks.', { page: pageNumber }); }
      for (const block of page.blocks) walkBlock(block, pageNumber);
    }

    // Document-level fidelity signals.
    if (counts.textChars < 40 * counts.pages && counts.textChars < 400) {
      add('warning', 'fidelity', `Very little text extracted (${counts.textChars} characters across ${counts.pages} pages); the PDF may be scanned or image-only.`);
    }
    if (counts.emptyTextBlocks > 0) {
      add('info', 'fidelity', `${counts.emptyTextBlocks} text block(s) are empty.`);
    }
    if (counts.degenerateEquations > 0) {
      add('info', 'math', `${counts.degenerateEquations} equation(s) are a single symbol (possible mis-detected bullets).`);
    }
  } catch (error) {
    add('error', 'validator', `Validator error: ${error?.message || error}`);
  }

  return finalize(issues, counts, truncated);
}

function excerpt(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
  return text.length > 120 ? text.slice(0, 117) + '…' : text;
}

function finalize(issues, counts, truncated) {
  const severity = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) severity[issue.severity] = (severity[issue.severity] || 0) + 1;
  counts.issues = issues.length;
  return { ok: severity.error === 0, severity, counts, truncated, issues };
}
