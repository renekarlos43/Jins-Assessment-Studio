/* Jin Assessment Studio — Bloom classification, competency matching, competency comparison (all local) */
'use strict';
const Classify = (() => {
  /* Bloom classifier — ORIGINAL Bloom's Taxonomy (1956):
     0 Knowledge, 1 Comprehension, 2 Application, 3 Analysis, 4 Synthesis, 5 Evaluation.
     It scores the cognitive process a question demands (what the student must DO with the
     information), not command verbs alone. Verbs carry small weights; structure carries most. */
  const CONF = { High: 'ok', Medium: 'med', Low: 'low' };
  const OPS = ['Recall a fact, term, definition or formula',
    'Explain, interpret, summarize or classify an idea',
    'Use a principle, formula or procedure in a new situation',
    'Examine relationships, patterns, causes, sequences or errors in given information',
    'Combine information into a hypothesis, model, plan or organized solution',
    'Make and defend a judgment using evidence or criteria'];
  const clean = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const words = t => (t.match(/[A-Za-z0-9’']+/g) || []).length;
  const SCEN = /\b(a|an|the) (student|students|geologist|geologists|scientist|scientists|archaeologist|researcher|researchers|teacher|farmer|engineer|paleontologist|paleontologists|doctor|chemist|biologist|astronomer|technician|class|group of students)\b|\bduring (a|an)\b|\bsuppose\b|\bimagine\b|\bin an experiment\b|\b(discovers?|discovered|observes?|observed|examines?|examined|measured|collected|tested)\b/i;
  const NUMUNIT = /\d+(\.\d+)?\s?(%|percent|kg|g|mg|m|km|cm|mm|s|min|minutes|hours?|years?|billion|million|n|v|a|w|j|hz|ω|ohms?|m\/s2?|m\/s²|°c|k|mol|l|ml)\b/i;
  function bloomInfo(q) {
    const stem = clean(q.stem), lo = stem.toLowerCase(), type = q.type, inPassage = !!q.inPassage;
    const opts = (q.opts || []).map(clean).filter(Boolean), stmts = (q.statements || []).map(clean).filter(Boolean);
    const full = [stem, ...stmts, clean(q.x), clean(q.y)].join(' '), flo = full.toLowerCase();
    const sc = [0, 0, 0, 0, 0, 0], ev = [[], [], [], [], [], []];
    const quote = re => { const m = full.match(re); if (!m) return ''; const i = m.index, s0 = Math.max(0, i - 12), e0 = Math.min(full.length, i + m[0].length + 18); return '“' + (s0 ? '…' : '') + full.slice(s0, e0).trim() + (e0 < full.length ? '…' : '') + '”'; };
    const add = (l, w, why, re) => { sc[l] += w; ev[l].push({ w, why, q: re ? quote(re) : '' }); };
    const has = re => re.test(flo);
    const scenario = SCEN.test(full) || (inPassage && words(clean(q.passage)) > 15);
    const dataGiven = scenario || inPassage || q.hasImage || words(stem) > 28;
    const nWords = words(full), optAvg = opts.length ? opts.reduce((n, o) => n + words(o), 0) / opts.length : 0;
    /* ---- item-format evidence ---- */
    if (type === 'prob') {
      if (has(/\b(design|propose|construct|develop|formulate|plan|devise|create)\b/)) add(4, 6, 'problem asks for an original design, model or plan', /\b(design|propose|construct|develop|formulate|plan|devise|create)\b[^.?]{0,40}/i);
      else add(2, 6, 'problem-solving item: apply formulas or procedures to the given values');
      if (has(/\b(sequence|order|interpret|explain the (relationship|order)|analy[sz]e)\b/)) add(3, 3, 'the problem also asks to interpret relationships in given information', /\b(sequence|order|interpret|analy[sz]e)\b[^.?]{0,40}/i);
    }
    if (type === 'morse') add(3, 4, 'judge the truth of two related statements (X and Y) and compare them');
    if (type === 'cmc') add(3, 4, 'decide which combination of several statements is correct');
    /* ---- Knowledge: recall ---- */
    if (has(/^(it|this|these|they) (is|are|refers?)\b|\b(is|are) (called|known as|termed|referred to as)\b|\brefers? to (the|a|an)\b|\bterm (for|used|that|which)\b/)) add(0, 5, 'a definition is given and the answer is the term', /^(it|this|these|they) (is|are|refers?)\b[^.?]{0,40}|\b(is|are) (called|known as|termed|referred to as)\b/i);
    if (has(/\bwhat (is|are|was|were) the (name|term|unit|si unit|symbol|formula|definition)\b|\b(si unit|unit of measure)\b/)) add(0, 5, 'asks for a name, unit, symbol or formula', /\bwhat (is|are|was|were) the (name|term|unit|si unit|symbol|formula|definition)\b|\bsi unit\b/i);
    if (has(/\b(who|whom)\b|\bwhen (did|was|were)\b|\bin what year\b|\bwhich (scientist|year)\b/)) add(0, 3, 'asks who or when (a recalled fact)', /\b(who|whom|when (did|was|were)|in what year)\b[^.?]{0,30}/i);
    if (has(/\bwhich [\w\s-]{0,40}\b(is|are|was|were) (associated with|characterized by|used to describe|known for|called|responsible for)\b/)) add(0, 4, 'recall the term that matches a described characteristic', /\bwhich [\w\s-]{0,40}\b(is|are|was|were) (associated with|characterized by|used to describe|known for|called|responsible for)\b/i);
    if (opts.length >= 3 && opts.every(o => words(o) <= 3) && !scenario && !NUMUNIT.test(full)) add(0, 2, 'the choices are single terms to recognize');
    if (type === 'ident') add(0, 3, 'identification: the expected answer is a recalled term');
    if (type === 'match') add(0, 3, 'matching: pair a term with its recalled fact');
    if (has(/\b(define|list|enumerate|recall|name the|state the)\b/)) add(0, 1, 'recall verb (weak evidence on its own)', /\b(define|list|enumerate|recall|name the|state the)\b/i);
    /* ---- Comprehension: explain / interpret ---- */
    if (has(/\bhow (does|do|did|can|is|are|might)\b/)) add(1, 3, 'asks how a known process works', /\bhow (does|do|did|can|is|are|might)\b[^.?]{0,40}/i);
    if (has(/\bwhy (does|do|did|is|are|might|would|was|were|could)\b|^why\b/)) add(1, 3, 'asks for the reason behind a known idea', /\bwhy\b[^.?]{0,40}/i);
    if (has(/\b(explain|describe|summari[sz]e|interpret|paraphrase|illustrate|in your own words|best describes?|meaning of|main idea|purpose of|role of|function of)\b/)) add(1, 3, 'asks to explain, describe or interpret', /\b(explain|describe|summari[sz]e|interpret|paraphrase|illustrate|best describes?|meaning of|main idea|purpose of|role of|function of)\b[^.?]{0,30}/i);
    if (has(/\bwhat (does|do|did) [^?]{0,60}\b(indicate|show|mean|represent|tell)\b/)) add(1, 3, 'asks what a piece of information means', /\bwhat (does|do|did) [^?]{0,60}\b(indicate|show|mean|represent|tell)\b/i);
    if (has(/\bhow (did|does|do) [^?]{0,50}\bchange\b/)) add(1, 2, 'asks to describe how something changed', /\bhow (did|does|do) [^?]{0,50}\bchange\b/i);
    if (optAvg >= 6 && has(/\b(how|why)\b/)) add(1, 2, 'the choices are explanations to recognize');
    if (has(/\b(classify|classified|example of|is an example)\b/) && !scenario) add(1, 2, 'classify an idea into a known category', /\b(classify|classified|example of)\b[^.?]{0,30}/i);
    /* ---- Application: use in a new situation ---- */
    const asksValue = /\bhow (old|much|many|long|far|fast)\b|\bwhat (percentage|percent|fraction|portion|amount)\b|\bwhat is the (value|age|mass|speed|velocity|force|current|voltage|resistance|half-life|energy|power|density|acceleration)\b|\b(calculate|compute|determine the (value|age|amount))\b/i;
    if (NUMUNIT.test(full) && asksValue.test(full)) add(2, 6, 'compute a value from the given data', asksValue);
    if (scenario && has(/\bwhich [\w\s-]{0,40}\b(would|should|could) (be )?(the )?(most )?(appropriate|suitable|useful|best|used|effective)\b|\bmost (appropriate|suitable)\b/)) add(2, 5, 'choose a principle or method for a new situation', /\bwhich [\w\s-]{0,40}\b(would|should|could) (be )?(the )?(most )?(appropriate|suitable|useful|best|used|effective)\b|\bmost (appropriate|suitable)\b/i);
    if (has(/\bwhat (would|will) (most likely )?(happen|occur|result)\b|\bpredict\b|\bwould (most likely )?(improve|increase|decrease|help|affect)\b/)) add(2, scenario ? 5 : 4, 'predict an outcome by applying a known principle', /\bwhat (would|will) (most likely )?(happen|occur|result)\b|\bpredict\b|\bwould (most likely )?(improve|increase|decrease|help|affect)\b/i);
    if (has(/\b(belong to|be classified as|most likely (be )?(related|belong)|which group of organisms)\b/)) { if (scenario) add(2, 4, 'apply classification criteria to a new specimen or case', /\b(belong to|be classified as|most likely (be )?(related|belong)|which group of organisms)\b/i); else add(1, 2, 'classify using known criteria'); }
    if (scenario && has(/\bwhich (type|kind|group|process|method|principle|isotope|technique|organism|eon|era|period) [^?]{0,70}\b(most likely|would|could)\b/)) add(2, 4, 'apply a concept to identify what fits a new case', /\bwhich (type|kind|group|process|method|principle|isotope|technique|organism|eon|era|period) [^?]{0,70}\b(most likely|would|could)\b/i);
    if (scenario && has(/\b(use|used|apply|applied) to determine\b|\bcan the \w+ use\b|\bduring which [\w\s]{0,20}(era|period|eon|epoch)\b/)) add(2, 3, 'use a known principle to answer a question about a new case', /\b(use|used|apply|applied) to determine\b|\bcan the \w+ use\b|\bduring which [\w\s]{0,20}(era|period|eon|epoch)\b/i);
    /* ---- Analysis: relationships, patterns, sequences, causes, errors ---- */
    const seq = /\b(oldest to (youngest|most recent)|youngest to oldest|correctly orders?|correct (order|sequence)|arrange[sd]?|chronological|sequence of events)\b/i;
    if (seq.test(full)) { if (dataGiven && nWords > 20) add(3, 5, 'order events by relating clues in the given information', seq); else { add(3, 2, 'put items in order', seq); add(0, 2, 'the order may simply be recalled'); } }
    if (has(/\bbased on (the )?(diagram|graph|table|data|figure|illustration|passage|situation|fossil|fossils|evidence|results|information|observations?)\b|\b(shown|illustrated|presented) (in|above|below)\b/)) add(3, 3, 'interpret relationships in the provided information', /\bbased on (the )?(diagram|graph|table|data|figure|illustration|passage|situation|fossil|fossils|evidence|results|information|observations?)\b|\b(shown|illustrated|presented) (in|above|below)\b/i);
    if (has(/\b(infer|inferred|inference|conclude|deduce|implies)\b|\bwhat can (they|we|you|scientists|the \w+) (infer|conclude|say)\b|\bwhich conclusion\b/)) add(3, 4, 'draw an inference or conclusion from evidence', /\b(infer|inferred|inference|conclude|deduce|implies|which conclusion)\b[^.?]{0,30}/i);
    if (has(/\b(relationship|pattern|trend|assumption|error|mistake|flaw)\b|\b(caused|causes|effect of|consequences?)\b|\b(differences?|distinguish|compare|contrast)\b/)) add(3, 3, 'examine a relationship, pattern, cause or error', /\b(relationship|pattern|trend|assumption|error|mistake|flaw|caused|causes|effect of|consequences?|differences?|distinguish|compare|contrast)\b[^.?]{0,30}/i);
    const explObs = /\bwhich (explanation|statement|conclusion) (best )?(explains|describes|accounts for)\b/i;
    if (explObs.test(full)) { add(3, dataGiven ? 5 : 3, 'pick the explanation that accounts for the observed evidence', explObs); if (dataGiven) { const i = ev[1].findIndex(e => /explain, describe or interpret/.test(e.why)); if (i > -1) { sc[1] -= ev[1][i].w; ev[1].splice(i, 1); } } }
    if (has(/\bsupports? (the|this) (idea|hypothesis|claim|conclusion)\b|\bbest supports?\b/)) add(3, 2, 'relate pieces of evidence to an idea');
    if (/\b(NOT|EXCEPT)\b/.test(full)) add(3, 1, 'must check every choice against the idea (NOT/EXCEPT)');
    if (inPassage) add(3, 1, 'answer depends on the shared passage or data');
    /* ---- Synthesis: combine into something new ---- */
    if (has(/\b(hypothes[ie]s|formulate|propose|devise|design|construct (a|an)|develop (a|an)|create (a|an)|build a model|model of|plan (a|an|for)|organi[sz]e (a|an|the) (solution|plan))\b/) && !has(/\bsupports? (this|the) hypothesis\b/)) add(4, 5, 'produce a hypothesis, model, plan or organized solution', /\b(hypothes[ie]s|formulate|propose|devise|design|construct (a|an)|develop (a|an)|create (a|an)|build a model|model of|plan (a|an|for))\b[^.?]{0,30}/i);
    if (has(/\b(combines?|combining|integrat\w*|synthesi[sz]\w*|reconstructs?|piece together|puts? together)\b/)) add(4, 5, 'combine several pieces of evidence into one explanation', /\b(combines?|combining|integrat\w*|synthesi[sz]\w*|reconstructs?|piece together|puts? together)\b[^.?]{0,30}/i);
    /* ---- Evaluation: judge and defend with evidence ---- */
    if (has(/\b(claim|claims|argument|assertion)\b/)) add(5, has(/\b(evaluat\w*|correct|incorrect|valid|accurate)\b/) ? 6 : 4, 'judge a claim against evidence', /\b(claim|claims|argument|assertion)\b[^.?]{0,30}/i);
    if (has(/\b(best supports?|strongest (evidence|support)|which (finding|evidence|observation|data) (would )?(best |most )?supports?|supports? (the|this) (hypothesis|claim|idea|conclusion))\b/)) add(5, 4, 'decide which evidence best supports an idea', /\b(best supports?|strongest (evidence|support)|which (finding|evidence|observation|data) (would )?(best |most )?supports?|supports? (the|this) (hypothesis|claim|idea|conclusion))\b/i);
    if (has(/\b(evaluate|evaluates|justify|defend|critique|appraise|judge)\b/)) add(5, has(/\b(evidence|criteria|standard|claim)\b/) ? 4 : 2, 'judging verb' + (has(/\b(evidence|criteria|standard|claim)\b/) ? ' with evidence or criteria' : ' (weak evidence on its own)'), /\b(evaluate|evaluates|justify|defend|critique|appraise|judge)\b[^.?]{0,30}/i);
    if (opts.some(o => /^the (claim|statement|conclusion|hypothesis) is (correct|incorrect|valid|invalid)/i.test(o))) add(5, 3, 'the choices are judgments with reasons');
    if (has(/\bmost (valid|reliable|convincing)\b|\bwhich is better\b/)) add(5, 3, 'compare options against a standard', /\bmost (valid|reliable|convincing)\b|\bwhich is better\b/i);
    /* ---- decide the dominant process ---- */
    const notes = [];
    let order = sc.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0] || x[1] - y[1]);
    let l, top = order[0][0], second = order[1][0], alt = order[1][0] > 0 ? order[1][1] : -1;
    if (top < 2) { l = type === 'ident' || type === 'match' ? 0 : 1; alt = -1; notes.push('No clear cognitive cue was found, so this is a provisional classification.'); }
    else {
      l = order[0][1];
      /* ties: prefer the higher level only when it has a strong cue (5+) */
      if (top === second) { const hi = Math.max(order[0][1], order[1][1]), lowL = Math.min(order[0][1], order[1][1]); const strong = ev[hi].some(e => e.w >= 5); l = strong ? hi : lowL; alt = l === hi ? lowL : hi; }
    }
    /* school rule: passage-based items are never Knowledge */
    if (inPassage && l === 0) { l = sc[3] >= sc[1] && sc[3] > 0 ? 3 : 1; notes.push('Passage-based items start at Comprehension.'); }
    if (scenario && l <= 1 && top > 0) notes.push('The scenario is context only; answering still requires ' + (l === 0 ? 'recall' : 'explaining a known idea') + '.');
    if (nWords > 45 && l <= 1) notes.push('Long or technical wording affects difficulty, not cognitive level.');
    const lead = ev[l].sort((x, y) => y.w - x.w);
    const margin = sc[l] - Math.max(...sc.filter((_, i) => i !== l));
    let conf = top < 2 ? 'Low' : sc[l] >= 5 && margin >= 3 ? 'High' : (margin >= 1.5 || sc[l] >= 6) ? 'Medium' : 'Low';
    const provisional = conf === 'Low';
    let why = BL[l] + ' — ' + (lead.length ? lead.map(e => e.why).slice(0, 3).join('; ') : 'no strong cue') + '.';
    if (alt >= 0 && alt !== l && sc[alt] > 0 && (provisional || margin < 3)) why += ' ' + (provisional ? 'Ambiguous: ' : 'Also possible: ') + BL[alt] + ' (' + ev[alt].sort((x, y) => y.w - x.w)[0].why + ').';
    if (notes.length) why += ' ' + notes.join(' ');
    return { l, op: OPS[l], why, evidence: lead.map(e => e.q).filter(Boolean).slice(0, 3), conf, alt: alt !== l ? alt : -1, provisional, scores: sc };
  }
  function textOf(q) {
    const parts = [stripHTML(q.stem)];
    if (q.type === 'morse') parts.push(q.x || '', q.y || '');
    if (q.type === 'cmc') parts.push((q.statements || []).join(' '));
    if (q.type === 'seq') parts.unshift(q.head || '', 'Arrange the events in chronological order:', (q.events || []).join('; '));
    if (q.type === 'table') parts.push('Complete the table: ' + (q.cols || []).join(', '));
    if (q.type === 'crossword') parts.push('Crossword clues: ' + (q.words || []).map(x => x.c).join('; '));
    return parts.join(' ').replace(/\s+/g, ' ').trim();
  }
  function infoFor(q) {
    const p = parentOf(q);
    return bloomInfo({ stem: ['seq', 'table', 'crossword'].includes(q.type) ? esc(textOf(q)) : q.stem, type: q.type, opts: q.type === 'match' && p ? p.sopts : q.opts, statements: q.statements, x: q.x, y: q.y, inPassage: !!(p && p.type === 'passage'), passage: p ? p.stem : '', hasImage: /<img/i.test(q.stem || '') || (p && /<img/i.test(p.stem || '')), pts: q.pts });
  }
  /* apply automatic Bloom unless the teacher set it manually */
  function autoBloom(q, force) {
    if (!isLeaf(q) || (q.bloomManual && !force)) return;
    const r = infoFor(q);
    q.bloom = r.l; q.bloomWhy = r.why; q.bloomConf = r.conf; q.bloomOp = r.op; q.bloomEvidence = r.evidence; q.bloomAlt = r.alt;
    if (force) q.bloomManual = false;
  }
  /* ---------- competency matcher: BM25 over stemmed words + topic words + order continuity ---------- */
  const STOP = new Set('a an the of in on at to for from by with and or as is are was were be been being it its this that these those which what who whom whose when where why how do does did can could will would should may might must than then there their them they he she his her we you your our if so such into onto over under between among about above below after before during while both each either neither other another any all some more most less least same following given possible best correct true false statement statements answer choose letter option options shown refer item items number numbers one two three four students student learners learner able will'.split(' '));
  const SUF = ['ations', 'ation', 'ments', 'ment', 'ities', 'ity', 'ings', 'ing', 'ions', 'ion', 'ally', 'ies', 'ied', 'ed', 'es', 'al', 'ly', 's'];
  const stm = w => { for (const s of SUF) if (w.length > s.length + 3 && w.endsWith(s)) { w = w.slice(0, -s.length); break; } return w.slice(0, 7); };
  const toks = (t, bi) => { const u = (String(t).toLowerCase().replace(/<[^>]+>/g, ' ').match(/[a-z]{3,}/g) || []).filter(w => !STOP.has(w)).map(stm); if (!bi) return u; const r = u.slice(); for (let i = 0; i < u.length - 1; i++) r.push(u[i] + '_' + u[i + 1]); return r; };
  function matchComps(qs, comps, opt) {
    const P = Object.assign({ kb: 1.2, b: .55, topicW: .6, back: 1.6, minScore: .8, inTopicSeq: .1, bigram: true }, opt || {});
    if (!comps.length) return qs.map(() => ({ idx: -1, score: 0, conf: 0 }));
    const docs = comps.map(c => { const t = toks(c.text, P.bigram), tt = toks(c.topic || ''), m = new Map; t.forEach(w => m.set(w, (m.get(w) || 0) + 1)); tt.forEach(w => m.set(w, (m.get(w) || 0) + P.topicW)); return { m, len: t.length + tt.length * P.topicW }; });
    const N = docs.length, df = new Map; docs.forEach(d => d.m.forEach((v, w) => df.set(w, (df.get(w) || 0) + 1)));
    const idf = w => Math.log(1 + (N - (df.get(w) || 0) + .5) / ((df.get(w) || 0) + .5));
    const avg = docs.reduce((s, d) => s + d.len, 0) / N || 1, tn = [...new Set(comps.map(c => c.topic || ''))], ti = comps.map(c => tn.indexOf(c.topic || ''));
    const SC = qs.map(q => {
      const qm = new Map, add = (arr, w) => arr.forEach(x => qm.set(x, (qm.get(x) || 0) + w));
      add(toks(q.stem, P.bigram), 2); add(toks(q.opts, P.bigram), .7); add(toks(q.passage || ''), .9);
      return docs.map(d => { let s = 0; qm.forEach((qw, w) => { const f = d.m.get(w); if (f) s += idf(w) * Math.min(qw, 3) * ((P.kb + 1) * f) / (f + P.kb * (1 - P.b + P.b * d.len / avg)); }); return s; });
    });
    const T = tn.length, topic = new Array(qs.length).fill(-1);
    if (T > 1 && P.back > 0) {
      let a = 0;
      while (a < qs.length) {
        let b = a; while (b + 1 < qs.length && qs[b + 1].type === qs[a].type) b++;
        const cost = (k, t) => { const mx = Math.max(...SC[k].filter((s, i) => ti[i] === t), 0), sum = SC[k].reduce((x, y) => x + y, 0) + 1e-6; return -Math.log((mx + .02) / (sum + .02 * T)); };
        const dp = [], bp = [];
        for (let k = a; k <= b; k++) { const row = [], br = []; for (let t = 0; t < T; t++) { let best = 1e9, arg = 0; if (k === a) best = 0; else for (let u = 0; u < T; u++) { const c = dp[k - a - 1][u] + (t < u ? P.back : 0); if (c < best) { best = c; arg = u; } } row.push(best + cost(k, t)); br.push(arg); } dp.push(row); bp.push(br); }
        let t = dp[b - a].indexOf(Math.min(...dp[b - a])); for (let k = b; k >= a; k--) { topic[k] = t; t = bp[k - a][t]; } a = b + 1;
      }
    }
    let prev = -1;
    return qs.map((q, k) => {
      let sc = SC[k].slice(); if (topic[k] >= 0) sc = sc.map((s, i) => ti[i] === topic[k] ? s : -1);
      const mx = Math.max(...SC[k]);
      if (prev >= 0 && P.inTopicSeq) sc = sc.map((s, i) => s < 0 ? s : (i >= prev && i <= prev + 1 ? s + P.inTopicSeq * mx : (i < prev ? s - P.inTopicSeq * mx * .5 : s)));
      let b = 0; sc.forEach((s, i) => { if (s > sc[b]) b = i; });
      const sorted = [...sc].sort((x, y) => y - x), ok = mx >= P.minScore; if (ok) prev = b;
      return { idx: ok ? b : -1, score: mx, conf: ok ? (sorted[0] - (sorted[1] > 0 ? sorted[1] : 0)) / (sorted[0] || 1) : 0 };
    });
  }
  const qDoc = q => { const p = parentOf(q); return { type: q.type, stem: textOf(q), opts: (q.opts || []).join(' '), passage: p ? stripHTML(p.stem) + ' ' + (p.sopts || []).join(' ') : '' }; };
  /* suggest competencies for questions. mode 'unassigned' (default) or 'all' (re-detect, keeps manual ones) */
  function suggestComps(list, mode = 'unassigned') {
    const comps = allComps(); if (!comps.length) return { n: 0, low: 0, left: 0, none: true };
    const r = matchComps(list.map(qDoc), comps);
    let n = 0, low = 0, left = 0;
    list.forEach((q, i) => {
      if (q.compConf === 'manual' || (mode === 'unassigned' && q.comp)) return;
      const m = r[i];
      if (m.idx < 0) { if (mode === 'all') { q.comp = ''; q.compConf = ''; } left++; return; }
      const c = comps[m.idx]; q.comp = c.id;
      q.compConf = m.conf >= .35 && m.score >= 2 ? 'high' : m.conf >= .15 ? 'medium' : 'low';
      q.compWhy = 'Word match score ' + m.score.toFixed(1) + (m.conf < .15 ? '; another competency scored almost as high' : '');
      if (q.compConf === 'low') low++; n++;
    });
    return { n, low, left };
  }

  /* ---------- competency comparison (Jin) ---------- */
  const DOMAINS = {
    'electricity & magnetism': /electric|ohm|voltage|current|resist|circuit|watt|magnet|induct|coil|charge|electro|generator|motor/,
    'forces & motion': /force|motion|velocity|speed|accelerat|inertia|momentum|newton|friction|projectile|kinematic|impulse|collision/,
    'energy & work': /energy|work|power|heat|thermal|temperature|kinetic|potential|conservation of energy|efficien/,
    'waves, light & sound': /wave|light|sound|reflect|refract|lens|mirror|frequency|wavelength|spectrum|electromagnetic|optic|image/,
    'life science': /cell|organism|ecosystem|genetic|gene|dna|heredity|biolog|living|organ|tissue|photosynth|respirat|evolution|species|reproduct|nervous|endocrine|immune|homeostasis/,
    'chemistry & matter': /matter|atom|molecule|reaction|chemical|element|compound|mixture|bond|periodic|acid|base|solution|mole|stoichiom|organic|carbon/,
    'earth & space': /earth|weather|climate|geolog|planet|space|volcano|earthquake|plate|tectonic|rock|fault|star|galax|universe|solar|moon|atmospher|typhoon|ocean/,
    'measurement & data': /measure|unit|graph|data|significant figure|scientific notation|uncertain|accuracy|precision/,
    'mathematics': /equation|function|algebra|geometry|triangle|probabil|statistic|fraction|ratio|polynomial|integer|angle/,
    'language & literature': /text|story|poem|author|grammar|sentence|paragraph|essay|literary|figurative|narrative|argument/
  };
  const VERB_KIND = [['recall', /^(identify|name|list|state|define|recall|recognize|enumerate|label|cite)/], ['explain', /^(explain|describe|discuss|interpret|summari|illustrate|classify|differentiate|compare|distinguish)/], ['apply', /^(calculate|compute|solve|apply|use|determine|measure|demonstrate|perform|investigate)/], ['analyze', /^(analy|infer|relate|examine|deduce|predict|organize)/], ['evaluate', /^(evaluate|assess|justify|judge|critique|argue|appraise|decide)/], ['create', /^(design|create|construct|develop|formulate|propose|plan|make)/]];
  const verbKind = t => { const s = String(t).trim().toLowerCase().replace(/^(the learners?|students?|learners) (should be able to |will |can )?/, ''); for (const [k, re] of VERB_KIND) if (re.test(s)) return k; return ''; };
  const domainsOf = t => { const s = String(t).toLowerCase(), o = []; for (const k in DOMAINS) if (DOMAINS[k].test(s)) o.push(k); return o; };
  const content = t => [...new Set(toks(t))];
  const firstWord = t => (String(t).trim().match(/^[a-z]+/i) || [''])[0].toLowerCase();
  function compareComps(comps) {
    const items = comps.map((c, i) => ({ ...c, n: i + 1, w: content(c.text), raw: (String(c.text).toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !STOP.has(w)), d: domainsOf(c.text + ' ' + (c.topic || '')), v: verbKind(c.text) }));
    const pairs = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      const shared = a.w.filter(x => b.w.includes(x)), union = new Set([...a.w, ...b.w]);
      const jac = union.size ? shared.length / union.size : 0;
      const sharedRaw = [...new Set(a.raw.filter(x => b.raw.includes(x)))];
      const dom = a.d.filter(x => b.d.includes(x));
      const sameVerb = a.v && a.v === b.v;
      let kind, why = [], next;
      if (jac >= .6 || (jac >= .45 && sameVerb)) {
        kind = 'dup'; why.push(`${Math.round(jac * 100)}% of their key words match`); if (sameVerb) why.push(`both ask students to ${a.v}`);
        next = 'Merge them, or reword one so each targets a different skill.';
      } else if (jac >= .3 || (shared.length >= 2 && sameVerb)) {
        kind = 'overlap'; why.push(`they share ${shared.length} key word${shared.length === 1 ? '' : 's'}`); if (sameVerb) why.push(`same skill level (${a.v})`); else if (a.v && b.v) why.push(`different skill levels (${a.v} vs ${b.v})`);
        next = sameVerb ? 'Check that items for each one test something different.' : 'Probably fine as a progression; keep both and keep item tags precise.';
      } else if (dom.length || shared.length >= 1) {
        kind = 'related'; if (dom.length) why.push('both point to ' + dom.join(', ')); if (shared.length) why.push('shared wording: ' + sharedRaw.slice(0, 4).join(', '));
        next = 'They may fit under one topic heading in the TOS.';
      } else {
        kind = 'separate'; why.push(a.d.length || b.d.length ? `different areas (${a.d[0] || 'unclassified'} / ${b.d[0] || 'unclassified'})` : 'no shared key words');
        next = 'Keep them in separate groups unless your curriculum guide links them.';
      }
      pairs.push({ a, b, kind, jac, shared: sharedRaw, why, next });
    }
    /* suggested groups: union-find over dup/overlap/related links */
    const parent = items.map((_, i) => i), find = x => parent[x] === x ? x : (parent[x] = find(parent[x]));
    pairs.forEach(p => { if (p.kind !== 'separate') parent[find(p.a.n - 1)] = find(p.b.n - 1); });
    const groups = {}; items.forEach((it, i) => { const r = find(i); (groups[r] = groups[r] || []).push(it); });
    const glist = Object.values(groups).map(g => { const dc = {}; g.forEach(x => x.d.forEach(d => dc[d] = (dc[d] || 0) + 1)); const top = Object.entries(dc).sort((x, y) => y[1] - x[1])[0]; return { items: g, label: top ? top[0] : (g.length > 1 ? 'shared wording' : 'stand-alone') }; }).sort((x, y) => y.items.length - x.items.length);
    return { items, pairs, groups: glist };
  }
  return { bloomInfo, infoFor, OPS, autoBloom, textOf, matchComps, suggestComps, compareComps, CONF, toks, verbKind, domainsOf };
})();
