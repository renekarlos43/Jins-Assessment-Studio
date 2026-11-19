/* Jin Assessment Studio — reader for the school's quiz layout in Word (.docx)
   Recognizes tests like "MODIFIED TRUE or FALSE (10 pts)", "MULTIPLE CHOICE (5 pts)", "WORD POOL (8 pts)", "TIMELINE (12 pts)",
   "PROBLEM SOLVING", "ESSAY", "CASE STUDY", "ANALYSIS" …, items laid out in Word tables ("_____ 1." in the first cell),
   auto-numbered or tab-separated two-column choices, and answer keys marked with yellow highlight or underlined text in the blank. */
'use strict';
const SchoolDocx = (() => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main', V = 'urn:schemas-microsoft-com:vml';
  const kids = (el, name) => [...el.childNodes].filter(n => n.nodeType === 1 && n.namespaceURI === W && n.localName === name);
  const attr = (el, name) => el ? (el.getAttributeNS(W, name) || el.getAttribute('w:' + name) || '') : '';
  const first = (el, name) => el ? kids(el, name)[0] || null : null;
  const isOn = el => !!el && !/^(0|false|off|none)$/i.test(attr(el, 'val'));
  /* ---------- reading ---------- */
  function para(p) {
    const runs = [], imgs = [];
    const walk = node => {
      for (const n of node.childNodes) {
        if (n.nodeType !== 1) continue;
        if (n.namespaceURI === W && n.localName === 'r') run(n);
        else if (n.namespaceURI === W && ['hyperlink', 'smartTag', 'ins', 'sdt', 'sdtContent', 'fldSimple', 'customXml'].includes(n.localName)) walk(n);
      }
    };
    const run = r => {
      const pr = first(r, 'rPr'), hl = pr && first(pr, 'highlight'), shd = pr && first(pr, 'shd'), u = pr && first(pr, 'u'), va = pr && first(pr, 'vertAlign');
      const st = { hl: (hl && attr(hl, 'val') !== 'none') || (shd && /^(FFFF00|yellow)$/i.test(attr(shd, 'fill'))), u: !!u && attr(u, 'val') !== 'none', b: isOn(pr && first(pr, 'b')), i: isOn(pr && first(pr, 'i')), sup: attr(va, 'val') === 'superscript', sub: attr(va, 'val') === 'subscript' };
      for (const c of r.childNodes) {
        if (c.nodeType !== 1) continue;
        if (c.localName === 't') runs.push({ t: c.textContent, ...st });
        else if (c.localName === 'tab') runs.push({ t: '\t', ...st });
        else if (c.localName === 'br' || c.localName === 'cr') runs.push({ t: '\n', ...st });
        else if (['drawing', 'pict', 'object', 'AlternateContent'].includes(c.localName)) {
          /* AlternateContent repeats the picture in Choice and Fallback: take each relationship once */
          [...c.getElementsByTagNameNS(A, 'blip')].forEach(b => { const id = b.getAttributeNS(R, 'embed') || b.getAttribute('r:embed'); if (id && !imgs.includes(id)) imgs.push(id); });
          if (!c.getElementsByTagNameNS(A, 'blip').length) [...c.getElementsByTagNameNS(V, 'imagedata')].forEach(b => { const id = b.getAttributeNS(R, 'id') || b.getAttribute('r:id'); if (id && !imgs.includes(id)) imgs.push(id); });
        }
      }
    };
    walk(p);
    const pPr = first(p, 'pPr'), num = !!(pPr && first(pPr, 'numPr'));
    const text = runs.map(r => r.t).join('');
    return { kind: 'p', runs, imgs, num, text, plain: text.replace(/\s+/g, ' ').trim() };
  }
  function table(tbl) {
    return { kind: 't', rows: kids(tbl, 'tr').map(tr => kids(tr, 'tc').map(tc => { const ps = []; const add = el => kids(el, 'p').forEach(p => ps.push(para(p))); add(tc); kids(tc, 'sdt').forEach(s => { const c = first(s, 'sdtContent'); if (c) add(c); }); kids(tc, 'tbl').forEach(t => table(t).rows.flat().forEach(cell => ps.push(...cell))); return ps; })) };
  }
  function blocksOf(body) {
    const out = [];
    for (const n of body.childNodes) {
      if (n.nodeType !== 1 || n.namespaceURI !== W) continue;
      if (n.localName === 'p') out.push(para(n));
      else if (n.localName === 'tbl') out.push(table(n));
      else if (n.localName === 'sdt') { const c = first(n, 'sdtContent'); if (c) out.push(...blocksOf(c)); }
    }
    return out;
  }
  /* ---------- helpers ---------- */
  const escH = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function runsHTML(runs) {
    return runs.map(r => { if (r.t === '\t') return ' '; if (r.t === '\n') return '<br>'; let h = escH(r.t); if (r.sup) h = `<sup>${h}</sup>`; if (r.sub) h = `<sub>${h}</sub>`; if (r.u && r.t.trim() && !/^_+$/.test(r.t.trim())) h = `<u>${h}</u>`; return h; }).join('').replace(/<\/u><u>/g, '').replace(/\s+/g, ' ').trim();
  }
  const hlText = runs => runs.filter(r => r.hl && r.t.trim()).map(r => r.t).join('').replace(/\s+/g, ' ').trim();
  const uText = runs => { const segs = []; let cur = ''; runs.forEach(r => { if (r.u && r.t.trim() && !/^_+$/.test(r.t.trim())) cur += r.t; else if (cur) { segs.push(cur.trim()); cur = ''; } }); if (cur) segs.push(cur.trim()); return segs.filter(Boolean); };
  const PTS_RE = /\(\s*(\d+(?:\.\d+)?)\s*(?:pts?|points?)\.?\s*(?:each)?\s*\)/i;
  const stripPts = s => String(s).replace(/\s*\(\s*\d+(?:\.\d+)?\s*(?:pts?|points?)\.?\s*(?:each)?\s*\)\s*:?/ig, ' ').replace(/\s+/g, ' ').trim();
  function sectionHeader(p) {
    if (p.kind !== 'p') return null;
    const t = p.plain.replace(/^[IVX]+\.\s*/, '');
    const m = t.match(/^([A-Za-z][A-Za-z0-9 ,&'’\-\/#]{2,70}?)\s*\(\s*(\d+(?:\.\d+)?)\s*(?:pts?|points?)\s*\)\s*$/i); if (!m) return null;
    const letters = m[1].replace(/[^A-Za-z]/g, ''), up = m[1].replace(/[^A-Z]/g, '').length;
    if (letters.length < 4 || up / letters.length < .7) return null;
    return { title: m[1].replace(/\s+/g, ' ').trim(), pts: +m[2] };
  }
  function kindOf(title) {
    const t = title.toUpperCase();
    if (/TRUE\s*(OR|\/)\s*FALSE/.test(t)) return 'mtf';
    if (/MULTIPLE\s*CHOICE/.test(t)) return 'mc';
    if (/WORD\s*POOL|IDENTIFICATION|COMPONENT|MATCHING/.test(t)) return 'pool';
    if (/TIMELINE|CHRONOLOG|ARRANGE|SEQUENC/.test(t)) return 'seq';
    if (/PROBLEM\s*SOLVING|COMPUTATION|SOLVE/.test(t)) return 'prob';
    return 'essay';
  }
  const presetOf = (kind, title) => { const t = title.toUpperCase(); if (kind === 'essay') return /CASE/.test(t) ? 'case' : /ANALYSIS/.test(t) ? 'analysis' : /ESSAY/.test(t) ? 'essay' : /TABLE/.test(t) ? 'table' : 'custom'; return { mtf: 'mtf', mc: 'mc', pool: 'wordpool', seq: 'seq', prob: 'prob' }[kind] || 'custom'; };
  /* "_____ 1." / "__True __1." / "{{Orion}}2." / "Protoplanet." → { ans, num, rest } */
  function leadParse(paras) {
    const t = paras.map(p => p.text).join(' ').replace(/\s+/g, ' ').trim(); if (!t) return null;
    let m = t.match(/^(.*?)(\d+)\s*[.)]\s*(.*)$/);
    const clean = s => s.replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
    if (m && clean(m[1]).length <= 40 && !/[\d.,]$/.test(m[1])) {
      if (/^\d/.test(m[3]) && !/_/.test(m[1])) return null; /* "0.03050 …" or "9.52 …" is a value, not an item number */
      return { ans: clean(m[1]), num: +m[2], rest: m[3].trim(), restRuns: null };
    }
    m = t.match(/^(.*?)\.\s*$/); if (m && /_|\w/.test(m[1]) && clean(m[1]).length <= 40) return { ans: clean(m[1]), num: null, rest: '' };
    return null;
  }
  function choiceParts(p) {
    const parts = [{ t: '', hl: false, runs: [] }];
    p.runs.forEach(r => { if (r.t === '\t') { if (parts[parts.length - 1].t.trim()) parts.push({ t: '', hl: false, runs: [] }); return; } const c = parts[parts.length - 1]; c.t += r.t; c.runs.push(r); if (r.hl && r.t.trim()) c.hl = true; });
    return parts.filter(x => x.t.trim()).map(x => { const m = x.t.trim().match(/^([A-J])[.)]\s*(.*)$/); return m ? { L: m[1], t: m[2].trim(), hl: x.hl } : { L: '', t: x.t.trim(), hl: x.hl }; });
  }
  const isChoicePara = p => p.num || /^\s*[A-J][.)]\s+\S/.test(p.text);
  function buildChoices(paras) {
    const parts = paras.flatMap(choiceParts), used = new Set(parts.filter(x => x.L).map(x => x.L));
    const free = [...'ABCDEFGHIJ'].filter(l => !used.has(l)); parts.forEach(x => { if (!x.L) x.L = free.shift() || '?'; });
    parts.sort((a, b) => a.L.localeCompare(b.L));
    const k = parts.find(x => x.hl);
    return { opts: parts.map(x => x.t), ans: k ? k.L : '' };
  }
  function allocate(total, n, explicit) {
    const out = explicit.slice(), fixed = out.reduce((s, v) => s + (v || 0), 0), free = out.filter(v => !v).length;
    if (!free) return out;
    const left = Math.max(0, total - fixed), each = left / free;
    return out.map(v => v || Math.round(each * 100) / 100);
  }
  /* ---------- images ---------- */
  async function loadImages(z, relsXml, ids) {
    const map = {}; if (!relsXml || !ids.length) return map;
    const doc = new DOMParser().parseFromString(relsXml, 'application/xml'), rel = {};
    [...doc.getElementsByTagName('Relationship')].forEach(r => rel[r.getAttribute('Id')] = r.getAttribute('Target'));
    for (const id of [...new Set(ids)]) {
      const tg = rel[id]; if (!tg || !/\.(png|jpe?g|gif|bmp)$/i.test(tg)) continue;
      const path = tg.startsWith('/') ? tg.slice(1) : 'word/' + tg.replace(/^\.\//, '');
      try { const b = await z.bytes(path); if (!b) continue; const ext = tg.split('.').pop().toLowerCase(); const f = new File([b], 'img.' + ext, { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) }); map[id] = await resizeImage(f, 640, .82); } catch (e) { }
    }
    return map;
  }
  /* ---------- interpreting ---------- */
  async function parse(bytes, fmt) {
    const z = await Office.unzip(bytes), xml = await z.text('word/document.xml'); if (!xml) return null;
    const doc = new DOMParser().parseFromString(xml, 'application/xml'), body = doc.getElementsByTagNameNS(W, 'body')[0]; if (!body) return null;
    const blocks = blocksOf(body), secs = []; let cur = null;
    const formula = [];
    blocks.forEach(b => {
      if (b.kind === 'p' && /^-?\s*FORMULA\s*BANK\s*-?$/i.test(b.plain)) { cur = { formula: true, blocks: formula }; return; }
      const h = sectionHeader(b); if (h) { cur = { ...h, kind: kindOf(h.title), blocks: [] }; secs.push(cur); return; } if (cur) cur.blocks.push(b);
    });
    if (!secs.length) return null;
    const allImgs = blocks.flatMap(b => b.kind === 'p' ? b.imgs : b.rows.flat(2).flatMap(p => p.imgs));
    const IMG = await loadImages(z, await z.text('word/_rels/document.xml.rels'), allImgs);
    const imgHTML = ids => ids.map(id => IMG[id] ? `<img src="${IMG[id]}">` : '').join('');
    const out = [], notes = [];
    for (const s of secs) {
      const before = out.length;
      const dirP = s.blocks.find(b => b.kind === 'p' && b.plain.length > 20 && !b.num && !leadParse([b]) && !/\?\s*(\(.*\))?\s*$/.test(b.plain));
      const dir = dirP ? dirP.plain : '';
      let items = [];
      if (s.kind === 'mtf' || s.kind === 'mc' || s.kind === 'pool') items = rowItems(s, dirP);
      else if (s.kind === 'seq') items = seqItems(s);
      if (!items.length) items = freeItems(s, dirP);
      /* points */
      const pts = allocate(s.pts, items.length, items.map(x => x.pts || 0));
      items.forEach((x, i) => x.pts = pts[i]);
      const sec = { title: s.title.toUpperCase() === s.title ? s.title : s.title, dir, preset: presetOf(s.kind, s.title), pool: '', drawLabel: '' };
      const pool = s.pool || [];
      if (s.kind === 'pool') { sec.pool = pool.join('\n'); sec.drawLabel = s.drawLabel || ''; }
      /* build app questions for the target format */
      const qs = [];
      if (s.kind === 'pool' && fmt === 'gforms' && pool.length) {
        const g = newQ('matching', { head: 'Choose the answer from the word pool.', sopts: pool.slice(0, 26), kids: [] });
        items.forEach(x => { const i = pool.findIndex(w => w.toLowerCase() === String(x.ans || '').toLowerCase()); const k = newQ('match', { stem: x.stem, ans: i > -1 ? LET[i] : '', parent: g.id, pts: x.pts, ansText: x.ans || '' }); g.kids.push(k.id); qs.push(k); });
        qs.unshift(g);
      } else if (s.kind === 'seq') {
        items.forEach(x => {
          const keyed = x.events.every(e => e.key > 0) && new Set(x.events.map(e => e.key)).size === x.events.length;
          if (keyed && fmt !== 'gforms') { const evs = x.events.slice().sort((a, b) => a.key - b.key).map(e => e.text); qs.push(newQ('seq', { head: x.head, events: evs, ppe: Math.round(x.pts / evs.length * 100) / 100 || 1 })); }
          else {
            const n = x.events.length, g = newQ('matching', { head: (x.head ? x.head + ': ' : '') + 'choose the order of this event (1 = earliest).', sopts: Array.from({ length: n }, (_, i) => String(i + 1)), kids: [] });
            const per = allocate(x.pts, n, Array(n).fill(0));
            x.events.forEach((e, i) => { const k = newQ('match', { stem: escH(e.text), ans: e.key > 0 && e.key <= n ? LET[e.key - 1] : '', parent: g.id, pts: per[i] }); g.kids.push(k.id); qs.push(k); });
            qs.splice(qs.length - n, 0, g);
            if (!keyed) notes.push(`“${x.head || s.title}”: no answer numbers were marked, so the order key is empty.`);
          }
        });
      } else {
        items.forEach(x => {
          if (x.table) {
            if (fmt === 'gforms') qs.push(newQ('prob', { stem: (x.stem ? x.stem + '<br>' : '') + [x.table.cols, ...x.table.cells].map(r => r.map(c => escH(c.replace(/\[\[\s*\]\]/g, '_____').replace(/\[\[([\s\S]*?)\]\]/g, '$1'))).join(' | ')).join('<br>'), pts: x.pts, ansText: x.table.cells.flat().flatMap(c => [...c.matchAll(/\[\[([\s\S]*?)\]\]/g)].map(m => m[1].trim())).filter(Boolean).join('; ') }));
            else qs.push(newQ('table', { stem: x.stem, cols: x.table.cols, cells: x.table.cells, pts: x.pts, boxH: 1 }));
            return;
          }
          let type = s.kind === 'mtf' ? 'mtf' : s.kind === 'mc' ? 'mc' : s.kind === 'pool' ? 'ident' : s.kind === 'prob' ? 'prob' : 'essay';
          if (type === 'mc' && !(x.opts || []).length) type = 'ident';
          if (fmt === 'scantron') { if (type === 'mtf') type = 'ident'; if (type === 'essay') type = 'prob'; }
          const o = { stem: x.stem, pts: x.pts };
          if (type === 'mc') Object.assign(o, { opts: x.opts.slice(0, 10), ans: x.ans || '' });
          else Object.assign(o, { ansText: x.ans || '' });
          if (type === 'mtf' && x.under && x.under.length) o.desc = 'Check the underlined part: “' + x.under.join('”, “') + '”.';
          if (type === 'essay') { o.boxH = 1.6; if (/<img/i.test(x.stem) && stripHTML(x.stem)) o.layout = 'side'; }
          if (type === 'prob') o.boxH = 2.4;
          qs.push(newQ(type, o));
        });
      }
      if (qs.length) { qs[0]._sec = sec; out.push(...qs); }
      if (out.length === before) notes.push(`“${s.title}” had no questions Jin could read.`);
    }
    const fImgs = formula.flatMap(b => b.kind === 'p' ? b.imgs : b.rows.flat(2).flatMap(p => p.imgs));
    const fText = formula.flatMap(b => b.kind === 'p' ? [b.plain] : b.rows.flat(2).map(p => p.plain)).filter(Boolean);
    return { qs: out, notes, sections: secs.length, formula: imgHTML(fImgs) + (fText.length ? (fImgs.length ? '<br>' : '') + fText.map(escH).join('<br>') : '') };

    /* items laid out as table rows or numbered paragraphs (true/false, multiple choice, word pool) */
    function rowItems(s, dirP) {
      const items = [];
      s.blocks.forEach(b => {
        if (b.kind === 't') {
          b.rows.forEach(row => {
            const cells = row.filter(c => c.some(p => p.plain || p.imgs.length));
            if (!cells.length) return;
            /* word-pool box: one cell (or row) with many short entries */
            const firstLead = leadParse(cells[0]);
            if (s.kind === 'pool' && !firstLead && !items.length) {
              const words = cells.flatMap(c => c.flatMap(p => p.text.replace(/-\s*WORD POOL\s*-/i, '').split(/\t+|\s{2,}|\n/))).map(w => w.trim()).filter(w => w && w.length < 40);
              if (words.length >= 2) { s.pool = (s.pool || []).concat(words); return; }
            }
            if (!firstLead) return;
            let contentParas = [], extra = '';
            if (firstLead.rest) contentParas = [{ ...cells[0][cells[0].length - 1], runs: restRuns(cells[0], firstLead), text: firstLead.rest, plain: firstLead.rest }];
            const others = cells.slice(1);
            others.forEach(c => { const t = c.map(p => p.plain).join(' ').trim(); if (/^symbol\s*:?$/i.test(t) || /^(draw|sketch)\b.{0,20}:?$/i.test(t)) { s.drawLabel = t.replace(/\s+$/, ''); return; } contentParas.push(...c); });
            pushItem(s, items, firstLead, contentParas);
          });
        } else if (b !== dirP && b.kind === 'p' && b.plain) {
          const ld = leadParse([b]);
          if (ld && ld.rest && /_{2,}/.test(b.text)) pushItem(s, items, ld, [{ ...b, runs: restRuns([b], ld), text: ld.rest, plain: ld.rest }]);
          else if (items.length && s.kind === 'mc' && isChoicePara(b)) { const it = items[items.length - 1]; it._choiceParas.push(b); const c = buildChoices(it._choiceParas); it.opts = c.opts; if (c.ans) it.ans = c.ans; }
        }
      });
      return items;
    }
    function restRuns(paras, ld) {
      /* runs after the "N." marker, cut at the exact character (the number and the text can share one run) */
      const runs = paras.flatMap(p => p.runs), full = runs.map(r => r.t).join('');
      const re = ld.num != null ? new RegExp('^([\\s\\S]*?)' + ld.num + '\\s*[.)]\\s*') : /^([\s\S]*?)\.\s*/;
      const m = full.match(re); if (!m) return runs;
      let cut = m[0].length; const out = [];
      for (const r of runs) { if (cut >= r.t.length) { cut -= r.t.length; continue; } out.push(cut > 0 ? { ...r, t: r.t.slice(cut) } : r); cut = 0; }
      return out;
    }
    function pushItem(s, items, ld, paras) {
      const nonEmpty = paras.filter(p => p.plain || p.imgs.length);
      const ci = nonEmpty.findIndex((p, k) => k > 0 && isChoicePara(p)), stemParas = s.kind === 'mc' && ci > 0 ? nonEmpty.slice(0, ci) : s.kind === 'mc' ? nonEmpty.filter(p => !isChoicePara(p)) : nonEmpty;
      const choiceParas = s.kind === 'mc' ? (ci > 0 ? nonEmpty.slice(ci) : nonEmpty.filter(isChoicePara)) : [];
      const stem = stemParas.map(p => runsHTML(p.runs) + imgHTML(p.imgs)).filter(Boolean).join('<br>');
      const it = { stem, ans: ld.ans, num: ld.num, pts: 0, _choiceParas: choiceParas, under: s.kind === 'mtf' ? stemParas.flatMap(p => uText(p.runs)) : [] };
      if (s.kind === 'mc') { const c = buildChoices(choiceParas); it.opts = c.opts; it.ans = c.ans || (/^[A-J]$/.test(ld.ans) ? ld.ans : ''); }
      if (s.kind === 'pool' || s.kind === 'mtf') { const h = stemParas.length ? '' : ''; it.ans = ld.ans || h; }
      if (stem || (it.opts || []).length) items.push(it);
    }
    /* timeline tables: [number][event] */
    function seqItems(s) {
      const items = []; let head = '', hpts = 0;
      s.blocks.forEach(b => {
        if (b.kind === 'p') { const m = b.plain.match(/^(?:[A-Z][.)]\s*)?(.+?)\s*\(\s*(\d+(?:\.\d+)?)\s*pts?\s*\)\s*$/i); if (m) { head = m[1].trim(); hpts = +m[2]; } return; }
        const rows = b.rows.map(r => r.filter(c => c.some(p => p.plain))).filter(r => r.length >= 2);
        if (!rows.length || !rows.every(r => r[0].map(p => p.plain).join('').length <= 4)) return;
        const events = rows.map(r => ({ key: parseInt(r[0].map(p => p.plain).join('')) || 0, text: r.slice(1).map(c => c.map(p => p.plain).join(' ')).join(' ').trim() })).filter(e => e.text);
        if (events.length >= 2) { const prev = items[items.length - 1]; if (prev && prev.head === head && !hpts) prev.events.push(...events); else items.push({ head, pts: hpts, events }); hpts = 0; }
      });
      return items;
    }
    /* free-form questions: essay, case study, analysis, problem solving, tables */
    function freeItems(s, dirP) {
      const items = []; let ctx = [], ctxImgs = [], cur = null, rangePts = 0, tableTxt = [], topCtx = [], topImgs = [], dataTables = [];
      const close = () => { if (cur) { items.push(cur); cur = null; } };
      const units = [];
      const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻', '−': '⁻', 'ー': '⁻', '–': '⁻', '+': '⁺' }, SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
      const cellText = c => c.map(p => p.runs.map(r => r.sup ? [...r.t].map(ch => SUP[ch] || ch).join('') : r.sub ? [...r.t].map(ch => SUB[ch] || ch).join('') : r.t).join('').replace(/ー(?=\d)/g, '⁻').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' ');
      s.blocks.forEach(b => {
        if (b === dirP) return;
        if (b.kind === 'p') { units.push(b); if (b.plain) topCtx.push(runsHTML(b.runs)); topImgs.push(...b.imgs); return; }
        const rows = b.rows.map(r => r.map(cellText));
        tableTxt.push(rows.map(r => r.join(' | ')).join('\n'));
        if (rows.length >= 2 && rows[0].length >= 2 && rows[0].every(Boolean) && rows.slice(1).every(r => r.length === rows[0].length)) dataTables.push(rows);
        b.rows.forEach(r => r.forEach(c => c.forEach(p => units.push(p))));
      });
      if (/TABLE/i.test(s.title) && dataTables.length === 1) {
        const [cols, ...body] = dataTables[0];
        return [{ table: { cols, cells: body.map(r => r.map(c => c ? c : '[[ ]]')) }, stem: topCtx.filter(t => !/\?\s*$/.test(t)).join('<br>') + imgHTML(topImgs), ans: '', pts: s.pts }];
      }
      units.forEach(p => {
        const t = p.plain;
        if (!t && !p.imgs.length) return;
        if (/^(given\s*(and|&)\s*required|equation|complete solution|solution\s*(and|&)\s*answer|solution)/i.test(t)) { const h = hlText(p.runs); if (h && cur) cur.ans = (cur.ans ? cur.ans + '; ' : '') + h.replace(/^.*?:\s*/, ''); return; }
        if (/^CASE\s*#?\s*\d+/i.test(t) && t.length < 40) { close(); ctx = []; ctxImgs = []; return; }
        const rm = t.match(/^(\d+)\s*-\s*(\d+)\s*[.)]\s*/), qText = stripPts(t.replace(/:\s*$/, '')), hl = hlText(p.runs);
        const plainNoHl = p.runs.filter(r => !r.hl).map(r => r.t).join('').replace(/\s+/g, ' ').trim();
        const isQ = (/\?/.test(plainNoHl) && plainNoHl.length > 12) || (PTS_RE.test(plainNoHl) && plainNoHl.length > 15);
        if (isQ) {
          close();
          const ptsM = plainNoHl.match(PTS_RE); let pts = ptsM ? +ptsM[1] : 0;
          if (!pts && rm) pts = +rm[2] - +rm[1] + 1; if (!pts && rangePts) pts = rangePts; rangePts = 0;
          const qHTML = runsHTML(p.runs.filter(r => !r.hl)).replace(/^\d+\s*-\s*\d+\s*[.)]\s+/, '').replace(/^\d+[.)]\s+/, '');
          const stem = [...ctx, stripPts(qHTML).replace(/:\s*$/, '')].filter(Boolean).join('<br>');
          cur = { stem: imgHTML([...ctxImgs, ...p.imgs]) + stem, ans: hl, pts };
          ctx = []; ctxImgs = []; return;
        }
        if (rm) rangePts = +rm[2] - +rm[1] + 1;
        if (cur && hl && !p.runs.some(r => !r.hl && r.t.trim())) { cur.ans = (cur.ans ? cur.ans + '; ' : '') + hl; return; }
        if (cur && !t && p.imgs.length) { cur.stem = imgHTML(p.imgs) + cur.stem; return; }
        if (t) ctx.push((p.num ? '• ' : '') + runsHTML(p.runs).replace(/^\d+\s*-\s*\d+\s*[.)]\s+/, '').replace(/^(\d+)[.)]\s+/, ''));
        ctxImgs.push(...p.imgs);
      });
      close();
      if (!items.length) {
        const tbl = tableTxt.filter(x => x.replace(/[|\s]/g, '')).map(x => escH(x).replace(/\n/g, '<br>')).join('<br><br>');
        const stem = [topCtx.join('<br>'), tbl].filter(Boolean).join('<br>');
        if (stem || ctxImgs.length) items.push({ stem: imgHTML(ctxImgs) + (stem || escH(s.title)), ans: '', pts: s.pts });
      } else if (ctx.length && items.length) items[items.length - 1].stem += '<br>' + ctx.join('<br>');
      return items;
    }
  }
  return { parse };
})();
