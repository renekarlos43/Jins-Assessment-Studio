/* Jin Assessment Studio — Topics, learning competencies, and classification review */
'use strict';
const Comps = {
  scope: 'exam', onlyUncertain: true,
  usage() { const m = {}; S.qs.forEach(q => { if (isLeaf(q) && q.comp) m[q.comp] = (m[q.comp] || 0) + 1; }); return m; },
  render() {
    const el = $('#screen-comps'), use = this.usage();
    el.innerHTML = `<div class="toolbar"><div class="tabtitle">Competencies &amp; Bloom’s levels</div>
        <button class="btn" data-a="topic-add">${icon('plus')}Add topic</button>
        <button class="btn" data-a="assistant" data-tab="compare">${icon('spark')}Compare with Jin</button>
        <button class="btn blue" data-a="suggest-comps">${icon('wand')}Suggest assignments</button></div>
      <div class="grid2"><div style="min-width:0">
        ${S.topics.length ? S.topics.map((t, ti) => `<div class="topic" data-topic="${t.id}"><div class="topic-head"><span class="tag gold">Topic ${ti + 1}</span><input data-tn="${t.id}" value="${esc(t.name)}" placeholder="Topic name, e.g., Electricity"><button class="btn icon sm ghost" data-a="topic-move" data-d="-1" title="Move topic up">${icon('up')}</button><button class="btn icon sm ghost" data-a="topic-move" data-d="1" title="Move topic down">${icon('down')}</button><button class="btn icon sm ghost" data-a="topic-del" title="Remove topic">${icon('trash')}</button></div>
          ${t.comps.map((c, ci) => `<div class="comp-row" data-comp="${c.id}"><span class="cn">${ti + 1}.${ci + 1}</span><input data-ct="${c.id}" value="${esc(c.text)}" placeholder="Learning competency, e.g., Explain the relationship among current, voltage, and resistance"><span class="cnt">${use[c.id] ? plural(use[c.id], 'item') : 'no items'}</span><button class="btn icon sm ghost" data-a="comp-move" data-d="-1" title="Move up">${icon('up')}</button><button class="btn icon sm ghost" data-a="comp-move" data-d="1" title="Move down">${icon('down')}</button><button class="btn icon sm ghost" data-a="comp-del" title="Remove">${icon('x')}</button></div>`).join('')}
          <button class="btn sm" data-a="comp-add" style="margin-top:6px">${icon('plus')}Add competency</button></div>`).join('') :
          `<div class="empty"><img src="${CHIBI.idea}" alt=""><b>No competencies yet</b>Add a topic, then list its learning competencies. They feed the TOS and automatic matching.<div class="row" style="justify-content:center;margin-top:12px"><button class="btn blue" data-a="topic-add">${icon('plus')}Add topic</button><button class="btn" data-a="comps-paste">Paste a list</button></div></div>`}
        ${S.topics.length ? `<div class="row"><button class="btn sm" data-a="comps-paste">${icon('upload')}Paste a list of competencies</button></div>` : ''}
        <div class="card" style="margin-top:16px" id="class-review">${this.reviewHTML()}</div>
      </div>
      <div style="min-width:0">
        <div class="card"><div class="cardhead"><h2>Original Bloom’s Taxonomy (1956)</h2></div>
          ${[['Knowledge', 'K', 'Recall previously learned facts, definitions, terminology, concepts and formulas. A definition given with the term as the answer is Knowledge.'], ['Comprehension', 'C', 'Explain, interpret, summarize, classify or show understanding. Passage-based items start here at the lowest.'], ['Application', 'AP', 'Use learned knowledge, principles, formulas or procedures to solve problems or address new situations.'], ['Analysis', 'AN', 'Examine information by identifying relationships, patterns, assumptions, causes or errors.'], ['Synthesis', 'S', 'Combine information or concepts to formulate hypotheses, construct models, develop plans or produce an organized solution.'], ['Evaluation', 'E', 'Make and defend judgments using evidence, criteria or established standards.']].map(([n, k, d]) => `<div class="minirow" style="align-items:flex-start"><span class="tag gold" style="width:34px;justify-content:center">${k}</span><span style="flex:1"><b style="font-size:13px">${n}</b><div class="hint">${d}</div></span></div>`).join('')}
        </div>
        <div class="card"><div class="cardhead"><h2>How suggestions work</h2></div><div class="hint">Jin matches each question’s words to competency wording and topic names, and reads question cues (“calculate”, “why”, “which is most…”) for Bloom’s level. Every suggestion is editable. Items marked <span class="conf low">? uncertain</span> had weak or mixed evidence — confirm them in the review list.</div></div>
      </div></div>`;
  },
  reviewList() {
    const ex = curExam(); let list = [];
    if (this.scope === 'exam' && ex) list = layout(ex).leaves; else list = bankItems().flatMap(q => isGroup(q) ? kidsOf(q) : [q]);
    if (this.onlyUncertain) list = list.filter(q => (!q.bloomManual && q.bloomConf === 'Low') || !q.comp || q.compConf === 'low');
    return list;
  },
  reviewHTML() {
    const ex = curExam(), list = this.reviewList(), L = ex ? layout(ex) : null;
    const compSel = q => `<select class="inp sm" data-rv="comp" style="width:100%"><option value="">— none —</option>${S.topics.map(t => `<optgroup label="${esc(t.name || 'Competencies')}">${t.comps.map(c => `<option value="${c.id}"${c.id === q.comp ? ' selected' : ''}>${esc(c.text.slice(0, 70))}</option>`).join('')}</optgroup>`).join('')}</select>`;
    const rows = list.slice(0, 200).map(q => `<tr data-id="${q.id}"><td>${L && L.num[q.id] ? rg(L.num[q.id]) : '•'}</td><td>${esc(Classify.textOf(q).slice(0, 140) || '(empty)')}<div class="tiny">${TYPE_SHORT[q.type]}</div></td>
      <td style="min-width:150px"><select class="inp sm" data-rv="bloom" style="width:100%">${BL.map((b, i) => `<option value="${i}"${i === q.bloom ? ' selected' : ''}>${b}</option>`).join('')}</select><div class="why">${q.bloomManual ? '<span class="conf ok">✓ set by you</span>' : `<span class="conf ${Classify.CONF[q.bloomConf] || 'low'}">${q.bloomConf === 'Low' ? '? uncertain' : q.bloomConf || '?'}</span> ${esc(q.bloomWhy || '')}`}</div></td>
      <td style="min-width:200px">${compSel(q)}<div class="why">${q.compConf === 'manual' ? '<span class="conf ok">✓ set by you</span>' : q.comp ? `<span class="conf ${q.compConf === 'low' ? 'low' : 'med'}">${q.compConf === 'low' ? '? uncertain' : 'suggested'}</span> ${esc(q.compWhy || '')}` : '<span class="conf low">not assigned</span>'}</div></td>
      <td><button class="btn sm" data-a="rv-accept">${icon('check')}Confirm</button></td></tr>`).join('');
    return `<div class="cardhead"><h2>Classification review</h2><span class="tiny">${plural(list.length, 'item')}</span>
        <span class="right row"><div class="seg"><button class="${this.scope === 'exam' ? 'on' : ''}" data-a="rv-scope" data-v="exam">Current exam</button><button class="${this.scope === 'bank' ? 'on' : ''}" data-a="rv-scope" data-v="bank">Item bank</button></div>
        <label class="tiny"><input type="checkbox" data-a="rv-uncertain"${this.onlyUncertain ? ' checked' : ''}> Uncertain only</label>${list.length ? `<button class="btn sm" data-a="rv-accept-all">Confirm all shown</button>` : ''}</span></div>
      ${list.length ? `<div style="overflow:auto;max-height:520px"><table class="review-table"><thead><tr><th>Item</th><th>Question</th><th>Bloom level</th><th>Competency</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>${list.length > 200 ? '<div class="hint">Showing the first 200.</div>' : ''}` : `<div class="okbox">Nothing to review here — every item has a confident Bloom level and a competency.</div>`}`;
  },
  refreshReview() { const c = $('#class-review'); if (c) c.innerHTML = this.reviewHTML(); }
};
document.addEventListener('input', e => {
  const t = e.target; if (!t.closest || !t.closest('#screen-comps')) return;
  if (t.dataset.tn) { const tp = S.topics.find(x => x.id === t.dataset.tn); if (tp) { tp.name = t.value; touch(); } }
  else if (t.dataset.ct) { for (const tp of S.topics) { const c = tp.comps.find(c => c.id === t.dataset.ct); if (c) { c.text = t.value; touch(); break; } } }
});
document.addEventListener('change', e => {
  const t = e.target; if (!t.dataset || !t.dataset.rv) return; const tr = t.closest('tr[data-id]'); const q = Q(tr.dataset.id); if (!q) return;
  if (t.dataset.rv === 'bloom') { q.bloom = +t.value; q.bloomManual = true; }
  if (t.dataset.rv === 'comp') { q.comp = t.value; q.compConf = t.value ? 'manual' : ''; }
  touchQ(q);
});
const topicOf = b => S.topics.find(t => t.id === b.closest('[data-topic]').dataset.topic);
ACT['topic-add'] = () => { S.topics.push({ id: uid(), name: '', comps: [{ id: uid(), text: '' }] }); touch(); Comps.render(); const ins = $$('#screen-comps [data-tn]'); if (ins.length) ins[ins.length - 1].focus(); };
ACT['topic-move'] = b => { const t = topicOf(b), i = S.topics.indexOf(t), j = i + +b.dataset.d; if (j < 0 || j >= S.topics.length) return; [S.topics[i], S.topics[j]] = [S.topics[j], S.topics[i]]; touch(); Comps.render(); };
ACT['topic-del'] = async b => {
  const t = topicOf(b), use = Comps.usage(), n = t.comps.reduce((s, c) => s + (use[c.id] || 0), 0);
  if ((t.name || t.comps.some(c => c.text)) && !(await confirmDlg({ title: 'Remove topic “' + (t.name || 'Untitled') + '”?', msg: n ? `Its ${plural(t.comps.length, 'competency', 'competencies')} will be removed and ${plural(n, 'item')} will become unassigned.` : 'Its competencies will be removed.', ok: 'Remove', danger: true }))) return;
  const ids = new Set(t.comps.map(c => c.id)); S.qs.forEach(q => { if (ids.has(q.comp)) { q.comp = ''; q.compConf = ''; } });
  S.topics = S.topics.filter(x => x !== t); touch(); Comps.render();
};
ACT['comp-add'] = b => { const t = topicOf(b); t.comps.push({ id: uid(), text: '' }); touch(); Comps.render(); const r = $(`#screen-comps [data-topic="${t.id}"] .comp-row:last-of-type input`); if (r) r.focus(); };
ACT['comp-move'] = b => { const t = topicOf(b), id = b.closest('[data-comp]').dataset.comp, i = t.comps.findIndex(c => c.id === id), j = i + +b.dataset.d; if (j < 0 || j >= t.comps.length) return; [t.comps[i], t.comps[j]] = [t.comps[j], t.comps[i]]; touch(); Comps.render(); };
ACT['comp-del'] = async b => {
  const t = topicOf(b), id = b.closest('[data-comp]').dataset.comp, c = t.comps.find(c => c.id === id), n = Comps.usage()[id] || 0;
  if (n && !(await confirmDlg({ title: 'Remove this competency?', msg: `${plural(n, 'item')} assigned to it will become unassigned.`, ok: 'Remove', danger: true }))) return;
  S.qs.forEach(q => { if (q.comp === id) { q.comp = ''; q.compConf = ''; } }); t.comps = t.comps.filter(x => x !== c); touch(); Comps.render();
};
ACT['comps-paste'] = async () => {
  const m = modal(`<h3>Paste a list of competencies</h3><div class="hint">One competency per line. Lines ending with a colon, or starting with “Topic:”, start a new topic.</div><div class="mbody"><textarea class="inp" id="cp-text" rows="10" placeholder="Electricity:\nExplain the relationship among current, voltage, and resistance\nCalculate the current in a simple circuit\nForces and Motion:\nDescribe motion in terms of speed and acceleration"></textarea></div><div class="mfoot"><button class="btn" data-a="modal-close">Cancel</button><button class="btn blue" id="cp-ok">Add competencies</button></div>`);
  $('#cp-ok').onclick = () => {
    let cur = null, n = 0;
    $('#cp-text').value.split('\n').map(s => s.replace(/^[\s\-•*\d.)]+/, '').trim()).filter(Boolean).forEach(l => {
      const tm = l.match(/^topic\s*:\s*(.+)$/i) || l.match(/^(.+):$/);
      if (tm) { cur = { id: uid(), name: tm[1].trim(), comps: [] }; S.topics.push(cur); return; }
      if (!cur) { cur = S.topics.find(t => !t.name) || { id: uid(), name: '', comps: [] }; if (!S.topics.includes(cur)) S.topics.push(cur); }
      cur.comps = cur.comps.filter(c => c.text); cur.comps.push({ id: uid(), text: l }); n++;
    });
    closeModal(true); touch(); Comps.render(); toast(plural(n, 'competency', 'competencies') + ' added.');
  };
};
ACT['suggest-comps'] = () => {
  if (!allComps().filter(c => c.text.trim()).length) return toast('Add learning competencies first.', 'info');
  const ex = curExam(); const exLeaves = ex ? layout(ex).leaves : [];
  const r1 = Classify.suggestComps(exLeaves, 'unassigned');
  const bankLeaves = bankItems().flatMap(q => isGroup(q) ? kidsOf(q) : [q]).filter(q => !exLeaves.includes(q));
  const r2 = Classify.suggestComps(bankLeaves, 'unassigned');
  touch(); Comps.render();
  const n = r1.n + r2.n, low = r1.low + r2.low, left = r1.left + r2.left;
  toast(n ? `${plural(n, 'suggestion')} made${low ? ', ' + low + ' uncertain' : ''}${left ? '; ' + left + ' item(s) had too little information' : ''}. Review them below.` : left ? `No confident matches for ${plural(left, 'item')}. Add more specific competency wording or assign them manually.` : 'Every item already has a competency.', n ? 'ok' : 'info', 6000);
};
ACT['rv-scope'] = b => { Comps.scope = b.dataset.v; Comps.refreshReview(); };
ACT['rv-uncertain'] = b => { Comps.onlyUncertain = b.checked; Comps.refreshReview(); };
ACT['rv-accept'] = b => { const q = Q(b.closest('tr').dataset.id); q.bloomManual = true; if (q.comp) q.compConf = 'manual'; touchQ(q); Comps.refreshReview(); };
ACT['rv-accept-all'] = () => { Comps.reviewList().forEach(q => { q.bloomManual = true; if (q.comp) q.compConf = 'manual'; }); touch(); Comps.refreshReview(); toast('Confirmed. Items without a competency still need one.', 'info'); };
