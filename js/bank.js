/* Jin Assessment Studio — Item bank: browse, edit, reuse, import with review, Excel export */
'use strict';
const Bank = {
  f: { q: '', type: '', bloom: '', comp: '', attn: false }, sel: new Set(),
  render() {
    const el = $('#screen-bank'); const items = bankItems();
    el.innerHTML = `<div class="toolbar"><div class="tabtitle">Item Bank</div>
        <div class="dd"><button class="btn gold" data-dd="dd-newitem">${icon('plus')}New item ${icon('down')}</button><div class="ddm right" id="dd-newitem">${['mc', 'ident', 'cmc', 'morse', 'prob', 'passage', 'matching'].map(t => `<button class="mi" data-a="bank-new" data-type="${t}">${TYPE_NAMES[t]}</button>`).join('')}</div></div>
        <button class="btn" data-a="import" data-target="bank">${icon('upload')}Import PDF / Word / Excel</button>
        <button class="btn" data-a="export-bank">${icon('download')}Download Excel</button>
        <button class="btn danger" data-a="bank-clear-all" title="Remove every item from the item bank">${icon('trash')}Clear all</button></div>
      <div class="filters">
        <div class="search">${icon('search')}<input id="bk-q" placeholder="Search question text, choices, answers…" value="${esc(this.f.q)}"></div>
        <select class="inp" id="bk-type"><option value="">All types</option>${['mc', 'ident', 'cmc', 'morse', 'prob', 'passage', 'matching'].map(t => `<option value="${t}"${this.f.type === t ? ' selected' : ''}>${TYPE_SHORT[t]}</option>`).join('')}</select>
        <select class="inp" id="bk-bloom"><option value="">All Bloom levels</option>${BL.map((b, i) => `<option value="${i}"${this.f.bloom === String(i) ? ' selected' : ''}>${b}</option>`).join('')}</select>
        <select class="inp" id="bk-comp" style="max-width:260px"><option value="">All competencies</option><option value="__none"${this.f.comp === '__none' ? ' selected' : ''}>No competency yet</option>${S.topics.length ? `<optgroup label="Whole topic">${S.topics.map(t => `<option value="topic:${t.id}"${this.f.comp === 'topic:' + t.id ? ' selected' : ''}>${esc(t.name || 'Untitled topic')} (all)</option>`).join('')}</optgroup>` : ''}${S.topics.map(t => `<optgroup label="${esc(t.name || 'Competencies')}">${t.comps.map(c => `<option value="${c.id}"${this.f.comp === c.id ? ' selected' : ''}>${esc(c.text.slice(0, 60))}</option>`).join('')}</optgroup>`).join('')}</select>
        <label class="tiny"><input type="checkbox" id="bk-attn"${this.f.attn ? ' checked' : ''}> Needs attention</label>
      </div>
      <div class="card"><div class="cardhead"><h2 id="bk-count">${plural(items.length, 'saved item')}</h2><span class="tiny" id="bk-filtered"></span>
        <span class="right row"><span class="tiny" id="bk-seln"></span><button class="btn sm" data-a="bank-add-sel">${icon('plus')}Add selected to exam</button><button class="btn sm danger" data-a="bank-del-sel">${icon('trash')}Delete selected</button></span></div>
        <div id="bk-list"></div></div>`;
    $('#bk-q').addEventListener('input', e => { this.f.q = e.target.value; this.list(); });
    [['bk-type', 'type'], ['bk-bloom', 'bloom'], ['bk-comp', 'comp']].forEach(([id, k]) => $('#' + id).addEventListener('change', e => { this.f[k] = e.target.value; this.list(); }));
    $('#bk-attn').addEventListener('change', e => { this.f.attn = e.target.checked; this.list(); });
    $('#bk-list').addEventListener('change', e => { if (e.target.classList.contains('chk')) { e.target.checked ? this.sel.add(e.target.value) : this.sel.delete(e.target.value); this.selCount(); } });
    this.list();
  },
  needsAttention(q) { const leaves = isGroup(q) ? kidsOf(q) : [q]; return leaves.some(k => !hasKey(k) || !k.comp || k.compConf === 'low' || (!k.bloomManual && k.bloomConf === 'Low')) || !leaves.length; },
  filtered() {
    const f = this.f, s = f.q.toLowerCase().trim();
    return bankItems().filter(q => {
      const leaves = isGroup(q) ? kidsOf(q) : [q];
      if (f.type && q.type !== f.type) return false;
      if (f.bloom !== '' && !leaves.some(k => k.bloom === +f.bloom)) return false;
      if (f.comp === '__none' && !leaves.some(k => !k.comp)) return false;
      if (f.comp && f.comp.startsWith('topic:')) { const t = S.topics.find(x => 'topic:' + x.id === f.comp); const ids = new Set(t ? t.comps.map(c => c.id) : []); if (!leaves.some(k => ids.has(k.comp))) return false; }
      else if (f.comp && f.comp !== '__none' && !leaves.some(k => k.comp === f.comp)) return false;
      if (f.attn && !this.needsAttention(q)) return false;
      if (s) { const hay = [Classify.textOf(q), (q.opts || []).join(' '), q.ansText, (q.sopts || []).join(' '), q.head, ...leaves.map(k => Classify.textOf(k) + ' ' + (k.opts || []).join(' ') + ' ' + (k.ansText || ''))].join(' ').toLowerCase(); if (!s.split(/\s+/).every(w => hay.includes(w))) return false; }
      return true;
    }).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
  },
  itemHTML(q) {
    const leaves = isGroup(q) ? kidsOf(q) : [q], one = !isGroup(q);
    const tags = `<span class="tag gray">${TYPE_SHORT[q.type]}</span>` + (one ? `<span class="tag gold">${BL_SHORT[q.bloom]}${!q.bloomManual && q.bloomConf === 'Low' ? ' ?' : ''}</span>` : `<span class="tag">${plural(leaves.length, 'item')}</span>`) + (one && q.comp ? `<span class="tag" title="${esc(compLabel(q.comp))}">${esc(compLabel(q.comp).slice(0, 46))}${q.compConf === 'low' ? ' ?' : ''}</span>` : '') + (one && !q.comp ? '<span class="tag amber">No competency</span>' : '') + (leaves.some(k => !hasKey(k)) ? '<span class="tag red">Key missing</span>' : '');
    let body = '';
    if (q.type === 'morse') body = `<div class="opts"><span><b>X</b> ${esc(q.x)} (${q.xt ? 'T' : 'F'})</span><span><b>Y</b> ${esc(q.y)} (${q.yt ? 'T' : 'F'})</span><span class="ok">Key: ${morseAns(q)}</span></div>`;
    else if (q.type === 'mc' || q.type === 'cmc') body = `${q.type === 'cmc' ? `<div class="opts">${(q.statements || []).map((s, i) => `<span>${RN[i]}. ${esc(s)}</span>`).join('')}</div>` : ''}<div class="opts">${(q.opts || []).map((o, i) => `<span class="${q.ans === LET[i] ? 'ok' : ''}">${LET[i]}. ${esc(o)}${(q.oimg || [])[i] ? ' 🖼' : ''}</span>`).join('')}</div>`;
    else if (q.type === 'ident' || q.type === 'prob') body = `<div class="opts"><span class="ok">Key: ${esc(q.ansText || '—')}</span>${q.type === 'prob' ? `<span>${q.pts} pts</span>` : ''}</div>`;
    else if (isGroup(q)) body = `<div class="opts">${leaves.slice(0, 4).map((k, i) => `<span>• ${esc(Classify.textOf(k).slice(0, 80) || '(empty)')}</span>`).join('')}${leaves.length > 4 ? `<span>+${leaves.length - 4} more</span>` : ''}</div>`;
    const stemTxt = isGroup(q) ? (q.head ? esc(q.head) + ' ' : '') + esc(stripHTML(q.stem).slice(0, 220)) : (q.stem || '<span class="muted">(no question text)</span>');
    return `<div class="bankitem" data-id="${q.id}"><input type="checkbox" class="chk" value="${q.id}"${this.sel.has(q.id) ? ' checked' : ''} aria-label="Select item"><div class="body"><div class="row">${tags}</div><div class="stem">${stemTxt}</div>${body}</div>
      <div class="acts"><button class="btn sm" data-a="bank-edit" data-id="${q.id}">Edit</button><button class="btn sm" data-a="bank-to-exam" data-id="${q.id}" title="Add a copy to the current exam">${icon('plus')}Exam</button><button class="btn icon sm ghost" data-a="bank-dup" data-id="${q.id}" title="Duplicate">${icon('copy')}</button><button class="btn icon sm ghost" data-a="bank-del" data-id="${q.id}" title="Delete">${icon('trash')}</button></div></div>`;
  },
  list() {
    const all = bankItems(), list = this.filtered();
    const box = $('#bk-list'); if (!box) return;
    $('#bk-count').textContent = plural(all.length, 'saved item');
    $('#bk-filtered').textContent = list.length !== all.length ? `· showing ${list.length}` : '';
    box.innerHTML = list.length ? list.map(q => this.itemHTML(q)).join('') : (all.length ? `<div class="empty"><img src="${CHIBI.sad}" alt=""><b>No items match</b>Try a different search word or clear the filters.</div>` : `<div class="empty"><img src="${CHIBI.idea}" alt=""><b>Your item bank is empty</b>Create items here, use “Save to bank” on exam questions, or import a PDF, Word or Excel file.</div>`);
    this.sel.forEach(id => { if (!Q(id)) this.sel.delete(id); }); this.selCount();
  },
  selCount() { const e = $('#bk-seln'); if (e) e.textContent = this.sel.size ? this.sel.size + ' selected' : ''; },
  /* ---- editor modal (reuses the exam question card) ---- */
  editing: null, isNew: false,
  editorOpen() { return !!$('#modal-root .qeditor'); },
  openEditor(id, isNew) {
    this.editing = id; this.isNew = !!isNew;
    modal(`<h3>${isNew ? 'New' : 'Edit'} item</h3><div class="hint">Changes save automatically.</div><div class="mbody qeditor" id="qeditor"></div><div class="mfoot">${isNew ? '<button class="btn" id="qe-discard">Discard</button>' : ''}<span class="spacer"></span><button class="btn blue" data-a="modal-close">Done</button></div>`, { size: 'wide', onClose: () => this.afterEdit() });
    this.renderEditor();
    const d = $('#qe-discard'); if (d) d.onclick = () => { removeQ(id); closeModal(true); touch(); this.editing = null; if (APP.screen === 'bank') this.render(); toast('Discarded.', 'info'); };
  },
  renderEditor() {
    const q = Q(this.editing), box = $('#qeditor'); if (!q || !box) return;
    box.innerHTML = Exam.card(q, layout(null), true, false);
    box.querySelectorAll(':scope > .qcard > .qhead > .qtools, :scope > .qcard > .qhead > .grip, :scope > .qcard > .qhead > .qnum').forEach(x => x.remove());
  },
  afterEdit() { const q = Q(this.editing); if (q) { q.updated = nowISO(); touch(); } this.editing = null; if (APP.screen === 'bank') this.render(); else if (APP.screen === 'exam') Exam.render(); App.refreshChrome(); }
};
/* route exam-card refreshes to the editor when it is open */
const _examRerender = Exam.rerender.bind(Exam);
Exam.rerender = function () { if (Bank.editorOpen()) { Bank.renderEditor(); return; } _examRerender(); };

ACT['bank-new'] = b => {
  const type = b.dataset.type, q = newQ(type, { inBank: true }); S.qs.push(q);
  if (type === 'passage') { const k = newQ('mc', { parent: q.id }); S.qs.push(k); q.kids.push(k.id); }
  if (type === 'matching') { q.head = 'Match each item in Column A with the correct answer in Column B.'; for (let i = 0; i < 3; i++) { const k = newQ('match', { parent: q.id }); S.qs.push(k); q.kids.push(k.id); } }
  Bank.openEditor(q.id, true);
};
ACT['bank-edit'] = b => Bank.openEditor(b.dataset.id, false);
ACT['bank-dup'] = b => { const q = Q(b.dataset.id); cloneQ(q, { inBank: true }); touch(); Bank.list(); App.refreshChrome(); toast('Duplicated.'); };
function bankToExam(ids) {
  let ex = curExam(); if (!ex) { ex = newExam({ teacher: S.settings.teacher }); S.exams.unshift(ex); S.currentExam = ex.id; }
  ids.forEach(id => { const src = Q(id); if (!src) return; const c = cloneQ(src, { inBank: false, srcBank: src.id }); ex.items.push(c.id); });
  ex.updated = nowISO(); touch(); App.refreshChrome();
  toast(plural(ids.length, 'item') + ' added to “' + ex.title + '”.');
}
ACT['bank-to-exam'] = b => bankToExam([b.dataset.id]);
ACT['bank-add-sel'] = () => { if (!Bank.sel.size) return toast('Tick the items you want first.', 'info'); bankToExam([...Bank.sel]); Bank.sel.clear(); Bank.list(); };
async function bankDelete(ids) {
  if (!(await confirmDlg({ title: 'Delete ' + plural(ids.length, 'item') + ' from the bank?', msg: 'Copies already placed in exams are not affected.', ok: 'Delete', danger: true }))) return;
  ids.forEach(id => { const q = Q(id); if (!q) return; const inExam = S.exams.some(e => e.items.includes(id)); if (inExam) q.inBank = false; else removeQ(id); });
  gcQuestions(); touch(); Bank.sel.clear(); Bank.list(); App.refreshChrome(); toast('Deleted.');
}
ACT['bank-del'] = b => bankDelete([b.dataset.id]);
ACT['bank-del-sel'] = () => { if (!Bank.sel.size) return toast('Tick the items you want first.', 'info'); bankDelete([...Bank.sel]); };

/* ---------- Excel export of the bank ---------- */
const BANK_COLS = ['Group', 'Group type', 'Heading', 'Passage', 'Shared choices', 'Type', 'Bloom', 'Topic', 'Competency', 'Question', 'A', 'B', 'C', 'D', 'E', 'Statements', 'Statement X', 'X true', 'Statement Y', 'Y true', 'Answer', 'Points', 'FBD', 'Question HTML', 'Passage HTML', 'A image', 'B image', 'C image', 'D image', 'E image'];
function bankRow(q, g, gi) {
  const c = compById(q.comp), cut = s => (s && s.length < 32000 ? s : '');
  return [g ? 'G' + gi : '', g ? (g.type === 'matching' ? 'Matching set' : 'Passage') : '', g ? g.head || '' : '', g ? stripHTML(g.stem) : '', g ? (g.sopts || []).join('\n') : '', TYPE_SHORT[q.type], BL[q.bloom], c ? c.topic : '', c ? c.text : '', stripHTML(q.stem).slice(0, 32000),
    ...[0, 1, 2, 3, 4].map(i => (q.type === 'mc' || q.type === 'cmc') ? (q.opts || [])[i] || '' : ''), (q.statements || []).filter(Boolean).join('\n'),
    q.type === 'morse' ? q.x : '', q.type === 'morse' ? (q.xt ? 'TRUE' : 'FALSE') : '', q.type === 'morse' ? q.y : '', q.type === 'morse' ? (q.yt ? 'TRUE' : 'FALSE') : '',
    q.type === 'morse' ? morseAns(q) : (['mc', 'cmc', 'match'].includes(q.type) ? q.ans : q.ansText), q.type === 'prob' ? q.pts : 1, q.type === 'prob' ? (q.fbd ? 'Yes' : 'No') : '',
    /<(b|i|u|sub|sup|img|strong|em)\b/i.test(q.stem || '') ? cut(q.stem) : '', g && /<(b|i|u|sub|sup|img)\b/i.test(g.stem || '') ? cut(g.stem) : '', ...[0, 1, 2, 3, 4].map(i => cut((q.oimg || [])[i] || ''))];
}
function bankXlsx(items) {
  const rows = [BANK_COLS.map(v => ({ v, s: 2 }))]; let gi = 0;
  items.forEach(q => { if (isGroup(q)) { gi++; const ks = kidsOf(q); if (!ks.length) rows.push(bankRow(newQ('match'), q, gi)); ks.forEach(k => rows.push(bankRow(k, q, gi))); } else rows.push(bankRow(q, null, 0)); });
  const readme = [[{ v: 'Jin Assessment Studio — Item bank export', s: 6 }], [''], [{ v: 'Column', s: 2 }, { v: 'Meaning', s: 2 }],
    ['Group / Group type', 'Rows with the same Group code belong to one passage or matching set.'], ['Type', 'MC, Identification, Statement combo, Morse, Problem solving, Matching.'], ['Bloom', 'Original Bloom (1956): Knowledge, Comprehension, Application, Analysis, Synthesis, Evaluation.'],
    ['Competency / Topic', 'Learning competency text and its topic. Missing competencies are created on import.'], ['A–E', 'Choices for multiple-choice and statement-combination items.'], ['Statements', 'Statements I, II, III… (one per line) for statement-combination items.'],
    ['Answer', 'Letter for choice items; the answer text for identification and problem solving.'], ['Question HTML', 'Formatted question text (bold, images). Used on re-import when present.'], [''], ['Exported', new Date().toLocaleString()]];
  return Office.xlsx([{ name: 'Item Bank', rows, widths: [7, 12, 24, 40, 24, 14, 14, 18, 36, 60, 22, 22, 22, 22, 22, 30, 30, 8, 30, 8, 16, 7, 6, 20, 20, 12, 12, 12, 12, 12], freeze: 'A2' }, { name: 'Read me', rows: readme, widths: [24, 90] }]);
}
ACT['export-bank'] = async () => {
  const items = bankItems(); if (!items.length) return toast('The item bank is empty — nothing to export yet.', 'info');
  await saveOut('Item Bank ' + new Date().toISOString().slice(0, 10) + '.xlsx', bankXlsx(items), [{ name: 'Excel workbook', extensions: ['xlsx'] }], 'Item bank spreadsheet');
};

/* ---------- import ---------- */
const TYPE_FROM = s => { s = String(s || '').toLowerCase(); if (/morse|paired/.test(s)) return 'morse'; if (/statement|combination|complex|corrected/.test(s)) return 'cmc'; if (/ident|short|fill/.test(s)) return 'ident'; if (/problem|solv|computation/.test(s)) return 'prob'; if (/match/.test(s)) return 'match'; if (/mc|multiple|choice/.test(s)) return 'mc'; return ''; };
const BLOOM_FROM = s => { s = String(s || '').trim().toLowerCase(); if (!s) return -1; const code = { k: 0, r: 0, c: 1, u: 1, ap: 2, an: 3, s: 4, cr: 4, e: 5, ev: 5 }; if (code[s] !== undefined) return code[s];
  /* 1956 names first, then Revised (2001) names from older files mapped to the 1956 level */
  const names = [[/^know|^rememb|^recall/, 0], [/^compr|^underst/, 1], [/^appl/, 2], [/^anal/, 3], [/^synth|^creat/, 4], [/^eval/, 5]];
  for (const [re, i] of names) if (re.test(s)) return i; return -1; };
function sheetToQuestions(sheets) {
  const sh = sheets.find(s => /item bank/i.test(s.name)) || sheets.find(s => s.rows.some(r => r.some(c => /^question$/i.test(String(c).trim())))) || sheets[0];
  if (!sh) throw new Error('The workbook has no sheets.');
  const hi = sh.rows.findIndex(r => r.some(c => /^(question|item|stem)$/i.test(String(c).trim())));
  if (hi < 0) throw new Error('Could not find a “Question” column header in sheet “' + sh.name + '”.');
  const H = sh.rows[hi].map(h => String(h || '').trim().toLowerCase());
  const col = (...names) => { for (const n of names) { const i = H.indexOf(n); if (i > -1) return i; } return -1; };
  const C = { group: col('group'), gtype: col('group type'), head: col('heading'), passage: col('passage'), shared: col('shared choices', 'shared'), type: col('type'), bloom: col('bloom', 'bloom level', 'cognitive level'), topic: col('topic'), comp: col('competency', 'learning competency'), q: col('question', 'item', 'stem'), stmts: col('statements'), x: col('statement x', 'statementx'), xt: col('x true', 'xtrue'), y: col('statement y', 'statementy'), yt: col('y true', 'ytrue'), ans: col('answer', 'key', 'answer key', 'correct answer'), pts: col('points', 'pts'), fbd: col('fbd'), qh: col('question html', 'questionhtml'), ph: col('passage html', 'passagehtml') };
  const L = ['a', 'b', 'c', 'd', 'e'].map(k => col(k, 'choice ' + k, 'option ' + k)), LI = ['a', 'b', 'c', 'd', 'e'].map(k => col(k + ' image', k + 'img'));
  const out = [], groups = {};
  sh.rows.slice(hi + 1).forEach(r => {
    const g = i => i > -1 ? String(r[i] ?? '').trim() : '';
    if (!r.some(c => String(c).trim())) return;
    const opts = L.map(g); while (opts.length && !opts[opts.length - 1]) opts.pop();
    let type = TYPE_FROM(g(C.type)) || (g(C.x) && g(C.y) ? 'morse' : g(C.stmts) && opts.length ? 'cmc' : opts.length ? 'mc' : 'ident');
    const q = newQ(type); const qh = g(C.qh);
    q.stem = qh ? sanitizeHTML(qh) : esc(g(C.q));
    if (type === 'mc' || type === 'cmc') { q.opts = opts.length ? opts : q.opts; q.oimg = LI.map(i => /^data:image\//.test(g(i)) ? g(i) : ''); }
    else q.opts = [];
    if (type === 'cmc') q.statements = g(C.stmts).split(/\n+/).map(s => s.replace(/^(I{1,3}|IV|V)[.)]\s*/, '').trim()).filter(Boolean);
    if (type === 'morse') { q.x = g(C.x); q.y = g(C.y); const a = g(C.ans).toUpperCase(); if (C.xt > -1 && g(C.xt)) { q.xt = /^(true|t|yes|1)$/i.test(g(C.xt)); q.yt = /^(true|t|yes|1)$/i.test(g(C.yt)); } else if (/^[ABCD]$/.test(a)) { q.xt = a === 'A' || a === 'C'; q.yt = a === 'B' || a === 'C'; } q.ans = morseAns(q); }
    const a = g(C.ans);
    if (['mc', 'cmc', 'match'].includes(type)) q.ans = /^[A-Ja-j]$/.test(a) ? a.toUpperCase() : ''; else if (type !== 'morse') q.ansText = a;
    if (type === 'prob') { q.pts = clamp(parseInt(g(C.pts)) || 3, 1, 50); q.fbd = /^y/i.test(g(C.fbd)); }
    const b = BLOOM_FROM(g(C.bloom)); if (b > -1) { q.bloom = b; q.bloomManual = true; }
    q._compText = g(C.comp); q._topic = g(C.topic);
    const gid = g(C.group);
    if (gid) {
      let grp = groups[gid];
      if (!grp) { const gt = /match/i.test(g(C.gtype)) ? 'matching' : 'passage'; grp = groups[gid] = newQ(gt); grp.head = g(C.head); grp.stem = g(C.ph) ? sanitizeHTML(g(C.ph)) : esc(g(C.passage)); grp.sopts = g(C.shared) ? g(C.shared).split(/\n/).map(s => s.trim()) : []; grp.kids = []; out.push(grp); }
      if (grp.type === 'matching') { q.type = 'match'; q.opts = []; }
      if (stripHTML(q.stem) || q.type !== 'match') { q.parent = grp.id; grp.kids.push(q.id); out.push(q); }
    } else out.push(q);
  });
  return out;
}
function parsedToQuestions(parsed) {
  const out = [], groups = {};
  parsed.forEach(p => {
    const q = newQ(p.type);
    Object.assign(q, { stem: p.stem || '', opts: p.type === 'mc' || p.type === 'cmc' ? p.opts : [], statements: p.statements || [], ans: p.ans || '', ansText: p.ansText || '', x: p.x || '', y: p.y || '', pts: p.type === 'prob' ? Math.max(p.pts || 1, 1) : 1 });
    if (q.type === 'prob' && q.pts < 2) q.pts = 3;
    if (q.type === 'morse') q.ans = morseAns(q);
    if (p.passage) {
      let g = groups[p.passage];
      if (!g) {
        const hm = p.passage.match(/^for items?(?: numbers?)?[\d\s,\-–]*(?:and|to)?[\d\s,\-–]*[,:]?\s*((?:refer to|read|analy[sz]e|study|use)[^.:]*[.:])\s*(.*)$/i);
        g = groups[p.passage] = newQ('passage'); g.head = hm ? hm[1] : ''; g.stem = esc(hm ? hm[2] : p.passage); g.sopts = (p.psopts || []).slice(); g.kids = []; out.push(g);
      }
      q.parent = g.id; g.kids.push(q.id);
    }
    out.push(q);
  });
  return out;
}
const Import = {
  qs: [], target: 'bank', fileName: '',
  async start(target) {
    const f = await Host.openFile('.pdf,.docx,.xlsx,.txt', [{ name: 'Question files', extensions: ['pdf', 'docx', 'xlsx', 'txt'] }]); if (!f) return;
    this.target = target; this.fileName = f.name;
    toast('Reading ' + f.name + '…', 'info', 2000);
    let qs;
    try {
      const r = await Office.readQuestionFile(f.name, f.bytes);
      qs = r.kind === 'sheets' ? sheetToQuestions(r.sheets) : parsedToQuestions(Office.parseQuestions(r.text));
    } catch (e) { console.error(e); return toast('Import failed: ' + e.message, 'error'); }
    if (!qs.filter(isLeaf).length) return toast('No questions found in ' + f.name + '. Number each question (1. 2. 3.) and letter the choices (A. B. C. D.).', 'error');
    S.qs.push(...qs); /* temporary until confirmed */
    qs.filter(isLeaf).forEach(q => { if (!q.bloomManual) Classify.autoBloom(q); });
    const comps = allComps();
    qs.forEach(q => { if (q._compText) { const m = comps.find(c => c.text.trim().toLowerCase() === q._compText.toLowerCase()); if (m) { q.comp = m.id; q.compConf = 'manual'; delete q._compText; } } });
    Classify.suggestComps(qs.filter(q => isLeaf(q) && !q.comp && !q._compText), 'unassigned');
    this.qs = qs; this.review();
  },
  cleanup() { const ids = new Set(this.qs.map(q => q.id)); S.qs = S.qs.filter(q => !ids.has(q.id)); this.qs = []; },
  review() {
    const qs = this.qs, leaves = qs.filter(isLeaf), counts = {};
    leaves.forEach(q => counts[q.type] = (counts[q.type] || 0) + 1);
    const noKey = leaves.filter(q => !hasKey(q)).length, lowB = leaves.filter(q => !q.bloomManual && q.bloomConf === 'Low').length, lowC = leaves.filter(q => !q.comp && !q._compText || q.compConf === 'low').length;
    const compOpts = (q) => `<option value="">— none —</option>${q._compText ? `<option value="__new" selected>New: ${esc(q._compText.slice(0, 50))}</option>` : ''}` + S.topics.map(t => `<optgroup label="${esc(t.name || 'Competencies')}">${t.comps.map(c => `<option value="${c.id}"${c.id === q.comp ? ' selected' : ''}>${esc(c.text.slice(0, 70))}</option>`).join('')}</optgroup>`).join('');
    let n = 0;
    const row = (q, indent) => {
      if (isGroup(q)) return `<tr data-id="${q.id}" class="grp"><td><input type="checkbox" class="chk" data-r="inc" checked></td><td colspan="7"><b>${q.type === 'matching' ? 'Matching set' : 'Passage'}:</b> ${esc(q.head || '')} <span class="muted">${esc(stripHTML(q.stem).slice(0, 180))}</span>${(q.sopts || []).length ? `<div class="tiny">Shared choices: ${q.sopts.map((o, i) => LET[i] + '. ' + esc(o)).join(' · ')}</div>` : ''}</td></tr>`;
      n++;
      const choices = q.type === 'morse' ? `X: ${q.x}\nY: ${q.y}` : (q.opts || []).join('\n');
      const ansField = ['mc', 'cmc', 'match'].includes(q.type) ? `<input data-r="ans" value="${esc(q.ans)}" maxlength="1" placeholder="A–E" style="width:52px;text-transform:uppercase">` : q.type === 'morse' ? `<select data-r="mans">${['A', 'B', 'C', 'D'].map(a => `<option${q.ans === a ? ' selected' : ''}>${a}</option>`).join('')}</select>` : `<input data-r="ansText" value="${esc(q.ansText)}" placeholder="Answer">`;
      const bc = q.bloomManual ? '<span class="conf ok">from file</span>' : `<span class="conf ${Classify.CONF[q.bloomConf] || 'low'}" title="${esc(q.bloomWhy)}">${q.bloomConf === 'Low' ? '? uncertain' : q.bloomConf}</span>`;
      const cc = q._compText ? '<span class="conf med">will be created</span>' : q.compConf === 'manual' ? '<span class="conf ok">from file</span>' : q.comp ? `<span class="conf ${q.compConf === 'low' ? 'low' : q.compConf === 'high' ? 'ok' : 'med'}" title="${esc(q.compWhy)}">${q.compConf === 'low' ? '? uncertain' : 'suggested'}</span>` : (S.topics.length ? '<span class="conf low">no match</span>' : '');
      return `<tr data-id="${q.id}"><td><input type="checkbox" class="chk" data-r="inc" checked></td><td style="${indent ? 'padding-left:18px' : ''}">${n}</td>
        <td><select data-r="type">${(q.parent ? ['mc', 'ident', 'cmc', 'morse', 'match'] : ['mc', 'ident', 'cmc', 'morse', 'prob']).map(t => `<option value="${t}"${t === q.type ? ' selected' : ''}>${TYPE_SHORT[t]}</option>`).join('')}</select></td>
        <td style="min-width:240px"><textarea data-r="stem">${esc(stripHTML(q.stem))}</textarea></td>
        <td style="min-width:180px">${q.type === 'match' ? '<span class="tiny">Uses the shared choices</span>' : q.type === 'ident' || q.type === 'prob' ? '<span class="tiny">—</span>' : `<textarea data-r="choices" placeholder="One choice per line">${esc(choices)}</textarea>`}</td>
        <td>${ansField}${hasKey(q) ? '' : '<div class="conf low" style="display:inline-block;margin-top:4px">missing</div>'}</td>
        <td style="min-width:170px"><select data-r="comp">${compOpts(q)}</select><div style="margin-top:3px">${cc}</div></td>
        <td style="min-width:130px"><select data-r="bloom">${BL.map((b, i) => `<option value="${i}"${i === q.bloom ? ' selected' : ''}>${b}</option>`).join('')}</select><div style="margin-top:3px">${bc}</div></td></tr>`;
    };
    const rows = qs.filter(q => !q.parent).map(q => isGroup(q) ? row(q) + kidsOf(q).map(k => row(k, true)).join('') : row(q)).join('');
    const m = modal(`<h3>Review imported questions</h3><div class="hint">From <b>${esc(this.fileName)}</b>: found ${plural(leaves.length, 'item')} (${Object.entries(counts).map(([k, v]) => v + ' ' + TYPE_SHORT[k]).join(', ')}). Check the parsed text, answers, competencies and Bloom levels. Formatting, images and statements can be refined after import.</div>
      <div class="row" style="margin:10px 0">${noKey ? `<span class="tag red">${noKey} missing answer${noKey === 1 ? '' : 's'}</span>` : '<span class="tag green">All answers found</span>'}${lowB ? `<span class="tag amber">${lowB} uncertain Bloom level${lowB === 1 ? '' : 's'}</span>` : ''}${S.topics.length && lowC ? `<span class="tag amber">${lowC} uncertain/unmatched competenc${lowC === 1 ? 'y' : 'ies'}</span>` : ''}${!S.topics.length ? '<span class="tag gray">No competencies yet — add them to get suggestions</span>' : ''}</div>
      <div style="max-height:56vh;overflow:auto;border:1px solid #e3e9f2;border-radius:10px"><table class="review-table"><thead><tr><th></th><th>#</th><th>Type</th><th>Question</th><th>Choices</th><th>Answer</th><th>Competency</th><th>Bloom</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="mfoot">${this.target === 'exam' ? '<label class="tiny"><input type="checkbox" id="imp-bank" checked> Also save to item bank</label>' : ''}<span class="spacer"></span><button class="btn" id="imp-cancel">Cancel</button><button class="btn blue" id="imp-ok">${this.target === 'exam' ? 'Add to exam' : 'Add to item bank'}</button></div>`, { size: 'wide', onClose: () => { this.cleanup(); }, noFocus: true });
    m.addEventListener('change', e => this.onEdit(e)); m.addEventListener('input', e => { if (e.target.dataset.r === 'stem' || e.target.dataset.r === 'choices' || e.target.dataset.r === 'ansText' || e.target.dataset.r === 'ans') this.onEdit(e, true); });
    $('#imp-cancel').onclick = () => { closeModal(); toast('Import cancelled.', 'info'); };
    $('#imp-ok').onclick = () => this.commit();
  },
  onEdit(e, live) {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return; const q = Q(tr.dataset.id); const r = e.target.dataset.r; if (!q || !r) return;
    if (r === 'inc') { tr.classList.toggle('off', !e.target.checked); q._skip = !e.target.checked; if (isGroup(q)) kidsOf(q).forEach(k => { k._skip = q._skip; const kr = $(`tr[data-id="${k.id}"]`); if (kr) { kr.classList.toggle('off', q._skip); kr.querySelector('[data-r=inc]').checked = !q._skip; } }); return; }
    if (r === 'stem') { q.stem = esc(e.target.value).replace(/\n/g, '<br>'); if (!q.bloomManual) Classify.autoBloom(q); }
    else if (r === 'choices') { const lines = e.target.value.split('\n').map(s => s.trim()).filter(Boolean); if (q.type === 'morse') { lines.forEach(l => { const m = l.match(/^([XY])\s*[:.]\s*(.*)/i); if (m) q[m[1].toLowerCase()] = m[2]; }); } else q.opts = lines.slice(0, 5); }
    else if (r === 'ans') q.ans = e.target.value.trim().toUpperCase().slice(0, 1);
    else if (r === 'ansText') q.ansText = e.target.value;
    else if (r === 'mans') { const a = e.target.value; q.xt = a === 'A' || a === 'C'; q.yt = a === 'B' || a === 'C'; q.ans = a; }
    else if (r === 'bloom') { q.bloom = +e.target.value; q.bloomManual = true; }
    else if (r === 'comp') { if (e.target.value !== '__new') { q.comp = e.target.value; q.compConf = e.target.value ? 'manual' : ''; delete q._compText; } }
    else if (r === 'type') { changeType(q, e.target.value); if (q.type === 'mc' && !(q.opts || []).some(Boolean)) q.opts = ['', '', '', '']; }
    if (!live && (r === 'type')) { const y = $('#modal-root .review-table').parentElement.scrollTop; this.reviewKeepScroll(y); }
  },
  reviewKeepScroll(y) { const qs = this.qs; modalStack = []; this.review(); const box = $('#modal-root .review-table'); if (box) box.parentElement.scrollTop = y; this.qs = qs; },
  commit() {
    const keep = this.qs.filter(q => !q._skip);
    const groups = keep.filter(isGroup); groups.forEach(g => { g.kids = g.kids.filter(id => { const k = Q(id); return k && !k._skip; }); });
    const drop = this.qs.filter(q => q._skip || (isGroup(q) && !q.kids.length)); const dropIds = new Set(drop.map(q => q.id));
    S.qs = S.qs.filter(q => !dropIds.has(q.id));
    /* create competencies named in the file that don't exist yet */
    let made = 0;
    keep.forEach(q => { if (q._compText && !dropIds.has(q.id)) { const tname = q._topic || 'Imported competencies'; let t = S.topics.find(x => (x.name || '').toLowerCase() === tname.toLowerCase()); if (!t) { t = { id: uid(), name: tname, comps: [] }; S.topics.push(t); } let c = t.comps.find(c => c.text.toLowerCase() === q._compText.toLowerCase()); if (!c) { c = { id: uid(), text: q._compText }; t.comps.push(c); made++; } q.comp = c.id; q.compConf = 'manual'; } delete q._compText; delete q._topic; delete q._skip; });
    const tops = keep.filter(q => !q.parent && !dropIds.has(q.id));
    const alsoBank = this.target === 'bank' || ($('#imp-bank') && $('#imp-bank').checked);
    if (this.target === 'exam') { let ex = curExam(); if (!ex) { ex = newExam(); S.exams.unshift(ex); S.currentExam = ex.id; } tops.forEach(q => { q.inBank = alsoBank; ex.items.push(q.id); }); ex.updated = nowISO(); }
    else tops.forEach(q => { q.inBank = true; });
    const n = keep.filter(q => isLeaf(q) && !dropIds.has(q.id)).length;
    this.qs = []; closeModal(true); touch();
    App.go(this.target === 'exam' ? 'exam' : 'bank');
    toast(plural(n, 'question') + ' imported' + (made ? ', ' + plural(made, 'new competency', 'new competencies') + ' created' : '') + '.');
  }
};
ACT['import'] = b => Import.start(b.dataset.target || 'bank');

ACT['bank-clear-all'] = async () => {
  const items = bankItems(); if (!items.length) return toast('The item bank is already empty.', 'info');
  const used = items.filter(q => S.exams.some(e => e.items.includes(q.id))).length;
  if (!(await confirmDlg({ title: 'Clear the whole item bank?', msg: `This removes all ${plural(items.length, 'item')} from the item bank.${used ? ` ${plural(used, 'item')} also used directly in an exam will stay in that exam.` : ''} Copies already placed in exams are not affected. Save a backup first if you may need them.`, ok: 'Clear all ' + items.length, danger: true, chibi: 'angry' }))) return;
  items.forEach(q => { if (S.exams.some(e => e.items.includes(q.id))) q.inBank = false; else removeQ(q.id); });
  gcQuestions(); touch(); Bank.sel.clear(); Bank.render(); App.refreshChrome(); toast('Item bank cleared.');
};
