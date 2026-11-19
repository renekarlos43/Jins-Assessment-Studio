/* Jin Assessment Studio — Exam Planner: targets by topic × question type, progress vs. the built exam, Jin's planning coach */
'use strict';
let PTYPES = [
  { k: 'mc', n: 'Multiple choice', s: 'MC' }, { k: 'ident', n: 'Identification', s: 'ID' }, { k: 'match', n: 'Matching', s: 'MAT' },
  { k: 'prob', n: 'Problem solving', s: 'PS' }, { k: 'cmc', n: 'Corrected multiple choice (statement combination)', s: 'CMC' },
  { k: 'morse', n: 'Paired-statement “Morse type”', s: 'MORSE' }, { k: 'passage', n: 'Passage-based', s: 'PASS' }
];
let PT = Object.fromEntries(PTYPES.map(t => [t.k, t]));
const blankTypes = () => Object.fromEntries(PTYPES.map(t => [t.k, 0]));
const sumTypes = t => PTYPES.reduce((s, x) => s + (parseInt(t[x.k]) || 0), 0);
/* largest-remainder rounding: whole numbers that add up exactly to total */
function lrAllocate(weights, total) {
  const W = weights.reduce((a, b) => a + Math.max(0, +b || 0), 0); if (!W || total <= 0) return weights.map(() => 0);
  const q = weights.map(w => Math.max(0, +w || 0) / W * total), base = q.map(Math.floor);
  let left = total - base.reduce((a, b) => a + b, 0);
  q.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left > 0) { base[i]++; left--; } });
  return base;
}
const topicOfComp = id => S.topics.find(t => t.comps.some(c => c.id === id)) || null;
const Planner = {
  migrate(pl) {
    pl.total = Math.max(0, parseInt(pl.total) || 0); pl.points = pl.points === '' || pl.points == null ? null : Math.max(0, parseInt(pl.points) || 0);
    pl.duration = pl.duration === '' || pl.duration == null ? null : Math.max(0, parseInt(pl.duration) || 0);
    pl.rows = (pl.rows || []).map(r => ({ id: r.id || uid(), label: r.label || '', link: r.link && r.link.kind ? { kind: r.link.kind, id: r.link.id, auto: !!r.link.auto } : { kind: '', id: '' }, target: Math.max(0, parseInt(r.target) || 0), types: Object.assign(blankTypes(), r.types || {}), hours: r.hours ?? null, priority: r.priority || 'M' }));
    pl.bloom = Array.isArray(pl.bloom) && pl.bloom.length === 6 ? pl.bloom.map(v => v === null || v === '' ? null : Math.max(0, parseInt(v) || 0)) : null;
    pl.diff = pl.diff && typeof pl.diff === 'object' ? pl.diff : null;
    pl.dismissed = Array.isArray(pl.dismissed) ? pl.dismissed : [];
    return pl;
  },
  ensure(ex) { if (!ex.plan) ex.plan = this.migrate({ total: 0, rows: [] }); return ex.plan; },
  hasPlan(ex) { return !!(ex && ex.plan && ex.plan.rows.length); },
  newRow(label = '', link) { return { id: uid(), label, link: link || { kind: '', id: '' }, target: 0, types: blankTypes(), hours: null, priority: 'M' }; },
  rowTexts(r) {
    const out = [r.label];
    if (r.link.kind === 'comp') { const c = compById(r.link.id); if (c) out.push(c.text, c.topic || ''); }
    if (r.link.kind === 'topic') { const t = S.topics.find(x => x.id === r.link.id); if (t) out.push(t.name, ...t.comps.map(c => c.text)); }
    return out.filter(Boolean);
  },
  linkLabel(r) { if (r.link.kind === 'comp') { const c = compById(r.link.id); return c ? 'Competency: ' + c.text : ''; } if (r.link.kind === 'topic') { const t = S.topics.find(x => x.id === r.link.id); return t ? 'Topic: ' + (t.name || 'Untitled') : ''; } return ''; },
  /* find a topic or competency matching a row label */
  bestLink(label) {
    const lo = String(label || '').trim().toLowerCase(); if (!lo) return null;
    const t = S.topics.find(x => (x.name || '').trim().toLowerCase() === lo); if (t) return { kind: 'topic', id: t.id, why: 'same name' };
    const want = new Set(Classify.toks(label)); if (!want.size) return null;
    let best = null;
    S.topics.forEach(tp => { const sc = Classify.toks(tp.name || '').filter(w => want.has(w)).length * 2; if (sc && (!best || sc > best.sc)) best = { kind: 'topic', id: tp.id, sc, why: 'topic name shares “' + label + '”' }; tp.comps.forEach(c => { const sh = [...new Set(Classify.toks(c.text))].filter(w => want.has(w)); if (sh.length && (!best || sh.length > best.sc)) best = { kind: 'comp', id: c.id, sc: sh.length, why: 'competency wording shares “' + sh.join(', ') + '”' }; }); });
    return best;
  },
  actualType(q) { const p = parentOf(q); if (p && p.type === 'passage') return 'passage'; if (p && p.type === 'matching') return 'match'; return PT[q.type] ? q.type : 'mc'; },
  rowFor(pl, q) {
    if (!q.comp) return null;
    const byComp = pl.rows.find(r => r.link.kind === 'comp' && r.link.id === q.comp); if (byComp) return byComp;
    const tp = topicOfComp(q.comp); return tp ? pl.rows.find(r => r.link.kind === 'topic' && r.link.id === tp.id) || null : null;
  },
  progress(ex) {
    const pl = this.ensure(ex), L = layout(ex), map = {};
    const rows = pl.rows.map(r => (map[r.id] = { row: r, act: blankTypes(), actTotal: 0, ids: [] }));
    const out = { act: blankTypes(), actTotal: 0, ids: [] };
    L.leaves.forEach(q => { const r = this.rowFor(pl, q), b = r ? map[r.id] : out, t = this.actualType(q); b.act[t]++; b.actTotal++; b.ids.push(q.id); });
    let planned = 0, completed = 0, remaining = 0, over = 0; const cells = [];
    rows.forEach(x => {
      const typed = sumTypes(x.row.types) > 0; x.typed = typed;
      if (typed) PTYPES.forEach(t => { const p = parseInt(x.row.types[t.k]) || 0, a = x.act[t.k]; planned += p; completed += Math.min(a, p); remaining += Math.max(p - a, 0); over += Math.max(a - p, 0); if (p || a) cells.push({ x, t: t.k, p, a }); });
      else { const p = x.row.target, a = x.actTotal; planned += p; completed += Math.min(a, p); remaining += Math.max(p - a, 0); over += Math.max(a - p, 0); if (p || a) cells.push({ x, t: '', p, a }); }
    });
    const typeTotals = blankTypes(), actTypeTotals = blankTypes();
    rows.forEach(x => PTYPES.forEach(t => { typeTotals[t.k] += parseInt(x.row.types[t.k]) || 0; actTypeTotals[t.k] += x.act[t.k]; }));
    PTYPES.forEach(t => actTypeTotals[t.k] += out.act[t.k]);
    const bloomAct = [0, 0, 0, 0, 0, 0]; L.leaves.forEach(q => bloomAct[q.bloom]++);
    return { pl, L, rows, out, planned, completed, remaining, over: over + out.actTotal, outside: out.actTotal, built: L.leaves.length, cells, rowSum: pl.rows.reduce((s, r) => s + r.target, 0), typeTotals, actTypeTotals, bloomAct };
  },
  /* ---------- question-type advice per competency ---------- */
  MIX: {
    recall: { w: { mc: 5, ident: 4, match: 1 }, why: 'recall outcomes are checked efficiently by identification and multiple choice' },
    explain: { w: { mc: 6, cmc: 2, morse: 2 }, why: 'explaining ideas fits multiple choice with explanatory choices and statement judgments' },
    apply: { w: { mc: 4, prob: 5, ident: 1 }, why: 'applying a principle or formula is best shown by working a problem' },
    analyze: { w: { passage: 4, mc: 3, cmc: 3 }, why: 'analysis needs data or a situation to examine, so passage-based and statement items fit' },
    evaluate: { w: { passage: 4, morse: 3, cmc: 3 }, why: 'judging claims against evidence works best with a scenario and statements to weigh' },
    create: { w: { prob: 7, passage: 3 }, why: 'combining ideas into a plan or model needs an open, constructed response' },
    '': { w: { mc: 6, ident: 2, prob: 2 }, why: 'no clear action verb was found, so a balanced default is used' }
  },
  kindsOf(r) {
    const texts = this.rowTexts(r).slice(r.link.kind ? 1 : 0), kinds = {};
    texts.forEach(t => { const k = Classify.verbKind(t); if (k) kinds[k] = (kinds[k] || 0) + 1; });
    if (/\b(calculat|comput|solv|determin)/i.test(texts.join(' '))) kinds.apply = (kinds.apply || 0) + 1;
    return kinds;
  },
  typeMix(r) {
    const kinds = this.kindsOf(r), keys = Object.keys(kinds), w = blankTypes(); let reasons = [];
    if (!keys.length) { Object.assign(w, this.MIX[''].w); reasons.push(this.MIX[''].why); }
    keys.forEach(k => { const m = this.MIX[k] || this.MIX['']; Object.entries(m.w).forEach(([t, v]) => w[t] += v * kinds[k]); reasons.push(m.why); });
    const evidence = this.rowTexts(r).slice(r.link.kind ? 1 : 0).find(t => Classify.verbKind(t)) || '';
    return { w, kinds: keys, reasons: [...new Set(reasons)], evidence };
  },
  suggestTypes(r, total) { const m = this.typeMix(r), keys = PTYPES.map(t => t.k), counts = lrAllocate(keys.map(k => m.w[k]), total ?? r.target); const types = blankTypes(); keys.forEach((k, i) => types[k] = counts[i]); return { types, ...m }; },
  /* ---------- item-bank suggestions for a slot ---------- */
  suggestFor(ex, rowId, type) {
    const pl = this.ensure(ex), r = pl.rows.find(x => x.id === rowId); if (!r) return [];
    const used = new Set(ex.items.map(id => { const q = Q(id); return q && q.srcBank; }).filter(Boolean).concat(ex.items));
    const want = new Set(this.rowTexts(r).flatMap(t => Classify.toks(t)));
    const topicIds = r.link.kind === 'topic' ? new Set((S.topics.find(t => t.id === r.link.id) || { comps: [] }).comps.map(c => c.id)) : null;
    return bankItems().filter(q => !used.has(q.id) && (type === 'passage' ? q.type === 'passage' : type === 'match' ? q.type === 'matching' : !type || q.type === type)).map(q => {
      const leaves = isGroup(q) ? kidsOf(q) : [q]; let score = 0; const why = [];
      if (r.link.kind === 'comp' && leaves.some(k => k.comp === r.link.id)) { score += 3; why.push('tagged with this row’s competency'); }
      else if (topicIds && leaves.some(k => topicIds.has(k.comp))) { score += 2; why.push('tagged with a competency in this topic'); }
      const words = [...new Set(leaves.flatMap(k => Classify.toks(Classify.textOf(k) + ' ' + (k.opts || []).join(' '))).concat(Classify.toks(stripHTML(q.stem))))].filter(w => want.has(w) && !w.includes('_'));
      if (words.length) { score += Math.min(2, words.length * .5); why.push('shares the words ' + words.slice(0, 4).join(', ')); }
      return { q, score, why };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
  },
  /* ---------- rendering ---------- */
  render(box, ex) {
    const pl = this.ensure(ex), P = this.progress(ex);
    box.innerHTML = `
      <div id="plan-details" hidden>${Exam.detailsCard(ex)}</div>
      <div class="grid2">
        <div style="min-width:0">
          ${this.formatCard(ex)}
          <div class="card"><div class="cardhead"><h2>Plan settings</h2><span class="tiny">Targets guide the build; they never block it.</span></div>
            <div class="details" style="grid-template-columns:repeat(3,minmax(0,1fr))">
              <label class="field">Total number of questions<input type="number" min="0" data-pl="total" value="${pl.total || ''}" placeholder="e.g., ${fmtOf(ex) === 'scantron' ? 40 : 15}"></label>
              <label class="field">${fmtOf(ex) === 'onepage' ? 'Total points (30 by default)' : 'Total points (optional)'}<input type="number" min="0" data-pl="points" value="${pl.points ?? ''}" placeholder="e.g., ${fmtOf(ex) === 'onepage' ? 30 : 45}"></label>
              <label class="field">Duration in minutes (optional)<input type="number" min="0" data-pl="duration" value="${pl.duration ?? ''}" placeholder="e.g., 60"></label>
            </div>
            <div class="row" style="margin-top:10px">
              <div class="dd"><button class="btn sm" data-dd="dd-plrows">${icon('plus')}Rows from… ${icon('down')}</button><div class="ddm" id="dd-plrows"><button class="mi" data-a="plan-from" data-v="topics">${icon('layers')}<span>One row per topic<small>${S.topics.length} topic(s)</small></span></button><button class="mi" data-a="plan-from" data-v="comps">${icon('target')}<span>One row per competency<small>${allComps().length} competenc${allComps().length === 1 ? 'y' : 'ies'}</small></span></button></div></div>
              <button class="btn sm" data-a="plan-sample">${icon('book')}Use sample plan</button>
              <button class="btn sm blue" data-a="plan-allocate">${icon('spark')}Distribute with Jin…</button>
              <span class="spacer"></span>
              ${pl.rows.length ? `<button class="btn sm danger" data-a="plan-clear">${icon('trash')}Clear plan</button>` : ''}
            </div></div>
          <div class="card"><div class="cardhead"><h2>Targets by topic and question type</h2><span class="tiny">Each cell: <b>target</b> (editable) with <span class="pa done">built</span> beside it</span><button class="btn blue sm right" data-a="plan-add-row">${icon('plus')}Add topic row</button></div>
            ${pl.rows.length ? this.matrixHTML(ex, P) : `<div class="empty"><img src="${CHIBI.idea}" alt=""><b>No plan yet</b>Add topic rows, load your competencies, or start from the sample plan to see how planning works.<div class="row" style="justify-content:center;margin-top:12px"><button class="btn blue" data-a="plan-add-row">${icon('plus')}Add topic row</button><button class="btn" data-a="plan-sample">Use sample plan</button></div></div>`}
          </div>
          <details class="card optcard" ${pl.bloom || pl.diff ? 'open' : ''} id="plan-optional"><summary><h2 style="display:inline">Optional targets: Bloom’s levels and difficulty</h2></summary><div id="plan-optional-body">${this.optionalHTML(ex, P)}</div></details>
          <div class="row" style="justify-content:flex-end;margin-top:4px"><button class="btn gold" data-a="exam-tab" data-tab="builder">Continue to ${fmtOf(ex) === 'gforms' ? 'Form' : 'Exam'} Builder →</button></div>
        </div>
        <div style="min-width:0" id="plan-rail">${this.railHTML(ex, P)}</div>
      </div>`;
  },
  matrixHTML(ex, P) {
    const pl = P.pl, total = pl.total, linkOpts = r => `<option value="">— Not linked —</option>${S.topics.length ? `<optgroup label="Topics">${S.topics.map(t => `<option value="topic:${t.id}"${r.link.kind === 'topic' && r.link.id === t.id ? ' selected' : ''}>${esc(t.name || 'Untitled topic')}</option>`).join('')}</optgroup>` : ''}${S.topics.map(t => t.comps.length ? `<optgroup label="${esc((t.name || 'Topic') + ' — competencies')}">${t.comps.map(c => `<option value="comp:${c.id}"${r.link.kind === 'comp' && r.link.id === c.id ? ' selected' : ''}>${esc(c.text.slice(0, 70))}</option>`).join('')}</optgroup>` : '').join('')}`;
    const badge = (a, p) => { const cls = !p && !a ? '' : a === p ? 'done' : a < p ? 'under' : 'over'; return cls ? `<span class="pa ${cls}" title="${a} built of ${p} planned${a < p ? ' · ' + (p - a) + ' remaining' : a > p ? ' · ' + (a - p) + ' over' : ''}">${a}</span>` : `<span class="pa none">·</span>`; };
    const rows = P.rows.map((x, i) => {
      const r = x.row, ts = sumTypes(r.types), pct = total ? (r.target / total * 100) : 0;
      return `<tr data-prow="${r.id}"><td class="pl-n">${i + 1}</td>
        <td class="pl-topic"><input type="text" data-pr="label" value="${esc(r.label)}" placeholder="Topic or competency"><select data-pr="link" title="Link to a topic or competency so built questions count toward this row">${linkOpts(r)}</select>${r.link.auto ? '<span class="conf med" title="Linked automatically by matching words — check it">auto-linked</span>' : ''}</td>
        <td class="count-cell"><input type="number" min="0" data-pr="target" value="${r.target}" aria-label="Target items for ${esc(r.label)}"></td>
        <td><input type="number" min="0" max="100" step="0.1" data-pr="pct" value="${total ? +pct.toFixed(1) : ''}" ${total ? '' : 'disabled title="Set the total number of questions first"'} aria-label="Percent of exam"></td>
        ${PTYPES.map(t => `<td class="tcell"><input type="number" min="0" data-pr="type" data-t="${t.k}" value="${r.types[t.k] || ''}" placeholder="0" aria-label="${t.n} target for ${esc(r.label)}"><span data-badge="${t.k}">${badge(x.act[t.k], parseInt(r.types[t.k]) || 0)}</span></td>`).join('')}
        <td data-sum="types" class="${ts && ts !== r.target ? 'bad' : ''}" title="${ts && ts !== r.target ? 'Question types add to ' + ts + ', row target is ' + r.target : 'Sum of question-type targets'}">${ts}</td>
        <td data-built>${badge(x.actTotal, r.target)}</td>
        <td class="pl-act"><button class="btn icon sm ghost" data-a="plan-types" title="Ask Jin which question types fit this topic">${icon('spark')}</button><button class="btn icon sm ghost" data-a="plan-move" data-d="-1" title="Move up">${icon('up')}</button><button class="btn icon sm ghost" data-a="plan-move" data-d="1" title="Move down">${icon('down')}</button><button class="btn icon sm ghost" data-a="plan-del-row" title="Remove row">${icon('x')}</button></td></tr>`;
    }).join('');
    const out = P.out.actTotal ? `<tr class="pl-out"><td></td><td><b>Not in plan</b><div class="tiny">Built questions whose competency isn’t linked to a row (or that have none)</div></td><td></td><td></td>${PTYPES.map(t => `<td class="tcell">${P.out.act[t.k] ? `<span class="pa over">${P.out.act[t.k]}</span>` : ''}</td>`).join('')}<td></td><td><span class="pa over">${P.out.actTotal}</span></td><td></td></tr>` : '';
    const st = this.reconcileStatus(P);
    return `<div class="table-wrap"><table class="plan-table" id="plan-table"><thead><tr><th>#</th><th class="pl-topic">TOPIC / COMPETENCY</th><th title="Target number of questions">TOTAL</th><th>%</th>${PTYPES.map(t => `<th title="${t.n}">${t.s}</th>`).join('')}<th title="Sum of question-type targets">Σ TYPES</th><th title="Questions built so far">BUILT</th><th></th></tr></thead>
      <tbody>${rows}${out}</tbody>
      <tfoot><tr><th></th><th style="text-align:right">TOTAL</th><th data-foot="target">${P.rowSum}</th><th data-foot="pct">${total ? (P.rowSum / total * 100).toFixed(1) + '%' : '—'}</th>${PTYPES.map(t => `<th data-foot="${t.k}">${P.typeTotals[t.k]}<span class="pa ${P.actTypeTotals[t.k] ? 'done' : 'none'}" style="margin-left:4px">${P.actTypeTotals[t.k] || '·'}</span></th>`).join('')}<th data-foot="types">${PTYPES.reduce((s, t) => s + P.typeTotals[t.k], 0)}</th><th data-foot="built">${P.built}</th><th></th></tr></tfoot></table></div>
      <div class="pl-status ${st.ok ? 'ok' : 'warn'}" id="plan-status">${st.html}</div>
      <div class="hint" style="margin-top:6px">${PTYPES.map(t => `<b>${t.s}</b> ${t.n}`).join(' · ')}.<br><b>Rounding:</b> counts are whole questions. Typing a percentage sets that row to the nearest whole number of the exam size. “Distribute” and “Scale to total” use largest-remainder rounding, so rows always add up exactly to the exam size. Percentages are shown to one decimal and may not add to exactly 100.0%.</div>`;
  },
  reconcileStatus(P) {
    const pl = P.pl, msgs = []; let ok = true;
    if (!pl.total) { ok = false; msgs.push('Set the total number of questions so percentages and checks can work.'); }
    else if (P.rowSum !== pl.total) { ok = false; msgs.push(`Topic targets add up to <b>${P.rowSum}</b> of <b>${pl.total}</b> — ${P.rowSum < pl.total ? (pl.total - P.rowSum) + ' not yet allocated' : (P.rowSum - pl.total) + ' over the exam size'}.`); }
    const badRows = P.rows.filter(x => x.typed && sumTypes(x.row.types) !== x.row.target);
    if (badRows.length) { ok = false; msgs.push(`Question types don’t match the row total in: ${badRows.map(x => esc(x.row.label || 'row ' + (P.rows.indexOf(x) + 1))).join(', ')}.`); }
    if (ok) msgs.push(`✓ Allocations reconcile: ${P.rowSum} questions across ${plural(pl.rows.length, 'row')}.`);
    return { ok, html: msgs.join(' ') };
  },
  optionalHTML(ex, P) {
    const pl = P.pl, b = pl.bloom || [null, null, null, null, null, null], bsum = b.reduce((s, v) => s + (v || 0), 0);
    const g = Analysis.groupsFor(ex).filter(x => x.result && !Analysis.isStale(x)); let dAct = null;
    if (g.length) { const rows = g.flatMap(x => x.result.rows); dAct = { easy: rows.filter(r => r.p >= .61).length, avg: rows.filter(r => r.p >= .41 && r.p < .61).length, hard: rows.filter(r => r.p < .41).length, n: rows.length }; }
    const d = pl.diff || {};
    return `<div class="hint" style="margin:8px 0">Bloom targets use the <b>Original Bloom’s Taxonomy (1956)</b>, counted in questions. Leave a box empty for no target.</div>
      <div class="table-wrap"><table class="plan-table small"><thead><tr><th></th>${BL.map((n, i) => `<th>${n}</th>`).join('')}<th>Σ</th></tr></thead><tbody>
        <tr><th>Target</th>${BL.map((n, i) => `<td class="count-cell"><input type="number" min="0" data-pb="${i}" value="${b[i] ?? ''}" placeholder="—"></td>`).join('')}<td data-bsum class="${pl.bloom && pl.total && bsum !== pl.total ? 'bad' : ''}">${bsum}</td></tr>
        <tr><th>Built</th>${P.bloomAct.map((v, i) => `<td>${b[i] != null ? `<span class="pa ${v === b[i] ? 'done' : v < b[i] ? 'under' : 'over'}">${v}</span>` : v}</td>`).join('')}<td>${P.built}</td></tr></tbody></table></div>
      ${pl.bloom && pl.total && bsum !== pl.total ? `<div class="pl-status warn">Bloom targets add up to ${bsum}, not ${pl.total}.</div>` : ''}
      <div class="hint" style="margin:14px 0 8px">Difficulty targets (percent of items). Actual difficulty comes from item analysis after the exam is given.</div>
      <div class="table-wrap"><table class="plan-table small"><thead><tr><th></th><th>Easy</th><th>Average</th><th>Difficult</th><th>Σ</th></tr></thead><tbody>
        <tr><th>Target %</th>${['easy', 'avg', 'hard'].map(k => `<td class="count-cell"><input type="number" min="0" max="100" data-pd="${k}" value="${d[k] ?? ''}" placeholder="—"></td>`).join('')}<td>${(+d.easy || 0) + (+d.avg || 0) + (+d.hard || 0)}%</td></tr>
        <tr><th>Actual</th>${dAct ? ['easy', 'avg', 'hard'].map(k => `<td>${Math.round(dAct[k] / dAct.n * 100)}%</td>`).join('') + `<td>${dAct.n} items</td>` : `<td colspan="4" class="tiny">Not measured yet — run Item Analysis for this exam.</td>`}</tr></tbody></table></div>`;
  },
  railHTML(ex, P) {
    const pct = P.planned ? Math.round(P.completed / P.planned * 100) : 0;
    return `${this.coachHTML(ex, P)}
      <div class="card"><div class="cardhead"><h2>Build progress</h2><span class="tag right">${pct}%</span></div>
        <div class="stats" style="grid-template-columns:repeat(2,1fr)"><div class="stat"><b>${P.planned}</b><span>Planned</span></div><div class="stat"><b>${P.completed}</b><span>Completed</span></div><div class="stat"><b style="color:var(--amber)">${P.remaining}</b><span>Remaining</span></div><div class="stat"><b style="color:${P.over ? 'var(--red)' : 'inherit'}">${P.over}</b><span>Overfilled</span>${P.outside ? `<small>${P.outside} outside the plan</small>` : ''}</div></div>
        <div style="margin-top:10px">${P.rows.map(x => { const p = x.row.target, a = x.actTotal; return `<div class="minirow"><span style="width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(x.row.label)}">${esc(x.row.label || 'Untitled')}</span><div class="bar"><i style="width:${p ? Math.min(100, Math.round(Math.min(a, p) / p * 100)) : 0}%;${a > p ? 'background:var(--red)' : ''}"></i></div><span style="width:52px;text-align:right">${a} / ${p}</span></div>`; }).join('') || '<div class="hint">Add topic rows to track progress.</div>'}</div>
      </div>`;
  },
  /* compact card for the Exam Builder rail */
  railCard(ex) {
    if (!this.hasPlan(ex)) return `<div class="card"><div class="cardhead"><h2>Exam plan</h2></div><div class="hint">No plan for this exam yet. Planning first helps you balance topics and question types.</div><button class="btn sm" style="margin-top:10px" data-a="exam-tab" data-tab="planner">${icon('target')}Open Exam Planner</button></div>`;
    const P = this.progress(ex), gaps = P.cells.filter(c => c.a < c.p).sort((a, b) => (b.p - b.a) - (a.p - a.a)).slice(0, 4), overs = P.cells.filter(c => c.a > c.p).slice(0, 3);
    return `<div class="card" id="plan-railcard"><div class="cardhead"><h2>Plan progress</h2><span class="right tiny">${P.completed} of ${P.planned} done</span></div>
      <div class="progress" style="margin:0 0 8px"><i style="width:${P.planned ? Math.round(P.completed / P.planned * 100) : 0}%"></i></div>
      ${gaps.map(c => `<div class="minirow"><span><b>${esc(c.x.row.label || 'Untitled')}</b> · ${c.t ? PT[c.t].n : 'any type'}<br><span class="tiny">${c.a} of ${c.p} built · ${c.p - c.a} remaining</span></span><button class="btn sm" data-a="plan-suggest" data-row="${c.x.row.id}" data-t="${c.t}">Suggest</button></div>`).join('')}
      ${overs.map(c => `<div class="minirow"><span><b>${esc(c.x.row.label || 'Untitled')}</b> · ${c.t ? PT[c.t].n : 'any type'}<br><span class="tiny" style="color:var(--red)">${c.a} built, ${c.p} planned (${c.a - c.p} over)</span></span></div>`).join('')}
      ${P.outside ? `<div class="minirow"><span class="tiny" style="color:var(--red)">${plural(P.outside, 'question')} not counted in the plan (no linked competency)</span></div>` : ''}
      ${!gaps.length && !overs.length && !P.outside ? '<div class="okbox" style="margin:6px 0 0">The exam matches the plan.</div>' : ''}
      <button class="link" data-a="exam-tab" data-tab="planner">Open Exam Planner →</button></div>`;
  },
  /* planned vs actual for the TOS screen */
  tosCompareHTML(ex) {
    if (!this.hasPlan(ex)) return `<div class="card"><div class="cardhead"><h2>Planned vs. actual</h2></div><div class="hint">This exam has no plan. Plan targets in <b>Exam → Exam Planner</b> to compare them with the finished exam here.</div><button class="btn sm" style="margin-top:8px" data-a="flow" data-step="planner">Open Exam Planner</button></div>`;
    const P = this.progress(ex), pl = P.pl;
    return `<div class="card"><div class="cardhead"><h2>Planned vs. actual</h2><span class="tiny">Planner targets count questions; TOS cells list item numbers (a 5-point problem fills 5 numbers).</span></div>
      <div class="table-wrap"><table class="res-table"><thead><tr><th>Plan row</th><th style="text-align:center">Planned</th><th style="text-align:center">Actual</th><th style="text-align:center">Difference</th><th>By question type (actual / planned)</th></tr></thead><tbody>
      ${P.rows.map(x => { const d = x.actTotal - x.row.target; return `<tr><td>${esc(x.row.label || 'Untitled')}<div class="tiny">${esc(this.linkLabel(x.row) || 'Not linked')}</div></td><td class="num">${x.row.target}</td><td class="num">${x.actTotal}</td><td class="num" style="color:${d < 0 ? 'var(--amber)' : d > 0 ? 'var(--red)' : 'var(--green)'}">${d > 0 ? '+' : ''}${d}</td><td class="tiny">${PTYPES.filter(t => x.row.types[t.k] || x.act[t.k]).map(t => `${t.s} ${x.act[t.k]}/${x.row.types[t.k] || 0}`).join(' · ') || '—'}</td></tr>`; }).join('')}
      ${P.out.actTotal ? `<tr><td><b>Not in plan</b></td><td class="num">0</td><td class="num">${P.out.actTotal}</td><td class="num" style="color:var(--red)">+${P.out.actTotal}</td><td class="tiny">${PTYPES.filter(t => P.out.act[t.k]).map(t => `${t.s} ${P.out.act[t.k]}`).join(' · ')}</td></tr>` : ''}
      <tr><th>Total</th><th style="text-align:center">${P.rowSum}</th><th style="text-align:center">${P.built}</th><th style="text-align:center">${P.built - P.rowSum > 0 ? '+' : ''}${P.built - P.rowSum}</th><th></th></tr></tbody></table></div>
      ${pl.bloom ? `<div class="table-wrap" style="margin-top:10px"><table class="res-table"><thead><tr><th>Bloom (1956)</th>${BL.map(n => `<th style="text-align:center">${n}</th>`).join('')}</tr></thead><tbody><tr><td>Planned</td>${pl.bloom.map(v => `<td class="num">${v ?? '—'}</td>`).join('')}</tr><tr><td>Actual</td>${P.bloomAct.map((v, i) => `<td class="num" style="color:${pl.bloom[i] == null ? 'inherit' : v === pl.bloom[i] ? 'var(--green)' : 'var(--amber)'}">${v}</td>`).join('')}</tr></tbody></table></div>` : ''}</div>`;
  },
  /* ---------- live refresh without losing focus ---------- */
  refresh(full) {
    const ex = curExam(); if (!ex || APP.screen !== 'exam' || APP.examTab !== 'planner') return;
    if (full) { const y = window.scrollY; Exam.render(); window.scrollTo(0, y); return; }
    const P = this.progress(ex), tb = $('#plan-table'); if (!tb) return Exam.render();
    P.rows.forEach(x => {
      const tr = tb.querySelector(`tr[data-prow="${x.row.id}"]`); if (!tr) return;
      const ts = sumTypes(x.row.types), pc = tr.querySelector('[data-pr=pct]');
      if (pc && document.activeElement !== pc) pc.value = P.pl.total ? +(x.row.target / P.pl.total * 100).toFixed(1) : '';
      const tg = tr.querySelector('[data-pr=target]'); if (tg && document.activeElement !== tg) tg.value = x.row.target;
      const sm = tr.querySelector('[data-sum=types]'); sm.textContent = ts; sm.classList.toggle('bad', !!ts && ts !== x.row.target);
    });
    $('[data-foot=target]').textContent = P.rowSum; $('[data-foot=pct]').textContent = P.pl.total ? (P.rowSum / P.pl.total * 100).toFixed(1) + '%' : '—';
    PTYPES.forEach(t => { const f = $(`[data-foot="${t.k}"]`); if (f) f.firstChild.textContent = P.typeTotals[t.k]; });
    $('[data-foot=types]').textContent = PTYPES.reduce((s, t) => s + P.typeTotals[t.k], 0);
    const st = this.reconcileStatus(P), sb = $('#plan-status'); sb.className = 'pl-status ' + (st.ok ? 'ok' : 'warn'); sb.innerHTML = st.html;
    refreshPlanSide();
  },
  refreshSide() { const ex = curExam(); if (!ex || APP.examTab !== 'planner') return; const P = this.progress(ex), r = $('#plan-rail'); if (r) r.innerHTML = this.railHTML(ex, P); const o = $('#plan-optional-body'); if (o && !o.contains(document.activeElement)) o.innerHTML = this.optionalHTML(ex, P); }
};
const refreshPlanSide = debounce(() => Planner.refreshSide(), 450);

/* ---------- input handling ---------- */
document.addEventListener('input', e => {
  const t = e.target; if (!t.dataset || !t.closest('#screen-exam')) return;
  const ex = curExam(); if (!ex) return; const pl = Planner.ensure(ex);
  if (t.dataset.pl) { const v = t.value === '' ? null : Math.max(0, parseInt(t.value) || 0); if (t.dataset.pl === 'total') pl.total = v || 0; else pl[t.dataset.pl] = v; touch(); if (t.dataset.pl === 'total') Planner.refresh(true); else refreshPlanSide(); return; }
  if (t.dataset.pr) {
    const r = pl.rows.find(x => x.id === t.closest('tr').dataset.prow); if (!r) return;
    const k = t.dataset.pr;
    if (k === 'label') r.label = t.value;
    else if (k === 'target') r.target = Math.max(0, parseInt(t.value) || 0);
    else if (k === 'pct') { if (!pl.total) return; const pc = Math.max(0, Math.min(100, parseFloat(t.value) || 0)); r.target = Math.round(pc / 100 * pl.total); }
    else if (k === 'type') r.types[t.dataset.t] = Math.max(0, parseInt(t.value) || 0);
    else return;
    pl.updated = nowISO(); touch(); Planner.refresh(); return;
  }
  if (t.dataset.pb !== undefined && t.dataset.pb !== '') { pl.bloom = pl.bloom || [null, null, null, null, null, null]; pl.bloom[+t.dataset.pb] = t.value === '' ? null : Math.max(0, parseInt(t.value) || 0); if (pl.bloom.every(v => v == null)) pl.bloom = null; touch(); refreshPlanSide(); return; }
  if (t.dataset.pd) { pl.diff = pl.diff || {}; pl.diff[t.dataset.pd] = t.value === '' ? null : Math.max(0, Math.min(100, parseInt(t.value) || 0)); touch(); return; }
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset || t.dataset.pr !== 'link') return;
  const ex = curExam(), pl = Planner.ensure(ex), r = pl.rows.find(x => x.id === t.closest('tr').dataset.prow); if (!r) return;
  const [kind, id] = t.value ? t.value.split(':') : ['', '']; r.link = { kind, id: id || '' };
  if (!r.label.trim() && kind) r.label = kind === 'topic' ? (S.topics.find(x => x.id === id) || {}).name || '' : compLabel(id);
  touch(); Planner.refresh(true);
});
const rowOf = b => { const ex = curExam(), pl = Planner.ensure(ex); return [ex, pl, pl.rows.find(x => x.id === b.closest('tr').dataset.prow)]; };
ACT['plan-add-row'] = () => { const ex = curExam(), pl = Planner.ensure(ex); pl.rows.push(Planner.newRow()); touch(); Planner.refresh(true); const ins = $$('#plan-table [data-pr=label]'); if (ins.length) ins[ins.length - 1].focus(); };
ACT['plan-del-row'] = async b => { const [, pl, r] = rowOf(b); if ((r.target || sumTypes(r.types)) && !(await confirmDlg({ title: 'Remove “' + (r.label || 'this row') + '”?', msg: 'Its targets are removed from the plan. Built questions are not affected.', ok: 'Remove', danger: true }))) return; pl.rows = pl.rows.filter(x => x !== r); touch(); Planner.refresh(true); };
ACT['plan-move'] = b => { const [, pl, r] = rowOf(b); const i = pl.rows.indexOf(r), j = i + +b.dataset.d; if (j < 0 || j >= pl.rows.length) return; [pl.rows[i], pl.rows[j]] = [pl.rows[j], pl.rows[i]]; touch(); Planner.refresh(true); };
ACT['plan-clear'] = async () => { const ex = curExam(); if (!(await confirmDlg({ title: 'Clear this exam’s plan?', msg: 'All plan rows and targets are removed. Built questions stay exactly as they are.', ok: 'Clear plan', danger: true }))) return; ex.plan = null; touch(); Planner.refresh(true); toast('Plan cleared.'); };
ACT['plan-from'] = async b => {
  const ex = curExam(), pl = Planner.ensure(ex), byTopic = b.dataset.v === 'topics';
  const src = byTopic ? S.topics.map(t => Planner.newRow(t.name || 'Untitled topic', { kind: 'topic', id: t.id })) : allComps().filter(c => c.text.trim()).map(c => Planner.newRow(c.text, { kind: 'comp', id: c.id }));
  if (!src.length) return toast(byTopic ? 'Add topics in Competencies first.' : 'Add competencies first.', 'info');
  if (pl.rows.length && !(await confirmDlg({ title: 'Replace the current rows?', msg: `This creates ${plural(src.length, 'row')} from your ${byTopic ? 'topics' : 'competencies'} and replaces the ${plural(pl.rows.length, 'row')} you have. Targets start at 0.`, ok: 'Replace rows' }))) return;
  pl.rows = src; touch(); Planner.refresh(true); toast(plural(src.length, 'row') + ' added. Next: set targets, or ask Jin to distribute them.');
};
ACT['plan-sample'] = async () => {
  const ex = curExam(), pl = Planner.ensure(ex);
  if (pl.rows.length && !(await confirmDlg({ title: 'Replace the current plan with the sample?', msg: 'The sample plan has 40 questions across Electricity, Circuits and Energy.', ok: 'Use sample' }))) return;
  Planner.applySample(ex); touch(); Planner.refresh(true); toast('Sample plan loaded: 40 questions across three topics.');
};
Planner.applySample = ex => {
  const pl = Planner.ensure(ex);
  const mk = (label, target, mc, ident, prob, match) => { const r = Planner.newRow(label); r.target = target; Object.assign(r.types, { mc, ident, prob, match }); const l = Planner.bestLink(label); if (l) r.link = { kind: l.kind, id: l.id, auto: l.why !== 'same name' }; return r; };
  pl.total = 40; pl.rows = [mk('Electricity', 12, 6, 2, 3, 1), mk('Circuits', 10, 5, 1, 4, 0), mk('Energy', 18, 8, 3, 5, 2)]; pl.dismissed = []; pl.updated = nowISO();
};
/* Jin: question types for one row */
ACT['plan-types'] = b => {
  const [ex, pl, r] = rowOf(b); if (!r.target) return toast('Set a target for this row first, then Jin can split it into question types.', 'info');
  const s = Planner.suggestTypes(r);
  modal(`<h3>Question types for “${esc(r.label || 'this row')}”</h3><div class="mbody"><img class="chibi-side" src="${CHIBI.idea}" alt=""><p style="margin-top:0">${s.kinds.length ? `I read the competency as <b>${s.kinds.join(' + ')}</b>${s.evidence ? ` (“${esc(s.evidence.slice(0, 90))}”)` : ''}.` : 'I couldn’t find a clear action verb in this row’s competency wording.'} ${esc(s.reasons.join('; '))}.</p>
    <table class="res-table"><thead><tr><th>Type</th><th style="text-align:center">Now</th><th style="text-align:center">Suggested</th></tr></thead><tbody>${PTYPES.filter(t => s.types[t.k] || r.types[t.k]).map(t => `<tr><td>${t.n}</td><td class="num">${r.types[t.k] || 0}</td><td class="num"><b>${s.types[t.k]}</b></td></tr>`).join('')}</tbody></table>
    <p class="hint">This is a starting point based on wording, not a rule. You can edit any cell afterwards.</p><div style="clear:both"></div></div>
    <div class="mfoot"><button class="btn" data-a="modal-close">Dismiss</button><button class="btn blue" id="pt-apply">Apply to this row</button></div>`, { size: 'narrow' });
  $('#pt-apply').onclick = () => { r.types = s.types; touch(); closeModal(true); Planner.refresh(true); toast('Question types updated for ' + (r.label || 'the row') + '.'); };
};
/* Jin: distribute item counts across rows */
ACT['plan-allocate'] = () => {
  const ex = curExam(), pl = Planner.ensure(ex);
  if (!pl.rows.length) return toast('Add topic rows first.', 'info');
  let method = pl.rows.some(r => r.hours) ? 'hours' : 'equal';
  const pr = { H: 3, M: 2, L: 1 };
  const m = modal(`<h3>Distribute questions across topics</h3><div class="hint">Choose a basis. Jin previews the counts first; nothing changes until you apply. Rounding uses largest remainders, so the counts add up exactly to the total.</div>
    <div class="row" style="margin:12px 0"><label class="field" style="width:160px">Total questions<input type="number" min="1" id="al-total" value="${pl.total || ''}"></label><div class="seg" id="al-seg">${[['equal', 'Equal'], ['hours', 'Instructional time'], ['priority', 'Topic priority'], ['pct', 'My percentages']].map(([k, n]) => `<button data-m="${k}" class="${k === method ? 'on' : ''}">${n}</button>`).join('')}</div></div>
    <div id="al-body"></div><div class="mfoot"><button class="btn" data-a="modal-close">Cancel</button><label class="tiny"><input type="checkbox" id="al-types" checked> Also suggest question types for rows that have none</label><button class="btn blue" id="al-apply">Apply</button></div>`, { size: 'wide' });
  const basis = r => method === 'equal' ? 1 : method === 'hours' ? (+r.hours || 0) : method === 'priority' ? pr[r.priority] || 2 : (+r._pct || 0);
  pl.rows.forEach(r => { r._pct = pl.total ? +(r.target / pl.total * 100).toFixed(1) : ''; });
  const draw = () => {
    const total = Math.max(0, parseInt($('#al-total').value) || 0), counts = lrAllocate(pl.rows.map(basis), total);
    const help = { equal: 'Every topic gets about the same number of questions.', hours: 'Enter the class hours (or days) spent on each topic. More time → more questions.', priority: 'Mark each topic High, Medium or Low priority (weights 3 : 2 : 1).', pct: 'Type the percentage you want for each topic. They don’t need to add to exactly 100.' }[method];
    $('#al-body').innerHTML = `<div class="hint" style="margin-bottom:8px">${help}</div><table class="res-table"><thead><tr><th>Topic</th>${method === 'equal' ? '' : `<th>${{ hours: 'Hours', priority: 'Priority', pct: 'Percent' }[method]}</th>`}<th style="text-align:center">Now</th><th style="text-align:center">Preview</th></tr></thead><tbody>${pl.rows.map((r, i) => `<tr><td>${esc(r.label || 'Row ' + (i + 1))}</td>${method === 'equal' ? '' : `<td>${method === 'priority' ? `<select class="inp sm" data-al="${i}">${['H', 'M', 'L'].map(p => `<option value="${p}"${r.priority === p ? ' selected' : ''}>${{ H: 'High', M: 'Medium', L: 'Low' }[p]}</option>`).join('')}</select>` : `<input class="inp sm" style="width:90px" type="number" min="0" step="0.5" data-al="${i}" value="${method === 'hours' ? (r.hours ?? '') : r._pct}">`}</td>`}<td class="num">${r.target}</td><td class="num"><b>${counts[i]}</b></td></tr>`).join('')}</tbody><tfoot><tr><th>Total</th>${method === 'equal' ? '' : '<th></th>'}<th style="text-align:center">${pl.rows.reduce((s, r) => s + r.target, 0)}</th><th style="text-align:center">${counts.reduce((a, b) => a + b, 0)}</th></tr></tfoot></table>${method !== 'equal' && pl.rows.every(r => !basis(r)) ? '<div class="pl-status warn">Enter at least one value to see a preview.</div>' : ''}`;
    $$('#al-body [data-al]').forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { const r = pl.rows[+inp.dataset.al]; if (method === 'hours') r.hours = inp.value === '' ? null : +inp.value; else if (method === 'priority') r.priority = inp.value; else r._pct = inp.value; const f = document.activeElement === inp ? inp.dataset.al : null; draw(); if (f !== null) { const n = $(`#al-body [data-al="${f}"]`); if (n) { n.focus(); if (n.setSelectionRange && n.type !== 'number') n.setSelectionRange(99, 99); } } }));
  };
  draw();
  $('#al-total').addEventListener('input', draw);
  $('#al-seg').addEventListener('click', e => { const bt = e.target.closest('[data-m]'); if (!bt) return; method = bt.dataset.m; $$('#al-seg button').forEach(x => x.classList.toggle('on', x === bt)); draw(); });
  $('#al-apply').onclick = () => {
    const total = Math.max(0, parseInt($('#al-total').value) || 0); if (!total) return toast('Enter the total number of questions.', 'error');
    if (pl.rows.every(r => !basis(r))) return toast('Enter values for the chosen basis first.', 'error');
    const counts = lrAllocate(pl.rows.map(basis), total); pl.total = total;
    pl.rows.forEach((r, i) => { r.target = counts[i]; if ($('#al-types').checked && !sumTypes(r.types) && r.target) r.types = Planner.suggestTypes(r).types; else if (sumTypes(r.types) && sumTypes(r.types) !== r.target) { const keys = PTYPES.map(t => t.k), c = lrAllocate(keys.map(k => r.types[k]), r.target); keys.forEach((k, j) => r.types[k] = c[j]); } delete r._pct; });
    touch(); closeModal(true); Planner.refresh(true); toast('Targets distributed: ' + total + ' questions.');
  };
};
/* bank suggestions for a slot */
ACT['plan-suggest'] = b => {
  const ex = curExam(), pl = Planner.ensure(ex), r = pl.rows.find(x => x.id === b.dataset.row), type = b.dataset.t || '';
  if (!r) return;
  const draw = () => {
    const list = Planner.suggestFor(ex, r.id, type);
    return `<h3>Fill “${esc(r.label || 'this row')}” · ${type ? PT[type].n : 'any type'}</h3><div class="hint">Matches from your item bank, best first. Adding copies the item into this exam${r.link.kind === 'comp' ? ' and tags it with this row’s competency if it has none' : ''}.</div>
      <div style="max-height:52vh;overflow:auto;margin-top:10px">${list.length ? list.map(x => `<div class="bankitem"><div class="body"><div class="row"><span class="tag gray">${TYPE_SHORT[x.q.type]}</span>${isLeaf(x.q) ? `<span class="tag gold">${BL[x.q.bloom]}</span>` : `<span class="tag">${kidsOf(x.q).length} items</span>`}</div><div class="stem">${esc((Classify.textOf(x.q) || stripHTML(x.q.stem) || '(no text)').slice(0, 200))}</div><div class="why"><b>Why:</b> ${esc(x.why.join('; '))}.</div></div><div class="acts"><button class="btn sm blue" data-sg="${x.q.id}">${icon('plus')}Add</button></div></div>`).join('') : `<div class="empty"><img src="${CHIBI.sad}" alt=""><b>No matching bank items</b>${r.link.kind ? '' : 'This row isn’t linked to a topic or competency, so I can only match by wording. '}You can write a new ${type ? PT[type].n.toLowerCase() : ''} item instead.</div>`}</div>
      <div class="mfoot"><button class="btn" data-sg-new="1">${icon('plus')}Write a new ${type ? esc(PT[type].n.toLowerCase()) : 'item'}</button><span class="spacer"></span><button class="btn blue" data-a="modal-close">Done</button></div>`;
  };
  const m = modal(draw(), { size: 'wide', onClose: () => Planner.refresh(true) || (APP.examTab === 'builder' && Exam.refreshMeta()) });
  m.addEventListener('click', e => {
    const add = e.target.closest('[data-sg]');
    if (add) { const src = Q(add.dataset.sg); const c = cloneQ(src, { inBank: false, srcBank: src.id }); if (r.link.kind === 'comp') (isGroup(c) ? kidsOf(c) : [c]).forEach(k => { if (!k.comp) { k.comp = r.link.id; k.compConf = 'manual'; } }); ex.items.push(...fmtAdopt(ex, c)); ex.updated = nowISO(); touch(); toast('Added to the exam.'); m.innerHTML = `<button class="mclose" data-a="modal-close" aria-label="Close">${icon('x')}</button>` + draw(); if (APP.examTab === 'builder') Exam.rerender(); return; }
    if (e.target.closest('[data-sg-new]')) { closeModal(true); Planner.addNew(ex, r, type || 'mc'); }
  });
};
Planner.addNew = (ex, r, type) => {
  const t = type === 'match' ? 'matching' : type; const q = newQ(t); S.qs.push(q);
  const comp = r.link.kind === 'comp' ? r.link.id : '';
  if (t === 'passage') { const k = newQ('mc', { parent: q.id, comp, compConf: comp ? 'manual' : '' }); S.qs.push(k); q.kids.push(k.id); }
  if (t === 'matching') { q.head = 'Match each item in Column A with the correct answer in Column B.'; for (let i = 0; i < 3; i++) { const k = newQ('match', { parent: q.id, comp, compConf: comp ? 'manual' : '' }); S.qs.push(k); q.kids.push(k.id); } }
  if (comp && isLeaf(q)) { q.comp = comp; q.compConf = 'manual'; }
  ex.items.push(q.id); ex.updated = nowISO(); touch(); APP.examTab = 'builder'; App.go('exam');
  setTimeout(() => { const c = $(`.qcard[data-id="${q.id}"]`); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); const ed = c.querySelector('.ed,input:not([type=radio])'); if (ed) ed.focus(); } }, 80);
  if (!comp) toast('New item added. Tag it with a competency so it counts toward “' + (r.label || 'the row') + '”.', 'info', 5000);
};

/* ---------- Jin: context-aware planning coach ---------- */
Planner.advice = function (ex) {
  const P = this.progress(ex), pl = P.pl, A = [], rl = r => r.label || 'Untitled row';
  const add = o => A.push(o);
  const focus = sel => () => { APP.examTab = 'planner'; if (APP.screen !== 'exam') App.go('exam'); else if (!$('#plan-table') && !$(sel)) Exam.render(); setTimeout(() => { const el = $(sel); if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus(); if (el.select) el.select(); } }, 60); };
  if (!pl.rows.length) {
    add({ key: 'start', sev: 'info', title: 'Start by listing what this exam covers', why: S.topics.length ? `You have ${plural(S.topics.length, 'topic')} with ${plural(allComps().length, 'competency', 'competencies')} saved. I can turn them into plan rows.` : 'No topics are saved yet. You can add rows by hand or start from the sample plan.', actions: [...(S.topics.length ? [{ label: 'Rows from topics', run: () => ACT['plan-from']({ dataset: { v: 'topics' } }) }] : []), { label: 'Use sample plan', run: () => ACT['plan-sample']() }], edit: { label: 'Add a row', run: () => ACT['plan-add-row']() } });
    return A;
  }
  if (!pl.total) add({ key: 'total', sev: 'warn', title: 'How many questions should the exam have?', why: 'Without a total I can’t compute percentages or check that the topic targets add up.' + (P.rowSum ? ` Your rows currently add up to ${P.rowSum}.` : ''), actions: P.rowSum ? [{ label: `Use ${P.rowSum} (the row total)`, run: () => { pl.total = P.rowSum; touch(); Planner.refresh(true); } }] : [], edit: { label: 'Type a total', run: focus('[data-pl=total]') } });
  const zeroRows = pl.rows.filter(r => !r.target);
  if (pl.total && zeroRows.length === pl.rows.length) add({ key: 'alloc', sev: 'warn', title: `Distribute ${pl.total} questions across ${plural(pl.rows.length, 'topic')}`, why: 'No topic has a target yet. I can split them by instructional time, topic priority or your own percentages — or equally if every topic matters the same.', actions: [{ label: 'Choose a method…', run: () => ACT['plan-allocate']() }], edit: { label: 'Type targets myself', run: focus('#plan-table [data-pr=target]') } });
  else if (pl.total && P.rowSum !== pl.total) {
    const scaled = lrAllocate(pl.rows.map(r => r.target), pl.total);
    add({ key: 'reconcile:' + P.rowSum + ':' + pl.total, sev: 'warn', title: `Topic targets add up to ${P.rowSum}, not ${pl.total}`, why: `${P.rowSum < pl.total ? pl.total - P.rowSum + ' questions are unallocated' : P.rowSum - pl.total + ' too many are allocated'}. Scaling keeps each topic’s share: ${pl.rows.map((r, i) => `${rl(r)} ${r.target}→${scaled[i]}`).join(', ')}.`, actions: [{ label: `Scale rows to ${pl.total}`, run: async () => { if (!(await confirmDlg({ title: 'Scale all topic targets?', msg: pl.rows.map((r, i) => `${rl(r)}: ${r.target} → ${scaled[i]}`).join(' · '), ok: 'Scale rows', chibi: 'idea' }))) return; pl.rows.forEach((r, i) => { r.target = scaled[i]; if (sumTypes(r.types)) { const k = PTYPES.map(t => t.k), c = lrAllocate(k.map(x => r.types[x]), r.target); k.forEach((x, j) => r.types[x] = c[j]); } }); touch(); Planner.refresh(true); } }, { label: `Make the total ${P.rowSum}`, run: () => { pl.total = P.rowSum; touch(); Planner.refresh(true); } }], edit: { label: 'Edit targets', run: focus('#plan-table [data-pr=target]') } });
  }
  P.rows.forEach(x => {
    const r = x.row, ts = sumTypes(r.types);
    if (r.target && ts && ts !== r.target) {
      add({ key: 'types:' + r.id + ':' + ts + ':' + r.target, sev: 'warn', title: `${rl(r)}: question types add up to ${ts} of ${r.target}`, why: `The type cells and the row total must match for progress to be exact.`, actions: [{ label: ts < r.target ? `Add ${r.target - ts} using suggested types` : `Scale types down to ${r.target}`, run: () => { if (ts < r.target) { const extra = Planner.suggestTypes(r, r.target - ts).types; PTYPES.forEach(t => r.types[t.k] += extra[t.k]); } else { const k = PTYPES.map(t => t.k), c = lrAllocate(k.map(t => r.types[t]), r.target); k.forEach((t, j) => r.types[t] = c[j]); } touch(); Planner.refresh(true); } }], edit: { label: 'Edit this row', run: focus(`tr[data-prow="${r.id}"] [data-pr=type]`) } });
    } else if (r.target && !ts) {
      const s = Planner.suggestTypes(r);
      add({ key: 'notypes:' + r.id, sev: 'info', title: `Choose question types for ${rl(r)}`, why: `${s.kinds.length ? 'Its wording reads as ' + s.kinds.join(' + ') + ' — ' : ''}${s.reasons[0]}. Suggested: ${PTYPES.filter(t => s.types[t.k]).map(t => s.types[t.k] + ' ' + t.s).join(', ')}.`, actions: [{ label: 'Apply suggestion', run: () => { r.types = s.types; touch(); Planner.refresh(true); } }], edit: { label: 'Set types myself', run: focus(`tr[data-prow="${r.id}"] [data-pr=type]`) } });
    }
    /* type mix vs. what the competency asks students to do */
    if (r.target >= 4 && ts && fmtOf(ex) === 'scantron') {
      const kinds = Planner.kindsOf(r), mcShare = (r.types.mc || 0) / ts, appl = kinds.apply || kinds.analyze || kinds.create;
      if (mcShare >= .7 && appl && !r.types.prob && !r.types.passage) {
        const want = kinds.analyze && !kinds.apply ? 'passage' : 'prob', ev = Planner.typeMix(r).evidence;
        add({ key: 'mix:' + r.id, sev: 'info', title: `${rl(r)} has ${r.target} planned items, but ${r.types.mc} are multiple choice`, why: `The competency asks students to ${kinds.apply ? 'apply or calculate' : kinds.analyze ? 'analyze' : 'create'}${ev ? ` (“${ev.slice(0, 70)}”)` : ''}. Multiple choice mostly checks recognition; ${want === 'prob' ? 'a problem-solving item would show whether students can actually apply it' : 'a passage-based item gives them data to analyze'}.`, actions: [{ label: `Move 1 MC target to ${PT[want].n.toLowerCase()}`, run: () => { r.types.mc--; r.types[want]++; touch(); Planner.refresh(true); } }, { label: `Find ${PT[want].n.toLowerCase()} items in the bank`, run: () => { Bank.f = { q: '', type: want === 'prob' ? 'prob' : 'passage', bloom: '', comp: r.link.kind === 'topic' ? 'topic:' + r.link.id : r.link.kind === 'comp' ? r.link.id : '', attn: false }; App.go('bank'); } }], edit: { label: 'Edit types', run: focus(`tr[data-prow="${r.id}"] [data-t=${want}]`) } });
      }
    }
    if (!r.link.kind) {
      const best = Planner.bestLink(r.label);
      add({ key: 'link:' + r.id, sev: r.target ? 'warn' : 'info', title: `${rl(r)} isn’t linked to a topic or competency`, why: `Built questions are counted through their competency, so this row will stay at 0 even after you add questions.${best ? ` Possible match: ${best.kind === 'topic' ? 'topic' : 'competency'} “${(best.kind === 'topic' ? (S.topics.find(t => t.id === best.id) || {}).name : compLabel(best.id)).slice(0, 60)}” (${best.why}).` : ' I found no topic or competency with similar wording.'}`, actions: [...(best ? [{ label: 'Link to that match', run: () => { r.link = { kind: best.kind, id: best.id }; touch(); Planner.refresh(true); } }] : []), ...(r.label.trim() && !S.topics.some(t => (t.name || '').toLowerCase() === r.label.trim().toLowerCase()) ? [{ label: `Create topic “${r.label.trim().slice(0, 30)}”`, run: async () => { if (!(await confirmDlg({ title: `Create the topic “${r.label.trim()}”?`, msg: 'It is added to Competencies so you can list its competencies and tag questions with them. This row is linked to it.', ok: 'Create topic', chibi: 'idea' }))) return; const t = { id: uid(), name: r.label.trim(), comps: [] }; S.topics.push(t); r.link = { kind: 'topic', id: t.id }; touch(); Planner.refresh(true); toast('Topic created. Add its competencies in Competencies.'); } }] : [])], edit: { label: 'Choose a link', run: focus(`tr[data-prow="${r.id}"] [data-pr=link]`) } });
    } else if (r.link.auto) add({ key: 'autolink:' + r.id + r.link.id, sev: 'info', title: `Check the link for ${rl(r)}`, why: `I linked it automatically to ${Planner.linkLabel(r)} because the words match. Shared words don’t prove they’re the same outcome.`, actions: [{ label: 'Looks right', run: () => { r.link.auto = false; touch(); Planner.refresh(true); } }], edit: { label: 'Change link', run: focus(`tr[data-prow="${r.id}"] [data-pr=link]`) } });
  });
  /* similar rows (hedged; keyword overlap is not equivalence) */
  if (pl.rows.length >= 2) {
    const items = pl.rows.map(r => ({ id: r.id, text: Planner.rowTexts(r).join(' — ').slice(0, 300), topic: '' }));
    const R = Classify.compareComps(items);
    R.pairs.filter(p => p.kind === 'dup' || p.kind === 'overlap').slice(0, 2).forEach(p => {
      const a = pl.rows.find(r => r.id === p.a.id), b = pl.rows.find(r => r.id === p.b.id);
      add({ key: 'sim:' + a.id + b.id, sev: 'info', title: `${rl(a)} and ${rl(b)} may overlap`, why: `Their wording shares ${p.shared.slice(0, 4).join(', ') || 'several words'}. Shared words alone don’t prove they assess the same skill — check that each row targets a different outcome so items aren’t double-counted.`, actions: [{ label: 'Compare competencies', run: () => Jin.togglePanel(true, 'compare') }], edit: null });
    });
  }
  /* Bloom coverage */
  if (pl.bloom) {
    const bs = pl.bloom.reduce((s, v) => s + (v || 0), 0);
    if (pl.total && bs !== pl.total) add({ key: 'bloomsum:' + bs, sev: 'warn', title: `Bloom targets add up to ${bs}, not ${pl.total}`, why: 'Each question has one level, so the Bloom targets should total the exam size.', actions: [{ label: `Scale to ${pl.total}`, run: () => { const c = lrAllocate(pl.bloom.map(v => v || 0), pl.total); pl.bloom = c; touch(); Planner.refresh(true); } }], edit: { label: 'Edit Bloom targets', run: () => { $('#plan-optional').open = true; focus('[data-pb="0"]')(); } } });
    if (P.built) { const diffs = pl.bloom.map((v, i) => v == null ? 0 : P.bloomAct[i] - v); const worst = diffs.map((d, i) => [d, i]).filter(x => x[0] < 0).sort((a, b) => a[0] - b[0])[0]; if (worst) add({ key: 'bloomgap:' + worst[1] + ':' + P.bloomAct[worst[1]], sev: 'info', title: `${BL[worst[1]]}: ${P.bloomAct[worst[1]]} built, ${pl.bloom[worst[1]]} planned`, why: `Uneven Bloom coverage. Levels come from each question’s classification (Original Bloom 1956) — some may be provisional.`, actions: [{ label: 'Review Bloom levels', run: () => App.go('comps') }, { label: 'Open the Bloom report', run: () => { APP.examTab = 'builder'; App.go('exam'); ACT['bloom-report'](); } }], edit: null }); }
  } else if (pl.rows.some(r => sumTypes(r.types)) && fmtOf(ex) === 'scantron') {
    const t = P.typeTotals, hi = t.prob + t.passage + t.cmc + t.morse, all = PTYPES.reduce((s, x) => s + t[x.k], 0);
    if (all >= 10 && hi / all < .15) add({ key: 'hots', sev: 'info', title: 'The plan leans on recall-style formats', why: `Only ${hi} of ${all} planned items are problem solving, statement-combination, Morse or passage-based — formats that usually reach Application and Analysis.`, actions: [{ label: 'Add Bloom targets', run: () => { $('#plan-optional').open = true; focus('[data-pb="2"]')(); } }], edit: null });
  }
  /* build progress vs plan */
  if (P.built) {
    P.cells.filter(c => c.a < c.p).sort((a, b) => (b.p - b.a) - (a.p - a.a)).slice(0, 3).forEach(c => {
      const n = Planner.suggestFor(ex, c.x.row.id, c.t).length, tn = c.t ? PT[c.t].n : 'questions';
      add({ key: 'gap:' + c.x.row.id + c.t + ':' + c.a, sev: 'info', title: `${rl(c.x.row)} · ${tn}: ${c.a} of ${c.p} built`, why: n ? `${plural(n, 'bank item')} could fill this slot — matched by competency, topic or wording.` : 'No matching bank item yet, so a new item is needed.', actions: [n ? { label: `Show ${n} bank match${n === 1 ? '' : 'es'}`, run: () => ACT['plan-suggest']({ dataset: { row: c.x.row.id, t: c.t } }) } : { label: `Write a new ${c.t ? PT[c.t].n.toLowerCase() : 'item'}`, run: () => Planner.addNew(ex, c.x.row, c.t || 'mc') }], edit: null });
    });
    P.cells.filter(c => c.a > c.p).slice(0, 2).forEach(c => add({ key: 'over:' + c.x.row.id + c.t + ':' + c.a, sev: 'warn', title: `${rl(c.x.row)} · ${c.t ? PT[c.t].n : 'all types'}: ${c.a} built, ${c.p} planned`, why: `${c.a - c.p} more than planned. That’s fine if intended — targets never block the build.`, actions: [{ label: `Raise the target to ${c.a}`, run: () => { if (c.t) { c.x.row.types[c.t] = c.a; c.x.row.target = Math.max(c.x.row.target, sumTypes(c.x.row.types)); } else c.x.row.target = c.a; touch(); Planner.refresh(true); } }, { label: 'Review in Exam Builder', run: () => { APP.examTab = 'builder'; App.go('exam'); } }], edit: null }));
    if (P.outside) add({ key: 'outside:' + P.outside, sev: 'warn', title: `${plural(P.outside, 'built question')} aren’t counted in the plan`, why: 'They have no competency, or their competency isn’t linked to any plan row.', actions: [{ label: 'Assign competencies', run: () => App.go('comps') }], edit: null });
  }
  /* points and time */
  const C = examChecks(ex);
  if (pl.points && C.points && pl.points !== C.points) add({ key: 'pts:' + C.points, sev: fmtOf(ex) === 'onepage' ? 'warn' : 'info', title: `The ${fmtOf(ex) === 'onepage' ? 'quiz' : 'exam'} is worth ${C.points} points; the plan says ${pl.points}`, why: fmtOf(ex) === 'onepage' ? 'One-page quizzes add up the points of every item. Adjust item points in the Exam Builder, or change the target.' : 'Problem-solving items count their points, so totals can drift as you build.', actions: [{ label: `Update the plan to ${C.points}`, run: () => { pl.points = C.points; touch(); Planner.refresh(true); } }], edit: { label: 'Edit points', run: focus('[data-pl=points]') } });
  if (pl.duration) {
    const per = { mc: 1, ident: 1, match: .75, prob: 0, cmc: 1.5, morse: 1, passage: 1.5 }; let est = 0;
    if (P.built) P.L.leaves.forEach(q => { const t = Planner.actualType(q); est += t === 'prob' ? 2.5 * weight(q) : per[t] || 1; });
    else PTYPES.forEach(t => est += P.typeTotals[t.k] * (t.k === 'prob' ? 5 : per[t.k]));
    est = Math.round(est);
    if (est > pl.duration) add({ key: 'time:' + est, sev: 'warn', title: `This may not fit in ${pl.duration} minutes`, why: `A rough estimate is ~${est} minutes (about 1 min per multiple-choice item, 1.5 for passage or statement items, 2–3 min per problem-solving point). Your students may differ.`, actions: [], edit: { label: 'Edit duration', run: focus('[data-pl=duration]') } });
  }
  if (!A.some(a => a.sev !== 'info') && P.built && !P.remaining && !P.over) add({ key: 'done', sev: 'ok', title: 'The exam matches the plan', why: `All ${P.planned} planned slots are filled.`, actions: [{ label: 'Preview the exam', run: () => { APP.examTab = 'builder'; App.go('exam'); ACT.preview(); } }, { label: 'Open the TOS', run: () => App.go('tos') }], edit: null });
  return A;
};
Planner._adv = {};
Planner.coachHTML = function (ex, P) {
  const pl = this.ensure(ex), all = this.advice(ex), shown = all.filter(a => !pl.dismissed.includes(a.key)), hidden = all.length - shown.length;
  this._adv = Object.fromEntries(all.map(a => [a.key, a]));
  const next = shown.find(a => a.sev === 'bad' || a.sev === 'warn') || shown[0];
  const pose = shown.some(a => a.sev === 'warn' || a.sev === 'bad') ? 'planning' : next && next.sev === 'ok' ? 'celebrating' : 'welcome';
  return `<div class="card jin-coach" id="jin-coach"><div class="coach-head"><img src="assets/jin/anime-${pose}-face.webp" alt="Jin"><div><span class="eyebrow">JIN · PLANNING COACH</span><h3>${next ? (next.sev === 'ok' ? 'Looking good!' : 'Next step: ' + esc(next.title)) : 'All clear — nothing to suggest right now.'}</h3></div></div>
    ${shown.slice(0, 5).map(a => this.adviceItem(a)).join('')}
    ${shown.length > 5 ? `<button class="link" data-a="assistant" data-tab="plan">See ${shown.length - 5} more in Jin’s panel →</button>` : ''}
    ${hidden ? `<div class="tiny" style="margin-top:6px">${plural(hidden, 'tip')} dismissed · <button class="link" data-a="padv-restore">show again</button></div>` : ''}
    <div class="tiny" style="margin-top:8px;color:var(--faint)">Based on this exam’s plan, competencies, Bloom levels, item bank and build progress — computed on this device.</div></div>`;
};
Planner.adviceItem = function (a) {
  const pill = { bad: 'dup', warn: 'overlap', info: 'separate', ok: 'related' }[a.sev] || 'separate', label = { bad: 'FIX', warn: 'CHECK', info: 'IDEA', ok: 'GOOD' }[a.sev] || 'IDEA';
  return `<div class="match-row" data-advk="${esc(a.key)}"><span class="match-pill ${pill}">${label}</span><span><b>${esc(a.title)}</b><small>${esc(a.why)}</small>
    <span class="adv-acts">${a.actions.map((x, i) => `<button class="btn sm ${i ? '' : 'blue'}" data-a="padv" data-k="${esc(a.key)}" data-i="${i}">${esc(x.label)}</button>`).join('')}${a.edit ? `<button class="btn sm ghost" data-a="padv-edit" data-k="${esc(a.key)}">${esc(a.edit.label)}</button>` : ''}${a.sev !== 'ok' ? `<button class="btn sm ghost" data-a="padv-dismiss" data-k="${esc(a.key)}" title="Hide this tip">Dismiss</button>` : ''}</span></span></div>`;
};
const advFor = b => { const ex = curExam(); if (!Planner._adv[b.dataset.k]) Planner.advice(ex).forEach(a => Planner._adv[a.key] = a); return Planner._adv[b.dataset.k]; };
ACT['padv'] = b => { const a = advFor(b); if (!a) return; const x = a.actions[+b.dataset.i]; if (x) return x.run(); };
ACT['padv-edit'] = b => { const a = advFor(b); if (a && a.edit) a.edit.run(); };
ACT['padv-dismiss'] = b => { const ex = curExam(), pl = Planner.ensure(ex); if (!pl.dismissed.includes(b.dataset.k)) pl.dismissed.push(b.dataset.k); touch(); Planner.refreshSide(); if ($('#assistant').classList.contains('open')) Jin.renderPanel(); };
ACT['padv-restore'] = () => { const ex = curExam(); Planner.ensure(ex).dismissed = []; touch(); Planner.refreshSide(); if ($('#assistant').classList.contains('open')) Jin.renderPanel(); };
