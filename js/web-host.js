/* Jin Assessment Studio — web host (GitHub Pages / any static hosting)
   Replaces the Electron preload bridge (window.jasHost) with browser APIs.
   Data stays in THIS browser on THIS device (IndexedDB). Nothing is uploaded anywhere.
   To move work to another computer: Save backup here, Restore backup there. */
'use strict';
(function () {
  const VERSION = '1.1.0-web';
  const MAX_SNAPSHOTS = 20;

  /* ---------- IndexedDB: 'kv' holds the project, 'snaps' holds automatic snapshots ---------- */
  let dbp = null;
  function db() {
    return dbp || (dbp = new Promise((res, rej) => {
      const r = indexedDB.open('jin-assessment-studio', 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('snaps')) d.createObjectStore('snaps');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error || new Error('This browser blocked local storage (private window?).'));
      r.onblocked = () => rej(new Error('Close other tabs of Jin Assessment Studio and reload.'));
    }));
  }
  async function op(store, mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store); let out;
      const r = fn(s); if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Storage write was aborted (disk full?)'));
    });
  }
  const get = (store, k) => op(store, 'readonly', s => s.get(k));
  const put = (store, k, v) => op(store, 'readwrite', s => s.put(v, k));
  const del = (store, k) => op(store, 'readwrite', s => s.delete(k));
  const keys = store => op(store, 'readonly', s => s.getAllKeys());

  const stamp = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  const okJSON = t => { try { JSON.parse(t); return true; } catch { return false; } };

  async function snapshot(label) {
    label = String(label || 'manual').replace(/[^a-z0-9-]/gi, '') || 'manual';
    const cur = await get('kv', 'project');
    if (!cur) return { ok: true, skipped: true };
    if (!okJSON(cur)) return { ok: false, error: 'current project data is unreadable' };
    const name = `${label}-${stamp()}.json`;
    await put('snaps', name, { json: cur, mtime: Date.now(), size: cur.length });
    const same = (await keys('snaps')).filter(k => String(k).startsWith(label + '-')).sort();
    for (const k of same.slice(0, Math.max(0, same.length - MAX_SNAPSHOTS))) await del('snaps', k);
    return { ok: true, name };
  }
  async function listSnapshots() {
    const ks = await keys('snaps'), out = [];
    for (const k of ks) {
      const v = await get('snaps', k); if (!v) continue;
      out.push({ name: k, size: v.size || (v.json || '').length, mtime: v.mtime || 0, label: k.startsWith('before-restore') ? 'Before a restore' : k.startsWith('startup') ? 'At start-up' : k.replace(/\.json$/, '') });
    }
    return out.sort((a, b) => b.mtime - a.mtime);
  }

  /* ---------- files ---------- */
  const MIME = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', json: 'application/json', jasbackup: 'application/octet-stream', txt: 'text/plain', csv: 'text/csv', png: 'image/png' };
  function download(name, bytes) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const blob = new Blob([bytes], { type: MIME[ext] || 'application/octet-stream' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    return { ok: true, path: name + ' (Downloads folder)' };
  }
  async function saveFile({ defaultName, filters, data }) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const name = defaultName || 'file';
    if (window.showSaveFilePicker && window.isSecureContext) {
      try {
        const types = (filters || []).filter(f => f.extensions && f.extensions.length && f.extensions[0] !== '*').map(f => ({ description: f.name, accept: { [MIME[f.extensions[0]] || 'application/octet-stream']: f.extensions.map(e => '.' + e) } }));
        const h = await window.showSaveFilePicker({ suggestedName: name, types: types.length ? types : undefined });
        const w = await h.createWritable(); await w.write(bytes); await w.close();
        return { ok: true, path: h.name };
      } catch (e) {
        if (e && e.name === 'AbortError') return { canceled: true };
        /* no user gesture left (long export) or picker refused: fall back to a normal download */
      }
    }
    return download(name, bytes);
  }
  function openFile({ filters }) {
    return new Promise(res => {
      const inp = document.createElement('input'); inp.type = 'file';
      const exts = (filters || []).flatMap(f => f.extensions || []).filter(e => e !== '*');
      inp.accept = exts.map(e => '.' + e).join(',');
      inp.style.display = 'none'; document.body.appendChild(inp);
      let done = false;
      const finish = v => { if (done) return; done = true; inp.remove(); res(v); };
      inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0];
        if (!f) return finish({ canceled: true });
        if (f.size > 200 * 1024 * 1024) return finish({ ok: false, error: 'File is larger than 200 MB.' });
        try { finish({ ok: true, name: f.name, data: new Uint8Array(await f.arrayBuffer()) }); }
        catch (e) { finish({ ok: false, error: e.message }); }
      });
      inp.addEventListener('cancel', () => finish({ canceled: true }));
      inp.click();
    });
  }

  /* ---------- print / PDF via a hidden iframe (no pop-up needed) ---------- */
  const cssStr = s => '"' + String(s || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ') + '"';
  function printHTML(html, o) {
    return new Promise(resolve => {
      o = o || {};
      let extra = '';
      if (o.footer !== undefined) {
        const m = o.margins || { top: 0.75, bottom: 0.85, left: 0.8, right: 0.8 };
        /* page footer with page numbers (Chrome/Edge 131+ support @page margin boxes; others simply omit it) */
        extra = `<style>@page{margin:${m.top}in ${m.right}in ${m.bottom}in ${m.left}in;
          @bottom-left{content:${cssStr(o.footer)};font-family:'Times New Roman',Times,serif;font-style:italic;font-size:9px;color:#222}
          @bottom-right{content:"page " counter(page) " of " counter(pages);font-family:'Times New Roman',Times,serif;font-style:italic;font-size:9px;color:#222}}</style>`;
      }
      const doc = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, extra + '</head>') : extra + html;
      const fr = document.createElement('iframe');
      fr.setAttribute('aria-hidden', 'true'); fr.tabIndex = -1;
      fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
      document.body.appendChild(fr);
      const w = fr.contentWindow, d = w.document;
      d.open(); d.write(doc); d.close();
      const oldTitle = document.title;
      const base = o.defaultName ? o.defaultName.replace(/\.pdf$/i, '') : null;
      const go = () => {
        if (base) { document.title = base; try { d.title = base; } catch { } }
        let finished = false;
        const end = () => { if (finished) return; finished = true; document.title = oldTitle; setTimeout(() => fr.remove(), 1000); resolve({ ok: true, path: 'print dialog' }); };
        w.addEventListener('afterprint', end, { once: true });
        try { w.focus(); w.print(); } catch (e) { document.title = oldTitle; fr.remove(); return resolve({ ok: false, error: e.message }); }
        setTimeout(end, 500); /* print() blocks in most browsers; this covers those where it doesn't */
      };
      const imgs = [...d.images].filter(i => !i.complete);
      if (!imgs.length) setTimeout(go, 250);
      else { let n = imgs.length; const one = () => { if (--n <= 0) setTimeout(go, 150); }; imgs.forEach(i => { i.onload = i.onerror = one; }); setTimeout(go, 4000); }
    });
  }

  /* ---------- "data folder" in the browser: explain where data lives ---------- */
  async function openDataFolder() {
    let usage = '';
    try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); usage = `<p class="tiny">Space used by this site: ${(e.usage / 1024 / 1024).toFixed(1)} MB.</p>`; } } catch { }
    let persisted = false; try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false; } catch { }
    const esc2 = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    window.modal(`<h3>Where your work is saved</h3><div class="mbody">
      <p style="margin-top:0">Your exams, item bank, competencies, TOS and item analysis are saved <b>inside this web browser on this computer</b>. Nothing is uploaded to GitHub or any server.</p>
      <ul>
        <li>Opening the site on <b>another computer</b>, in <b>another browser</b>, or in a <b>private/incognito window</b> starts empty.</li>
        <li>To move your work: click <b>Save backup</b> here, copy the <span class="kbd">.jasbackup</span> file, then click <b>Restore backup</b> on the other computer.</li>
        <li>Clearing this browser's site data / history for this site deletes the saved work. Save backups regularly.</li>
      </ul>
      <p class="tiny">Site: ${esc2(location.origin + location.pathname)} · Storage ${persisted ? 'is marked persistent (the browser won’t clear it on its own).' : 'is not marked persistent; the browser may clear it if the disk gets very full.'}</p>${usage}
      </div><div class="mfoot"><button class="btn" data-a="modal-close">Close</button><button class="btn blue" data-a="backup">Save backup now</button></div>`, { size: 'narrow' });
  }

  /* ---------- flush on leave (tab closed, reloaded, hidden, phone app switched) ---------- */
  function onFlush(cb) {
    const run = () => { try { cb(); } catch { } };
    window.addEventListener('pagehide', run);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') run(); });
  }

  /* ---------- warn if the site is open in two tabs (they would overwrite each other) ---------- */
  try {
    const bc = new BroadcastChannel('jin-assessment-studio');
    bc.onmessage = e => {
      if (e.data === 'hello') bc.postMessage('here');
      if (e.data === 'here' && window.toast) window.toast('Jin Assessment Studio is also open in another tab. Use only one tab, or changes in one will overwrite the other.', 'error', 12000);
    };
    window.addEventListener('load', () => setTimeout(() => bc.postMessage('hello'), 800));
  } catch { }

  /* ask the browser not to evict our data */
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch { }

  window.jasHost = {
    web: true,
    info: async () => ({ version: VERSION, dataDir: 'This browser on this computer (not uploaded anywhere)', platform: 'web' }),
    loadProject: async () => {
      const txt = await get('kv', 'project');
      if (!txt) return { json: null };
      if (okJSON(txt)) return { json: txt };
      await put('kv', `project.corrupt-${stamp()}`, txt);
      for (const s of await listSnapshots()) {
        const v = await get('snaps', s.name);
        if (v && okJSON(v.json)) { await put('kv', 'project', v.json); return { json: v.json, recovered: s.name }; }
      }
      return { json: null, corrupt: true };
    },
    saveProject: async json => {
      try { if (typeof json !== 'string' || json.length < 2) throw new Error('empty project'); JSON.parse(json); await put('kv', 'project', json); return { ok: true }; }
      catch (e) { return { ok: false, error: e && e.name === 'QuotaExceededError' ? 'Browser storage is full. Save a backup and remove large images.' : (e && e.message) || String(e) }; }
    },
    quarantine: async () => {
      const cur = await get('kv', 'project'); if (!cur) return { ok: true };
      const k = `project.unreadable-${stamp()}`; await put('kv', k, cur); await del('kv', 'project');
      return { ok: true, path: k + ' (browser storage)' };
    },
    snapshot: async label => { try { return await snapshot(label); } catch (e) { return { ok: false, error: e.message }; } },
    listSnapshots: async () => { try { return await listSnapshots(); } catch { return []; } },
    readSnapshot: async name => { try { const v = await get('snaps', String(name)); return v ? { ok: true, json: v.json } : { ok: false, error: 'not found' }; } catch (e) { return { ok: false, error: e.message }; } },
    openDataFolder,
    saveFile,
    openFile,
    printToPDF: o => printHTML(o.html, o),
    print: o => printHTML(o.html, null),
    onFlush
  };

  /* one start-up snapshot per page load, like the desktop app */
  window.jasHost.snapshot('startup').catch(() => { });
})();
