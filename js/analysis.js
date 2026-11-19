/* Jin Assessment Studio — Item analysis: response grid, difficulty, discrimination, synthesis */
'use strict';
const DIFF = p => p >= .81 ? 'Very easy' : p >= .61 ? 'Easy' : p >= .41 ? 'Average' : p >= .21 ? 'Difficult' : 'Very difficult';
const DISC = d => d >= .40 ? 'Very good' : d >= .30 ? 'Good' : d >= .20 ? 'Fair' : d >= 0 ? 'Poor' : 'Negative';
const DECIDE = (p, d) => d < 0 ? 'Reject — check key' : d < .20 ? 'Revise or discard' : d < .30 ? 'Revise' : (p > .80 || p < .21) ? 'Retain — check difficulty' : 'Retain';
const decClass = s => /^Retain$/.test(s) ? 'green' : /Retain/.test(s) ? 'gold' : /Reject/.test(s) ? 'red' : 'amber';
const Analysis = {
  view: 'section',
  groupsFor(ex) { return S.groups.filter(g => g.examId === (ex && ex.id)); },
  cur() { const ex = curExam(); const gs = this.groupsFor(ex); let g = gs.find(x => x.id === S.currentGroup); if (!g) g = gs[0] || null; return g; },
  items(g) { const ex = examById(g.examId); return ex ? layout(ex).leaves : []; },
  ensure(g) { const its = this.items(g); its.forEach(q => { const a = g.resp[q.id] || []; a.length = g.n; for (let i = 0; i < g.n; i++) a[i] = a[i] ? 1 : 0; g.resp[q.id] = a; }); return its; },
  markStale(g) { if (g.result) g.stale = true; },
  compute(g) {
    const items = this.ensure(g), N = g.n, pct = clamp(+S.settings.groupPct || 27, 10, 50);
    if (!items.length) throw new Error('The linked exam has no items yet.');
    if (N < 2) throw new Error('A section needs at least 2 students.');
    const scores = Array.from({ length: N }, (_, s) => items.reduce((t, q) => t + (g.resp[q.id][s] ? 1 : 0), 0));
    const order = scores.map((sc, i) => ({ i, sc })).sort((a, b) => b.sc - a.sc || a.i - b.i);
    let k = Math.max(1, Math.round(N * pct / 100)); if (2 * k > N) k = Math.floor(N / 2);
    const upper = order.slice(0, k).map(o => o.i), lower = order.slice(N - k).map(o => o.i);
    const ex = examById(g.examId), L = layout(ex);
    const rows = items.map(q => {
      const r = g.resp[q.id], c = r.reduce((a, b) => a + b, 0), U = upper.reduce((a, i) => a + r[i], 0), Lw = lower.reduce((a, i) => a + r[i], 0);
      const p = (U + Lw) / (2 * k), d = (U - Lw) / k;
      return { id: q.id, num: rg(L.num[q.id]), type: q.type, text: Classify.textOf(q).slice(0, 90), correct: c, U, L: Lw, p, d, pTotal: c / N, diff: DIFF(p), disc: DISC(d), decision: DECIDE(p, d) };
    });
    const mean = scores.reduce((a, b) => a + b, 0) / N, varr = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / N, K = items.length;
    const spq = items.reduce((a, q) => { const pp = g.resp[q.id].reduce((x, y) => x + y, 0) / N; return a + pp * (1 - pp); }, 0);
    const kr20 = K > 1 && varr > 0 ? (K / (K - 1)) * (1 - spq / varr) : null;
    g.result = { at: nowISO(), k, pct, N, K, scores, order: order.map(o => o.i), upper, lower, rows, mean, sd: Math.sqrt(varr), kr20, itemIds: items.map(q => q.id), max: Math.max(...scores), min: Math.min(...scores) };
    g.stale = false; return g.result;
  },
  isStale(g) { if (!g.result) return false; if (g.stale) return true; const ids = this.items(g).map(q => q.id); return ids.join() !== g.result.itemIds.join() || g.result.N !== g.n; },
  render() {
    const el = $('#screen-analysis'), ex = curExam();
    if (!ex) { el.innerHTML = `<div class="toolbar"><div class="tabtitle">Item Analysis</div></div><div class="empty"><img src="${CHIBI.idea}" alt=""><b>Create an exam first</b>Item analysis uses the items of an exam.</div>`; return; }
    const gs = this.groupsFor(ex), g = this.cur();
    if (g) S.currentGroup = g.id;
    const computed = gs.filter(x => x.result);
    el.innerHTML = `<div class="toolbar"><div class="tabtitle">Item Analysis</div><span class="tiny">${esc(ex.title)} · performance by class section</span>
        <button class="btn" data-a="ia-add">${icon('plus')}Add section</button>
        ${g ? `<button class="btn gold" data-a="ia-compute">${icon('chart')}Arrange &amp; compute</button><button class="btn" data-a="ia-export">${icon('download')}Export Excel</button>` : ''}</div>
      ${gs.length ? `<div class="sec-tabs">${gs.map(x => `<button class="sec-tab ${g && x.id === g.id && this.view === 'section' ? 'on' : ''}" data-a="ia-open" data-id="${x.id}">${esc(x.name)} <span class="tiny" style="color:inherit;opacity:.8">${x.n}</span>${this.isStale(x) ? '<i class="dotw" title="Results are out of date"></i>' : ''}</button>`).join('')}${computed.length >= 2 ? `<button class="sec-tab ${this.view === 'synth' ? 'on' : ''}" data-a="ia-synth">${icon('layers')}Synthesis (all sections)</button>` : ''}</div>` : ''}
      ${!g ? `<div class="empty"><img src="${CHIBI.idea}" alt=""><b>No sections yet</b>Add a class section, enter how many students took the exam, then mark each correct response.<div style="margin-top:12px"><button class="btn blue" data-a="ia-add">${icon('plus')}Add section</button></div></div>` : this.view === 'synth' && computed.length >= 2 ? this.synthHTML(ex, computed) : this.sectionHTML(g)}`;
  },
  sectionHTML(g) {
    const items = this.ensure(g), stale = this.isStale(g), R = g.result;
    const tot = Array.from({ length: g.n }, (_, s) => items.reduce((t, q) => t + g.resp[q.id][s], 0));
    const ex = examById(g.examId), L = layout(ex);
    let grid = `<table class="resp" id="resp"><thead><tr><th class="itemcol">Item \\ Student</th>${Array.from({ length: g.n }, (_, s) => `<th title="Student ${s + 1}">${s + 1}</th>`).join('')}<th class="tot">Correct</th></tr>
      <tr><th class="itemcol" style="font-weight:400;font-size:11px;color:var(--muted)">Mark or clear a whole student column</th>${Array.from({ length: g.n }, (_, s) => `<th><button class="colbtn" data-a="ia-col" data-s="${s}" data-v="1" title="Mark all items correct for student ${s + 1}">✓all</button><br><button class="colbtn" data-a="ia-col" data-s="${s}" data-v="0" title="Clear student ${s + 1}">clear</button></th>`).join('')}<th class="tot"></th></tr></thead><tbody>`;
    if (!items.length) grid += `<tr><td class="itemcol" colspan="${g.n + 2}">The exam has no items yet.</td></tr>`;
    let lastType = null;
    items.forEach(q => {
      const sec = TYPE_SHORT[q.type]; const showType = sec !== lastType; lastType = sec;
      grid += `<tr data-q="${q.id}"><td class="itemcol" title="${esc(Classify.textOf(q))}">${showType ? `<span class="tag gray" style="margin-right:5px">${sec}</span>` : ''}<b>${rg(L.num[q.id])}.</b> ${esc(Classify.textOf(q).slice(0, 40))}</td>${g.resp[q.id].map((v, s) => `<td><button class="cell ${v ? 'on' : ''}" data-a="ia-cell" data-s="${s}" aria-label="Item ${rg(L.num[q.id])}, student ${s + 1}: ${v ? 'correct' : 'incorrect'}">${v ? '1' : '0'}</button></td>`).join('')}<td class="tot" data-itot>${g.resp[q.id].reduce((a, b) => a + b, 0)}</td></tr>`;
    });
    grid += `</tbody><tfoot><tr><th class="itemcol tot">Student score</th>${tot.map((t, s) => `<td class="tot" data-stot="${s}">${t}</td>`).join('')}<td class="tot"></td></tr></tfoot></table>`;
    return `<div class="card"><div class="cardhead"><h2>${esc(g.name)}</h2><span class="tag">${plural(g.n, 'student')}</span><span class="tag gray">${plural(items.length, 'item')}</span>
        <span class="right row"><button class="btn sm" data-a="ia-edit">Section settings</button><button class="btn sm" data-a="ia-clear">Clear responses</button><button class="btn sm danger" data-a="ia-del">${icon('trash')}Delete section</button></span></div>
        ${stale ? `<div class="stale">${icon('refresh')}<span style="flex:1">Responses or exam items changed after the last calculation, so the results below are out of date.</span><button class="btn sm gold" data-a="ia-compute">Recalculate</button></div>` : ''}
        ${R && !stale ? `<div class="stats four"><div class="stat"><b>${R.mean.toFixed(1)} / ${R.K}</b><span>Mean score</span><small>${(R.mean / R.K * 100).toFixed(0)}% · SD ${R.sd.toFixed(2)}</small></div><div class="stat"><b>${R.k} / ${R.N}</b><span>Upper group</span><small>Top ${R.pct}% by score</small></div><div class="stat"><b>${R.k} / ${R.N}</b><span>Lower group</span><small>Bottom ${R.pct}% by score</small></div><div class="stat"><b>${R.kr20 == null ? '—' : R.kr20.toFixed(2)}</b><span>Reliability (KR-20)</span><small>Range ${R.min}–${R.max}</small></div></div>` : ''}
        <div class="hint" style="margin-bottom:8px">Click a cell to switch between 1 (correct) and 0 (incorrect). Each item counts once here, including multi-point problems.</div>
        <div class="grid-wrap">${grid}</div></div>
      ${this.jinHTML(g)}
      ${R ? this.resultsHTML(g) : ''}`;
  },
  resultsHTML(g) {
    const R = g.result, stale = this.isStale(g);
    return `<div class="card" style="${stale ? 'opacity:.6' : ''}"><div class="cardhead"><h2>Item results</h2><span class="tiny">Computed ${fmtWhen(R.at)}${stale ? ' · out of date' : ''}</span><span class="right tiny">p = (U + L) / 2n · D = (U − L) / n · n = ${R.k}</span></div>
      <div style="overflow:auto"><table class="res-table"><thead><tr><th>Item</th><th>Type</th><th style="text-align:center">Correct</th><th style="text-align:center">U</th><th style="text-align:center">L</th><th style="text-align:center">Difficulty p</th><th>Interpretation</th><th style="text-align:center">Discrimination D</th><th>Interpretation</th><th>Decision</th></tr></thead>
      <tbody>${R.rows.map(r => `<tr><td><b>${r.num}</b> <span class="tiny">${esc(r.text.slice(0, 50))}</span></td><td>${TYPE_SHORT[r.type]}</td><td class="num">${r.correct} / ${R.N}</td><td class="num">${r.U}</td><td class="num">${r.L}</td><td class="num">${r.p.toFixed(2)}</td><td>${r.diff}</td><td class="num" style="color:${r.d < .2 ? 'var(--red)' : r.d >= .3 ? 'var(--green)' : 'var(--amber)'}">${r.d.toFixed(2)}</td><td>${r.disc}</td><td><span class="tag ${decClass(r.decision)}">${r.decision}</span></td></tr>`).join('')}</tbody></table></div></div>
      <div class="card" style="${stale ? 'opacity:.6' : ''}"><div class="cardhead"><h2>Students arranged by score</h2><span class="right tiny">Upper and lower groups used for discrimination</span></div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">${R.order.map((s, rank) => `<span class="tag ${R.upper.includes(s) ? 'green' : R.lower.includes(s) ? 'red' : 'gray'}" title="Rank ${rank + 1}">#${rank + 1} · Student ${s + 1} · ${R.scores[s]}</span>`).join('')}</div>
        <div class="hint" style="margin-top:8px"><span class="tag green">green</span> upper group · <span class="tag red">red</span> lower group</div></div>`;
  },
  jinHTML(g) {
    const R = g.result, stale = this.isStale(g);
    let pose = 'welcome', title = 'Ready when you are', body = '<p>Mark the responses, then press <b>Arrange &amp; compute</b>. I’ll point out items that may need a closer look.</p>', sug = 'Suggestion: start with the items most students missed.';
    if (R && stale) { pose = 'planning'; title = 'These numbers are out of date'; body = '<p>Something changed after the last calculation. Recalculate so my notes match the current responses.</p>'; sug = 'Suggestion: press Recalculate.'; }
    else if (R) {
      const neg = R.rows.filter(r => r.d < 0), poor = R.rows.filter(r => r.d >= 0 && r.d < .2), hard = R.rows.filter(r => r.p <= .2), easy = R.rows.filter(r => r.p > .8), good = R.rows.filter(r => r.decision === 'Retain');
      const nums = a => a.slice(0, 6).map(r => r.num).join(', ') + (a.length > 6 ? '…' : '');
      const pts = [];
      if (neg.length) pts.push(`<li><b>Item${neg.length > 1 ? 's' : ''} ${nums(neg)}</b>: the lower group did better than the upper group. Check the answer key first, then the wording.</li>`);
      if (poor.length) pts.push(`<li><b>${plural(poor.length, 'item')}</b> (${nums(poor)}) barely separate strong and weak scorers (D below 0.20). Review their distractors.</li>`);
      if (hard.length) pts.push(`<li><b>${plural(hard.length, 'item')}</b> (${nums(hard)}) were very difficult (p ≤ 0.20). This may point to a topic that needs reteaching, or to confusing wording.</li>`);
      if (easy.length) pts.push(`<li><b>${plural(easy.length, 'item')}</b> (${nums(easy)}) were very easy (p above 0.80). Fine for warm-ups, but they add little to discrimination.</li>`);
      if (!pts.length) pts.push('<li>Every item sits in a healthy range of difficulty and discrimination.</li>');
      const meanPct = Math.round(R.mean / R.K * 100);
      pose = neg.length || poor.length > R.K / 3 ? 'planning' : good.length >= R.K * .7 ? 'celebrating' : 'welcome';
      title = neg.length ? 'A few items need a second look' : poor.length || hard.length ? 'Here is what stands out' : 'This section did well';
      body = `<p>The class averaged <b>${R.mean.toFixed(1)} of ${R.K}</b> (${meanPct}%). ${plural(good.length, 'item')} can be kept as is.${R.kr20 != null ? ` The test’s reliability estimate is ${R.kr20.toFixed(2)}${R.kr20 < .5 ? ', which is low — results may be noisy' : R.kr20 >= .7 ? ', which is solid' : ''}.` : ''}</p><ul>${pts.join('')}</ul>`;
      sug = neg.length ? 'Suggestion: verify the keys for items with negative discrimination before anything else.' : poor.length ? 'Suggestion: review difficult items with low discrimination first.' : hard.length ? 'Suggestion: revisit the competencies behind the hardest items in your next lesson.' : 'Suggestion: save these items to your bank for reuse.';
    }
    return `<div class="jin-analysis" id="jin-analysis"><div class="analysis-portrait"><img src="assets/jin/anime-${pose}-upper.webp" alt="Jin reviewing the item analysis"></div><div class="analysis-copy"><span class="eyebrow">JIN ANALYSIS NOTE</span><h3>${title}</h3>${body}<span class="analysis-suggestion">${sug}</span></div></div>`;
  },
  synthHTML(ex, gs) {
    const L = layout(ex), items = L.leaves;
    const rows = items.map(q => { const per = gs.map(g => g.result.rows.find(r => r.id === q.id)).filter(Boolean); const p = per.length ? per.reduce((a, r) => a + r.p, 0) / per.length : null, d = per.length ? per.reduce((a, r) => a + r.d, 0) / per.length : null; return { q, per: gs.map(g => g.result.rows.find(r => r.id === q.id)), p, d }; });
    return `<div class="card"><div class="cardhead"><h2>Synthesis across ${plural(gs.length, 'section')}</h2><span class="right tiny">Averages of p and D from each computed section</span></div>
      ${gs.some(g => this.isStale(g)) ? `<div class="stale">${icon('refresh')}<span>Some sections are out of date. Recalculate them for an accurate synthesis.</span></div>` : ''}
      <div style="overflow:auto"><table class="res-table"><thead><tr><th>Item</th>${gs.map(g => `<th style="text-align:center">${esc(g.name)}<br><span style="font-weight:400">p / D</span></th>`).join('')}<th style="text-align:center">Mean p</th><th style="text-align:center">Mean D</th><th>Decision</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td><b>${rg(L.num[r.q.id])}</b> <span class="tiny">${esc(Classify.textOf(r.q).slice(0, 40))}</span></td>${r.per.map(x => `<td class="num">${x ? x.p.toFixed(2) + ' / ' + x.d.toFixed(2) : '—'}</td>`).join('')}<td class="num">${r.p == null ? '—' : r.p.toFixed(2)}</td><td class="num">${r.d == null ? '—' : r.d.toFixed(2)}</td><td>${r.p == null ? '' : `<span class="tag ${decClass(DECIDE(r.p, r.d))}">${DECIDE(r.p, r.d)}</span>`}</td></tr>`).join('')}</tbody></table></div></div>`;
  },
  updateTotals(g, qid, s) {
    const tr = $(`#resp tr[data-q="${qid}"]`); if (tr) tr.querySelector('[data-itot]').textContent = g.resp[qid].reduce((a, b) => a + b, 0);
    const items = this.items(g); const st = $(`#resp [data-stot="${s}"]`); if (st) st.textContent = items.reduce((t, q) => t + (g.resp[q.id] ? g.resp[q.id][s] : 0), 0);
  }
};
function sectionDialog(g) {
  return new Promise(res => {
    const ex = curExam();
    const m = modal(`<h3>${g ? 'Section settings' : 'Add class section'}</h3><div class="mbody"><div class="details" style="grid-template-columns:2fr 1fr"><label class="field">Section name<input id="ia-name" value="${esc(g ? g.name : 'Section ' + (Analysis.groupsFor(ex).length + 1))}" placeholder="e.g., Grade 9 · Section A"></label><label class="field">Number of students<input id="ia-n" type="number" min="2" max="300" value="${g ? g.n : 40}"></label></div>
      <div class="hint" style="margin-top:8px">Linked exam: <b>${esc(ex.title)}</b> (${plural(layout(ex).leaves.length, 'item')}). ${g ? 'Reducing the number of students removes the last columns.' : ''}</div></div>
      <div class="mfoot"><button class="btn" data-a="modal-close">Cancel</button><button class="btn blue" id="ia-ok">${g ? 'Save' : 'Add section'}</button></div>`, { size: 'narrow', onClose: () => res(null) });
    $('#ia-ok').onclick = () => { const n = clamp(parseInt($('#ia-n').value) || 0, 0, 300); if (n < 2) return toast('Enter at least 2 students.', 'error'); const name = $('#ia-name').value.trim() || 'Section'; closeModal(true); res({ name, n }); };
  });
}
ACT['ia-add'] = async () => { const r = await sectionDialog(null); if (!r) return; const ex = curExam(); const g = { id: uid(), examId: ex.id, name: r.name, n: r.n, resp: {}, result: null, stale: false, created: nowISO() }; S.groups.push(g); S.currentGroup = g.id; Analysis.view = 'section'; Analysis.ensure(g); touch(); Analysis.render(); App.refreshChrome(); };
ACT['ia-edit'] = async () => { const g = Analysis.cur(); const r = await sectionDialog(g); if (!r) return; if (r.n !== g.n) Analysis.markStale(g); g.name = r.name; g.n = r.n; Analysis.ensure(g); touch(); Analysis.render(); };
ACT['ia-open'] = b => { S.currentGroup = b.dataset.id; Analysis.view = 'section'; Analysis.render(); };
ACT['ia-synth'] = () => { Analysis.view = 'synth'; Analysis.render(); };
ACT['ia-cell'] = b => { const g = Analysis.cur(), qid = b.closest('tr').dataset.q, s = +b.dataset.s; const v = g.resp[qid][s] ? 0 : 1; g.resp[qid][s] = v; b.classList.toggle('on', !!v); b.textContent = v; Analysis.updateTotals(g, qid, s); const was = Analysis.isStale(g); Analysis.markStale(g); touch(); if (!was && g.result) Analysis.render(); };
ACT['ia-col'] = b => { const g = Analysis.cur(), s = +b.dataset.s, v = +b.dataset.v; Analysis.items(g).forEach(q => { g.resp[q.id][s] = v; }); Analysis.markStale(g); touch(); const y = $('.grid-wrap') ? [$('.grid-wrap').scrollLeft, $('.grid-wrap').scrollTop] : null; Analysis.render(); if (y && $('.grid-wrap')) { $('.grid-wrap').scrollLeft = y[0]; $('.grid-wrap').scrollTop = y[1]; } };
ACT['ia-clear'] = async () => { const g = Analysis.cur(); if (!(await confirmDlg({ title: 'Clear all responses?', msg: 'Every cell in ' + g.name + ' will be set to 0.', ok: 'Clear', danger: true }))) return; Object.keys(g.resp).forEach(k => g.resp[k] = g.resp[k].map(() => 0)); Analysis.markStale(g); touch(); Analysis.render(); };
ACT['ia-del'] = async () => { const g = Analysis.cur(); if (!(await confirmDlg({ title: 'Delete ' + g.name + '?', msg: 'Its responses and results will be removed.', ok: 'Delete', danger: true }))) return; S.groups = S.groups.filter(x => x !== g); S.currentGroup = null; touch(); Analysis.render(); App.refreshChrome(); };
ACT['ia-compute'] = () => {
  const g = Analysis.cur(); if (!g) return;
  try { Analysis.compute(g); } catch (e) { return toast(e.message, 'error'); }
  touch(); Analysis.view = 'section'; Analysis.render(); App.refreshChrome();
  toast('Students arranged by score and results computed.');
  const j = $('#jin-analysis'); if (j) j.scrollIntoView({ behavior: 'smooth', block: 'center' });
};
ACT['ia-export'] = async () => {
  const ex = curExam(), gs = Analysis.groupsFor(ex); if (!gs.length) return;
  const L = layout(ex), sheets = [];
  gs.forEach(g => {
    const items = Analysis.ensure(g), R = g.result && !Analysis.isStale(g) ? g.result : null;
    const rows = [[{ v: g.name + ' — ' + ex.title, s: 6 }], [R ? `Computed ${new Date(R.at).toLocaleString()} · upper/lower group n = ${R.k} (${R.pct}%)` : 'Not computed (or out of date) — responses only'], [''],
      [{ v: 'Item', s: 2 }, { v: 'Type', s: 2 }, ...Array.from({ length: g.n }, (_, s) => ({ v: s + 1, s: 2 })), { v: 'Correct', s: 2 }]];
    items.forEach(q => rows.push([{ v: rg(L.num[q.id]), s: 4 }, { v: TYPE_SHORT[q.type], s: 3 }, ...g.resp[q.id].map(v => ({ v, s: 4 })), { v: g.resp[q.id].reduce((a, b) => a + b, 0), s: 5 }]));
    rows.push([{ v: 'Score', s: 5 }, { v: '', s: 5 }, ...Array.from({ length: g.n }, (_, s) => ({ v: items.reduce((t, q) => t + g.resp[q.id][s], 0), s: 5 })), '']);
    if (R) {
      rows.push([''], [{ v: 'ITEM RESULTS', s: 1 }], ['Item', 'Type', 'Correct', 'U', 'L', 'Difficulty p', 'Interpretation', 'Discrimination D', 'Interpretation', 'Decision', 'Question'].map(v => ({ v, s: 2 })));
      R.rows.forEach(r => rows.push([{ v: r.num, s: 4 }, { v: TYPE_SHORT[r.type], s: 3 }, { v: r.correct, s: 4 }, { v: r.U, s: 4 }, { v: r.L, s: 4 }, { v: +r.p.toFixed(2), s: 4 }, { v: r.diff, s: 3 }, { v: +r.d.toFixed(2), s: 4 }, { v: r.disc, s: 3 }, { v: r.decision, s: 3 }, { v: r.text, s: 3 }]));
      rows.push([''], [{ v: 'Mean', s: 1 }, +R.mean.toFixed(2)], [{ v: 'SD', s: 1 }, +R.sd.toFixed(2)], [{ v: 'KR-20', s: 1 }, R.kr20 == null ? '' : +R.kr20.toFixed(2)], [''], [{ v: 'RANKING', s: 1 }], ['Rank', 'Student', 'Score', 'Group'].map(v => ({ v, s: 2 })));
      R.order.forEach((s, i) => rows.push([i + 1, s + 1, R.scores[s], R.upper.includes(s) ? 'Upper' : R.lower.includes(s) ? 'Lower' : '']));
    }
    sheets.push({ name: g.name, rows, widths: [9, 14, ...Array(Math.max(g.n, 9)).fill(5.5)], freeze: 'C5' });
  });
  const done = gs.filter(g => g.result && !Analysis.isStale(g));
  if (done.length >= 2) {
    const rows = [[{ v: 'SYNTHESIS — ' + ex.title, s: 6 }], [''], [{ v: 'Item', s: 2 }, ...done.flatMap(g => [{ v: g.name + ' p', s: 2 }, { v: g.name + ' D', s: 2 }]), { v: 'Mean p', s: 2 }, { v: 'Mean D', s: 2 }, { v: 'Decision', s: 2 }]];
    L.leaves.forEach(q => { const per = done.map(g => g.result.rows.find(r => r.id === q.id)); const ok = per.filter(Boolean); const p = ok.length ? ok.reduce((a, r) => a + r.p, 0) / ok.length : null, d = ok.length ? ok.reduce((a, r) => a + r.d, 0) / ok.length : null; rows.push([{ v: rg(L.num[q.id]), s: 4 }, ...per.flatMap(r => r ? [{ v: +r.p.toFixed(2), s: 4 }, { v: +r.d.toFixed(2), s: 4 }] : ['', '']), p == null ? '' : { v: +p.toFixed(2), s: 5 }, d == null ? '' : { v: +d.toFixed(2), s: 5 }, p == null ? '' : DECIDE(p, d)]); });
    sheets.push({ name: 'Synthesis', rows, widths: [9, ...Array(done.length * 2 + 2).fill(11), 24] });
  }
  await saveOut('Item Analysis - ' + safeName(ex.title) + '.xlsx', Office.xlsx(sheets), [{ name: 'Excel workbook', extensions: ['xlsx'] }], 'Item analysis spreadsheet');
};
