// Plain-English categorization for the Text check.
// Turns the raw "fewer/extra word" lists into a few human-readable buckets so a
// non-expert can tell benign conversion side-effects (math written as TeX,
// figure numbers, removed page headers) apart from prose that may truly be missing.
// Pure functions only, no DOM. Never throws.

// LaTeX command names and Greek letters that show up as "extra" words once math
// is converted to TeX. These are expected, not real added prose.
const LATEX_TOKENS = new Set([
 // Greek
 'alpha','beta','gamma','delta','epsilon','varepsilon','zeta','eta','theta','vartheta',
 'iota','kappa','lambda','mu','nu','xi','omicron','pi','varpi','rho','varrho','sigma',
 'varsigma','tau','upsilon','phi','varphi','chi','psi','omega',
 // structures / environments
 'frac','cfrac','dfrac','tfrac','binom','sqrt','begin','end','aligned','align','array',
 'matrix','pmatrix','bmatrix','vmatrix','cases','split','gather','substack','tag','label',
 // operators / relations
 'sum','prod','int','iint','oint','lim','limits','nolimits','inf','sup','min','max','arg',
 'log','ln','exp','det','dim','deg','gcd','hom','ker','sin','cos','tan','cot','sec','csc',
 'sinh','cosh','tanh','partial','nabla','infty','cdot','cdots','ldots','vdots','ddots',
 'times','div','pm','mp','ast','star','circ','bullet','oplus','ominus','otimes','odot',
 'leq','geq','neq','approx','equiv','sim','simeq','cong','propto','subset','supset',
 'subseteq','supseteq','forall','exists','emptyset','angle','perp','parallel',
 // accents / delimiters / sizing
 'left','right','big','bigg','bigl','bigr','langle','rangle','lfloor','rfloor','lceil',
 'rceil','hat','bar','tilde','vec','dot','ddot','overline','underline','widehat',
 'widetilde','overbrace','underbrace','overrightarrow',
 // fonts / text
 'mathbb','mathrm','mathcal','mathbf','mathit','mathfrak','mathsf','mathtt','boldsymbol',
 'text','textrm','textbf','textit','operatorname','displaystyle','textstyle','scriptstyle',
 // spacing / arrows / misc
 'quad','qquad','hspace','vspace','phantom','rightarrow','leftarrow','leftrightarrow',
 'longrightarrow','longleftarrow','longleftrightarrow','uparrow','downarrow','mapsto',
 'to','implies','iff','prime','atop','choose','because','therefore','pmod','bmod','mod',
]);

// Very common English words. When these show up as small count differences they are
// almost always counting noise (from removed headers/notes or math), not lost prose.
const STOPWORDS = new Set([
 'the','a','an','and','or','of','to','in','on','at','by','for','with','as','is','are',
 'was','were','be','been','being','this','that','these','those','it','its','from','into',
 'we','our','their','they','he','she','his','her','not','but','if','then','than','so',
 'which','who','whom','what','where','when','also','can','may','will','would','could',
 'should','has','have','had','do','does','did','no','all','any','each','more','most',
]);

export function isMathToken(word) {
 if (!word) return false;
 if (word.length === 1 && /[a-z]/i.test(word)) return true; // single-letter math variable
 return LATEX_TOKENS.has(word.toLowerCase());
}

export function isNumberToken(word) {
 return /^\d[\d.,]*$/.test(word || '');
}

const occ = list => list.reduce((n, item) => n + item.count, 0);

// Given the {missing,added} shape from compareText, return grouped buckets plus a
// short list of items actually worth a human look.
export function classifyCheck({ missing = [], added = [] } = {}) {
 const extraMath = [], extraNumbers = [], extraOther = [];
 for (const item of added) {
  if (isMathToken(item.word)) extraMath.push(item);
  else if (isNumberToken(item.word)) extraNumbers.push(item);
  else extraOther.push(item);
 }
 const missNumbers = [], missMath = [], missStop = [], missWords = [];
 for (const item of missing) {
  if (isNumberToken(item.word)) missNumbers.push(item);
  else if (isMathToken(item.word)) missMath.push(item);
  else if (STOPWORDS.has(item.word)) missStop.push(item);
  else missWords.push(item);
 }
 // "Worth a look" = real prose words fewer in the HTML, plus non-math extra words,
 // biggest differences first.
 const notable = [
  ...missWords.map(i => ({ ...i, direction: 'fewer' })),
  ...extraOther.map(i => ({ ...i, direction: 'extra' })),
 ].sort((a, b) => b.count - a.count);
 return {
  extraMath: occ(extraMath), extraNumbers: occ(extraNumbers), extraOther,
  missNumbers: occ(missNumbers), missMath: occ(missMath),
  missStop: occ(missStop), missWords,
  notable,
 };
}

// A one-line plain-English verdict describing the balance of the buckets.
export function checkVerdict(groups) {
 const realCount = groups.notable.reduce((n, i) => n + i.count, 0);
 const parts = [];
 const mathExtra = groups.extraMath + groups.missMath;
 if (mathExtra) parts.push(`${mathExtra} are equations rewritten as TeX (like α→\\alpha, \\frac, \\begin{aligned}) — expected`);
 const numbers = groups.extraNumbers + groups.missNumbers;
 if (numbers) parts.push(`${numbers} are numbers from figures and equation labels — usually fine`);
 if (groups.missStop) parts.push(`${groups.missStop} are common words with tiny count gaps (removed headers/notes) — usually fine`);
 const lead = realCount === 0
  ? 'Looks healthy: every difference is explained by math, numbers, or removed page furniture.'
  : realCount <= 12
   ? `Mostly expected. Only ${realCount} plain-word difference${realCount === 1 ? '' : 's'} may be worth a glance (listed below).`
   : `${realCount} plain-word differences may be worth a glance (listed below). The rest are expected.`;
 return parts.length ? `${lead} The rest: ${parts.join('; ')}.` : lead;
}
