/* Jin Assessment Studio — exam formats
   • Scantron  : the classic builder (unchanged)
   • One page  : one long bond sheet (8.5 × 13 in) printed back to back, school quiz layout, 30 points by default, TOS optional
   • Google Forms: Google-Forms-style builder, exported as an Apps Script that creates the quiz in Google Forms, TOS not needed */
'use strict';
const FORMATS = {
  scantron: { n: 'Scantron', icon: 'grid', d: 'Machine-scored answer sheet. The classic builder, numbered across the whole exam.', tos: 'TOS required', tc: 'gold' },
  onepage: { n: 'One page', icon: 'file', d: 'One long bond sheet printed back to back. Each test restarts its numbering. 30 points by default.', tos: 'TOS optional', tc: '' },
  gforms: { n: 'Google Forms', icon: 'chat', d: 'Build questions the way Google Forms does, then send them to Google Forms in one step.', tos: 'No TOS needed', tc: 'green' }
};
/* true in the Windows desktop app (Electron); false on the website, where web-host.js stands in for the desktop bridge */
const IS_DESKTOP = !!(window.jasHost && !window.jasHost.web);
const pdfDoneToast = r => toast(IS_DESKTOP ? 'PDF saved: ' + r.path : 'Tip: in the print dialog, set Destination to “Save as PDF”.', IS_DESKTOP ? 'ok' : 'info');
const fmtOf = ex => (ex && FORMATS[ex.format]) ? ex.format : 'scantron';
const curFmt = () => fmtOf(curExam());
const OP_TYPES = new Set(['mtf', 'essay', 'seq', 'table', 'crossword']);
const GTYPES = new Set(['gmc', 'gcb', 'gdd', 'gsa', 'gpa']);
const GOPT = new Set(['gmc', 'gcb', 'gdd']);
Object.assign(TYPE_NAMES, { mtf: 'Modified true or false', essay: 'Essay / case study', seq: 'Timeline (arrange in order)', table: 'Complete the table', crossword: 'Crossword puzzle', gmc: 'Multiple choice', gcb: 'Checkboxes', gdd: 'Dropdown', gsa: 'Short answer', gpa: 'Paragraph' });
Object.assign(TYPE_SHORT, { mtf: 'Modified T/F', essay: 'Essay / case', seq: 'Timeline', table: 'Table', crossword: 'Crossword', gmc: 'Multiple choice', gcb: 'Checkboxes', gdd: 'Dropdown', gsa: 'Short answer', gpa: 'Paragraph' });
const ptsNum = n => Math.round((+n || 0) * 100) / 100;
const fmtPts = n => { const v = ptsNum(n); return v + ' ' + (v === 1 ? 'pt' : 'pts'); };
const rgH = a => a ? (a[0] === a[1] ? String(a[0]) : a[0] + '-' + a[1]) : '';
function mulberry32(a) { a = a >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffleWith(arr, rnd) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

/* ---------- new question types: defaults ---------- */
function fmtDefaults(q, type) {
  if (type === 'mtf') q.pts = 2;
  else if (type === 'essay') { q.pts = 4; q.boxH = 1.6; q.layout = 'stack'; }
  else if (type === 'seq') { q.head = ''; q.events = ['', '', '', '']; q.ppe = 1; q.seed = 1 + Math.floor(Math.random() * 9973); }
  else if (type === 'table') { q.cols = ['Column 1', 'Column 2', 'Column 3']; q.cells = [['', '', ''], ['', '', '']]; q.pts = 3; q.boxH = 0; }
  else if (type === 'crossword') { q.words = Array.from({ length: 5 }, () => ({ w: '', c: '' })); q.ppe = 1; q.seed = 1; }
  else if (GTYPES.has(type)) { q.opts = GOPT.has(type) ? ['Option 1'] : []; q.ansMulti = []; q.req = true; q.desc = ''; }
  if (type === 'prob') { q.boxH = 2.4; q.pg = ''; q.pe = ''; q.ps = ''; q.pbd = true; }
  if (type === 'mc') q.cols = 'auto';
}
const __newQ = newQ;
newQ = function (type = 'mc', o = {}) { const q = __newQ(type, {}); fmtDefaults(q, type); return Object.assign(q, o); };

const seqEvents = q => (q.events || []).map(s => String(s || '').trim()).filter(Boolean);
const cwClean = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
const cwWords = q => (q.words || []).filter(x => cwClean(x.w).length >= 2);
function seqOrder(q) {
  const n = seqEvents(q).length, idx = [...Array(n).keys()]; if (n < 2) return idx;
  const o = shuffleWith(idx.slice(), mulberry32(q.seed || 7));
  if (o.every((v, i) => v === i)) o.push(o.shift());
  return o;
}
const tableHasBlank = q => (q.cells || []).some(r => (r || []).some(c => /\[\[[\s\S]*?\]\]/.test(c || '')));

/* ---------- hooks used by exam.js, core.js and others ---------- */
function fmtWeight(q) {
  if (!q) return 0;
  if (q.type === 'seq') return ptsNum(seqEvents(q).length * (+q.ppe || 0));
  if (q.type === 'crossword') return ptsNum(CW.layoutOf(q).placed.length * (+q.ppe || 0));
  if (q.type === 'prob') return Math.max(0.25, +q.pts || 1);
  const p = +q.pts; return isNaN(p) || p < 0 ? 1 : p;
}
function fmtHasKey(q) {
  switch (q.type) {
    case 'mtf': case 'gsa': return !!String(q.ansText || '').trim();
    case 'essay': case 'gpa': return true;
    case 'seq': return seqEvents(q).length >= 2;
    case 'table': return tableHasBlank(q);
    case 'crossword': return CW.layoutOf(q).placed.length >= 2;
    case 'gmc': case 'gdd': { const i = LET.indexOf(q.ans || '?'); return i > -1 && i < (q.opts || []).length && !!String(q.opts[i] || '').trim(); }
    case 'gcb': return (q.ansMulti || []).some(i => i < (q.opts || []).length);
  }
  return undefined;
}
function fmtIsEmpty(q) {
  if (q.type === 'seq') return seqEvents(q).length < 2;
  if (q.type === 'table') return !(q.cells || []).some(r => (r || []).some(c => String(c || '').trim()));
  if (q.type === 'crossword') return cwWords(q).length < 2;
  return undefined;
}
function fmtAnswerOf(q) {
  if (q.type === 'mtf' || q.type === 'gsa') return q.ansText || '—';
  if (q.type === 'essay' || q.type === 'gpa') return q.ansText || '(scored with a rubric)';
  if (q.type === 'seq') { const ev = seqEvents(q); return seqOrder(q).map(j => j + 1).join(', ') + (ev.length ? '  (numbers to write, top to bottom)' : ''); }
  if (q.type === 'table') return (q.cells || []).flat().flatMap(c => [...String(c || '').matchAll(/\[\[([\s\S]*?)\]\]/g)].map(m => m[1])).join('; ') || '—';
  if (q.type === 'crossword') return CW.layoutOf(q).placed.map(p => p.num + (p.dir ? 'D' : 'A') + ' ' + p.word).join(', ') || '—';
  if (q.type === 'gmc' || q.type === 'gdd') { const i = LET.indexOf(q.ans || '?'); return i > -1 ? LET[i] + '. ' + (q.opts[i] || '') : '—'; }
  if (q.type === 'gcb') return (q.ansMulti || []).slice().sort().map(i => LET[i] + '. ' + (q.opts[i] || '')).join('; ') || '—';
  return undefined;
}
function fmtKidTypes(q) {
  const f = curFmt();
  if (GTYPES.has(q.type)) return ['gmc', 'gcb', 'gdd', 'gsa', 'gpa'];
  if (f === 'onepage' || OP_TYPES.has(q.type)) { const base = ['mtf', 'mc', 'ident', 'prob', 'essay']; return base.includes(q.type) ? base : [q.type]; }
  return null;
}
function fmtPtsHTML(q) {
  if (q.type === 'seq' || q.type === 'crossword') return `<span class="qmeta" data-wt>${fmtPts(weight(q))}</span>`;
  if (curFmt() !== 'scantron' || OP_TYPES.has(q.type)) return `<label class="pts">Points <input type="number" min="0" max="100" step="${curFmt() === 'gforms' ? 1 : 0.5}" data-f="pts" value="${ptsNum(q.pts)}"></label>`;
  return null;
}
/* changeType for anything involving the new formats; returns true when handled */
function fmtChangeType(q, type) {
  const old = q.type, f = curFmt();
  if (!(GTYPES.has(type) || GTYPES.has(old) || OP_TYPES.has(type) || OP_TYPES.has(old) || f !== 'scantron')) return false;
  if (old === type) return true;
  q.type = type;
  const fresh = newQ(type); for (const k in fresh) if (q[k] === undefined) q[k] = fresh[k];
  if (GOPT.has(type)) {
    if (!(q.opts || []).filter(s => String(s).trim()).length) q.opts = ['Option 1'];
    if (type === 'gcb') { if (old !== 'gcb') q.ansMulti = q.ans && LET.indexOf(q.ans) > -1 ? [LET.indexOf(q.ans)] : []; }
    else if (old === 'gcb') q.ans = (q.ansMulti || []).length ? LET[Math.min(...q.ansMulti)] : '';
    else if (!['gmc', 'gdd', 'mc', 'cmc'].includes(old)) q.ans = '';
  } else if (type === 'mc') {
    if (!(q.opts || []).length) q.opts = ['', '', '', ''];
    if (old === 'gcb') q.ans = (q.ansMulti || []).length ? LET[Math.min(...q.ansMulti)] : '';
    else if (!['gmc', 'gdd', 'cmc'].includes(old)) q.ans = '';
  } else if (!GTYPES.has(type)) q.ans = '';
  const def = { mtf: 2, mc: 1, ident: 1, prob: 5, essay: 4 };
  if (f === 'onepage' && def[old] !== undefined && +q.pts === def[old] && def[type] !== undefined) q.pts = def[type];
  if (type === 'prob' && f === 'scantron' && (q.pts || 1) < 2) q.pts = 3;
  if (!q.bloomManual) Classify.autoBloom(q);
  return true;
}

/* ---------- layout for One page and Google Forms ---------- */
function fmtLayout(ex) {
  const f = fmtOf(ex), secs = [], num = {}, pnum = {}, leaves = [], start = Math.max(1, parseInt(ex.start) || 1);
  let n = start - 1, k = 0, cur = null, total = 0;
  const open = (key, title, dir, sq) => { cur = { k: key, title, dir, top: [], pts: 0, items: 0, secId: sq ? sq.id : null, sq: sq || null }; secs.push(cur); k = 0; };
  (ex.items || []).map(Q).filter(Boolean).forEach(t => {
    if (t.type === 'section') { open(t.preset || 'custom', t.title || (f === 'gforms' ? 'Untitled section' : 'TEST'), t.dir || '', t); return; }
    if (!cur) { const key = f === 'onepage' ? opPresetFor(t.type) : 'gform'; const d = f === 'onepage' ? (OPDIR[key] || OPDIR.custom) : ['', '']; open(key, d[0], d[1], null); }
    const lv = isGroup(t) ? kidsOf(t) : [t], from = n + 1;
    lv.forEach(q => {
      const w = weight(q); n++; num[q.id] = [n, n];
      const span = cur.sq && cur.sq.numBy === 'points' && q.type === 'prob' ? Math.max(1, Math.round(w)) : 1;
      pnum[q.id] = [k + 1, k + span]; k += span;
      cur.pts += w; cur.items++; total += w; leaves.push(q);
    });
    if (isGroup(t)) num[t.id] = [from, Math.max(from, n)];
    cur.top.push({ t, leaves: lv });
  });
  secs.forEach(s => s.pts = ptsNum(s.pts));
  return { secs, num, pnum, leaves, total: ptsNum(total), count: n - (start - 1), start, fmt: f };
}

/* =====================================================================
   CROSSWORD
   ===================================================================== */
const CW = {
  cache: new Map(),
  layoutOf(q) {
    const key = JSON.stringify([(q.words || []).map(x => [cwClean(x.w), x.c]), q.seed || 1]);
    let r = this.cache.get(q.id); if (r && r.key === key) return r.res;
    const res = this.build(q.words || [], q.seed || 1); this.cache.set(q.id, { key, res }); return res;
  },
  build(words, seed) {
    const list = words.map((x, i) => ({ word: cwClean(x.w), clue: String(x.c || '').trim(), i })).filter(x => x.word.length >= 2);
    if (!list.length) return { rows: 0, cols: 0, placed: [], skipped: [], cells: [] };
    const rnd = mulberry32(seed * 7919 + 13); let best = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      let order = list.slice();
      if (attempt === 0) order.sort((a, b) => b.word.length - a.word.length || a.i - b.i);
      else { shuffleWith(order, rnd); const L0 = order.reduce((m, x, j) => x.word.length > order[m].word.length ? j : m, 0); if (rnd() < .7) order.unshift(order.splice(L0, 1)[0]); }
      if (seed > 1 && attempt === 0) shuffleWith(order, rnd);
      const r = this.tryOrder(order);
      if (!best || r.placed.length > best.placed.length || (r.placed.length === best.placed.length && r.area < best.area)) best = r;
      if (best.placed.length === list.length && attempt >= 12) break;
    }
    return this.finish(best, list);
  },
  tryOrder(order) {
    const g = new Map(), placed = [], at = (r, c) => g.get(r + ',' + c);
    const can = (w, r, c, dir) => {
      const dr = dir ? 1 : 0, dc = dir ? 0 : 1; let cross = 0;
      if (at(r - dr, c - dc) || at(r + dr * w.length, c + dc * w.length)) return -1;
      for (let i = 0; i < w.length; i++) {
        const rr = r + dr * i, cc = c + dc * i, cell = at(rr, cc);
        if (cell) { if (cell.ch !== w[i] || cell.d[dir]) return -1; cross++; }
        else if (at(rr + dc, cc + dr) || at(rr - dc, cc - dr)) return -1;
      }
      return cross;
    };
    const put = (x, r, c, dir) => { const dr = dir ? 1 : 0, dc = dir ? 0 : 1; for (let i = 0; i < x.word.length; i++) { const k = (r + dr * i) + ',' + (c + dc * i); const cell = g.get(k) || { ch: x.word[i], d: [false, false] }; cell.d[dir] = true; g.set(k, cell); } placed.push({ ...x, row: r, col: c, dir }); };
    let b = { r0: 0, r1: 0, c0: 0, c1: 0 };
    order.forEach((x, idx) => {
      if (!placed.length) { put(x, 0, 0, 0); b = { r0: 0, r1: 0, c0: 0, c1: x.word.length - 1 }; return; }
      let opt = null;
      g.forEach((cell, k) => {
        const [cr, cc] = k.split(',').map(Number);
        for (let i = 0; i < x.word.length; i++) {
          if (x.word[i] !== cell.ch) continue;
          for (const dir of [0, 1]) {
            if (cell.d[dir]) continue;
            const r = dir ? cr - i : cr, c = dir ? cc : cc - i, cross = can(x.word, r, c, dir);
            if (cross < 1) continue;
            const r1 = dir ? r + x.word.length - 1 : r, c1 = dir ? c : c + x.word.length - 1;
            const nb = { r0: Math.min(b.r0, r), r1: Math.max(b.r1, r1), c0: Math.min(b.c0, c), c1: Math.max(b.c1, c1) };
            const h = nb.r1 - nb.r0 + 1, w = nb.c1 - nb.c0 + 1;
            if (h > 22 || w > 22) continue;
            const score = cross * 40 - (h * w) - Math.abs(h - w) * 2;
            if (!opt || score > opt.score) opt = { r, c, dir, score, nb };
          }
        }
      });
      if (opt) { put(x, opt.r, opt.c, opt.dir); b = opt.nb; }
    });
    return { placed, g, b, area: (b.r1 - b.r0 + 1) * (b.c1 - b.c0 + 1) };
  },
  finish(best, list) {
    const { placed, b } = best, rows = b.r1 - b.r0 + 1, cols = b.c1 - b.c0 + 1;
    const cells = Array.from({ length: rows }, () => Array(cols).fill(null));
    placed.forEach(p => { p.row -= b.r0; p.col -= b.c0; for (let i = 0; i < p.word.length; i++) { const r = p.row + (p.dir ? i : 0), c = p.col + (p.dir ? 0 : i); cells[r][c] = { ch: p.word[i], num: 0 }; } });
    const starts = [...new Set(placed.map(p => p.row * 1000 + p.col))].sort((a, b) => a - b);
    placed.forEach(p => { p.num = starts.indexOf(p.row * 1000 + p.col) + 1; cells[p.row][p.col].num = p.num; });
    placed.sort((a, b) => a.num - b.num || a.dir - b.dir);
    const used = new Set(placed.map(p => p.i));
    return { rows, cols, placed, cells, skipped: list.filter(x => !used.has(x.i)) };
  }
};

/* =====================================================================
   ONE PAGE
   ===================================================================== */
const OPDIR = {
  mtf: ['MODIFIED TRUE or FALSE', 'Write TRUE if the statement is correct. Otherwise, write FALSE and replace the underlined word with the correct term to make the statement true.', 'mtf', 5],
  mc: ['MULTIPLE CHOICE', 'Write the CAPITAL letter of the BEST answer. Write your answer in the space provided before each number.', 'mc', 5],
  wordpool: ['WORD POOL', 'Write the correct answer from the word pool on the space provided.', 'ident', 5],
  ident: ['IDENTIFICATION', 'Write the correct term on the space provided before each number.', 'ident', 5],
  prob: ['PROBLEM SOLVING', 'Analyze and solve the following word problems with COMPLETE SOLUTION and apply proper significant figures.', 'prob', 1],
  case: ['CASE STUDY', 'Analyze the following cases and answer the given questions.', 'essay', 1],
  analysis: ['ANALYSIS', 'Look at the diagram and answer the following questions.', 'essay', 2],
  essay: ['ESSAY', 'Read and answer the question with a minimum of three sentences.', 'essay', 1],
  seq: ['TIMELINE', 'Arrange the following events in chronological order, starting with 1 for the earliest event.', 'seq', 1],
  table: ['COMPLETE THE TABLE', 'Complete the table. Show your solution in the space provided and write your final answers in the table.', 'table', 1],
  crossword: ['CROSSWORD PUZZLE', 'Complete the crossword puzzle using the clues below.', 'crossword', 1],
  custom: ['TEST', '', 'mc', 1]
};
const OP_MENU = [['mtf', 'Modified true or false', 'Blank before the number; underline the key word'], ['mc', 'Multiple choice', 'Blank before the number; choices in one or two columns'], ['wordpool', 'Word pool', 'Boxed word pool with blanks'], ['ident', 'Identification', 'Blank before each description'], ['prob', 'Problem solving', 'Given · Equation · Solution boxes'], ['case', 'Case study', 'Question with an answer box (image optional)'], ['analysis', 'Analysis', 'Look at a diagram and answer'], ['essay', 'Essay', 'Question with an answer box'], ['seq', 'Timeline', 'Arrange events in order'], ['table', 'Complete the table', 'Fill in the missing cells'], ['crossword', 'Crossword puzzle', 'Auto-built grid with Across and Down clues'], ['custom', 'Blank test', 'Your own title and directions']];
const opPresetFor = type => ({ mtf: 'mtf', mc: 'mc', ident: 'ident', prob: 'prob', essay: 'essay', seq: 'seq', table: 'table', crossword: 'crossword' })[type] || 'custom';
const OP_PAGE = { w: 8.5, h: 13, top: 0.55, bottom: 0.9, side: 0.85 };
const OP_CW = OP_PAGE.w - 2 * OP_PAGE.side;
const OP_ITEM_CSS = `
.it{display:flex;align-items:flex-start}.lead{flex:none;display:flex;align-items:flex-end;white-space:nowrap}.bl{display:inline-block;border-bottom:1px solid #000;min-height:1.1em;text-align:center;vertical-align:bottom}
.it .n{display:inline-block;margin:0 .45em 0 .2em;min-width:1.1em}.tx{flex:1;min-width:0;text-align:left}.tx img{max-width:100%;max-height:3.2in}
.hl{background:#ffef3a;font-weight:bold}.bl .hl{text-decoration:none;padding:0 2px}
.ch{margin-top:2pt}.ch>div{padding-left:1.35em;text-indent:-1.35em}.ch.two{display:grid;grid-auto-flow:column;grid-template-columns:1fr 1fr;column-gap:.3in}.ch img{display:block;max-width:2.3in;max-height:1.5in;margin:2pt 0 3pt 1.35em}
.pq{text-align:justify;margin-bottom:5pt}.pq img{max-width:100%;max-height:3in}
table.ws,table.drw,table.side,table.ct,table.seqt,table.pool{border-collapse:collapse;width:100%}
table.ws td,table.side td,table.drw td{border:1px solid #000;vertical-align:top;padding:4pt 6pt}
table.ws td.g{width:36%}table.ws td b,table.drw td b{font-weight:bold}
.ebox{border:1px solid #000;margin-left:.45in;padding:4pt 6pt}.eq{display:flex;margin-bottom:5pt}.eq .n{flex:none;margin-right:.45em}
table.side td.simg{width:46%;text-align:center;vertical-align:middle}table.side img{max-width:100%;max-height:3.4in}
table.seqt{width:calc(100% - .45in);margin-left:.45in}table.seqt td{border:1px solid #000;padding:5pt 6pt}table.seqt td.sn{width:.42in;text-align:center;font-weight:bold}
.sqh{margin:0 0 5pt .25in;font-weight:bold}
table.ct{width:auto;min-width:70%;margin:0 auto}table.ct th,table.ct td{border:1.5px solid #000;padding:6pt 10pt;text-align:center;min-width:.9in}table.ct th{background:#d0d0d0}
.tblank{display:inline-block;min-width:.6in}
table.pool{border:1px solid #000;margin:3pt 0 2pt}table.pool td{text-align:center;padding:2.5pt 6pt;vertical-align:top}
table.drw td.dl{width:72%}table.drw td.dr{width:28%}
.cw{display:flex;flex-direction:column;align-items:center}.cwg{border-collapse:collapse;margin:2pt auto 8pt}.cwg td{padding:0;position:relative;text-align:center;vertical-align:middle;font-weight:bold}
.cwg td.on{border:1px solid #000}.cwg td sup{position:absolute;left:1px;top:0;font-size:6.5pt;font-weight:normal;line-height:1}
.cwc{display:grid;grid-template-columns:1fr 1fr;column-gap:.3in;width:100%}.cwc b{display:block;margin-bottom:2pt}.cwc div div{padding-left:1.4em;text-indent:-1.4em}
.fbt{text-align:center;font-weight:bold;font-size:10.5pt;margin-bottom:3pt}.fb{border:1px solid #000;padding:6pt 8pt;text-align:center}.fb img{max-width:100%}`;
const OP_CSS = `@page{size:8.5in 13in;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}
.opdoc{font:12pt/1.2 'Times New Roman',Times,serif;color:#000}
.page{width:8.5in;height:13in;padding:${OP_PAGE.top}in ${OP_PAGE.side}in ${OP_PAGE.bottom}in;position:relative;overflow:hidden;break-after:page;page-break-after:always;background:#fff}
.page:last-child{break-after:auto;page-break-after:auto}
.pfoot{position:absolute;left:${OP_PAGE.side + .1}in;right:${OP_PAGE.side + .1}in;bottom:.45in;display:flex;justify-content:space-between;font-size:11pt}
.blk{padding-bottom:10pt}.blk.tight{padding-bottom:3pt}
.oh{display:flex;gap:.15in;align-items:flex-start}.oh-l{flex:1;min-width:0}.oh-r{width:1.3in;text-align:center;flex:none}.oh-r img{max-width:1.05in;max-height:1.05in}
.oh-r .motto{font-style:italic;font-size:8pt;line-height:1.15;margin-top:2pt}
.oh-line{font-size:13pt}.oh-topic{font-size:17pt;font-weight:bold;margin:3pt 0 12pt}.oh-key{font-size:10pt;font-weight:bold;letter-spacing:1px}
.oh-row{display:grid;grid-template-columns:1fr 1.95in;column-gap:.3in;margin-bottom:12pt;white-space:nowrap}.oh-row>span{display:flex;align-items:flex-end;gap:4pt}.oh-row i{display:inline-block;flex:1;border-bottom:1px solid #000;font-style:normal;height:1.05em;text-align:center}.oh-row i.cn{flex:none;width:.5in}
.sh{display:flex;font-weight:bold}.sh .rn{min-width:.38in;text-align:right;padding-right:.1in;flex:none}
.sd{margin:1pt 0 2pt .38in;text-align:left}
.sitems{margin-left:.38in}
${OP_ITEM_CSS}`;
const OP_PV_CSS = `.pvw{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 0}.pvl{font:600 12px Arial,sans-serif;color:#5f6f88;letter-spacing:.5px;margin-top:6px}.pvl.over{color:#cf5b55}.page{box-shadow:0 4px 18px #1b2b4626;border:1px solid #d6dfeb}.page.over{outline:3px solid #cf5b55}`;

const OnePage = {
  fitCache: {}, _fitTok: 0, _fitTimer: null,
  headLine(ex) { const h = String(ex.opHead || '').trim(); if (h) return h; const a = [[ex.grade, ex.subject].filter(Boolean).join(' '), ex.schoolYear ? 'SY ' + ex.schoolYear : ''].filter(Boolean).join(' '); return a + (ex.title ? (a ? ' | ' : '') + ex.title : ''); },
  secItemType(sq) { return sq ? (OPDIR[sq.preset] || OPDIR.custom)[2] : 'mc'; },
  /* ---------- builder ---------- */
  renderBuilder(box, ex, C) {
    box.innerHTML = `<div class="grid2"><div style="min-width:0">
        ${this.detailsCard(ex)}${this.ribbon()}
        <div id="op-fitbar" class="op-fitbar">${this.fitBarHTML(ex)}</div>
        <div id="qlist">${this.list(ex, C.L)}</div>
        <div class="addline"><div class="dd"><button class="btn blue" data-dd="dd-opadd2">${icon('plus')}Add a test ${icon('down')}</button><div class="ddm" id="dd-opadd2">${this.menuHTML()}</div></div>
          <button class="btn" data-a="pick-bank">${icon('bank')}Add from item bank</button><button class="btn" data-a="import" data-target="exam">${icon('upload')}Import questions</button><span class="spacer"></span><button class="btn danger sm" data-a="clear-exam">${icon('trash')}Clear quiz</button></div>
      </div><div style="min-width:0" id="exam-rail">${this.rail(ex, C)}</div></div>`;
    this.scheduleFit(ex, 50);
  },
  menuHTML() { return OP_MENU.map(([k, n, d]) => `<button class="mi" data-a="op-add" data-p="${k}"><span>${n}<small>${d}</small></span></button>`).join(''); },
  ribbon() {
    return `<div class="ribbon" id="ribbon" role="toolbar" aria-label="Quick tools"><div class="ribbon-label"><b>ONE PAGE</b><span>LONG BOND · BACK TO BACK</span></div>
      <div class="group"><div class="dd"><button class="btn blue sm" data-dd="dd-opadd">${icon('plus')}Add a test ${icon('down')}</button><div class="ddm" id="dd-opadd">${this.menuHTML()}</div></div><button class="btn sm" data-a="pick-bank">${icon('bank')}From item bank</button></div>
      <div class="group"><button class="btn sm" data-a="preview">${icon('eye')}Preview pages</button><button class="btn sm" data-a="gen-tos" title="Optional for one-page quizzes">${icon('grid')}TOS (optional)</button></div>
      <div class="group"><button class="btn sm fmt" data-a="fmt" data-cmd="bold" title="Bold"><b>B</b></button><button class="btn sm fmt" data-a="fmt" data-cmd="italic" title="Italic"><i>I</i></button><button class="btn sm fmt" data-a="fmt" data-cmd="underline" title="Underline (use it for the key word in Modified True or False)"><u>U</u></button><button class="btn sm fmt" data-a="fmt" data-cmd="subscript" title="Subscript">x₂</button><button class="btn sm fmt" data-a="fmt" data-cmd="superscript" title="Superscript">x²</button><button class="btn sm fmt" data-a="insert-img" title="Insert image">${icon('image')}</button></div>
      <div class="group"><button class="btn sm" data-a="auto-classify">${icon('wand')}Auto-classify</button></div><span class="ribbon-status" id="ribbon-status">● Changes saved</span></div>`;
  },
  detailsCard(ex) {
    const F = (k, label, ph = '') => `<label class="field">${label}<input type="text" data-ex="${k}" value="${esc(ex[k])}" placeholder="${esc(ph)}"></label>`;
    return `<div class="card" id="details-card"><div class="cardhead"><h2>Quiz header</h2><span class="tag gold">${esc(ex.status)}</span><span class="right tiny">Printed at the top of the front page</span></div>
      <div class="details">${F('grade', 'Grade / class', 'e.g., Grade 9 POES')}${F('subject', 'Subject', 'e.g., Science')}${F('schoolYear', 'School year', 'e.g., 26-27')}${F('title', 'Quiz name', 'e.g., Quiz 1.3')}${F('opTopic', 'Topic (big title)', 'e.g., Electromagnetic Waves')}${F('date', 'Date (optional)', '')}</div>
      <div class="details" style="margin-top:10px;grid-template-columns:2fr 1fr 1fr">${F('opHead', 'First line (leave empty to build it from the fields above)', this.headLine(Object.assign({}, ex, { opHead: '' })) || 'Grade 9 POES Science SY 26-27 | Quiz 1.3')}${F('footer', 'Footer text', 'e.g., Natural Sciences Area')}${F('motto', 'Text under the logo', 'e.g., school motto')}</div>
      <div class="row" style="margin-top:10px;gap:14px;flex-wrap:wrap"><label class="tiny"><input type="checkbox" data-exc="opCN"${ex.opCN ? ' checked' : ''}> Class number (CN) blank</label>
        <span class="tiny">School logo</span>${ex.logo ? `<img src="${ex.logo}" alt="" style="height:30px;border:1px solid var(--line);border-radius:5px">` : ''}<button class="btn sm" data-a="exam-logo">${icon('image')}${ex.logo ? 'Change logo' : 'Add logo'}</button>${ex.logo ? '<button class="btn sm ghost" data-a="exam-logo-del">Remove</button>' : ''}
        <label class="field" style="width:150px">Status<select data-ex="status">${['Draft', 'In review', 'Ready', 'Administered', 'Archived'].map(s => `<option${s === ex.status ? ' selected' : ''}>${s}</option>`).join('')}</select></label></div>
      <details class="op-fb"${stripHTML(ex.formula) || /<img/i.test(ex.formula || '') ? ' open' : ''}><summary><b>Formula bank</b> <span class="tiny">(optional, printed in a box after the last test)</span></summary>
        <div class="ed" contenteditable="true" data-exf="formula" data-ph="Type formulas or insert an image of them (e.g., c = λf    E = hf)">${ex.formula || ''}</div>
        <label class="tiny" style="display:block;margin-top:6px"><input type="checkbox" data-exc="formulaSep"${ex.formulaSep ? ' checked' : ''}> Print the formula bank on its own page (not counted in the one-sheet check)</label></details></div>`;
  },
  list(ex, L) {
    if (!ex.items.length) return `<div class="empty"><img src="${CHIBI.idea}" alt=""><b>No tests yet</b>Add a test such as <b style="display:inline">Modified True or False</b> or <b style="display:inline">Multiple Choice</b>. Each one prints with its own Roman numeral, directions and points.<div class="row" style="justify-content:center;margin-top:12px"><div class="dd"><button class="btn blue" data-dd="dd-opadd3">${icon('plus')}Add a test ${icon('down')}</button><div class="ddm" id="dd-opadd3">${this.menuHTML()}</div></div><button class="btn" data-a="op-sample">Load a sample quiz</button></div></div>`;
    let h = '';
    L.secs.forEach((s, i) => {
      h += `<div class="secband">${RN[i] || i + 1}. ${esc(s.title)}<span class="right tiny">${plural(s.items, 'item')} · ${fmtPts(s.pts)}</span></div>`;
      if (s.secId) h += Exam.card(Q(s.secId), L, true);
      else h += `<div class="hint" style="margin:-2px 0 8px">These items have no test header yet. <button class="link" data-a="op-add-sec-top">Add a title and directions</button></div>`;
      s.top.forEach(({ t }) => { h += Exam.card(t, L, true); });
      if (s.secId) { const it = this.secItemType(s.sq); h += `<div class="op-secadd"><button class="btn sm" data-a="op-add-item" data-sec="${s.secId}">${icon('plus')}Add ${esc(TYPE_NAMES[it].toLowerCase())} item to ${RN[i] || i + 1}</button></div>`; }
    });
    return h;
  },
  tools(q) { return `<div class="qtools"><button class="btn icon sm ghost" data-a="q-up" title="Move up">${icon('up')}</button><button class="btn icon sm ghost" data-a="q-down" title="Move down">${icon('down')}</button><button class="btn icon sm ghost" data-a="q-del" title="Delete">${icon('trash')}</button></div>`; },
  sectionCard(q) {
    const it = this.secItemType(q), pool = q.preset === 'wordpool' || String(q.pool || '').trim();
    return `<div class="qcard section-card qtop" data-id="${q.id}"><div class="qhead"><span class="grip" title="Drag to reorder">${icon('grip')}</span><span class="tag gold">Test</span><select data-f="preset" title="Test type">${Object.keys(OPDIR).map(k => `<option value="${k}"${k === q.preset ? ' selected' : ''}>${k === 'custom' ? 'Custom' : OPDIR[k][0].replace(' or ', ' or ').toLowerCase().replace(/^\w/, c => c.toUpperCase())}</option>`).join('')}</select>${this.tools(q)}</div>
      <div class="orow"><b class="wide">Title</b><input data-f="title" value="${esc(q.title)}" placeholder="e.g., MULTIPLE CHOICE"></div>
      <div class="orow" style="align-items:flex-start"><b class="wide">Directions</b><textarea data-f="dir" rows="2" placeholder="Directions printed under the title">${esc(q.dir)}</textarea></div>
      ${pool ? `<div class="orow" style="align-items:flex-start"><b class="wide">Word pool</b><textarea data-f="pool" rows="3" placeholder="One word per line (answers and a few distractors)">${esc(q.pool || '')}</textarea></div><div class="row" style="margin:-2px 0 6px 108px"><button class="btn sm" data-a="op-pool-fill">${icon('wand')}Add the answers to the pool</button><button class="btn sm" data-a="op-pool-sort">Sort A–Z</button><button class="btn sm" data-a="op-pool-mix">Mix up</button></div>` : ''}
      <div class="row tiny" style="gap:14px;flex-wrap:wrap">${it === 'ident' ? `<label>Drawing box beside each item <input class="inp sm" style="width:140px" data-f="drawLabel" value="${esc(q.drawLabel || '')}" placeholder="e.g., Symbol:"></label>${pool ? '' : '<button class="link" data-a="op-pool-on">Add a word pool</button>'}` : ''}${it === 'prob' ? `<label>Numbering <select class="inp sm" data-f="numBy"><option value=""${q.numBy ? '' : ' selected'}>1, 2, 3</option><option value="points"${q.numBy === 'points' ? ' selected' : ''}>By points (1-5, 6-10)</option></select></label>` : ''}<span>The points in the title are added up from the items.</span></div></div>`;
  },
  rail(ex, C) {
    const pl = Planner.ensure(ex), target = pl.points ?? 30;
    return `<div class="card jin-coach" id="op-fitcard">${this.fitCardHTML(ex)}</div>
      <div class="card"><div class="cardhead"><h2>Score</h2><span class="right tiny">DEFAULT 30</span></div>
        <div class="row" style="align-items:flex-end;gap:12px"><div class="stat" style="flex:1"><b id="op-pts-now">${ptsNum(C.points)}</b><span>points so far</span></div><label class="field" style="width:120px">Target total<input type="number" min="1" step="1" data-pl="points" value="${target}"></label></div>
        <div id="op-pts-status">${this.ptsStatus(C.points, target)}</div></div>
      ${Planner.railCard(ex)}
      <div class="card"><div class="cardhead"><h2>Coverage check</h2></div>
        <div class="minirow"><span>Items with answer keys</span><strong style="color:${C.noKey.length ? 'var(--red)' : 'var(--green)'}">${C.keyed} / ${C.items}</strong></div>
        <div class="minirow"><span>Empty items</span><strong style="color:${C.empty.length ? 'var(--red)' : 'var(--green)'}">${C.empty.length}</strong></div>
        <div class="minirow"><span>Tests</span><strong>${C.sections}</strong></div>
        ${C.noKey.length ? `<div class="why">Missing keys: ${esc(C.noKey.slice(0, 12).join(', '))}</div>` : ''}
        <button class="btn" style="width:100%;margin-top:12px;justify-content:center" data-a="assistant" data-tab="review">${icon('spark')}Ask Jin to review this quiz</button></div>`;
  },
  ptsStatus(now, target) {
    now = ptsNum(now); if (!target) return '';
    if (now === target) return `<div class="okbox" style="margin:8px 0 0">Exactly ${fmtPts(target)}.</div>`;
    return `<div class="pl-status warn" style="margin-top:8px">${now < target ? `${fmtPts(ptsNum(target - now))} short of ${target}. Add items or raise points.` : `${fmtPts(ptsNum(now - target))} over ${target}. Lower some points or remove an item.`}</div>`;
  },
  sideName(i) { return 'Sheet ' + (Math.floor(i / 2) + 1) + ' · ' + (i % 2 ? 'back' : 'front'); },
  fitCardHTML(ex) {
    const F = this.fitCache[ex.id], sheets = Math.max(1, ex.opSheets || 1);
    const head = (pose, eyebrow, title) => `<div class="coach-head"><img src="assets/jin/anime-${pose}-face.webp" alt="Jin"><div><span class="eyebrow">${eyebrow}</span><h3>${title}</h3></div></div>`;
    if (!F || F.ver !== this.verOf(ex)) return head('planning', 'JIN · ONE-PAGE CHECK', 'Checking whether everything fits…') + `<div class="hint">I measure the header and every test on long bond paper (8.5 × 13 in).</div>`;
    const bars = F.fills.map((f, i) => `<div class="minirow"><span style="width:118px">${this.sideName(i)}</span><div class="bar"><i style="width:${Math.min(100, Math.round(f * 100))}%;${i >= F.cap ? 'background:var(--red)' : ''}"></i></div><span style="width:40px;text-align:right">${Math.round(f * 100)}%</span></div>`).join('');
    const sheetTxt = plural(sheets, 'sheet');
    if (F.fits) return head('celebrating', 'JIN · ONE-PAGE CHECK', `It fits on ${sheetTxt} (${plural(F.sides, 'side')} used of ${F.cap}).`) + bars + (F.overflow.length ? `<div class="pl-status warn">Too tall for one page: ${esc(F.overflow.join(', '))}. Make its box smaller.</div>` : '') + `<div class="row" style="margin-top:8px">${sheets > 1 && F.sides <= (sheets - 1) * 2 ? `<button class="btn sm" data-a="op-del-sheet">Use ${plural(sheets - 1, 'sheet')} instead</button>` : ''}<button class="btn sm" data-a="preview">${icon('eye')}Preview pages</button></div>`;
    return head('planning', 'JIN · ONE-PAGE CHECK', `It doesn’t fit on ${sheetTxt}. It needs ${F.sides} sides; ${sheetTxt} printed back to back has ${F.cap}.`) + bars + `<div class="hint" style="margin:6px 0">Shorten answer boxes, remove an item, or add another sheet.</div>${F.overflow.length ? `<div class="pl-status warn">Too tall for one page: ${esc(F.overflow.join(', '))}.</div>` : ''}<div class="row"><button class="btn sm blue" data-a="op-add-sheet">${icon('plus')}Add another sheet</button><button class="btn sm" data-a="preview">${icon('eye')}Preview pages</button></div>`;
  },
  fitBarHTML(ex) {
    const F = this.fitCache[ex.id]; if (!F || F.ver !== this.verOf(ex) || !ex.items.length) return '';
    const sheets = Math.max(1, ex.opSheets || 1);
    if (F.fits) return `<div class="fitbar ok">${icon('check')}<span>Fits on ${plural(sheets, 'long bond sheet')}, back to back · ${this.sideName(F.sides - 1)} is ${Math.round(F.fills[F.sides - 1] * 100)}% full</span></div>`;
    return `<div class="fitbar bad"><img src="${CHIBI.concerned}" alt=""><span><b>Jin:</b> this doesn’t fit on ${plural(sheets, 'sheet')}. It needs ${F.sides} sides but ${plural(sheets, 'sheet')} has ${F.cap}.</span><button class="btn sm blue" data-a="op-add-sheet">${icon('plus')}Add another sheet</button><button class="btn sm" data-a="preview">Preview</button></div>`;
  },
  verOf(ex) { return ex.updated + '|' + (ex.opSheets || 1) + '|' + ex.items.length; },
  scheduleFit(ex, ms) { clearTimeout(this._fitTimer); this._fitTimer = setTimeout(() => { const e = curExam(); if (e && fmtOf(e) === 'onepage') this.computeFit(e).catch(err => console.error(err)); }, ms ?? 500); },
  async computeFit(ex) {
    const tok = ++this._fitTok, ver = this.verOf(ex);
    const P = await this.paginate(ex, false); if (tok !== this._fitTok) return;
    const sides = P.countPages, cap = Math.max(1, ex.opSheets || 1) * 2;
    const res = { ver, sides, cap, fits: sides <= cap, fills: P.fills.slice(0, sides), overflow: P.overflow, at: Date.now() };
    const prev = this.fitCache[ex.id]; this.fitCache[ex.id] = res;
    const c = $('#op-fitcard'); if (c) c.innerHTML = this.fitCardHTML(ex);
    const b = $('#op-fitbar'); if (b) b.innerHTML = this.fitBarHTML(ex);
    if (prev && prev.fits && !res.fits && APP.screen === 'exam') toast(`Jin: the quiz no longer fits on ${plural(Math.max(1, ex.opSheets || 1), 'sheet')}. It needs ${sides} sides. Use “Add another sheet” or shorten it.`, 'error', 8000);
    return res;
  },
  /* ---------- printing ---------- */
  poolHTML(words, key) {
    if (!words.length) return '';
    const cols = words.length > 16 ? 4 : 3, rows = Math.ceil(words.length / cols);
    let h = '<table class="pool">';
    for (let r = 0; r < rows; r++) { h += '<tr>'; for (let c = 0; c < cols; c++) { const w = words[c * rows + r]; h += `<td>${w !== undefined ? esc(w) : ''}</td>`; } h += '</tr>'; }
    return h + '</table>';
  },
  cellHTML(c, key) { return esc(c || '').replace(/\[\[([\s\S]*?)\]\]/g, (m, a) => key ? `<span class="hl">${a}</span>` : '<span class="tblank">&nbsp;</span>'); },
  splitImgs(html) { const imgs = (String(html || '').match(/<img[^>]*>/gi) || []).join(''); return { imgs, text: String(html || '').replace(/<img[^>]*>/gi, '') }; },
  mcTwo(q) { if (q.cols === '1') return false; if (q.cols === '2') return true; const o = q.opts || []; return o.length >= 2 && o.length <= 6 && o.length % 2 === 0 && !(q.oimg || []).some(Boolean) && o.every(s => String(s).length <= 26); },
  itemHTML(q, label, key, sq, ctx = {}) {
    const blank = (w, ans) => `<span class="bl" style="width:${w}in">${key && ans ? `<span class="hl">${esc(ans)}</span>` : ''}</span>`;
    const lead = (w, ans) => `<span class="lead">${blank(w, ans)}<span class="n">${label}.</span></span>`;
    const w = weight(q), ptsI = ` <i>(${fmtPts(w)})</i>`;
    switch (q.type) {
      case 'mtf': return `<div class="it">${lead(1.5, q.ansText)}<div class="tx">${q.stem || ''}</div></div>`;
      case 'ident': {
        const row = `<div class="it">${lead(1.25, q.ansText)}<div class="tx">${q.stem || ''}</div></div>`;
        return sq && String(sq.drawLabel || '').trim() ? `<table class="drw"><tr><td class="dl" style="height:${ctx.drawH || .95}in">${row}</td><td class="dr"><b>${esc(sq.drawLabel)}</b></td></tr></table>` : row;
      }
      case 'mc': case 'cmc': {
        const two = this.mcTwo(q), n = (q.opts || []).length;
        const st = q.type === 'cmc' ? `<div style="margin:3pt 0 0 .25in">${(q.statements || []).map((s, i) => `<div>${RN[i]}. ${esc(s)}</div>`).join('')}</div>` : '';
        return `<div class="it">${lead(.5, key ? q.ans : '')}<div class="tx">${q.stem || ''}${st}<div class="ch${two ? ' two' : ''}"${two ? ` style="grid-template-rows:repeat(${Math.ceil(n / 2)},auto)"` : ''}>${(q.opts || []).map((o, i) => `<div>${LET[i]}. ${key && q.ans === LET[i] ? `<span class="hl">${esc(o)}</span>` : esc(o)}${(q.oimg || [])[i] ? `<img src="${q.oimg[i]}" alt="">` : ''}</div>`).join('')}</div></div></div>`;
      }
      case 'morse': return `<div class="it">${lead(.5, key ? morseAns(q) : '')}<div class="tx">${stripHTML(q.stem) ? q.stem + '<br>' : ''}<b>X:</b> ${esc(q.x)}<br><b>Y:</b> ${esc(q.y)}</div></div>`;
      case 'prob': {
        const auto = q.pbd !== false && q.pg === '' && q.pe === '' && q.ps === '' && w >= 3, g = auto ? 1 : q.pg, e = auto ? 1 : q.pe, s = auto ? ptsNum(w - 2) : q.ps;
        const pl = v => q.pbd !== false && v !== '' && v != null ? ` (${fmtPts(v)})` : '';
        const H = Math.max(.8, +q.boxH || 2.4);
        return `<div class="pq"><b>${label}.</b> ${q.stem || ''}${ptsI}</div>${q.fbd ? `<table class="ws" style="margin-bottom:-1px"><tr><td style="height:1.2in"><b>Free-Body Diagram</b></td></tr></table>` : ''}<table class="ws"><tr><td class="g" style="height:${(H * .56).toFixed(2)}in"><b>Given and Required${pl(g)}</b></td><td rowspan="2"><b>Complete Solution &amp; Answer${pl(s)}</b>${key && q.ansText ? `<div style="margin-top:4pt"><span class="hl">${esc(q.ansText)}</span></div>` : ''}</td></tr><tr><td style="height:${(H * .44).toFixed(2)}in"><b>Equation${pl(e)}</b></td></tr></table>`;
      }
      case 'essay': {
        const H = Math.max(.3, +q.boxH || 1.6), k = key && q.ansText ? `<span class="hl">${esc(q.ansText)}</span>` : '';
        if (q.layout === 'side') { const p = this.splitImgs(q.stem); return `<table class="side"><tr><td class="simg">${p.imgs || '&nbsp;'}</td><td style="height:${H}in"><span>${label}. </span>${p.text}${ptsI}<div style="margin-top:6pt">${k}</div></td></tr></table>`; }
        return `<div class="eq"><span class="n">${label}.</span><div class="tx">${q.stem || ''}${ptsI}</div></div><div class="ebox" style="height:${H}in">${k}</div>`;
      }
      case 'seq': {
        const ev = seqEvents(q), ord = seqOrder(q), head = String(q.head || '').trim();
        return `${head || ctx.letter ? `<div class="sqh">${ctx.letter ? ctx.letter + '. ' : ''}${esc(head)} (${fmtPts(w)})</div>` : ''}${stripHTML(q.stem) ? `<div class="pq" style="margin-left:.45in">${q.stem}</div>` : ''}<table class="seqt">${ord.map(j => `<tr><td class="sn">${key ? `<span class="hl">${j + 1}</span>` : ''}</td><td>${esc(ev[j])}</td></tr>`).join('')}</table>`;
      }
      case 'table': {
        const cols = q.cols || [];
        return `${stripHTML(q.stem) || /<img/i.test(q.stem || '') ? `<div class="pq">${label}. ${q.stem}${ptsI}</div>` : ''}<table class="ct"><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr>${(q.cells || []).map(r => `<tr>${cols.map((_, i) => `<td>${this.cellHTML((r || [])[i], key)}</td>`).join('')}</tr>`).join('')}</table>${+q.boxH > 0 ? `<div style="height:${+q.boxH}in"></div>` : ''}`;
      }
      case 'crossword': {
        const L = CW.layoutOf(q); if (!L.placed.length) return `<div class="pq">${label}. (Add at least two words to build the crossword.)</div>`;
        const cs = Math.min(.32, (OP_CW - .5) / L.cols);
        const grid = `<table class="cwg">${L.cells.map(r => `<tr>${r.map(c => c ? `<td class="on" style="width:${cs}in;height:${cs}in;font-size:${Math.max(7, cs * 40).toFixed(1)}pt">${c.num ? `<sup>${c.num}</sup>` : ''}${key ? c.ch : ''}</td>` : `<td style="width:${cs}in;height:${cs}in"></td>`).join('')}</tr>`).join('')}</table>`;
        const cl = d => L.placed.filter(p => p.dir === d).map(p => `<div>${p.num}. ${esc(p.clue || '(no clue)')}</div>`).join('');
        return `${stripHTML(q.stem) ? `<div class="pq">${q.stem}</div>` : ''}<div class="cw">${grid}<div class="cwc"><div><b>ACROSS</b>${cl(0) || '<div>—</div>'}</div><div><b>DOWN</b>${cl(1) || '<div>—</div>'}</div></div></div>`;
      }
      case 'match': return `<div class="it">${lead(.5, key ? q.ans : '')}<div class="tx">${q.stem || ''}</div></div>`;
      default: return `<div class="it">${lead(1, key ? answerOf(q) : '')}<div class="tx">${q.stem || ''}${(q.opts || []).length ? `<div class="ch">${q.opts.map((o, i) => `<div>${LET[i]}. ${esc(o)}</div>`).join('')}</div>` : ''}</div></div>`;
    }
  },
  headerHTML(ex, key) {
    const cn = ex.opCN;
    return `<div class="oh"><div class="oh-l"><div class="oh-line">${esc(this.headLine(ex))}${key ? ' <span class="oh-key">· ANSWER KEY</span>' : ''}</div><div class="oh-topic">${esc(ex.opTopic || '')}${ex.opTopic ? '' : '&nbsp;'}</div>
      <div class="oh-row"><span>Name:<i></i></span><span>Score:<i></i></span></div>
      <div class="oh-row" style="margin-bottom:4pt"><span>Section:<i></i>${cn ? 'CN:<i class="cn"></i>' : ''}</span><span>Date:<i>${ex.date ? `<span style="font-size:10pt">${esc(ex.date)}</span>` : ''}</i></span></div></div>
      <div class="oh-r">${ex.logo ? `<img src="${ex.logo}" alt="">` : ''}${ex.motto ? `<div class="motto">${esc(ex.motto)}</div>` : ''}</div></div>`;
  },
  /* the quiz as a list of unbreakable blocks */
  blocks(ex, key) {
    const L = layout(ex), B = [{ html: this.headerHTML(ex, key), label: 'Header' }];
    L.secs.forEach((s, i) => {
      const sq = s.sq, pool = sq ? String(sq.pool || '').split('\n').map(x => x.trim()).filter(Boolean) : [];
      B.push({ html: `<div class="sh"><span class="rn">${RN[i] || i + 1}.</span><span>${esc(s.title)} (${fmtPts(s.pts)})</span></div>${s.dir ? `<div class="sd">${esc(s.dir)}</div>` : ''}${pool.length ? `<div class="sitems">${this.poolHTML(pool, key)}</div>` : ''}`, keep: true, label: `Test ${RN[i]} header`, tight: true });
      let seqN = 0; const seqTotal = s.top.filter(x => x.t.type === 'seq').length;
      s.top.forEach(({ t, leaves }) => {
        if (isGroup(t)) {
          const [b, rest] = groupHeadParts(L, t, leaves);
          let gh = `<div class="pq"><b>${b}</b> ${esc(rest)}</div>`;
          if (t.type === 'passage' && (stripHTML(t.stem) || /<img/.test(t.stem || ''))) gh += `<div class="ebox" style="margin-left:0;height:auto">${t.stem}</div>`;
          if ((t.sopts || []).filter(Boolean).length) gh += `<div class="ch two" style="grid-template-rows:repeat(${Math.ceil(t.sopts.length / 2)},auto)">${t.sopts.map((o, k) => `<div>${LET[k]}. ${esc(o)}</div>`).join('')}</div>`;
          B.push({ html: `<div class="sitems">${gh}</div>`, keep: true, label: `Test ${RN[i]} group` });
        }
        leaves.forEach(q => {
          const letter = q.type === 'seq' && seqTotal > 1 ? LET[seqN++] : '';
          const lab = rgH(L.pnum[q.id]);
          B.push({ html: `<div class="sitems">${this.itemHTML(q, lab, key, sq, { letter })}</div>`, label: `Test ${RN[i]} no. ${lab}`, tight: sq && String(sq.drawLabel || '').trim() && q.type === 'ident' });
        });
      });
    });
    if (stripHTML(ex.formula) || /<img/i.test(ex.formula || '')) B.push({ html: `<div class="fbt">- FORMULA BANK -</div><div class="fb">${sanitizeHTML(ex.formula)}</div>`, label: 'Formula bank', newPage: !!ex.formulaSep, extra: !!ex.formulaSep });
    return B;
  },
  async paginate(ex, key) {
    const B = this.blocks(ex, key);
    const host = document.createElement('div'); host.setAttribute('aria-hidden', 'true');
    host.style.cssText = 'position:absolute;left:-30000px;top:0;width:8.5in;visibility:hidden;pointer-events:none';
    document.body.appendChild(host);
    const sh = host.attachShadow({ mode: 'open' });
    sh.innerHTML = `<style>${OP_CSS}</style><div class="opdoc"><div style="width:${OP_CW}in">${B.map((b, i) => `<div class="blk${b.tight ? ' tight' : ''}" data-i="${i}">${b.html}</div>`).join('')}</div></div>`;
    /* wait for pictures and fonts, but never forever (a background tab may not decode images) */
    const ready = (async () => { try { await Promise.all([...sh.querySelectorAll('img')].map(im => im.complete ? null : new Promise(res => { im.addEventListener('load', res, { once: true }); im.addEventListener('error', res, { once: true }); }))); if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (e) { } })();
    await Promise.race([ready, new Promise(r => setTimeout(r, 2500))]);
    const hs = [...sh.querySelectorAll('.blk')].map(el => el.getBoundingClientRect().height);
    host.remove();
    const H = (OP_PAGE.h - OP_PAGE.top - OP_PAGE.bottom) * 96 - 4;
    const pages = [[]], fillsPx = [0], overflow = []; let extraFrom = -1;
    for (let i = 0; i < B.length; i++) {
      const h = hs[i], last = pages.length - 1;
      if (B[i].newPage && pages[last].length) { pages.push([]); fillsPx.push(0); }
      if (B[i].extra && extraFrom < 0) extraFrom = pages.length - 1;
      let need = h; if (B[i].keep && i + 1 < B.length && !B[i + 1].newPage) need += hs[i + 1];
      const p = pages.length - 1;
      if (fillsPx[p] + need > H && pages[p].length) { pages.push([]); fillsPx.push(0); }
      const q = pages.length - 1; pages[q].push(i); fillsPx[q] += h;
      if (h > H) overflow.push(B[i].label);
    }
    return { B, pages, H, fills: fillsPx.map(v => v / H), overflow, countPages: extraFrom >= 0 ? extraFrom : pages.length };
  },
  pagesHTML(ex, P, preview) {
    const total = P.pages.length, cap = Math.max(1, ex.opSheets || 1) * 2, foot = ex.footer || '';
    const pages = P.pages.map((idx, p) => `${preview ? `<div class="pvl${p >= cap && p < P.countPages ? ' over' : ''}">${p < P.countPages ? this.sideName(p) + (p >= cap ? ' — beyond the sheet limit' : '') : 'Extra page (formula bank)'}</div>` : ''}<div class="page${preview && p >= cap && p < P.countPages ? ' over' : ''}"><div>${idx.map(i => `<div class="blk${P.B[i].tight ? ' tight' : ''}">${P.B[i].html}</div>`).join('')}</div><div class="pfoot"><i>${esc(foot)}</i><span>Page <b>${p + 1}</b> of ${total}</span></div></div>`).join('');
    return `<div class="opdoc${preview ? ' pvw' : ''}">${pages}</div>`;
  },
  docHTML(ex, P) { return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(ex.title || 'Quiz')}</title><style>${OP_CSS}</style></head><body>${this.pagesHTML(ex, P, false)}</body></html>`; },
  async preview() {
    const ex = curExam(); if (!ex) return;
    modal(`<h3>Print preview — ${esc(ex.title || 'Quiz')}</h3><div class="row" style="margin:8px 0 10px"><span class="tag">Long bond 8.5 × 13 in · back to back</span><label class="tiny"><input type="checkbox" id="pv-key"> Answer key (answers highlighted)</label><span class="tiny" id="op-pv-info"></span><span class="spacer"></span><button class="btn" data-a="export-docx">${icon('file')}Word</button><button class="btn" data-a="print-exam">${icon('print')}Print</button><button class="btn gold" data-a="export-pdf" data-pv="1">${icon('download')}Save PDF</button></div><div class="op-pvbox" id="op-pv"></div>`, { size: 'wide' });
    const draw = async () => {
      const k = $('#pv-key') && $('#pv-key').checked, P = await this.paginate(ex, k), box = $('#op-pv'); if (!box) return;
      const sh = box.shadowRoot || box.attachShadow({ mode: 'open' }); sh.innerHTML = `<style>${OP_CSS}${OP_PV_CSS}</style>` + this.pagesHTML(ex, P, true);
      const cap = Math.max(1, ex.opSheets || 1) * 2, inf = $('#op-pv-info');
      if (inf) inf.innerHTML = P.countPages <= cap ? `<span style="color:var(--green)">✓ ${plural(P.countPages, 'side')} of ${cap}</span>` : `<span style="color:var(--red)">Needs ${P.countPages} sides; ${plural(cap / 2, 'sheet')} has ${cap}</span> <button class="btn sm blue" data-a="op-add-sheet">Add another sheet</button>`;
    };
    await draw(); $('#pv-key').onchange = draw;
  },
  async guardFit(ex) {
    const F = await this.computeFit(ex); if (F.fits) return true;
    const sheets = Math.max(1, ex.opSheets || 1);
    return new Promise(res => {
      const m = modal(`<h3>The quiz doesn’t fit on ${plural(sheets, 'sheet')}</h3><div class="mbody"><img class="chibi-side" src="${CHIBI.concerned}" alt=""><p style="margin-top:0">With the header, it needs <b>${F.sides} sides</b>. ${plural(sheets, 'long bond sheet')} printed back to back has ${F.cap}.</p><p>You can add another sheet, or go back and shorten answer boxes or remove items.</p><div style="clear:both"></div></div><div class="mfoot"><button class="btn" data-x="back">Go back and shorten</button><button class="btn" data-x="any">Export anyway</button><button class="btn blue" data-x="add">Add another sheet</button></div>`, { size: 'narrow', onClose: () => res(false) });
      m.querySelector('[data-x=back]').onclick = () => { closeModal(true); res(false); };
      m.querySelector('[data-x=any]').onclick = () => { closeModal(true); res(true); };
      m.querySelector('[data-x=add]').onclick = () => { ex.opSheets = Math.ceil(F.sides / 2); ex.updated = nowISO(); touch(); closeModal(true); if (APP.screen === 'exam') Exam.render(); toast('The quiz is now set to ' + plural(ex.opSheets, 'sheet') + '.'); res(true); };
    });
  },
  async exportPDF(key) {
    const ex = curExam(); if (!ex || !ex.items.length) return toast('Add questions before exporting.', 'info');
    if (!key && !(await this.guardFit(ex))) return;
    toast('Preparing PDF…', 'info', 1500);
    const P = await this.paginate(ex, key);
    /* raw: the pages already carry their own margins and footer (desktop app adds none) */
    const r = await Host.printToPDF(this.docHTML(ex, P), { defaultName: safeName(ex.title, 'quiz') + (key ? ' - ANSWER KEY' : '') + '.pdf', raw: true, pageSize: { width: OP_PAGE.w, height: OP_PAGE.h } });
    if (r && r.canceled) return; if (r && r.ok === false) return toast('PDF export failed: ' + r.error, 'error');
    toast(IS_DESKTOP ? 'PDF saved: ' + r.path + '. To print, pick Long / Folio (8.5 × 13 in) paper and “Print on both sides”.' : 'Tip: choose “Save as PDF”. To print, pick Long / Folio (8.5 × 13 in) paper and “Print on both sides”.', IS_DESKTOP ? 'ok' : 'info', 7000);
  },
  async print() {
    const ex = curExam(); if (!ex || !ex.items.length) return toast('Add questions before printing.', 'info');
    const key = !!($('#pv-key') && $('#pv-key').checked);
    if (!key && !(await this.guardFit(ex))) return;
    const P = await this.paginate(ex, key); const r = await Host.print(this.docHTML(ex, P), {}); if (r && r.ok === false) toast('Printing failed: ' + r.error, 'error');
  },
  /* ---------- Word export ---------- */
  async docxItem(q, label, key, sq, ctx = {}) {
    const D = docx, TNR = 'Times New Roman', tw = v => Math.round(v * 1440);
    const T = (t, o = {}) => new D.TextRun({ text: String(t ?? ''), font: TNR, size: 24, ...o });
    const P = (c, o = {}) => new D.Paragraph({ children: c, spacing: { after: 0 }, ...o });
    const runs = h => htmlRuns(h, { font: TNR, size: 24 });
    const HL = t => T(t, { bold: true, highlight: 'yellow' });
    const line = { style: D.BorderStyle.SINGLE, size: 6, color: '000000' }, none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const allB = { top: line, bottom: line, left: line, right: line }, noB = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
    const W = tw(OP_CW - .38), w = weight(q), out = [], indent0 = tw(.38);
    const blankRuns = (n, ans) => key && ans ? [T(' '), HL(ans), T(' ')] : [T('_'.repeat(n))];
    const after = { after: 160 };
    const cellP = (c, o = {}) => new D.TableCell({ children: c, borders: allB, margins: { top: 60, bottom: 60, left: 100, right: 100 }, ...o });
    switch (q.type) {
      case 'mtf': case 'ident': case 'match': {
        const n = q.type === 'mtf' ? 16 : q.type === 'match' ? 5 : 13, lw = q.type === 'mtf' ? 2.05 : q.type === 'match' ? .95 : 1.75;
        const ans = q.type === 'match' ? q.ans : q.ansText;
        const p = P([new D.TextRun({ children: [new D.Tab()] }), ...blankRuns(n, ans), T(' ' + label + '.'), new D.TextRun({ children: [new D.Tab()] }), ...(await runs(q.stem))], { indent: { left: indent0 + tw(lw), hanging: tw(lw) }, tabStops: [{ type: D.TabStopType.RIGHT, position: indent0 + tw(lw - .08) }, { type: D.TabStopType.LEFT, position: indent0 + tw(lw) }], spacing: after });
        if (q.type === 'ident' && sq && String(sq.drawLabel || '').trim()) {
          out.push(new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: [Math.round(W * .72), Math.round(W * .28)], indent: { size: indent0, type: D.WidthType.DXA }, rows: [new D.TableRow({ height: { value: tw(.95), rule: D.HeightRule.ATLEAST }, children: [cellP([P([...blankRuns(12, q.ansText), T(' ' + label + '. '), ...(await runs(q.stem))])], { width: { size: Math.round(W * .72), type: D.WidthType.DXA } }), cellP([P([T(sq.drawLabel, { bold: true })])], { width: { size: Math.round(W * .28), type: D.WidthType.DXA } })] })] }));
        } else out.push(p);
        break;
      }
      case 'mc': case 'cmc': case 'morse': {
        const lw = .8, left = indent0 + tw(lw);
        const stemRuns = q.type === 'morse' ? [...(stripHTML(q.stem) ? [...(await runs(q.stem)), new D.TextRun({ break: 1 })] : []), T('X: ', { bold: true }), T(q.x || ''), new D.TextRun({ break: 1 }), T('Y: ', { bold: true }), T(q.y || '')] : await runs(q.stem);
        out.push(P([new D.TextRun({ children: [new D.Tab()] }), ...blankRuns(5, key ? (q.type === 'morse' ? morseAns(q) : q.ans) : ''), T(' ' + label + '.'), new D.TextRun({ children: [new D.Tab()] }), ...stemRuns], { indent: { left, hanging: tw(lw) }, tabStops: [{ type: D.TabStopType.RIGHT, position: left - tw(.08) }, { type: D.TabStopType.LEFT, position: left }], keepNext: true, spacing: { after: q.type === 'morse' ? 160 : 20 } }));
        if (q.type === 'cmc') (q.statements || []).forEach((s, i) => out.push(P([T(RN[i] + '. ' + s)], { indent: { left: left + tw(.25) }, keepNext: true })));
        const opts = q.opts || [], cr = i => key && q.ans === LET[i] ? HL(opts[i]) : T(opts[i]);
        if (q.type !== 'morse') {
          if (this.mcTwo(q)) { const half = Math.ceil(opts.length / 2), mid = left + tw((OP_CW - .38 - lw) / 2); for (let r = 0; r < half; r++) { const b = r + half; out.push(P([T(LET[r] + '. '), cr(r), ...(b < opts.length ? [T('\t' + LET[b] + '. '), cr(b)] : [])], { indent: { left }, tabStops: [{ type: D.TabStopType.LEFT, position: mid }], keepNext: r < half - 1, spacing: { after: r === half - 1 ? 160 : 0 } })); } }
          else for (const [i] of opts.entries()) { const r = [T(LET[i] + '. '), cr(i)]; if ((q.oimg || [])[i]) { const ir = await imgRun(q.oimg[i], 180); if (ir) r.push(new D.TextRun({ break: 1 }), ir); } out.push(P(r, { indent: { left: left + tw(.28), hanging: tw(.28) }, keepNext: i < opts.length - 1, spacing: { after: i === opts.length - 1 ? 160 : 0 } })); }
        }
        break;
      }
      case 'prob': {
        out.push(P([T(label + '. ', { bold: true }), ...(await runs(q.stem)), T(' (' + fmtPts(w) + ')', { italics: true })], { keepNext: true, alignment: D.AlignmentType.JUSTIFIED, spacing: { after: 100 }, indent: { left: indent0 } }));
        const auto = q.pbd !== false && q.pg === '' && q.pe === '' && q.ps === '' && w >= 3, g = auto ? 1 : q.pg, e = auto ? 1 : q.pe, s = auto ? ptsNum(w - 2) : q.ps;
        const pl = v => q.pbd !== false && v !== '' && v != null ? ' (' + fmtPts(v) + ')' : '';
        const H = Math.max(.8, +q.boxH || 2.4), c1 = Math.round(W * .36);
        const rows = [];
        if (q.fbd) rows.push(new D.TableRow({ height: { value: tw(1.2), rule: D.HeightRule.ATLEAST }, children: [cellP([P([T('Free-Body Diagram', { bold: true })])], { columnSpan: 2 })] }));
        rows.push(new D.TableRow({ height: { value: tw(H * .56), rule: D.HeightRule.ATLEAST }, children: [cellP([P([T('Given and Required' + pl(g), { bold: true })])], { width: { size: c1, type: D.WidthType.DXA } }), cellP([P([T('Complete Solution & Answer' + pl(s), { bold: true })]), ...(key && q.ansText ? [P([HL(q.ansText)], { spacing: { before: 80 } })] : [])], { rowSpan: 2, width: { size: W - c1, type: D.WidthType.DXA } })] }));
        rows.push(new D.TableRow({ height: { value: tw(H * .44), rule: D.HeightRule.ATLEAST }, children: [cellP([P([T('Equation' + pl(e), { bold: true })])], { width: { size: c1, type: D.WidthType.DXA } })] }));
        out.push(new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: [c1, W - c1], indent: { size: indent0, type: D.WidthType.DXA }, rows }), P([T('')], { spacing: { after: 120 } }));
        break;
      }
      case 'essay': {
        const H = Math.max(.3, +q.boxH || 1.6), k = key && q.ansText ? [P([HL(q.ansText)])] : [P([T('')])];
        if (q.layout === 'side') {
          const pI = this.splitImgs(q.stem), c1 = Math.round(W * .46);
          out.push(new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: [c1, W - c1], indent: { size: indent0, type: D.WidthType.DXA }, rows: [new D.TableRow({ height: { value: tw(H), rule: D.HeightRule.ATLEAST }, children: [cellP([P(await htmlRuns(pI.imgs.replace(/<img/gi, '<img'), { font: TNR, size: 24 }), { alignment: D.AlignmentType.CENTER })], { width: { size: c1, type: D.WidthType.DXA }, verticalAlign: D.VerticalAlign.CENTER }), cellP([P([T(label + '. '), ...(await runs(pI.text)), T(' (' + fmtPts(w) + ')', { italics: true })]), ...k], { width: { size: W - c1, type: D.WidthType.DXA } })] })] }));
        } else {
          out.push(P([T(label + '.\t'), ...(await runs(q.stem)), T(' (' + fmtPts(w) + ')', { italics: true })], { indent: { left: indent0 + tw(.45), hanging: tw(.45) }, tabStops: [{ type: D.TabStopType.LEFT, position: indent0 + tw(.45) }], keepNext: true, spacing: { after: 80 } }));
          const W2 = W - tw(.45);
          out.push(new D.Table({ width: { size: W2, type: D.WidthType.DXA }, columnWidths: [W2], indent: { size: indent0 + tw(.45), type: D.WidthType.DXA }, rows: [new D.TableRow({ height: { value: tw(H), rule: D.HeightRule.ATLEAST }, children: [cellP(k, { width: { size: W2, type: D.WidthType.DXA } })] })] }));
        }
        out.push(P([T('')], { spacing: { after: 120 } }));
        break;
      }
      case 'seq': {
        const ev = seqEvents(q), ord = seqOrder(q), head = String(q.head || '').trim();
        if (head || ctx.letter) out.push(P([T((ctx.letter ? ctx.letter + '. ' : '') + head + ' (' + fmtPts(w) + ')', { bold: true })], { indent: { left: indent0 + tw(.25) }, keepNext: true, spacing: { after: 100 } }));
        if (stripHTML(q.stem)) out.push(P(await runs(q.stem), { indent: { left: indent0 + tw(.45) }, keepNext: true, spacing: { after: 80 } }));
        const W2 = W - tw(.45), c1 = tw(.42);
        out.push(new D.Table({ width: { size: W2, type: D.WidthType.DXA }, columnWidths: [c1, W2 - c1], indent: { size: indent0 + tw(.45), type: D.WidthType.DXA }, rows: ord.map((j, ri) => new D.TableRow({ cantSplit: true, height: { value: tw(.32), rule: D.HeightRule.ATLEAST }, children: [cellP([P([key ? HL(String(j + 1)) : T('')], { alignment: D.AlignmentType.CENTER, keepNext: ri < ord.length - 1 })], { width: { size: c1, type: D.WidthType.DXA }, verticalAlign: D.VerticalAlign.CENTER }), cellP([P([T(ev[j])], { keepNext: ri < ord.length - 1 })], { width: { size: W2 - c1, type: D.WidthType.DXA }, verticalAlign: D.VerticalAlign.CENTER })] })) }), P([T('')], { spacing: { after: 120 } }));
        break;
      }
      case 'table': {
        if (stripHTML(q.stem) || /<img/i.test(q.stem || '')) out.push(P([T(label + '. '), ...(await runs(q.stem)), T(' (' + fmtPts(w) + ')', { italics: true })], { indent: { left: indent0 }, keepNext: true, spacing: { after: 100 } }));
        const cols = q.cols || [], cw = Math.round(W / Math.max(1, cols.length));
        const cellRuns = c => { const parts = String(c || '').split(/(\[\[[\s\S]*?\]\])/); return parts.filter(Boolean).map(s => { const m = s.match(/^\[\[([\s\S]*?)\]\]$/); return m ? (key ? HL(m[1]) : T('          ')) : T(s); }); };
        out.push(new D.Table({ width: { size: cw * cols.length, type: D.WidthType.DXA }, columnWidths: cols.map(() => cw), indent: { size: indent0, type: D.WidthType.DXA }, rows: [new D.TableRow({ tableHeader: true, children: cols.map(c => cellP([P([T(c, { bold: true })], { alignment: D.AlignmentType.CENTER })], { shading: { fill: 'D0D0D0' }, width: { size: cw, type: D.WidthType.DXA } })) }), ...(q.cells || []).map(r => new D.TableRow({ height: { value: tw(.4), rule: D.HeightRule.ATLEAST }, children: cols.map((_, i) => cellP([P(cellRuns((r || [])[i]), { alignment: D.AlignmentType.CENTER })], { width: { size: cw, type: D.WidthType.DXA }, verticalAlign: D.VerticalAlign.CENTER })) }))] }));
        out.push(P([T('')], { spacing: { after: +q.boxH > 0 ? tw(+q.boxH) : 120 } }));
        break;
      }
      case 'crossword': {
        const L = CW.layoutOf(q); if (!L.placed.length) break;
        if (stripHTML(q.stem)) out.push(P(await runs(q.stem), { indent: { left: indent0 }, spacing: { after: 100 } }));
        const cs = Math.round(Math.min(.32, (OP_CW - .5) / L.cols) * 1440);
        const rows = L.cells.map((r, ri) => new D.TableRow({ cantSplit: true, height: { value: cs, rule: D.HeightRule.EXACT }, children: r.map(c => new D.TableCell({ width: { size: cs, type: D.WidthType.DXA }, borders: c ? allB : { top: none, bottom: none, left: none, right: none }, margins: { top: 0, bottom: 0, left: 20, right: 20 }, children: [P(c ? [...(c.num ? [T(String(c.num), { size: 12 })] : []), ...(key ? [T((c.num ? ' ' : '') + c.ch, { bold: true, size: 20 })] : [])] : [T('')], { keepNext: true })] })) }));
        out.push(new D.Table({ width: { size: cs * L.cols, type: D.WidthType.DXA }, columnWidths: L.cells[0].map(() => cs), alignment: D.AlignmentType.CENTER, borders: noB, rows }), P([T('')], { spacing: { after: 120 } }));
        const half = Math.round(W / 2), cl = d => L.placed.filter(p => p.dir === d).map(p => P([T(p.num + '. ' + (p.clue || '(no clue)'))], { indent: { left: tw(.25), hanging: tw(.25) } }));
        out.push(new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: [half, W - half], indent: { size: indent0, type: D.WidthType.DXA }, borders: noB, rows: [new D.TableRow({ children: [new D.TableCell({ borders: noB, width: { size: half, type: D.WidthType.DXA }, children: [P([T('ACROSS', { bold: true })]), ...cl(0)] }), new D.TableCell({ borders: noB, width: { size: W - half, type: D.WidthType.DXA }, children: [P([T('DOWN', { bold: true })]), ...cl(1)] })] })] }), P([T('')], { spacing: { after: 120 } }));
        break;
      }
      default: out.push(P([T(label + '. '), ...(await runs(q.stem))], { indent: { left: indent0 }, spacing: after }));
    }
    return out;
  },
  async docx(ex, key) {
    const D = docx, TNR = 'Times New Roman', tw = v => Math.round(v * 1440), L = layout(ex);
    const T = (t, o = {}) => new D.TextRun({ text: String(t ?? ''), font: TNR, size: 24, ...o });
    const P = (c, o = {}) => new D.Paragraph({ children: c, spacing: { after: 0 }, ...o });
    const none = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, line = { style: D.BorderStyle.SINGLE, size: 6, color: '000000' };
    const noB = { top: none, bottom: none, left: none, right: none, insideHorizontal: none, insideVertical: none };
    const W = tw(OP_CW), ch = [];
    /* header: left text, right logo + motto */
    const cR = tw(1.35), cL = W - cR, tab = pos => new D.TextRun({ children: [new D.Tab()], font: TNR, size: 24 });
    const left = [P([T(this.headLine(ex), { size: 26 }), ...(key ? [T('  · ANSWER KEY', { bold: true, size: 20 })] : [])]), P([T(ex.opTopic || '', { bold: true, size: 34 })], { spacing: { before: 40, after: 220 } }),
      P([T('Name: ' + '_'.repeat(30)), tab(), T('Score: ' + '_'.repeat(13))], { tabStops: [{ type: D.TabStopType.LEFT, position: tw(3.6) }], spacing: { after: 220 } }),
      P([T('Section: ' + '_'.repeat(ex.opCN ? 19 : 27) + (ex.opCN ? ' CN: _____' : '')), tab(), T('Date: ' + (ex.date ? ex.date : '_'.repeat(14)))], { tabStops: [{ type: D.TabStopType.LEFT, position: tw(3.6) }] })];
    const right = [];
    if (ex.logo) { const lr = await imgRun(ex.logo, 92); if (lr) right.push(P([lr], { alignment: D.AlignmentType.CENTER })); }
    if (ex.motto) right.push(P([T(ex.motto, { italics: true, size: 16 })], { alignment: D.AlignmentType.CENTER }));
    if (!right.length) right.push(P([T('')]));
    ch.push(new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: [cL, cR], borders: noB, rows: [new D.TableRow({ children: [new D.TableCell({ borders: noB, width: { size: cL, type: D.WidthType.DXA }, children: left }), new D.TableCell({ borders: noB, width: { size: cR, type: D.WidthType.DXA }, children: right })] })] }), P([T('')], { spacing: { after: 160 } }));
    for (const [i, s] of L.secs.entries()) {
      ch.push(P([T((RN[i] || i + 1) + '.', { bold: true }), T('\t' + s.title + ' (' + fmtPts(s.pts) + ')', { bold: true })], { tabStops: [{ type: D.TabStopType.LEFT, position: tw(.38) }], keepNext: true, spacing: { before: 120 } }));
      if (s.dir) ch.push(P([T(s.dir)], { indent: { left: tw(.38) }, keepNext: true, spacing: { after: 160 } }));
      const sq = s.sq, pool = sq ? String(sq.pool || '').split('\n').map(x => x.trim()).filter(Boolean) : [];
      if (pool.length) {
        const cols = pool.length > 16 ? 4 : 3, rows = Math.ceil(pool.length / cols), Wp = W - tw(.38), cw = Math.round(Wp / cols);
        ch.push(new D.Table({ width: { size: cw * cols, type: D.WidthType.DXA }, columnWidths: Array(cols).fill(cw), indent: { size: tw(.38), type: D.WidthType.DXA }, borders: { top: line, bottom: line, left: line, right: line, insideHorizontal: none, insideVertical: none }, rows: Array.from({ length: rows }, (_, r) => new D.TableRow({ children: Array.from({ length: cols }, (_, c) => new D.TableCell({ width: { size: cw, type: D.WidthType.DXA }, children: [P([T(pool[c * rows + r] || '')], { alignment: D.AlignmentType.CENTER, spacing: { before: 30, after: 30 } })] })) })) }), P([T('')], { spacing: { after: 160 } }));
      }
      let seqN = 0; const seqTotal = s.top.filter(x => x.t.type === 'seq').length;
      for (const { t, leaves } of s.top) {
        if (isGroup(t)) { const [b, rest] = groupHeadParts(L, t, leaves); ch.push(P([T(b + ' ', { bold: true }), T(rest)], { indent: { left: tw(.38) }, keepNext: true, spacing: { after: 100 } })); if (t.type === 'passage' && stripHTML(t.stem)) ch.push(P(await htmlRuns(t.stem, { font: TNR, size: 24 }), { indent: { left: tw(.38) }, spacing: { after: 100 } })); (t.sopts || []).filter(Boolean).forEach((o, k) => ch.push(P([T(LET[k] + '. ' + o)], { indent: { left: tw(.8) } }))); }
        for (const q of leaves) ch.push(...(await this.docxItem(q, rgH(L.pnum[q.id]), key, sq, { letter: q.type === 'seq' && seqTotal > 1 ? LET[seqN++] : '' })));
      }
    }
    if (stripHTML(ex.formula) || /<img/i.test(ex.formula || '')) ch.push(P([T('- FORMULA BANK -', { bold: true, size: 21 })], { alignment: D.AlignmentType.CENTER, pageBreakBefore: !!ex.formulaSep, spacing: { before: 200, after: 60 } }), new D.Table({ width: { size: W, type: D.WidthType.DXA }, columnWidths: [W], rows: [new D.TableRow({ children: [new D.TableCell({ borders: { top: line, bottom: line, left: line, right: line }, margins: { top: 100, bottom: 100, left: 120, right: 120 }, children: [P(await htmlRuns(sanitizeHTML(ex.formula), { font: TNR, size: 24 }), { alignment: D.AlignmentType.CENTER })] })] })] }));
    const fs = 22, footer = new D.Footer({ children: [new D.Paragraph({ tabStops: [{ type: D.TabStopType.RIGHT, position: W }], children: [T(ex.footer || '', { italics: true, size: fs }), new D.TextRun({ children: [new D.Tab()], size: fs }), T('Page ', { size: fs }), new D.TextRun({ children: [D.PageNumber.CURRENT], font: TNR, size: fs, bold: true }), T(' of ', { size: fs }), new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES], font: TNR, size: fs })] })] });
    return D.Packer.toBlob(new D.Document({ creator: 'Jin Assessment Studio', title: ex.title, styles: { default: { document: { run: { font: TNR, size: 24 } } } }, sections: [{ properties: { page: { size: { width: tw(OP_PAGE.w), height: tw(OP_PAGE.h) }, margin: { top: tw(OP_PAGE.top), right: tw(OP_PAGE.side), bottom: tw(OP_PAGE.bottom), left: tw(OP_PAGE.side), footer: tw(.4), header: tw(.3) } } }, footers: { default: footer }, children: ch }] }));
  },
  async exportDocx(key) {
    const ex = curExam(); if (!ex || !ex.items.length) return toast('Add questions before exporting.', 'info');
    try { toast('Preparing Word file…', 'info', 1500); const blob = await this.docx(ex, key); await saveOut(safeName(ex.title, 'quiz') + (key ? ' - ANSWER KEY' : '') + '.docx', new Uint8Array(await blob.arrayBuffer()), [{ name: 'Word document', extensions: ['docx'] }], 'Word file'); }
    catch (e) { console.error(e); toast('Word export failed: ' + e.message, 'error'); }
  },
  /* ---------- sample ---------- */
  sample(ex) {
    const add = (o) => { const q = newQ(o.type, o); S.qs.push(q); Classify.autoBloom(q); ex.items.push(q.id); return q; };
    const sec = p => add({ type: 'section', preset: p, title: OPDIR[p][0], dir: OPDIR[p][1], pool: '', numBy: '', drawLabel: '' });
    sec('mtf');
    [['Wavelength is <u>inversely proportional</u> to the wave’s frequency.', 'TRUE'], ['When M cones and S cones are active, humans see the color <u>cyan</u>.', 'TRUE'], ['<u>Refraction</u> occurs when two or more waves interact with each other.', 'Interference'], ['The particles in a <u>longitudinal wave</u> oscillate perpendicular to the wave’s propagation.', 'Transverse wave'], ['The regions x-rays → infrared → microwaves are written in order of <u>increasing</u> energy.', 'Decreasing']].forEach(([s, a]) => add({ type: 'mtf', stem: s, ansText: a, pts: 2 }));
    sec('mc');
    [['Which of the following is true for all electromagnetic waves?', ['They are transverse waves.', 'They only have magnetic components.', 'They cannot travel in a vacuum.', 'They only interfere with waves of similar amplitude.'], 'A'], ['Which medical imaging test is safest for a patient with a metal pacemaker?', ['MRI', 'EBRT', 'X-rays', 'CT Scan'], 'D'], ['Which EM wave has the longest wavelength?', ['Gamma rays', 'Radio waves', 'Visible light', 'X-rays'], 'B'], ['What color do humans see when L and M cones are active?', ['Blue', 'Cyan', 'Yellow', 'Magenta'], 'C'], ['Why are gamma rays used in radiation therapy?', ['They gently warm the tissue.', 'They are absorbed by the skin.', 'They reflect off tumors.', 'They can damage the DNA of cancer cells.'], 'D']].forEach(([s, o, a]) => add({ type: 'mc', stem: s, opts: o, ans: a, pts: 1 }));
    sec('seq');
    add({ type: 'seq', head: 'Big Bang Theory', events: ['Space rapidly expands faster than light.', 'Quarks, gluons and leptons form.', 'Quarks couple to form hydrogen ions.', 'The universe cools, forming neutral atoms.', 'Dense hydrogen and helium gas accumulate.', 'Gas collapses to form the first stars.'], ppe: 1, seed: 11 });
    sec('prob');
    add({ type: 'prob', stem: 'A radio station broadcasts at a frequency of 9.80 × 10<sup>7</sup> Hz. What is the wavelength of its waves?', pts: 5, ansText: 'λ = 3.06 m', boxH: 2.2 });
    sec('crossword');
    add({ type: 'crossword', words: [{ w: 'RADIO', c: 'EM wave used for broadcasting' }, { w: 'GAMMA', c: 'Highest-energy EM wave' }, { w: 'MICROWAVE', c: 'Used to heat food' }, { w: 'INFRARED', c: 'Felt as heat' }], ppe: 1, seed: 1 });
    if (!ex.opTopic) ex.opTopic = 'Electromagnetic Waves';
    if (!ex.grade) ex.grade = 'Grade 9 POES'; if (!ex.subject) ex.subject = 'Science'; if (!ex.schoolYear) ex.schoolYear = '26-27';
    if (ex.title === 'Untitled Assessment') ex.title = 'Quiz 1.3';
    ex.updated = nowISO();
  }
};

/* =====================================================================
   GOOGLE FORMS
   ===================================================================== */
const GF_TYPES = [['gmc', 'Multiple choice', '◉'], ['gcb', 'Checkboxes', '☑'], ['gdd', 'Dropdown', '▾'], ['gsa', 'Short answer', '▭'], ['gpa', 'Paragraph', '☰']];
const GForm = {
  settings(ex) { ex.gf = Object.assign({ desc: '', email: false, shuffle: false, required: true, confirm: '' }, ex.gf || {}); return ex.gf; },
  renderBuilder(box, ex, C) {
    const g = this.settings(ex);
    box.innerHTML = `<div class="grid2"><div style="min-width:0" class="gf-col">
        <div class="gf-head"><div class="gf-band"></div><input class="gf-title" data-ex="title" value="${esc(ex.title)}" placeholder="Untitled form" aria-label="Form title"><textarea class="gf-fdesc" data-gfs="desc" rows="2" placeholder="Form description">${esc(g.desc)}</textarea></div>
        ${this.toolbar()}
        <div id="qlist">${this.list(ex, C.L)}</div>
        <div class="gf-addbar"><div class="dd"><button class="btn blue" data-dd="dd-gfadd2">${icon('plus')}Add question ${icon('down')}</button><div class="ddm" id="dd-gfadd2">${this.addMenu()}</div></div><button class="btn" data-a="gf-add-sec">${icon('layers')}Add section</button><button class="btn" data-a="import" data-target="exam">${icon('upload')}Make questions from a Word or PDF file</button><span class="spacer"></span><button class="btn danger sm" data-a="clear-exam">${icon('trash')}Clear form</button></div>
      </div><div style="min-width:0" id="exam-rail">${this.rail(ex, C)}</div></div>`;
  },
  addMenu() { return GF_TYPES.map(([k, n, ic]) => `<button class="mi" data-a="gf-add" data-type="${k}"><span class="gf-ic">${ic}</span><span>${n}</span></button>`).join(''); },
  toolbar() {
    return `<div class="ribbon gf-ribbon" id="ribbon" role="toolbar" aria-label="Form tools"><div class="ribbon-label"><b>GOOGLE FORMS</b><span>QUIZ BUILDER</span></div>
      <div class="group"><div class="dd"><button class="btn blue sm" data-dd="dd-gfadd">${icon('plus')}Add question ${icon('down')}</button><div class="ddm" id="dd-gfadd">${this.addMenu()}</div></div><button class="btn sm" data-a="gf-add-sec">${icon('layers')}Section</button><button class="btn sm" data-a="import" data-target="exam">${icon('upload')}From Word/PDF</button><button class="btn sm" data-a="pick-bank">${icon('bank')}From bank</button></div>
      <div class="group"><button class="btn sm" data-a="preview">${icon('eye')}Preview</button><button class="btn sm gold" data-a="gf-export">${icon('upload')}Send to Google Forms</button></div>
      <div class="group"><button class="btn sm fmt" data-a="insert-img" title="Insert an image into the question">${icon('image')}</button></div><span class="ribbon-status" id="ribbon-status">● Changes saved</span></div>`;
  },
  list(ex, L) {
    if (!ex.items.length) return `<div class="empty"><img src="${CHIBI.idea}" alt=""><b>No questions yet</b>Add a question, or make questions automatically from a Word or PDF file.<div class="row" style="justify-content:center;margin-top:12px"><button class="btn blue" data-a="gf-add" data-type="gmc">${icon('plus')}Add a question</button><button class="btn" data-a="import" data-target="exam">${icon('upload')}From a Word or PDF file</button></div></div>`;
    const nSec = L.secs.length; let h = '';
    L.secs.forEach((s, i) => {
      if (nSec > 1 || s.secId) h += `<div class="gf-secband">Section ${i + 1} of ${nSec}<span class="right tiny">${plural(s.items, 'question')} · ${fmtPts(s.pts)}</span></div>`;
      if (s.secId) h += Exam.card(Q(s.secId), L, true);
      s.top.forEach(({ t }) => { h += Exam.card(t, L, true); });
    });
    return h;
  },
  tools(q) { return `<div class="qtools"><button class="btn icon sm ghost" data-a="q-up" title="Move up">${icon('up')}</button><button class="btn icon sm ghost" data-a="q-down" title="Move down">${icon('down')}</button><button class="btn icon sm ghost" data-a="q-dup" title="Duplicate">${icon('copy')}</button>${q.type !== 'section' ? `<button class="btn sm ${q.inBank ? 'on' : ''}" data-a="q-bank" title="Save a copy to the item bank">${q.inBank ? icon('check') + 'In bank' : icon('bank') + 'Bank'}</button>` : ''}<button class="btn icon sm ghost" data-a="q-del" title="Delete">${icon('trash')}</button></div>`; },
  sectionCard(q) {
    return `<div class="qcard gfcard gfsec qtop" data-id="${q.id}"><div class="gfhead"><span class="grip" title="Drag to reorder">${icon('grip')}</span><input class="gf-sectitle" data-f="title" value="${esc(q.title)}" placeholder="Section title">${this.tools(q)}</div><textarea class="gf-fdesc" data-f="dir" rows="2" placeholder="Description (optional)">${esc(q.dir || '')}</textarea><div class="tiny">Students see each section on its own page.</div></div>`;
  },
  card(q, L) {
    const n = L && L.num[q.id], opt = GOPT.has(q.type), cap = 20;
    const mark = i => q.type === 'gdd' ? `<span class="gfmark num">${i + 1}.</span>` : `<span class="gfmark ${q.type === 'gcb' ? 'sq' : 'rd'}"></span>`;
    const correct = i => q.type === 'gcb' ? (q.ansMulti || []).includes(i) : q.ans === LET[i];
    const keyCtl = i => q.type === 'gcb' ? `<label class="gfkey" title="Correct answer"><input type="checkbox" data-f="ansm" data-i="${i}"${correct(i) ? ' checked' : ''}><span>✓</span></label>` : `<label class="gfkey" title="Correct answer"><input type="radio" name="ans-${q.id}" data-f="ans" data-i="${i}"${correct(i) ? ' checked' : ''}><span>✓</span></label>`;
    let body = '';
    if (opt) {
      body = (q.opts || []).map((o, i) => `<div class="orow gfopt${correct(i) ? ' correct' : ''}" data-orow="${i}"><span class="ograb" data-ograb="opts" title="Drag to reorder">${icon('grip')}</span>${mark(i)}<input data-f="opt" data-i="${i}" value="${esc(o)}" placeholder="Option ${i + 1}">${keyCtl(i)}<button class="btn icon sm ghost" data-a="del-opt" data-i="${i}" title="Remove option">${icon('x')}</button></div>`).join('');
      if ((q.opts || []).length < cap) body += `<button class="btn sm ghost gf-addopt" data-a="add-opt">${mark((q.opts || []).length)}Add option</button>`;
      body += fmtHasKey(q) ? `<div class="gf-keynote ok">${icon('check')}Answer key: ${esc(fmtAnswerOf(q))}</div>` : `<div class="why">Tick ✓ beside the correct ${q.type === 'gcb' ? 'option(s)' : 'option'} to set the answer key.</div>`;
    } else if (q.type === 'gsa') body = `<div class="gfline">Short-answer text</div><div class="orow"><b class="wide">Answer key</b><input data-f="ansText" value="${esc(q.ansText)}" placeholder="Accepted answers, separated by /"></div>`;
    else body = `<div class="gfline long">Long-answer text</div><div class="orow"><b class="wide">Notes</b><input data-f="ansText" value="${esc(q.ansText)}" placeholder="Expected answer or rubric (kept in this app)"></div>`;
    return `<div class="qcard gfcard qtop" data-id="${q.id}">
      <div class="gfhead"><span class="grip" title="Drag to reorder">${icon('grip')}</span><span class="qnum gfnum">${n ? n[0] : '—'}</span><div class="ed gfq" contenteditable="true" data-f="stem" data-ph="Question">${q.stem || ''}</div><select data-f="type" class="gftype" title="Question type">${GF_TYPES.map(([k, nm, ic]) => `<option value="${k}"${k === q.type ? ' selected' : ''}>${ic}  ${nm}</option>`).join('')}</select></div>
      <input class="gfdesc" data-f="desc" value="${esc(q.desc || '')}" placeholder="Description (optional)">
      <div class="gfbody">${body}</div>
      <div class="gffoot"><label class="pts">Points <input type="number" min="0" max="100" step="1" data-f="pts" value="${Math.round(+q.pts || 0)}"></label><label class="gfreq"><input type="checkbox" data-f="req"${q.req !== false ? ' checked' : ''}><span class="sw"></span>Required</label><span class="gf-meta">${Exam.bloomSel(q)}${Exam.compSel(q)}</span>${this.tools(q)}</div></div>`;
  },
  rail(ex, C) {
    const g = this.settings(ex), V = this.validate(ex);
    return `<div class="card gf-send"><div class="cardhead"><h2>Send to Google Forms</h2></div><div class="hint">Jin writes a small script. Paste it at script.google.com and click Run. It creates this quiz in your Google account with points and answer keys.</div>
        <button class="btn gold" style="width:100%;justify-content:center;margin-top:10px" data-a="gf-export">${icon('upload')}Send to Google Forms…</button>
        ${V.errors.length ? `<div class="pl-status warn" style="margin-top:8px">${plural(V.errors.length, 'problem')} to fix first.</div>` : V.warns.length ? `<div class="tiny" style="margin-top:8px;color:var(--amber)">${plural(V.warns.length, 'note')} — see the send window.</div>` : `<div class="okbox" style="margin:8px 0 0">Ready to send.</div>`}</div>
      <div class="card"><div class="cardhead"><h2>Form settings</h2></div>
        <label class="set-row"><span><b>Collect email addresses</b></span><input type="checkbox" data-gfs="email"${g.email ? ' checked' : ''}></label>
        <label class="set-row"><span><b>Shuffle question order</b></span><input type="checkbox" data-gfs="shuffle"${g.shuffle ? ' checked' : ''}></label>
        <label class="set-row"><span><b>New questions are required</b></span><input type="checkbox" data-gfs="required"${g.required !== false ? ' checked' : ''}></label>
        <label class="field" style="margin-top:8px">Message after submitting (optional)<input data-gfs="confirm" value="${esc(g.confirm)}" placeholder="e.g., Thank you! Your answers were recorded."></label></div>
      <div class="card"><div class="cardhead"><h2>Quiz overview</h2></div><div class="stats"><div class="stat"><b>${C.items}</b><span>Questions</span></div><div class="stat"><b>${C.points}</b><span>Points</span></div><div class="stat"><b style="color:${C.noKey.length ? 'var(--red)' : 'inherit'}">${C.noKey.length}</b><span>Missing keys</span></div></div></div>
      ${Planner.railCard(ex)}`;
  },
  /* Google Forms titles are one line: the question goes in the title, any other lines (case text, table rows) in the description */
  titleParts(q) {
    const lines = this.textOf(q.stem).split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length <= 1) return { title: lines[0] || '', help: String(q.desc || '').trim() };
    let ti = -1; lines.forEach((l, i) => { if (/\?/.test(l)) ti = i; }); if (ti < 0) ti = 0;
    const rest = lines.filter((_, i) => i !== ti);
    return { title: lines[ti], help: [rest.join('\n'), String(q.desc || '').trim()].filter(Boolean).join('\n\n') };
  },
  textOf(html) { const d = document.createElement('div'); d.innerHTML = String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(div|p|li)>/gi, '\n'); return d.textContent.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim(); },
  imagesOf(html) { return [...String(html || '').matchAll(/<img[^>]*src="(data:image\/(png|jpe?g|gif);base64,([^"]+))"/gi)].map(m => ({ mime: 'image/' + m[2].toLowerCase().replace('jpg', 'jpeg'), b64: m[3] })); },
  validate(ex) {
    const L = layout(ex), errors = [], warns = [], saKeys = [];
    L.leaves.forEach(q0 => {
      const q = GTYPES.has(q0.type) ? q0 : toGFCopy(q0), n = L.num[q0.id][0], lab = 'Question ' + n;
      if (!this.textOf(q.stem) && !this.imagesOf(q.stem).length) warns.push(lab + ' has no question text (it will show as “Untitled Question”).');
      if (GOPT.has(q.type)) {
        const o = (q.opts || []).map(s => String(s).trim());
        if (!o.filter(Boolean).length) errors.push(lab + ' needs at least one option.');
        const seen = new Set(); o.filter(Boolean).forEach(s => { if (seen.has(s.toLowerCase())) errors.push(lab + ' has the option “' + s + '” twice. Google Forms does not allow duplicate options.'); seen.add(s.toLowerCase()); });
        if (o.some(s => !s) && o.filter(Boolean).length) warns.push(lab + ' has an empty option; it will be left out.');
        if (!fmtHasKey(q)) warns.push(lab + ' has no answer key.');
      }
      if (q.type === 'gsa' && String(q.ansText || '').trim()) saKeys.push({ n, key: q.ansText.trim() });
      if ((+q.pts || 0) % 1) warns.push(lab + ' has decimal points; Google Forms uses whole numbers, so it becomes ' + Math.round(+q.pts) + '.');
      if (/<img[^>]*src="data:image\/webp/i.test(q.stem || '')) warns.push(lab + ' has a WebP image, which Google Forms can’t take. Insert it again as PNG or JPG.');
    });
    if (saKeys.length) warns.push('Google Forms can’t receive short-answer keys from a script. After it is created, add these in the form’s Answer key: ' + saKeys.map(s => 'Q' + s.n + ' = ' + s.key).join('; ') + '.');
    if (!L.leaves.length) errors.push('Add at least one question.');
    return { errors, warns, saKeys };
  },
  script(ex) {
    const g = this.settings(ex), L = layout(ex), J = s => JSON.stringify(String(s ?? ''));
    const lines = [`/* Created by Jin Assessment Studio on ${new Date().toLocaleString()}.`, `   How to use: click Run (▶) above. Allow the permissions when Google asks.`, `   The links to your new form appear in the Execution log below. */`, `function createJinForm() {`,
      `  var form = FormApp.create(${J(ex.title || 'Untitled quiz')});`, `  form.setIsQuiz(true);`, `  form.setDescription(${J(g.desc)});`, `  form.setCollectEmail(${!!g.email});`, `  form.setShuffleQuestions(${!!g.shuffle});`];
    if (String(g.confirm || '').trim()) lines.push(`  form.setConfirmationMessage(${J(g.confirm)});`);
    lines.push(`  var item;`);
    let first = true;
    (ex.items || []).map(Q).filter(Boolean).forEach(t => {
      if (t.type === 'section') { if (!first) lines.push(``, `  form.addPageBreakItem().setTitle(${J(t.title || 'Section')}).setHelpText(${J(t.dir || '')});`); else lines.push(``, `  form.addSectionHeaderItem().setTitle(${J(t.title || 'Section')}).setHelpText(${J(t.dir || '')});`); first = false; return; }
      (isGroup(t) ? kidsOf(t) : [t]).forEach(q0 => {
        first = false;
        const q = GTYPES.has(q0.type) ? q0 : toGFCopy(q0), n = L.num[q0.id] ? L.num[q0.id][0] : '';
        lines.push(``, `  // Question ${n}`);
        this.imagesOf(q.stem).forEach((im, k) => lines.push(`  form.addImageItem().setImage(Utilities.newBlob(Utilities.base64Decode(${J(im.b64)}), ${J(im.mime)}, ${J('q' + n + '-' + (k + 1))}));`));
        const add = { gmc: 'addMultipleChoiceItem', gcb: 'addCheckboxItem', gdd: 'addListItem', gsa: 'addTextItem', gpa: 'addParagraphTextItem' }[q.type];
        const tp = this.titleParts(q);
        lines.push(`  item = form.${add}();`, `  item.setTitle(${J(tp.title)});`);
        if (tp.help) lines.push(`  item.setHelpText(${J(tp.help)});`);
        if (GOPT.has(q.type)) {
          const ch = (q.opts || []).map((o, i) => ({ o: String(o).trim(), ok: q.type === 'gcb' ? (q.ansMulti || []).includes(i) : q.ans === LET[i] })).filter(x => x.o);
          lines.push(`  item.setChoices([${ch.map(x => `item.createChoice(${J(x.o)}, ${x.ok})`).join(', ')}]);`);
        }
        lines.push(`  item.setPoints(${Math.max(0, Math.round(+q.pts || 0))});`, `  item.setRequired(${q.req !== false});`);
      });
    });
    const V = this.validate(ex);
    lines.push(``, `  Logger.log('Done! Edit your form: ' + form.getEditUrl());`, `  Logger.log('Link for students: ' + form.getPublishedUrl());`);
    if (V.saKeys.length) lines.push(`  Logger.log(${J('Add these short-answer keys in the form (Answer key): ' + V.saKeys.map(s => 'Q' + s.n + ' = ' + s.key).join('; '))});`);
    lines.push(`}`);
    return lines.join('\n');
  },
  exportDialog() {
    const ex = curExam(); if (!ex) return;
    const V = this.validate(ex);
    if (V.errors.length) return modal(`<h3>Fix these before sending</h3><div class="mbody"><img class="chibi-side" src="${CHIBI.concerned}" alt=""><ul>${V.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul><div style="clear:both"></div></div><div class="mfoot"><button class="btn blue" data-a="modal-close">OK</button></div>`, { size: 'narrow' });
    const code = this.script(ex), kb = Math.round(new Blob([code]).size / 1024);
    modal(`<h3>Send “${esc(ex.title || 'Untitled quiz')}” to Google Forms</h3>
      <ol class="gf-steps"><li>Click <b>Copy script</b> (or download it).</li><li>Open <b>script.google.com</b>, sign in, and click <b>New project</b>.</li><li>Delete the sample code, paste, then click <b>Run ▶</b>. The first time, click <b>Review permissions</b> and allow it.</li><li>Open the <b>Execution log</b>: it shows the link to edit your new form and the link for students.</li></ol>
      ${V.warns.length ? `<div class="pl-status warn" style="margin:8px 0">${V.warns.map(esc).join('<br>')}</div>` : ''}
      <textarea class="gf-code" readonly id="gf-code">${esc(kb > 400 ? code.slice(0, 20000) + '\n\n… (script continues — use Copy or Download to get all of it)' : code)}</textarea>
      <div class="mfoot"><span class="tiny">${C_items(ex)} · ${kb} KB</span><span class="spacer"></span><button class="btn" id="gf-dl">${icon('download')}Download .gs</button><button class="btn blue" id="gf-copy">${icon('copy')}Copy script</button></div>`, { size: 'wide' });
    $('#gf-copy').onclick = async () => { try { await navigator.clipboard.writeText(code); toast('Script copied. Paste it at script.google.com.'); } catch (e) { const ta = $('#gf-code'); ta.value = code; ta.select(); document.execCommand('copy'); toast('Script copied.'); } };
    $('#gf-dl').onclick = () => saveOut(safeName(ex.title, 'quiz') + ' - Google Forms.gs', code, [{ name: 'Apps Script', extensions: ['gs'] }, { name: 'Text', extensions: ['txt'] }], 'Script');
  },
  /* respondent-style preview */
  preview() {
    const ex = curExam(); if (!ex) return; const g = this.settings(ex), L = layout(ex);
    let h = `<div class="gfp"><div class="gfp-head"><div class="gf-band"></div><h2>${esc(ex.title || 'Untitled form')}</h2>${g.desc ? `<p>${esc(g.desc)}</p>` : ''}<div class="gfp-req">* Indicates required question</div></div>`;
    L.secs.forEach((s, i) => {
      if (s.secId) h += `<div class="gfp-sec"><div class="gfp-sectag">Section ${i + 1} of ${L.secs.length}</div><h3>${esc(s.title)}</h3>${s.dir ? `<p>${esc(s.dir)}</p>` : ''}</div>`;
      s.top.forEach(({ leaves }) => leaves.forEach(q0 => {
        const q = GTYPES.has(q0.type) ? q0 : toGFCopy(q0);
        const imgs = this.imagesOf(q.stem).map(im => `<img src="data:${im.mime};base64,${im.b64}" alt="">`).join('');
        let a = '';
        if (q.type === 'gmc' || q.type === 'gcb') a = (q.opts || []).filter(o => String(o).trim()).map(o => `<label class="gfp-opt"><span class="gfmark ${q.type === 'gcb' ? 'sq' : 'rd'}"></span>${esc(o)}</label>`).join('');
        else if (q.type === 'gdd') a = `<div class="gfp-dd">Choose ▾</div>`;
        else a = `<div class="gfp-line${q.type === 'gpa' ? ' long' : ''}">${q.type === 'gpa' ? 'Long-answer text' : 'Short-answer text'}</div>`;
        const tp = this.titleParts(q);
        h += `<div class="gfp-q">${imgs}<div class="gfp-title">${esc(tp.title || 'Untitled Question')}${q.req !== false ? ' <span class="gfp-star">*</span>' : ''}<span class="gfp-pts">${Math.round(+q.pts || 0)} point${Math.round(+q.pts || 0) === 1 ? '' : 's'}</span></div>${tp.help ? `<div class="gfp-desc" style="white-space:pre-line">${esc(tp.help)}</div>` : ''}${a}</div>`;
      }));
    });
    h += `<div class="gfp-foot"><span class="gfp-submit">Submit</span></div></div>`;
    modal(`<h3>Preview — how students will see it</h3><div class="row" style="margin:6px 0 10px"><span class="tiny">This is a preview inside Jin. Send it to Google Forms to share it with students.</span><span class="spacer"></span><button class="btn" data-a="export-key-pdf">${icon('check')}Answer key</button><button class="btn gold" data-a="gf-export">${icon('upload')}Send to Google Forms</button></div><div class="gfp-wrap">${h}</div>`, { size: 'wide' });
  },
  printHTML(ex, key) {
    const L = layout(ex);
    let h = `<div class="ph k"><div class="t1">${esc((ex.title || 'Quiz').toUpperCase())}</div>${this.settings(ex).desc ? `<div style="margin-top:4pt">${esc(this.settings(ex).desc)}</div>` : ''}</div><div class="nm">Name: <i></i></div><hr class="thick">`;
    L.secs.forEach(s => {
      if (s.secId) h += `<div class="tbox"><b>${esc(s.title)}</b> ${esc(s.dir || '')}</div>`;
      s.top.forEach(({ leaves }) => leaves.forEach(q0 => {
        const q = GTYPES.has(q0.type) ? q0 : toGFCopy(q0), n = L.num[q0.id][0];
        const opts = GOPT.has(q.type) ? `<div class="opts">${(q.opts || []).filter(o => String(o).trim()).map((o, i) => { const ok = q.type === 'gcb' ? (q.ansMulti || []).includes(i) : q.ans === LET[i]; return `<div>${q.type === 'gcb' ? '☐' : '○'}&nbsp; ${key && ok ? `<b style="background:#ffef3a">${esc(o)}</b>` : esc(o)}</div>`; }).join('')}</div>` : `<div style="border-bottom:1px solid #000;height:${q.type === 'gpa' ? '1.2in' : '.32in'};margin:6pt 0 0 .3in">${key && q.ansText ? `<b style="background:#ffef3a">${esc(q.ansText)}</b>` : ''}</div>`;
        h += `<div class="q"><span class="qn">${n}.</span><div class="qb">${q.stem || ''} <i>(${fmtPts(Math.round(+q.pts || 0))})</i>${q.desc ? `<div style="font-size:9.5pt;color:#444">${esc(q.desc)}</div>` : ''}${opts}</div></div>`;
      }));
    });
    return h;
  }
};
const C_items = ex => plural(layout(ex).leaves.length, 'question');

/* ---------- converting questions between formats ---------- */
function toGF(q, ex) {
  const req = ex ? GForm.settings(ex).required !== false : true;
  const keep = { req, desc: q.desc || '', ansMulti: q.ansMulti || [] };
  const pts = Math.max(0, Math.round(weight(q)));
  switch (q.type) {
    case 'mc': case 'gmc': Object.assign(q, keep, { type: 'gmc', opts: (q.opts || []).slice(0, 10) }); break;
    case 'cmc': Object.assign(q, keep, { type: 'gmc', stem: (q.stem || '') + '<br>' + (q.statements || []).map((s, i) => RN[i] + '. ' + esc(s)).join('<br>') }); break;
    case 'morse': Object.assign(q, keep, { type: 'gmc', stem: (stripHTML(q.stem) ? q.stem + '<br>' : '') + 'X: ' + esc(q.x || '') + '<br>Y: ' + esc(q.y || ''), opts: ['Only X is true', 'Only Y is true', 'Both X and Y are true', 'Both are false'], ans: morseAns(q) }); break;
    case 'match': { const p = parentOf(q); Object.assign(q, keep, { type: 'gdd', opts: ((p && p.sopts) || []).slice(0, 26) }); break; }
    case 'ident': case 'mtf': case 'gsa': Object.assign(q, keep, { type: 'gsa' }); break;
    case 'seq': { const ev = seqEvents(q), ord = seqOrder(q); Object.assign(q, keep, { type: 'gpa', stem: (q.head ? esc(q.head) + ': ' : '') + 'Arrange these events in order, earliest first.<br>' + ord.map((j, i) => (i + 1) + ') ' + esc(ev[j])).join('<br>'), ansText: ord.map(j => j + 1).join(', ') }); break; }
    case 'table': { const ans = fmtAnswerOf(q), rows = [(q.cols || []), ...(q.cells || [])].map(r => (r || []).map(c => String(c || '').replace(/\[\[[\s\S]*?\]\]/g, '_____')).join(' | ')); Object.assign(q, keep, { type: 'gpa', stem: (q.stem ? q.stem + '<br>' : '') + 'Complete the table (write each missing value):<br>' + rows.map(esc).join('<br>'), ansText: ans }); break; }
    case 'crossword': Object.assign(q, keep, { type: 'gpa', ansText: fmtAnswerOf(q), stem: 'Crossword clues:<br>' + CW.layoutOf(q).placed.map(p => p.num + (p.dir ? ' Down' : ' Across') + ': ' + esc(p.clue)).join('<br>') }); break;
    case 'gcb': case 'gdd': case 'gpa': Object.assign(q, keep); break;
    default: Object.assign(q, keep, { type: 'gpa' });
  }
  q.pts = pts; return q;
}
function toGFCopy(q) { const c = JSON.parse(JSON.stringify(q)); c.parent = q.parent; return toGF(c, curExam()); }
function fromGF(q, to) {
  if (!GTYPES.has(q.type)) return q;
  const t = q.type;
  if (t === 'gmc' || t === 'gdd' || t === 'gcb') { const ans = t === 'gcb' ? ((q.ansMulti || []).length ? LET[Math.min(...q.ansMulti)] : '') : q.ans; q.type = 'mc'; q.opts = (q.opts || []).slice(0, 5); q.ans = LET.indexOf(ans) > -1 && LET.indexOf(ans) < q.opts.length ? ans : ''; q.cols = 'auto'; }
  else if (t === 'gsa') q.type = to === 'onepage' ? 'ident' : 'ident';
  else if (t === 'gpa') { if (to === 'onepage') { q.type = 'essay'; q.boxH = q.boxH || 1.6; q.layout = 'stack'; } else { q.type = 'prob'; q.boxH = q.boxH || 2.4; } }
  const fresh = newQ(q.type); for (const k in fresh) if (q[k] === undefined) q[k] = fresh[k];
  return q;
}
/* make a question (and group) fit the exam's format; returns the top-level ids to add */
function fmtAdopt(ex, q) {
  const f = fmtOf(ex);
  if (f === 'gforms') {
    if (q.type === 'passage' || q.type === 'matching') {
      const ids = [];
      if (q.type === 'passage' && (stripHTML(q.stem) || /<img/i.test(q.stem || ''))) { const s = newQ('section', { title: q.head || 'Read the passage', dir: GForm.textOf(q.stem) }); S.qs.push(s); ids.push(s.id); }
      kidsOf(q).forEach(k => { toGF(k, ex); if (q.type === 'matching' && q.head) k.desc = k.desc || q.head; k.parent = null; ids.push(k.id); });
      /* drop the group itself without replacing any exam's items array (callers push into it) */
      q.kids = []; S.qs = S.qs.filter(x => x.id !== q.id);
      return ids;
    }
    const req = GForm.settings(ex).required !== false;
    if (q.type === 'seq' && seqEvents(q).length >= 2) {
      /* one dropdown per event (printed order), options 1…n */
      const ev = seqEvents(q), ord = seqOrder(q), n = ev.length, ppe = Math.max(0, Math.round(+q.ppe || 1));
      const ids = ord.map(j => { const k = newQ('gdd', { stem: esc(ev[j]), opts: Array.from({ length: n }, (_, i) => String(i + 1)), ans: LET[j], pts: ppe, req, desc: (q.head ? q.head + ': ' : '') + 'choose the order of this event (1 = earliest).', comp: q.comp, compConf: q.compConf, bloom: q.bloom, bloomManual: q.bloomManual, inBank: false }); S.qs.push(k); return k.id; });
      if (!q.inBank) S.qs = S.qs.filter(x => x.id !== q.id);
      return ids;
    }
    if (q.type === 'crossword' && CW.layoutOf(q).placed.length) {
      /* one short-answer question per word */
      const ppe = Math.max(0, Math.round(+q.ppe || 1));
      const ids = CW.layoutOf(q).placed.map(p => { const k = newQ('gsa', { stem: esc(p.clue || 'Crossword word') + ` (${p.word.length} letters)`, ansText: (q.words[p.i] || {}).w || p.word, pts: ppe, req, desc: `Crossword ${p.num} ${p.dir ? 'Down' : 'Across'}`, comp: q.comp, compConf: q.compConf, bloom: q.bloom, bloomManual: q.bloomManual, inBank: false }); S.qs.push(k); return k.id; });
      if (!q.inBank) S.qs = S.qs.filter(x => x.id !== q.id);
      return ids;
    }
    if (q.type !== 'section') toGF(q, ex);
    return [q.id];
  }
  if (GTYPES.has(q.type)) fromGF(q, f);
  if (f === 'scantron') { (isGroup(q) ? kidsOf(q) : [q]).forEach(k => { if (!['prob'].includes(k.type) && !OP_TYPES.has(k.type)) k.pts = 1; else if (k.type === 'prob') k.pts = Math.max(1, Math.round(+k.pts || 1)); }); }
  return [q.id];
}
function convertExam(ex, from, to) {
  const out = []; let pool = [];
  (ex.items || []).map(Q).filter(Boolean).forEach(t => {
    if (t.type === 'section') pool = String(t.pool || '').split('\n').map(x => x.trim()).filter(Boolean);
    if (to === 'gforms' && t.type === 'ident' && pool.length >= 2) {
      /* word-pool item → dropdown of the pool words */
      const i = pool.findIndex(w => w.toLowerCase() === String(t.ansText || '').split('/')[0].trim().toLowerCase());
      Object.assign(t, { type: 'gdd', opts: pool.slice(0, 26), ans: i > -1 ? LET[i] : '', req: GForm.settings(ex).required !== false, desc: t.desc || 'Choose the answer from the word pool.', ansMulti: [], pts: Math.max(0, Math.round(weight(t))) });
      out.push(t.id); return;
    }
    if (t.type === 'section') {
      if (to === 'onepage') { if (!OPDIR[t.preset]) t.preset = DIR[t.preset] && OPDIR[t.preset] ? t.preset : 'custom'; t.title = t.title ? t.title.toUpperCase() : 'TEST'; t.pool = t.pool || ''; }
      else if (to === 'scantron' && !DIR[t.preset]) t.preset = 'custom';
      out.push(t.id); return;
    }
    if (to === 'gforms') { out.push(...fmtAdopt(ex, t)); return; }
    if (GTYPES.has(t.type)) fromGF(t, to);
    if (to === 'onepage') { (isGroup(t) ? kidsOf(t) : [t]).forEach(k => { if (from === 'scantron' && k.type !== 'prob') k.pts = 1; }); }
    if (to === 'scantron') { if (t.type === 'mtf') { t.type = 'ident'; } if (t.type === 'essay') { t.type = 'prob'; t.boxH = t.boxH || 2.4; } (isGroup(t) ? kidsOf(t) : [t]).forEach(k => { if (k.type === 'prob') k.pts = Math.max(1, Math.round(+k.pts || 1)); else if (!OP_TYPES.has(k.type)) k.pts = 1; }); }
    out.push(t.id);
  });
  ex.items = out;
}
async function setExamFormat(ex, to) {
  const from = fmtOf(ex); if (from === to) return true;
  const L = layout(ex), n = L.leaves.length;
  const notes = { gforms: 'Questions become Google Forms questions: multiple choice stays multiple choice, identification becomes short answer, problem solving and essays become paragraph questions. Passages become sections.', onepage: 'Questions keep their types. Each test restarts its numbering, and the quiz is laid out on long bond paper. Points become editable for every item (30 in total by default).', scantron: 'Questions return to the classic builder. Modified True or False becomes identification and essays become problem solving. Points reset to 1 for non-problem items.' };
  if (n && !(await confirmDlg({ title: `Switch “${ex.title || 'this exam'}” to ${FORMATS[to].n}?`, msg: `${notes[to]} ${plural(n, 'question')} will be converted. Save a backup first if you may want the old version.`, ok: 'Switch format', chibi: 'idea' }))) return false;
  ex.format = to; convertExam(ex, from, to);
  const pl = Planner.ensure(ex);
  if (to === 'onepage') { if (pl.points == null) pl.points = 30; if (!ex.footer) ex.footer = 'Natural Sciences Area'; if (!ex.motto) ex.motto = 'Empowered like Mary to lead in Service'; }
  pl.rows.forEach(r => { r.types = Object.assign(blankTypesFor(to), {}); });
  gcQuestions(); ex.updated = nowISO(); touch();
  return true;
}
ACT['set-format'] = async b => {
  const ex = curExam(); if (!ex) return;
  const to = b.dataset.v; if (!(await setExamFormat(ex, to))) return;
  Exam.render(); App.refreshChrome();
  toast({ scantron: 'Scantron format: the classic builder.', onepage: 'One page format: long bond, back to back, 30 points by default.', gforms: 'Google Forms format: build it here, then send it to Google Forms.' }[to], 'ok', 5000);
};

/* ---------- planner types per format ---------- */
const PTYPESETS = {
  scantron: PTYPES.slice(),
  onepage: [{ k: 'mtf', n: 'Modified true or false', s: 'MTF' }, { k: 'mc', n: 'Multiple choice', s: 'MC' }, { k: 'ident', n: 'Identification / word pool', s: 'ID' }, { k: 'prob', n: 'Problem solving', s: 'PS' }, { k: 'essay', n: 'Essay / case study', s: 'ESS' }, { k: 'seq', n: 'Timeline', s: 'TL' }, { k: 'table', n: 'Complete the table', s: 'TBL' }, { k: 'crossword', n: 'Crossword puzzle', s: 'CW' }],
  gforms: [{ k: 'gmc', n: 'Multiple choice', s: 'MC' }, { k: 'gcb', n: 'Checkboxes', s: 'CB' }, { k: 'gdd', n: 'Dropdown', s: 'DD' }, { k: 'gsa', n: 'Short answer', s: 'SA' }, { k: 'gpa', n: 'Paragraph', s: 'PAR' }]
};
const blankTypesFor = f => Object.fromEntries(PTYPESETS[f].map(t => [t.k, 0]));
const MIXF = {
  onepage: { recall: { w: { ident: 4, mtf: 3, mc: 3, crossword: 1 }, why: 'recall outcomes fit identification, word pools, modified true or false and multiple choice' }, explain: { w: { mtf: 3, mc: 4, essay: 2 }, why: 'explaining ideas fits modified true or false (spot and fix the error) and multiple choice' }, apply: { w: { prob: 6, table: 3, mc: 1 }, why: 'applying a formula is best shown by working a problem or completing a table' }, analyze: { w: { essay: 4, seq: 3, table: 2, mc: 1 }, why: 'analysis fits case studies, timelines and data tables' }, evaluate: { w: { essay: 6, mtf: 2 }, why: 'judging claims needs an explained answer' }, create: { w: { essay: 6, prob: 2 }, why: 'creating needs an open, constructed response' }, '': { w: { mc: 4, mtf: 3, ident: 2, prob: 1 }, why: 'no clear action verb was found, so a balanced default is used' } },
  gforms: { recall: { w: { gmc: 5, gsa: 4, gdd: 1 }, why: 'recall outcomes are checked quickly by multiple choice and short answer' }, explain: { w: { gmc: 6, gcb: 3, gpa: 1 }, why: 'explaining ideas fits multiple choice and select-all checkboxes' }, apply: { w: { gmc: 4, gsa: 4, gpa: 2 }, why: 'applying a formula fits a short numeric answer or a worked paragraph' }, analyze: { w: { gmc: 3, gcb: 3, gpa: 4 }, why: 'analysis fits checkboxes and paragraph answers' }, evaluate: { w: { gpa: 5, gcb: 3, gmc: 2 }, why: 'judging claims needs a written justification' }, create: { w: { gpa: 8, gsa: 2 }, why: 'creating needs an open paragraph answer' }, '': { w: { gmc: 6, gsa: 2, gcb: 2 }, why: 'no clear action verb was found, so a balanced default is used' } }
};
function useFormatTypes(ex) { const f = fmtOf(ex); PTYPES = PTYPESETS[f]; PT = Object.fromEntries(PTYPES.map(t => [t.k, t])); return f; }
const __ensure = Planner.ensure.bind(Planner);
Planner.ensure = function (ex) { useFormatTypes(ex); return __ensure(ex); };
const __typeMix = Planner.typeMix.bind(Planner);
Planner.typeMix = function (r) {
  const f = curFmt(); if (f === 'scantron') return __typeMix(r);
  const M = MIXF[f], kinds = this.kindsOf(r), keys = Object.keys(kinds), w = blankTypesFor(f), reasons = [];
  if (!keys.length) { Object.assign(w, M[''].w); reasons.push(M[''].why); }
  keys.forEach(k => { const m = M[k] || M['']; Object.entries(m.w).forEach(([t, v]) => w[t] = (w[t] || 0) + v * kinds[k]); reasons.push(m.why); });
  const evidence = this.rowTexts(r).slice(r.link.kind ? 1 : 0).find(t => Classify.verbKind(t)) || '';
  return { w, kinds: keys, reasons: [...new Set(reasons)], evidence };
};
const __actualType = Planner.actualType.bind(Planner);
Planner.actualType = function (q) { if (curFmt() === 'scantron') return __actualType(q); return PT[q.type] ? q.type : (q.type === 'cmc' || q.type === 'morse' || q.type === 'match') && PT.mc ? 'mc' : PTYPES[0].k; };
Planner.formatCard = function (ex) {
  const cur = fmtOf(ex);
  return `<div class="card fmt-card"><div class="cardhead"><h2>Exam format</h2><span class="tiny">Choose first. It changes the Exam Builder, Preview, exports and the TOS.</span></div>
    <div class="fmt-grid" role="radiogroup" aria-label="Exam format">${Object.entries(FORMATS).map(([k, f]) => `<button class="fmt-tile${k === cur ? ' on' : ''}" role="radio" aria-checked="${k === cur}" data-a="set-format" data-v="${k}"><span class="fmt-ic">${icon(f.icon)}</span><b>${f.n}</b><small>${f.d}</small><span class="tag ${f.tc}">${f.tos}</span></button>`).join('')}</div></div>`;
};

/* ---------- builder dispatch ---------- */
const __renderBuilder = Exam.renderBuilder.bind(Exam);
Exam.renderBuilder = function (box, ex, C) { const f = fmtOf(ex); if (f === 'onepage') return OnePage.renderBuilder(box, ex, C); if (f === 'gforms') return GForm.renderBuilder(box, ex, C); return __renderBuilder(box, ex, C); };
const __list = Exam.list.bind(Exam);
Exam.list = function (ex, L) { const f = fmtOf(ex); if (f === 'onepage') return OnePage.list(ex, L); if (f === 'gforms') return GForm.list(ex, L); return __list(ex, L); };
const __rail = Exam.rail.bind(Exam);
Exam.rail = function (ex, C) { const f = fmtOf(ex); if (f === 'onepage') return OnePage.rail(ex, C); if (f === 'gforms') return GForm.rail(ex, C); return __rail(ex, C); };
const __card = Exam.card.bind(Exam);
Exam.card = function (q, L, top, kid) {
  if (!q) return '';
  if (GTYPES.has(q.type)) return GForm.card(q, L, top);
  if (q.type === 'section') { const f = curFmt(); if (f === 'onepage') return OnePage.sectionCard(q); if (f === 'gforms') return GForm.sectionCard(q); }
  return __card(q, L, top, kid);
};
const __refreshMeta = Exam.refreshMeta.bind(Exam);
Exam.refreshMeta = function () { __refreshMeta(); const ex = curExam(); const idb = $('.exam-id b'); if (ex && idb) idb.textContent = ex.title || 'Untitled'; if (ex && fmtOf(ex) === 'onepage' && APP.screen === 'exam' && APP.examTab === 'builder') OnePage.scheduleFit(ex); };

/* body for the new item types (inside the shared question card) */
function fmtBody(q) {
  const ed = ph => `<div class="ed" contenteditable="true" data-f="stem" data-ph="${ph}">${q.stem || ''}</div>`;
  const num = (f, v, label, step = .25, min = 0, max = 12) => `<label class="tiny op-num">${label} <input type="number" class="inp sm" data-f="${f}" value="${v ?? ''}" step="${step}" min="${min}" max="${max}"></label>`;
  switch (q.type) {
    case 'mtf': return ed('Type the statement. Select the key word and press U (Underline) in Quick Tools.') + `<div class="orow" style="margin-top:8px"><b class="wide">Answer key</b><input data-f="ansText" value="${esc(q.ansText)}" placeholder="TRUE, or the correct term that replaces the underlined word"><button class="btn sm" data-a="op-mtf-true" title="Set the answer to TRUE">TRUE</button></div>${/<u>/i.test(q.stem || '') ? '' : '<div class="why">Tip: underline the word students should check.</div>'}`;
    case 'essay': return ed('Type the question or case. Insert an image with the picture button in Quick Tools.') + `<div class="row op-opts">${num('boxH', q.boxH, 'Answer box height (in)')}<label class="tiny">Layout <select class="inp sm" data-f="layout"><option value="stack"${q.layout !== 'side' ? ' selected' : ''}>Question, then answer box</option><option value="side"${q.layout === 'side' ? ' selected' : ''}>Image left, question and space right</option></select></label></div><div class="orow"><b class="wide">Key / rubric</b><input data-f="ansText" value="${esc(q.ansText)}" placeholder="Expected answer or key points (shown on the answer key)"></div>`;
    case 'seq': {
      const ord = seqOrder(q), ev = seqEvents(q);
      return `<div class="orow"><b class="wide">Heading</b><input data-f="head" value="${esc(q.head || '')}" placeholder="e.g., Big Bang Theory (optional)"></div><div class="hint" style="margin:6px 0">Type the events in the <b>correct order</b>, earliest first. The printout mixes them up and the key shows the numbers.</div>` +
        (q.events || []).map((s, i) => `<div class="orow"><b>${i + 1}</b><input data-f="ev" data-i="${i}" value="${esc(s)}" placeholder="Event ${i + 1}"><button class="btn icon sm ghost" data-a="seq-del" data-i="${i}" title="Remove">${icon('x')}</button></div>`).join('') +
        `<div class="row op-opts"><button class="btn sm" data-a="seq-add">${icon('plus')}Add event</button>${num('ppe', q.ppe, 'Points per event', .5, 0, 20)}<button class="btn sm" data-a="seq-shuffle">${icon('refresh')}Mix up again</button></div><div class="tiny op-seqprev" data-seqprev>${ev.length > 1 ? 'Printed order: ' + ord.map(j => esc(ev[j]).slice(0, 28)).join(' · ') : ''}</div>`;
    }
    case 'table': {
      const cols = q.cols || [];
      return ed('Optional instructions or data above the table') + `<div class="hint" style="margin:6px 0">Wrap an answer in <b>[[double brackets]]</b> to leave that cell blank on the student copy, e.g. <span class="kbd">[[3.15 × 10⁻⁷ m]]</span>.</div><div class="table-wrap"><table class="op-tbl"><thead><tr>${cols.map((c, i) => `<th><input data-f="tcol" data-i="${i}" value="${esc(c)}" placeholder="Header"><button class="btn icon sm ghost" data-a="tbl-del-col" data-i="${i}" title="Remove column">${icon('x')}</button></th>`).join('')}<th></th></tr></thead><tbody>${(q.cells || []).map((r, ri) => `<tr>${cols.map((_, ci) => `<td><input data-f="tcell" data-r="${ri}" data-c="${ci}" value="${esc((r || [])[ci] || '')}"></td>`).join('')}<td><button class="btn icon sm ghost" data-a="tbl-del-row" data-i="${ri}" title="Remove row">${icon('x')}</button></td></tr>`).join('')}</tbody></table></div><div class="row op-opts"><button class="btn sm" data-a="tbl-add-row">${icon('plus')}Row</button><button class="btn sm" data-a="tbl-add-col">${icon('plus')}Column</button>${num('boxH', q.boxH, 'Solution space below (in)')}</div>`;
    }
    case 'crossword': {
      const L = CW.layoutOf(q);
      return `<div class="hint" style="margin-bottom:6px">Type each answer and its clue. Jin builds the grid automatically; spaces and hyphens are ignored in the grid.</div>` +
        (q.words || []).map((x, i) => `<div class="orow"><b>${i + 1}</b><input style="max-width:180px" data-f="cww" data-i="${i}" value="${esc(x.w)}" placeholder="Answer"><input data-f="cwc" data-i="${i}" value="${esc(x.c)}" placeholder="Clue"><button class="btn icon sm ghost" data-a="cw-del" data-i="${i}" title="Remove">${icon('x')}</button></div>`).join('') +
        `<div class="row op-opts"><button class="btn sm" data-a="cw-add">${icon('plus')}Add word</button>${num('ppe', q.ppe, 'Points per word', .5, 0, 20)}<button class="btn sm" data-a="cw-relayout">${icon('refresh')}Try another layout</button></div><div data-cwprev>${CW_preview(L)}</div>`;
    }
  }
  return null;
}
function CW_preview(L) {
  if (!L.placed.length) return '<div class="tiny">Add at least two answers to build the grid.</div>';
  return `<div class="op-cwprev"><table>${L.cells.map(r => `<tr>${r.map(c => c ? `<td class="on">${c.num ? `<sup>${c.num}</sup>` : ''}${c.ch}</td>` : '<td></td>').join('')}</tr>`).join('')}</table><div class="tiny">${L.rows} × ${L.cols} grid · ${plural(L.placed.length, 'word')} placed${L.skipped.length ? ` · <b style="color:var(--red)">couldn’t fit: ${L.skipped.map(s => esc(s.word)).join(', ')}</b> (they share no letters with the others — try another layout or change a word)` : ''}</div></div>`;
}
function fmtBodyExtra(q) {
  if (curFmt() !== 'onepage') return '';
  if (q.type === 'mc') return `<div class="row op-opts"><label class="tiny">Choices <select class="inp sm" data-f="cols"><option value="auto"${!q.cols || q.cols === 'auto' ? ' selected' : ''}>Automatic</option><option value="1"${q.cols === '1' ? ' selected' : ''}>One column</option><option value="2"${q.cols === '2' ? ' selected' : ''}>Two columns (A C / B D)</option></select></label></div>`;
  if (q.type === 'prob') {
    const v = x => x ?? '';
    return `<div class="row op-opts"><label class="tiny op-num">Box height (in) <input type="number" class="inp sm" data-f="boxH" value="${v(q.boxH)}" step=".25" min=".8" max="10"></label><label class="tiny"><input type="checkbox" data-f="pbd"${q.pbd !== false ? ' checked' : ''}> Show points in the boxes</label><label class="tiny op-num">Given <input type="number" class="inp sm" data-f="pg" value="${v(q.pg)}" step=".25" min="0" placeholder="auto"></label><label class="tiny op-num">Equation <input type="number" class="inp sm" data-f="pe" value="${v(q.pe)}" step=".25" min="0" placeholder="auto"></label><label class="tiny op-num">Solution <input type="number" class="inp sm" data-f="ps" value="${v(q.ps)}" step=".25" min="0" placeholder="auto"></label></div>`;
  }
  return '';
}
function fmtBankBody(q) {
  if (q.type === 'mtf' || q.type === 'gsa') return `<div class="opts"><span class="ok">Key: ${esc(q.ansText || '—')}</span><span>${fmtPts(weight(q))}</span></div>`;
  if (q.type === 'essay' || q.type === 'gpa') return `<div class="opts"><span>${fmtPts(weight(q))}</span></div>`;
  if (q.type === 'seq') return `<div class="opts">${seqEvents(q).slice(0, 4).map((s, i) => `<span>${i + 1}. ${esc(s)}</span>`).join('')}</div>`;
  if (q.type === 'table') return `<div class="opts"><span>${esc((q.cols || []).join(' | '))}</span></div>`;
  if (q.type === 'crossword') return `<div class="opts">${cwWords(q).slice(0, 6).map(x => `<span>${esc(cwClean(x.w))}</span>`).join('')}</div>`;
  if (GOPT.has(q.type)) return `<div class="opts">${(q.opts || []).map((o, i) => `<span class="${(q.type === 'gcb' ? (q.ansMulti || []).includes(i) : q.ans === LET[i]) ? 'ok' : ''}">${esc(o)}</span>`).join('')}</div>`;
  return '';
}

/* ---------- editing events for the new fields ---------- */
const cwPrevSoon = debounce(card => { const q = Q(card.dataset.id); const box = card.querySelector('[data-cwprev]'); if (q && box) box.innerHTML = CW_preview(CW.layoutOf(q)); const wt = card.querySelector('[data-wt]'); if (wt) wt.textContent = fmtPts(weight(q)); }, 350);
document.addEventListener('input', e => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.exf && t.closest('#screen-exam')) { const ex = curExam(); ex[t.dataset.exf] = t.innerHTML; ex.updated = nowISO(); touch(); OnePage.scheduleFit(ex); return; }
  if (t.dataset.gfs && t.type !== 'checkbox') { const ex = curExam(); GForm.settings(ex)[t.dataset.gfs] = t.value; ex.updated = nowISO(); touch(); return; }
  if (t.dataset.pl === 'points' && $('#op-pts-status')) { setTimeout(() => { const ex = curExam(), C = examChecks(ex), box = $('#op-pts-status'); if (box) box.innerHTML = OnePage.ptsStatus(C.points, Planner.ensure(ex).points); }, 0); return; }
  const [card, q] = qOfEl(t); const f = t.dataset.f; if (!q || !f) return;
  const i = +t.dataset.i;
  switch (f) {
    case 'ev': q.events[i] = t.value; break;
    case 'tcol': q.cols[i] = t.value; break;
    case 'tcell': q.cells[+t.dataset.r][+t.dataset.c] = t.value; break;
    case 'cww': q.words[i].w = t.value; break;
    case 'cwc': q.words[i].c = t.value; break;
    case 'boxH': q.boxH = t.value === '' ? '' : clamp(parseFloat(t.value) || 0, 0, 12); break;
    case 'pg': case 'pe': case 'ps': q[f] = t.value === '' ? '' : Math.max(0, parseFloat(t.value) || 0); break;
    case 'ppe': q.ppe = clamp(parseFloat(t.value) || 0, 0, 20); break;
    case 'pool': case 'drawLabel': q[f] = t.value; break;
    case 'desc': q.desc = t.value; break;
    default: return;
  }
  if (f === 'ev') { const p = card.querySelector('[data-seqprev]'); if (p) { const ev = seqEvents(q); p.textContent = ev.length > 1 ? 'Printed order: ' + seqOrder(q).map(j => ev[j].slice(0, 28)).join(' · ') : ''; } }
  if (f === 'ev' || f === 'ppe') { const wt = card.querySelector('[data-wt]'); if (wt) wt.textContent = fmtPts(weight(q)); }
  if (f === 'cww' || f === 'cwc' || f === 'ppe') cwPrevSoon(card);
  touchQ(q); refreshMetaSoon();
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.exc && t.closest('#screen-exam')) { const ex = curExam(); ex[t.dataset.exc] = t.checked; ex.updated = nowISO(); touch(); OnePage.scheduleFit(ex); return; }
  if (t.dataset.gfs && t.type === 'checkbox') { const ex = curExam(); GForm.settings(ex)[t.dataset.gfs] = t.checked; ex.updated = nowISO(); touch(); return; }
  const [card, q] = qOfEl(t); const f = t.dataset.f; if (!q || !f) return;
  const fm = curFmt();
  if (f === 'preset' && fm === 'onepage' && q.type === 'section') { q.preset = t.value; const d = OPDIR[t.value] || OPDIR.custom; q.title = d[0]; q.dir = d[1]; touchQ(q); Exam.rerender(); return; }
  if (f === 'layout' || f === 'cols' || f === 'numBy') { q[f] = t.value; touchQ(q); if (f === 'numBy') Exam.rerender(); refreshMetaSoon(); return; }
  if (f === 'pbd') { q.pbd = t.checked; touchQ(q); refreshMetaSoon(); return; }
  if (f === 'req') { q.req = t.checked; touchQ(q); return; }
  if (f === 'ansm') { const i = +t.dataset.i; q.ansMulti = (q.ansMulti || []).filter(x => x !== i); if (t.checked) q.ansMulti.push(i); q.ansMulti.sort((a, b) => a - b); touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); return; }
  if (f === 'ans' && GTYPES.has(q.type)) { setTimeout(() => { Exam.rerenderCard(q); }, 0); return; }
  if (f === 'pts' && fm !== 'scantron') { Exam.rerender(); return; }
  if (f === 'boxH' || f === 'pg' || f === 'pe' || f === 'ps') { refreshMetaSoon(); return; }
});

/* ---------- actions ---------- */
const sectionEnd = (ex, secId) => { let i = ex.items.indexOf(secId) + 1; while (i < ex.items.length && (Q(ex.items[i]) || {}).type !== 'section') i++; return i; };
const focusCard = id => setTimeout(() => { const c = $(`.qcard[data-id="${id}"]`); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); const ed = c.querySelector('.ed,input:not([type=radio]):not([type=checkbox]),textarea'); if (ed) ed.focus(); } }, 70);
function opNewItem(type) { const q = newQ(type); if (type === 'prob') { q.pts = 5; q.boxH = 2.4; } if (type === 'mc') q.opts = ['', '', '', '']; S.qs.push(q); return q; }
ACT['op-add'] = b => {
  const ex = curExam(); if (!ex) return ACT['new-exam']();
  const p = b.dataset.p, d = OPDIR[p] || OPDIR.custom;
  const s = newQ('section', { preset: p, title: d[0], dir: d[1], pool: '', numBy: '', drawLabel: '' }); S.qs.push(s); ex.items.push(s.id);
  for (let i = 0; i < d[3]; i++) ex.items.push(opNewItem(d[2]).id);
  ex.updated = nowISO(); touch(); APP.examTab = 'builder'; if (APP.screen !== 'exam') App.go('exam'); else Exam.rerender();
  focusCard(s.id); toast(`Test added: ${d[0]}. Its points are added up from the items.`, 'ok', 2600);
};
ACT['op-add-item'] = b => {
  const ex = curExam(), sq = Q(b.dataset.sec); if (!ex || !sq) return;
  const q = opNewItem(OnePage.secItemType(sq)); ex.items.splice(sectionEnd(ex, sq.id), 0, q.id); ex.updated = nowISO(); touch(); Exam.rerender(); focusCard(q.id);
};
ACT['op-add-sec-top'] = () => { const ex = curExam(), first = Q(ex.items[0]); const p = first ? opPresetFor(first.type) : 'custom', d = OPDIR[p]; const s = newQ('section', { preset: p, title: d[0], dir: d[1], pool: '', numBy: '', drawLabel: '' }); S.qs.push(s); ex.items.unshift(s.id); ex.updated = nowISO(); touch(); Exam.rerender(); focusCard(s.id); };
ACT['op-sample'] = () => { const ex = curExam(); OnePage.sample(ex); touch(); Exam.render(); App.refreshChrome(); toast('Sample one-page quiz loaded (30 points). Everything is editable.'); };
ACT['op-add-sheet'] = () => { const ex = curExam(); ex.opSheets = Math.max(1, ex.opSheets || 1) + 1; ex.updated = nowISO(); touch(); toast('The quiz is now ' + plural(ex.opSheets, 'sheet') + ' (' + ex.opSheets * 2 + ' sides).'); if ($('#op-pv')) { closeModal(true); OnePage.preview(); } if (APP.screen === 'exam') Exam.render(); };
ACT['op-del-sheet'] = () => { const ex = curExam(); ex.opSheets = Math.max(1, (ex.opSheets || 1) - 1); ex.updated = nowISO(); touch(); Exam.render(); };
ACT['op-mtf-true'] = b => { const [card, q] = qOfEl(b); q.ansText = 'TRUE'; const i = card.querySelector('[data-f=ansText]'); if (i) i.value = 'TRUE'; touchQ(q); refreshMetaSoon(); };
const secOf = b => Q(b.closest('.qcard').dataset.id);
ACT['op-pool-on'] = b => { const s = secOf(b); s.pool = s.pool || ' '; s.pool = s.pool.trim() ? s.pool : ''; s.preset = s.preset === 'ident' ? 'wordpool' : s.preset; if (s.preset === 'wordpool' && s.title === OPDIR.ident[0]) { s.title = OPDIR.wordpool[0]; s.dir = OPDIR.wordpool[1]; } touchQ(s); Exam.rerender(); };
ACT['op-pool-fill'] = b => {
  const s = secOf(b), ex = curExam(), i0 = ex.items.indexOf(s.id) + 1, end = sectionEnd(ex, s.id);
  const words = String(s.pool || '').split('\n').map(x => x.trim()).filter(Boolean), have = new Set(words.map(w => w.toLowerCase())); let n = 0;
  ex.items.slice(i0, end).map(Q).filter(Boolean).forEach(q => { const a = String(q.ansText || '').split('/')[0].trim(); if (a && !have.has(a.toLowerCase())) { words.push(a); have.add(a.toLowerCase()); n++; } });
  s.pool = words.join('\n'); touchQ(s); Exam.rerender(); toast(n ? plural(n, 'answer') + ' added. Add a few distractors too.' : 'All answers are already in the pool.', 'info');
};
ACT['op-pool-sort'] = b => { const s = secOf(b); s.pool = String(s.pool || '').split('\n').map(x => x.trim()).filter(Boolean).sort((a, c) => a.localeCompare(c)).join('\n'); touchQ(s); Exam.rerender(); };
ACT['op-pool-mix'] = b => { const s = secOf(b); s.pool = shuffleWith(String(s.pool || '').split('\n').map(x => x.trim()).filter(Boolean), Math.random).join('\n'); touchQ(s); Exam.rerender(); };
ACT['seq-add'] = b => { const [, q] = qOfEl(b); q.events.push(''); touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); };
ACT['seq-del'] = b => { const [, q] = qOfEl(b); q.events.splice(+b.dataset.i, 1); touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); };
ACT['seq-shuffle'] = b => { const [, q] = qOfEl(b); q.seed = (q.seed || 1) + 1 + Math.floor(Math.random() * 97); touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); };
ACT['tbl-add-row'] = b => { const [, q] = qOfEl(b); q.cells.push((q.cols || []).map(() => '')); touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); };
ACT['tbl-add-col'] = b => { const [, q] = qOfEl(b); if ((q.cols || []).length >= 8) return toast('Up to 8 columns fit on the page.', 'info'); q.cols.push('Column ' + (q.cols.length + 1)); q.cells.forEach(r => r.push('')); touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); };
ACT['tbl-del-row'] = b => { const [, q] = qOfEl(b); if (q.cells.length <= 1) return; q.cells.splice(+b.dataset.i, 1); touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); };
ACT['tbl-del-col'] = b => { const [, q] = qOfEl(b); if (q.cols.length <= 1) return; const i = +b.dataset.i; q.cols.splice(i, 1); q.cells.forEach(r => r.splice(i, 1)); touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); };
ACT['cw-add'] = b => { const [, q] = qOfEl(b); q.words.push({ w: '', c: '' }); touchQ(q); Exam.rerenderCard(q); };
ACT['cw-del'] = b => { const [, q] = qOfEl(b); q.words.splice(+b.dataset.i, 1); touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); };
ACT['cw-relayout'] = b => { const [, q] = qOfEl(b); q.seed = (q.seed || 1) + 1; touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); };
ACT['gf-add'] = b => {
  const ex = curExam(); if (!ex) return ACT['new-exam']();
  const g = GForm.settings(ex), q = newQ(b.dataset.type || 'gmc', { req: g.required !== false, pts: 1 }); S.qs.push(q); ex.items.push(q.id);
  ex.updated = nowISO(); touch(); APP.examTab = 'builder'; if (APP.screen !== 'exam') App.go('exam'); else Exam.rerender(); focusCard(q.id);
};
ACT['gf-add-sec'] = () => { const ex = curExam(); const s = newQ('section', { title: 'Untitled section', dir: '', preset: 'custom' }); S.qs.push(s); ex.items.push(s.id); ex.updated = nowISO(); touch(); Exam.rerender(); focusCard(s.id); };
ACT['gf-export'] = () => { if ($('#modal-root').classList.contains('open')) closeModal(true); GForm.exportDialog(); };

/* exports / preview dispatch (the toolbar and preview call these) */
const __exPdf = ACT['export-pdf'], __exKey = ACT['export-key-pdf'], __exPrint = ACT['print-exam'], __exDocx = ACT['export-docx'], __exPrev = ACT['preview'];
ACT['export-pdf'] = b => { const f = curFmt(); if (f === 'onepage') return OnePage.exportPDF(!!(b && b.dataset && b.dataset.pv && $('#pv-key') && $('#pv-key').checked)); if (f === 'gforms') return gfPrint(false); return __exPdf(b); };
ACT['export-key-pdf'] = b => { const f = curFmt(); if (f === 'onepage') return OnePage.exportPDF(true); if (f === 'gforms') return gfPrint(true); return __exKey(b); };
ACT['export-key-docx'] = () => OnePage.exportDocx(true);
ACT['print-exam'] = b => { const f = curFmt(); if (f === 'onepage') return OnePage.print(); if (f === 'gforms') return gfPrint(false, true); return __exPrint(b); };
ACT['export-docx'] = b => { const f = curFmt(); if (f === 'onepage') return OnePage.exportDocx(!!($('#pv-key') && $('#pv-key').checked)); return __exDocx(b); };
ACT['preview'] = b => { const f = curFmt(); if (f === 'onepage') return OnePage.preview(); if (f === 'gforms') return GForm.preview(); return __exPrev(b); };
async function gfPrint(key, printOnly) {
  const ex = curExam(); if (!ex || !ex.items.length) return toast('Add questions first.', 'info');
  const html = printDoc(GForm.printHTML(ex, key), ex.title, false);
  const r = printOnly ? await Host.print(html, {}) : await Host.printToPDF(html, { defaultName: safeName(ex.title, 'quiz') + (key ? ' - Answer Key' : '') + '.pdf', footer: ex.title || 'Quiz', margins: { top: 0.75, bottom: 0.85, left: 0.8, right: 0.8 } });
  if (r && r.canceled) return; if (r && r.ok === false) toast('Printing failed: ' + r.error, 'error'); else if (!printOnly) pdfDoneToast(r);
}

/* ---------- TOS screen note ---------- */
const __tosRender = Tos.render.bind(Tos);
Tos.render = function () {
  __tosRender(); const ex = curExam(), f = fmtOf(ex); if (f === 'scantron') return;
  const el = $('#screen-tos'), n = document.createElement('div'); n.className = 'fmt-note card';
  n.innerHTML = f === 'gforms' ? `<img src="${CHIBI.idea}" alt=""><span><b>Google Forms quizzes don’t need a TOS.</b> You can still build one here if your school asks for it.</span><button class="btn sm" data-a="goto" data-screen="exam" data-tab="builder">Back to the form</button>` : `<img src="${CHIBI.idea}" alt=""><span><b>A TOS is optional for one-page quizzes.</b> Item numbers here count straight through the quiz (Test II item 1 continues after Test I’s last item).</span>`;
  el.insertBefore(n, el.children[1] || null);
};
