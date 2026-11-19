/* Jin Assessment Studio — core: utilities, host bridge, state, persistence, UI primitives */
'use strict';
const APP = { version: '1.1.0', screen: 'overview' };
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 9);
const nowISO = () => new Date().toISOString();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LET = 'ABCDEFGHIJ';
/* ORIGINAL Bloom's Taxonomy (1956), as used in the school's TOS. Index = hierarchy rank. */
const BL = ['Knowledge', 'Comprehension', 'Application', 'Analysis', 'Synthesis', 'Evaluation'];
const BL_SHORT = ['Knowledge', 'Comprehension', 'Application', 'Analysis', 'Synthesis', 'Evaluation'];
const BL_CODE = ['K', 'C', 'AP', 'AN', 'S', 'E'];
/* TOS columns in the supplied format: K, C, AN, AP, S, E. b = Bloom index */
const TOSCOLS = [{ k: 'K', b: 0, n: 'Knowledge' }, { k: 'C', b: 1, n: 'Comprehension' }, { k: 'AN', b: 3, n: 'Analysis' }, { k: 'AP', b: 2, n: 'Application' }, { k: 'S', b: 4, n: 'Synthesis' }, { k: 'E', b: 5, n: 'Evaluation' }];
const icon = (n, cls = '') => `<svg class="i ${cls}"><use href="#i-${n}"/></svg>`;
const plural = (n, w, p) => n + ' ' + (n === 1 ? w : (p || w + 's'));
function fmtWhen(iso) {
  if (!iso) return '';
  const d = new Date(iso), n = new Date(), diff = (n - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
  const sameDay = d.toDateString() === n.toDateString();
  if (sameDay) return 'today ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const y = new Date(n); y.setDate(n.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
}
function greetName() { const n = (S.settings.teacher || '').trim(); if (!n) return ''; const parts = n.split(/\s+/); return /^(ms|mr|mrs|miss|dr|sir|ma'?am|teacher|prof|engr|atty)\.?$/i.test(parts[0]) ? n : parts[0]; }
function debounce(fn, ms) { let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; f.flush = (...a) => { clearTimeout(t); fn(...a); }; return f; }
const stripHTML = h => { const d = document.createElement('div'); d.innerHTML = String(h || '').replace(/<br\s*\/?>/gi, ' ').replace(/<\/(div|p|li)>/gi, ' '); return d.textContent.replace(/\s+/g, ' ').trim(); };
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
function safeName(s, fb = 'file') { return (String(s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)) || fb; }

/* ---------- HTML sanitizer for rich question text ---------- */
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'SUB', 'SUP', 'BR', 'DIV', 'P', 'SPAN', 'IMG', 'UL', 'OL', 'LI']);
function sanitizeHTML(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString('<body>' + html, 'text/html');
  const walk = node => {
    [...node.childNodes].forEach(n => {
      if (n.nodeType === 3) return;
      if (n.nodeType !== 1) { n.remove(); return; }
      if (!ALLOWED_TAGS.has(n.tagName)) {
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'META', 'LINK', 'TITLE', 'HEAD'].includes(n.tagName)) { n.remove(); return; }
        walk(n); n.replaceWith(...n.childNodes); return;
      }
      [...n.attributes].forEach(a => {
        const keep = n.tagName === 'IMG' && a.name === 'src' && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(a.value);
        if (!keep) n.removeAttribute(a.name);
      });
      if (n.tagName === 'IMG' && !n.getAttribute('src')) { n.remove(); return; }
      walk(n);
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/* ---------- host bridge (Electron preload or browser fallback) ---------- */
const Host = (() => {
  const native = window.jasHost || null;
  const IDB = {
    db: null,
    open() { return this.db || (this.db = new Promise((res, rej) => { const r = indexedDB.open('jin-assessment-studio', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); })); },
    async get(k) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error); }); },
    async set(k, v) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
  };
  const toBytes = d => d instanceof Uint8Array ? d : (typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d));
  return {
    native: !!native,
    async info() { return native ? native.info() : { version: APP.version, dataDir: 'Browser storage (IndexedDB) — preview mode', platform: 'browser', snapshots: [] }; },
    async load() { if (native) return native.loadProject(); const v = await IDB.get('project'); return { json: v || null }; },
    async save(json) { if (native) return native.saveProject(json); await IDB.set('project', json); return { ok: true }; },
    /* save bytes/text to a user-chosen file */
    async saveFile(name, data, filters) {
      const bytes = toBytes(data);
      if (native) return native.saveFile({ defaultName: name, filters: filters || [], data: bytes });
      const blob = new Blob([bytes]); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); return { ok: true, path: name };
    },
    /* open a file -> {name, bytes:Uint8Array} or null */
    async openFile(accept, filters) {
      if (native) { const r = await native.openFile({ filters: filters || [] }); return r && r.ok ? { name: r.name, bytes: new Uint8Array(r.data) } : null; }
      return new Promise(res => {
        const inp = $('#file-pick'); inp.value = ''; inp.accept = accept || ''; let done = false;
        inp.onchange = async () => { done = true; const f = inp.files[0]; if (!f) return res(null); res({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); };
        window.addEventListener('focus', () => setTimeout(() => { if (!done && !inp.files.length) res(null); }, 800), { once: true });
        inp.click();
      });
    },
    /* html -> PDF file. Browser fallback opens the print dialog. */
    async printToPDF(html, opts) {
      if (native) return native.printToPDF({ html, ...opts });
      const w = window.open('', '_blank'); if (!w) return { ok: false, error: 'Pop-up blocked' };
      w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); return { ok: true, path: '(print dialog)' };
    },
    async print(html, opts) { if (native) return native.print({ html, ...opts }); return this.printToPDF(html, opts); },
    async openDataFolder() { if (native) return native.openDataFolder(); toast('Data folder is only available in the desktop app.', 'info'); },
    async listSnapshots() { return native ? native.listSnapshots() : []; },
    async readSnapshot(name) { return native ? native.readSnapshot(name) : null; },
    async quarantine() { return native && native.quarantine ? native.quarantine() : { ok: true }; },
    async beforeRestore() { return native ? native.snapshot('before-restore') : { ok: true }; },
    onFlush(cb) { if (native && native.onFlush) native.onFlush(cb); }
  };
})();

/* ---------- state ---------- */
const DEFAULT_INSTR = 'Read each item carefully. Choose or write the best answer. Show your complete solutions where required.';
function newExam(o = {}) {
  return Object.assign({ id: uid(), title: 'Untitled Assessment', subject: '', grade: '', teacher: (S && S.settings && S.settings.teacher) || '', date: '', schoolYear: '', start: 1, school: '', logo: '', quarter: '', strand: '', plan: null, instr: DEFAULT_INSTR, endNote: '---------- END OF EXAMINATION ----------\nREVIEW YOUR ANSWERS.', status: 'Draft', items: [], created: nowISO(), updated: nowISO() }, o);
}
function defaultState() {
  return {
    format: 'jin-assessment-studio', schema: 1, bloomScheme: 'original-1956', created: nowISO(), updated: nowISO(), appVersion: APP.version,
    settings: { teacher: '', school: '', jinAuto: 'normal', groupPct: 27, paper: 'long', firstRun: true },
    topics: [], qs: [], exams: [], currentExam: null, tos: {}, groups: [], currentGroup: null
  };
}
let S = defaultState();

/* lookups */
const Q = id => S.qs.find(q => q.id === id);
const kidsOf = q => (q && q.kids || []).map(Q).filter(Boolean);
const parentOf = q => q && q.parent ? Q(q.parent) : null;
const curExam = () => S.exams.find(e => e.id === S.currentExam) || S.exams[0] || null;
const examById = id => S.exams.find(e => e.id === id);
const allComps = () => S.topics.flatMap(t => t.comps.map(c => ({ ...c, topic: t.name, topicId: t.id })));
const compById = id => { for (const t of S.topics) { const c = t.comps.find(c => c.id === id); if (c) return { ...c, topic: t.name }; } return null; };
const compLabel = id => { const c = compById(id); return c ? c.text : ''; };
const isGroup = q => q && (q.type === 'passage' || q.type === 'matching');
const isLeaf = q => q && !isGroup(q) && q.type !== 'section';
const bankItems = () => S.qs.filter(q => q.inBank && !q.parent && q.type !== 'section');

function newQ(type = 'mc', o = {}) {
  const q = { id: uid(), type, stem: '', opts: [], oimg: [], ans: '', ansText: '', statements: [], x: '', y: '', xt: true, yt: false, pts: 1, fbd: false, bloom: 0, bloomWhy: '', bloomConf: '', bloomManual: false, comp: '', compConf: '', compWhy: '', inBank: false, parent: null, created: nowISO(), updated: nowISO() };
  if (type === 'mc') q.opts = ['', '', '', ''];
  if (type === 'cmc') { q.statements = ['', '', '']; q.opts = ['I only', 'I and II only', 'II and III only', 'I, II, and III']; }
  if (type === 'morse') q.ans = 'A';
  if (type === 'prob') { q.pts = 3; q.bloom = 2; }
  if (type === 'passage') { q.kids = []; q.head = ''; q.sopts = []; }
  if (type === 'matching') { q.kids = []; q.head = ''; q.sopts = ['', '', '', '', '']; q.stem = ''; }
  if (type === 'section') { q.title = 'Multiple Choice'; q.dir = 'Choose the letter of the best answer.'; q.preset = 'mc'; }
  return Object.assign(q, o);
}
const morseAns = q => q.xt && q.yt ? 'C' : q.xt ? 'A' : q.yt ? 'B' : 'D';

/* deep copy a question (and its kids) — returns new top-level question */
function cloneQ(q, o = {}) {
  const c = JSON.parse(JSON.stringify(q)); c.id = uid(); c.created = c.updated = nowISO(); Object.assign(c, o);
  if (isGroup(q)) { c.kids = kidsOf(q).map(k => { const kc = JSON.parse(JSON.stringify(k)); kc.id = uid(); kc.parent = c.id; kc.inBank = false; S.qs.push(kc); return kc.id; }); }
  S.qs.push(c); return c;
}
/* remove a question entirely (and its kids) */
function removeQ(id) {
  const q = Q(id); if (!q) return;
  const ids = new Set([id, ...(q.kids || [])]);
  if (q.parent) { const p = Q(q.parent); if (p) p.kids = p.kids.filter(k => k !== id); }
  S.qs = S.qs.filter(x => !ids.has(x.id));
  S.exams.forEach(e => { e.items = e.items.filter(x => !ids.has(x)); });
}
/* drop orphan questions (not in bank, not in any exam, not a kid of a live group) */
function gcQuestions() {
  const live = new Set();
  S.exams.forEach(e => e.items.forEach(id => live.add(id)));
  S.qs.forEach(q => { if (q.inBank && !q.parent) live.add(q.id); });
  S.qs.forEach(q => { if (live.has(q.id) && q.kids) q.kids.forEach(k => live.add(k)); });
  S.qs = S.qs.filter(q => live.has(q.id));
}

/* ---------- validation / migration ---------- */
function validateProject(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return { ok: false, errors: ['The file does not contain project data.'] };
  if (p.format !== 'jin-assessment-studio') errors.push('This is not a Jin Assessment Studio project.');
  if (!Array.isArray(p.qs)) errors.push('Question list is missing.');
  if (!Array.isArray(p.exams)) errors.push('Exam list is missing.');
  if (!Array.isArray(p.topics)) errors.push('Competency list is missing.');
  if (p.groups && !Array.isArray(p.groups)) errors.push('Item analysis data is damaged.');
  if (typeof p.schema === 'number' && p.schema > 1) errors.push('This backup was made by a newer version of the app (schema ' + p.schema + '). Update the app first.');
  if (!errors.length) {
    const ids = new Set(p.qs.map(q => q && q.id));
    if (ids.has(undefined)) errors.push('Some questions are missing their IDs.');
    const missing = p.exams.reduce((n, e) => n + (Array.isArray(e.items) ? e.items.filter(i => !ids.has(i)).length : 1), 0);
    if (missing) errors.push(missing + ' exam item reference(s) point to missing questions.');
  }
  return { ok: !errors.length, errors };
}
function summarizeProject(p) {
  const comps = (p.topics || []).reduce((n, t) => n + (t.comps || []).length, 0);
  return { exams: (p.exams || []).length, bank: (p.qs || []).filter(q => q.inBank && !q.parent && q.type !== 'section').length, questions: (p.qs || []).length, comps, sections: (p.groups || []).length, updated: p.updated };
}
function migrate(p) {
  const d = defaultState();
  p.settings = Object.assign({}, d.settings, p.settings || {});
  p.tos = p.tos || {}; p.groups = p.groups || []; p.topics = p.topics || [];
  p.topics.forEach(t => { t.id = t.id || uid(); t.comps = (t.comps || []).map(c => typeof c === 'string' ? { id: uid(), text: c } : { id: c.id || uid(), text: c.text || '' }); });
  p.qs.forEach(q => {
    const base = newQ(q.type || 'mc'); for (const k in base) if (q[k] === undefined) q[k] = base[k];
    q.stem = sanitizeHTML(q.stem); if (q.type === 'passage' || q.type === 'matching') { q.kids = q.kids || []; q.sopts = q.sopts || []; }
    q.oimg = (q.oimg || []).map(s => /^data:image\//.test(s || '') ? s : '');
  });
  p.exams.forEach(e => { const b = newExam(); for (const k in b) if (e[k] === undefined) e[k] = b[k]; });
  if (!p.exams.find(e => e.id === p.currentExam)) p.currentExam = p.exams[0] ? p.exams[0].id : null;
  /* v1.1: switch to the ORIGINAL Bloom's Taxonomy (1956). Old index 4 = Evaluating, 5 = Creating;
     new index 4 = Synthesis, 5 = Evaluation, so swap them once. */
  if (p.bloomScheme !== 'original-1956') {
    const sw = b => b === 4 ? 5 : b === 5 ? 4 : b;
    p.qs.forEach(q => { if (typeof q.bloom === 'number') q.bloom = sw(q.bloom); });
    p.bloomScheme = 'original-1956'; p._reclassify = true;
  }
  /* v1.1: TOS cells hold item numbers (text) like the school's Excel TOS */
  Object.values(p.tos || {}).forEach(t => (t.rows || []).forEach(r => {
    if (!r.cells) {
      r.cells = {};
      TOSCOLS.forEach(c => { const its = r.items && r.items[c.k] ? r.items[c.k] : []; const n = parseInt((r.counts || {})[c.k]) || 0; r.cells[c.k] = its.length ? its.join(', ') : n ? Array(n).fill('?').join(', ') : ''; });
      r.genCells = r.gen ? { ...r.cells } : null;
    }
    r.kind = r.kind || 'comp';
  }));
  p.exams.forEach(e => { if (e.plan) Planner.migrate(e.plan); });
  p.schema = 1; p.format = 'jin-assessment-studio';
  return p;
}

/* after a project is loaded: re-check automatic Bloom levels with the 1956 rules (levels you set yourself are kept) */
function afterLoad() {
  if (!S._reclassify) return 0; delete S._reclassify; let n = 0;
  S.qs.forEach(q => { if (isLeaf(q) && !q.bloomManual) { const b = q.bloom; Classify.autoBloom(q); if (q.bloom !== b) n++; } });
  Save.pending = true; return n;
}
/* ---------- persistence ---------- */
const Save = {
  pending: false, lastOk: null, error: null,
  status(kind, text) { const el = $('#save-status'); if (!el) return; el.className = 'status ' + (kind || ''); el.querySelector('span').textContent = text; },
  touch() { S.updated = nowISO(); this.pending = true; this.status('saving', 'Saving…'); this.run(); },
  run: debounce(async () => { await Save.now(); }, 600),
  async now() {
    if (!Save.pending) return true;
    Save.pending = false;
    try {
      S.appVersion = APP.version;
      const r = await Host.save(JSON.stringify(S));
      if (r && r.ok === false) throw new Error(r.error || 'write failed');
      Save.lastOk = new Date(); Save.error = null; Save.status('', 'All changes saved');
      return true;
    } catch (e) {
      Save.error = e.message; Save.pending = true; Save.status('error', 'Save failed — retrying');
      console.error('save failed', e); setTimeout(() => Save.run(), 3000); return false;
    }
  }
};
const touch = () => Save.touch();
Host.onFlush(async () => { await Save.now(); return true; });
window.addEventListener('beforeunload', () => { if (Save.pending) { Save.now(); } });

/* ---------- UI primitives ---------- */
const CHIBI = { happy: 'assets/jin/chibi-happy.webp', sad: 'assets/jin/chibi-sad.webp', concerned: 'assets/jin/chibi-concerned.webp', idea: 'assets/jin/chibi-idea-surprised.webp', angry: 'assets/jin/chibi-angry.webp' };
function toast(msg, kind = 'ok', ms) {
  const box = $('#toasts'); const t = document.createElement('div'); t.className = 'toast ' + (kind === 'ok' ? '' : kind);
  const img = kind === 'error' ? CHIBI.sad : kind === 'info' ? CHIBI.idea : CHIBI.happy;
  t.innerHTML = `<img src="${img}" alt=""><span>${esc(msg)}</span>`; t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  box.appendChild(t); setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, ms || (kind === 'error' ? 6500 : 3200));
}
let modalStack = [];
function modal(html, opts = {}) {
  const root = $('#modal-root');
  const m = document.createElement('div'); m.className = 'modal ' + (opts.size || ''); m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true');
  m.innerHTML = (opts.noClose ? '' : `<button class="mclose" data-a="modal-close" aria-label="Close">${icon('x')}</button>`) + html;
  root.innerHTML = ''; root.appendChild(m); root.classList.add('open');
  modalStack = [{ el: m, onClose: opts.onClose }];
  setTimeout(() => { const f = m.querySelector('[autofocus]') || m.querySelector('input,textarea,select,.ed'); if (f && !opts.noFocus) f.focus(); }, 30);
  return m;
}
function closeModal(silent) {
  const root = $('#modal-root'); const top = modalStack.pop();
  root.classList.remove('open'); root.innerHTML = '';
  if (top && top.onClose && !silent) top.onClose();
}
function confirmDlg({ title, msg, ok = 'Continue', cancel = 'Cancel', danger = false, chibi = 'concerned', html = '' }) {
  return new Promise(res => {
    const m = modal(`<h3>${esc(title)}</h3><div class="mbody">${chibi ? `<img class="chibi-side" src="${CHIBI[chibi]}" alt="">` : ''}<p style="margin:0">${esc(msg)}</p>${html}<div style="clear:both"></div></div><div class="mfoot"><button class="btn" data-x="no">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'blue'}" data-x="yes" autofocus>${esc(ok)}</button></div>`, { size: 'narrow', onClose: () => res(false), noFocus: false });
    m.querySelector('[data-x=yes]').onclick = () => { closeModal(true); res(true); };
    m.querySelector('[data-x=no]').onclick = () => { closeModal(true); res(false); };
  });
}
function promptDlg({ title, label, value = '', ok = 'Save', type = 'text', min }) {
  return new Promise(res => {
    const m = modal(`<h3>${esc(title)}</h3><div class="mbody"><label class="field">${esc(label)}<input id="pd-in" type="${type}" ${min != null ? `min="${min}"` : ''} value="${esc(value)}"></label></div><div class="mfoot"><button class="btn" data-x="no">Cancel</button><button class="btn blue" data-x="yes">${esc(ok)}</button></div>`, { size: 'narrow', onClose: () => res(null) });
    const go = () => { const v = $('#pd-in').value; closeModal(true); res(v); };
    m.querySelector('[data-x=yes]').onclick = go; m.querySelector('[data-x=no]').onclick = () => { closeModal(true); res(null); };
    $('#pd-in').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  });
}

/* ---------- action delegation ---------- */
const ACT = {};
document.addEventListener('click', e => {
  const dd = e.target.closest('[data-dd]');
  if (dd) { const m = document.getElementById(dd.dataset.dd); const open = m && m.classList.contains('open'); $$('.ddm.open').forEach(x => x.classList.remove('open')); if (m && !open) m.classList.add('open'); e.stopPropagation(); return; }
  if (!e.target.closest('.ddm')) $$('.ddm.open').forEach(x => x.classList.remove('open'));
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a;
  if (b.closest('.ddm')) $$('.ddm.open').forEach(x => x.classList.remove('open'));
  if (a === 'modal-close') { closeModal(); return; }
  const fn = ACT[a];
  if (fn) { if (!b.matches('input')) e.preventDefault(); try { const r = fn(b, e); if (r && r.catch) r.catch(err => { console.error(err); toast(err.message || String(err), 'error'); }); } catch (err) { console.error(err); toast(err.message || String(err), 'error'); } }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#modal-root').classList.contains('open')) closeModal(); else if ($('#assistant').classList.contains('open')) Jin.togglePanel(false); $$('.ddm.open').forEach(x => x.classList.remove('open')); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-a]')) { e.preventDefault(); e.target.click(); }
});
/* sanitize paste into rich editors */
document.addEventListener('paste', e => {
  const ed = e.target.closest && e.target.closest('.ed'); if (!ed) return;
  const html = e.clipboardData.getData('text/html'), text = e.clipboardData.getData('text/plain');
  const img = [...e.clipboardData.items].find(i => i.type.startsWith('image/'));
  e.preventDefault();
  if (img && !text) { const f = img.getAsFile(); resizeImage(f, 640).then(src => document.execCommand('insertImage', false, src)); return; }
  if (html) document.execCommand('insertHTML', false, sanitizeHTML(html.replace(/<!--[\s\S]*?-->/g, '')).replace(/<(div|p)>\s*<\/\1>/g, ''));
  else document.execCommand('insertText', false, text);
});
function resizeImage(file, maxW = 640, quality = 0.85) {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onerror = () => rej(r.error);
    r.onload = () => { const im = new Image(); im.onerror = () => rej(new Error('Not a supported image')); im.onload = () => { const k = Math.min(1, maxW / im.width), cv = document.createElement('canvas'); cv.width = Math.round(im.width * k); cv.height = Math.round(im.height * k); const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(im, 0, 0, cv.width, cv.height); res(cv.toDataURL('image/jpeg', quality)); }; im.src = r.result; };
    r.readAsDataURL(file);
  });
}
function bytesToImageFile(bytes, name) { const ext = (name.split('.').pop() || 'png').toLowerCase(); return new File([bytes], name, { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) }); }
async function pickImage(maxW) {
  const f = await Host.openFile('image/*', [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]);
  if (!f) return null; return resizeImage(bytesToImageFile(f.bytes, f.name), maxW || 640);
}
async function saveOut(name, data, filters, what) {
  try {
    const r = await Host.saveFile(name, data, filters);
    if (r && r.canceled) return false;
    if (r && r.ok === false) throw new Error(r.error || 'Could not write the file');
    toast((what || 'File') + ' saved' + (r && r.path && Host.native ? ': ' + r.path : '.'));
    return true;
  } catch (e) { toast('Could not save ' + (what || 'file').toLowerCase() + ': ' + e.message, 'error'); return false; }
}
