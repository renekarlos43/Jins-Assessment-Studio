/* Jin Assessment Studio — Jin: dashboard dialogue, recommendations, assistant panel (local analysis only) */
'use strict';
const Jin = {
  tab: 'review', timer: null, hideTimer: null, lineIdx: 0,
  POSE: { thoughtful: 'planning', concerned: 'planning', encouraging: 'welcome', happy: 'celebrating', greeting: 'welcome' },
  /* ---------- findings shared by recommendations, dialogue, and the review tab ---------- */
  findings() {
    const ex = curExam(), out = [];
    if (!ex) { out.push({ sev: 'info', title: 'Start your first exam', sub: 'Create an exam to begin.', a: 'new-exam' }); return out; }
    const C = examChecks(ex), n = C.items;
    if (!n) { out.push({ sev: 'info', title: 'Add questions', sub: 'This exam has no items yet.', a: 'goto', screen: 'exam', tab: 'builder', next: 'Add items, pull from the bank, or import a file.' }); return out; }
    if (C.empty.length) out.push({ sev: 'bad', title: 'Fill in empty items', sub: `Items ${C.empty.slice(0, 8).join(', ')} have no text yet.`, a: 'goto', screen: 'exam', tab: 'builder', next: 'Type the question text or delete the placeholder.' });
    if (C.noKey.length) out.push({ sev: 'bad', title: `Add ${plural(C.noKey.length, 'answer key')}`, sub: `Missing for items ${C.noKey.slice(0, 8).join(', ')}${C.noKey.length > 8 ? '…' : ''}.`, a: 'goto', screen: 'exam', tab: 'builder', next: 'Tick the correct choice or type the expected answer.' });
    const comps = allComps().filter(c => c.text.trim());
    if (!comps.length) out.push({ sev: 'warn', title: 'Add learning competencies', sub: 'They power the TOS and competency matching.', a: 'goto', screen: 'comps', next: 'Add topics and competencies, then use Suggest assignments.' });
    else {
      if (C.noComp.length) out.push({ sev: 'warn', title: `Map ${plural(C.noComp.length, 'item')} to competencies`, sub: `Items ${C.noComp.slice(0, 8).join(', ')}${C.noComp.length > 8 ? '…' : ''} have no competency.`, a: 'goto', screen: 'comps', next: 'Open Competencies and press Suggest assignments, then confirm.' });
      const used = new Set(C.L.leaves.map(q => q.comp)); const uncovered = comps.filter(c => !used.has(c.id));
      if (uncovered.length && uncovered.length < comps.length) out.push({ sev: 'warn', title: `${plural(uncovered.length, 'competency', 'competencies')} without items`, sub: uncovered.slice(0, 2).map(c => '“' + c.text.slice(0, 50) + '”').join(', ') + (uncovered.length > 2 ? '…' : ''), a: 'goto', screen: 'tos', next: 'Add items for them, or remove them from this exam’s TOS if they are not covered this quarter.' });
    }
    const unc = C.lowBloom.length + C.lowComp.length;
    if (unc) out.push({ sev: 'warn', title: `Confirm ${plural(unc, 'uncertain tag')}`, sub: `${C.lowBloom.length} Bloom level${C.lowBloom.length === 1 ? '' : 's'} and ${C.lowComp.length} competenc${C.lowComp.length === 1 ? 'y' : 'ies'} had weak evidence.`, a: 'goto', screen: 'comps', next: 'Open the classification review and confirm or change them.' });
    const b = C.bloom, tot = C.points || 1, low = (b[0] + b[1]) / tot, hots = (b[3] + b[4] + b[5]) / tot;
    if (n >= 5 && low > .7) out.push({ sev: 'warn', title: 'Check Bloom balance', sub: `${Math.round(low * 100)}% of points are Knowledge/Comprehension.`, a: 'goto', screen: 'exam', tab: 'builder', next: 'Consider turning a few recall items into application or analysis items.' });
    else if (n >= 8 && hots < .1) out.push({ sev: 'info', title: 'Add a higher-order item or two', sub: `Analysis, Synthesis and Evaluation make up ${Math.round(hots * 100)}% of points.`, a: 'goto', screen: 'exam', tab: 'builder', next: 'A short data-interpretation or justify-your-answer item helps.' });
    const t = S.tos[ex.id], fm = fmtOf(ex);
    if (fm === 'onepage') {
      const F = OnePage.fitCache[ex.id], target = Planner.ensure(ex).points;
      if (F && !F.fits) out.unshift({ sev: 'bad', title: `The quiz doesn’t fit on ${plural(Math.max(1, ex.opSheets || 1), 'sheet')}`, sub: `It needs ${F.sides} sides; ${plural(Math.max(1, ex.opSheets || 1), 'sheet')} printed back to back has ${F.cap}.`, a: 'goto', screen: 'exam', tab: 'builder', next: 'Shorten answer boxes or remove an item, or use “Add another sheet”.' });
      if (target && C.points !== target) out.push({ sev: 'warn', title: `Total is ${C.points} of ${target} points`, sub: C.points < target ? `${ptsNum(target - C.points)} more point(s) needed.` : `${ptsNum(C.points - target)} point(s) over.`, a: 'goto', screen: 'exam', tab: 'builder', next: 'Adjust item points, or change the target in the Score card.' });
    }
    if (fm !== 'scantron') { /* TOS is optional for one page and not needed for Google Forms */ }
    else if (!t || !t.generatedAt) out.push({ sev: 'info', title: 'Generate the TOS', sub: 'Fill the table from this exam in one click.', a: 'gen-tos', next: 'Use Generate TOS in Quick Tools.' });
    else { const T = Tos.totals(t); if (T.grand !== C.points) out.push({ sev: 'warn', title: 'TOS total doesn’t match the exam', sub: `Table ${T.grand} vs exam ${C.points} item points.`, a: 'goto', screen: 'tos', next: 'Regenerate the TOS or adjust its counts.' }); }
    Analysis.groupsFor(ex).forEach(g => {
      if (Analysis.isStale(g)) out.push({ sev: 'warn', title: `Recalculate ${g.name}`, sub: 'Its item-analysis results are out of date.', a: 'goto', screen: 'analysis', next: 'Open Item Analysis and press Recalculate.' });
      else if (g.result) { const bad = g.result.rows.filter(r => r.d < .2); if (bad.length) out.push({ sev: bad.some(r => r.d < 0) ? 'bad' : 'warn', title: `Review ${plural(bad.length, 'weak item')} (${g.name})`, sub: `Low discrimination: items ${bad.slice(0, 6).map(r => r.num).join(', ')}.`, a: 'goto', screen: 'analysis', next: 'Check keys and distractors; revise before reusing.' }); }
    });
    if (Planner.hasPlan(ex)) { const P = Planner.progress(ex); if (P.remaining && P.built) out.push({ sev: 'info', title: `Plan: ${P.remaining} slot${P.remaining === 1 ? '' : 's'} to fill`, sub: `${P.completed} of ${P.planned} planned questions are built.`, a: 'goto', screen: 'exam', tab: 'planner', next: 'Open the Exam Planner; Jin suggests bank items for each gap.' }); else if (P.over) out.push({ sev: 'warn', title: 'Exam goes beyond its plan', sub: `${P.over} question(s) over target or outside the plan.`, a: 'goto', screen: 'exam', tab: 'planner', next: 'Raise targets or remove extra items.' }); }
    else if (n) out.push({ sev: 'info', title: 'Plan this exam', sub: 'Set targets by topic and question type to track coverage.', a: 'goto', screen: 'exam', tab: 'planner', next: 'Open Exam → Exam Planner.' });
    const lb = S.settings.lastBackup; if (!lb || (Date.now() - new Date(lb)) > 7 * 864e5) out.push({ sev: 'info', title: 'Save a backup', sub: lb ? 'Last backup ' + fmtWhen(lb) + '.' : 'You haven’t saved a backup file yet.', a: 'backup', next: 'Keep a copy on a USB drive or cloud folder.' });
    if (!out.some(f => f.sev !== 'info')) out.unshift({ sev: 'ok', title: 'This exam looks ready', sub: 'Keys, competencies and levels are in place.', a: 'preview', next: 'Preview it, then export to PDF or Word.' });
    return out;
  },
  recommendHTML() {
    const f = this.findings().slice(0, 3);
    return f.map(x => `<div class="tiprow"><span class="tipdot ${x.sev === 'bad' ? 'red' : x.sev === 'warn' ? 'amber' : ''}">${icon(x.sev === 'ok' ? 'check' : x.sev === 'info' ? 'spark' : 'spark')}</span><span><b>${esc(x.title)}</b><small>${esc(x.sub)}</small></span><button class="link" data-a="${x.a}"${x.screen ? ` data-screen="${x.screen}"` : ''}${x.tab ? ` data-tab="${x.tab}"` : ''}>${x.a === 'backup' ? 'Back up' : x.a === 'gen-tos' ? 'Generate' : 'Open'}</button></div>`).join('');
  },
  /* ---------- hero dialogue ---------- */
  lines() {
    const ex = curExam(), F = this.findings().filter(f => f.sev !== 'info'), name = greetName();
    const L = [];
    const h = new Date().getHours();
    L.push({ text: `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${name ? ', ' + name : ''}! Ready to build something great?`, mood: 'greeting' });
    if (F[0]) L.push({ text: F[0].title + '. ' + (F[0].next || ''), mood: F[0].sev === 'bad' ? 'concerned' : 'thoughtful' });
    if (F[1]) L.push({ text: F[1].title + ' — ' + F[1].sub, mood: 'thoughtful' });
    if (ex && !F.length && examChecks(ex).items) L.push({ text: 'Everything checks out on this exam. Nice work!', mood: 'happy' });
    L.push({ text: 'Plausible distractors reveal misconceptions better than silly ones.', mood: 'encouraging' });
    L.push({ text: 'A few application items let students show what they can do with what they know.', mood: 'encouraging' });
    L.push({ text: 'Tip: drag the ⠿ handle to reorder questions.', mood: 'thoughtful' });
    L.push({ text: 'Back up your work now and then — a USB copy saves the day.', mood: 'thoughtful' });
    return L;
  },
  speak(line) {
    const box = $('#jin-dialogue'), img = $('#jin-operator'); if (!box) return;
    if (!line) { const L = this.lines(); line = L[this.lineIdx++ % L.length]; }
    box.innerHTML = `<button class="x" data-a="jin-hush" aria-label="Dismiss">${icon('x')}</button><strong>Jin</strong><em>${esc(line.text)}</em>`;
    if (img) { img.src = `assets/jin/anime-${this.POSE[line.mood] || 'welcome'}-upper.webp`; img.alt = 'Jin looks ' + line.mood; }
    box.classList.add('show'); clearTimeout(this.hideTimer); this.hideTimer = setTimeout(() => box.classList.remove('show'), 8000);
  },
  schedule() {
    clearTimeout(this.timer); const mode = S.settings.jinAuto; if (mode === 'off') return;
    const first = this.lineIdx === 0, d = mode === 'reduced' ? (120 + Math.random() * 180) * 1000 : first ? (10 + Math.random() * 10) * 1000 : (35 + Math.random() * 35) * 1000;
    this.timer = setTimeout(() => { if (APP.screen === 'overview' && !document.hidden && !$('#modal-root').classList.contains('open') && !$('#assistant').classList.contains('open')) this.speak(); this.schedule(); }, d);
  },
  /* ---------- assistant panel ---------- */
  togglePanel(force, tab) {
    const p = $('#assistant'); const open = typeof force === 'boolean' ? force : !p.classList.contains('open');
    if (tab) this.tab = tab; else if (open && !p.classList.contains('open') && APP.screen === 'exam') this.tab = APP.examTab === 'planner' ? 'plan' : 'review';
    p.classList.toggle('open', open); p.setAttribute('aria-hidden', open ? 'false' : 'true');
    if (open) this.renderPanel();
  },
  renderPanel() {
    const p = $('#assistant'), tabs = [['plan', 'Plan exam'], ['review', 'Review exam'], ['compare', 'Compare competencies'], ['analysis', 'Results summary']];
    p.innerHTML = `<div class="assistant-head"><div class="panel-face"><img src="assets/jin/anime-${this.tab === 'analysis' ? 'planning' : this.tab === 'compare' ? 'planning' : 'welcome'}-face.webp" alt="Jin"></div><div><span class="eyebrow">JIN · ASSESSMENT HELPER</span><h2>${this.tab === 'compare' ? 'Do these outcomes connect?' : this.tab === 'analysis' ? 'How did the class do?' : this.tab === 'plan' ? 'Let’s plan this exam' : 'Let’s check your exam'}</h2></div><button class="assistant-close" data-a="assistant-close" aria-label="Close">${icon('x')}</button></div>
      <div class="assistant-tabs">${tabs.map(([k, n]) => `<button class="${k === this.tab ? 'on' : ''}" data-a="jin-tab" data-tab="${k}">${n}</button>`).join('')}</div>
      <div id="jin-body">${this.tab === 'plan' ? this.planHTML() : this.tab === 'compare' ? this.compareHTML() : this.tab === 'analysis' ? this.analysisHTML() : this.reviewHTML()}</div>
      <p class="assistant-intro" style="margin-bottom:0">I work entirely on this device from your wording and exam data — nothing is sent online. My suggestions are hints, not verdicts; you decide.</p>`;
  },
  planHTML() {
    const ex = curExam(); if (!ex) return `<div class="jres"><b>No exam open.</b><p>Create an exam and I’ll help you plan it.</p></div>`;
    const pl = Planner.ensure(ex), all = Planner.advice(ex), shown = all.filter(a => !pl.dismissed.includes(a.key));
    Planner._adv = Object.fromEntries(all.map(a => [a.key, a]));
    const P = Planner.progress(ex);
    return `<div class="jres"><p><b>${esc(ex.title)}</b>${pl.rows.length ? ` · plan ${P.rowSum}/${pl.total || '?'} questions · built ${P.built} · ${P.remaining} remaining${P.over ? ' · ' + P.over + ' over' : ''}` : ' · no plan yet'}.</p>
      ${shown.map(a => Planner.adviceItem(a)).join('') || '<p>Nothing to suggest right now.</p>'}
      ${all.length - shown.length ? `<p class="tiny">${plural(all.length - shown.length, 'tip')} dismissed · <button class="link" data-a="padv-restore">show again</button></p>` : ''}</div>
      <div class="assistant-actions"><button class="btn blue sm" data-a="goto" data-screen="exam" data-tab="planner">Open Exam Planner</button><button class="btn sm" data-a="jin-refresh">${icon('refresh')}Check again</button></div>`;
  },
  reviewHTML() {
    const ex = curExam(); if (!ex) return `<div class="jres"><b>No exam open.</b><p>Create an exam and I’ll review it.</p></div>`;
    const C = examChecks(ex), F = this.findings();
    const sevPill = s => s === 'bad' ? '<span class="match-pill dup">FIX</span>' : s === 'warn' ? '<span class="match-pill overlap">CHECK</span>' : s === 'ok' ? '<span class="match-pill related">GOOD</span>' : '<span class="match-pill separate">TIP</span>';
    const b = C.bloom, tot = C.points || 1;
    return `<div class="jres"><img class="jin-chibi-inline" src="${F.some(f => f.sev === 'bad') ? CHIBI.concerned : F.some(f => f.sev === 'warn') ? CHIBI.idea : CHIBI.happy}" alt=""><p><b>${esc(ex.title)}</b> · ${plural(C.items, 'item')}, ${plural(C.points, 'point')}. Readiness ${C.progress}%.</p>
      <p class="tiny" style="margin:2px 0 6px">Bloom mix: ${BL.map((n, i) => b[i] ? `${BL_SHORT[i]} ${Math.round(b[i] / tot * 100)}%` : '').filter(Boolean).join(' · ') || '—'}</p><div style="clear:both"></div>
      ${F.map(f => `<div class="match-row">${sevPill(f.sev)}<span><b>${esc(f.title)}</b><small>Evidence: ${esc(f.sub)}</small>${f.next ? `<em>Next step: ${esc(f.next)}</em>` : ''}</span></div>`).join('')}</div>
      <div class="assistant-actions"><button class="btn blue sm" data-a="jin-refresh">${icon('refresh')}Check again</button><button class="btn sm" data-a="goto" data-screen="comps">Review tags</button><button class="btn sm" data-a="goto" data-screen="tos">Open TOS</button></div>`;
  },
  compareHTML() {
    let comps = allComps().filter(c => c.text.trim()), src = 'your competency list';
    if (comps.length < 2) { const t = S.tos[(curExam() || {}).id || '_free']; const rows = t ? t.rows.filter(r => r.label.trim()).map((r, i) => ({ id: r.id, text: r.label, topic: '' })) : []; if (rows.length >= 2) { comps = rows; src = 'the TOS rows'; } }
    if (comps.length < 2) return `<div class="jres"><img class="jin-chibi-inline" src="${CHIBI.idea}" alt=""><b>Add two or more competencies first.</b><p>Open Competencies (or type them in the TOS), then ask me to compare their topics and wording.</p><div style="clear:both"></div></div><div class="assistant-actions"><button class="btn blue sm" data-a="goto" data-screen="comps">Open Competencies</button></div>`;
    const R = Classify.compareComps(comps), order = { dup: 0, overlap: 1, related: 2, separate: 3 };
    const label = it => { if (it.topicId) { const ti = S.topics.findIndex(t => t.id === it.topicId), ci = S.topics[ti].comps.findIndex(c => c.id === it.id); return `${ti + 1}.${ci + 1}`; } return '#' + it.n; };
    const counts = { dup: 0, overlap: 0, related: 0, separate: 0 }; R.pairs.forEach(p => counts[p.kind]++);
    const shown = R.pairs.filter(p => p.kind !== 'separate').sort((a, b) => order[a.kind] - order[b.kind] || b.jac - a.jac).slice(0, 25);
    const pill = { dup: '<span class="match-pill dup">POSSIBLE DUPLICATE</span>', overlap: '<span class="match-pill overlap">OVERLAP</span>', related: '<span class="match-pill related">RELATED</span>', separate: '<span class="match-pill separate">SEPARATE</span>' };
    return `<div class="jres"><p>I compared ${plural(comps.length, 'statement')} from ${src}: <b>${counts.dup}</b> possible duplicate${counts.dup === 1 ? '' : 's'}, <b>${counts.overlap}</b> overlap${counts.overlap === 1 ? '' : 's'}, <b>${counts.related}</b> related pair${counts.related === 1 ? '' : 's'}, ${counts.separate} separate.</p>
      ${shown.map(p => `<div class="match-row">${pill[p.kind]}<span><b>${label(p.a)} and ${label(p.b)}</b><small>“${esc(p.a.text.slice(0, 70))}” · “${esc(p.b.text.slice(0, 70))}”</small><small>Why I think so: ${esc(p.why.join('; '))}.</small><em>Next step: ${esc(p.next)}</em></span></div>`).join('') || '<p>No strong links found — these look like distinct outcomes.</p>'}
      <h4>Possible groupings</h4>${R.groups.map(g => `<div class="match-row">${pill[g.items.length > 1 ? 'related' : 'separate']}<span><b>${esc(g.label.charAt(0).toUpperCase() + g.label.slice(1))}</b><small>${g.items.map(i => label(i)).join(', ')}</small></span></div>`).join('')}
      <p class="tiny" style="margin-top:6px">Based on shared key words, subject-area vocabulary and the action verb. Two outcomes can share words yet target different skills, so check against your curriculum guide.</p></div>
      <div class="assistant-actions"><button class="btn blue sm" data-a="jin-refresh">${icon('refresh')}Analyze again</button><button class="btn sm" data-a="goto" data-screen="comps">Edit competencies</button></div>`;
  },
  analysisHTML() {
    const ex = curExam(), gs = ex ? Analysis.groupsFor(ex).filter(g => g.result) : [];
    if (!gs.length) return `<div class="jres"><img class="jin-chibi-inline" src="${CHIBI.idea}" alt=""><b>No results yet.</b><p>Add a section in Item Analysis, mark responses, and press Arrange &amp; compute. Then I can summarize them here.</p><div style="clear:both"></div></div><div class="assistant-actions"><button class="btn blue sm" data-a="goto" data-screen="analysis">Open Item Analysis</button></div>`;
    return gs.map(g => {
      const R = g.result, stale = Analysis.isStale(g), weak = R.rows.filter(r => r.d < .2), neg = R.rows.filter(r => r.d < 0), hard = [...R.rows].sort((a, b) => a.p - b.p).slice(0, 3);
      return `<div class="jres" style="margin-bottom:8px"><p><b>${esc(g.name)}</b>${stale ? ' <span class="match-pill overlap">OUT OF DATE</span>' : ''}</p><p>Average ${R.mean.toFixed(1)} / ${R.K} (${Math.round(R.mean / R.K * 100)}%). ${weak.length ? `${plural(weak.length, 'item')} discriminate weakly${neg.length ? `, and ${plural(neg.length, 'item')} favored the lower group (check the key)` : ''}.` : 'All items separate strong and weak scorers reasonably well.'}</p><p>Hardest: ${hard.map(r => `item ${r.num} (p ${r.p.toFixed(2)})`).join(', ')}.</p><em style="color:#2f6db0;font-style:normal">Next step: ${neg.length ? 'verify the answer keys of the flagged items.' : weak.length ? 'review the distractors of the weak items before reusing them.' : 'save strong items to the bank for future exams.'}</em></div>`;
    }).join('') + `<div class="assistant-actions"><button class="btn blue sm" data-a="goto" data-screen="analysis">Open Item Analysis</button></div>`;
  }
};
ACT['assistant'] = b => Jin.togglePanel(true, b.dataset.tab || null);
ACT['assistant-close'] = () => Jin.togglePanel(false);
ACT['jin-tab'] = b => { Jin.tab = b.dataset.tab; Jin.renderPanel(); };
ACT['jin-refresh'] = () => { if (APP.screen === 'exam' && APP.examTab === 'planner') Planner.refreshSide(); Jin.renderPanel(); toast('Updated.', 'ok', 1200); };
ACT['jin-speak'] = () => Jin.speak();
ACT['jin-hush'] = () => { const b = $('#jin-dialogue'); if (b) b.classList.remove('show'); };
/* the floating toggle opens/closes */
ACT['assistant'] = b => { if (b.id === 'assistant-toggle' && $('#assistant').classList.contains('open')) return Jin.togglePanel(false); Jin.togglePanel(true, b.dataset.tab || null); };
