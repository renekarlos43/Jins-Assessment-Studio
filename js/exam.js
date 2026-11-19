/* Jin Assessment Studio — Exam Builder: layout, editing, preview, exports */
'use strict';
const TYPE_NAMES = { mc: 'Multiple choice', ident: 'Identification', cmc: 'Statement combination', morse: 'Morse type (paired statements)', prob: 'Problem solving', match: 'Matching item', passage: 'Passage group', matching: 'Matching set', section: 'Section' };
const TYPE_SHORT = { mc: 'MC', ident: 'Identification', cmc: 'Statement combo', morse: 'Morse', prob: 'Problem solving', match: 'Matching', passage: 'Passage', matching: 'Matching set', section: 'Section' };
const DIR = {
  mc: ['Multiple Choice', 'Choose the letter of the best answer.'],
  ident: ['Identification', 'Write the word or term being described in each item.'],
  cmc: ['Multiple Choice (Statement Combination)', 'Read each set of statements. Choose the letter of the option that correctly identifies the true statement(s).'],
  morse: ['Morse Type', 'Read each pair of statements. Choose A if only X is true, B if only Y is true, C if both X and Y are true, and D if both are false.'],
  prob: ['Problem Solving', 'Analyze and solve the following problems. Show your complete solution and box your final answer.'],
  passage: ['Passage-Based Questions', 'Read each passage carefully, then answer the items that follow.'],
  matching: ['Matching Type', 'Match each item in Column A with the correct answer in Column B. Write the letter of your answer.'],
  match: ['Matching Type', 'Choose the letter of the correct answer from the options given.'],
  custom: ['Section', '']
};
const RN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const rg = a => a ? (a[0] === a[1] ? String(a[0]) : a[0] + '–' + a[1]) : '';
const weight = q => q.type === 'prob' ? Math.max(1, parseInt(q.pts) || 1) : 1;

/* ---------- layout: numbering, sections, totals ---------- */
function layout(ex) {
  const secs = [], num = {}, leaves = []; const start = Math.max(1, parseInt(ex && ex.start) || 1); let n = start - 1, cur = null, custom = false;
  const open = (k, title, dir, isCustom, sq) => { cur = { k, title, dir, top: [], pts: 0, items: 0, secId: sq ? sq.id : null }; secs.push(cur); custom = isCustom; };
  (ex ? ex.items : []).map(Q).filter(Boolean).forEach(t => {
    if (t.type === 'section') { open('custom', t.title || 'Section', t.dir || '', true, t); return; }
    const lv = isGroup(t) ? kidsOf(t) : [t], from = n + 1;
    if (!cur) { /* only the first section is implied; later sections start only from a section card */
      let k = t.type; if (t.type === 'passage') { k = lv[0] ? lv[0].type : 'passage'; if (k === 'match') k = 'passage'; }
      open(k, (DIR[k] || DIR.mc)[0], (DIR[k] || DIR.mc)[1], false);
    }
    lv.forEach(q => { const w = weight(q); num[q.id] = [n + 1, n + w]; n += w; cur.pts += w; cur.items++; leaves.push(q); });
    if (isGroup(t)) num[t.id] = [from, Math.max(from, n)];
    cur.top.push({ t, leaves: lv });
  });
  return { secs, num, leaves, total: n - (start - 1), start };
}
/* key status per leaf */
function hasKey(q) {
  if (q.type === 'mc' || q.type === 'cmc') return !!q.ans && LET.indexOf(q.ans) > -1 && LET.indexOf(q.ans) < (q.opts || []).length;
  if (q.type === 'match') { const p = parentOf(q); return !!q.ans && p && LET.indexOf(q.ans) < (p.sopts || []).length; }
  if (q.type === 'morse') return true;
  return !!String(q.ansText || '').trim();
}
const isEmptyQ = q => { if (q.type === 'morse') return !String(q.x || '').trim() || !String(q.y || '').trim(); if (q.type === 'match') return !stripHTML(q.stem); return !stripHTML(q.stem) && !/<img/i.test(q.stem || ''); };
function examChecks(ex) {
  const L = layout(ex), r = { L, items: L.leaves.length, points: L.total, sections: L.secs.length, noKey: [], noComp: [], lowBloom: [], lowComp: [], empty: [], bloom: [0, 0, 0, 0, 0, 0] };
  L.leaves.forEach(q => {
    const n = rg(L.num[q.id]);
    if (!hasKey(q)) r.noKey.push(n);
    if (!q.comp || !compById(q.comp)) r.noComp.push(n);
    else if (q.compConf === 'low') r.lowComp.push(n);
    if (!q.bloomManual && q.bloomConf === 'Low') r.lowBloom.push(n);
    if (isEmptyQ(q)) r.empty.push(n);
    r.bloom[q.bloom] += weight(q);
  });
  const total = L.leaves.length || 1;
  r.mapped = L.leaves.length ? Math.round((L.leaves.length - r.noComp.length) / total * 100) : 0;
  r.keyed = L.leaves.length - r.noKey.length;
  const ok = [L.leaves.length > 0, !!(ex.title && ex.subject), r.noKey.length === 0, r.noComp.length === 0, r.lowBloom.length === 0 && r.lowComp.length === 0, r.empty.length === 0];
  r.progress = Math.round(ok.filter(Boolean).length / ok.length * 100);
  r.health = L.leaves.length ? Math.round(((L.leaves.length - r.noKey.length) + (L.leaves.length - r.noComp.length) + (L.leaves.length - r.lowBloom.length) + (L.leaves.length - r.empty.length)) / (4 * total) * 100) : 0;
  return r;
}

/* ---------- rendering ---------- */
const Exam = {
  render() {
    const el = $('#screen-exam'); const ex = curExam();
    if (!ex) {
      el.innerHTML = `<div class="toolbar"><div class="tabtitle">Exam</div></div><div class="empty"><img src="${CHIBI.idea}" alt=""><b>No exam yet</b>Create your first assessment to start planning and adding questions.<div style="margin-top:12px"><button class="btn blue" data-a="new-exam">${icon('plus')}New exam</button></div></div>`;
      return;
    }
    const C = examChecks(ex), tab = APP.examTab === 'builder' ? 'builder' : 'planner';
    const st = { Draft: 'background:#fff3d8;color:#956a10', 'In review': 'background:#eef6ff;color:#276db4', Ready: 'background:#effaf2;color:#26774a', Administered: 'background:#f2efff;color:#5b4db0', Archived: 'background:#f1f4f9;color:#5b6f8a' }[ex.status] || '';
    el.innerHTML = `
      <div class="toolbar">
        <div class="tabtitle">Exam</div>
        <div class="exam-tabs" role="tablist" aria-label="Exam workspace">
          <button role="tab" aria-selected="${tab === 'planner'}" class="${tab === 'planner' ? 'on' : ''}" data-a="exam-tab" data-tab="planner">${icon('target')}Exam Planner</button>
          <button role="tab" aria-selected="${tab === 'builder'}" class="${tab === 'builder' ? 'on' : ''}" data-a="exam-tab" data-tab="builder">${icon('build')}Exam Builder</button>
        </div>
        <span class="tiny" id="exam-count">${plural(C.items, 'item')} · ${plural(C.points, 'point')}</span>
        <div class="dd"><button class="btn" data-dd="dd-exams">${icon('layers')}Switch exam ${icon('down')}</button>
          <div class="ddm right" id="dd-exams">${S.exams.map(e => `<button class="mi" data-a="open-exam" data-id="${e.id}">${e.id === ex.id ? icon('check') : icon('file')}<span>${esc(e.title || 'Untitled')}<small>${esc([e.subject, e.grade].filter(Boolean).join(' · ') || 'No subject yet')} · ${e.items.length} entries</small></span></button>`).join('')}
            <div class="mi-sep"></div><button class="mi" data-a="new-exam">${icon('plus')}New exam</button><button class="mi" data-a="dup-exam">${icon('copy')}Duplicate this exam</button><button class="mi" data-a="del-exam">${icon('trash')}Delete this exam</button></div></div>
        <button class="btn" data-a="preview">${icon('eye')}Preview</button>
        <div class="dd"><button class="btn gold" data-dd="dd-export">Export exam ${icon('down')}</button><div class="ddm right" id="dd-export"><button class="mi" data-a="export-pdf">${icon('file')}<span>Exam as PDF<small>Print-ready, with page numbers</small></span></button><button class="mi" data-a="export-docx">${icon('file')}<span>Exam as Word (.docx)<small>Editable in Microsoft Word</small></span></button><div class="mi-sep"></div><button class="mi" data-a="export-key-pdf">${icon('check')}<span>Answer key (PDF)</span></button><button class="mi" data-a="print-exam">${icon('print')}<span>Print…</span></button></div></div>
      </div>
      <div class="exam-idbar">
        <div class="exam-id"><span class="eyebrow">CURRENT EXAM</span><b>${esc(ex.title || 'Untitled')}</b><span>${esc([ex.subject, ex.grade].filter(Boolean).join(' · ') || 'Subject and class not set')}</span><span class="status-chip" style="${st}">${esc(ex.status)}</span>
          <button class="btn sm ghost" data-a="toggle-details" title="Show or hide the assessment details">${icon('file')}Exam details ${icon('down')}</button></div>
        <nav class="flow" aria-label="Workflow">${[['overview', 'Overview'], ['planner', 'Exam Planner'], ['builder', 'Exam Builder'], ['preview', 'Preview'], ['tos', 'TOS']].map(([k, n], i) => `${i ? '<span class="sep">›</span>' : ''}<button class="${(k === tab) ? 'on' : ''}" data-a="flow" data-step="${k}">${n}</button>`).join('')}</nav>
      </div>
      <div id="exam-tab"></div>`;
    const box = $('#exam-tab');
    if (tab === 'planner') Planner.render(box, ex); else this.renderBuilder(box, ex, C);
  },
  renderBuilder(box, ex, C) {
    const L = C.L;
    box.innerHTML = `
      <div class="grid2">
        <div style="min-width:0">
          ${this.detailsCard(ex)}
          ${this.ribbon()}
          <div id="qlist">${this.list(ex, L)}</div>
          <div class="addline">
            <button class="btn" data-a="pick-bank">${icon('bank')}Add from item bank</button>
            <button class="btn" data-a="add-q" data-type="section">${icon('layers')}New section</button>
            <button class="btn" data-a="import" data-target="exam">${icon('upload')}Import questions</button>
            <span class="spacer"></span>
            <button class="btn danger sm" data-a="clear-exam">${icon('trash')}Clear exam</button>
          </div>
        </div>
        <div style="min-width:0" id="exam-rail">${this.rail(ex, C)}</div>
      </div>`;
  },
  detailsCard(ex) {
    const F = (k, label, ph = '', type = 'text') => `<label class="field">${label}<input type="${type}" data-ex="${k}" value="${esc(ex[k])}" placeholder="${esc(ph)}"${type === 'number' ? ' min="1"' : ''}></label>`;
    return `<div class="card" id="details-card"><div class="cardhead"><h2>Assessment details</h2><span class="tag gold">${esc(ex.status)}</span><span class="right tiny">Saved automatically</span></div>
      <div class="details">
        ${F('title', 'Exam title', 'e.g., Quarter 2 Assessment')}${F('subject', 'Subject', 'e.g., Science 9')}${F('grade', 'Grade / class', 'e.g., Grade 9 · A')}
        ${F('teacher', 'Teacher', 'Your name')}${F('date', 'Exam date', 'e.g., November 18, 2026')}${F('start', 'First item no.', '1', 'number')}
        ${F('school', 'School (header) — use | for a new line', S.settings.school || 'e.g., AJM | MCHS')}${F('schoolYear', 'School year', 'e.g., 2026–2027')}
        ${F('quarter', 'Quarter (for the TOS)', 'e.g., Second')}${F('strand', 'Subject area/strand (for the TOS)', 'e.g., Science')}
        <label class="field">Status<select data-ex="status">${['Draft', 'In review', 'Ready', 'Administered', 'Archived'].map(s => `<option${s === ex.status ? ' selected' : ''}>${s}</option>`).join('')}</select></label>
      </div>
      <label class="field" style="margin-top:10px">General instructions<textarea data-ex="instr" rows="2">${esc(ex.instr)}</textarea></label>
      <div class="details" style="margin-top:10px;grid-template-columns:2fr 1fr">
        <label class="field">End note (printed after the last item; one line per row)<textarea data-ex="endNote" rows="2">${esc(ex.endNote)}</textarea></label>
        <div class="field">School logo (optional)<div class="row">${ex.logo ? `<img src="${ex.logo}" alt="" style="height:34px;border:1px solid var(--line);border-radius:5px">` : ''}<button class="btn sm" data-a="exam-logo">${icon('image')}${ex.logo ? 'Change' : 'Add logo'}</button>${ex.logo ? `<button class="btn sm ghost" data-a="exam-logo-del">Remove</button>` : ''}</div></div>
      </div></div>`;
  },
  ribbon() {
    const types = [['mc', 'Multiple choice', 'Up to five choices, images allowed'], ['ident', 'Identification', 'Short answer with key'], ['cmc', 'Statement combination', 'I, II, III… with combination choices'], ['morse', 'Morse type', 'Paired statements X and Y'], ['prob', 'Problem solving', 'Worked solution, set points'], ['passage', 'Passage group', 'Shared passage with linked items'], ['matching', 'Matching set', 'Column A to Column B'], ['section', 'New section', 'Starts Test II, Test III… with its own directions']];
    return `<div class="ribbon" id="ribbon" role="toolbar" aria-label="Quick tools">
      <div class="ribbon-label"><b>QUICK TOOLS</b><span>ASSESSMENT WORKSPACE</span></div>
      <div class="group"><div class="dd"><button class="btn blue sm" data-dd="dd-add">${icon('plus')}Add ${icon('down')}</button><div class="ddm" id="dd-add">${types.map(([k, n, d]) => `<button class="mi" data-a="add-q" data-type="${k}"><span>${n}<small>${d}</small></span></button>`).join('')}</div></div>
        <button class="btn sm" data-a="pick-bank" title="Add questions from the item bank">${icon('bank')}From item bank</button></div>
      <div class="group"><button class="btn sm" data-a="gen-tos">${icon('grid')}Generate TOS</button><button class="btn sm" data-a="export-bank">${icon('download')}Export bank</button><button class="btn sm" data-a="preview">${icon('eye')}Preview</button></div>
      <div class="group"><button class="btn sm fmt" data-a="fmt" data-cmd="bold" title="Bold (Ctrl+B)"><b>B</b></button><button class="btn sm fmt" data-a="fmt" data-cmd="italic" title="Italic"><i>I</i></button><button class="btn sm fmt" data-a="fmt" data-cmd="underline" title="Underline"><u>U</u></button><button class="btn sm fmt" data-a="fmt" data-cmd="subscript" title="Subscript">x₂</button><button class="btn sm fmt" data-a="fmt" data-cmd="superscript" title="Superscript">x²</button><button class="btn sm fmt" data-a="insert-img" title="Insert image into the question text">${icon('image')}</button></div>
      <div class="group"><button class="btn sm" data-a="auto-classify" title="Suggest Bloom levels (Original 1956) and competencies for this exam">${icon('wand')}Auto-classify</button><button class="btn sm" data-a="bloom-report" title="Bloom classification report with evidence for every question">${icon('book')}Bloom report</button></div>
      <span class="ribbon-status" id="ribbon-status">● Changes saved</span>
    </div>`;
  },
  list(ex, L) {
    if (!ex.items.length) return `<div class="empty"><img src="${CHIBI.idea}" alt=""><b>No questions yet</b>Use <b style="display:inline">Add</b> in Quick Tools, pull items from the bank, or import a PDF, Word or Excel file.<div class="row" style="justify-content:center;margin-top:12px"><button class="btn blue" data-a="add-q" data-type="mc">${icon('plus')}Add a multiple-choice item</button><button class="btn" data-a="load-sample">Load sample exam</button></div></div>`;
    let h = '';
    L.secs.forEach((s, i) => {
      const label = `Test ${RN[i] || i + 1} · ${esc(s.title)}`;
      if (!s.secId) h += `<div class="secband">${label}<small>${esc(s.dir)}</small><span class="right tiny">${plural(s.items, 'item')} · ${plural(s.pts, 'pt')}</span></div>`;
      else h += `<div class="secband" style="margin-bottom:4px">${label}<span class="right tiny">${plural(s.items, 'item')} · ${plural(s.pts, 'pt')}</span></div>`;
      if (s.secId) h += this.card(Q(s.secId), L, true);
      s.top.forEach(({ t }) => { h += this.card(t, L, true); });
    });
    /* sections with nothing after them still need their card */
    return h;
  },
  bloomSel(q) { return `<select data-f="bloom" title="Bloom’s level">${BL.map((b, i) => `<option value="${i}"${i === q.bloom ? ' selected' : ''}>${b}</option>`).join('')}</select>${this.bloomBadge(q)}`; },
  bloomBadge(q) {
    if (q.bloomManual) return `<span class="conf ok" data-badge="bloom" title="Set by you">✓ set</span>`;
    const c = q.bloomConf || 'Low';
    const tip = (q.bloomOp ? 'Cognitive operation: ' + q.bloomOp + '\n' : '') + (q.bloomWhy || 'No strong cue.') + (q.bloomEvidence && q.bloomEvidence.length ? '\nEvidence: ' + q.bloomEvidence.join(' ') : '') + '\nConfidence: ' + c + '. Change the level to confirm it.';
    return `<span class="conf ${Classify.CONF[c] || 'low'}" data-badge="bloom" title="${esc(tip)}">${c === 'Low' ? '? provisional' : 'auto · ' + c.toLowerCase()}</span>`;
  },
  compSel(q) {
    const comps = allComps(); if (!comps.length) return `<button class="btn sm ghost" data-a="goto" data-screen="comps" title="Add learning competencies first">+ Competency</button>`;
    const groups = S.topics.map(t => { const o = t.comps.map(c => `<option value="${c.id}"${c.id === q.comp ? ' selected' : ''}>${esc(c.text.length > 70 ? c.text.slice(0, 68) + '…' : c.text)}</option>`).join(''); return t.name ? `<optgroup label="${esc(t.name)}">${o}</optgroup>` : o; }).join('');
    const cc = q.comp ? (q.compConf === 'manual' ? `<span class="conf ok" title="Set by you">✓</span>` : q.compConf === 'low' ? `<span class="conf low" title="${esc(q.compWhy || 'Weak match')}">? uncertain</span>` : q.compConf ? `<span class="conf med" title="${esc(q.compWhy || '')}">auto</span>` : '') : '';
    return `<select data-f="comp" title="Learning competency"><option value="">— Competency —</option>${groups}</select>${cc}`;
  },
  card(q, L, top, kid) {
    if (!q) return '';
    const n = L && L.num[q.id];
    const tools = `<div class="qtools">${top ? `<button class="btn icon sm ghost" data-a="q-up" title="Move up">${icon('up')}</button><button class="btn icon sm ghost" data-a="q-down" title="Move down">${icon('down')}</button>` : `<button class="btn icon sm ghost" data-a="kid-up" title="Move up">${icon('up')}</button><button class="btn icon sm ghost" data-a="kid-down" title="Move down">${icon('down')}</button>`}
      <button class="btn icon sm ghost" data-a="q-dup" title="Duplicate">${icon('copy')}</button>
      ${top && q.type !== 'section' ? `<button class="btn sm ${q.inBank ? 'on' : ''}" data-a="q-bank" title="${q.inBank ? 'This item is in the item bank' : 'Save a copy to the item bank'}">${q.inBank ? icon('check') + 'In bank' : icon('bank') + 'Save to bank'}</button>` : ''}
      <button class="btn icon sm ghost" data-a="q-del" title="Delete">${icon('trash')}</button></div>`;
    const grip = top ? `<span class="grip" title="Drag to reorder">${icon('grip')}</span>` : '';
    if (q.type === 'section') {
      return `<div class="qcard section-card qtop" data-id="${q.id}"><div class="qhead">${grip}<span class="tag gold">Section</span><select data-f="preset">${Object.keys(DIR).filter(k => k !== 'match').map(k => `<option value="${k}"${k === q.preset ? ' selected' : ''}>${k === 'custom' ? 'Custom' : DIR[k][0]}</option>`).join('')}</select>${tools}</div>
        <div class="orow"><b class="wide">Title</b><input data-f="title" value="${esc(q.title)}" placeholder="e.g., Multiple Choice"></div>
        <div class="orow"><b class="wide">Directions</b><input data-f="dir" value="${esc(q.dir)}" placeholder="Directions printed under the title"></div>
        <div class="hint">Items below this card belong to this section until the next section card. It prints as “Test I.”, “Test II.” and so on.</div></div>`;
    }
    if (isGroup(q)) {
      const isM = q.type === 'matching', ks = kidsOf(q);
      let h = `<div class="qcard group-card qtop" data-id="${q.id}"><div class="qhead">${grip}<span class="qnum">${ks.length ? rg(n) : '—'}</span><span class="tag">${isM ? 'Matching set' : 'Passage group'}</span>${this.compSel(q).replace('— Competency —', '— Competency (all items) —').replace('data-f="comp"', 'data-f="gcomp"')}${tools}</div>
        <div class="orow"><b class="wide">Heading</b><input data-f="head" value="${esc(q.head || '')}" placeholder="${isM ? 'Match Column A with Column B.' : 'refer to the passage below:'}"></div>`;
      if (!isM) h += `<div class="ed" contenteditable="true" data-f="stem" data-ph="Type or paste the shared passage, situation, or data description">${q.stem || ''}</div>`;
      h += `<div class="hint" style="margin-top:8px">${isM ? 'Column B — answer choices' : 'Shared choices (optional) — use for items answered from one list, like “refer to the options below”.'}</div>`;
      h += (q.sopts || []).map((o, i) => `<div class="orow" data-orow="${i}"><span class="ograb" data-ograb="sopts" title="Drag to reorder this choice">${icon('grip')}</span><b>${LET[i]}</b><input data-f="sopt" data-i="${i}" value="${esc(o)}" placeholder="Choice ${LET[i]}"><button class="btn icon sm ghost" data-a="del-sopt" data-i="${i}" title="Remove choice">${icon('x')}</button></div>`).join('');
      if ((q.sopts || []).length < 10) h += `<button class="btn sm" data-a="add-sopt">${icon('plus')}Add ${isM ? 'Column B choice' : 'shared choice'}</button>`;
      h += `<div class="hint" style="margin-top:10px">${isM ? 'Column A — items' : 'Linked questions'}</div><div class="kids">${ks.map(k => this.card(k, L, false, true)).join('') || '<div class="hint">No items yet.</div>'}</div>`;
      h += `<div class="row">${isM ? `<button class="btn sm" data-a="add-kid" data-type="match">${icon('plus')}Add Column A item</button>` : `<div class="dd"><button class="btn sm" data-dd="dd-kid-${q.id}">${icon('plus')}Add linked question ${icon('down')}</button><div class="ddm" id="dd-kid-${q.id}">${['mc', 'ident', 'cmc', 'morse', 'match'].map(t => `<button class="mi" data-a="add-kid" data-type="${t}">${TYPE_NAMES[t]}${t === 'match' ? '<small>Answered from the shared choices</small>' : ''}</button>`).join('')}</div></div>`}</div></div>`;
      return h;
    }
    const kidTypes = parentOf(q) ? (parentOf(q).type === 'matching' ? ['match'] : ['mc', 'ident', 'cmc', 'morse', 'match']) : ['mc', 'ident', 'cmc', 'morse', 'prob'];
    let h = `<div class="qcard ${kid ? 'kid' : 'qtop'}" data-id="${q.id}"><div class="qhead">${grip}<span class="qnum" title="Item number">${rg(n) || '—'}</span>
      <select data-f="type" title="Question format">${kidTypes.map(t => `<option value="${t}"${t === q.type ? ' selected' : ''}>${TYPE_SHORT[t]}</option>`).join('')}</select>
      ${this.bloomSel(q)}${this.compSel(q)}
      ${q.type === 'prob' ? `<label class="pts">Points <input type="number" min="1" max="50" data-f="pts" value="${q.pts}"></label>` : `<span class="qmeta">1 pt</span>`}
      ${tools}</div>`;
    h += this.body(q);
    h += `</div>`;
    return h;
  },
  body(q) {
    const ed = (ph) => `<div class="ed" contenteditable="true" data-f="stem" data-ph="${ph}">${q.stem || ''}</div>`;
    const optRows = () => (q.opts || []).map((o, i) => `<div class="orow${q.ans === LET[i] ? ' correct' : ''}" data-orow="${i}"><span class="ograb" data-ograb="opts" title="Drag to reorder this choice">${icon('grip')}</span><input type="radio" name="ans-${q.id}" data-f="ans" data-i="${i}"${q.ans === LET[i] ? ' checked' : ''} title="Mark ${LET[i]} as the correct answer"><b>${LET[i]}</b><input data-f="opt" data-i="${i}" value="${esc(o)}" placeholder="Choice ${LET[i]}">${q.type === 'mc' ? `<button class="btn icon sm ghost" data-a="opt-img" data-i="${i}" title="Attach an image to this choice">${icon('image')}</button>` : ''}<button class="btn icon sm ghost" data-a="del-opt" data-i="${i}" title="Remove choice">${icon('x')}</button></div>${(q.oimg || [])[i] ? `<div class="oimg"><img src="${q.oimg[i]}" alt="Choice ${LET[i]} image"><button class="btn sm ghost" data-a="del-opt-img" data-i="${i}">Remove image</button></div>` : ''}`).join('') + ((q.opts || []).length < 5 ? `<button class="btn sm" data-a="add-opt">${icon('plus')}Add choice</button>` : '') + (q.ans ? '' : `<div class="why">Tick the circle beside the correct choice to set the answer key.</div>`);
    if (q.type === 'mc') return ed('Type the question') + optRows();
    if (q.type === 'ident') return ed('Type the description or question (the answer is a term)') + `<div class="orow" style="margin-top:8px"><b class="wide">Answer key</b><input data-f="ansText" value="${esc(q.ansText)}" placeholder="Correct answer (separate accepted answers with /)"></div>`;
    if (q.type === 'cmc') return ed('Type the question, e.g., Which of the following statements are true?') +
      (q.statements || []).map((s, i) => `<div class="orow"><b style="width:28px">${RN[i]}.</b><input data-f="stmt" data-i="${i}" value="${esc(s)}" placeholder="Statement ${RN[i]}"><button class="btn icon sm ghost" data-a="del-stmt" data-i="${i}" title="Remove statement">${icon('x')}</button></div>`).join('') +
      `<div class="row" style="margin:4px 0 8px">${(q.statements || []).length < 5 ? `<button class="btn sm" data-a="add-stmt">${icon('plus')}Add statement</button>` : ''}<button class="btn sm" data-a="cmc-combos" title="Fill the choices with common combinations">${icon('wand')}Suggest combination choices</button></div>` + optRows();
    if (q.type === 'morse') return ['x', 'y'].map(k => `<div class="orow"><b>${k.toUpperCase()}</b><input data-f="${k}" value="${esc(q[k] || '')}" placeholder="Statement ${k.toUpperCase()}"><select data-f="${k}t"><option value="1"${q[k + 't'] ? ' selected' : ''}>True</option><option value="0"${q[k + 't'] ? '' : ' selected'}>False</option></select></div>`).join('') + `<div class="qmeta" data-morse>Answer key: <b>${morseAns(q)}</b> — ${['Only X is true', 'Only Y is true', 'Both are true', 'Both are false'][LET.indexOf(morseAns(q))]}</div>`;
    if (q.type === 'prob') return ed('Type the problem') + `<div class="row" style="margin-top:8px"><label class="qmeta"><input type="checkbox" data-f="fbd"${q.fbd ? ' checked' : ''}> Include a free-body diagram box</label></div><div class="orow"><b class="wide">Answer key</b><input data-f="ansText" value="${esc(q.ansText)}" placeholder="Final answer or scoring notes"></div>`;
    if (q.type === 'match') {
      const p = parentOf(q), sp = (p && p.sopts) || [];
      return `<div class="ed" contenteditable="true" data-f="stem" data-ph="${p && p.type === 'matching' ? 'Column A item' : 'Type the item (answered from the shared choices)'}">${q.stem || ''}</div>` + (sp.length ? `<div class="orow" style="margin-top:6px"><b class="wide">Answer</b><select data-f="mans"><option value="">—</option>${sp.map((o, i) => `<option value="${LET[i]}"${q.ans === LET[i] ? ' selected' : ''}>${LET[i]}. ${esc(String(o).slice(0, 60))}</option>`).join('')}</select></div>` : `<div class="why">Add choices to the group above, then pick the answer here.</div>`);
    }
    return '';
  },
  rail(ex, C) {
    const tot = C.points || 1;
    return Planner.railCard(ex) + `<div class="card"><div class="cardhead"><h2>Assessment overview</h2><span class="right tiny">LIVE</span></div>
      <div class="stats"><div class="stat"><b>${C.items}</b><span>Items</span></div><div class="stat"><b>${C.points}</b><span>Total points</span></div><div class="stat"><b>${C.sections}</b><span>Sections</span></div></div>
      <div style="margin-top:10px">${BL.map((b, i) => `<div class="minirow"><span style="width:96px">${b}</span><div class="bar"><i style="width:${Math.round(C.bloom[i] / tot * 100)}%"></i></div><span style="width:40px;text-align:right">${Math.round(C.bloom[i] / tot * 100)}%</span></div>`).join('')}</div></div>
      <div class="card"><div class="cardhead"><h2>Coverage check</h2><span class="tag ${C.progress === 100 ? 'green' : 'gold'} right">${C.progress === 100 ? 'READY' : 'REVIEW'}</span></div>
        <div class="minirow"><span>Items with answer keys</span><strong style="color:${C.noKey.length ? 'var(--red)' : 'var(--green)'}">${C.keyed} / ${C.items}</strong></div>
        <div class="minirow"><span>Mapped to competencies</span><strong style="color:${C.noComp.length ? 'var(--amber)' : 'var(--green)'}">${C.items - C.noComp.length} / ${C.items}</strong></div>
        <div class="minirow"><span>Uncertain Bloom levels</span><strong style="color:${C.lowBloom.length ? 'var(--amber)' : 'var(--green)'}">${C.lowBloom.length}</strong></div>
        <div class="minirow"><span>Uncertain competency matches</span><strong style="color:${C.lowComp.length ? 'var(--amber)' : 'var(--green)'}">${C.lowComp.length}</strong></div>
        <div class="minirow"><span>Empty items</span><strong style="color:${C.empty.length ? 'var(--red)' : 'var(--green)'}">${C.empty.length}</strong></div>
        ${C.noKey.length ? `<div class="why">Missing keys: items ${esc(C.noKey.slice(0, 12).join(', '))}${C.noKey.length > 12 ? '…' : ''}</div>` : ''}
        <button class="btn" style="width:100%;margin-top:12px;justify-content:center" data-a="assistant" data-tab="review">${icon('spark')}Ask Jin to review this exam</button></div>`;
  },
  refreshMeta() {
    const ex = curExam(); if (!ex || APP.screen !== 'exam' || APP.examTab !== 'builder') { App.refreshChrome(); return; }
    const C = examChecks(ex); const r = $('#exam-rail'); if (r) r.innerHTML = this.rail(ex, C);
    const c = $('#exam-count'); if (c) c.textContent = plural(C.items, 'item') + ' · ' + plural(C.points, 'point');
    App.refreshChrome();
  },
  rerender() { const ex = curExam(); const y = window.scrollY; const ql = $('#qlist'); if (ex && ql) { ql.innerHTML = this.list(ex, layout(ex)); this.refreshMeta(); } else this.render(); window.scrollTo(0, y); }
};
const refreshMetaSoon = debounce(() => Exam.refreshMeta(), 500);

/* ---------- editing events ---------- */
const qOfEl = el => { const c = el.closest && el.closest('.qcard'); return c ? [c, Q(c.dataset.id)] : []; };
function touchQ(q) { q.updated = nowISO(); const ex = curExam(); if (ex && (ex.items.includes(q.id) || (q.parent && ex.items.includes(q.parent)))) ex.updated = nowISO(); touch(); }
function refreshBloomUI(card, q) { const s = card.querySelector(':scope>.qhead [data-f=bloom]'); if (s) s.value = q.bloom; const b = card.querySelector(':scope>.qhead [data-badge=bloom]'); if (b) b.outerHTML = Exam.bloomBadge(q); }
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset && t.dataset.ex && t.closest('#screen-exam')) { const ex = curExam(); let v = t.value; if (t.dataset.ex === 'start') v = Math.max(1, parseInt(v) || 1); ex[t.dataset.ex] = v; ex.updated = nowISO(); touch(); if (t.dataset.ex === 'start') { refreshNumbersSoon(); } else refreshMetaSoon(); return; }
  const [card, q] = qOfEl(t); const f = t.dataset && t.dataset.f; if (!q || !f) return;
  if (f === 'stem') q.stem = t.innerHTML;
  else if (f === 'opt') q.opts[+t.dataset.i] = t.value;
  else if (f === 'stmt') q.statements[+t.dataset.i] = t.value;
  else if (f === 'sopt') { q.sopts[+t.dataset.i] = t.value; }
  else if (f === 'x' || f === 'y' || f === 'ansText' || f === 'head' || f === 'title' || f === 'dir') q[f] = t.value;
  else if (f === 'pts') { q.pts = clamp(parseInt(t.value) || 1, 1, 50); refreshNumbersSoon(); }
  else return;
  if (['stem', 'x', 'y', 'stmt'].includes(f) && isLeaf(q) && !q.bloomManual) { Classify.autoBloom(q); refreshBloomUI(card, q); }
  if (f === 'stem' && isGroup(q)) kidsOf(q).forEach(k => { if (!k.bloomManual) Classify.autoBloom(k); });
  touchQ(q); refreshMetaSoon();
});
const refreshNumbersSoon = debounce(() => { if (APP.screen === 'exam') Exam.rerender(); }, 700);
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset && t.dataset.ex === 'status') { const ex = curExam(); ex.status = t.value; ex.updated = nowISO(); touch(); App.refreshChrome(); const tg = $('#details-card .tag'); if (tg) tg.textContent = t.value; return; }
  const [card, q] = qOfEl(t); const f = t.dataset && t.dataset.f; if (!q || !f) return;
  if (f === 'bloom') { q.bloom = +t.value; q.bloomManual = true; refreshBloomUI(card, q); }
  else if (f === 'comp') { q.comp = t.value; q.compConf = t.value ? 'manual' : ''; q.compWhy = ''; touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); return; }
  else if (f === 'gcomp') { kidsOf(q).forEach(k => { k.comp = t.value; k.compConf = t.value ? 'manual' : ''; }); q.comp = t.value; touchQ(q); Exam.rerender(); return; }
  else if (f === 'ans') { q.ans = LET[+t.dataset.i]; card.querySelectorAll(':scope>.orow').forEach(r => r.classList.remove('correct')); t.closest('.orow').classList.add('correct'); const w = card.querySelector(':scope>.why'); if (w && /Tick the circle/.test(w.textContent)) w.remove(); }
  else if (f === 'mans') q.ans = t.value;
  else if (f === 'xt' || f === 'yt') { q[f] = t.value === '1'; q.ans = morseAns(q); const m = card.querySelector('[data-morse]'); if (m) m.innerHTML = `Answer key: <b>${q.ans}</b> — ${['Only X is true', 'Only Y is true', 'Both are true', 'Both are false'][LET.indexOf(q.ans)]}`; }
  else if (f === 'fbd') q.fbd = t.checked;
  else if (f === 'preset') { q.preset = t.value; if (t.value !== 'custom') { q.title = DIR[t.value][0]; q.dir = DIR[t.value][1]; } touchQ(q); Exam.rerender(); return; }
  else if (f === 'type') { changeType(q, t.value); touchQ(q); Exam.rerender(); return; }
  else return;
  touchQ(q); refreshMetaSoon();
});
Exam.rerenderCard = q => { const c = $(`.qcard[data-id="${q.id}"]`); if (!c) return; if (c.closest('#qeditor')) return Bank.renderEditor(); const L = layout(curExam()); const top = c.classList.contains('qtop'); const tmp = document.createElement('div'); tmp.innerHTML = Exam.card(q, L, top, !top); c.replaceWith(tmp.firstElementChild); };
function changeType(q, type) {
  const old = q.type; if (old === type) return; q.type = type;
  if ((type === 'mc' || type === 'cmc') && !(q.opts || []).length) q.opts = type === 'cmc' ? ['I only', 'I and II only', 'II and III only', 'I, II, and III'] : ['', '', '', ''];
  if (type === 'cmc' && !(q.statements || []).length) q.statements = ['', '', ''];
  if (!['mc', 'cmc'].includes(type)) { if (type !== 'match') q.ans = ''; }
  if (type === 'morse') { q.x = q.x || ''; q.y = q.y || ''; q.ans = morseAns(q); }
  if (type === 'match') q.ans = '';
  if (type === 'prob' && (q.pts || 1) < 2) q.pts = 3;
  if (type !== 'prob') q.pts = 1;
  if (!q.bloomManual) Classify.autoBloom(q);
}

/* ---------- actions ---------- */
const topIdOf = el => { const c = el.closest('.qcard.qtop'); return c ? c.dataset.id : null; };
ACT['add-q'] = b => {
  const ex = curExam(); if (!ex) return ACT['new-exam']();
  const type = b.dataset.type; const q = newQ(type); S.qs.push(q);
  if (type === 'passage') { const k = newQ('mc', { parent: q.id }); S.qs.push(k); q.kids.push(k.id); }
  if (type === 'matching') { for (let i = 0; i < 3; i++) { const k = newQ('match', { parent: q.id, bloom: 0 }); S.qs.push(k); q.kids.push(k.id); } q.head = 'Match each item in Column A with the correct answer in Column B.'; }
  if (type === 'section') { const L = layout(ex); const last = L.secs[L.secs.length - 1]; const p = last && last.k !== 'custom' ? last.k : 'mc'; q.preset = p; q.title = DIR[p][0]; q.dir = DIR[p][1]; }
  ex.items.push(q.id); ex.updated = nowISO(); touch();
  APP.examTab = 'builder'; if (APP.screen !== 'exam') App.go('exam'); else Exam.rerender();
  setTimeout(() => { const c = $(`.qcard[data-id="${q.id}"]`); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); const ed = c.querySelector('.ed,input:not([type=radio])'); if (ed) ed.focus(); } }, 60);
};
ACT['add-kid'] = b => { const g = Q(topIdOf(b)); if (!g) return; const type = b.dataset.type; const k = newQ(type, { parent: g.id }); if (type === 'match' || g.type === 'matching') { k.type = 'match'; k.opts = []; k.bloom = g.type === 'matching' ? 0 : 1; } S.qs.push(k); g.kids.push(k.id); touchQ(g); Exam.rerender(); setTimeout(() => { const c = $(`.qcard[data-id="${k.id}"] .ed`); if (c) c.focus(); }, 50); };
ACT['q-up'] = ACT['q-down'] = b => { const ex = curExam(), id = topIdOf(b), i = ex.items.indexOf(id), j = i + (b.dataset.a === 'q-up' ? -1 : 1); if (i < 0 || j < 0 || j >= ex.items.length) return; [ex.items[i], ex.items[j]] = [ex.items[j], ex.items[i]]; ex.updated = nowISO(); touch(); Exam.rerender(); };
ACT['kid-up'] = ACT['kid-down'] = b => { const [, k] = qOfEl(b); const g = parentOf(k); if (!g) return; const i = g.kids.indexOf(k.id), j = i + (b.dataset.a === 'kid-up' ? -1 : 1); if (j < 0 || j >= g.kids.length) return; [g.kids[i], g.kids[j]] = [g.kids[j], g.kids[i]]; touchQ(g); Exam.rerender(); };
ACT['q-dup'] = b => {
  const [, q] = qOfEl(b); const ex = curExam();
  if (q.parent) { const g = parentOf(q); const c = JSON.parse(JSON.stringify(q)); c.id = uid(); S.qs.push(c); g.kids.splice(g.kids.indexOf(q.id) + 1, 0, c.id); touchQ(g); }
  else { const c = cloneQ(q, { inBank: false }); ex.items.splice(ex.items.indexOf(q.id) + 1, 0, c.id); touchQ(c); }
  Exam.rerender(); toast('Duplicated.');
};
ACT['q-del'] = async b => {
  const [, q] = qOfEl(b); const ex = curExam();
  const filled = !isEmptyQ(q) || (isGroup(q) && kidsOf(q).length);
  if (filled && !(await confirmDlg({ title: 'Delete this ' + (q.type === 'section' ? 'section' : isGroup(q) ? 'group and its items' : 'item') + '?', msg: q.inBank ? 'It will be removed from this exam. The copy in your item bank stays.' : 'It will be removed from this exam. This cannot be undone (your last backup still has it).', ok: 'Delete', danger: true }))) return;
  if (q.parent) removeQ(q.id);
  else { ex.items = ex.items.filter(x => x !== q.id); if (!q.inBank) removeQ(q.id); }
  ex.updated = nowISO(); gcQuestions(); touch(); Exam.rerender();
};
ACT['q-bank'] = b => {
  const [, q] = qOfEl(b);
  if (q.inBank) { toast('Already in the item bank. Edit it in the bank or here — they are the same item.', 'info'); return; }
  q.inBank = true; touchQ(q); Exam.rerenderCard(q); App.refreshChrome(); toast('Saved to the item bank.');
};
ACT['add-opt'] = b => { const [, q] = qOfEl(b); if (q.opts.length >= 5) return; q.opts.push(''); touchQ(q); Exam.rerenderCard(q); };
ACT['del-opt'] = b => { const [, q] = qOfEl(b); const i = +b.dataset.i, k = q.ans ? LET.indexOf(q.ans) : -1; q.opts.splice(i, 1); if (q.oimg) q.oimg.splice(i, 1); if (k === i) q.ans = ''; else if (k > i) q.ans = LET[k - 1]; touchQ(q); Exam.rerenderCard(q); refreshMetaSoon(); };
ACT['opt-img'] = async b => { const [, q] = qOfEl(b); const src = await pickImage(420).catch(e => { toast(e.message, 'error'); return null; }); if (!src) return; (q.oimg = q.oimg || [])[+b.dataset.i] = src; touchQ(q); Exam.rerenderCard(q); };
ACT['del-opt-img'] = b => { const [, q] = qOfEl(b); q.oimg[+b.dataset.i] = ''; touchQ(q); Exam.rerenderCard(q); };
ACT['add-stmt'] = b => { const [, q] = qOfEl(b); if (q.statements.length >= 5) return; q.statements.push(''); touchQ(q); Exam.rerenderCard(q); };
ACT['del-stmt'] = b => { const [, q] = qOfEl(b); q.statements.splice(+b.dataset.i, 1); touchQ(q); Exam.rerenderCard(q); };
ACT['cmc-combos'] = b => {
  const [, q] = qOfEl(b); const n = q.statements.length;
  const sets = { 2: ['I only', 'II only', 'Both I and II', 'Neither I nor II'], 3: ['I only', 'I and II only', 'II and III only', 'I, II, and III'], 4: ['I and II only', 'I and III only', 'II and IV only', 'I, II, III, and IV'], 5: ['I, II, and III only', 'II, III, and IV only', 'I, III, and V only', 'I, II, III, IV, and V'] };
  q.opts = (sets[n] || sets[3]).slice(); q.ans = ''; touchQ(q); Exam.rerenderCard(q); toast('Choices filled. Edit them to match the correct combination, then mark the answer.', 'info');
};
ACT['add-sopt'] = b => { const g = Q(topIdOf(b)); g.sopts = g.sopts || []; if (g.sopts.length >= 10) return; g.sopts.push(''); touchQ(g); Exam.rerender(); };
ACT['del-sopt'] = b => { const g = Q(topIdOf(b)); const i = +b.dataset.i; g.sopts.splice(i, 1); kidsOf(g).forEach(k => { const x = k.ans ? LET.indexOf(k.ans) : -1; if (k.type === 'match') { if (x === i) k.ans = ''; else if (x > i) k.ans = LET[x - 1]; } }); touchQ(g); Exam.rerender(); };
ACT['exam-logo'] = async () => { const src = await pickImage(300).catch(e => { toast(e.message, 'error'); return null; }); if (!src) return; const ex = curExam(); ex.logo = src; touch(); Exam.render(); };
ACT['exam-logo-del'] = () => { const ex = curExam(); ex.logo = ''; touch(); Exam.render(); };
ACT['clear-exam'] = async () => {
  const ex = curExam(); if (!ex.items.length) return toast('The exam is already empty.', 'info');
  if (!(await confirmDlg({ title: 'Clear all items from this exam?', msg: 'Items that are not saved in the item bank will be deleted. Bank items stay in the bank.', ok: 'Clear exam', danger: true, chibi: 'angry' }))) return;
  ex.items.forEach(id => { const q = Q(id); if (q && !q.inBank) removeQ(id); }); ex.items = []; ex.updated = nowISO(); gcQuestions(); touch(); Exam.render(); toast('Exam cleared.');
};

/* formatting toolbar acts on the last focused editor */
let lastEd = null, lastRange = null;
document.addEventListener('selectionchange', () => { const s = document.getSelection(); if (!s.rangeCount) return; const n = s.anchorNode; const ed = n && (n.nodeType === 1 ? n : n.parentElement); const e = ed && ed.closest && ed.closest('.ed'); if (e) { lastEd = e; lastRange = s.getRangeAt(0).cloneRange(); } });
document.addEventListener('mousedown', e => { if (e.target.closest('.fmt')) e.preventDefault(); });
const restoreSel = () => { if (!lastEd || !document.body.contains(lastEd)) return false; lastEd.focus(); if (lastRange) { const s = document.getSelection(); s.removeAllRanges(); s.addRange(lastRange); } return true; };
ACT['fmt'] = b => { if (!restoreSel()) return toast('Click inside a question first, then choose a format.', 'info'); document.execCommand(b.dataset.cmd); };
ACT['insert-img'] = async () => {
  if (!lastEd || !document.body.contains(lastEd)) return toast('Click inside a question where the image should go, then choose Insert image.', 'info');
  const ed = lastEd, range = lastRange; const src = await pickImage(640).catch(e => { toast(e.message, 'error'); return null; }); if (!src) return;
  ed.focus(); if (range) { const s = document.getSelection(); s.removeAllRanges(); s.addRange(range); }
  document.execCommand('insertImage', false, src);
};

/* drag-and-drop reordering of top-level cards */
let dragId = null;
const clrOv = () => $$('.ov-t,.ov-b').forEach(x => x.classList.remove('ov-t', 'ov-b'));
const topCard = e => e.target.closest && e.target.closest('#qlist .qcard.qtop');
document.addEventListener('mousedown', e => { const g = e.target.closest && e.target.closest('#qlist .grip'); if (g) { const c = g.closest('.qcard.qtop'); if (c) c.draggable = true; } });
document.addEventListener('mouseup', () => $$('#qlist .qcard[draggable=true]').forEach(c => { if (!dragId) c.draggable = false; }));
document.addEventListener('dragstart', e => { const c = topCard(e); if (!c || !c.draggable) return; dragId = c.dataset.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); c.classList.add('drag'); });
document.addEventListener('dragend', () => { $$('#qlist .qcard').forEach(c => { c.draggable = false; c.classList.remove('drag'); }); clrOv(); dragId = null; });
document.addEventListener('dragover', e => { const c = topCard(e); if (!c || !dragId) return; e.preventDefault(); clrOv(); if (c.dataset.id !== dragId) { const r = c.getBoundingClientRect(); c.classList.add(e.clientY < r.top + r.height / 2 ? 'ov-t' : 'ov-b'); } });
document.addEventListener('drop', e => {
  const c = topCard(e); if (!c || !dragId || c.dataset.id === dragId) return; e.preventDefault();
  const ex = curExam(), r = c.getBoundingClientRect(), up = e.clientY < r.top + r.height / 2;
  ex.items = ex.items.filter(x => x !== dragId); const i = ex.items.indexOf(c.dataset.id); ex.items.splice(up ? i : i + 1, 0, dragId); ex.updated = nowISO(); touch(); dragId = null; Exam.rerender();
});

/* ---------- exam management ---------- */
ACT['new-exam'] = async () => {
  const title = await promptDlg({ title: 'New exam', label: 'Exam title', value: 'Untitled Assessment', ok: 'Create exam' }); if (title === null) return;
  const ex = newExam({ title: title.trim() || 'Untitled Assessment', teacher: S.settings.teacher || '', school: S.settings.school || '' });
  S.exams.unshift(ex); S.currentExam = ex.id; touch(); APP.examTab = 'planner'; App.go('exam'); toast('New exam created. Plan its structure first, or switch to Exam Builder.');
};
ACT['open-exam'] = b => { S.currentExam = b.dataset.id; touch(); App.go('exam'); };
ACT['dup-exam'] = () => {
  const ex = curExam(); const c = JSON.parse(JSON.stringify(ex)); c.id = uid(); c.title = ex.title + ' (copy)'; c.status = 'Draft'; c.created = c.updated = nowISO();
  c.items = ex.items.map(id => { const q = Q(id); if (!q) return null; return cloneQ(q, { inBank: false }).id; }).filter(Boolean);
  S.exams.unshift(c); S.currentExam = c.id; touch(); App.go('exam'); toast('Exam duplicated. Questions were copied, so edits won’t affect the original.');
};
ACT['del-exam'] = async () => {
  const ex = curExam(); if (!ex) return;
  if (!(await confirmDlg({ title: 'Delete “' + (ex.title || 'Untitled') + '”?', msg: 'Its questions that are not in the item bank, its TOS, and its item-analysis sections will be deleted. Save a backup first if you may need it.', ok: 'Delete exam', danger: true, chibi: 'angry' }))) return;
  S.exams = S.exams.filter(e => e.id !== ex.id); delete S.tos[ex.id]; S.groups = S.groups.filter(g => g.examId !== ex.id);
  gcQuestions(); S.currentExam = S.exams[0] ? S.exams[0].id : null; touch(); App.go(S.exams.length ? 'exam' : 'overview'); toast('Exam deleted.');
};
ACT['auto-classify'] = () => {
  const ex = curExam(); const L = layout(ex);
  L.leaves.forEach(q => Classify.autoBloom(q));
  const r = Classify.suggestComps(L.leaves, 'unassigned');
  touch(); Exam.rerender();
  const low = L.leaves.filter(q => !q.bloomManual && q.bloomConf === 'Low').length;
  if (r.none) toast(`Bloom levels updated (${low} uncertain). Add competencies to get competency suggestions.`, 'info', 5000);
  else toast(`Bloom levels updated (${low} uncertain). ${r.n} competency suggestion(s)${r.low ? ', ' + r.low + ' uncertain' : ''}${r.left ? '; ' + r.left + ' item(s) had too little information' : ''}. Review items marked “? uncertain”.`, 'ok', 6500);
};

/* ---------- item bank picker ---------- */
ACT['pick-bank'] = () => {
  const ex = curExam(); if (!ex) return ACT['new-exam']();
  const items = bankItems(); const used = new Set(ex.items.map(id => { const q = Q(id); return q && q.srcBank; }).filter(Boolean));
  const m = modal(`<h3>Add from item bank</h3><div class="hint">Selected items are copied into this exam, so edits in the exam won’t change your bank.</div>
    <div class="filters" style="margin-top:12px"><div class="search">${icon('search')}<input id="pk-q" placeholder="Search questions…"></div><select class="inp" id="pk-t"><option value="">All types</option>${['mc', 'ident', 'cmc', 'morse', 'prob', 'passage', 'matching'].map(t => `<option value="${t}">${TYPE_SHORT[t]}</option>`).join('')}</select><select class="inp" id="pk-b"><option value="">All Bloom levels</option>${BL.map((b, i) => `<option value="${i}">${b}</option>`).join('')}</select></div>
    <div id="pk-list" style="max-height:52vh;overflow:auto"></div>
    <div class="mfoot"><span class="tiny" id="pk-n">0 selected</span><span class="spacer"></span><button class="btn" data-a="modal-close">Cancel</button><button class="btn blue" id="pk-add">Add selected</button></div>`, { size: 'wide' });
  const sel = new Set();
  const draw = () => {
    const f = $('#pk-q').value.toLowerCase(), t = $('#pk-t').value, bl = $('#pk-b').value;
    const list = items.filter(q => (!t || q.type === t) && (bl === '' || (isLeaf(q) && q.bloom === +bl)) && (!f || (Classify.textOf(q) + ' ' + (q.opts || []).join(' ') + ' ' + kidsOf(q).map(Classify.textOf).join(' ')).toLowerCase().includes(f)));
    $('#pk-list').innerHTML = list.length ? list.map(q => `<label class="bankitem" style="cursor:pointer"><input type="checkbox" class="chk" value="${q.id}"${sel.has(q.id) ? ' checked' : ''}><div class="body"><div class="row"><span class="tag gray">${TYPE_SHORT[q.type]}</span>${isLeaf(q) ? `<span class="tag gold">${BL_SHORT[q.bloom]}</span>` : `<span class="tag">${kidsOf(q).length} items</span>`}${q.comp ? `<span class="tag">${esc(compLabel(q.comp).slice(0, 40))}</span>` : ''}${used.has(q.id) ? '<span class="tag green">already in exam</span>' : ''}</div><div class="stem">${esc((Classify.textOf(q) || '(no text)').slice(0, 220))}</div></div></label>`).join('') : `<div class="empty"><img src="${CHIBI.sad}" alt=""><b>No matching items</b>${items.length ? 'Try a different search or filter.' : 'Your item bank is empty. Save questions to the bank or import a file first.'}</div>`;
  };
  draw();
  ['pk-q', 'pk-t', 'pk-b'].forEach(id => $('#' + id).addEventListener(id === 'pk-q' ? 'input' : 'change', draw));
  m.addEventListener('change', e => { if (e.target.classList.contains('chk')) { e.target.checked ? sel.add(e.target.value) : sel.delete(e.target.value); $('#pk-n').textContent = sel.size + ' selected'; } });
  $('#pk-add').onclick = () => {
    if (!sel.size) return toast('Select at least one item.', 'info');
    sel.forEach(id => { const src = Q(id); const c = cloneQ(src, { inBank: false, srcBank: src.id }); ex.items.push(c.id); });
    ex.updated = nowISO(); touch(); closeModal(true); APP.examTab = 'builder'; App.go('exam'); toast(plural(sel.size, 'item') + ' added to the exam.');
  };
};

/* ---------- print / preview ---------- */
const PAPER = { letter: { w: 8.5, h: 11, name: 'Letter (8.5 × 11 in)' }, a4: { w: 8.27, h: 11.69, name: 'A4' }, legal: { w: 8.5, h: 14, name: 'Legal (8.5 × 14 in)' }, long: { w: 8.5, h: 13, name: 'Long bond (8.5 × 13 in)' } };
/* Print layout modelled on the school's exam paper (long bond, Arial, boxed instructions and test headers) */
const PRINT_CSS = `*{box-sizing:border-box}body{margin:0;font:11pt/1.32 Arial,Helvetica,sans-serif;color:#000;background:#fff}
.ph{position:relative;text-align:center;min-height:1.05in;margin-bottom:14pt}.ph .logo{position:absolute;left:0;top:0;height:1in;width:auto;max-width:1.2in;object-fit:contain}
.ph .sch{font-weight:bold;font-size:10pt;letter-spacing:1px;line-height:1.25}.ph .t1{font-weight:bold;font-size:11pt;margin-top:10pt}.ph .t2{font-weight:bold;font-size:10.5pt}.ph .t3{font-weight:bold;font-size:11pt;margin-top:14pt}
.nm{margin-top:6pt}.nm i,.sl i{display:inline-block;border-bottom:1px solid #000;width:2.6in;font-style:normal}.sl{display:flex;justify-content:space-between;margin:2pt 0 4pt}
hr.thick{border:0;border-top:3px solid #000;margin:4pt 0 12pt}
.box{border:1px solid #000;padding:4pt 6pt;margin:0 0 14pt;text-align:justify;break-inside:avoid;page-break-inside:avoid}
.tbox{border:1px solid #000;padding:2pt 6pt;margin:4pt 0 14pt;break-inside:avoid;page-break-inside:avoid;break-after:avoid;page-break-after:avoid}
.q{display:flex;margin:0 0 14pt;break-inside:avoid;page-break-inside:avoid}.qn{flex:none;width:.32in}.qb{flex:1;min-width:0;text-align:justify}.qb img,.pbox img,.passage img{max-width:100%;max-height:3in}
.opts{margin:9pt 0 0 .3in;text-align:left}.opts div{margin:0 0 1pt;padding-left:.28in;text-indent:-.28in}.opts img{display:block;max-width:2.4in;max-height:1.6in;margin:2pt 0 4pt .28in}
.stmts{margin:9pt 0 0 .8in;text-align:left}.stmts div{padding-left:.3in;text-indent:-.3in;margin:0 0 1pt}
.gh{margin:6pt 0 6pt;break-after:avoid;page-break-after:avoid}.gopts{margin:0 0 14pt .55in}.gopts div{padding-left:.28in;text-indent:-.28in}
.pbox{border:1px solid #000;padding:4pt 6pt;margin:0 0 14pt;text-align:justify}.passage{margin:0 0 12pt;text-align:justify}
.blank{display:inline-block;border-bottom:1px solid #000;width:1.7in;margin-left:6pt}
table.work{width:100%;border-collapse:collapse;margin:0 0 14pt;page-break-inside:avoid}table.work td{border:1px solid #000;padding:4pt 8pt;vertical-align:top;font-size:10pt}
table.mt{width:100%;border-collapse:collapse;margin:0 0 14pt}table.mt td,table.mt th{border:1px solid #000;padding:3pt 7pt;vertical-align:top;text-align:left;font-size:10.5pt}
.end{text-align:center;margin-top:18pt;line-height:2}
.keypage{page-break-before:always;break-before:page}table.key{border-collapse:collapse;width:100%}table.key td,table.key th{border:1px solid #000;padding:3px 7px;font-size:10pt;text-align:left}
.ph.k{min-height:0}`;
const gradeNo = ex => { const m = String(ex.grade || '').match(/\d+/); return m ? m[0] : ''; };
function optsHTML(list, imgs) { return `<div class="opts">${list.map((o, k) => `<div>${LET[k]}.&nbsp;&nbsp;${esc(o)}${imgs && imgs[k] ? `<img src="${imgs[k]}" alt="">` : ''}</div>`).join('')}</div>`; }
function leafPrint(q, numLabel) {
  const qn = `<span class="qn">${numLabel}.</span>`;
  if (q.type === 'morse') return `<div class="q">${qn}<div class="qb">${stripHTML(q.stem) ? `<div>${q.stem}</div>` : ''}<b>X:</b> ${esc(q.x)}<br><b>Y:</b> ${esc(q.y)}</div></div>`;
  if (q.type === 'ident') return `<div class="q">${qn}<div class="qb">${q.stem}<span class="blank"></span></div></div>`;
  if (q.type === 'cmc') return `<div class="q">${qn}<div class="qb">${q.stem}<div class="stmts">${(q.statements || []).map((s, i) => `<div>${RN[i]}.&nbsp;&nbsp;${esc(s)}</div>`).join('')}</div>${optsHTML(q.opts || [])}</div></div>`;
  if (q.type === 'match') return `<div class="q">${qn}<div class="qb">${q.stem}</div></div>`;
  return `<div class="q">${qn}<div class="qb">${q.stem}${(q.opts || []).length ? optsHTML(q.opts, q.oimg) : ''}</div></div>`;
}
const workTable = q => `<table class="work">${q.fbd ? '<tr><td colspan="2" style="height:1.3in"><b>Free-Body Diagram</b></td></tr>' : ''}<tr><td style="width:34%;height:1in"><b>Given and Required</b></td><td rowspan="2"><b>Complete Solution &amp; Answer</b></td></tr><tr><td style="height:1in"><b>Equation</b></td></tr></table>`;
/* "For item numbers 10 to 12," + rest. Returns [boldPart, rest] */
function groupHeadParts(L, t, lv) {
  const r = L.num[t.id], hasShared = (t.sopts || []).filter(Boolean).length > 0, hasText = !!(stripHTML(t.stem) || /<img/.test(t.stem || ''));
  const def = t.type === 'matching' ? 'match Column A with Column B.' : hasShared && !hasText ? 'refer to the following options:' : 'refer to the situation below.';
  let hd = (t.head || def).trim(); hd = hd.charAt(0).toLowerCase() + hd.slice(1);
  if (!lv.length || !r) return ['', hd.charAt(0).toUpperCase() + hd.slice(1)];
  return [r[0] === r[1] ? `For item number ${r[0]},` : `For item numbers ${r[0]} to ${r[1]},`, hd];
}
const groupHead = (L, t, lv) => groupHeadParts(L, t, lv).filter(Boolean).join(' ');
function answerOf(q) { if (q.type === 'morse') return morseAns(q); if (q.type === 'mc' || q.type === 'cmc' || q.type === 'match') return q.ans || '—'; return q.ansText || '—'; }
function schoolLines(ex) { return String(ex.school || S.settings.school || '').split(/\s*(?:\n|\|)\s*/).filter(Boolean); }
function examBodyHTML(ex, opts = {}) {
  const L = layout(ex), g = gradeNo(ex);
  let h = `<div class="ph">${ex.logo ? `<img class="logo" src="${ex.logo}" alt="">` : ''}${schoolLines(ex).map(l => `<div class="sch">${esc(l)}</div>`).join('')}<div class="t1">${esc((ex.title || 'Examination').toUpperCase())}</div>${ex.schoolYear ? `<div class="t2">School Year ${esc(ex.schoolYear)}</div>` : ''}${ex.subject ? `<div class="t3">${esc(ex.subject.toUpperCase())}</div>` : ''}</div>
    <div class="nm">Name: <i></i></div><div class="sl"><span>${g ? esc(g) + ' - ' : 'Section: '}<i></i></span><span>${esc(ex.date || '')}</span></div><hr class="thick">
    ${ex.instr ? `<div class="box"><b>GENERAL INSTRUCTIONS:</b> ${esc(ex.instr)}</div>` : ''}`;
  L.secs.forEach((s, i) => {
    h += `<div class="tbox"><b>Test ${RN[i] || i + 1}. ${esc(s.title)}${/[.:]$/.test(s.title) ? '' : '.'}</b> ${esc(s.dir)} <i>(${plural(s.pts, 'point')})</i></div>`;
    s.top.forEach(({ t, leaves }) => {
      if (t.type === 'matching') {
        const [b, rest] = groupHeadParts(L, t, leaves);
        h += `<div class="gh"><b>${b}</b> ${esc(rest)}</div><table class="mt"><tr><th style="width:58%">Column A</th><th>Column B</th></tr>`;
        const rows = Math.max(leaves.length, (t.sopts || []).length);
        for (let r = 0; r < rows; r++) { const q = leaves[r]; h += `<tr><td>${q ? `____ ${L.num[q.id][0]}. ${q.stem}` : ''}</td><td>${(t.sopts || [])[r] !== undefined ? LET[r] + '. ' + esc(t.sopts[r]) : ''}</td></tr>`; }
        h += '</table>'; return;
      }
      if (t.type === 'passage') {
        const [b, rest] = groupHeadParts(L, t, leaves);
        h += `<div class="gh"><b>${b}</b> ${esc(rest)}</div>`;
        if (stripHTML(t.stem) || /<img/.test(t.stem || '')) h += /<img/.test(t.stem || '') && !stripHTML(t.stem) ? `<div class="passage">${t.stem}</div>` : `<div class="pbox">${t.stem}</div>`;
        if ((t.sopts || []).filter(Boolean).length) h += `<div class="gopts">${t.sopts.map((o, k) => `<div>${LET[k]}.&nbsp;&nbsp;${esc(o)}</div>`).join('')}</div>`;
      }
      leaves.forEach(q => { h += q.type === 'prob' ? `<div class="q"><span class="qn" style="width:auto;margin-right:6pt"><b>${rg(L.num[q.id])}.</b></span><div class="qb">${q.stem} <i>(${plural(weight(q), 'point')})</i></div></div>` + workTable(q) : leafPrint(q, L.num[q.id][0]); });
    });
  });
  if (ex.endNote) h += `<div class="end">${String(ex.endNote).split('\n').map(esc).join('<br>')}</div>`;
  if (opts.key) h += keyHTML(ex, L, true);
  return h;
}
function keyHTML(ex, L, pageBreak) {
  L = L || layout(ex);
  const rows = L.leaves.map(q => [rg(L.num[q.id]), TYPE_SHORT[q.type], answerOf(q), BL[q.bloom], compLabel(q.comp)]);
  return `<div class="${pageBreak ? 'keypage' : ''}"><div class="ph k"><div class="t1">ANSWER KEY</div><div class="t2">${esc(ex.title)}${ex.subject ? ' · ' + esc(ex.subject) : ''}</div></div>
    <table class="key"><tr><th style="width:12%">Item</th><th style="width:20%">Type</th><th>Answer</th><th style="width:18%">Bloom level</th></tr>${rows.map(r => `<tr><td>${r[0]}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${r[3]}</td></tr>`).join('')}</table></div>`;
}
function printDoc(body, title, landscape, paperKey) {
  const p = PAPER[paperKey || S.settings.paper] || PAPER.letter;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:${landscape ? p.h + 'in ' + p.w + 'in' : p.w + 'in ' + p.h + 'in'};margin:${landscape ? '0.5in' : '0.75in 0.8in 0.85in'}}${PRINT_CSS}${TOS_PRINT_CSS}</style></head><body>${body}</body></html>`;
}
async function exportExamPDF(key, keyOnly) {
  const ex = curExam(); if (!ex || !ex.items.length) return toast('Add questions before exporting.', 'info');
  const p = PAPER[S.settings.paper] || PAPER.letter;
  const body = keyOnly ? keyHTML(ex, null, false) : examBodyHTML(ex, { key });
  const name = safeName(ex.title, 'exam') + (keyOnly ? ' - Answer Key' : '') + '.pdf';
  toast('Preparing PDF…', 'info', 1800);
  const r = await Host.printToPDF(printDoc(body, ex.title, false), { defaultName: name, pageSize: { width: p.w, height: p.h }, landscape: false, footer: (ex.subject || ex.title || 'Assessment') + (keyOnly ? ' — Answer Key' : ''), margins: { top: 0.75, bottom: 0.85, left: 0.8, right: 0.8 } });
  if (r && r.canceled) return; if (r && r.ok === false) return toast('PDF export failed: ' + r.error, 'error');
  toast('Tip: in the print dialog, set Destination to “Save as PDF”.', 'info');
}
ACT['export-pdf'] = () => exportExamPDF(false);
ACT['export-key-pdf'] = () => exportExamPDF(false, true);
ACT['print-exam'] = async () => { const ex = curExam(); if (!ex || !ex.items.length) return toast('Add questions before printing.', 'info'); const r = await Host.print(printDoc(examBodyHTML(ex), ex.title, false), {}); if (r && r.ok === false) toast('Printing failed: ' + r.error, 'error'); };
ACT['preview'] = () => {
  const ex = curExam(); if (!ex) return;
  const p = PAPER[S.settings.paper] || PAPER.letter;
  const m = modal(`<h3>Print preview — ${esc(ex.title)}</h3><div class="row" style="margin:8px 0 10px"><label class="tiny">Paper <select class="inp sm" id="pv-paper">${Object.entries(PAPER).map(([k, v]) => `<option value="${k}"${k === S.settings.paper ? ' selected' : ''}>${v.name}</option>`).join('')}</select></label><label class="tiny"><input type="checkbox" id="pv-key"> Show answer key page</label><span class="spacer"></span><button class="btn" data-a="export-docx">${icon('file')}Word</button><button class="btn" data-a="print-exam">${icon('print')}Print</button><button class="btn gold" id="pv-pdf">${icon('download')}Save PDF</button></div>
    <div class="preview-wrap"><div class="preview-page portrait" id="pv-page" style="width:${p.w}in"></div></div>`, { size: 'wide' });
  const draw = () => { const pg = $('#pv-page'); const sh = pg.attachShadow ? (pg.shadowRoot || pg.attachShadow({ mode: 'open' })) : pg; sh.innerHTML = `<style>${PRINT_CSS}</style>` + examBodyHTML(ex, { key: $('#pv-key').checked }); };
  draw(); $('#pv-key').onchange = draw;
  $('#pv-paper').onchange = e => { S.settings.paper = e.target.value; touch(); $('#pv-page').style.width = PAPER[e.target.value].w + 'in'; };
  $('#pv-pdf').onclick = () => exportExamPDF($('#pv-key').checked);
};

/* ---------- Word export ---------- */
async function htmlRuns(html, base) {
  const D = docx, out = []; const doc = new DOMParser().parseFromString('<body>' + (html || ''), 'text/html');
  async function w(n, st) {
    if (n.nodeType === 3) { if (n.textContent) out.push(new D.TextRun({ text: n.textContent, font: 'Arial', size: 22, ...st })); return; }
    if (n.nodeType !== 1) return; const t = n.tagName, s = { ...st };
    if (t === 'B' || t === 'STRONG') s.bold = true; if (t === 'I' || t === 'EM') s.italics = true; if (t === 'U') s.underline = {}; if (t === 'SUB') s.subScript = true; if (t === 'SUP') s.superScript = true;
    if (t === 'BR') { out.push(new D.TextRun({ break: 1 })); return; }
    if (t === 'IMG') { const r = await imgRun(n.getAttribute('src') || '', 380); if (r) out.push(r); return; }
    const isBlock = (t === 'DIV' || t === 'P' || t === 'LI');
    if (isBlock && out.length) out.push(new D.TextRun({ break: 1 }));
    for (const c of n.childNodes) await w(c, s);
  }
  for (const c of doc.body.childNodes) await w(c, base || {});
  return out;
}
async function imgRun(src, maxW) {
  if (!/^data:image\/(png|jpe?g|gif);base64,/i.test(src)) {
    if (/^data:image\//.test(src)) { src = await new Promise(r => { const i = new Image(); i.onload = () => { const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); r(c.toDataURL('image/png')); }; i.onerror = () => r(''); i.src = src; }); if (!src) return null; } else return null;
  }
  const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; }); if (!im) return null;
  const k = Math.min(1, maxW / im.width), b = atob(src.split(',')[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  const type = /^data:image\/png/i.test(src) ? 'png' : /^data:image\/gif/i.test(src) ? 'gif' : 'jpg';
  return new docx.ImageRun({ data: u, type, transformation: { width: Math.round(im.width * k), height: Math.round(im.height * k) } });
}
async function examDocx(ex, withKey) {
  const D = docx, L = layout(ex), ch = [], C = D.AlignmentType.CENTER, J = D.AlignmentType.JUSTIFIED;
  const p = PAPER[S.settings.paper] || PAPER.letter, tw = v => Math.round(v * 1440), textW = tw(p.w) - 2300;
  const T = (t, o = {}) => new D.TextRun({ text: String(t ?? ''), font: 'Arial', size: 22, ...o });
  const P = (c, o = {}) => new D.Paragraph({ children: c, spacing: { after: 0 }, ...o });
  const bd = { style: D.BorderStyle.SINGLE, size: 6, color: '000000', space: 3 };
  const box = (c, o = {}) => P(c, { border: { top: bd, bottom: bd, left: bd, right: bd }, spacing: { before: 60, after: 280 }, alignment: J, ...o });
  const gap = () => P([T('')], { spacing: { after: 120 } });
  if (ex.logo) { const lr = await imgRun(ex.logo, 80); if (lr) ch.push(P([lr], { alignment: D.AlignmentType.LEFT })); }
  schoolLines(ex).forEach(l => ch.push(P([T(l, { bold: true, size: 20 })], { alignment: C })));
  ch.push(P([T((ex.title || 'Examination').toUpperCase(), { bold: true })], { alignment: C, spacing: { before: 200 } }));
  if (ex.schoolYear) ch.push(P([T('School Year ' + ex.schoolYear, { bold: true, size: 21 })], { alignment: C }));
  if (ex.subject) ch.push(P([T(ex.subject.toUpperCase(), { bold: true })], { alignment: C, spacing: { before: 280, after: 280 } }));
  ch.push(P([T('Name: ______________________________')], { spacing: { before: 120 } }));
  const g = gradeNo(ex);
  ch.push(P([T((g ? g + ' - ' : 'Section: ') + '______________________________'), new D.TextRun({ children: [new D.Tab(), ex.date || ''], font: 'Arial', size: 22 })], { tabStops: [{ type: D.TabStopType.RIGHT, position: textW }], border: { bottom: { style: D.BorderStyle.SINGLE, size: 24, color: '000000', space: 6 } }, spacing: { after: 280 } }));
  if (ex.instr) ch.push(box([T('GENERAL INSTRUCTIONS: ', { bold: true }), T(ex.instr)]));
  const cell = (t, o = {}) => new D.TableCell({ children: [P([T(t, { bold: true, size: 20 })])], ...o });
  const R = (ht, c) => new D.TableRow({ height: { value: ht, rule: D.HeightRule.ATLEAST }, children: c });
  const hang = { left: 460, hanging: 460 };
  const optPars = async (list, imgs) => { const out = []; for (const [k, o] of list.entries()) { const r = [T(LET[k] + '.\t' + o)]; if (imgs && imgs[k]) { const ir = await imgRun(imgs[k], 200); if (ir) r.push(new D.TextRun({ break: 1 }), ir); } out.push(P(r, { indent: { left: 900, hanging: 400 }, tabStops: [{ type: D.TabStopType.LEFT, position: 900 }], keepNext: k < list.length - 1, spacing: { before: k ? 0 : 160 } })); } return out; };
  for (const [i, s] of L.secs.entries()) {
    ch.push(P([T('Test ' + (RN[i] || i + 1) + '. ' + s.title + (/[.:]$/.test(s.title) ? '' : '.') + ' ', { bold: true }), T(s.dir + ' '), T('(' + plural(s.pts, 'point') + ')', { italics: true })], { border: { top: bd, bottom: bd, left: bd, right: bd }, spacing: { before: 60, after: 280 }, keepNext: true }));
    for (const { t, leaves } of s.top) {
      const [hb, hr] = isGroup(t) ? groupHeadParts(L, t, leaves) : ['', ''];
      if (t.type === 'matching') {
        ch.push(P([T(hb + ' ', { bold: true }), T(hr)], { keepNext: true, spacing: { after: 120 } }));
        const rows = [new D.TableRow({ tableHeader: true, children: [cell('Column A', { width: { size: 58, type: D.WidthType.PERCENTAGE } }), cell('Column B')] })];
        const n = Math.max(leaves.length, (t.sopts || []).length);
        for (let r = 0; r < n; r++) { const q = leaves[r]; rows.push(new D.TableRow({ children: [new D.TableCell({ children: [P(q ? [T('____ ' + L.num[q.id][0] + '. '), ...(await htmlRuns(q.stem))] : [T('')])] }), new D.TableCell({ children: [P([T((t.sopts || [])[r] !== undefined ? LET[r] + '. ' + t.sopts[r] : '')])] })] })); }
        ch.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows }), gap());
        continue;
      }
      if (t.type === 'passage') {
        ch.push(P([T(hb + ' ', { bold: true }), T(hr)], { keepNext: true, spacing: { after: 120 } }));
        if (stripHTML(t.stem)) ch.push(box(await htmlRuns(t.stem), { keepNext: true }));
        else if (/<img/.test(t.stem || '')) ch.push(P(await htmlRuns(t.stem), { spacing: { after: 200 } }));
        const so = (t.sopts || []).filter(Boolean); so.forEach((o, k) => ch.push(P([T(LET[k] + '.\t' + o)], { indent: { left: 1250, hanging: 400 }, tabStops: [{ type: D.TabStopType.LEFT, position: 1250 }], spacing: { after: k === so.length - 1 ? 240 : 0 } })));
      }
      for (const q of leaves) {
        const n = L.num[q.id];
        if (q.type === 'prob') {
          ch.push(P([T(rg(n) + '.  ', { bold: true }), ...(await htmlRuns(q.stem)), T(' (' + plural(weight(q), 'point') + ')', { italics: true })], { keepNext: true, alignment: J, spacing: { after: 160 } }));
          ch.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [...(q.fbd ? [R(2000, [cell('Free-Body Diagram', { columnSpan: 2 })])] : []), R(1600, [cell('Given and Required', { width: { size: 34, type: D.WidthType.PERCENTAGE } }), cell('Complete Solution & Answer', { rowSpan: 2 })]), R(1600, [cell('Equation')])] }), gap());
          continue;
        }
        const lead = [T(n[0] + '.\t')], tabs = [{ type: D.TabStopType.LEFT, position: 460 }];
        if (q.type === 'morse') { const st = stripHTML(q.stem); ch.push(P([...lead, ...(st ? [...(await htmlRuns(q.stem)), new D.TextRun({ break: 1 })] : []), T('X: ', { bold: true }), T(q.x || ''), new D.TextRun({ break: 1 }), T('Y: ', { bold: true }), T(q.y || '')], { indent: hang, tabStops: tabs, spacing: { after: 280 }, keepLines: true })); continue; }
        if (q.type === 'ident') { ch.push(P([...lead, ...(await htmlRuns(q.stem)), T('  ____________________')], { indent: hang, tabStops: tabs, alignment: J, spacing: { after: 280 } })); continue; }
        if (q.type === 'match') { ch.push(P([...lead, ...(await htmlRuns(q.stem))], { indent: hang, tabStops: tabs, spacing: { after: 280 } })); continue; }
        ch.push(P([...lead, ...(await htmlRuns(q.stem))], { keepNext: true, indent: hang, tabStops: tabs, alignment: J }));
        if (q.type === 'cmc') (q.statements || []).forEach((s2, k) => ch.push(P([T(RN[k] + '.\t' + s2)], { indent: { left: 1700, hanging: 420 }, tabStops: [{ type: D.TabStopType.LEFT, position: 1700 }], keepNext: true, spacing: { before: k ? 0 : 160 } })));
        const op = await optPars(q.opts || [], q.oimg); ch.push(...op); ch.push(gap());
      }
    }
  }
  if (ex.endNote) String(ex.endNote).split('\n').forEach((l, k) => ch.push(P([T(l)], { alignment: C, spacing: { before: k ? 120 : 400 } })));
  if (withKey) {
    ch.push(P([T('ANSWER KEY', { bold: true, size: 26 })], { alignment: C, pageBreakBefore: true }), P([T(ex.title || '')], { alignment: C, spacing: { after: 200 } }));
    const rows = [new D.TableRow({ tableHeader: true, children: ['Item', 'Type', 'Answer', 'Bloom level'].map(x => cell(x)) })];
    L.leaves.forEach(q => rows.push(new D.TableRow({ children: [rg(L.num[q.id]), TYPE_SHORT[q.type], answerOf(q), BL[q.bloom]].map(x => new D.TableCell({ children: [P([T(x, { size: 20 })])] })) })));
    ch.push(new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows }));
  }
  const fs = 18;
  const footer = new D.Footer({ children: [new D.Paragraph({ tabStops: [{ type: D.TabStopType.RIGHT, position: textW }], children: [new D.TextRun({ text: ex.subject || ex.title || '', italics: true, font: 'Times New Roman', size: fs }), new D.TextRun({ children: [new D.Tab()], size: fs }), new D.TextRun({ text: 'page ', italics: true, font: 'Times New Roman', size: fs }), new D.TextRun({ children: [D.PageNumber.CURRENT], font: 'Times New Roman', size: fs, bold: true, italics: true }), new D.TextRun({ text: ' of ', italics: true, font: 'Times New Roman', size: fs }), new D.TextRun({ children: [D.PageNumber.TOTAL_PAGES], font: 'Times New Roman', size: fs, bold: true, italics: true })] })] });
  return D.Packer.toBlob(new D.Document({ creator: 'Jin Assessment Studio', title: ex.title, sections: [{ properties: { page: { size: { width: tw(p.w), height: tw(p.h) }, margin: { top: 1000, right: 1150, bottom: 1000, left: 1150, footer: 500 } } }, footers: { default: footer }, children: ch }] }));
}
ACT['export-docx'] = async () => {
  const ex = curExam(); if (!ex || !ex.items.length) return toast('Add questions before exporting.', 'info');
  try { toast('Preparing Word file…', 'info', 1500); const withKey = !!($('#pv-key') && $('#pv-key').checked); const blob = await examDocx(ex, withKey); await saveOut(safeName(ex.title, 'exam') + '.docx', new Uint8Array(await blob.arrayBuffer()), [{ name: 'Word document', extensions: ['docx'] }], 'Word file'); }
  catch (e) { console.error(e); toast('Word export failed: ' + e.message, 'error'); }
};

/* ---------- sample exam ---------- */
ACT['load-sample'] = () => { const ex = curExam(); Sample.fill(ex); touch(); APP.examTab = 'builder'; App.go('exam'); toast('Sample exam loaded. Everything is editable.'); };
const Sample = {
  comps() {
    if (S.topics.length) return;
    S.topics = [
      { id: uid(), name: 'Electricity', comps: [{ id: uid(), text: 'Explain the relationship among current, voltage, and resistance (Ohm’s law)' }, { id: uid(), text: 'Calculate current, voltage, or resistance in simple circuits' }, { id: uid(), text: 'Interpret circuit diagrams with series and parallel connections' }] },
      { id: uid(), name: 'Forces and Motion', comps: [{ id: uid(), text: 'Describe motion in terms of speed, velocity, and acceleration' }, { id: uid(), text: 'Apply Newton’s laws of motion to everyday situations' }] }
    ];
  },
  fill(ex) {
    this.comps();
    const add = (o, inBank = false) => { const q = newQ(o.type || 'mc', o); q.inBank = inBank; S.qs.push(q); Classify.autoBloom(q); return q; };
    const items = [];
    items.push(add({ stem: 'Which statement best describes the relationship between current, voltage, and resistance in a simple circuit?', opts: ['Current increases as resistance increases.', 'Current equals voltage divided by resistance.', 'Voltage decreases when current is zero.', 'Resistance is measured in amperes.'], ans: 'B' }));
    items.push(add({ stem: 'A 12 V battery is connected to a 4 Ω resistor. What current flows through the circuit?', opts: ['0.3 A', '3 A', '8 A', '48 A'], ans: 'B' }));
    items.push(add({ stem: 'Which of the following is the SI unit of electrical resistance?', opts: ['Ampere', 'Volt', 'Ohm', 'Watt'], ans: 'C' }));
    items.push(add({ stem: 'Why does adding more bulbs in series make each bulb dimmer?', opts: ['The total resistance increases, so the current decreases.', 'The voltage of the battery increases.', 'Each bulb uses up the electrons.', 'Current flows faster through more bulbs.'], ans: 'A' }));
    items.push(add({ type: 'ident', stem: 'It is the rate of change of velocity of an object.', ansText: 'Acceleration' }));
    items.push(add({ type: 'ident', stem: 'It is the opposition to the flow of electric current in a conductor.', ansText: 'Resistance' }));
    items.push(add({ type: 'cmc', stem: 'Which of the following statements about a parallel circuit are true?', statements: ['Each branch receives the full source voltage.', 'Removing one bulb turns off all the others.', 'The total resistance is less than the smallest branch resistance.'], opts: ['I only', 'I and II only', 'I and III only', 'I, II, and III'], ans: 'C' }));
    items.push(add({ type: 'morse', x: 'An object moving at constant velocity has zero acceleration.', y: 'A heavier object always falls faster than a lighter one in a vacuum.', xt: true, yt: false, ans: 'A' }));
    const pass = add({ type: 'passage', head: 'refer to the situation below:', stem: 'A student builds a circuit with a 9.0 V battery and two resistors, 3.0 Ω and 6.0 Ω, connected in series. She measures the current with an ammeter placed between the two resistors.', kids: [] });
    [{ stem: 'Based on the situation, what is the total resistance of the circuit?', opts: ['2.0 Ω', '4.5 Ω', '9.0 Ω', '18 Ω'], ans: 'C' }, { stem: 'What would most likely happen to the ammeter reading if the 6.0 Ω resistor were replaced with a 3.0 Ω resistor?', opts: ['It would decrease.', 'It would increase.', 'It would stay the same.', 'It would drop to zero.'], ans: 'B' }].forEach(o => { const k = add({ ...o, parent: pass.id }); pass.kids.push(k.id); Classify.autoBloom(k); });
    items.push(pass);
    const mt = add({ type: 'matching', head: 'Match each quantity in Column A with its SI unit in Column B.', sopts: ['ampere', 'volt', 'ohm', 'newton', 'meter per second squared'], kids: [] });
    [['Electric current', 'A'], ['Force', 'D'], ['Acceleration', 'E']].forEach(([s, a]) => { const k = add({ type: 'match', stem: s, ans: a, parent: mt.id }); mt.kids.push(k.id); });
    items.push(mt);
    items.push(add({ type: 'prob', stem: 'A 1 200 kg car accelerates uniformly from rest to 24 m/s in 8.0 s. Calculate the net force acting on the car.', pts: 3, fbd: true, ansText: 'a = 3.0 m/s²; F = 3.6 × 10³ N' }));
    ex.items.push(...items.map(q => q.id));
    Classify.suggestComps(layout(ex).leaves, 'unassigned');
    /* a few bank items for reuse */
    add({ stem: 'Which statement best describes Ohm’s law?', opts: ['V = IR', 'P = IV', 'F = ma', 'W = Fd'], ans: 'A' }, true);
    add({ type: 'prob', stem: 'Calculate the resistance of a circuit that draws 0.50 A from a 6.0 V source.', pts: 2, ansText: '12 Ω' }, true);
    add({ stem: 'What is the speed of a runner who covers 100 m in 12.5 s?', opts: ['0.125 m/s', '8.0 m/s', '12.5 m/s', '1 250 m/s'], ans: 'B' }, true);
    Classify.suggestComps(bankItems().filter(isLeaf), 'unassigned');
    if (ex.title === 'Untitled Assessment') { ex.title = 'Quarter 2 Assessment (Sample)'; ex.subject = ex.subject || 'Science 9'; ex.grade = ex.grade || 'Grade 9 · A'; }
    ex.updated = nowISO();
  }
};

/* ---------- tabs, workflow, details ---------- */
ACT['exam-tab'] = b => { APP.examTab = b.dataset.tab; Exam.render(); window.scrollTo(0, 0); };
ACT['flow'] = b => {
  const k = b.dataset.step;
  if (k === 'overview' || k === 'tos') return App.go(k);
  if (k === 'preview') { APP.examTab = 'builder'; Exam.render(); return ACT.preview(); }
  APP.examTab = k; Exam.render(); window.scrollTo(0, 0);
};
ACT['toggle-details'] = () => {
  if (APP.examTab === 'builder') { const c = $('#details-card'); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); const i = c.querySelector('input'); if (i) i.focus({ preventScroll: true }); } return; }
  const w = $('#plan-details'); if (w) { w.hidden = !w.hidden; if (!w.hidden) { const i = w.querySelector('input'); if (i) i.focus(); } }
};

/* ---------- drag choices to reorder (pointer-based, works inside cards and the bank editor) ---------- */
function moveIndex(arr, from, to) { const a = (arr || []).slice(); const [x] = a.splice(from, 1); a.splice(to, 0, x); return a; }
function reorderChoices(q, field, from, to) {
  if (from === to) return;
  if (field === 'opts') {
    const ansIdx = q.ans ? LET.indexOf(q.ans) : -1, n = q.opts.length;
    const order = moveIndex([...Array(n).keys()], from, to);
    q.opts = order.map(i => q.opts[i]); q.oimg = order.map(i => (q.oimg || [])[i] || '');
    if (ansIdx > -1) q.ans = LET[order.indexOf(ansIdx)];
  } else if (field === 'sopts') {
    const n = q.sopts.length, order = moveIndex([...Array(n).keys()], from, to);
    q.sopts = order.map(i => q.sopts[i]);
    kidsOf(q).forEach(k => { if (k.type === 'match' && k.ans) { const i = LET.indexOf(k.ans); if (i > -1) k.ans = LET[order.indexOf(i)]; } });
  }
  touchQ(q);
}
const AutoScroll = {
  y: null, raf: 0, on: false,
  start() { this.on = true; const tick = () => { if (!this.on) return; const y = this.y; if (y != null) { const topZone = 175, botZone = 70, h = window.innerHeight; let d = 0; if (y < topZone) d = -Math.ceil((topZone - y) / 7); else if (y > h - botZone) d = Math.ceil((y - (h - botZone)) / 5); if (d) { window.scrollBy(0, d); const m = $('#modal-root.open'); if (m) m.scrollBy(0, d); } } this.raf = requestAnimationFrame(tick); }; cancelAnimationFrame(this.raf); this.raf = requestAnimationFrame(tick); },
  stop() { this.on = false; this.y = null; cancelAnimationFrame(this.raf); }
};
let optDrag = null;
document.addEventListener('mousedown', e => {
  const g = e.target.closest && e.target.closest('.ograb'); if (!g || e.button !== 0) return;
  const row = g.closest('.orow'), card = g.closest('.qcard'); if (!row || !card) return;
  e.preventDefault();
  const field = g.dataset.ograb, rows = $$(`:scope > .orow[data-orow]`, row.parentElement).filter(r => r.querySelector(`.ograb[data-ograb="${field}"]`));
  optDrag = { field, card, row, rows, from: +row.dataset.orow, to: +row.dataset.orow };
  row.classList.add('odrag'); document.body.classList.add('dragging-opt'); AutoScroll.start();
});
document.addEventListener('mousemove', e => {
  if (!optDrag) return; AutoScroll.y = e.clientY;
  let to = optDrag.rows.length - 1;
  for (let i = 0; i < optDrag.rows.length; i++) { const r = optDrag.rows[i].getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { to = i; break; } }
  optDrag.to = to;
  optDrag.rows.forEach((r, i) => r.classList.toggle('odrop', i === to && to !== optDrag.from));
});
document.addEventListener('mouseup', () => {
  if (!optDrag) return; const d = optDrag; optDrag = null; AutoScroll.stop();
  document.body.classList.remove('dragging-opt'); d.rows.forEach(r => r.classList.remove('odrag', 'odrop'));
  if (d.to === d.from) return;
  const q = Q(d.card.dataset.id); if (!q) return;
  reorderChoices(q, d.field, d.from, d.to);
  if (d.field === 'sopts') Exam.rerender(); else Exam.rerenderCard(q);
  refreshMetaSoon();
});
/* auto-scroll while dragging whole question cards near the top or bottom edge */
document.addEventListener('dragstart', () => { if (dragId || true) AutoScroll.start(); }, true);
document.addEventListener('dragover', e => { AutoScroll.y = e.clientY; });
document.addEventListener('dragend', () => AutoScroll.stop(), true);
document.addEventListener('drop', () => AutoScroll.stop(), true);

/* ---------- Bloom classification report (Original Bloom's Taxonomy, 1956) ---------- */
function bloomRows(ex) {
  const L = layout(ex);
  return L.leaves.map(q => {
    const r = Classify.infoFor(q), manual = !!q.bloomManual;
    const text = Classify.textOf(q) + ((q.type === 'mc' || q.type === 'cmc') && (q.opts || []).length ? '  [' + q.opts.map((o, i) => LET[i] + '. ' + o).join('  ') + ']' : '');
    return { num: rg(L.num[q.id]), text, level: BL[q.bloom], op: manual && q.bloom !== r.l ? Classify.OPS[q.bloom] : r.op, why: manual ? (q.bloom === r.l ? 'Confirmed by teacher. ' + r.why : 'Set by teacher. Jin’s analysis suggested ' + BL[r.l] + ': ' + r.why) : r.why, evidence: r.evidence.join(' ') || '—', conf: manual ? 'Teacher-set' + (q.bloom === r.l ? ' (agrees with analysis, ' + r.conf + ')' : '') : r.conf + (r.provisional ? ' — provisional' : ''), id: q.id };
  });
}
ACT['bloom-report'] = () => {
  const ex = curExam(); if (!ex || !ex.items.length) return toast('Add questions first.', 'info');
  const rows = bloomRows(ex), counts = BL.map((b, i) => rows.filter(r => r.level === b).length);
  modal(`<h3>Bloom classification report</h3><div class="hint">Original Bloom’s Taxonomy (1956): Knowledge → Comprehension → Application → Analysis → Synthesis → Evaluation. Each level is based on the cognitive process the question requires, not on its command verb. Difficulty is not the same as cognitive level.</div>
    <div class="row" style="margin:10px 0">${BL.map((b, i) => `<span class="tag ${counts[i] ? 'gold' : 'gray'}">${b}: ${counts[i]}</span>`).join('')}<span class="spacer"></span><button class="btn sm" id="br-xlsx">${icon('download')}Excel</button><button class="btn sm" id="br-docx">${icon('file')}Word</button></div>
    <div style="max-height:60vh;overflow:auto;border:1px solid #e3e9f2;border-radius:10px"><table class="review-table"><thead><tr><th>No.</th><th style="min-width:220px">Original question</th><th>Level</th><th>Cognitive operation</th><th style="min-width:220px">Explanation</th><th style="min-width:160px">Evidence</th><th>Confidence</th></tr></thead>
    <tbody>${rows.map(r => `<tr><td><b>${r.num}</b></td><td>${esc(r.text)}</td><td><span class="tag gold">${r.level}</span></td><td>${esc(r.op)}</td><td>${esc(r.why)}</td><td>${esc(r.evidence)}</td><td>${esc(r.conf)}</td></tr>`).join('')}</tbody></table></div>`, { size: 'wide' });
  $('#br-xlsx').onclick = async () => {
    const data = [[{ v: 'Bloom classification report — ' + ex.title, s: 6 }], ['Original Bloom’s Taxonomy (1956)'], [''], ['Question number', 'Original question', 'Assigned level', 'Cognitive operation required', 'Explanation of classification', 'Evidence from the question', 'Confidence'].map(v => ({ v, s: 2 })), ...rows.map(r => [r.num, r.text, r.level, r.op, r.why, r.evidence, r.conf].map(v => ({ v, s: 3 })))];
    await saveOut('Bloom Report - ' + safeName(ex.title) + '.xlsx', Office.xlsx([{ name: 'Bloom report', rows: data, widths: [10, 60, 16, 34, 60, 40, 22], freeze: 'A5' }]), [{ name: 'Excel workbook', extensions: ['xlsx'] }], 'Bloom report');
  };
  $('#br-docx').onclick = async () => {
    try {
      const D = docx, T = (t, o = {}) => new D.TextRun({ text: String(t), font: 'Arial', size: 18, ...o }), P = (c, o = {}) => new D.Paragraph({ children: c, ...o });
      const head = ['No.', 'Original question', 'Level', 'Cognitive operation', 'Explanation', 'Evidence', 'Confidence'];
      const table = new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [new D.TableRow({ tableHeader: true, children: head.map(h => new D.TableCell({ children: [P([T(h, { bold: true })])], shading: { fill: 'DCE9F7' } })) }), ...rows.map(r => new D.TableRow({ cantSplit: true, children: [r.num, r.text, r.level, r.op, r.why, r.evidence, r.conf].map(v => new D.TableCell({ children: [P([T(v)])] })) }))] });
      const doc = new D.Document({ sections: [{ properties: { page: { size: { width: 18720, height: 12240, orientation: D.PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children: [P([T('Bloom classification report — ' + ex.title, { bold: true, size: 26 })]), P([T('Original Bloom’s Taxonomy (1956)', { italics: true })]), table] }] });
      const blob = await D.Packer.toBlob(doc); await saveOut('Bloom Report - ' + safeName(ex.title) + '.docx', new Uint8Array(await blob.arrayBuffer()), [{ name: 'Word document', extensions: ['docx'] }], 'Bloom report');
    } catch (e) { toast('Word export failed: ' + e.message, 'error'); }
  };
};
