/* Jin Assessment Studio — TOS (Table of Specifications), school format: cells hold item numbers */
'use strict';
const TOS_PRINT_CSS = `.tosdoc{font:10pt/1.3 Arial,Helvetica,sans-serif;color:#000}
.tosdoc table{border-collapse:collapse;width:100%}.tosdoc td,.tosdoc th{border:1px solid #6f8297;padding:4px 6px;vertical-align:middle;text-align:center;font-size:9.5pt}
.tosdoc .hd td{border-color:#6f8297}.tosdoc .logo{width:1.1in;text-align:center}.tosdoc .logo img{max-height:.95in;max-width:1in}
.tosdoc .sch{color:#1f4e78;font-weight:bold;font-size:13pt;text-align:right;border:0}.tosdoc .bar{background:#1f4e78;color:#fff;font-weight:bold;font-size:14pt;text-align:right}
.tosdoc .cream{background:#fff2cc}.tosdoc .navy th,.tosdoc th.navy{background:#1f4e78;color:#fff;font-weight:bold;font-size:9.5pt}
.tosdoc td.l,.tosdoc th.l{text-align:left}.tosdoc tr.topic td{border-left:0;border-right:0;text-align:left;font-weight:bold;font-size:11.5pt;padding-top:8px}
.tosdoc .tot td,.tosdoc .tot th{background:#d9eaf7;font-weight:bold}.tosdoc .note{font-style:italic;font-size:8.5pt;color:#444;border:1px solid #9fb1c6;background:#f4f7fb;padding:4px 6px;margin:6px 0 14px}
.tosdoc .sp{height:12px}.tosdoc .sig td{border:1px solid #9fb1c6;font-size:9pt}.tosdoc .sig .lab{text-align:left;font-weight:normal;border:0}.tosdoc .sig .pn{background:#d9eaf7;font-weight:bold}
.tosdoc .guide td{font-size:9pt}.tosdoc .guide .gl{background:#1f4e78;color:#fff;font-weight:bold}.tosdoc .gtext{font-style:italic;font-size:8.5pt;margin-top:4px}
.tosdoc tr{page-break-inside:avoid}`;
const TOS_GUIDE = 'Knowledge: recall facts or formulas  •  Comprehension: explain or interpret  •  Application: use learning in a new situation  •  Analysis: examine relationships or errors  •  Synthesis: combine ideas into a plan or model  •  Evaluation: defend a judgment using evidence';
/* "1, 2, 41-45" → numbers; non-numeric entries still count as one item each (like the Excel template) */
function parseNums(text) {
  const parts = String(text || '').split(/[,;]+/).map(s => s.trim()).filter(Boolean); const nums = []; let count = 0;
  parts.forEach(p => { const m = p.match(/^(\d+)\s*[-–]\s*(\d+)$/); if (m && +m[2] >= +m[1] && +m[2] - +m[1] < 200) { for (let n = +m[1]; n <= +m[2]; n++) nums.push(n); count += +m[2] - +m[1] + 1; } else { count++; if (/^\d+$/.test(p)) nums.push(+p); } });
  return { nums, count };
}
const normCell = t => parseNums(t).nums.sort((a, b) => a - b).join(',') + '|' + parseNums(t).count;
const Tos = {
  key() { const ex = curExam(); return ex ? ex.id : '_free'; },
  get() {
    const k = this.key();
    if (!S.tos[k]) S.tos[k] = { rows: [], generatedAt: null, header: {} };
    const t = S.tos[k]; t.header = t.header || {};
    const h = t.header; if (h.prepared && !h.preparedName) h.preparedName = h.prepared; if (h.checked && !h.checkedName) h.checkedName = h.checked; if (h.noted && !h.notedName) h.notedName = h.noted;
    if (!t.rows.length) for (let i = 0; i < 5; i++) t.rows.push(this.blankRow());
    t.rows.forEach(r => { r.cells = r.cells || {}; TOSCOLS.forEach(c => { if (r.cells[c.k] === undefined) r.cells[c.k] = ''; }); r.kind = r.kind || 'comp'; });
    return t;
  },
  blankRow(label = '', kind = 'comp') { const cells = {}; TOSCOLS.forEach(c => cells[c.k] = ''); return { id: uid(), kind, label, compId: null, cells, genCells: null }; },
  totals(t) {
    const col = Object.fromEntries(TOSCOLS.map(c => [c.k, 0])); let grand = 0; const allNums = [];
    const rows = t.rows.map(r => { if (r.kind === 'topic') return 0; let s = 0; TOSCOLS.forEach(c => { const p = parseNums(r.cells[c.k]); col[c.k] += p.count; s += p.count; allNums.push(...p.nums); }); grand += s; return s; });
    const seen = {}, dups = [...new Set(allNums.filter(n => (seen[n] = (seen[n] || 0) + 1) > 1))].sort((a, b) => a - b);
    return { col, grand, rows, dups, pct: v => grand ? v / grand * 100 : 0 };
  },
  generate(ex) {
    const L = layout(ex), rows = [], used = new Set();
    const cellsFor = filter => { const cells = Object.fromEntries(TOSCOLS.map(c => [c.k, []])); L.leaves.filter(filter).forEach(q => { const col = TOSCOLS.find(c => c.b === q.bloom) || TOSCOLS[0]; const a = L.num[q.id]; for (let n = a[0]; n <= a[1]; n++) cells[col.k].push(n); used.add(q.id); }); TOSCOLS.forEach(c => cells[c.k] = cells[c.k].sort((x, y) => x - y).join(', ')); return cells; };
    const mk = (label, compId, filter) => { const r = this.blankRow(label); r.compId = compId; r.cells = cellsFor(filter); r.genCells = { ...r.cells }; rows.push(r); };
    const topics = S.topics.filter(t => t.comps.some(c => c.text.trim()));
    topics.forEach((t, i) => { rows.push(this.blankRow((RN[i] || i + 1) + '. ' + (t.name || 'Topic'), 'topic')); t.comps.filter(c => c.text.trim()).forEach(c => mk(c.text, c.id, q => q.comp === c.id)); });
    const rest = L.leaves.filter(q => !used.has(q.id));
    if (rest.length || !rows.length) mk(rows.length ? '(No competency assigned)' : 'All items', null, q => !used.has(q.id));
    while (rows.filter(r => r.kind === 'comp').length < 5) { const r = this.blankRow(); r.genCells = { ...r.cells }; rows.push(r); }
    const t = this.get(); t.rows = rows; t.generatedAt = nowISO(); return t;
  },
  render() {
    const el = $('#screen-tos'), ex = curExam(), t = this.get(), T = this.totals(t), h = t.header;
    const C = ex ? examChecks(ex) : null;
    const edited = t.rows.reduce((n, r) => n + (r.genCells ? TOSCOLS.filter(c => normCell(r.cells[c.k]) !== normCell(r.genCells[c.k])).length : 0), 0);
    const mismatch = ex && t.generatedAt && C.points !== T.grand;
    const F = (k, label, val, ph = '') => `<label class="field">${label}<input data-tosh="${k}" value="${esc(val || '')}" placeholder="${esc(ph)}"></label>`;
    let compN = 0;
    el.innerHTML = `<div class="toolbar"><div class="tabtitle">TOS</div><span class="tiny">Table of Specifications — type item numbers in each cell, separated by commas (e.g., 1, 2, 41-45).</span>
        <button class="btn" data-a="tos-preview">${icon('eye')}Preview</button>
        <div class="dd"><button class="btn gold" data-dd="dd-tosx">Export TOS ${icon('down')}</button><div class="ddm right" id="dd-tosx"><button class="mi" data-a="tos-pdf">${icon('file')}PDF (landscape)</button><button class="mi" data-a="tos-docx">${icon('file')}Word (.docx)</button><button class="mi" data-a="tos-xlsx">${icon('file')}Excel (.xlsx)</button></div></div></div>
      ${ex ? `<div class="infobox">${icon('grid')}<span style="flex:1">Linked to <b>${esc(ex.title)}</b> (${plural(C.items, 'question')}, item numbers ${L_range(ex)}). ${t.generatedAt ? 'Filled from the exam ' + fmtWhen(t.generatedAt) + '.' : 'Generate to fill each cell with the item numbers from the exam’s competencies and Bloom levels.'}${edited ? ` You changed ${plural(edited, 'cell')} after generating (shown in red).` : ''}</span><button class="btn blue sm" data-a="gen-tos">${icon('refresh')}${t.generatedAt ? 'Regenerate from exam' : 'Generate from exam'}</button></div>` : `<div class="infobox">${icon('grid')}<span>No exam is open, so this table is standalone.</span></div>`}
      ${mismatch ? `<div class="warnbox">${icon('spark')}<span>The table lists <b>${T.grand}</b> item numbers, but the exam has <b>${C.points}</b>. Regenerate, or fix the cells so they match.</span></div>` : ''}
      ${T.dups.length ? `<div class="warnbox">${icon('spark')}<span>Item number${T.dups.length > 1 ? 's' : ''} <b>${T.dups.slice(0, 12).join(', ')}</b> appear${T.dups.length > 1 ? '' : 's'} in more than one cell.</span></div>` : ''}
      <div class="card"><div class="cardhead"><h2>Header</h2><span class="tiny">Printed at the top of the TOS. Subject and school year come from the exam details.</span></div><div class="details">
        ${F('school', 'School', h.school || (ex && ex.school ? schoolLines(ex).join(' ') : '') || S.settings.school, 'e.g., Miriam College High School')}${F('strand', 'Subject Area/Strand', h.strand || (ex && ex.strand), 'e.g., Science')}${F('course', 'Subject/Course', h.course || (ex && ex.subject), 'e.g., Program of Excellence in Science 9')}
        ${F('quarter', 'Quarter', h.quarter || (ex && ex.quarter), 'e.g., Second')}${F('sy', 'School Year', h.sy || (ex && ex.schoolYear), 'e.g., 2026–2027')}</div></div>
      <div class="card tos-card"><div class="cardhead"><div><h2>Competency distribution</h2><span class="tiny">Starts with five competency rows. Topic headings print in bold across the table.</span></div><span class="right row"><button class="btn sm" data-a="tos-add-topic">${icon('plus')}Add topic heading</button><button class="btn blue sm" data-a="tos-add">${icon('plus')}Add competency row</button></span></div>
        <div class="table-wrap"><table class="tos-table" id="tos-table"><thead><tr><th class="competency-col">INSTRUCTIONAL OBJECTIVE / COMPETENCY</th>${TOSCOLS.map(c => `<th title="${c.n}">${c.k}</th>`).join('')}<th>TOTAL<br>ITEMS</th><th>%</th><th class="action-col"></th></tr></thead>
          <tbody>${t.rows.map((r, i) => r.kind === 'topic' ? `<tr class="topic-row" data-row="${r.id}"><td colspan="9"><input type="text" data-tos="label" value="${esc(r.label)}" placeholder="Topic heading, e.g., I. Fossils and the Geologic Timescale"></td><td><button class="remove-row" data-a="tos-del" title="Remove topic heading">${icon('x')}</button></td></tr>` : `<tr data-row="${r.id}"><td><input type="text" data-tos="label" value="${esc(r.label)}" placeholder="Enter learning competency ${++compN}" aria-label="Competency"></td>${TOSCOLS.map(c => { const v = r.cells[c.k] || '', changed = r.genCells && normCell(v) !== normCell(r.genCells[c.k]); return `<td class="count-cell"><input type="text" class="cellnums${changed ? ' diff' : ''}" data-tos="${c.k}" value="${esc(v)}" title="${c.n}${changed ? ' · changed from “' + (r.genCells[c.k] || 'empty') + '”' : ''}" aria-label="${c.k} item numbers"></td>`; }).join('')}<td data-rt>${T.rows[i]}</td><td data-rp>${T.pct(T.rows[i]).toFixed(1)}%</td><td><button class="remove-row" data-a="tos-del" title="Remove competency row" aria-label="Remove competency row">${icon('x')}</button></td></tr>`).join('')}</tbody>
          <tfoot><tr><th colspan="7" style="text-align:center">GRAND TOTAL</th><th id="tos-grand">${T.grand}</th><th id="tos-gpct">${T.grand ? '100.0' : '0.0'}%</th><th></th></tr></tfoot></table></div>
        <div class="tos-bottom"><div><b>Cognitive sub-domains — Original Bloom’s Taxonomy (1956)</b><span>K · Knowledge　 C · Comprehension　 AN · Analysis　 AP · Application　 S · Synthesis　 E · Evaluation</span></div><button class="link" data-a="tos-recalc">Recalculate totals ↻</button></div>
        <div class="table-wrap"><table class="tos-table summary-table"><thead><tr><th>COGNITIVE SUB-DOMAINS</th>${TOSCOLS.map(c => `<th>${c.k}</th>`).join('')}<th>TOTAL</th><th>%</th></tr></thead><tbody>
          <tr><th>TOTAL NUMBER OF ITEMS</th>${TOSCOLS.map(c => `<td data-sum="${c.k}">${T.col[c.k]}</td>`).join('')}<td data-sum="total">${T.grand}</td><td>100%</td></tr>
          <tr><th>PERCENTAGE TOTAL</th>${TOSCOLS.map(c => `<td data-pct="${c.k}">${T.pct(T.col[c.k]).toFixed(1)}%</td>`).join('')}<td>100%</td><td>100%</td></tr></tbody></table></div>
      </div>
      ${ex ? Planner.tosCompareHTML(ex) : ''}
      <div class="card"><div class="cardhead"><h2>Signatories</h2></div>
        <div class="details">${F('preparedName', 'Prepared by — printed name', h.preparedName || (ex && ex.teacher) || S.settings.teacher)}${F('preparedDate', 'Prepared — date', h.preparedDate)}<span></span>
        ${F('checkedName', 'Checked — name', h.checkedName)}${F('checkedTitle', 'Checked — title', h.checkedTitle, 'e.g., Subject Area/Strand Supervisor')}${F('checkedDate', 'Checked — date', h.checkedDate)}
        ${F('notedName', 'Noted — name', h.notedName)}${F('notedTitle', 'Noted — title', h.notedTitle, 'e.g., Assistant Principal for Academic Affairs')}${F('notedDate', 'Noted — date', h.notedDate)}</div></div>`;
  },
  recalc() {
    const t = this.get(), T = this.totals(t), tb = $('#tos-table'); if (!tb) return;
    t.rows.forEach((r, i) => { const tr = tb.querySelector(`tr[data-row="${r.id}"]`); if (!tr || r.kind === 'topic') return; tr.querySelector('[data-rt]').textContent = T.rows[i]; tr.querySelector('[data-rp]').textContent = T.pct(T.rows[i]).toFixed(1) + '%'; });
    $('#tos-grand').textContent = T.grand; $('#tos-gpct').textContent = (T.grand ? 100 : 0).toFixed(1) + '%';
    TOSCOLS.forEach(c => { $(`[data-sum="${c.k}"]`).textContent = T.col[c.k]; $(`[data-pct="${c.k}"]`).textContent = T.pct(T.col[c.k]).toFixed(1) + '%'; });
    $('[data-sum="total"]').textContent = T.grand;
  },
  hdr() { const ex = curExam(), h = this.get().header; return { school: h.school || (ex && ex.school ? schoolLines(ex).join(' ') : '') || S.settings.school || '', strand: h.strand || (ex && ex.strand) || '', course: h.course || (ex && ex.subject) || '', quarter: h.quarter || (ex && ex.quarter) || '', sy: h.sy || (ex && ex.schoolYear) || '', logo: ex && ex.logo, preparedName: h.preparedName || (ex && ex.teacher) || S.settings.teacher || '', preparedDate: h.preparedDate || '', checkedName: h.checkedName || '', checkedTitle: h.checkedTitle || '', checkedDate: h.checkedDate || '', notedName: h.notedName || '', notedTitle: h.notedTitle || '', notedDate: h.notedDate || '' }; },
  printHTML() {
    const t = this.get(), T = this.totals(t), H = this.hdr(), cols = TOSCOLS.map(c => `<th>${c.k}</th>`).join('');
    let b = `<div class="tosdoc"><table class="hd"><tr><td class="logo" rowspan="4">${H.logo ? `<img src="${H.logo}" alt="">` : ''}</td><td colspan="3" class="sch">${esc(H.school.toUpperCase())}</td></tr>
      <tr><td colspan="3" class="bar">TABLE OF SPECIFICATIONS</td></tr>
      <tr><td class="cream"><b>Subject Area/Strand: ${esc(H.strand)}</b></td><td class="cream"><b>Subject/Course: ${esc(H.course)}</b></td><td class="cream"><b>Quarter: ${esc(H.quarter)}</b></td></tr>
      <tr><td colspan="3" style="text-align:right;font-weight:bold;font-size:11pt;border-left:0;border-right:0">${H.sy ? 'School Year ' + esc(H.sy) : ''}</td></tr></table><div class="sp"></div>
      <table><tr class="navy"><th class="l" style="width:34%">INSTRUCTIONAL OBJECTIVE / COMPETENCY</th>${cols}<th>TOTAL ITEMS</th><th>%</th></tr>`;
    t.rows.forEach((r, i) => {
      if (r.kind === 'topic') { if (r.label.trim()) b += `<tr class="topic"><td colspan="9">${esc(r.label)}</td></tr>`; return; }
      b += `<tr><td class="l">${esc(r.label)}</td>${TOSCOLS.map(c => `<td class="cream">${esc(r.cells[c.k] || '')}</td>`).join('')}<td>${T.rows[i] || ''}</td><td>${T.rows[i] ? T.pct(T.rows[i]).toFixed(1) + '%' : ''}</td></tr>`;
    });
    b += `<tr class="tot"><th colspan="7">GRAND TOTAL</th><th>${T.grand}</th><th>${T.grand ? '100%' : ''}</th></tr></table><div class="sp"></div>
      <table><tr class="navy"><th>COGNITIVE SUB-DOMAINS</th>${cols}<th>TOTAL</th><th>%</th></tr>
      <tr class="tot"><th>TOTAL NUMBER OF ITEMS</th>${TOSCOLS.map(c => `<td>${T.col[c.k]}</td>`).join('')}<td>${T.grand}</td><td>100.0%</td></tr>
      <tr><th style="font-weight:bold">PERCENTAGE TOTAL</th>${TOSCOLS.map(c => `<td><b>${T.pct(T.col[c.k]).toFixed(1)}%</b></td>`).join('')}<td><b>100.0%</b></td><td><b>100.0%</b></td></tr></table>
      <div class="note">Item numbers are listed in each cell. Totals count the item numbers.</div>
      <table class="sig"><tr><td class="lab" colspan="2">Prepared by:</td><td class="lab">Checked:</td><td class="lab">Noted:</td></tr>
      <tr><td class="pn">PRINTED NAME</td><td class="pn">SIGNATURE</td><td rowspan="2" style="height:.8in"><b>${esc(H.checkedName)}</b>${H.checkedTitle ? '<br>' + esc(H.checkedTitle) : ''}</td><td rowspan="2"><b>${esc(H.notedName)}</b>${H.notedTitle ? '<br>' + esc(H.notedTitle) : ''}</td></tr>
      <tr><td style="height:.5in"><b>${esc(H.preparedName)}</b></td><td></td></tr>
      <tr><td colspan="2" class="l">Date: ${esc(H.preparedDate)}</td><td class="l">Date: ${esc(H.checkedDate)}</td><td class="l">Date: ${esc(H.notedDate)}</td></tr></table><div class="sp"></div>
      <table class="guide"><tr><td class="gl">Cognitive-Level Guide</td>${['Knowledge', 'Comprehension', 'Analysis', 'Application', 'Synthesis', 'Evaluation'].map(n => `<td class="gl">${n}</td>`).join('')}</tr></table><div class="gtext">${esc(TOS_GUIDE)}</div></div>`;
    return b;
  },
  fileBase() { const ex = curExam(); return 'TOS - ' + safeName(ex ? ex.title : 'Table of Specifications'); }
};
function L_range(ex) { const L = layout(ex); return L.total ? L.start + '–' + (L.start + L.total - 1) : 'none yet'; }
document.addEventListener('input', e => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.tos) {
    const T = Tos.get(), r = T.rows.find(x => x.id === t.closest('tr').dataset.row); if (!r) return;
    if (t.dataset.tos === 'label') r.label = t.value;
    else { r.cells[t.dataset.tos] = t.value; if (r.genCells) t.classList.toggle('diff', normCell(t.value) !== normCell(r.genCells[t.dataset.tos])); Tos.recalc(); }
    touch();
  } else if (t.dataset.tosh) { Tos.get().header[t.dataset.tosh] = t.value; touch(); }
});
ACT['tos-add'] = () => { Tos.get().rows.push(Tos.blankRow()); touch(); Tos.render(); const ins = $$('#tos-table tr:not(.topic-row) [data-tos=label]'); ins[ins.length - 1].focus(); };
ACT['tos-add-topic'] = () => { const t = Tos.get(), n = t.rows.filter(r => r.kind === 'topic').length; t.rows.push(Tos.blankRow((RN[n] || n + 1) + '. ', 'topic')); touch(); Tos.render(); const ins = $$('#tos-table tr.topic-row [data-tos=label]'); const i = ins[ins.length - 1]; i.focus(); i.setSelectionRange(99, 99); };
ACT['tos-del'] = b => { const T = Tos.get(); T.rows = T.rows.filter(r => r.id !== b.closest('tr').dataset.row); touch(); Tos.render(); };
ACT['tos-recalc'] = () => { Tos.render(); toast('Totals recalculated.'); };
ACT['gen-tos'] = async () => {
  const ex = curExam(); if (!ex) return toast('Open or create an exam first.', 'info');
  if (!ex.items.length) return toast('Add questions to the exam first.', 'info');
  const t = Tos.get(); const hasData = t.rows.some(r => (r.kind === 'comp' && r.label.trim()) || TOSCOLS.some(c => (r.cells[c.k] || '').trim()));
  const edited = t.rows.some(r => r.genCells && TOSCOLS.some(c => normCell(r.cells[c.k]) !== normCell(r.genCells[c.k])));
  if (hasData && (edited || !t.generatedAt) && !(await confirmDlg({ title: edited ? 'Replace your edited cells?' : 'Replace the current table?', msg: 'Generating rebuilds the rows from the exam’s competencies and Bloom levels, writing the item numbers in each cell.', ok: 'Generate' }))) return;
  const L = layout(ex), noComp = L.leaves.filter(q => !q.comp).length;
  Tos.generate(ex); touch(); App.go('tos');
  toast(noComp ? `TOS generated. ${plural(noComp, 'item')} without a competency are listed in one row.` : 'TOS generated with item numbers from the exam.', noComp ? 'info' : 'ok', 5000);
};
ACT['tos-preview'] = () => {
  modal(`<h3>TOS preview</h3><div class="row" style="margin:8px 0"><span class="spacer"></span><button class="btn" data-a="tos-docx">Word</button><button class="btn" data-a="tos-xlsx">Excel</button><button class="btn gold" data-a="tos-pdf">${icon('download')}Save PDF</button></div><div class="preview-wrap"><div class="preview-page landscape" id="tpv"></div></div>`, { size: 'wide' });
  const pg = $('#tpv'), sh = pg.attachShadow({ mode: 'open' }); sh.innerHTML = `<style>${TOS_PRINT_CSS}</style>` + Tos.printHTML();
};
ACT['tos-pdf'] = async () => {
  const p = PAPER[S.settings.paper] || PAPER.letter;
  const r = await Host.printToPDF(printDoc(Tos.printHTML(), 'TOS', true), { defaultName: Tos.fileBase() + '.pdf', pageSize: { width: p.w, height: p.h }, landscape: true, footer: 'TOS — ' + (Tos.hdr().course || ''), margins: { top: 0.5, bottom: 0.6, left: 0.5, right: 0.5 } });
  if (r && r.canceled) return; if (r && r.ok === false) return toast('PDF export failed: ' + r.error, 'error');
  toast('Tip: in the print dialog, set Destination to “Save as PDF”.', 'info');
};
ACT['tos-xlsx'] = async () => {
  const t = Tos.get(), T = Tos.totals(t), H = Tos.hdr();
  /* styles: 7 navy header, 8 cream cell, 9 light-blue total, 10 topic, 11 school title, 12 left bordered, 13 italic note, 14 TOS bar */
  const rows = [['', { v: H.school.toUpperCase(), s: 11 }], ['', { v: 'TABLE OF SPECIFICATIONS', s: 14 }, ...Array(7).fill({ v: '', s: 14 })], ['', { v: 'Subject Area/Strand:  ' + H.strand, s: 8 }, { v: '', s: 8 }, { v: '', s: 8 }, { v: 'Subject/Course: ' + H.course, s: 8 }, { v: '', s: 8 }, { v: 'Quarter:  ' + H.quarter, s: 8 }, { v: '', s: 8 }, { v: '', s: 8 }], ['', { v: H.sy ? 'School Year ' + H.sy : '', s: 1 }], [''],
    [{ v: 'INSTRUCTIONAL OBJECTIVE / COMPETENCY', s: 7 }, ...TOSCOLS.map(c => ({ v: c.k, s: 7 })), { v: 'TOTAL ITEMS', s: 7 }, { v: '%', s: 7 }]];
  const merges = ['A1:A4', 'B1:I1', 'B2:I2', 'B3:D3', 'E3:F3', 'G3:I3', 'B4:I4'];
  t.rows.forEach((r, i) => {
    if (r.kind === 'topic') { if (!r.label.trim()) return; rows.push([{ v: r.label, s: 10 }]); merges.push(`A${rows.length}:I${rows.length}`); return; }
    rows.push([{ v: r.label, s: 12 }, ...TOSCOLS.map(c => ({ v: r.cells[c.k] || '', s: 8 })), { v: T.rows[i], s: 4 }, { v: T.rows[i] ? +(T.pct(T.rows[i])).toFixed(1) / 100 : 0, s: 15 }]);
  });
  rows.push([{ v: 'GRAND TOTAL', s: 9 }, ...Array(6).fill({ v: '', s: 9 }), { v: T.grand, s: 9 }, { v: T.grand ? 1 : 0, s: 16 }]); merges.push(`A${rows.length}:G${rows.length}`);
  rows.push([''], [''], [{ v: 'COGNITIVE SUB-DOMAINS', s: 7 }, ...TOSCOLS.map(c => ({ v: c.k, s: 7 })), { v: 'TOTAL', s: 7 }, { v: '%', s: 7 }],
    [{ v: 'TOTAL NUMBER OF ITEMS', s: 9 }, ...TOSCOLS.map(c => ({ v: T.col[c.k], s: 9 })), { v: T.grand, s: 9 }, { v: 1, s: 16 }],
    [{ v: 'PERCENTAGE TOTAL', s: 5 }, ...TOSCOLS.map(c => ({ v: T.grand ? +(T.pct(T.col[c.k])).toFixed(1) / 100 : 0, s: 16 })), { v: 1, s: 16 }, { v: 1, s: 16 }], ['']);
  rows.push([{ v: 'Item numbers are listed in each cell, separated by commas. Totals count the item numbers.', s: 13 }]); merges.push(`A${rows.length}:I${rows.length}`);
  rows.push(['']);
  const sr = rows.length + 1;
  rows.push([{ v: 'Prepared by:', s: 0 }, '', '', { v: 'Checked:', s: 0 }, '', '', { v: 'Noted:', s: 0 }], [{ v: 'PRINTED NAME', s: 9 }, { v: 'SIGNATURE', s: 9 }, { v: '', s: 9 }, { v: H.checkedName + (H.checkedTitle ? '\n' + H.checkedTitle : ''), s: 17 }, { v: '', s: 17 }, { v: '', s: 17 }, { v: H.notedName + (H.notedTitle ? '\n' + H.notedTitle : ''), s: 17 }, { v: '', s: 17 }, { v: '', s: 17 }], [{ v: H.preparedName, s: 12 }, { v: '', s: 12 }, { v: '', s: 12 }], [{ v: 'Date: ' + H.preparedDate, s: 12 }, '', '', { v: 'Date: ' + H.checkedDate, s: 12 }, '', '', { v: 'Date: ' + H.notedDate, s: 12 }], [''],
    [{ v: 'Cognitive-Level Guide', s: 7 }, ...['Knowledge', 'Comprehension', 'Analysis', 'Application', 'Synthesis', 'Evaluation'].map(v => ({ v, s: 7 }))], [{ v: TOS_GUIDE, s: 13 }]);
  merges.push(`A${sr}:C${sr}`, `D${sr}:F${sr}`, `G${sr}:I${sr}`, `B${sr + 1}:C${sr + 1}`, `D${sr + 1}:F${sr + 2}`, `G${sr + 1}:I${sr + 2}`, `B${sr + 2}:C${sr + 2}`, `A${sr + 3}:C${sr + 3}`, `D${sr + 3}:F${sr + 3}`, `G${sr + 3}:I${sr + 3}`, `A${sr + 6}:I${sr + 6}`);
  await saveOut(Tos.fileBase() + '.xlsx', Office.xlsx([{ name: 'TOS', rows, widths: [64, 18.5, 18.5, 18.5, 19.4, 18.5, 18.1, 14, 11], merges, landscape: true }]), [{ name: 'Excel workbook', extensions: ['xlsx'] }], 'TOS spreadsheet');
};
ACT['tos-docx'] = async () => {
  try {
    const D = docx, t = Tos.get(), T = Tos.totals(t), H = Tos.hdr(), FN = 'Arial', CEN = D.AlignmentType.CENTER;
    const TR = (x, o = {}) => new D.TextRun({ text: String(x ?? ''), font: FN, size: 19, ...o }), P = (c, o = {}) => new D.Paragraph({ children: c, spacing: { after: 0 }, ...o });
    const bd = { style: D.BorderStyle.SINGLE, size: 4, color: '6F8297' }, B = { top: bd, bottom: bd, left: bd, right: bd }, NB = { top: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
    const p = PAPER[S.settings.paper] || PAPER.letter, pw = Math.round(p.h * 1440) - 1440, W = [Math.round(pw * .34), ...Array(6).fill(Math.round(pw * .085)), Math.round(pw * .08), Math.round(pw * .07)];
    const cell = (c, i, o = {}) => new D.TableCell({ children: [P(String(c ?? '').split('\n').map((s, k) => TR(s, { ...(o.r || {}), ...(k ? { break: 1 } : {}) })), { alignment: o.left ? D.AlignmentType.LEFT : CEN })], width: { size: o.w || W[i], type: D.WidthType.DXA }, borders: o.nb ? NB : B, verticalAlign: D.VerticalAlign.CENTER, shading: o.fill ? { fill: o.fill } : undefined, columnSpan: o.span });
    const row = (c, o = {}) => new D.TableRow({ children: c, cantSplit: true, ...o }), NAV = { fill: '1F4E78', r: { bold: true, color: 'FFFFFF' } }, CR = { fill: 'FFF2CC' }, TOT = { fill: 'D9EAF7', r: { bold: true } };
    const head = new D.Table({ width: { size: pw, type: D.WidthType.DXA }, columnWidths: [Math.round(pw * .16), Math.round(pw * .28), Math.round(pw * .28), Math.round(pw * .28)], rows: [
      row([cell('', 0, { w: Math.round(pw * .16), nb: true }), cell(H.school.toUpperCase(), 1, { w: Math.round(pw * .84), span: 3, nb: true, r: { bold: true, size: 26, color: '1F4E78' } })]),
      row([cell('', 0, { w: Math.round(pw * .16), nb: true }), cell('TABLE OF SPECIFICATIONS', 1, { w: Math.round(pw * .84), span: 3, fill: '1F4E78', r: { bold: true, size: 28, color: 'FFFFFF' } })]),
      row([cell('', 0, { w: Math.round(pw * .16), nb: true }), cell('Subject Area/Strand: ' + H.strand, 1, { w: Math.round(pw * .28), ...CR, r: { bold: true } }), cell('Subject/Course: ' + H.course, 2, { w: Math.round(pw * .28), ...CR, r: { bold: true } }), cell('Quarter: ' + H.quarter, 3, { w: Math.round(pw * .28), ...CR, r: { bold: true } })]),
      row([cell('', 0, { w: Math.round(pw * .16), nb: true }), cell(H.sy ? 'School Year ' + H.sy : '', 1, { w: Math.round(pw * .84), span: 3, nb: true, r: { bold: true, size: 22 } })])] });
    const rows = [row([cell('INSTRUCTIONAL OBJECTIVE / COMPETENCY', 0, NAV), ...TOSCOLS.map((c, i) => cell(c.k, i + 1, NAV)), cell('TOTAL ITEMS', 7, NAV), cell('%', 8, NAV)], { tableHeader: true })];
    t.rows.forEach((r, i) => { if (r.kind === 'topic') { if (r.label.trim()) rows.push(row([cell(r.label, 0, { w: pw, span: 9, left: true, r: { bold: true, size: 23 } })])); return; } rows.push(row([cell(r.label, 0, { left: true }), ...TOSCOLS.map((c, j) => cell(r.cells[c.k] || '', j + 1, CR)), cell(T.rows[i] || '', 7), cell(T.rows[i] ? T.pct(T.rows[i]).toFixed(1) + '%' : '', 8)])); });
    rows.push(row([cell('GRAND TOTAL', 0, { ...TOT, w: W.slice(0, 7).reduce((a, b) => a + b, 0), span: 7 }), cell(T.grand, 7, TOT), cell(T.grand ? '100%' : '', 8, TOT)]));
    const main = new D.Table({ width: { size: pw, type: D.WidthType.DXA }, columnWidths: W, rows });
    const cg = new D.Table({ width: { size: pw, type: D.WidthType.DXA }, columnWidths: W, rows: [row([cell('COGNITIVE SUB-DOMAINS', 0, NAV), ...TOSCOLS.map((c, i) => cell(c.k, i + 1, NAV)), cell('TOTAL', 7, NAV), cell('%', 8, NAV)]), row([cell('TOTAL NUMBER OF ITEMS', 0, TOT), ...TOSCOLS.map((c, i) => cell(T.col[c.k], i + 1, TOT)), cell(T.grand, 7, TOT), cell('100.0%', 8, TOT)]), row([cell('PERCENTAGE TOTAL', 0, { r: { bold: true } }), ...TOSCOLS.map((c, i) => cell(T.pct(T.col[c.k]).toFixed(1) + '%', i + 1, { r: { bold: true } })), cell('100.0%', 7, { r: { bold: true } }), cell('100.0%', 8, { r: { bold: true } })])] });
    const q = Math.round(pw / 4);
    const sig = new D.Table({ width: { size: pw, type: D.WidthType.DXA }, columnWidths: [q, q, q, q], rows: [
      row([cell('Prepared by:', 0, { w: q * 2, span: 2, nb: true, left: true }), cell('Checked:', 2, { w: q, nb: true, left: true }), cell('Noted:', 3, { w: q, nb: true, left: true })]),
      row([cell('PRINTED NAME', 0, { w: q, ...TOT }), cell('SIGNATURE', 1, { w: q, ...TOT }), cell(H.checkedName + (H.checkedTitle ? '\n' + H.checkedTitle : ''), 2, { w: q, r: { bold: true } }), cell(H.notedName + (H.notedTitle ? '\n' + H.notedTitle : ''), 3, { w: q, r: { bold: true } })]),
      row([cell(H.preparedName, 0, { w: q, r: { bold: true } }), cell('', 1, { w: q }), cell('', 2, { w: q }), cell('', 3, { w: q })], { height: { value: 700, rule: D.HeightRule.ATLEAST } }),
      row([cell('Date: ' + H.preparedDate, 0, { w: q * 2, span: 2, left: true }), cell('Date: ' + H.checkedDate, 2, { w: q, left: true }), cell('Date: ' + H.notedDate, 3, { w: q, left: true })])] });
    const gw = Math.round(pw / 7), guide = new D.Table({ width: { size: pw, type: D.WidthType.DXA }, columnWidths: Array(7).fill(gw), rows: [row(['Cognitive-Level Guide', 'Knowledge', 'Comprehension', 'Analysis', 'Application', 'Synthesis', 'Evaluation'].map((n, i) => cell(n, 0, { w: gw, ...NAV })))] });
    const sp = () => P([TR('')], { spacing: { after: 120 } });
    const children = [];
    if (H.logo) { const lr = await imgRun(H.logo, 80); if (lr) children.push(P([lr])); }
    children.push(head, sp(), main, sp(), cg, P([TR('Item numbers are listed in each cell, separated by commas. Totals count the item numbers.', { italics: true, size: 16 })], { spacing: { before: 80, after: 200 } }), sig, sp(), guide, P([TR(TOS_GUIDE, { italics: true, size: 16 })], { spacing: { before: 60 } }));
    const doc = new D.Document({ creator: 'Jin Assessment Studio', sections: [{ properties: { page: { size: { width: Math.round(p.w * 1440), height: Math.round(p.h * 1440), orientation: D.PageOrientation.LANDSCAPE }, margin: { top: 720, right: 720, bottom: 720, left: 720 } } }, children }] });
    const blob = await D.Packer.toBlob(doc);
    await saveOut(Tos.fileBase() + '.docx', new Uint8Array(await blob.arrayBuffer()), [{ name: 'Word document', extensions: ['docx'] }], 'TOS Word file');
  } catch (e) { console.error(e); toast('Word export failed: ' + e.message, 'error'); }
};
