/* Jin Assessment Studio — navigation, overview dashboard, settings, backup/restore, startup */
'use strict';
const App = {
  go(screen, opts) {
    if (opts && opts.tab) APP.examTab = opts.tab;
    APP.screen = screen;
    $$('.nav').forEach(n => n.classList.toggle('active', n.dataset.screen === screen));
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + screen));
    this.renderScreen(screen); this.refreshChrome();
    window.scrollTo({ top: 0 });
    if (screen === 'overview') Jin.schedule();
  },
  renderScreen(s) { ({ overview: () => this.overview(), exam: () => Exam.render(), bank: () => Bank.render(), comps: () => Comps.render(), tos: () => Tos.render(), analysis: () => Analysis.render(), settings: () => this.settings() })[s](); },
  refreshChrome() {
    const ex = curExam();
    $('#nav-bank-count').textContent = bankItems().length;
    $('#top-exam-pill').textContent = ex ? (ex.title || 'Untitled').toUpperCase() : 'NO EXAM';
    $('#avatar').textContent = ((S.settings.teacher || 'T').trim()[0] || 'T').toUpperCase();
    $('#avatar').title = S.settings.teacher || 'Teacher';
    const ce = $('#current-exam');
    if (!ex) { ce.innerHTML = `<div class="exam-vector" aria-hidden="true"><i style="height:20%"></i><i style="height:30%"></i><i style="height:15%"></i><b>0</b><small>ITEMS</small></div><span class="eyebrow">CURRENT EXAM</span><strong>No exam yet</strong><span>Create one to get started.</span>`; ce.dataset.a = 'new-exam'; return; }
    ce.dataset.a = 'goto';
    const C = examChecks(ex), tot = C.points || 1;
    const bars = C.bloom.map((v, i) => `<i style="height:${Math.max(10, Math.round(v / tot * 100))}%;background:${['#9bc1ec', '#73a9e5', '#4b8fd9', '#347bc7', '#2a6db6', '#1f5ea0'][i]}" title="${BL[i]} ${Math.round(v / tot * 100)}%"></i>`).join('');
    const st = { Draft: 'background:#fff3d8;color:#956a10', 'In review': 'background:#eef6ff;color:#276db4', Ready: 'background:#effaf2;color:#26774a', Administered: 'background:#f2efff;color:#5b4db0', Archived: 'background:#f1f4f9;color:#5b6f8a' }[ex.status] || '';
    ce.innerHTML = `<div class="exam-vector" aria-hidden="true">${bars}<b>${C.items}</b><small>ITEMS</small></div><span class="eyebrow">CURRENT EXAM</span><strong>${esc(ex.title || 'Untitled')}</strong><span>${esc([ex.subject, ex.grade].filter(Boolean).join(' · ') || 'Subject and class not set')}</span>
      <div style="margin-top:6px"><span class="status-chip" style="${st}">${esc(ex.status)}</span></div><div class="progress" title="Readiness ${C.progress}%"><i style="width:${C.progress}%"></i></div><span>${plural(C.items, 'question')} · ${C.progress}% ready · ${fmtWhen(ex.updated)}</span>`;
  },
  overview() {
    const el = $('#screen-overview'), ex = curExam(), C = ex ? examChecks(ex) : null, h = new Date().getHours();
    const greet = (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + ', ' + (esc(greetName()) || 'Teacher') + '!';
    const active = S.exams.filter(e => e.status !== 'Archived'), subjects = new Set(active.map(e => e.subject).filter(Boolean));
    const analyzed = S.groups.filter(g => g.result), latest = analyzed.slice().sort((a, b) => (b.result.at || '').localeCompare(a.result.at || ''))[0];
    const health = C ? C.health : 0;
    el.innerHTML = `<div class="toolbar"><div class="tabtitle">${greet}</div><span class="tiny">Here’s your assessment overview for today.</span><button class="btn blue" data-a="new-exam">${icon('plus')}Create exam</button></div>
      <div class="dashgrid"><div class="dashmain">
        <div class="welcome-banner"><div class="welcome-copy"><div class="workspace-label"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M8 8h22l10 10v22H8z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M29 8v11h11M15 27l5 5 10-11" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="36" cy="9" r="4" fill="#ffd36e"/></svg><span class="eyebrow">YOUR ACADEMIC WORKSPACE</span></div>
          <h2>Plan smarter assessments.</h2><p>Build balanced exams, map competencies, and see how your students are progressing.</p>
          ${ex ? `<button class="btn blue" data-a="goto" data-screen="exam">Continue ${esc((ex.title || 'Untitled').slice(0, 34))} →</button>` : `<button class="btn blue" data-a="new-exam">Create your first exam →</button>`}</div>
          <div class="operator-stage"><button class="operator-control" data-a="jin-speak" aria-label="Click Jin for a tip"><img id="jin-operator" src="assets/jin/anime-welcome-upper.webp" alt="Jin, your assessment guide"><span class="click-hint">Click Jin for a tip</span></button><div id="jin-dialogue" class="jin-dialogue" role="status" aria-live="polite"></div></div></div>
        <div class="stats four"><div class="stat"><b>${active.length}</b><span>Active exams</span><small>Across ${plural(subjects.size || (active.length ? 1 : 0), 'subject')}</small></div><div class="stat"><b>${bankItems().length}</b><span>Bank questions</span><small>Ready to reuse</small></div><div class="stat"><b>${C ? C.mapped : 0}%</b><span>Coverage mapped</span><small>Current exam items with a competency</small></div><div class="stat"><b>${analyzed.length}</b><span>Sections analyzed</span><small>${latest ? 'Latest: ' + esc(latest.name) : 'None yet'}</small></div></div>
        <div class="card"><div class="cardhead"><h2>Quick actions</h2><span class="right tiny">PICK UP WHERE YOU LEFT OFF</span></div><div class="quickgrid">
          <button class="quick" data-a="goto" data-screen="exam" data-tab="planner"><i>${icon('target')}</i><b>Plan an exam</b><span>Targets by topic and type</span></button>
          <button class="quick" data-a="goto" data-screen="bank"><i>${icon('bank')}</i><b>Browse item bank</b><span>Search reusable questions</span></button>
          <button class="quick" data-a="goto" data-screen="tos"><i>${icon('grid')}</i><b>Open TOS</b><span>Review competency coverage</span></button>
          <button class="quick" data-a="goto" data-screen="analysis"><i>${icon('chart')}</i><b>Analyze results</b><span>Review item performance</span></button></div></div>
        <div class="card"><div class="cardhead"><h2>Recent assessments</h2><button class="link right" data-a="goto" data-screen="exam" data-tab="builder">Open Exam Builder →</button></div>
          ${S.exams.length ? S.exams.slice().sort((a, b) => (b.updated || '').localeCompare(a.updated || '')).slice(0, 5).map((e, i) => { const c = examChecks(e); return `<div class="recent"><span class="fileicon ${i % 2 ? 'violet' : ''}">${icon('file')}</span><div><b>${esc(e.title || 'Untitled')}</b><small>${esc(e.subject || 'No subject')} · Edited ${fmtWhen(e.updated)} · ${plural(c.items, 'question')}</small></div><span class="tag ${e.status === 'Ready' ? 'green' : e.status === 'Draft' ? 'gold' : ''}">${esc(e.status)}</span><button class="btn sm" data-a="open-exam" data-id="${e.id}">Open</button></div>`; }).join('') : `<div class="empty" style="padding:16px">No assessments yet.</div>`}</div>
      </div>
      <aside class="dashrail">
        <div class="card jin-recommends"><div class="cardhead"><h2>Jin recommends</h2><button class="link right" data-a="assistant" data-tab="review">Ask Jin</button></div>${Jin.recommendHTML()}</div>
        <div class="mini-banner"><div class="fresh-icon" aria-hidden="true"><svg viewBox="0 0 88 88"><path d="M17 12h37l16 16v48H17z" fill="#fff" stroke="#4385d6" stroke-width="3" stroke-linejoin="round"/><path d="M54 12v18h16M28 43h22M28 54h14" fill="none" stroke="#4385d6" stroke-width="3" stroke-linecap="round"/><path d="M53 57l7 7 13-15" fill="none" stroke="#e9ad33" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="26" cy="27" r="4" fill="#e9ad33"/></svg></div><div class="copy"><b>Need a fresh start?</b><small>Start a new exam, or reuse items from your bank.</small><button class="btn blue sm" data-a="new-exam">Start planning</button></div></div>
        <div class="card"><div class="cardhead"><h2>Assessment health</h2><span class="tag right">CURRENT EXAM</span></div>
          <div class="health"><div class="ring" style="background:conic-gradient(#428de0 ${health * 3.6}deg,#dcecff 0)"><span>${health}%</span></div><div><b>${!C || !C.items ? 'No items yet' : health >= 85 ? 'Good coverage' : health >= 60 ? 'Getting there' : 'Needs attention'}</b><p>${C && C.items ? `${C.keyed}/${C.items} keyed · ${C.items - C.noComp.length}/${C.items} mapped · ${C.lowBloom.length} uncertain level${C.lowBloom.length === 1 ? '' : 's'}.` : 'Add questions to see the health score.'}</p><button class="link" data-a="goto" data-screen="tos">Review the TOS →</button></div></div></div>
      </aside></div>`;
  },
  settings() {
    const s = S.settings, info = APP.info || {};
    $('#screen-settings').innerHTML = `<div class="toolbar"><div class="tabtitle">Settings</div><span class="tiny">Version ${esc(APP.version)}</span></div>
      <div class="grid2"><div style="min-width:0">
        <div class="card"><div class="cardhead"><h2>Your details</h2></div>
          <div class="set-row"><span><b>Teacher name</b><small>Used for greetings, new exams and the TOS “Prepared by” line.</small></span><input class="inp" style="max-width:260px" data-set="teacher" value="${esc(s.teacher)}" placeholder="Your name"></div>
          <div class="set-row"><span><b>School name</b><small>Default header for new exams and the TOS.</small></span><input class="inp" style="max-width:260px" data-set="school" value="${esc(s.school)}" placeholder="School name"></div>
          <div class="set-row"><span><b>Default paper size</b><small>Used for PDF and Word exports.</small></span><select class="inp" data-set="paper">${Object.entries(PAPER).map(([k, v]) => `<option value="${k}"${k === s.paper ? ' selected' : ''}>${v.name}</option>`).join('')}</select></div></div>
        <div class="card"><div class="cardhead"><h2>Jin</h2></div>
          <div class="set-row"><span><b>Automatic tips on Overview</b><small>How often Jin speaks on her own while the Overview is open. Clicking her always works, and every popup can be dismissed.</small></span><div class="seg">${[['normal', 'Normal'], ['reduced', 'Reduced'], ['off', 'Off']].map(([k, n]) => `<button class="${s.jinAuto === k ? 'on' : ''}" data-a="set-jin" data-v="${k}">${n}</button>`).join('')}</div></div>
          <div class="set-row"><span><b>Assistant data</b><small>Jin’s suggestions are computed in your browser from your competency wording and exam data. No AI service is configured, and nothing is sent over the internet.</small></span><span class="tag green">Local only</span></div></div>
        <div class="card"><div class="cardhead"><h2>Item analysis</h2></div>
          <div class="set-row"><span><b>Upper and lower group size</b><small>Share of students in each comparison group. 27% is the common standard; 50% splits the class in half.</small></span><div class="seg">${[25, 27, 33, 50].map(v => `<button class="${+s.groupPct === v ? 'on' : ''}" data-a="set-pct" data-v="${v}">${v}%</button>`).join('')}</div></div></div>
      </div><div style="min-width:0">
        <div class="card"><div class="cardhead"><h2>Data &amp; backup</h2></div>
          <div class="set-row" style="display:block"><b>Where your project is stored</b><small>Everything saves automatically <b>in this browser on this computer</b>. Nothing is uploaded. On another computer or browser the site starts empty: save a backup here and restore it there.</small><span class="path">${esc(info.dataDir || '')}</span><div class="row" style="margin-top:8px"><button class="btn sm" data-a="open-data">${icon('folder')}About browser storage</button></div></div>
          <div class="set-row" style="display:block"><b>Backup file</b><small>Saves the exams, item bank, competencies, TOS and item analysis into one .jasbackup file. ${s.lastBackup ? 'Last backup: ' + fmtWhen(s.lastBackup) + '.' : 'No backup saved yet.'}</small><div class="row" style="margin-top:8px"><button class="btn blue sm" data-a="backup">${icon('download')}Save backup</button><button class="btn sm" data-a="restore">${icon('upload')}Restore backup…</button></div></div>
          <div class="set-row" style="display:block"><b>Automatic snapshots</b><small>The app keeps recent copies of your project in this browser (each time the site opens and before a restore). Use one if something went wrong.</small><div id="snaps" style="margin-top:8px" class="hint">${Host.native ? 'Loading…' : 'Available in the desktop app.'}</div></div></div>
        <div class="card"><div class="cardhead"><h2>About</h2></div><div class="row" style="align-items:flex-start;gap:14px"><img src="assets/app-icon.png" alt="" style="width:56px;height:56px"><div class="hint"><b style="color:var(--navy);font-size:14px">Jin Assessment Studio ${esc(APP.version)}</b><br>Exam builder, item bank, Table of Specifications and item analysis for teachers.<br>Web version: updating the site on GitHub never touches the work saved in your browser.</div></div></div>
      </div></div>`;
    if (Host.native) Host.listSnapshots().then(list => { const box = $('#snaps'); if (!box) return; box.innerHTML = list && list.length ? list.slice(0, 12).map(sn => `<div class="minirow"><span>${esc(sn.label)}<br><span class="tiny">${new Date(sn.mtime).toLocaleString()} · ${(sn.size / 1024).toFixed(0)} KB</span></span><button class="btn sm" data-a="restore-snap" data-name="${esc(sn.name)}">Restore</button></div>`).join('') : 'No snapshots yet. One is made each time the app starts.'; });
  }
};
document.addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.set) { S.settings[t.dataset.set] = t.value; touch(); App.refreshChrome(); } });
document.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.set === 'paper') { S.settings.paper = t.value; touch(); } });
ACT['goto'] = b => { const s = b.dataset.screen || 'exam'; if (b.closest('#assistant') && window.innerWidth < 1300) Jin.togglePanel(false); App.go(s, b.dataset.tab ? { tab: b.dataset.tab } : null); };
/* the Exam nav item always opens on its first tab, the Exam Planner */
$$('.nav').forEach(n => n.addEventListener('click', () => App.go(n.dataset.screen, n.dataset.screen === 'exam' ? { tab: 'planner' } : null)));
APP.examTab = 'planner';
ACT['set-jin'] = b => { S.settings.jinAuto = b.dataset.v; touch(); App.settings(); Jin.schedule(); toast(b.dataset.v === 'off' ? 'Jin will only speak when you click her.' : b.dataset.v === 'reduced' ? 'Jin will speak less often.' : 'Jin will share tips now and then.', 'info'); };
ACT['set-pct'] = b => { S.settings.groupPct = +b.dataset.v; S.groups.forEach(g => { if (g.result) g.stale = true; }); touch(); App.settings(); toast('Group size set to ' + b.dataset.v + '%. Recalculate item analysis to apply it.', 'info'); };
ACT['open-data'] = () => Host.openDataFolder();

/* ---------- backup / restore ---------- */
ACT['backup'] = async () => {
  const d = new Date(), prevLast = S.settings.lastBackup; S.settings.lastBackup = d.toISOString();
  const project = JSON.stringify(S);
  const wrap = { format: 'jin-assessment-studio-backup', version: 1, createdAt: d.toISOString(), appVersion: APP.version, checksum: fnv(project), summary: summarizeProject(S), project: S };
  const name = `Jin Backup ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}.jasbackup`;
  const ok = await saveOut(name, JSON.stringify(wrap), [{ name: 'Jin Assessment Studio backup', extensions: ['jasbackup'] }, { name: 'JSON', extensions: ['json'] }], 'Backup');
  if (!ok) { S.settings.lastBackup = prevLast; return; }
  touch(); if (APP.screen === 'settings') App.settings(); if (APP.screen === 'overview') App.overview();
};
function readBackup(text) {
  let obj; try { obj = JSON.parse(text); } catch { return { ok: false, errors: ['The file is not valid backup data (it could not be read as JSON).'] }; }
  let project = obj, meta = null;
  if (obj && obj.format === 'jin-assessment-studio-backup') {
    project = obj.project; meta = obj;
    if (!project) return { ok: false, errors: ['The backup has no project inside.'] };
    if (obj.checksum && fnv(JSON.stringify(project)) !== obj.checksum) return { ok: false, errors: ['The backup’s checksum does not match — the file is damaged or was edited outside the app.'] };
  }
  const v = validateProject(project); if (!v.ok) return v;
  return { ok: true, project, meta };
}
async function confirmRestore(res, sourceLabel) {
  if (!res.ok) { modal(`<h3>This backup can’t be restored</h3><div class="mbody"><img class="chibi-side" src="${CHIBI.angry}" alt=""><p>${esc(sourceLabel)} did not pass the safety check, so nothing was changed:</p><ul>${res.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul><div style="clear:both"></div></div><div class="mfoot"><button class="btn blue" data-a="modal-close">OK</button></div>`, { size: 'narrow' }); return false; }
  const a = summarizeProject(res.project), b = summarizeProject(S);
  const tbl = `<table class="res-table" style="margin-top:10px"><thead><tr><th></th><th>Backup</th><th>Current project</th></tr></thead><tbody>${[['Exams', a.exams, b.exams], ['Item bank items', a.bank, b.bank], ['Competencies', a.comps, b.comps], ['Analysis sections', a.sections, b.sections], ['Last changed', a.updated ? new Date(a.updated).toLocaleString() : '—', b.updated ? new Date(b.updated).toLocaleString() : '—']].map(r => `<tr><td>${r[0]}</td><td><b>${r[1]}</b></td><td>${r[2]}</td></tr>`).join('')}</tbody></table>`;
  const ok = await confirmDlg({ title: 'Replace your current project?', msg: `Restoring ${sourceLabel} replaces everything currently in the app — exams, item bank, competencies, TOS and item analysis. A safety snapshot of the current project is saved first, so you can undo this from Settings.`, ok: 'Replace with backup', danger: true, html: tbl, chibi: 'concerned' });
  if (!ok) return false;
  const snap = await Host.beforeRestore(); if (snap && snap.ok === false) { toast('Could not save a safety snapshot (' + snap.error + '). Restore cancelled.', 'error'); return false; }
  S = migrate(res.project); afterLoad(); Save.pending = true; await Save.now();
  App.go('overview'); toast('Backup restored.');
  return true;
}
ACT['restore'] = async () => {
  const f = await Host.openFile('.jasbackup,.json', [{ name: 'Jin Assessment Studio backup', extensions: ['jasbackup', 'json'] }]); if (!f) return;
  await confirmRestore(readBackup(new TextDecoder().decode(f.bytes)), '“' + f.name + '”');
};
ACT['restore-snap'] = async b => {
  const r = await Host.readSnapshot(b.dataset.name); if (!r || !r.ok) return toast('Could not read the snapshot.', 'error');
  await confirmRestore(readBackup(r.json), 'the snapshot “' + b.dataset.name + '”');
};

/* keyboard shortcuts */
document.addEventListener('keydown', e => {
  if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 's') { e.preventDefault(); Save.pending = true; Save.now().then(ok => ok && toast('All changes saved.', 'ok', 1200)); }
  if (e.ctrlKey && e.key.toLowerCase() === 'p' && APP.screen === 'exam') { e.preventDefault(); ACT.preview(); }
});

/* ---------- first run ---------- */
function firstRunDialog() {
  const m = modal(`<h3>Welcome to Jin Assessment Studio!</h3><div class="mbody"><img class="chibi-side" src="${CHIBI.happy}" alt="" style="width:110px"><p style="margin-top:0">Hi, I’m Jin. I’ll help you build exams, map competencies, and read your results. I loaded a small sample exam so you can look around — edit or delete it anytime.</p><p class="tiny">Your work is saved in <b>this browser on this computer</b> only. To use it elsewhere, click <b>Save backup</b> and restore that file on the other computer.</p><label class="field" style="margin-top:10px">What should I call you?<input id="fr-name" placeholder="e.g., Ms. Santos"></label><label class="field" style="margin-top:8px">School name (optional)<input id="fr-school" placeholder="Printed on exam headers"></label><div style="clear:both"></div></div><div class="mfoot"><button class="btn" data-x="skip">Skip</button><button class="btn blue" data-x="ok">Let’s start</button></div>`, { size: 'narrow', onClose: () => done() });
  const done = () => { S.settings.firstRun = false; touch(); App.refreshChrome(); if (APP.screen === 'overview') App.overview(); setTimeout(() => Jin.speak({ text: 'Click me anytime for a tip. You can turn my automatic tips down in Settings.', mood: 'greeting' }), 400); };
  m.querySelector('[data-x=ok]').onclick = () => { S.settings.teacher = $('#fr-name').value.trim(); S.settings.school = $('#fr-school').value.trim(); S.exams.forEach(e => { if (!e.teacher) e.teacher = S.settings.teacher; if (!e.school) e.school = S.settings.school; }); closeModal(true); done(); };
  m.querySelector('[data-x=skip]').onclick = () => { closeModal(true); done(); };
}

/* ---------- startup ---------- */
(async function boot() {
  try { APP.info = await Host.info(); if (APP.info && APP.info.version) APP.version = APP.info.version; } catch (e) { APP.info = {}; }
  $('#hero-eyebrow').textContent = 'ASSESSMENT DESIGN SYSTEM  /  ' + new Date().getFullYear() + '—' + String(new Date().getFullYear() + 1).slice(-2);
  let loaded = null, note = null;
  try {
    const r = await Host.load();
    if (r && r.json) { const p = JSON.parse(r.json); const v = validateProject(p); if (v.ok) loaded = migrate(p); else note = 'Your saved project could not be opened (' + v.errors[0] + ').'; }
    if (r && r.recovered) note = 'Your project file was damaged, so I opened the latest automatic snapshot (' + r.recovered + '). The damaged file was kept beside it.';
    if (r && r.corrupt && !r.json) note = 'Your project file was damaged and no snapshot was available. The damaged data was kept in browser storage; you can restore a backup from Settings.';
  } catch (e) { console.error(e); note = 'Your saved project could not be read: ' + e.message; }
  let reB = 0; if (loaded) { S = loaded; reB = afterLoad(); }
  else {
    if (note) { const q = await Host.quarantine(); if (q && q.path) note += ' The unreadable file was kept as ' + q.path + '.'; }
    S = defaultState(); const ex = newExam(); S.exams.push(ex); S.currentExam = ex.id;
    if (!note) { Sample.fill(ex); Planner.applySample(ex); Tos.get(); }
    Save.pending = true; await Save.now();
  }
  if (loaded && Save.pending) await Save.now();
  App.go('overview');
  if (reB) setTimeout(() => toast(`Bloom levels now follow the Original Bloom’s Taxonomy (1956). ${plural(reB, 'automatic level')} changed after re-checking; levels you set yourself were kept.`, 'info', 10000), 500);
  if (note) setTimeout(() => toast(note, 'error', 12000), 300);
  else if (S.settings.firstRun) setTimeout(firstRunDialog, 350);
})();
