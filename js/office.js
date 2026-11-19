/* Jin Assessment Studio — file formats: zip, xlsx read/write, docx/pdf text extraction, question text parser */
'use strict';
const Office = (() => {
  const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u => { let c = ~0; for (let i = 0; i < u.length; i++) c = CRC_T[(c ^ u[i]) & 255] ^ (c >>> 8); return (~c) >>> 0; };
  const enc = new TextEncoder(), dec = new TextDecoder();
  const concat = arrs => { const n = arrs.reduce((s, a) => s + a.length, 0), o = new Uint8Array(n); let p = 0; arrs.forEach(a => { o.set(a, p); p += a.length; }); return o; };

  /* ---- zip (store) writer ---- */
  function zip(files) {
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const nm = enc.encode(f.name), d = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(d);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, d.length, true);
      lh.setUint32(22, d.length, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), nm, d);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, d.length, true); ch.setUint32(24, d.length, true); ch.setUint16(28, nm.length, true);
      ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), nm); off += 30 + nm.length + d.length;
    }
    const cs = central.reduce((s, a) => s + a.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cs, true); end.setUint32(16, off, true);
    return concat([...parts, ...central, new Uint8Array(end.buffer)]);
  }
  /* ---- zip reader (store + deflate via DecompressionStream) ---- */
  async function inflateRaw(data) { const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')); return new Uint8Array(await new Response(s).arrayBuffer()); }
  async function unzip(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let e = -1; for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('This file is not a valid Office document.');
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const files = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('The document is damaged (bad zip directory).');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
      const name = dec.decode(u.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
      const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
      files[name] = { method, data: u.subarray(start, start + csize) };
    }
    const bytesOf = async name => { const f = files[name]; if (!f) return null; if (f.method === 0) return f.data; if (f.method === 8) return inflateRaw(f.data); throw new Error('Unsupported compression in ' + name); };
    return { files, bytes: bytesOf, text: async name => { const b = await bytesOf(name); return b ? dec.decode(b) : null; } };
  }
  const xmlDoc = s => new DOMParser().parseFromString(s, 'application/xml');
  const xesc = s => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const colName = i => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const colIndex = ref => { const m = /^([A-Z]+)/.exec(ref); let n = 0; for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

  /* ---- xlsx writer ----
     sheets: [{name, rows:[[cell]], widths:[n], merges:['A1:C1'], freeze:'A2'}]
     cell: string | number | null | {v, s}  s: 0 normal 1 bold 2 header 3 wrap 4 center 5 total 6 title */
  function xlsx(sheets) {
    const used = new Set();
    const nm = s => { let b = String(s || 'Sheet').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet', x = b, i = 2; while (used.has(x.toLowerCase())) x = b.slice(0, 28) + ' ' + i++; used.add(x.toLowerCase()); return x; };
    const names = sheets.map(s => nm(s.name));
    const sheetXml = sh => {
      const rows = sh.rows.map((r, ri) => '<row r="' + (ri + 1) + '">' + r.map((c, ci) => {
        if (c === null || c === undefined || c === '') return '';
        const o = typeof c === 'object' ? c : { v: c }, ref = colName(ci) + (ri + 1), s = o.s ? ` s="${o.s}"` : '';
        if (o.v === null || o.v === undefined || o.v === '') return o.s ? `<c r="${ref}"${s}/>` : '';
        if (typeof o.v === 'number' && isFinite(o.v)) return `<c r="${ref}"${s}><v>${o.v}</v></c>`;
        return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xesc(String(o.v).slice(0, 32000))}</t></is></c>`;
      }).join('') + '</row>').join('');
      const cols = sh.widths ? '<cols>' + sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
      const pane = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ${colIndex(sh.freeze) ? `xSplit="${colIndex(sh.freeze)}" ` : ''}ySplit="${parseInt(sh.freeze.replace(/^[A-Z]+/, '')) - 1}" topLeftCell="${sh.freeze}" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>` : '';
      const merges = sh.merges && sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
      const pr = sh.landscape ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : '', ps = sh.landscape ? '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' : '';
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pr}${pane}${cols}<sheetData>${rows}</sheetData>${merges}${ps}</worksheet>`;
    };
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0%"/></numFmts><fonts count="8"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="13"/><color rgb="FF1F4E78"/><name val="Arial"/></font><font><i/><sz val="9"/><color rgb="FF444444"/><name val="Arial"/></font><font><b/><sz val="14"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="12"/><name val="Arial"/></font></fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE9F7"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3CF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF9FB1C6"/></left><right style="thin"><color rgb="FF9FB1C6"/></right><top style="thin"><color rgb="FF9FB1C6"/></top><bottom style="thin"><color rgb="FF9FB1C6"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="18"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="7" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="6" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="1" fillId="6" borderId="1" applyNumberFormat="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xesc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: styles },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }))
    ];
    return zip(files);
  }

  /* ---- xlsx reader -> [{name, rows:[[string]]}] ---- */
  async function readXlsx(bytes) {
    const z = await unzip(bytes);
    const wbx = await z.text('xl/workbook.xml'); if (!wbx) throw new Error('This Excel file has no workbook.');
    const wb = xmlDoc(wbx), rels = xmlDoc(await z.text('xl/_rels/workbook.xml.rels') || '<r/>');
    const relMap = {}; [...rels.getElementsByTagName('Relationship')].forEach(r => relMap[r.getAttribute('Id')] = r.getAttribute('Target'));
    const ssx = await z.text('xl/sharedStrings.xml'); const ss = [];
    if (ssx) [...xmlDoc(ssx).getElementsByTagName('si')].forEach(si => ss.push([...si.getElementsByTagName('t')].map(t => t.textContent).join('')));
    const out = [];
    for (const sh of wb.getElementsByTagName('sheet')) {
      const rid = sh.getAttribute('r:id') || sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      let target = relMap[rid]; if (!target) continue;
      target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
      const sx = await z.text(target); if (!sx) continue;
      const rows = [];
      for (const r of xmlDoc(sx).getElementsByTagName('row')) {
        const ri = (parseInt(r.getAttribute('r')) || rows.length + 1) - 1, row = [];
        for (const c of r.getElementsByTagName('c')) {
          const ref = c.getAttribute('r'), ci = ref ? colIndex(ref) : row.length, t = c.getAttribute('t');
          const v = c.getElementsByTagName('v')[0]; let val = '';
          if (t === 's') val = ss[+(v && v.textContent)] ?? '';
          else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
          else if (t === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
          else val = v ? v.textContent : '';
          row[ci] = val;
        }
        rows[ri] = [...row].map(x => x ?? '');
      }
      out.push({ name: sh.getAttribute('name'), rows: [...rows].map(r => r || []) });
    }
    return out;
  }

  /* ---- docx text (with list numbering reconstructed) ---- */
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const roman = n => { const m = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, r] of m) while (n >= v) { s += r; n -= v; } return s; };
  async function docxText(bytes) {
    const z = await unzip(bytes); const dx = await z.text('word/document.xml');
    if (!dx) throw new Error('This Word file has no document body.');
    const fmt = {};
    const nx = await z.text('word/numbering.xml');
    if (nx) {
      const nd = xmlDoc(nx), abs = {};
      [...nd.getElementsByTagNameNS(W, 'abstractNum')].forEach(a => { const id = a.getAttributeNS(W, 'abstractNumId'); abs[id] = {}; [...a.getElementsByTagNameNS(W, 'lvl')].forEach(l => { const f = l.getElementsByTagNameNS(W, 'numFmt')[0], st = l.getElementsByTagNameNS(W, 'start')[0]; abs[id][l.getAttributeNS(W, 'ilvl')] = { f: f ? f.getAttributeNS(W, 'val') : 'decimal', s: st ? +st.getAttributeNS(W, 'val') : 1 }; }); });
      [...nd.getElementsByTagNameNS(W, 'num')].forEach(n => { const a = n.getElementsByTagNameNS(W, 'abstractNumId')[0]; if (a) fmt[n.getAttributeNS(W, 'numId')] = abs[a.getAttributeNS(W, 'val')] || {}; });
    }
    /* numbering can also come from a paragraph style (e.g. "List Number") */
    const styleNum = {};
    const sx = await z.text('word/styles.xml');
    if (sx) {
      const sd = xmlDoc(sx), raw = {};
      [...sd.getElementsByTagNameNS(W, 'style')].forEach(st => { const id = st.getAttributeNS(W, 'styleId'), np = st.getElementsByTagNameNS(W, 'numPr')[0], bo = st.getElementsByTagNameNS(W, 'basedOn')[0]; raw[id] = { np: np ? { id: (np.getElementsByTagNameNS(W, 'numId')[0] || { getAttributeNS: () => null }).getAttributeNS(W, 'val'), lvl: (np.getElementsByTagNameNS(W, 'ilvl')[0] || { getAttributeNS: () => null }).getAttributeNS(W, 'val') } : null, based: bo ? bo.getAttributeNS(W, 'val') : null }; });
      const resolve = (id, d = 0) => { const r = raw[id]; if (!r || d > 8) return null; if (r.np && r.np.id) return r.np; return r.based ? resolve(r.based, d + 1) : null; };
      Object.keys(raw).forEach(id => { const n = resolve(id); if (n) styleNum[id] = n; });
      /* style-defined lists store their level in the abstract numbering's pStyle link */
      if (nx) { const nd = xmlDoc(nx); [...nd.getElementsByTagNameNS(W, 'abstractNum')].forEach(a => [...a.getElementsByTagNameNS(W, 'lvl')].forEach(l => { const ps = l.getElementsByTagNameNS(W, 'pStyle')[0]; if (ps && styleNum[ps.getAttributeNS(W, 'val')] && styleNum[ps.getAttributeNS(W, 'val')].lvl == null) styleNum[ps.getAttributeNS(W, 'val')].lvl = l.getAttributeNS(W, 'ilvl'); })); }
    }
    const doc = xmlDoc(dx), counters = {}, lines = []; let qList = null, choiceN = 0;
    for (const p of doc.getElementsByTagNameNS(W, 'p')) {
      let t = '';
      const walk = n => { for (const c of n.childNodes) { if (c.nodeType !== 1) continue; const ln = c.localName; if (ln === 't') t += c.textContent; else if (ln === 'tab') t += ' '; else if (ln === 'br' || ln === 'cr') t += '\n'; else if (ln === 'p') continue; else walk(c); } };
      walk(p);
      const np = p.getElementsByTagNameNS(W, 'numPr')[0], ps = p.getElementsByTagNameNS(W, 'pStyle')[0], sn = ps ? styleNum[ps.getAttributeNS(W, 'val')] : null;
      if ((np || sn) && t.trim()) {
        const il = np && np.getElementsByTagNameNS(W, 'ilvl')[0], ni = np && np.getElementsByTagNameNS(W, 'numId')[0];
        const lvl = il ? +il.getAttributeNS(W, 'val') : (sn && sn.lvl != null ? +sn.lvl : 0), id = ni ? ni.getAttributeNS(W, 'val') : (sn ? sn.id : '0');
        if (id !== '0') {
          const c = counters[id] = counters[id] || []; const f = (fmt[id] || {})[lvl] || { f: 'decimal', s: 1 };
          c[lvl] = (c[lvl] === undefined ? f.s - 1 : c[lvl]) + 1; c.length = lvl + 1;
          const n = c[lvl]; let pre = /decimal/i.test(f.f) ? n + '.' : /letter/i.test(f.f) ? (LET[(n - 1) % 26] || 'Z') + '.' : /roman/i.test(f.f) ? roman(n) + '.' : '';
          /* the first top-level numbered list holds the questions; numbered lines from another list or a deeper level are its choices */
          if (qList === null && lvl === 0 && pre) qList = id;
          if (id === qList && lvl === 0) choiceN = 0;
          else if (qList !== null && pre && /decimal/i.test(f.f)) pre = (LET[choiceN++ % 26] || 'Z') + '.';
          else if (qList !== null && pre && /letter/i.test(f.f)) choiceN++;
          if (pre) t = pre + ' ' + t.trim();
        }
      }
      lines.push(t);
    }
    return lines.join('\n');
  }

  /* ---- pdf text (pdf.js, lazy-loaded) ---- */
  let pdfjs = null;
  async function pdfText(bytes) {
    if (!pdfjs) {
      pdfjs = await import(new URL('vendor/pdf.min.mjs', document.baseURI).href);
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.mjs', document.baseURI).href;
    }
    const pdf = await pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise, out = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const c = await (await pdf.getPage(p)).getTextContent(), rows = [];
      c.items.forEach(i => { if (!i.str || !i.str.trim()) return; const y = i.transform[5]; let r = rows.find(r => Math.abs(r.y - y) < 3); if (!r) { r = { y, t: [] }; rows.push(r); } r.t.push([i.transform[4], i.str]); });
      rows.sort((a, b) => b.y - a.y).forEach(r => out.push(r.t.sort((a, b) => a[0] - b[0]).map(x => x[1]).join(' ').replace(/\s{2,}/g, ' ')));
    }
    return out.join('\n');
  }

  /* ---- question text parser ---- */
  const looksCalc = t => /\b(calculate|compute|solve|how much|how many|how far|how long|determine the (value|magnitude|net|total))\b/i.test(t) || /\d+(\.\d+)?\s?(kg|g|m|km|s|n|v|a|w|j|hz|kω|ω|ma|m\/s2?|m\/s²|°c)\b/i.test(t) && /\bwhat is the\b/i.test(t);
  function parseQuestions(text) {
    const L = text.split('\n').map(s => s.replace(/ /g, ' ').trim()).filter(s => s && !/^page \d+( of \d+)?$/i.test(s) && !/END OF (EXAMINATION|PART|TEST)|REVIEW YOUR ANSWERS|PROCEED TO THE/i.test(s));
    const out = [], pgs = [], RG = /(\d+)\s*(?:[-–]|to|and)\s*(\d+)/;
    let q = null, last = 0, pg = null, tgt = null, inKey = false;
    const fin = () => {
      if (!q) return;
      let m = q.stemT.match(/^\s*(.*?)\bX\s*[:.]\s*(.*?)\s*\bY\s*[:.]\s*(.*)$/);
      if (!q.x && m && m[2] && m[3]) { q.x = m[2].trim(); q.y = m[3].trim(); q.stemT = m[1].trim(); }
      if (!q.x && q.y && (m = q.stemT.match(/^\s*(.*?)\bX\s*[:.]\s*(.+)$/))) { q.x = m[2].trim(); q.stemT = m[1].trim(); }
      const st = q.stemT.trim();
      if (q.x && q.y) { q.type = 'morse'; q.opts = []; }
      else if (q.statements.length >= 2 && q.opts.length) q.type = 'cmc';
      else if (q.opts.length) q.type = 'mc';
      else if (q.psopts && q.psopts.length) q.type = 'match';
      else q.type = looksCalc(st) || q.pts > 1 ? 'prob' : 'ident';
      if (q.type === 'mc' && q.ansT && /^[A-E]$/i.test(q.ansT)) q.ans = q.ansT.toUpperCase();
      if ((q.type === 'ident' || q.type === 'prob') && q.ansT) q.ansText = q.ansT;
      q.stem = esc(st); delete q.stemT; delete q.ansT; out.push(q); q = null;
    };
    const startQ = (n, n2, rest) => {
      fin(); last = n2 || n;
      const ip = pg && pg.r && n >= pg.r[0] && n <= pg.r[1];
      q = { n, stemT: rest, opts: [], statements: [], ans: '', ansText: '', ansT: '', pts: n2 ? n2 - n + 1 : 1, passage: ip ? pg.t : '', psopts: ip ? pg.s.slice() : [], x: '', y: '', xt: true, yt: false };
      tgt = 'stem';
    };
    for (let l of L) {
      let m;
      if (/^(answer key|answers|key to correction)\s*:?$/i.test(l)) { fin(); inKey = true; continue; }
      if ((m = l.match(/^(?:answer key|answers|key to correction|key)\s*[:\-]\s*(.+)$/i)) && /^(\d{1,3}\s*[.)\-:]?\s*[A-Ea-e]\b[\s,;]*)+$/.test(m[1])) { fin(); inKey = true; for (const k of m[1].matchAll(/(\d{1,3})\s*[.)\-:]?\s*([A-Ea-e])\b/g)) { const t = out.find(x => x.n == k[1]); if (t && !t.ans) t.ans = k[2].toUpperCase(); } continue; }
      if (/^(for|refer to the following for) items?( numbers?)?\b/i.test(l)) { fin(); inKey = false; const r = l.match(RG); pg = { t: l, r: r ? [+r[1], +r[2]] : null, s: [] }; pgs.push(pg); tgt = 'pass'; continue; }
      /* "1. A  2. B  3. C" answer keys */
      if (/^(\d{1,3}\s*[.)\-:]?\s*[A-Ea-e]\b[\s,;]*){2,}$/.test(l)) { fin(); for (const k of l.matchAll(/(\d{1,3})\s*[.)\-:]?\s*([A-Ea-e])\b/g)) { const t = out.find(x => x.n == k[1]); if (t && !t.ans) t.ans = k[2].toUpperCase(); } continue; }
      if (m = l.match(/^(\d{1,3})\s*[.)\-:]?\s*([A-Ea-e])$/)) { const t = out.find(x => x.n == m[1]) || (q && q.n == m[1] && q); if (t && (inKey || +m[1] <= last)) { t.ans = m[2].toUpperCase(); continue; } }
      if (m = l.match(/^(?:ans(?:wer)?|correct answer|key)\s*[:.\-]\s*(.+)$/i)) { if (q) { q.ansT = m[1].trim().replace(/^\(?([A-Ea-e])\)?[.)]?$/, '$1'); continue; } }
      if (inKey) continue;
      if (m = l.match(/^(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*[.)]\s*(?!\d)(.*)/)) { const n = +m[1]; if (n > last || (!q && !out.length)) { startQ(n, m[2] ? +m[2] : 0, m[3]); continue; } }
      if (q && (m = l.match(/^X\s*[:.]\s*(.+)/))) { q.x = m[1]; tgt = 'x'; continue; }
      if (q && (m = l.match(/^Y\s*[:.]\s*(.+)/))) { q.y = m[1]; tgt = 'y'; continue; }
      if (q && !q.opts.length && (m = l.match(/^(I{1,3}|IV|V|VI)[.)]\s*(?=[A-Z])(.+)/))) { q.statements.push(m[2]); tgt = 'stmt'; continue; }
      /* options, possibly several on one line: "A. foo   B. bar" */
      const optM = l.match(/^\(?([A-Ea-e])[.)]\s*(.*)/);
      if (optM) {
        const pieces = l.split(/\s+(?=\(?[B-Eb-e][.)]\s)/), arr = [];
        pieces.forEach(pc => { const mm = pc.match(/^\(?([A-Ea-e])[.)]\s*(.*)/); if (mm) arr.push([mm[1].toUpperCase(), mm[2]]); });
        const seq = (list) => arr.every(([k], i) => 'ABCDE'.indexOf(k) === list.length + i);
        if (pg && (tgt === 'pass' || tgt === 'ps') && seq(pg.s)) { arr.forEach(([, t]) => pg.s.push(t)); tgt = 'ps'; continue; }
        if (q && seq(q.opts)) { arr.forEach(([, t]) => q.opts.push(t)); tgt = 'opt'; continue; }
      }
      if (tgt === 'ps') pg.s[pg.s.length - 1] += ' ' + l;
      else if (tgt === 'pass') pg.t += ' ' + l;
      else if (q) { if (tgt === 'opt') q.opts[q.opts.length - 1] += ' ' + l; else if (tgt === 'stmt') q.statements[q.statements.length - 1] += ' ' + l; else if (tgt === 'x') q.x += ' ' + l; else if (tgt === 'y') q.y += ' ' + l; else q.stemT += ' ' + l; }
    }
    fin();
    /* passages whose items carried no text of their own (answer-only items) */
    pgs.forEach(g => { if (g.r && !out.some(x => x.n >= g.r[0] && x.n <= g.r[1] && x.passage === g.t)) for (let n = g.r[0]; n <= g.r[1] && n - g.r[0] < 20; n++) out.push({ n, type: 'match', stem: '', opts: [], statements: [], ans: '', ansText: '', pts: 1, passage: g.t, psopts: g.s.slice(), x: '', y: '' }); });
    out.forEach(o => { if (o.type === 'morse') o.ans = 'A'; });
    return out;
  }

  /* ---- generic file reader for imports ---- */
  async function readQuestionFile(name, bytes) {
    const n = name.toLowerCase();
    if (n.endsWith('.pdf')) return { kind: 'text', text: await pdfText(bytes) };
    if (n.endsWith('.docx')) return { kind: 'text', text: await docxText(bytes) };
    if (n.endsWith('.xlsx')) return { kind: 'sheets', sheets: await readXlsx(bytes) };
    if (n.endsWith('.txt')) return { kind: 'text', text: new TextDecoder().decode(bytes) };
    if (n.endsWith('.doc') || n.endsWith('.xls')) throw new Error('Old Office formats (.doc/.xls) are not supported. Save the file as .docx or .xlsx first.');
    throw new Error('Use a .pdf, .docx, .xlsx or .txt file.');
  }
  return { zip, unzip, xlsx, readXlsx, docxText, pdfText, parseQuestions, readQuestionFile, colName, crc32 };
})();
