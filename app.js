'use strict';
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fm = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const cm = n => Math.round(n * 100);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const snap = v => Math.round(v * 20) / 20;
  /* versione del programma: deve coincidere con version.json e con i ?v= in index.html */
  const APP_VER = '2026-11-26o';
  const CFG = Object.assign({ url: '', anon: '' }, window.SALA_CFG || {});
  const ROOM_RE = /^[a-z0-9]{10,40}$/;
  const newId = () => Math.floor(Math.random() * 9e15) + 1;
  const ACCENT = '#e0463a';

  const canvas = $('#gl'), stage = $('#stage');
  let eng;
  /* qualità grafica: alta (materiali, ombre morbide, geometrie più lisce) o semplice per dispositivi lenti */
  let gfx = 'hq';
  try { gfx = localStorage.getItem('sala3d.gfx') || 'hq'; } catch (e) { gfx = 'hq'; }
  MB.detail = gfx === 'hq' ? 1.6 : 1;
  try { eng = new Engine(canvas, { hq: gfx === 'hq', small: window.matchMedia('(max-width: 859px)').matches }); }
  catch (e) {
    $('#fatal').hidden = false;
    $('#fatal').textContent = 'Questo dispositivo non riesce ad avviare la grafica 3D (WebGL2). Prova con un browser aggiornato.';
    return;
  }

  /* ---------------- stato ---------------- */
  const DEF_ROOM = {
    W: 10, D: 12, hLow: 3.9, hHigh: 5.4, openings: [
      { t: 'door', wall: 'A', u: 0.6, w: 4.0, sill: 0, h: 2.5 },
      { t: 'win', wall: 'A', u: 0.6, w: 4.0, sill: 2.55, h: 1.05 },
      { t: 'win', wall: 'A', u: 4.9, w: 4.0, sill: 1.2, h: 2.4 },
      { t: 'win', wall: 'B', u: 4.2, w: 7.4, sill: 1.1, h: 1.9 },
    ],
  };
  const S = { room: null, nx: 0, nz: 0, cells: [], items: [], custom: [], sel: null, view: 'orbit', tab: 'cat', paint: 'g4', showRoof: true, cat: 'tutti', extra: [] };
  const cam = { yaw: -0.62, pitch: 0.62, dist: 24, target: [5, 1, 6], walk: [5, 1.65, 9], wyaw: 0, wpitch: -0.05 };
  const FLOOR_BY = new Map(FLOORS.map(f => [f.id, f]));
  const DEF = new Map(CATALOG.map(d => [d.k, d]));
  const meshes = new Map(), thumbs = new Map();
  const R = {};
  let dirty = true, floorDirty = true, lastVP = null;

  const roofH = z => S.room.hLow + (S.room.hHigh - S.room.hLow) * clamp(z / S.room.D, 0, 1);
  function wallInfo(key) {
    const r = S.room, W = r.W, D = r.D;
    if (key === 'A') return { key, o: [0, 0, 0], dir: [1, 0, 0], n: [0, 0, 1], len: W, rot: 0, hAt: () => r.hLow };
    if (key === 'B') return { key, o: [W, 0, 0], dir: [0, 0, 1], n: [-1, 0, 0], len: D, rot: -PI / 2, hAt: u => roofH(u) };
    if (key === 'C') return { key, o: [0, 0, D], dir: [1, 0, 0], n: [0, 0, -1], len: W, rot: PI, hAt: () => r.hHigh };
    return { key: 'D', o: [0, 0, 0], dir: [0, 0, 1], n: [1, 0, 0], len: D, rot: PI / 2, hAt: u => roofH(u) };
  }
  const WALL_KEYS = ['A', 'B', 'C', 'D'];
  function cellAt(x, z) {
    const i = clamp(floor(x), 0, S.nx - 1), j = clamp(floor(z), 0, S.nz - 1);
    return FLOOR_BY.get(S.cells[j * S.nx + i]) || FLOORS[0];
  }
  const floorTh = (x, z) => cellAt(x, z).th;
  const defOf = it => it.k === 'decal' ? decalDef(it) : DEF.get(it.k);
  function itemY(it) {
    const d = defOf(it);
    if (d.hang) return it.elev;
    if (d.wall && !d.fixElev) return it.elev;
    return floorTh(it.x, it.z);
  }
  function halfExt(it) {
    const d = defOf(it), c = abs(cos(it.rot)), s = abs(sin(it.rot));
    return [c * d.w / 2 + s * d.d / 2, s * d.w / 2 + c * d.d / 2];
  }
  function placeOnWall(it, key, u, elev) {
    const wi = wallInfo(key), d = defOf(it), half = d.w / 2;
    u = clamp(u, half, max(half, wi.len - half));
    it.x = wi.o[0] + wi.dir[0] * u + wi.n[0] * d.d / 2; it.z = wi.o[2] + wi.dir[2] * u + wi.n[2] * d.d / 2;
    it.rot = wi.rot; it.wall = key; it.u = u;
    it.elev = d.fixElev ? 0 : clamp(elev, 0, max(0, min(wi.hAt(u - half), wi.hAt(u + half)) - d.h));
  }
  function clampItem(it) {
    const d = defOf(it);
    if (d.wall) { const wi = wallInfo(it.wall || 'C'); placeOnWall(it, wi.key, it.u == null ? wi.len / 2 : it.u, it.elev || 0); return; }
    const [hx, hz] = halfExt(it);
    it.x = clamp(it.x, hx, max(hx, S.room.W - hx)); it.z = clamp(it.z, hz, max(hz, S.room.D - hz));
    if (d.hang) it.elev = clamp(it.elev, 0, max(0, roofH(it.z) - d.h - 0.05));
  }

  /* ---------------- attrezzi personalizzati ---------------- */
  function customDef(c) {
    return {
      k: c.id, name: c.name, cat: 'miei', w: c.w, d: c.d, h: c.h, wall: !!c.wall, elev: c.wall ? 1 : 0, custom: true,
      build(b) {
        if (c.shape === 'cyl') b.cyl(0, c.h / 2, 0, min(c.w, c.d) / 2, c.h, c.color, { seg: 24 });
        else b.box(0, c.h / 2, 0, c.w, c.h, c.d, c.color);
      },
    };
  }
  function syncCustomDefs() {
    for (const k of [...DEF.keys()]) if (DEF.get(k).custom) { DEF.delete(k); eng.free(meshes.get(k)); meshes.delete(k); thumbs.delete(k); }
    for (const c of S.custom) DEF.set(c.id, customDef(c));
  }
  /* modelli 3D veri (GLB) per gli attrezzi che ne hanno uno: caricati alla prima occorrenza, solo in grafica realistica.
     Il modello viene adattato all'altezza del catalogo; larghezza e profondità del catalogo diventano quelle reali del modello. */
  const models = new Map();
  function modelFor(k) {
    const d = DEF.get(k);
    if (!d || !d.model || gfx !== 'hq') return null;
    let e = models.get(k);
    if (!e) {
      e = { state: 'loading', mdl: null, fit: null };
      models.set(k, e);
      fetch(d.model).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(buf => eng.loadGLB(buf)).then(mdl => {
        const sx = mdl.max[0] - mdl.min[0], sy = mdl.max[1] - mdl.min[1], sz = mdl.max[2] - mdl.min[2];
        // modelBody: altezza (in unità del modello) della parte che corrisponde all'attrezzo; sopra ci sono catene/ganci
        const yaw = d.modelYaw || 0, swap = abs(sin(yaw)) > 0.5, body = d.modelBody || sy, s = d.h / (body || 1);
        const cx = (mdl.min[0] + mdl.max[0]) / 2, cz = (mdl.min[2] + mdl.max[2]) / 2;
        // modelFit 'box': larghezza e profondità del catalogo (scala diversa per asse); altrimenti proporzioni del modello
        const fw = swap ? sz : sx, fd = swap ? sx : sz;
        const kx = d.modelFit === 'box' ? d.w / (fw || 1) : s, kz = d.modelFit === 'box' ? d.d / (fd || 1) : s;
        // centro sul pavimento, rotazione per far guardare il fronte verso +Z, scala all'altezza del catalogo
        e.fit = M4.mul(M4.compose(0, 0, 0, 0, kx, s, kz), M4.mul(M4.compose(0, 0, 0, yaw), M4.compose(-cx, -mdl.min[1], -cz, 0)));
        e.extraH = (sy - body) * s;
        if (d.modelFit !== 'box') { d.w = round(fw * s * 100) / 100; d.d = round(fd * s * 100) / 100; }
        e.mdl = mdl; e.state = 'ready';
        for (const it of S.items) if (it.k === k) clampItem(it);
        thumbs.delete(k); dirty = true; ovDirty = true; updateSelbar();
        clearTimeout(modelCatT); modelCatT = setTimeout(renderCatalog, 300);
      }).catch(err => { e.state = 'error'; console.warn('Modello non caricato: ' + d.model, err); });
    }
    return e.state === 'ready' ? e : null;
  }
  let modelCatT = 0;
  function getMesh(k) {
    let m = meshes.get(k);
    if (!m) { const b = new MB(); DEF.get(k).build(b); m = eng.mesh(b); meshes.set(k, m); }
    return m;
  }

  /* ---------------- progetto: salva / carica ---------------- */
  function snapshot() {
    return JSON.stringify({ v: 1, room: S.room, nx: S.nx, nz: S.nz, cells: S.cells, items: S.extra.length ? S.items.concat(S.extra) : S.items, custom: S.custom });
  }
  const CUR_PATS = [['seigaiha', 'Seigaiha, onde (oro)'], ['asanoha', 'Asanoha, foglie di canapa (oro)'], ['sakura', 'Sakura, fiori di ciliegio'], ['tinta', 'Nera, senza fantasia']];
  function sanitizeRoom(r) {
    const o = {
      W: clamp(+r.W || 10, 3, 40), D: clamp(+r.D || 12, 3, 40), hLow: clamp(+r.hLow || 3, 2.2, 12), hHigh: clamp(+r.hHigh || 3, 2.2, 15), openings: [],
    };
    const prev = S.room; S.room = o;
    for (const p of (r.openings || []).slice(0, 24)) {
      const wi = wallInfo(WALL_KEYS.includes(p.wall) ? p.wall : 'A');
      const w = clamp(+p.w || 1, 0.3, wi.len), u = clamp(+p.u || 0, 0, wi.len - w);
      const hm = min(wi.hAt(u), wi.hAt(u + w)) - 0.05;
      const t = p.t === 'door' || p.t === 'pass' ? p.t : 'win';
      const sill = t !== 'win' ? 0 : clamp(+p.sill || 0, 0, hm - 0.3), h = clamp(+p.h || 1, 0.3, hm - sill);
      const op = { t, wall: wi.key, u, w, sill, h };
      if (t === 'win' && p.cur) { op.cur = true; op.cl = clamp(p.cl == null ? 1 : +p.cl || 0, 0, 1); }
      o.openings.push(op);
    }
    S.room = prev;
    o.curPat = CUR_PATS.some(p => p[0] === r.curPat) ? r.curPat : 'seigaiha';
    o.cols = {};
    if (r.cols && typeof r.cols === 'object') for (const k of WALL_KEYS) if (/^#[0-9a-f]{6}$/i.test(r.cols[k])) o.cols[k] = r.cols[k].toLowerCase();
    return o;
  }
  function resizeFloor(oldNx, oldNz, oldCells) {
    const nx = ceil(S.room.W - 1e-6), nz = ceil(S.room.D - 1e-6), cells = new Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const v = oldCells && oldNx ? oldCells[clamp(j, 0, oldNz - 1) * oldNx + clamp(i, 0, oldNx - 1)] : 'tb';
      cells[j * nx + i] = FLOOR_BY.has(v) || (typeof v === 'string' && /^[a-z0-9]{1,8}$/.test(v)) ? v : 'tb';   // un pavimento sconosciuto (versione più nuova) si conserva
    }
    S.nx = nx; S.nz = nz; S.cells = cells;
  }
  function restore(str) {
    const p = typeof str === 'string' ? JSON.parse(str) : str;
    if (!p || !p.room) throw new Error('File non valido');
    S.custom = (p.custom || []).filter(c => c && c.id && c.name).map(c => ({
      id: String(c.id), name: String(c.name).slice(0, 40), w: clamp(+c.w || 1, 0.05, 10), d: clamp(+c.d || 1, 0.05, 10), h: clamp(+c.h || 1, 0.01, 6),
      color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : '#7a8088', shape: c.shape === 'cyl' ? 'cyl' : 'box', wall: !!c.wall,
    }));
    syncCustomDefs();
    S.room = sanitizeRoom(p.room);
    resizeFloor(+p.nx || 0, +p.nz || 0, Array.isArray(p.cells) ? p.cells : null);
    S.items = []; S.extra = []; const ids = new Set();
    for (const q of p.items || []) {
      const isDec = q.k === DECAL;
      if (!isDec && !DEF.has(q.k)) { if (q && typeof q.k === 'string' && S.extra.length < 500) S.extra.push(q); continue; }   // oggetto di una versione più nuova: si conserva così com'è
      let id = +q.id || 0; if (!id || ids.has(id)) id = newId(); ids.add(id);
      const it = { id, k: q.k, x: +q.x || 0, z: +q.z || 0, rot: +q.rot || 0, elev: +q.elev || 0 };
      if (isDec) { const dc = cleanDecal(q); if (!dc) continue; Object.assign(it, dc); }
      if (defOf(it).wall) { it.wall = WALL_KEYS.includes(q.wall) ? q.wall : 'C'; it.u = +q.u || 0; }
      clampItem(it); S.items.push(it);
    }
    if (!S.items.some(i => i.id === S.sel)) S.sel = null;
    if (S.extra.length || S.cells.some(c => !FLOOR_BY.has(c))) showUpdate(true);
    buildRoom(); floorDirty = true; dirty = true;
  }
  function exampleProject() {
    const cells = [];
    for (let j = 0; j < 12; j++) for (let i = 0; i < 10; i++) cells.push(i >= 6 && j >= 8 ? 'g4' : 'tb');
    return {
      v: 1, room: DEF_ROOM, nx: 10, nz: 12, cells, custom: [],
      items: [
        { id: 1, k: 'rack', x: 8.2, z: 10.6, rot: PI }, { id: 2, k: 'kb8', x: 6.5, z: 8.6, rot: 0 }, { id: 3, k: 'kb16', x: 6.9, z: 8.6, rot: 0 },
        { id: 4, k: 'kb24', x: 7.35, z: 8.6, rot: 0 }, { id: 5, k: 'plyo', x: 6.6, z: 11.2, rot: PI / 2 }, { id: 6, k: 'sacco', x: 2.2, z: 9.4, rot: 0, elev: 0.7 },
        { id: 7, k: 'spalliera', wall: 'D', u: 6.2 }, { id: 8, k: 'persona', x: 4.6, z: 6.4, rot: 2.6 }, { id: 9, k: 'elastici', wall: 'C', u: 4.6, elev: 0.95 },
      ],
    };
  }

  const undoSt = [], redoSt = [];
  function pushHist() { undoSt.push(snapshot()); if (undoSt.length > 60) undoSt.shift(); redoSt.length = 0; updHist(); }
  function undo() { if (!undoSt.length) return; redoSt.push(snapshot()); restore(undoSt.pop()); afterBigChange(); }
  function redo() { if (!redoSt.length) return; undoSt.push(snapshot()); restore(redoSt.pop()); afterBigChange(); }
  function updHist() { $('#btn-undo').disabled = !undoSt.length; $('#btn-redo').disabled = !redoSt.length; }
  function afterBigChange() { updHist(); changed(); renderCatalog(); renderRoomPane(); }

  /* ---------------- sala condivisa (Supabase) ----------------
     La sala è identificata dal codice nel link (?s=…). Chi ha il link legge e scrive la stessa sala.
     Ogni salvataggio porta la versione di partenza: se nel frattempo ha salvato qualcun altro, si rilegge e si uniscono le modifiche. */
  const net = { id: '', rev: 0, base: null, dirty: false, chg: 0, busy: false, ready: false, ok: null, fails: 0, next: 0 };
  function newRoomId() {
    const a = new Uint8Array(14), abc = 'abcdefghijkmnpqrstuvwxyz23456789';
    crypto.getRandomValues(a);
    return [...a].map(v => abc[v % 32]).join('');
  }
  const roomUrl = () => location.origin + location.pathname + '?s=' + net.id;
  const cacheKey = () => 'sala3d.room.' + net.id;
  function saveCache() {
    try {
      localStorage.setItem(cacheKey(), JSON.stringify({ rev: net.rev, base: net.base, local: snapshot(), dirty: net.dirty }));
      localStorage.setItem('sala3d.last', net.id);
    } catch (e) { /* senza archivio locale si continua */ }
  }
  async function rpc(fn, args) {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 12000);
    try {
      const r = await fetch(CFG.url + '/rest/v1/rpc/' + fn, {
        method: 'POST', headers: { apikey: CFG.anon, Authorization: 'Bearer ' + CFG.anon, 'Content-Type': 'application/json' },
        body: JSON.stringify(args), signal: ctl.signal,
      });
      if (!r.ok) { const e = new Error('Risposta ' + r.status); e.status = r.status; throw e; }
      return await r.json();
    } finally { clearTimeout(to); }
  }
  /* testo canonico (chiavi ordinate): il database riordina le chiavi, quindi il confronto non può basarsi sull'ordine */
  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  function mergeList(b, l, r) {
    const key = x => String(x.id), B = new Map((b || []).map(x => [key(x), x])), L = new Map((l || []).map(x => [key(x), x])), out = [], seen = new Set();
    for (const x of r || []) {
      const k = key(x), lo = L.get(k), bo = B.get(k); seen.add(k);
      if (lo) out.push(bo && canon(lo) === canon(bo) ? x : lo);   // toccato qui: vale la versione di questo dispositivo
      else if (!bo) out.push(x);                                   // aggiunto dall'altra persona (se c'era in base, qui è stato eliminato)
    }
    for (const x of l || []) {
      const k = key(x); if (seen.has(k)) continue;
      const bo = B.get(k);
      if (!bo || canon(x) !== canon(bo)) out.push(x);              // nuovo qui, oppure modificato qui mentre l'altro lo eliminava
    }
    return out;
  }
  function merge3(b, l, r) {
    const pick = f => canon(l.room[f]) !== canon(b.room[f]) ? l.room[f] : r.room[f];
    const room = { W: pick('W'), D: pick('D'), hLow: pick('hLow'), hHigh: pick('hHigh'), openings: pick('openings'), cols: pick('cols') };
    let nx, nz, cells;
    if (l.nx === r.nx && l.nz === r.nz && b.nx === l.nx && b.nz === l.nz && l.cells.length === r.cells.length) {
      nx = l.nx; nz = l.nz; cells = l.cells.map((v, i) => v !== b.cells[i] ? v : r.cells[i]);
    } else if (l.nx !== b.nx || l.nz !== b.nz) { nx = l.nx; nz = l.nz; cells = l.cells; }
    else { nx = r.nx; nz = r.nz; cells = r.cells; }
    return { v: 1, room, nx, nz, cells, items: mergeList(b.items, l.items, r.items), custom: mergeList(b.custom, l.custom, r.custom) };
  }
  function validRemote(d) { return d && typeof d === 'object' && d.room && Array.isArray(d.items) && Array.isArray(d.cells); }
  function applyRemote(obj) {
    const customBefore = canon(S.custom);
    restore(obj);
    undoSt.length = redoSt.length = 0; updHist();
    dirty = true; ovDirty = true; updateSelbar();
    if (canon(S.custom) !== customBefore) renderCatalog();
    if (S.tab === 'list') renderList();
    if (S.tab === 'floor') renderFloorInfo();
    const ae = document.activeElement;
    if (S.tab === 'room' && !(ae && ae.closest && ae.closest('#pane-room'))) renderRoomPane();
  }
  /* prende la versione remota `row` e la combina con quello che qui non è ancora stato salvato */
  function takeRemote(row) {
    if (!validRemote(row.data)) { net.rev = row.rev; net.base = JSON.parse(snapshot()); net.dirty = true; return; }
    if (net.dirty && net.base && validRemote(net.base)) {
      const merged = merge3(net.base, JSON.parse(snapshot()), row.data);
      applyRemote(merged);
      net.dirty = canon(merged) !== canon(row.data);
    } else { applyRemote(row.data); net.dirty = false; }
    net.rev = row.rev; net.base = row.data;
  }
  async function firstSync() {
    const rows = await rpc('sala3d_get', { p_id: net.id, p_rev: max(0, net.rev - 1) });
    if (act) return;
    if (rows && rows.length) {
      if (!(net.rev && rows[0].rev === net.rev && net.base)) takeRemote(rows[0]);
    } else {
      const local = JSON.parse(snapshot()), c0 = net.chg;
      const r = await rpc('sala3d_save', { p_id: net.id, p_rev: 0, p_data: local });
      if (!(r > 0)) return;                       // creata da un altro nello stesso istante: si rilegge al prossimo giro
      net.rev = r; net.base = local; net.dirty = net.chg !== c0;
    }
    net.ready = true; $('#veil').hidden = true; saveCache();
  }
  async function pushLocal() {
    const local = JSON.parse(snapshot()), c0 = net.chg;
    const r = await rpc('sala3d_save', { p_id: net.id, p_rev: net.rev, p_data: local });
    if (r > 0) { net.rev = r; net.base = local; if (net.chg === c0) net.dirty = false; saveCache(); }
    else await pullRemote(true);
  }
  async function pullRemote(conflict) {
    const rows = await rpc('sala3d_get', { p_id: net.id, p_rev: net.rev });
    if (!rows || !rows.length) { if (conflict) { net.rev = 0; net.ready = false; } return; }   // la sala non c'è più: verrà ricreata
    if (act) return;                              // gesto in corso: si applica al prossimo giro
    takeRemote(rows[0]); saveCache();
  }
  async function syncTick(force) {
    if (net.busy || !net.id || !CFG.url) return;
    if (!force && (act || document.hidden || Date.now() < net.next)) return;
    net.busy = true;
    try {
      if (!net.ready) await firstSync();
      else if (net.dirty) await pushLocal();
      else await pullRemote(false);
      net.fails = 0; net.next = 0; setNet(true);
    } catch (e) {
      net.fails++; net.next = Date.now() + min(30000, 2000 * Math.pow(2, min(net.fails, 4))); setNet(false);
    }
    net.busy = false;
    if (net.ready && net.dirty && !net.next) kick(300);
  }
  let kickT = 0, saveT = 0;
  function kick(ms) { clearTimeout(kickT); kickT = setTimeout(() => syncTick(false), ms); }
  function setNet(ok) {
    if (net.ok === ok) return;
    net.ok = ok;
    $('#net').dataset.s = ok ? 'ok' : 'off';
    $('#net').title = ok ? 'Sala sincronizzata' : 'Non collegato';
    $('#sync').textContent = ok ? 'Sala condivisa: ogni modifica arriva a chi ha il link.' : 'Non collegato: le modifiche restano su questo dispositivo e partono appena torna la connessione.';
  }
  function openRoom(id, fresh) {
    net.id = id; net.rev = 0; net.base = null; net.dirty = false; net.ready = false; net.fails = 0; net.next = 0;
    try { history.replaceState(null, '', location.pathname + '?s=' + id); } catch (e) { /* in anteprima locale l'indirizzo resta com'è */ }
    let cached = false;
    if (!fresh) {
      try {
        const c = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
        if (c && c.local) { restore(c.local); net.rev = +c.rev || 0; net.base = c.base || null; net.dirty = !!c.dirty && !!net.base; cached = true; }
      } catch (e) { cached = false; }
    }
    return cached;
  }
  function changed() {
    net.dirty = true; net.chg++; dirty = true; ovDirty = true;
    updateSelbar(); if (S.tab === 'list') renderList(); if (S.tab === 'floor') renderFloorInfo();
    clearTimeout(saveT); saveT = setTimeout(saveCache, 400);
    if (net.ready) kick(450);
  }
  async function shareLink() {
    const url = roomUrl();
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ title: 'Sala 3D', text: 'Apri la sala e modificala con me:', url }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copiato. Chi lo apre modifica questa stessa sala.'); }
    catch (e) {
      openModal(`<h2>Link della sala</h2><p>Chi apre questo link modifica la stessa sala, senza account.</p><textarea id="ta-link" rows="3" readonly>${esc(url)}</textarea><div class="row"><button type="button" class="primary" data-close>Chiudi</button></div>`);
      $('#ta-link').select();
    }
  }
  function copyRoom() {
    openModal(`<h2>Copia con nuovo link</h2><p>Crea una sala uguale a questa con un link diverso, per provare un'altra disposizione. La sala attuale resta al suo link: salvalo prima di continuare.</p>
      <textarea id="ta-old" rows="2" readonly>${esc(roomUrl())}</textarea>
      <div class="row"><button type="button" data-close>Annulla</button><button type="button" class="primary" id="btn-newroom">Crea la copia</button></div>`);
    $('#btn-newroom').addEventListener('click', () => {
      closeModal(); saveCache();
      const keep = snapshot();
      openRoom(newRoomId(), true); restore(keep);
      undoSt.length = redoSt.length = 0; updHist(); saveCache(); syncTick(true);
      toast('Copia creata: ora lavori sulla nuova sala. Il link è in Menu, Condividi.', 6000);
    });
  }
  function download(name, blob) {
    const a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 5000);
  }

  /* ---------------- geometria della sala ---------------- */
  const WALL_COL = '#f8f7f4', T = 0.25;
  const WALL_PRESETS = [['Bianco', '#f8f7f4'], ['Carta washi', '#ece2cc'], ['Grigio perla', '#d8d8d2'], ['Sabbia', '#d9c7a5'], ['Verde matcha', '#a9b386'], ['Rosso lacca', '#a8392b'], ['Indaco', '#2e3d5c'], ['Sumi (antracite)', '#3a3937']];
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => clamp(round(v * f), 0, 255));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  const WM = { m: MAT.PLASTER }, MM = { m: MAT.METAL, g: 0.35 };
  function buildWall(key) {
    const wc = (S.room.cols && S.room.cols[key]) || WALL_COL;
    const wi = wallInfo(key), mb = new MB(), ext = key === 'A' || key === 'C' ? T : 0;
    mb.frame(wi.o, wi.dir, [0, 1, 0], wi.n);
    const ops = S.room.openings.filter(o => o.wall === key);
    const cuts = [-ext, wi.len + ext];
    for (const o of ops) cuts.push(o.u, o.u + o.w);
    cuts.sort((a, b) => a - b);
    const hAt = u => wi.hAt(clamp(u, 0, wi.len));
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], b = cuts[i + 1];
      if (b - a < 1e-4) continue;
      const cov = ops.filter(o => o.u <= a + 1e-4 && o.u + o.w >= b - 1e-4).sort((p, q) => p.sill - q.sill);
      let y = 0;
      for (const o of cov) { if (o.sill > y + 1e-4) mb.prism(a, b, y, o.sill, o.sill, T, wc, WM); y = max(y, o.sill + o.h); }
      if (hAt(a) > y + 1e-4 || hAt(b) > y + 1e-4) mb.prism(a, b, y, max(hAt(a), y), max(hAt(b), y), T, wc, WM);
    }
    const z = -T / 2;
    for (const o of ops) {
      const cx = o.u + o.w / 2, cy = o.sill + o.h / 2;
      if (o.t === 'pass') {
        // passaggio aperto: solo stipiti e architrave in legno, nessun battente
        const fw = 0.08;
        for (const x of [o.u + fw / 2, o.u + o.w - fw / 2]) mb.box(x, o.h / 2, z, fw, o.h, T + 0.02, '#6b4f33');
        mb.box(cx, o.h + fw / 2, z, o.w, fw, T + 0.02, '#6b4f33');
        mb.box(cx, 0.006, z, o.w, 0.012, T + 0.02, '#8a6a42');
      } else if (o.t === 'door') {
        mb.box(cx, cy, z, o.w, o.h, 0.06, '#8e9499', MM);
        const n = max(1, round(o.w / 1.0));
        for (let i = 1; i < n; i++) mb.box(o.u + i * o.w / n, cy, z + 0.035, 0.016, o.h, 0.012, '#5f646a', MM);
        mb.box(cx, o.sill + o.h * 0.52, z + 0.035, o.w, 0.03, 0.012, '#787e84', MM);
        mb.box(cx, o.sill + 0.06, z + 0.035, o.w, 0.12, 0.012, '#787e84', MM);
      } else {
        mb.box(cx, o.sill + o.h * 0.7, z, o.w, o.h * 0.6, 0.02, '#f2f7fb', { e: 1 });
        mb.box(cx, o.sill + o.h * 0.2, z, o.w, o.h * 0.4, 0.02, '#dfe8ea', { e: 1 });
        const fc = '#5a5f65', nv = max(1, round(o.w / 0.5)), nh = max(1, round(o.h / 0.55));
        for (let i = 0; i <= nv; i++) mb.box(o.u + i * o.w / nv, cy, z, i === 0 || i === nv ? 0.05 : 0.022, o.h, 0.06, fc, MM);
        for (let j = 0; j <= nh; j++) mb.box(cx, o.sill + j * o.h / nh, z, o.w, j === 0 || j === nh ? 0.05 : 0.022, 0.06, fc, MM);
      }
    }
    mb.frame(null);
    return eng.mesh(mb);
  }
  /* ---------------- tende nere alle finestre ----------------
     Due teli plissettati appesi a un bastone sopra la finestra, lunghi fino al davanzale.
     cl = 1 chiusa (i teli si incontrano al centro), 0 aperta (raccolti ai lati). */
  const curt = new Map();   // indice apertura -> { key, mesh, model, disp }
  /* fantasie giapponesi per la stoffa: disegnate su canvas, ripetibili; tw/th = misura reale del riquadro (m) */
  const patTex = new Map();
  function patternOf(name) {
    if (patTex.has(name)) return patTex.get(name);
    const BG = '#131313', GOLD = '#a8894f';
    const cv = document.createElement('canvas'); let tw = 0.3, th = 0.3;
    const x = cv.getContext('2d');
    if (name === 'asanoha') {
      const sd = 128, h = sd * Math.sqrt(3) / 2; cv.width = 512; cv.height = round(4 * h); tw = 0.75; th = tw * cv.height / cv.width;
      x.fillStyle = BG; x.fillRect(0, 0, cv.width, cv.height); x.strokeStyle = GOLD; x.lineCap = 'round';
      const V = (i, j) => [i * sd + ((j % 2 + 2) % 2) * sd / 2, j * h];
      for (let j = -1; j <= 4; j++) for (let i = -1; i <= 5; i++) {
        for (const tri of [[V(i, j), V(i + 1, j), j % 2 ? V(i + 1, j + 1) : V(i, j + 1)], [V(i + 1, j), j % 2 ? V(i + 1, j + 1) : V(i, j + 1), j % 2 ? V(i + 2, j + 1) : V(i + 1, j + 1)]]) {
          const g = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3];
          x.lineWidth = 3.2; x.beginPath(); for (const p of tri) { x.moveTo(p[0], p[1]); x.lineTo(g[0], g[1]); } x.stroke();
          x.lineWidth = 2.2; x.beginPath(); x.moveTo(tri[0][0], tri[0][1]); x.lineTo(tri[1][0], tri[1][1]); x.lineTo(tri[2][0], tri[2][1]); x.closePath(); x.stroke();
        }
      }
    } else if (name === 'sakura') {
      cv.width = cv.height = 512; tw = th = 0.9;
      x.fillStyle = BG; x.fillRect(0, 0, 512, 512);
      let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const flower = (cx, cy, r, a) => {
        for (let k = 0; k < 5; k++) {
          const ang = a + k * 2 * PI / 5;
          x.save(); x.translate(cx + Math.cos(ang) * r * 0.5, cy + Math.sin(ang) * r * 0.5); x.rotate(ang);
          x.fillStyle = '#e3aab2'; x.beginPath(); x.ellipse(0, 0, r * 0.52, r * 0.36, 0, 0, 2 * PI); x.fill();
          x.fillStyle = BG; x.beginPath(); x.moveTo(r * 0.56, 0); x.lineTo(r * 0.36, -r * 0.08); x.lineTo(r * 0.36, r * 0.08); x.fill();   // tacca del petalo
          x.restore();
        }
        x.fillStyle = '#b0505f'; x.beginPath(); x.arc(cx, cy, r * 0.2, 0, 2 * PI); x.fill();
        x.fillStyle = '#e9c46a'; for (let k = 0; k < 5; k++) { const ang = a + (k + 0.5) * 2 * PI / 5; x.beginPath(); x.arc(cx + Math.cos(ang) * r * 0.3, cy + Math.sin(ang) * r * 0.3, r * 0.05, 0, 2 * PI); x.fill(); }
      };
      const fl = []; for (let k = 0; k < 9; k++) fl.push([rnd() * 512, rnd() * 512, 26 + rnd() * 26, rnd() * 2 * PI]);
      const pe = []; for (let k = 0; k < 10; k++) pe.push([rnd() * 512, rnd() * 512, 7 + rnd() * 6, rnd() * 2 * PI]);
      for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) {
        for (const [px, py, r, a] of pe) { x.save(); x.translate(px + dx, py + dy); x.rotate(a); x.fillStyle = '#c98f98'; x.beginPath(); x.ellipse(0, 0, r, r * 0.6, 0, 0, 2 * PI); x.fill(); x.restore(); }
        for (const [px, py, r, a] of fl) flower(px + dx, py + dy, r, a);
      }
    } else if (name === 'seigaiha') {
      cv.width = cv.height = 512; tw = th = 0.6;
      x.fillStyle = BG; x.fillRect(0, 0, 512, 512);
      const R = 128;
      for (let j = -2; j <= 10; j++) for (let i = -1; i <= 3; i++) {
        const cx = i * 2 * R + ((j % 2 + 2) % 2) * R, cy = j * R / 2;
        x.fillStyle = BG; x.beginPath(); x.arc(cx, cy, R, PI, 2 * PI); x.lineTo(cx + R, cy + 2); x.lineTo(cx - R, cy + 2); x.fill();
        x.strokeStyle = GOLD;
        for (let k = 1; k <= 4; k++) { x.lineWidth = k === 4 ? 5 : 4; x.beginPath(); x.arc(cx, cy, R * (k / 4) - 3, PI, 2 * PI); x.stroke(); }
      }
    } else { cv.width = cv.height = 8; x.fillStyle = BG; x.fillRect(0, 0, 8, 8); }
    const e = { tex: eng.repeatTexture(cv), tw, th };
    patTex.set(name, e);
    return e;
  }
  const CUR_Z = 0.1, CUR_COL = '#121212';
  function buildCurtain(wk, o, c) {
    const wi = wallInfo(wk), b = new MB();
    b.frame(wi.o, wi.dir, [0, 1, 0], wi.n);
    const top = o.sill + o.h, ext = 0.14, x0 = o.u - ext, x1 = o.u + o.w + ext, mid = o.u + o.w / 2;
    // bastone, staffe e pomoli
    b.cyl((x0 + x1) / 2, top + 0.07, CUR_Z, 0.013, x1 - x0 + 0.1, '#1b1b1b', { axis: 'x', g: 0.5, m: MAT.METAL, seg: 10 });
    for (const x of [x0 - 0.05, x1 + 0.05]) b.sph(x, top + 0.07, CUR_Z, 0.025, '#1b1b1b', { g: 0.5, m: MAT.METAL });
    for (const x of [x0 + 0.04, x1 - 0.04]) b.box(x, top + 0.07, CUR_Z / 2, 0.02, 0.03, CUR_Z, '#1b1b1b', { g: 0.4, m: MAT.METAL });
    const half = mid - x0 + 0.03, fabric = half * 1.6, stack = max(0.12, fabric * 0.11);
    const yb = o.sill + 0.01, yt = top + 0.045, pat = patternOf(S.room.curPat || 'seigaiha'), V = [];
    // vertice della stoffa in coordinate del mondo (x lungo la parete, z verso la sala) con UV sulla stoffa "stesa"
    const W3 = (lx, ly, lz, nx, nz, u, v) => V.push(wi.o[0] + wi.dir[0] * lx + wi.n[0] * lz, ly, wi.o[2] + wi.dir[2] * lx + wi.n[2] * lz, wi.dir[0] * nx + wi.n[0] * nz, 0, wi.dir[2] * nx + wi.n[2] * nz, u, v);
    for (const side of [-1, 1]) {
      const a = side < 0 ? x0 : x1;                                // bordo fisso, vicino al bastone
      const span = stack + (half - stack) * c, xa = a, xb = a - side * span;
      const n = max(3, round(fabric / 0.12)), K = n * 8;
      const ratio = fabric / max(span, 1e-3);
      const A = min(0.07, span / (2 * PI * n) * Math.sqrt(max(0, 2 * (ratio * ratio - 1))));
      const P = k => { const t = k / K, x = xa + (xb - xa) * t, ph = t * n * 2 * PI; return [x, CUR_Z + 0.03 + A * (1 - Math.cos(ph)), A * Math.sin(ph) * 2 * PI * n / max(span, 1e-3)]; };
      for (let k = 0; k < K; k++) {
        const p = P(k), q = P(k + 1);
        // normale della piega (nel piano x-z della parete), verso la sala
        const nrm = (dz) => { const nx = -dz * side, nz = 1, l = Math.hypot(nx, nz); return [nx / l, 0, nz / l]; };
        const np = nrm(p[2]), nq = nrm(q[2]);
        // u: posizione sulla stoffa stesa (così la fantasia si piega con le pieghe); v: dall'alto
        const up = (side < 0 ? k : K - k) / K * fabric / pat.tw, uq = (side < 0 ? k + 1 : K - k - 1) / K * fabric / pat.tw;
        const vb = (yt - yb) / pat.th;
        const P1 = [p[0], yb, p[1], np, up, vb], P2 = [q[0], yb, q[1], nq, uq, vb], P3 = [q[0], yt, q[1], nq, uq, 0], P4 = [p[0], yt, p[1], np, up, 0];
        for (const v of [P1, P2, P3, P1, P3, P4]) W3(v[0], v[1], v[2], v[3][0], v[3][2], v[4], v[5]);
      }
      // anelli sul bastone
      const nr = max(3, round(span / 0.1));
      for (let i = 0; i <= nr; i++) b.tor(xa - side * span * i / nr, top + 0.07, CUR_Z, 0.022, 0.004, '#1b1b1b', { r: [0, 0, PI / 2], g: 0.5, m: MAT.METAL, seg: 10 });
    }
    b.frame(null);
    return { mesh: eng.mesh(b), model: eng.texturedModel(new Float32Array(V), pat.tex, 0.82) };
  }
  function curtainDraws(dr, shown) {
    const live = new Set();
    S.room.openings.forEach((o, i) => {
      if (o.t !== 'win' || !o.cur || !shown[o.wall]) return;
      let e = curt.get(i);
      if (!e) { e = { key: '', mesh: null, model: null, disp: o.cl }; curt.set(i, e); }
      const key = [o.wall, o.u, o.w, o.sill, o.h, S.room.curPat, e.disp.toFixed(3)].join();
      if (key !== e.key) { eng.free(e.mesh); eng.freeModel(e.model); Object.assign(e, buildCurtain(o.wall, o, e.disp)); e.key = key; }
      live.add(i); dr.push({ mesh: e.mesh, m: IDENT, cast: true }, { model: e.model, m: IDENT, cast: true });
    });
    for (const [i, e] of curt) if (!live.has(i) && !(S.room.openings[i] && S.room.openings[i].cur)) { eng.free(e.mesh); eng.freeModel(e.model); curt.delete(i); }
  }
  function curtainsMoving() {
    let mv = false;
    S.room.openings.forEach((o, i) => { const e = curt.get(i); if (e && o.cur && abs(e.disp - o.cl) > 1e-3) mv = true; });
    return mv;
  }
  function curtainStep(dt) {
    S.room.openings.forEach((o, i) => {
      const e = curt.get(i); if (!e || !o.cur) return;
      const d = o.cl - e.disp; if (abs(d) < 1e-3) { e.disp = o.cl; return; }
      e.disp += Math.sign(d) * min(abs(d), dt * 0.9); dirty = true;
    });
  }
  /* tocco su una tenda: la apre o la chiude */
  function curtainAt(px, py) {
    const ray = rayAt(px, py); let best = null;
    S.room.openings.forEach((o, i) => {
      if (o.t !== 'win' || !o.cur) return;
      const wi = wallInfo(o.wall), dn = V3.dot(ray.d, wi.n); if (dn > -1e-4) return;   // solo guardando la parete dall'interno
      const t = (CUR_Z + 0.03 - V3.dot(V3.sub(ray.o, wi.o), wi.n)) / dn; if (t <= 0) return;
      const X = V3.add(ray.o, V3.mul(ray.d, t)), u = V3.dot(V3.sub(X, wi.o), wi.dir);
      if (u > o.u - 0.2 && u < o.u + o.w + 0.2 && X[1] > o.sill - 0.05 && X[1] < o.sill + o.h + 0.15 && (!best || t < best.t)) best = { t, i };
    });
    return best ? best.i : -1;
  }
  function toggleCurtain(i, v) {
    const o = S.room.openings[i]; if (!o || !o.cur) return;
    o.cl = v != null ? v : (o.cl > 0.5 ? 0 : 1);
    changed(); dirty = true;
  }
  function buildRoof() {
    const r = S.room, W = r.W, D = r.D, mb = new MB(), t = 0.08, ov = 0.3, sl = (r.hHigh - r.hLow) / D;
    mb.beam([W / 2, r.hLow - ov * sl + t / 2, -ov], [W / 2, r.hHigh + ov * sl + t / 2, D + ov], W + 2 * ov, t, '#e7eaea', MM);
    for (let x = 1; x < W - 0.05; x += 1) mb.beam([x, r.hLow - 0.003, 0], [x, r.hHigh - 0.003, D], 0.014, 0.004, '#c2c8c8', MM);
    const n = max(2, round(D / 3)), TC = '#b4babf', dp = 0.32, G = { g: 0.5, m: MAT.METAL };
    for (let i = 0; i <= n; i++) {
      const z = clamp(D * i / n, 0.1, D - 0.1), yT = roofH(z) - 0.04;
      mb.box(W / 2, yT, z, W, 0.045, 0.045, TC, G); mb.box(W / 2, yT - dp, z, W, 0.045, 0.045, TC, G);
      const m = max(2, round(W / 0.6)), st = W / m;
      for (let k = 0; k < m; k++) mb.beam([k * st, k % 2 ? yT : yT - dp, z], [(k + 1) * st, k % 2 ? yT - dp : yT, z], 0.02, 0.02, TC, G);
    }
    const nc = max(2, round(W / 2.5));
    for (let j = 1; j < nc; j++) mb.beam([W * j / nc, r.hLow - 0.07, 0], [W * j / nc, r.hHigh - 0.07, D], 0.04, 0.06, '#aab0b5', G);
    return eng.mesh(mb);
  }
  function buildRoom() {
    for (const k of ['base', 'A', 'B', 'C', 'D', 'roof']) { eng.free(R[k]); R[k] = null; }
    const r = S.room, mb = new MB();
    mb.box(r.W / 2, -0.06, r.D / 2, r.W + 2 * T, 0.12, r.D + 2 * T, '#9c9a95', { m: MAT.CONCRETE });
    R.base = eng.mesh(mb);
    for (const k of WALL_KEYS) R[k] = buildWall(k);
    R.roof = buildRoof();
    eng.setShadowBounds([0, 0, 0], [r.W, max(r.hLow, r.hHigh), r.D]);
  }
  function buildFloor() {
    eng.free(R.floor);
    const mb = new MB(), W = S.room.W, D = S.room.D, g = 0.004;
    for (let j = 0; j < S.nz; j++) for (let i = 0; i < S.nx; i++) {
      const f = FLOOR_BY.get(S.cells[j * S.nx + i]) || FLOORS[0];
      if (!f || !f.th) continue;
      const x0 = i, x1 = min(i + 1, W), z0 = j, z1 = min(j + 1, D);
      if (x1 - x0 < 0.02 || z1 - z0 < 0.02) continue;
      mb.box((x0 + x1) / 2, 0.001, (z0 + z1) / 2, x1 - x0, 0.002, z1 - z0, shade(f.col, 0.45), { m: f.m || 0 });
      mb.box((x0 + x1) / 2, f.th / 2, (z0 + z1) / 2, x1 - x0 - 2 * g, f.th, z1 - z0 - 2 * g, f.col, { m: f.m || 0 });
    }
    R.floor = eng.mesh(mb); floorDirty = false;
  }
  const ROPE = {};
  {
    const mk = (hex, o) => { const b = new MB(); b.cyl(0, 0.5, 0, 1, 1, hex, o); return eng.mesh(b); };
    ROPE.steel = mk('#a3a9af', { g: 0.8, seg: 8 }); ROPE.dark = mk('#2b2d31', { seg: 8 }); ROPE.rope = mk('#bfa67a', { seg: 8 });
    const b = new MB(); b.box(0, 0, 0, 1, 1, 1, ACCENT, { e: 1 }); R.outline = eng.mesh(b);
  }
  // il karateka che si guida nella vista Interno: un pezzo per articolazione
  const AV = {};
  for (const k of Object.keys(KARATEKA.parts)) { const b = new MB(); KARATEKA.parts[k](b); AV[k] = eng.mesh(b); }

  /* ---------------- camera ---------------- */
  const FOV_O = 0.72, FOV_W = 1.2;
  function aspect() { return (canvas.clientWidth || 1) / (canvas.clientHeight || 1); }
  /* Interno: la telecamera sta alle spalle del karateka (cam.walk = dove si trova lui) */
  function walkDir() { const p = cam.wpitch - 0.16, cp = cos(p); return [sin(cam.wyaw) * cp, sin(p), -cos(cam.wyaw) * cp]; }
  function walkAt() { const d = walkDir(); return [cam.walk[0] + d[0] * 1.8, 1.32 + d[1] * 1.8, cam.walk[2] + d[2] * 1.8]; }
  function camEye() {
    if (S.view === 'walk') {
      const d = walkDir(), D = 2.7, x = cam.walk[0] - d[0] * D, z = cam.walk[2] - d[2] * D;
      const ex = clamp(x, 0.15, S.room.W - 0.15), ez = clamp(z, 0.15, S.room.D - 0.15);
      return [ex, clamp(1.62 - d[1] * D, 0.35, roofH(ez) - 0.15), ez];
    }
    const cp = cos(cam.pitch);
    return [cam.target[0] + cam.dist * cp * sin(cam.yaw), cam.target[1] + cam.dist * sin(cam.pitch), cam.target[2] + cam.dist * cp * cos(cam.yaw)];
  }
  function camMats() {
    if (window.__salaCam) { const q = window.__salaCam; return { eye: q.eye, view: M4.lookAt(q.eye, q.at, [0, 1, 0]), proj: M4.persp(0.7, aspect(), 0.05, 200) }; }   // solo per le prove
    const eye = camEye();
    if (S.view === 'walk') {
      return { eye, view: M4.lookAt(eye, walkAt(), [0, 1, 0]), proj: M4.persp(FOV_W, aspect(), 0.05, 200) };
    }
    return { eye, view: M4.lookAt(eye, cam.target, [0, 1, 0]), proj: M4.persp(FOV_O, aspect(), 0.1, 400) };
  }
  var walkHint = false;
  function setView(v, keep) {
    S.view = v;
    const r = S.room, a = aspect(), th = tan(FOV_O / 2);
    if (v === 'plan') {
      cam.target = [r.W / 2, 0, r.D / 2]; cam.yaw = 0; cam.pitch = 1.5607;
      cam.dist = max((r.D + 1.6) / 2 / th, (r.W + 1.6) / 2 / (th * a)) * 1.04;
    } else if (v === 'orbit' && !keep) {
      cam.target = [r.W / 2, 1.0, r.D / 2]; cam.yaw = -0.62; cam.pitch = 0.6;
      const rad = 0.5 * hypot(r.W, r.D, r.hHigh), fh = 2 * Math.atan(th * a);
      cam.dist = rad / sin(min(FOV_O, fh) / 2) * 0.92;
    } else if (v === 'walk' && !keep) {
      cam.walk = [r.W * 0.55, 1.65, r.D * 0.82]; cam.wyaw = -0.12; cam.wpitch = -0.04;
    }
    for (const b of document.querySelectorAll('#views button')) b.setAttribute('aria-pressed', b.dataset.view === v ? 'true' : 'false');
    document.body.classList.toggle('view-walk', v === 'walk');
    if (v !== 'walk') { walkIn.keys.clear(); walkIn.pad.clear(); }
    else if (!walkHint) { walkHint = true; setTimeout(() => toast(window.matchMedia('(pointer: coarse)').matches ? 'Usa le frecce in basso per camminare e girarti. Trascina per guardarti intorno.' : 'Cammina con W A S D o con le frecce (← → per girarti). Maiuscolo per andare più veloce.', 5000), 50); }
    cam.auto = true; dirty = true;
  }
  function getVP() { const c = camMats(); return M4.mul(c.proj, c.view); }
  function rayAt(px, py) {
    const rc = canvas.getBoundingClientRect(), nx = (px - rc.left) / rc.width * 2 - 1, ny = 1 - (py - rc.top) / rc.height * 2;
    const inv = M4.invert(getVP()), a = M4.tp(inv, [nx, ny, -1]), b = M4.tp(inv, [nx, ny, 1]);
    return { o: a, d: V3.norm(V3.sub(b, a)) };
  }
  function rayPlaneY(ray, y) {
    if (abs(ray.d[1]) < 1e-5) return null;
    const t = (y - ray.o[1]) / ray.d[1];
    if (t <= 0 || t > 500) return null;
    return [ray.o[0] + ray.d[0] * t, y, ray.o[2] + ray.d[2] * t];
  }
  /* in Interno il karateka guidato prende il posto della figura di scala, che non si vede */
  function hiddenInWalk(it) { return S.view === 'walk' && it.k === 'persona'; }
  function pickItem(px, py) {
    const ray = rayAt(px, py); let best = null, flat = null;
    for (const it of S.items) {
      if (hiddenInWalk(it)) continue;
      const d = defOf(it), c = cos(it.rot), s = sin(it.rot), y0 = itemY(it);
      const ox = ray.o[0] - it.x, oy = ray.o[1] - y0, oz = ray.o[2] - it.z;
      const lo = [c * ox - s * oz, oy, s * ox + c * oz], ld = [c * ray.d[0] - s * ray.d[2], ray.d[1], s * ray.d[0] + c * ray.d[2]];
      const hw = max(d.w, 0.34) / 2, hd = max(d.d, 0.34) / 2, hh = d.flat ? 0.03 : max(d.h, 0.2);
      const mn = [-hw, 0, -hd], mx = [hw, hh, hd];
      let t0 = 0, t1 = 1e9, ok = true;
      for (let k = 0; k < 3; k++) {
        if (abs(ld[k]) < 1e-8) { if (lo[k] < mn[k] || lo[k] > mx[k]) { ok = false; break; } continue; }
        let a = (mn[k] - lo[k]) / ld[k], b = (mx[k] - lo[k]) / ld[k];
        if (a > b) [a, b] = [b, a];
        t0 = max(t0, a); t1 = min(t1, b);
        if (t0 > t1) { ok = false; break; }
      }
      if (!ok) continue;
      const hit = { it, t: t0, point: V3.add(ray.o, V3.mul(ray.d, t0)) };
      if (d.flat) { if (!flat || t0 < flat.t) flat = hit; }
      else if (!best || t0 < best.t) best = hit;
    }
    return best || flat;
  }
  /* punto sulla parete sotto il puntatore; `prefer` = parete attuale dell'attrezzo, valida anche se vista da dietro */
  function wallHit(ray, prefer) {
    let best = null;
    for (const k of WALL_KEYS) {
      const wi = wallInfo(k), dn = V3.dot(ray.d, wi.n);
      if (abs(dn) < 1e-5 || (dn > 0 && k !== prefer)) continue;
      const t = V3.dot(V3.sub(wi.o, ray.o), wi.n) / dn;
      if (t <= 0) continue;
      const p = V3.add(ray.o, V3.mul(ray.d, t)), u = V3.dot(V3.sub(p, wi.o), wi.dir), hw = wi.hAt(clamp(u, 0, wi.len));
      if (dn > 0) { if (u >= 0 && u <= wi.len && p[1] >= 0 && p[1] <= hw) return { key: k, t, u, y: p[1] }; continue; }
      if (u < -0.5 || u > wi.len + 0.5 || p[1] < -0.5 || p[1] > hw + 1.5) continue;
      if (!best || t < best.t) best = { key: k, t, u, y: p[1] };
    }
    return best;
  }

  /* ---------------- sovrapposizioni ---------------- */
  let ovDirty = true, ovSet = new Set();
  function overlapsOfSel() {
    if (!ovDirty) return ovSet;
    ovDirty = false; ovSet = new Set();
    const a = S.items.find(i => i.id === S.sel);
    if (!a || a.k === DECAL) return ovSet;
    const A = obb(a);
    for (const b of S.items) {
      if (b === a || b.k === DECAL) continue;
      const B = obb(b);
      if (A.y1 <= B.y0 + 0.005 || B.y1 <= A.y0 + 0.005) continue;
      if (sat(A, B) && sat(B, A)) ovSet.add(b.id);
    }
    return ovSet;
  }
  function obb(it, mg = 0) {
    const d = defOf(it), c = cos(it.rot), s = sin(it.rot), y = itemY(it);
    const ax = [c, -s], az = [s, c], hw = d.w / 2 + mg, hd = d.d / 2 + mg, pts = [];
    for (const [i, j] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push([it.x + ax[0] * hw * i + az[0] * hd * j, it.z + ax[1] * hw * i + az[1] * hd * j]);
    return { pts, axes: [ax, az], y0: y, y1: y + d.h };
  }
  function sat(A, B) {
    for (const ax of A.axes) {
      let a0 = 1e9, a1 = -1e9, b0 = 1e9, b1 = -1e9;
      for (const p of A.pts) { const v = p[0] * ax[0] + p[1] * ax[1]; a0 = min(a0, v); a1 = max(a1, v); }
      for (const p of B.pts) { const v = p[0] * ax[0] + p[1] * ax[1]; b0 = min(b0, v); b1 = max(b1, v); }
      if (a1 <= b0 + 0.005 || b1 <= a0 + 0.005) return false;
    }
    return true;
  }

  /* ---------------- disegno ---------------- */
  const IDENT = M4.compose(0, 0, 0, 0);
  const accLin = colLin(ACCENT);
  let clearCol = [0.87, 0.89, 0.91, 1];
  /* giorno o sera: di sera il sole è spento, i vetri sono scuri e fanno luce LED e lanterne */
  let lightMode = 'day';
  try { lightMode = localStorage.getItem('sala3d.light') === 'night' ? 'night' : 'day'; } catch (_) { }
  const NIGHT_BG = [0.035, 0.045, 0.075, 1];
  function setLightMode(m) {
    lightMode = m; try { localStorage.setItem('sala3d.light', m); } catch (_) { }
    document.body.classList.toggle('night', m === 'night');
    const b = $('#btn-light'); b.innerHTML = m === 'night' ? '<span aria-hidden="true">☾</span> Sera' : '<span aria-hidden="true">☀</span> Giorno';
    b.setAttribute('aria-label', m === 'night' ? 'Vista di sera: tocca per il giorno' : 'Vista di giorno: tocca per la sera');
    dirty = true;
  }
  function readTheme() {
    const m = /rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/.exec(getComputedStyle(stage).backgroundColor || '');
    if (m) clearCol = [m[1] / 255, m[2] / 255, m[3] / 255, 1];
    dirty = true;
  }
  const decals = [];
  const sceneLights = [];
  /* al massimo 16 luci per lo shader: le più vicine tra loro si fondono in una (stessa energia, nessun salto muovendo la vista) */
  let mergedKey = '', merged = [];
  function mergedLights() {
    const key = sceneLights.map(l => l.p.map(v => v.toFixed(2)).join() + l.c.map(v => v.toFixed(2)).join()).join('|');
    if (key === mergedKey) return merged;
    let ls = sceneLights.map(l => ({ p: l.p.slice(), c: l.c.slice(), r: l.r, w: l.c[0] + l.c[1] + l.c[2] }));
    while (ls.length > 16) {
      let bi = 0, bj = 1, bd = Infinity;
      for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) { const d = V3.len(V3.sub(ls[i].p, ls[j].p)); if (d < bd) { bd = d; bi = i; bj = j; } }
      const a = ls[bi], b = ls[bj], w = a.w + b.w;
      const m = { p: [0, 1, 2].map(k => (a.p[k] * a.w + b.p[k] * b.w) / w), c: [0, 1, 2].map(k => a.c[k] + b.c[k]), w };
      m.r = max(a.r + V3.len(V3.sub(a.p, m.p)), b.r + V3.len(V3.sub(b.p, m.p)));
      ls.splice(bj, 1); ls[bi] = m;
    }
    mergedKey = key; merged = ls;
    return merged;
  }
  function buildDraws(eye) {
    const r = S.room, dr = [];
    if (floorDirty) buildFloor();
    dr.push({ mesh: R.base, m: IDENT }, { mesh: R.floor, m: IDENT });
    const walk = S.view === 'walk';
    // una parete si nasconde quando la vista è dietro di lei; con lei spariscono anche le decorazioni appese
    const shown = { A: walk || eye[2] > 0, B: walk || eye[0] < r.W, C: walk || eye[2] < r.D, D: walk || eye[0] > 0 };
    for (const k of WALL_KEYS) if (shown[k]) dr.push({ mesh: R[k], m: IDENT, emis: lightMode === 'night' ? 0.045 : 1 });
    sceneLights.length = 0;
    if (S.showRoof && S.view !== 'plan' && (walk || eye[1] < roofH(eye[2]))) dr.push({ mesh: R.roof, m: IDENT });
    curtainDraws(dr, shown);
    const ov = overlapsOfSel();
    decals.length = 0; const live = new Set();
    for (const it of S.items) {
      if (hiddenInWalk(it)) continue;
      const d = defOf(it), y = itemY(it);
      if (d.wall && !shown[it.wall] && it.k !== DECAL) continue;   // oggetti appesi a una parete nascosta: si nascondono con lei
      if (it.k === DECAL) {
        live.add(it.id);
        const tex = getDecalTex(it);
        if (tex && (!d.wall || shown[it.wall])) decals.push({ tex, m: decalMatrix(it, d), alpha: 1 });
        if (it.id === S.sel && d.wall) {
          const c = cos(it.rot), s = sin(it.rot), t = 0.025, n = 0.012, yc = it.elev + d.h / 2;
          const bar = (ox, oy, sx, sy) => dr.push({ mesh: R.outline, m: M4.compose(it.x + c * ox + s * n, yc + oy, it.z - s * ox + c * n, it.rot, sx, sy, 0.006) });
          bar(0, d.h / 2 + t, d.w + 4 * t, t); bar(0, -d.h / 2 - t, d.w + 4 * t, t); bar(d.w / 2 + t, 0, t, d.h + 2 * t); bar(-d.w / 2 - t, 0, t, d.h + 2 * t);
          continue;
        }
        if (it.id !== S.sel) continue;
      } else {
        if (d.light) for (const l of d.light(d)) sceneLights.push({ p: M4.tp(M4.compose(it.x, y, it.z, it.rot), [l[0], l[1], l[2]]), c: [l[3], l[4], l[5]], r: l[6] });
        dr.push(Object.assign(itemDrawable(it.k, M4.compose(it.x, y, it.z, it.rot)), {
        cast: true,
        tint: it.id === S.sel ? [accLin[0], accLin[1], accLin[2], 0.14] : ov.has(it.id) ? [0.85, 0.08, 0.05, 0.4] : null,
      }));
      }
      if (d.hang && d.ropes) {
        const c = cos(it.rot), s = sin(it.rot);
        for (const [lx, lz] of d.ropes) {
          const md = modelFor(it.k), x = it.x + c * lx + s * lz, z = it.z - s * lx + c * lz, y0 = y + d.h + (md ? md.extraH : 0), len = roofH(z) - y0;
          if (len > 0.01) dr.push({ mesh: ROPE[d.ropeCol] || ROPE.steel, m: M4.compose(x, y0, z, 0, d.ropeR, len, d.ropeR), cast: true });
        }
      }
      if (it.id === S.sel) {
        const c = cos(it.rot), s = sin(it.rot), w = d.w + 0.08, dd = d.d + 0.08, th = 0.025;
        const yb = d.wall && !d.fixElev || d.hang ? floorTh(it.x, it.z) + 0.006 : y + 0.006;
        for (const [lx, lz, sx, sz] of [[0, dd / 2, w + th, th], [0, -dd / 2, w + th, th], [w / 2, 0, th, dd + th], [-w / 2, 0, th, dd + th]])
          dr.push({ mesh: R.outline, m: M4.compose(it.x + c * lx + s * lz, yb, it.z - s * lx + c * lz, it.rot, sx, 0.008, sz) });
      }
    }
    for (const [id, e] of decalTex) if (!live.has(id)) { eng.freeTex(e.tex); decalTex.delete(id); }
    if (walk) {
      const root = M4.compose(cam.walk[0], 0, cam.walk[2], PI - cam.wyaw);
      for (const [k, m] of KARATEKA.matrices(root, KARATEKA.pose(av.ph, av.w))) dr.push({ mesh: AV[k], m, cast: true });
    }
    measDraws(dr);
    return dr;
  }
  function draw() {
    const c = camMats();
    const draws = buildDraws(c.eye);
    const night = lightMode === 'night';
    if (night) {
      // luce di rimbalzo calda proporzionale alla potenza dei LED nella sala
      const sum = sceneLights.reduce((a, l) => [a[0] + l.c[0], a[1] + l.c[1], a[2] + l.c[2]], [0, 0, 0]), k = 0.55 / max(20, S.room.W * S.room.D) * 6;
      eng.setLighting({ sun: [0.05, 0.06, 0.1], skyUp: [0.03 + sum[0] * k * 0.8, 0.035 + sum[1] * k * 0.8, 0.055 + sum[2] * k * 0.8], skyDn: [0.02 + sum[0] * k, 0.02 + sum[1] * k, 0.025 + sum[2] * k], lights: mergedLights() });
    } else eng.setLighting({});
    eng.render({ draws, view: c.view, proj: c.proj, eye: c.eye, clear: night ? NIGHT_BG : clearCol, shadows: true, decals, room: [S.room.W, S.room.D, 0, 0] });
    lastVP = M4.mul(c.proj, c.view);
    placeWallLabels(); placeMeasLabel();
  }
  /* spostamento morbido della vista (usato dall'elenco) */
  let anim = null;
  const lerp = (a, b, t) => a + (b - a) * t;
  const angTo = (a, b) => { let d = (b - a) % (2 * PI); if (d > PI) d -= 2 * PI; if (d < -PI) d += 2 * PI; return a + d; };
  function animStep(now) {
    const t = clamp((now - anim.t0) / anim.ms, 0, 1), e = 1 - Math.pow(1 - t, 3), a = anim.a, b = anim.b;
    if (b.target) { cam.target = [0, 1, 2].map(i => lerp(a.target[i], b.target[i], e)); cam.dist = lerp(a.dist, b.dist, e); cam.pitch = lerp(a.pitch, b.pitch, e); if (b.yaw != null) cam.yaw = lerp(a.yaw, b.yaw, e); }
    if (b.walk) { cam.walk = [0, 1, 2].map(i => lerp(a.walk[i], b.walk[i], e)); cam.wyaw = lerp(a.wyaw, b.wyaw, e); cam.wpitch = lerp(a.wpitch, b.wpitch, e); }
    dirty = true;
    if (t >= 1) anim = null;
  }
  function flyTo(b) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const a = { target: cam.target.slice(), dist: cam.dist, pitch: cam.pitch, yaw: cam.yaw, walk: cam.walk.slice(), wyaw: cam.wyaw, wpitch: cam.wpitch };
    if (b.wyaw != null) b.wyaw = angTo(cam.wyaw, b.wyaw);
    if (b.yaw != null) b.yaw = angTo(cam.yaw, b.yaw);
    cam.auto = false;
    anim = { a, b, t0: performance.now(), ms: reduce ? 1 : 550 };
    dirty = true;
  }
  /* inquadra un attrezzo nella vista attuale */
  function focusItem(it) {
    const d = defOf(it), y = itemY(it), c = [it.x, y + d.h / 2, it.z], r = max(0.25, 0.5 * hypot(d.w, d.h, d.d));
    if (S.view === 'walk') {
      let dx = cam.walk[0] - it.x, dz = cam.walk[2] - it.z, l = hypot(dx, dz);
      if (l < 0.05) { dx = 0; dz = 1; l = 1; }
      const far = clamp(r * 2.6, 1.6, 6);
      const p = [clamp(it.x + dx / l * far, 0.4, S.room.W - 0.4), 1.65, clamp(it.z + dz / l * far, 0.4, S.room.D - 0.4)];
      const vx = it.x - p[0], vz = it.z - p[2];
      flyTo({ walk: p, wyaw: atan2(vx, -vz), wpitch: clamp(atan2(c[1] - 1.65, max(0.3, hypot(vx, vz))), -1.2, 1.2) });
    } else if (S.view === 'plan') {
      flyTo({ target: [it.x, 0, it.z], dist: clamp(r / sin(FOV_O / 2) * 2.4, 4, 60), pitch: cam.pitch });
    } else if (d.wall) {
      // di fronte alla parete, guardando dall'interno della sala
      const n = wallInfo(it.wall).n;
      flyTo({ target: c, dist: clamp(r / sin(FOV_O / 2) * 1.5, 2.6, 30), pitch: 0.22, yaw: atan2(n[0], n[2]) });
    } else {
      flyTo({ target: c, dist: clamp(r / sin(FOV_O / 2) * 1.7, 2.6, 40), pitch: clamp(cam.pitch, 0.35, 0.95) });
    }
  }
  /* camminare nella vista Interno: tastiera (WASD, frecce, Q/E) e pulsanti sullo schermo */
  const walkIn = { keys: new Set(), pad: new Set(), t: 0, goal: null };
  const av = { ph: 0, w: 0 };
  const WALK_KEYS = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'sl', KeyD: 'sr', ArrowLeft: 'l', ArrowRight: 'r', KeyQ: 'l', KeyE: 'r' };
  function walkActive() { return S.view === 'walk' && (walkIn.keys.size || walkIn.pad.size || walkIn.goal || av.w > 0.002); }
  function walkTick(now) {
    if (window.__salaCam) return;   // prove: posa ferma
    const dt = min(0.12, walkIn.t ? (now - walkIn.t) / 1000 : 0); walkIn.t = now;
    if (!dt) return;
    const on = d => [...walkIn.keys].some(k => WALK_KEYS[k] === d) || walkIn.pad.has(d);
    const fast = walkIn.keys.has('ShiftLeft') || walkIn.keys.has('ShiftRight') ? 2 : 1;
    let fwd = (on('f') ? 1 : 0) - (on('b') ? 1 : 0), side = (on('sr') ? 1 : 0) - (on('sl') ? 1 : 0), turn = (on('r') ? 1 : 0) - (on('l') ? 1 : 0);
    if (fwd || side || turn) walkIn.goal = null;
    else if (walkIn.goal) {   // doppio tocco: cammina fin lì girandosi verso il punto
      const gx = walkIn.goal[0] - cam.walk[0], gz = walkIn.goal[1] - cam.walk[2], gd = hypot(gx, gz);
      if (gd < 0.06) walkIn.goal = null;
      else {
        let da = atan2(gx, -gz) - cam.wyaw; da = ((da % (2 * PI)) + 3 * PI) % (2 * PI) - PI;
        turn = clamp(da * 4, -1.4, 1.4);
        fwd = abs(da) < 0.7 ? min(1, gd * 2.5) : 0;
      }
    }
    if (fwd || side || turn || walkIn.keys.size || walkIn.pad.size) { anim = null; cam.auto = false; }
    cam.wyaw += turn * 1.7 * dt;
    const sp = 1.45 * fast * dt, fx = sin(cam.wyaw), fz = -cos(cam.wyaw);
    const x0 = cam.walk[0], z0 = cam.walk[2];
    cam.walk[0] = clamp(x0 + (fx * fwd - fz * side) * sp, 0.4, S.room.W - 0.4);
    cam.walk[2] = clamp(z0 + (fz * fwd + fx * side) * sp, 0.4, S.room.D - 0.4);
    // passo del karateka: la fase avanza con la strada fatta (indietro va al contrario), un po' anche girandosi sul posto
    const dist = hypot(cam.walk[0] - x0, cam.walk[2] - z0), dirS = fwd < 0 ? -1 : 1;
    av.ph += dirS * dist / KARATEKA.STRIDE * 2 * PI + (dist < 1e-4 ? abs(turn) * dt * 3.2 : 0);
    const target = dist > 1e-4 ? (fast > 1 ? 1.25 : 1) : abs(turn) > 0.05 ? 0.45 : 0;
    av.w += (target - av.w) * min(1, dt * (target > av.w ? 7 : 5));
    if (av.w < 0.002 && !target) av.w = 0;
    dirty = true;
  }
  let curT = 0;
  function frame(now) {
    now = now || performance.now();
    if (walkActive()) walkTick(now); else walkIn.t = 0;
    if (curtainsMoving()) { curtainStep(min(0.1, curT ? (now - curT) / 1000 : 0.016)); curT = now; } else curT = 0;
    if (anim) animStep(now); if (dirty) { dirty = false; draw(); } requestAnimationFrame(frame);
  }
  function resize() {
    const dpr = min(window.devicePixelRatio || 1, 2), w = max(1, round(stage.clientWidth * dpr)), h = max(1, round(stage.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; if (cam.auto && S.view !== 'walk' && S.room) setView(S.view); }
    dirty = true;
  }
  function placeWallLabels() {
    const show = S.view !== 'walk', r = S.room, rc = [canvas.clientWidth, canvas.clientHeight];
    const pos = { A: [r.W / 2, 0.05, -0.55], B: [r.W + 0.55, 0.05, r.D / 2], C: [r.W / 2, 0.05, r.D + 0.55], D: [-0.55, 0.05, r.D / 2] };
    for (const k of WALL_KEYS) {
      const el = $('#wl-' + k), p = pos[k], m = lastVP;
      const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
      if (!show || w <= 0.01) { el.hidden = true; continue; }
      const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
      const sx = (x * 0.5 + 0.5) * rc[0], sy = (0.5 - y * 0.5) * rc[1];
      el.hidden = sx < 8 || sx > rc[0] - 8 || sy < 8 || sy > rc[1] - 8;
      el.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) translate(-50%,-50%)`;
    }
  }
  function itemDrawable(k, m) {
    const md = modelFor(k);
    return md ? { model: md.mdl, m: M4.mul(m, md.fit) } : { mesh: getMesh(k), m };
  }
  function makeThumb(k) {
    const d = DEF.get(k), S0 = 168;
    canvas.width = S0; canvas.height = S0;
    const rad = 0.5 * hypot(d.w, d.h, d.d), fov = 0.5, dist = rad / sin(fov / 2) * 1.02;
    const yaw = 0.62, pitch = 0.36, cp = cos(pitch), tg = [0, d.h / 2, 0];
    const eye = [tg[0] + dist * cp * sin(yaw), tg[1] + dist * sin(pitch), tg[2] + dist * cp * cos(yaw)];
    eng.render({ draws: [itemDrawable(k, IDENT)], view: M4.lookAt(eye, tg, [0, 1, 0]), proj: M4.persp(fov, 1, 0.05, 100), eye, clear: [0, 0, 0, 0], shadows: false });
    thumbs.set(k, canvas.toDataURL('image/png'));
  }
  function ensureThumbs() {
    let made = false;
    for (const k of DEF.keys()) if (!thumbs.has(k)) { makeThumb(k); made = true; }
    if (made) { canvas.width = 1; resize(); }
  }

  /* ---------------- azioni sugli attrezzi ---------------- */
  const selItem = () => S.items.find(i => i.id === S.sel) || null;
  function select(id) { if (S.sel === id) return; S.sel = id; ovDirty = true; dirty = true; updateSelbar(); }
  /* posizione iniziale: a parete sulla parete di fronte alla vista, a terra al centro della vista in un punto libero */
  function placeNew(it) {
    const d = defOf(it), walk = S.view === 'walk';
    if (d.wall) {
      const e = walk ? [-sin(cam.wyaw), 0, cos(cam.wyaw)] : [sin(cam.yaw), 0, cos(cam.yaw)];
      let bk = 'C', bv = -9;
      for (const key of WALL_KEYS) { const v = V3.dot(wallInfo(key).n, e); if (v > bv) { bv = v; bk = key; } }
      const wi = wallInfo(bk), hw = d.w / 2;
      // primo punto libero partendo dal centro della parete, alternando destra e sinistra (10 cm di distanza dagli altri)
      const busy = u => S.items.some(o => o !== it && o.wall === bk && abs(o.u - u) < hw + defOf(o).w / 2 + 0.1);
      let u = wi.len / 2;
      for (let k = 0; k <= 200; k++) {
        const c = wi.len / 2 + (k % 2 ? 1 : -1) * ceil(k / 2) * 0.1;
        if (c < hw || c > wi.len - hw) continue;
        if (!busy(c)) { u = c; break; }
      }
      placeOnWall(it, bk, u, it.k === DECAL ? max(0.1, 1.75 - d.h / 2) : (d.elev || 0));
      return;
    }
    if (walk) { it.x = cam.walk[0] + sin(cam.wyaw) * 3; it.z = cam.walk[2] - cos(cam.wyaw) * 3; it.rot = -cam.wyaw; }
    else { it.x = cam.target[0]; it.z = cam.target[2]; it.rot = round(cam.yaw / (PI / 2)) * PI / 2; }
    it.x = snap(it.x); it.z = snap(it.z); clampItem(it);
    if (it.k === DECAL) return;
    const bx = it.x, bz = it.z, free = () => { const A = obb(it, 0.2); return !S.items.some(o => { if (o === it || o.k === DECAL) return false; const B = obb(o); return !(A.y1 <= B.y0 + 0.005 || B.y1 <= A.y0 + 0.005) && sat(A, B) && sat(B, A); }); };
    search: for (let rad = 0; rad <= 5; rad += 0.5) for (let k = 0; k < (rad ? 12 : 1); k++) {
      it.x = snap(bx + rad * cos(k * PI / 6)); it.z = snap(bz + rad * sin(k * PI / 6)); clampItem(it);
      if (free()) break search;
      if (rad === 5 && k === 11) { it.x = bx; it.z = bz; clampItem(it); }
    }
  }
  function addItem(k, extra) {
    if (k !== DECAL && !DEF.get(k)) return;
    pushHist();
    const it = Object.assign({ id: newId(), k, x: 0, z: 0, rot: 0, elev: 0 }, extra || {});
    if (k !== DECAL) it.elev = DEF.get(k).elev || 0;
    placeNew(it);
    S.items.push(it); select(it.id); changed();
    if (isNarrow()) setPanelOpen(false);
  }
  function rotateSel(a) { const it = selItem(); if (!it || defOf(it).wall) return; pushHist(); it.rot = ((it.rot + a) % (2 * PI) + 2 * PI) % (2 * PI); clampItem(it); changed(); }
  function deleteSel() { const it = selItem(); if (!it) return; pushHist(); S.items = S.items.filter(i => i !== it); S.sel = null; changed(); }
  function duplicateSel() {
    const it = selItem(); if (!it) return; pushHist();
    const n = Object.assign({}, it, { id: newId() });
    if (defOf(it).wall) placeOnWall(n, it.wall, it.u + defOf(it).w + 0.05, it.elev);
    else { n.x += cos(it.rot) * (defOf(it).w + 0.1); n.z -= sin(it.rot) * (defOf(it).w + 0.1); clampItem(n); if (hypot(n.x - it.x, n.z - it.z) < 0.05) { n.z += 0.5; clampItem(n); } }
    S.items.push(n); select(n.id); changed();
  }
  function setElev(v) { const it = selItem(); if (!it) return; pushHist(); it.elev = max(0, v); clampItem(it); changed(); }

  /* ---------------- decorazioni: immagini e scritte su pareti e pavimento ----------------
     Ogni decorazione è un elemento della sala (k = 'decal') con i propri dati: l'immagine compressa è salvata nella sala,
     la scritta si ridisegna da testo, font e colori. La forma finale (con cornice o montatura a rotolo) dà il rapporto altezza/larghezza. */
  const DECAL = 'decal';
  const ROOM_LIMIT = 138000;
  const FONTS = {
    brush: { n: 'Pennello giapponese', f: '400 {px}px "Yuji Syuku", "Noto Serif JP", serif' },
    serif: { n: 'Serif giapponese', f: '700 {px}px "Noto Serif JP", serif' },
    sans: { n: 'Moderno', f: '700 {px}px "Archivo", system-ui, sans-serif' },
    cond: { n: 'Sportivo', f: '400 {px}px "Bebas Neue", "Archivo", sans-serif' },
  };
  const FRAMES = { none: 'Nessuna', gaku: 'Pannello giapponese orizzontale (gaku)', scroll: 'Rotolo giapponese verticale (kakejiku)', frame: 'Cornice nera con passe-partout', wood: 'Cornice in legno' };
  const HEX = /^#[0-9a-f]{6}$/i;
  function decalDef(it) {
    const wall = it.mount !== 'floor', hh = it.w * it.asp;
    const name = it.name || (it.type === 'txt' ? 'Scritta «' + (it.text.length > 18 ? it.text.slice(0, 17).trim() + '…' : it.text).replace(/\n/g, ' ') + '»' : 'Immagine');
    return { k: DECAL, name, cat: 'decor', w: it.w, d: wall ? 0.012 : hh, h: wall ? hh : 0.004, wall, flat: !wall, decal: true };
  }
  function cleanDecal(q) {
    const o = {
      type: q.type === 'txt' ? 'txt' : 'img', mount: q.mount === 'floor' ? 'floor' : 'wall',
      w: clamp(+q.w || 1, 0.05, 12), asp: clamp(+q.asp || 1, 0.02, 50), frame: FRAMES[q.frame] ? q.frame : 'none',
      name: typeof q.name === 'string' ? q.name.slice(0, 40) : '',
    };
    if (o.type === 'img') {
      if (typeof q.src !== 'string' || !/^data:image\/(webp|png|jpeg);base64,/.test(q.src) || q.src.length > 130000) return null;
      o.src = q.src;
    } else {
      const t = typeof q.text === 'string' ? q.text.slice(0, 300) : '';
      if (!t.trim()) return null;
      Object.assign(o, { text: t, font: FONTS[q.font] ? q.font : 'brush', color: HEX.test(q.color) ? q.color : '#1d1d1d', bg: HEX.test(q.bg) ? q.bg : '', vert: !!q.vert });
    }
    return o;
  }
  const decalKey = it => it.type === 'txt' ? [it.text, it.font, it.color, it.bg, it.vert ? 1 : 0, it.frame].join('\u0001') : it.frame + '\u0001' + it.src;
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = max(1, round(w)); c.height = max(1, round(h)); return c; };
  const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('Immagine non leggibile')); i.src = src; });
  async function textCanvas(it) {
    const F = FONTS[it.font] || FONTS.brush, lines = it.text.split('\n').slice(0, 10).map(l => l.trimEnd());
    const fontAt = px => F.f.replace('{px}', round(px));
    try { await Promise.race([document.fonts.load(fontAt(120), it.text), new Promise(r => setTimeout(r, 3500))]); } catch (e) { /* si usa il font di riserva */ }
    const m = mkCanvas(4, 4).getContext('2d');
    const layout = px => {
      m.font = fontAt(px);
      if (it.vert) {
        const cols = lines.map(l => [...l]), rows = max(1, ...cols.map(c => c.length));
        return { W: max(1, cols.length) * px * 1.25, H: rows * px * 1.08, cols };
      }
      return { W: max(px * 0.6, ...lines.map(l => m.measureText(l).width)), H: max(1, lines.length) * px * 1.28 };
    };
    let px = 140, L = layout(px), pad = it.bg ? px * 0.5 : px * 0.14;
    const sc = min(1, 1800 / (max(L.W, L.H) + 2 * pad));
    if (sc < 1) { px *= sc; L = layout(px); pad *= sc; }
    const c = mkCanvas(L.W + 2 * pad, L.H + 2 * pad), x = c.getContext('2d');
    if (it.bg) { x.fillStyle = it.bg; x.fillRect(0, 0, c.width, c.height); }
    x.fillStyle = it.color; x.font = fontAt(px); x.textAlign = 'center'; x.textBaseline = 'middle';
    if (it.vert) {
      // colonne da destra a sinistra, come nella scrittura giapponese
      L.cols.forEach((col, ci) => {
        const cx = c.width - pad - (ci + 0.5) * px * 1.25;
        col.forEach((ch, ri) => x.fillText(ch, cx, pad + (ri + 0.5) * px * 1.08));
      });
    } else lines.forEach((l, i) => x.fillText(l, c.width / 2, pad + (i + 0.5) * px * 1.28));
    return c;
  }
  async function imgCanvas(src) {
    const im = await loadImg(src), c = mkCanvas(im.naturalWidth || 512, im.naturalHeight || 512);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c;
  }
  function frameCanvas(b, frame) {
    const W = b.width, H = b.height, M = max(W, H);
    let c, x;
    if (frame === 'frame' || frame === 'wood') {
      const fb = round(M * 0.035), mat = frame === 'frame' ? round(M * 0.07) : 0, o = fb + mat;
      c = mkCanvas(W + 2 * o, H + 2 * o); x = c.getContext('2d');
      x.fillStyle = frame === 'frame' ? '#141414' : '#8a6238'; x.fillRect(0, 0, c.width, c.height);
      x.strokeStyle = frame === 'frame' ? '#3a3a3a' : '#b98d55'; x.lineWidth = max(1, fb * 0.18); x.strokeRect(fb * 0.3, fb * 0.3, c.width - fb * 0.6, c.height - fb * 0.6);
      if (mat) { x.fillStyle = '#f6f2e8'; x.fillRect(fb, fb, W + 2 * mat, H + 2 * mat); }
      x.drawImage(b, o, o);
    } else if (frame === 'gaku') {
      // pannello orizzontale: cornice in legno scuro, bordo in seta chiara, filetto dorato attorno al dipinto
      const fb = round(M * 0.028), silk = round(M * 0.065), gold = max(2, round(M * 0.006)), o = fb + silk;
      c = mkCanvas(W + 2 * o, H + 2 * o); x = c.getContext('2d');
      x.fillStyle = '#24170f'; x.fillRect(0, 0, c.width, c.height);
      x.strokeStyle = '#5a3f28'; x.lineWidth = max(1, fb * 0.2); x.strokeRect(fb * 0.35, fb * 0.35, c.width - fb * 0.7, c.height - fb * 0.7);
      x.fillStyle = '#ddd0b2'; x.fillRect(fb, fb, W + 2 * silk, H + 2 * silk);
      x.fillStyle = '#c9a650'; x.fillRect(o - gold, o - gold, W + 2 * gold, H + 2 * gold);
      x.drawImage(b, o, o);
    } else if (frame === 'scroll') {
      const side = round(W * 0.11), top = round(W * 0.42), bot = round(W * 0.26), band = max(2, round(W * 0.03));
      const knob = round(W * 0.05), rodT = max(3, round(W * 0.03)), rodB = max(4, round(W * 0.055)), cord = round(W * 0.12);
      const MW = W + 2 * side, x0 = knob, y0 = cord;
      c = mkCanvas(MW + 2 * knob, cord + top + H + bot + rodB); x = c.getContext('2d');
      x.strokeStyle = '#4a3a28'; x.lineWidth = max(2, W * 0.006);
      x.beginPath(); x.moveTo(x0 + MW * 0.3, y0); x.lineTo(c.width / 2, max(2, cord * 0.15)); x.lineTo(x0 + MW * 0.7, y0); x.stroke();
      x.fillStyle = '#ddd0b2'; x.fillRect(x0, y0, MW, top + H + bot);
      x.fillStyle = '#86704f'; x.fillRect(x0 + side * 0.42, y0 + top * 0.58, W + side * 1.16, H + top * 0.42 + bot * 0.46);
      x.fillStyle = '#c9a650'; x.fillRect(x0 + side, y0 + top - band, W, band); x.fillRect(x0 + side, y0 + top + H, W, band);
      x.fillStyle = '#86704f'; for (const f of [0.36, 0.64]) x.fillRect(x0 + MW * f - band * 0.6, y0, band * 1.2, top * 0.58);
      x.drawImage(b, x0 + side, y0 + top);
      x.fillStyle = '#2b1d14'; x.fillRect(x0 - knob * 0.2, y0 - rodT / 2, MW + knob * 0.4, rodT);
      x.fillRect(x0, y0 + top + H + bot, MW, rodB);
      x.fillStyle = '#17100a'; for (const kx of [0, c.width - knob]) x.fillRect(kx, y0 + top + H + bot - rodB * 0.15, knob, rodB * 1.3);
    } else c = b;
    if (max(c.width, c.height) > 2048) {   // limite di sicurezza per le texture
      const s = 2048 / max(c.width, c.height), d = mkCanvas(c.width * s, c.height * s);
      d.getContext('2d').drawImage(c, 0, 0, d.width, d.height); c = d;
    }
    return c;
  }
  async function composeDecal(it) { return frameCanvas(it.type === 'txt' ? await textCanvas(it) : await imgCanvas(it.src), it.frame); }
  const decalTex = new Map();
  function getDecalTex(it) {
    const key = decalKey(it); let e = decalTex.get(it.id);
    if (e && (e.key === key || e.loading === key)) return e.tex;
    e = { key: e ? e.key : '', tex: e ? e.tex : null, loading: key }; decalTex.set(it.id, e);
    composeDecal(it).then(cv => {
      const cur = decalTex.get(it.id); if (!cur || cur.loading !== key) return;
      if (cur.tex) eng.freeTex(cur.tex);
      cur.tex = eng.texture(cv); cur.key = key; cur.loading = null; dirty = true;
    }).catch(() => { const cur = decalTex.get(it.id); if (cur && cur.loading === key) { cur.loading = null; cur.key = key; } });
    return e.tex;
  }
  function decalMatrix(it, d) {
    const c = cos(it.rot), s = sin(it.rot);
    if (d.wall) return M4.compose(it.x, it.elev + d.h / 2, it.z, it.rot, d.w, d.h, 1);
    const y = floorTh(it.x, it.z) + 0.004, W = d.w, H = d.d;
    return new Float32Array([c * W, 0, -s * W, 0, -s * H, 0, -c * H, 0, 0, 1, 0, 0, it.x, y, it.z, 1]);
  }
  /* immagine scelta dall'utente → dati compressi che entrano nella sala condivisa */
  async function compressImage(file, budget) {
    const url = URL.createObjectURL(file);
    try {
      const im = await loadImg(url);
      const iw = im.naturalWidth || 800, ih = im.naturalHeight || 800;
      let maxD = 1100, q = 0.82;
      for (; ;) {
        const s = min(1, maxD / max(iw, ih)), c = mkCanvas(iw * s, ih * s), x = c.getContext('2d');
        x.drawImage(im, 0, 0, c.width, c.height);
        let alpha = false;
        try { const px = x.getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < px.length; i += 16) if (px[i] < 250) { alpha = true; break; } } catch (e) { alpha = true; }
        let src = c.toDataURL('image/webp', q);
        if (!src.startsWith('data:image/webp')) src = alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
        if (src.length <= budget) return { src, w: c.width, h: c.height };
        if (maxD <= 240) return null;
        maxD = round(maxD * 0.84); q = max(0.7, q - 0.03);
      }
    } finally { URL.revokeObjectURL(url); }
  }
  const usedBy = skip => snapshot().length - (skip && skip.src ? skip.src.length : 0);
  function openDecal(type, it) {
    const ed = !!it, cur = it || { type, mount: 'wall', frame: type === 'img' ? 'scroll' : 'none', w: type === 'img' ? 1.2 : 1.6, text: '', font: 'brush', color: '#1d1d1d', bg: '', vert: false, name: '' };
    const longSide = round(max(cur.w, cur.w * (cur.asp || 1)) * 100);
    const opt = (o, v) => Object.entries(o).map(([k, n]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(n.n || n)}</option>`).join('');
    const free = max(0, ROOM_LIMIT - usedBy(it));
    openModal(`<h2>${type === 'img' ? (ed ? 'Modifica immagine' : 'Immagine o dipinto') : (ed ? 'Modifica scritta' : 'Scritta')}</h2><form id="f-decal">
      ${type === 'img' ? `<div class="dc-file"><label class="btn" for="dc-file">${ed ? 'Cambia immagine' : 'Scegli immagine'}</label><input id="dc-file" type="file" accept="image/*"><span id="dc-fname">${ed ? 'Immagine attuale' : 'Nessuna immagine scelta'}</span></div>
        <label class="fld" for="dc-name"><span>Nome (facoltativo)</span><input id="dc-name" type="text" maxlength="40" value="${esc(cur.name || '')}" placeholder="Es. Drago e tigre"></label>`
      : `<label class="fld col" for="dc-text"><span>Testo (vai a capo per più righe)</span><textarea id="dc-text" rows="3" maxlength="300" placeholder="Es. 空手道 oppure il nome della palestra">${esc(cur.text || '')}</textarea></label>
        <div class="g3"><label class="fld" for="dc-font"><span>Carattere</span><select id="dc-font">${opt(FONTS, cur.font)}</select></label>
        <label class="fld" for="dc-color"><span>Colore</span><input id="dc-color" type="color" value="${cur.color}"></label>
        <label class="fld" for="dc-bgc"><span>Sfondo</span><input id="dc-bgc" type="color" value="${cur.bg || '#f4efe2'}"></label></div>
        <div class="row"><label class="chk" for="dc-bg"><input type="checkbox" id="dc-bg"${cur.bg ? ' checked' : ''}>Con sfondo</label><label class="chk" for="dc-vert"><input type="checkbox" id="dc-vert"${cur.vert ? ' checked' : ''}>Verticale (stile giapponese)</label></div>`}
      <div class="g3"><label class="fld" for="dc-mount"><span>Dove</span><select id="dc-mount"><option value="wall"${cur.mount === 'wall' ? ' selected' : ''}>Sulla parete</option><option value="floor"${cur.mount === 'floor' ? ' selected' : ''}>Sul pavimento</option></select></label>
      <label class="fld" for="dc-frame"><span>Montatura</span><select id="dc-frame">${opt(FRAMES, cur.frame)}</select></label>
      <label class="fld" for="dc-size"><span>Lato lungo</span><input id="dc-size" type="number" inputmode="decimal" min="10" max="1200" value="${longSide}" required><em>cm</em></label></div>
      <div class="dc-prev"><canvas id="dc-cv" width="10" height="10" aria-label="Anteprima"></canvas><span id="dc-info" class="mono"></span></div>
      ${type === 'img' ? `<p class="dc-note">Le immagini vengono compresse per stare nella sala condivisa (spazio libero circa ${round(free / 1000)} kB). Formati: JPG, PNG, WEBP, SVG.</p>` : ''}
      <div class="row"><button type="button" data-close>Annulla</button><button type="submit" class="primary" id="dc-ok">${ed ? 'Salva' : 'Aggiungi alla sala'}</button></div></form>`);
    let src = cur.src || '', asp = cur.asp || 1, token = 0, busy = false, frameSet = ed, sizeSet = ed;
    $('#dc-frame').addEventListener('change', () => { frameSet = true; });
    $('#dc-size').addEventListener('input', () => { sizeSet = true; });
    const val = () => {
      const d = { type, mount: $('#dc-mount').value, frame: $('#dc-frame').value };
      if (type === 'img') Object.assign(d, { src, name: $('#dc-name').value.trim() });
      else Object.assign(d, { text: $('#dc-text').value, font: $('#dc-font').value, color: $('#dc-color').value, bg: $('#dc-bg').checked ? $('#dc-bgc').value : '', vert: $('#dc-vert').checked });
      return d;
    };
    async function preview() {
      const t = ++token, d = val(), cv = $('#dc-cv');
      if ((type === 'img' && !src) || (type === 'txt' && !d.text.trim())) { cv.width = cv.height = 10; cv.getContext('2d').clearRect(0, 0, 10, 10); $('#dc-info').textContent = type === 'img' ? 'Scegli un\'immagine' : 'Scrivi il testo'; return; }
      try {
        const c = await composeDecal(d); if (t !== token || !cv.isConnected) return;
        asp = c.height / c.width;
        const s = min(1, 520 / max(c.width, c.height)); cv.width = max(1, round(c.width * s)); cv.height = max(1, round(c.height * s));
        cv.getContext('2d').drawImage(c, 0, 0, cv.width, cv.height);
        const L = (parseFloat(String($('#dc-size').value).replace(',', '.')) || 100) / 100, w = asp >= 1 ? L / asp : L;
        $('#dc-info').textContent = `${round(w * 100)} × ${round(w * asp * 100)} cm`;
      } catch (e) { if (t === token) $('#dc-info').textContent = 'Non riesco a leggere questa immagine.'; }
    }
    let pt = 0; const later = () => { clearTimeout(pt); pt = setTimeout(preview, 180); };
    $('#f-decal').addEventListener('input', e => { if (e.target.id !== 'dc-file') later(); });
    $('#f-decal').addEventListener('change', e => { if (e.target.id !== 'dc-file') later(); });
    if (type === 'img') $('#dc-file').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const budget = min(62000, ROOM_LIMIT - usedBy(it) - 3000);   // così nella sala ci stanno almeno due dipinti
      if (budget < 12000) { $('#dc-fname').textContent = 'Spazio esaurito: elimina un\'altra immagine dalla sala.'; return; }
      busy = true; $('#dc-ok').disabled = true; $('#dc-fname').textContent = 'Preparo l\'immagine…';
      try {
        const r = await compressImage(f, budget);
        if (!r) { $('#dc-fname').textContent = 'Immagine troppo pesante anche ridotta. Provane un\'altra.'; return; }
        src = r.src; $('#dc-fname').textContent = `${f.name.slice(0, 40)} · ${r.w}×${r.h} px`;
        const wide = r.w > r.h * 1.1;   // orizzontale: pannello gaku largo 3 m; verticale: rotolo alto 1,8 m
        if (!frameSet) $('#dc-frame').value = wide ? 'gaku' : 'scroll';
        if (!sizeSet) $('#dc-size').value = wide ? 300 : 180;
        if (!$('#dc-name').value.trim()) $('#dc-name').value = f.name.replace(/\.[^.]+$/, '').slice(0, 40);
        preview();
      } catch (err) { $('#dc-fname').textContent = 'Non riesco a leggere questa immagine. Prova un JPG o PNG.'; }
      finally { busy = false; $('#dc-ok').disabled = false; }
    });
    $('#f-decal').addEventListener('submit', async e => {
      e.preventDefault(); if (busy) return;
      const d = val();
      if (type === 'img' && !src) { toast('Scegli prima un\'immagine.'); return; }
      if (type === 'txt' && !d.text.trim()) { toast('Scrivi il testo da mostrare.'); return; }
      clearTimeout(pt); await preview();
      const L = clamp((parseFloat(String($('#dc-size').value).replace(',', '.')) || 100) / 100, 0.1, 12);
      d.asp = asp; d.w = asp >= 1 ? L / asp : L;
      const data = cleanDecal(d); if (!data) { toast('Dati della decorazione non validi.'); return; }
      closeModal();
      if (ed) {
        const live = S.items.find(i => i.id === it.id); if (!live) return;
        pushHist();
        const moved = live.mount !== data.mount;
        Object.assign(live, data);
        if (moved) { delete live.wall; delete live.u; placeNew(live); } else clampItem(live);
        if (snapshot().length > ROOM_LIMIT) { undo(); toast('Spazio della sala esaurito: elimina un\'immagine o usane una più piccola.', 6000); return; }
        select(live.id); changed();
      } else {
        addItem(DECAL, data);
        if (snapshot().length > ROOM_LIMIT) { undo(); toast('Spazio della sala esaurito: elimina un\'immagine o usane una più piccola.', 6000); }
      }
    });
    if (type === 'txt') $('#dc-text').focus();
    preview();
  }
  function resizeDecal(f) {
    const it = selItem(); if (!it || it.k !== DECAL) return;
    pushHist(); it.w = clamp(it.w * f, 0.05, 12); clampItem(it); changed();
  }

  /* ---------------- posizione esatta ---------------- */
  const CORNER = { A: 'D', B: 'A', C: 'D', D: 'A' };
  function openPos(it) {
    const d = defOf(it), num = (id, lab, v, unit = 'm', step = '0.01') => `<label class="fld" for="${id}"><span>${lab}</span><input id="${id}" type="number" inputmode="decimal" step="${step}" value="${v}"><em>${unit}</em></label>`;
    let body;
    if (d.wall) {
      body = `<label class="fld" for="ps-wall"><span>Parete</span><select id="ps-wall">${WALL_KEYS.map(k => `<option value="${k}"${it.wall === k ? ' selected' : ''}>Parete ${k}</option>`).join('')}</select></label>`
        + num('ps-u', `Distanza dall'angolo con la parete <b id="ps-cn">${CORNER[it.wall]}</b>`, +(it.u - d.w / 2).toFixed(2))
        + (d.fixElev ? '' : num('ps-e', 'Distanza da terra (bordo basso)', +it.elev.toFixed(2)));
    } else {
      const [hx, hz] = halfExt(it);
      body = num('ps-a', 'Distanza dalla parete A', +(it.z - hz).toFixed(2)) + num('ps-d', 'Distanza dalla parete D', +(it.x - hx).toFixed(2))
        + num('ps-r', 'Rotazione', round(((it.rot * 180 / PI) % 360 + 360) % 360), '°', '1') + (d.hang ? num('ps-e', 'Distanza da terra (bordo basso)', +it.elev.toFixed(2)) : '');
    }
    openModal(`<h2>Posizione esatta</h2><p>${esc(d.name)} · le distanze sono misurate dal bordo dell'oggetto.</p><form id="f-pos">${body}
      <div class="row"><button type="button" data-close>Annulla</button><button type="submit" class="primary">Applica</button></div></form>`);
    const ws = $('#ps-wall'); if (ws) ws.addEventListener('change', () => { $('#ps-cn').textContent = CORNER[ws.value]; });
    $('#f-pos').addEventListener('submit', e => {
      e.preventDefault();
      const v = id => { const el = $('#' + id); if (!el) return null; const n = parseFloat(String(el.value).replace(',', '.')); return isFinite(n) ? n : null; };
      const live = S.items.find(i => i.id === it.id); if (!live) { closeModal(); return; }
      pushHist();
      if (d.wall) placeOnWall(live, ws.value, max(0, v('ps-u') ?? 0) + d.w / 2, v('ps-e') ?? live.elev);
      else {
        if (v('ps-r') != null) live.rot = ((v('ps-r') % 360 + 360) % 360) * PI / 180;
        const [hx, hz] = halfExt(live);
        live.x = max(0, v('ps-d') ?? live.x - hx) + hx; live.z = max(0, v('ps-a') ?? live.z - hz) + hz;
        if (v('ps-e') != null) live.elev = max(0, v('ps-e'));
        clampItem(live);
      }
      closeModal(); changed(); focusItem(live);
    });
  }

  /* ---------------- metro ---------------- */
  const meas = { on: false, pts: [] };
  function setMeasure(on) {
    meas.on = on; meas.pts = [];
    $('#btn-meas').setAttribute('aria-pressed', String(on));
    canvas.classList.toggle('measuring', on);
    if (on) { select(null); toast('Metro: tocca due punti del pavimento. Tocca di nuovo Metro per uscire.', 5000); }
    else $('#meas-label').hidden = true;
    dirty = true;
  }
  function addMeasPoint(px, py) {
    const q = rayPlaneY(rayAt(px, py), 0.04); if (!q) return;
    const p = [clamp(round(q[0] * 100) / 100, 0, S.room.W), 0.045, clamp(round(q[2] * 100) / 100, 0, S.room.D)];
    if (meas.pts.length >= 2) meas.pts = [];
    meas.pts.push(p); dirty = true;
  }
  function measDraws(dr) {
    if (!meas.on) return;
    for (const p of meas.pts) dr.push({ mesh: R.outline, m: M4.compose(p[0], p[1] + 0.03, p[2], 0, 0.07, 0.06, 0.07) });
    if (meas.pts.length === 2) {
      const [a, b] = meas.pts, dx = b[0] - a[0], dz = b[2] - a[2], l = hypot(dx, dz);
      if (l > 0.005) dr.push({ mesh: R.outline, m: M4.compose((a[0] + b[0]) / 2, 0.06, (a[2] + b[2]) / 2, atan2(-dz, dx), l, 0.012, 0.025) });
    }
  }
  function placeMeasLabel() {
    const el = $('#meas-label');
    if (!meas.on || meas.pts.length < 2 || !lastVP) { el.hidden = true; return; }
    const [a, b] = meas.pts, m = lastVP, p = [(a[0] + b[0]) / 2, 0.08, (a[2] + b[2]) / 2];
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0.01) { el.hidden = true; return; }
    const x = (m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w, y = (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w;
    const dx = abs(b[0] - a[0]), dz = abs(b[2] - a[2]);
    el.textContent = `${fm(hypot(dx, dz))} m` + (dx > 0.05 && dz > 0.05 ? `  (${fm(dx)} × ${fm(dz)})` : '');
    el.style.transform = `translate(${((x * 0.5 + 0.5) * canvas.clientWidth).toFixed(1)}px,${((0.5 - y * 0.5) * canvas.clientHeight).toFixed(1)}px) translate(-50%,-140%)`;
    el.hidden = false;
  }

  /* ---------------- pavimento ---------------- */
  function paintAt(px, py, act) {
    const p = rayPlaneY(rayAt(px, py), 0.03);
    if (!p || p[0] < 0 || p[2] < 0 || p[0] >= S.room.W || p[2] >= S.room.D) return;
    const idx = floor(p[2]) * S.nx + floor(p[0]);
    if (S.cells[idx] === S.paint) return;
    if (act && !act.hist) { pushHist(); act.hist = true; }
    S.cells[idx] = S.paint; floorDirty = true; dirty = true; if (act) act.painted = true;
  }
  function fillFloor() { pushHist(); S.cells.fill(S.paint); floorDirty = true; changed(); toast('Tutta la sala: ' + FLOOR_BY.get(S.paint).name + '.'); }

  /* ---------------- modalità: guardare o modificare ----------------
     All'apertura si guarda soltanto: si gira attorno, si zooma, si misura. Per spostare, aggiungere o cambiare
     qualcosa si entra in Modifica (vale solo su questo dispositivo, non per gli altri). */
  var editing = false;   // var: letto anche da funzioni chiamate prima di questa riga
  const EDIT_ZONES = ['#room-dims', '#wall-cols', '#wall-presets', '#room-ops', '#room-add', '#cur-pat'];
  function setEditing(v) {
    editing = v;
    if (act && act.type !== 'pinch') finishAct();
    document.body.classList.toggle('editing', v);
    const b = $('#btn-edit');
    b.setAttribute('aria-pressed', String(v)); b.textContent = v ? 'Fine' : 'Modifica';
    b.title = v ? 'Torna a guardare: niente si sposta per sbaglio' : 'Entra in modifica per spostare, aggiungere o eliminare';
    for (const q of EDIT_ZONES) { const el = $(q); if (el) el.inert = !v; }
    canvas.classList.toggle('painting', v && S.tab === 'floor');
    updateSelbar(); updHist(); if (S.tab === 'list') renderList();
    dirty = true; ovDirty = true;
  }
  function needEdit(msg) {
    if (editing) return false;
    toast((msg || 'Per cambiare la sala') + ' tocca Modifica in alto.', 3200);
    const b = $('#btn-edit'); b.classList.remove('nudge'); void b.offsetWidth; b.classList.add('nudge');
    return true;
  }

  /* ---------------- puntatore ---------------- */
  const ptr = new Map(); let act = null, lastTap = { t: 0, x: 0, y: 0 };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    anim = null;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
    ptr.set(e.pointerId, { x: e.clientX, y: e.clientY });
    closeMenu();
    if (ptr.size === 2) {
      finishAct();
      const [a, b] = [...ptr.values()];
      act = { type: 'pinch', d: hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ang: atan2(b.y - a.y, b.x - a.x) };
      return;
    }
    if (ptr.size > 2) return;
    act = { type: 'orbit', x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, moved: false };
    if (e.button === 2 || e.button === 1 || e.shiftKey) { act.type = S.tab === 'floor' && !e.shiftKey && S.view !== 'plan' ? 'orbit' : 'pan'; return; }
    if (meas.on) { act.type = S.view === 'plan' ? 'pan' : 'orbit'; act.tap = true; act.meas = true; return; }
    if (!editing) {
      const hit = pickItem(e.clientX, e.clientY);
      act.type = S.view === 'plan' ? 'pan' : 'orbit'; act.tap = true; act.look = hit ? hit.it.id : null;
      return;
    }
    if (S.tab === 'floor') { act.type = 'paint'; paintAt(e.clientX, e.clientY, act); return; }
    const hit = pickItem(e.clientX, e.clientY);
    if (hit) {
      select(hit.it.id); act.type = 'item'; act.it = hit.it;
      const d = defOf(hit.it);
      if (d.wall) { const wh = wallHit(rayAt(e.clientX, e.clientY), hit.it.wall); act.key0 = hit.it.wall; act.du = wh && wh.key === hit.it.wall ? hit.it.u - wh.u : 0; act.dy = wh ? hit.it.elev - wh.y : -d.h / 2; }
      else { act.py = hit.point[1]; act.ox = hit.it.x - hit.point[0]; act.oz = hit.it.z - hit.point[2]; }
    } else { act.type = S.view === 'plan' ? 'pan' : 'orbit'; act.tap = true; }
  });
  canvas.addEventListener('pointermove', e => {
    const p = ptr.get(e.pointerId); if (!p || !act) return;
    p.x = e.clientX; p.y = e.clientY;
    if (act.type === 'pinch') {
      if (ptr.size < 2) return;
      const [a, b] = [...ptr.values()], d = hypot(a.x - b.x, a.y - b.y) || 1, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, ang = atan2(b.y - a.y, b.x - a.x);
      cam.auto = false; zoomBy(act.d / d, (d - act.d) * 0.012);
      if (S.view !== 'walk') {
        panBy(mx - act.mx, my - act.my);
        let da = ang - act.ang; if (da > PI) da -= 2 * PI; if (da < -PI) da += 2 * PI;
        cam.yaw += da;
      }
      act.d = d; act.mx = mx; act.my = my; act.ang = ang; dirty = true;
      return;
    }
    const dx = e.clientX - act.lx, dy = e.clientY - act.ly;
    if (!act.moved && hypot(e.clientX - act.x0, e.clientY - act.y0) < 5) return;
    act.moved = true; act.lx = e.clientX; act.ly = e.clientY;
    if (act.type === 'orbit') {
      cam.auto = false;
      if (S.view === 'walk') { cam.wyaw -= dx * 0.0045; cam.wpitch = clamp(cam.wpitch + dy * 0.0045, -1.3, 1.3); }
      else { cam.yaw -= dx * 0.0055; cam.pitch = clamp(cam.pitch + dy * 0.0055, 0.04, 1.5607); }
      dirty = true;
    } else if (act.type === 'pan') { cam.auto = false; panBy(dx, dy); dirty = true; }
    else if (act.type === 'paint') paintAt(e.clientX, e.clientY, act);
    else if (act.type === 'item') {
      const it = act.it, d = defOf(it), ray = rayAt(e.clientX, e.clientY);
      if (!act.hist) { pushHist(); act.hist = true; }
      if (d.wall) {
        const wh = wallHit(ray, it.wall);
        if (wh) placeOnWall(it, wh.key, snap(wh.u + (wh.key === act.key0 ? act.du : 0)), snap(wh.y + act.dy));
      } else {
        const q = rayPlaneY(ray, act.py);
        if (q) { it.x = snap(q[0] + act.ox); it.z = snap(q[2] + act.oz); clampItem(it); }
      }
      dirty = true; ovDirty = true; updateSelbar();
    }
  });
  function finishAct() {
    if (!act) return;
    if ((act.type === 'item' && act.hist) || (act.type === 'paint' && act.painted)) changed();
    act = null;
  }
  function pointerEnd(e) {
    if (!ptr.has(e.pointerId)) return;
    ptr.delete(e.pointerId);
    if (!act) return;
    if (act.type === 'pinch') { act = ptr.size ? { type: 'none' } : null; return; }
    if (act.meas && !act.moved && e.type === 'pointerup') addMeasPoint(e.clientX, e.clientY);
    else if (act.tap && !act.moved && e.type === 'pointerup') {
      const now = performance.now();
      if (S.view === 'walk' && now - lastTap.t < 380 && hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        const q = rayPlaneY(rayAt(e.clientX, e.clientY), 0.04);
        if (q) { walkIn.goal = [clamp(q[0], 0.4, S.room.W - 0.4), clamp(q[2], 0.4, S.room.D - 0.4)]; dirty = true; }
      } else {
        const ci = !act.look ? curtainAt(e.clientX, e.clientY) : -1;
        if (ci >= 0) toggleCurtain(ci); else select(act.look || null);
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    finishAct();
  }
  canvas.addEventListener('pointerup', pointerEnd);
  canvas.addEventListener('pointercancel', pointerEnd);
  canvas.addEventListener('wheel', e => { e.preventDefault(); anim = null; cam.auto = false; zoomBy(Math.exp(e.deltaY * 0.0012), -e.deltaY * 0.004); dirty = true; }, { passive: false });
  function zoomBy(f, walkStep) {
    if (S.view === 'walk') {
      cam.walk[0] = clamp(cam.walk[0] + sin(cam.wyaw) * walkStep, 0.4, S.room.W - 0.4);
      cam.walk[2] = clamp(cam.walk[2] - cos(cam.wyaw) * walkStep, 0.4, S.room.D - 0.4);
    } else cam.dist = clamp(cam.dist * f, 1.5, 90);
  }
  function panBy(dx, dy) {
    if (S.view === 'walk') return;
    const s = cam.dist * tan(FOV_O / 2) * 2 / (canvas.clientHeight || 1), cy = cos(cam.yaw), sy = sin(cam.yaw);
    const k = 1 / max(0.35, sin(cam.pitch));
    cam.target[0] = clamp(cam.target[0] - cy * dx * s - sy * dy * s * k, -4, S.room.W + 4);
    cam.target[2] = clamp(cam.target[2] + sy * dx * s - cy * dy * s * k, -4, S.room.D + 4);
  }
  window.addEventListener('keyup', e => { walkIn.keys.delete(e.code); });
  window.addEventListener('blur', () => { walkIn.keys.clear(); walkIn.pad.clear(); });
  window.addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName || '')) return;
    if (S.view === 'walk' && !e.ctrlKey && !e.metaKey && !e.altKey && (WALK_KEYS[e.code] || /^Shift/.test(e.code)) && $('#modal').hidden) {
      if (WALK_KEYS[e.code]) e.preventDefault();
      walkIn.keys.add(e.code); return;
    }
    if (e.key === 'Escape') { select(null); closeMenu(); closeModal(); if (meas.on) setMeasure(false); return; }
    if (!editing) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (selItem()) { e.preventDefault(); deleteSel(); } }
    else if (e.key === 'r' || e.key === 'R') rotateSel(e.shiftKey ? -PI / 12 : PI / 12);
    else if (e.key === 'd' || e.key === 'D') duplicateSel();
  });

  /* ---------------- interfaccia ---------------- */
  const isNarrow = () => window.matchMedia('(max-width: 859px)').matches;
  function setPanelOpen(v) { document.body.classList.toggle('panel-closed', !v); setTimeout(resize, 0); }
  function setTab(t) {
    const same = S.tab === t, closed = document.body.classList.contains('panel-closed');
    if (isNarrow() && same && !closed) { setPanelOpen(false); return; }
    S.tab = t; setPanelOpen(true);
    for (const b of document.querySelectorAll('#tabs button')) b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false');
    for (const p of document.querySelectorAll('.pane')) p.hidden = p.id !== 'pane-' + t;
    if (t === 'list') renderList();
    if (t === 'floor') { renderFloorInfo(); select(null); }
    if (t === 'room') renderRoomPane();
    canvas.classList.toggle('painting', editing && t === 'floor');
    dirty = true;
  }
  let toastT = 0;
  function toast(msg, ms = 4200) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, ms); }
  function closeMenu() { $('#menu').hidden = true; $('#btn-menu').setAttribute('aria-expanded', 'false'); }
  function openModal(html) { $('#modal-body').innerHTML = html; $('#modal').hidden = false; }
  function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }

  function renderCatalog() {
    ensureThumbs();
    const cats = [['tutti', 'Tutti']].concat(CATS);
    $('#cat-chips').innerHTML = cats.map(([id, n]) => `<button type="button" class="chip" data-cat="${id}" aria-pressed="${S.cat === id}">${esc(n)}</button>`).join('');
    const list = [...DEF.values()].filter(d => S.cat === 'tutti' || d.cat === S.cat);
    let h = '';
    if (S.cat === 'tutti' || S.cat === 'decor') h += `<button type="button" class="card deco" data-decal="img" title="Aggiungi un'immagine o un dipinto"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="16" y="6" width="32" height="52" rx="2" fill="#ddd0b2"/><rect x="21" y="18" width="22" height="28" fill="#f4efe2"/><path d="M23 40c4-6 7-9 10-6s5 2 8-5v15H23z" fill="#3b3a38"/><circle cx="36" cy="25" r="3" fill="#b8432f"/><rect x="13" y="56" width="38" height="4" rx="2" fill="#2b1d14"/><rect x="16" y="5" width="32" height="2.5" fill="#2b1d14"/></svg><span class="nm">Immagine o dipinto</span><span class="dm">tua immagine · parete o pavimento</span></button>`
      + `<button type="button" class="card deco" data-decal="txt" title="Aggiungi una scritta"><svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="10" width="44" height="44" rx="3" fill="#f4efe2"/><text x="32" y="44" text-anchor="middle" font-size="30" font-family="serif" fill="#1d1d1d">字</text></svg><span class="nm">Scritta</span><span class="dm">kanji, motto, nome · anche verticale</span></button>`;
    h += list.map(d => `<button type="button" class="card" data-add="${esc(d.k)}" title="Aggiungi alla sala">
      <img alt="" src="${thumbs.get(d.k) || ''}"><span class="nm">${esc(d.name)}</span>
      <span class="dm">${cm(d.w)}×${cm(d.d)}×${cm(d.h)} cm${d.wall ? ' · parete' : d.hang ? ' · appeso' : ''}</span>
      ${d.custom ? `<span class="del" data-delcustom="${esc(d.k)}" role="button" aria-label="Elimina ${esc(d.name)} dal catalogo">×</span>` : ''}</button>`).join('');
    if (S.cat === 'miei' || S.cat === 'tutti') h += `<button type="button" class="card new" id="btn-custom"><span class="plus">+</span><span class="nm">Nuovo attrezzo</span><span class="dm">con le tue misure</span></button>`;
    $('#cat-grid').innerHTML = h;
  }
  function renderFloorPalette() {
    $('#floor-pal').innerHTML = FLOORS.map(f => `<button type="button" class="sw" data-floor="${f.id}" aria-pressed="${S.paint === f.id}">
      <i style="background:${f.col}"></i><span>${esc(f.name)}</span></button>`).join('');
  }
  function floorStats() {
    const st = new Map(), W = S.room.W, D = S.room.D;
    for (let j = 0; j < S.nz; j++) for (let i = 0; i < S.nx; i++) {
      const id = S.cells[j * S.nx + i], a = (min(i + 1, W) - i) * (min(j + 1, D) - j);
      if (a <= 0.0004) continue;
      const s = st.get(id) || { n: 0, a: 0 }; s.n++; s.a += a; st.set(id, s);
    }
    return FLOORS.filter(f => st.has(f.id)).map(f => ({ f, n: st.get(f.id).n, a: st.get(f.id).a }));
  }
  function renderFloorInfo() {
    $('#floor-info').innerHTML = floorStats().map(s => `<li><i style="background:${s.f.col}"></i>${esc(s.f.name)}<b>${s.f.th ? s.n + ' pz · ' : ''}${fm(s.a, 1)} m²</b></li>`).join('');
  }
  const gkey = it => it.k === DECAL ? 'd' + it.id : it.k;
  function listRows(items, empty) {
    const g = new Map();
    for (const it of items) { const k = gkey(it), e = g.get(k); if (e) e.n++; else g.set(k, { it, n: 1 }); }
    const rows = [...g.entries()].map(([k, { it, n }]) => {
      const d = defOf(it), lab = n > 1 ? `Elimina un ${esc(d.name)} (ne restano ${n - 1})` : `Elimina ${esc(d.name)}`;
      const dims = it.k === DECAL ? `${cm(d.w)}×${cm(d.wall ? d.h : d.d)} cm · ${d.wall ? 'parete ' + it.wall : 'pavimento'}` : `${cm(d.w)}×${cm(d.d)}×${cm(d.h)} cm`;
      return `<li><button type="button" class="go" data-go="${esc(k)}" title="Mostra nella vista"><span>${esc(d.name)}<small>${dims}</small></span><b>× ${n}</b></button><button type="button" class="x" data-delk="${esc(k)}" aria-label="${lab}" title="${lab}">×</button></li>`;
    }).join('');
    return rows || (empty ? `<li class="empty">${empty}</li>` : '');
  }
  function renderList() {
    const eq = S.items.filter(i => i.k !== DECAL), dc = S.items.filter(i => i.k === DECAL);
    $('#list-items').innerHTML = listRows(eq, 'Nessun attrezzo nella sala. Aprine uno dal catalogo.');
    $('#list-decor').innerHTML = listRows(dc, '');
    $('#h-decor').hidden = $('#list-decor').hidden = !dc.length;
    $('#list-floor').innerHTML = floorStats().map(s => `<li><span><i style="background:${s.f.col}"></i>${esc(s.f.name)}${s.f.th ? `<small>piastrelle 1×1 m, ${cm(s.f.th)} cm</small>` : ''}</span><b>${s.f.th ? s.n + ' pz · ' : ''}${fm(s.a, 1)} m²</b></li>`).join('');
    $('#list-tot').textContent = `${eq.length} attrezzi${dc.length ? ' · ' + dc.length + ' decorazioni' : ''} · sala ${fm(S.room.W, 1)} × ${fm(S.room.D, 1)} m (${fm(S.room.W * S.room.D, 1)} m²)`;
  }
  function listText() {
    const g = new Map();
    for (const it of S.items) if (it.k !== DECAL) { const d = defOf(it); g.set(d.name, (g.get(d.name) || 0) + 1); }
    let t = `SALA ${fm(S.room.W, 1)} × ${fm(S.room.D, 1)} m\n\nATTREZZI\n`;
    for (const [n, q] of g) t += `- ${q} × ${n}\n`;
    const dc = S.items.filter(i => i.k === DECAL);
    if (dc.length) { t += '\nDECORAZIONI\n'; for (const it of dc) { const d = defOf(it); t += `- ${d.name}: ${cm(d.w)}×${cm(d.wall ? d.h : d.d)} cm, ${d.wall ? 'parete ' + it.wall : 'pavimento'}\n`; } }
    t += '\nPAVIMENTO\n';
    for (const s of floorStats()) t += `- ${s.f.name}: ${s.f.th ? s.n + ' piastrelle, ' : ''}${fm(s.a, 1)} m²\n`;
    return t;
  }
  const WALL_NAMES = { A: 'A', B: 'B', C: 'C', D: 'D' };
  function renderRoomPane() {
    const r = S.room;
    const num = (id, lab, v, mn, mx) => `<label class="fld" for="${id}"><span>${lab}</span><input id="${id}" type="number" inputmode="decimal" step="0.05" min="${mn}" max="${mx}" value="${+v.toFixed(2)}"><em>m</em></label>`;
    $('#room-dims').innerHTML = num('rm-W', 'Larghezza (pareti A e C)', r.W, 3, 40) + num('rm-D', 'Profondità (pareti B e D)', r.D, 3, 40)
      + num('rm-hLow', 'Altezza lato parete A', r.hLow, 2.2, 12) + num('rm-hHigh', 'Altezza lato parete C', r.hHigh, 2.2, 15);
    $('#rm-roof').checked = S.showRoof;
    $('#cur-pat').innerHTML = `<label class="fld col" for="cp-sel"><span>Fantasia delle tende</span><select id="cp-sel">${CUR_PATS.map(([k, n]) => `<option value="${k}"${r.curPat === k ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
    { const ws = r.openings.filter(o => o.t === 'win'); $('#btn-curall').textContent = ws.length && ws.every(o => o.cur) ? 'Togli le tende' : 'Tende nere a tutte le finestre'; }
    const cols = r.cols || {};
    $('#wall-cols').innerHTML = WALL_KEYS.map(k => `<label class="wc" for="wc-${k}"><input type="color" id="wc-${k}" data-wall="${k}" value="${cols[k] || WALL_COL}"><span>Parete ${k}</span></label>`).join('');
    $('#wall-presets').innerHTML = WALL_PRESETS.map(([n, c]) => `<button type="button" class="chip pc" data-wcol="${c}" title="Tutte le pareti: ${esc(n)}"><i style="background:${c}"></i>${esc(n)}</button>`).join('');
    $('#room-ops').innerHTML = r.openings.map((o, i) => `<div class="op" data-i="${i}">
      <div class="op-h"><select id="op-t-${i}" data-f="t" aria-label="Tipo"><option value="win"${o.t === 'win' ? ' selected' : ''}>Finestra</option><option value="door"${o.t === 'door' ? ' selected' : ''}>Portone</option><option value="pass"${o.t === 'pass' ? ' selected' : ''}>Passaggio aperto</option></select>
      <select id="op-w-${i}" data-f="wall" aria-label="Parete">${WALL_KEYS.map(k => `<option value="${k}"${o.wall === k ? ' selected' : ''}>Parete ${k}</option>`).join('')}</select>
      <button type="button" class="ic" data-opdel="${i}" aria-label="Elimina apertura">×</button></div>
      <div class="op-g">
      <label for="op-u-${i}">Dall'angolo<input id="op-u-${i}" data-f="u" type="number" inputmode="decimal" step="0.05" value="${+o.u.toFixed(2)}"></label>
      <label for="op-l-${i}">Larghezza<input id="op-l-${i}" data-f="w" type="number" inputmode="decimal" step="0.05" value="${+o.w.toFixed(2)}"></label>
      <label for="op-s-${i}">Da terra<input id="op-s-${i}" data-f="sill" type="number" inputmode="decimal" step="0.05" value="${+o.sill.toFixed(2)}"${o.t !== 'win' ? ' disabled' : ''}></label>
      <label for="op-h-${i}">Altezza<input id="op-h-${i}" data-f="h" type="number" inputmode="decimal" step="0.05" value="${+o.h.toFixed(2)}"></label></div>${o.t === 'win' ? `
      <label class="chk" for="op-c-${i}"><input type="checkbox" id="op-c-${i}" data-f="cur"${o.cur ? ' checked' : ''}>Tenda nera (si apre e chiude toccandola)</label>` : ''}</div>`).join('');
  }
  function applyRoom(mut) {
    if (needEdit()) { renderRoomPane(); return; }
    pushHist();
    const next = JSON.parse(JSON.stringify(S.room)); mut(next);
    const oNx = S.nx, oNz = S.nz, oCells = S.cells;
    S.room = sanitizeRoom(next);
    resizeFloor(oNx, oNz, oCells);
    for (const it of S.items) clampItem(it);
    buildRoom(); floorDirty = true; renderRoomPane(); changed();
  }
  function selH() { const bar = $('#selbar'); document.body.style.setProperty('--selh', bar.hidden ? '0px' : bar.offsetHeight + 10 + 'px'); }
  function updateSelbar() {
    const it = selItem(), bar = $('#selbar');
    if (!it) { bar.hidden = true; selH(); return; }
    const d = defOf(it), r = S.room, dec = it.k === DECAL;
    const dims = dec ? `${cm(d.w)}×${cm(d.wall ? d.h : d.d)} cm` : `${cm(d.w)}×${cm(d.d)}×${cm(d.h)} cm`;
    let h = `<div class="sb-top"><strong>${esc(d.name)}</strong><span class="mono">${dims}</span></div>`;
    if (!editing) { bar.innerHTML = h + `<div class="sb-view">Per spostarlo o modificarlo tocca <b>Modifica</b> in alto.</div>`; bar.hidden = false; selH(); return; }
    h += `<div class="sb-btn">`;
    if (!d.wall) h += `<button type="button" data-act="rl" aria-label="Ruota di 15 gradi a sinistra">↺ 15°</button><button type="button" data-act="rr" aria-label="Ruota di 15 gradi a destra">↻ 15°</button><button type="button" data-act="r90">90°</button>`;
    if (dec) h += `<button type="button" data-act="sz-" aria-label="Più piccola del 10%">− 10%</button><button type="button" data-act="sz+" aria-label="Più grande del 10%">+ 10%</button>`;
    if (dec || d.custom) h += `<button type="button" data-act="edit">Modifica</button>`;
    h += `<button type="button" data-act="dup">Duplica</button><button type="button" data-act="del" class="danger">Elimina</button></div>`;
    if (d.hang || (d.wall && !d.fixElev)) h += `<div class="sb-el"><span>Da terra</span><button type="button" data-act="e-" aria-label="Abbassa di 5 cm">−</button><b class="mono">${fm(it.elev)} m</b><button type="button" data-act="e+" aria-label="Alza di 5 cm">+</button></div>`;
    h += `<button type="button" class="sb-ds mono" data-act="pos" title="Inserisci la posizione esatta">`;
    if (d.wall) h += `<span>Parete ${it.wall}</span><span>dall'angolo con ${CORNER[it.wall]} ${fm(it.u - d.w / 2)} m</span>`;
    else {
      const [hx, hz] = halfExt(it);
      h += `<span>A ${fm(max(0, it.z - hz))}</span><span>B ${fm(max(0, r.W - it.x - hx))}</span><span>C ${fm(max(0, r.D - it.z - hz))}</span><span>D ${fm(max(0, it.x - hx))}</span><em>m dalle pareti</em>`;
    }
    h += `<em class="ed">Posizione esatta</em></button>`;
    if (overlapsOfSel().size) h += `<div class="sb-warn">Si sovrappone a un altro attrezzo (in rosso).</div>`;
    bar.innerHTML = h; bar.hidden = false; selH();
  }

  /* ---------------- eventi interfaccia ---------------- */
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
  $('#views').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); });
  $('#cat-chips').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { S.cat = b.dataset.cat; renderCatalog(); } });
  $('#cat-grid').addEventListener('click', e => {
    const del = e.target.closest('[data-delcustom]');
    if (del && needEdit('Per eliminare un attrezzo tuo')) { e.stopPropagation(); return; }
    if (del) {
      e.stopPropagation(); pushHist();
      const id = del.dataset.delcustom;
      S.custom = S.custom.filter(c => c.id !== id); S.items = S.items.filter(i => i.k !== id);
      if (!selItem()) S.sel = null;
      syncCustomDefs(); renderCatalog(); changed(); return;
    }
    if (!e.target.closest('[data-add],[data-decal],#btn-custom')) return;
    if (needEdit('Per aggiungere qualcosa')) return;
    if (e.target.closest('#btn-custom')) { openCustom(); return; }
    const dk = e.target.closest('[data-decal]'); if (dk) { openDecal(dk.dataset.decal); return; }
    const b = e.target.closest('[data-add]'); if (b) addItem(b.dataset.add);
  });
  $('#floor-pal').addEventListener('click', e => { const b = e.target.closest('[data-floor]'); if (b) { S.paint = b.dataset.floor; renderFloorPalette(); } });
  $('#btn-fill').addEventListener('click', () => { if (!needEdit('Per cambiare il pavimento')) fillFloor(); });
  $('#btn-plan').addEventListener('click', () => setView('plan'));
  $('#selbar').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b || !editing) return;
    const a = b.dataset.act, it = selItem();
    if (a === 'rl') rotateSel(PI / 12); else if (a === 'rr') rotateSel(-PI / 12); else if (a === 'r90') rotateSel(PI / 2);
    else if (a === 'dup') duplicateSel(); else if (a === 'del') deleteSel();
    else if (a === 'e-' && it) setElev(snap(it.elev - 0.05)); else if (a === 'e+' && it) setElev(snap(it.elev + 0.05));
    else if (a === 'sz-') resizeDecal(1 / 1.1); else if (a === 'sz+') resizeDecal(1.1);
    else if (a === 'pos' && it) openPos(it);
    else if (a === 'edit' && it) { if (it.k === DECAL) openDecal(it.type, it); else { const c = S.custom.find(c => c.id === it.k); if (c) openCustom(c); } }
  });
  $('#btn-meas').addEventListener('click', () => setMeasure(!meas.on));
  $('#btn-edit').addEventListener('click', () => setEditing(!editing));
  $('#btn-light').addEventListener('click', () => setLightMode(lightMode === 'night' ? 'day' : 'night'));
  {
    const pad = $('#walkpad');
    const stop = e => { const b = e.target.closest('[data-mv]'); if (b) { walkIn.pad.delete(b.dataset.mv); b.classList.remove('on'); } };
    pad.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-mv]'); if (!b) return;
      e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (_) { }
      walkIn.pad.add(b.dataset.mv); b.classList.add('on');
    });
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(ev, stop);
    pad.addEventListener('contextmenu', e => e.preventDefault());
  }
  /* elenco: tocco sulla riga = inquadra (con più pezzi uguali, ogni tocco il successivo); X = elimina uno */
  let goIdx = { k: '', i: -1 };
  $('#pane-list').addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g) {
      const k = g.dataset.go, all = S.items.filter(i => gkey(i) === k);
      if (!all.length) return;
      const sel = selItem();
      const i = goIdx.k === k ? (goIdx.i + 1) % all.length : sel && gkey(sel) === k ? all.indexOf(sel) : 0;
      goIdx = { k, i };
      const it = all[i];
      select(it.id); focusItem(it);
      if (isNarrow()) setPanelOpen(false);   // sul telefono la vista prende tutto lo spazio, così l'oggetto non resta coperto
      if (all.length > 1) toast(`${defOf(it).name}: ${i + 1} di ${all.length}. Tocca di nuovo per il successivo.`, 2600);
      return;
    }
    const b = e.target.closest('[data-delk]'); if (!b || needEdit('Per eliminare')) return;
    const k = b.dataset.delk, sel = selItem();
    const it = sel && gkey(sel) === k ? sel : [...S.items].reverse().find(i => gkey(i) === k);
    if (!it) return;
    const name = defOf(it).name;
    pushHist();
    S.items = S.items.filter(i => i !== it);
    if (S.sel === it.id) S.sel = null;
    changed();
    toast(`Eliminato: ${name}. Con ↶ lo ripristini.`);
    const next = $('#pane-list [data-delk="' + k + '"]') || $('#pane-list [data-delk]');
    if (next) next.focus();
  });
  $('#btn-undo').addEventListener('click', undo); $('#btn-redo').addEventListener('click', redo);
  $('#btn-menu').addEventListener('click', e => { e.stopPropagation(); const m = $('#menu'); m.hidden = !m.hidden; $('#btn-menu').setAttribute('aria-expanded', String(!m.hidden)); });
  $('#menu').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return; closeMenu();
    const m = b.dataset.m;
    if (m === 'gfx') { try { localStorage.setItem('sala3d.gfx', gfx === 'hq' ? 'low' : 'hq'); } catch (e) { /* senza archivio resta com'è */ } doUpdate(); return; }
    if (m === 'share') shareLink(); else if (m === 'copy') copyRoom(); else if (m === 'export') exportFile(); else if (m === 'photo') savePhoto();
    else if ((m === 'clear' || m === 'example' || m === 'import') && needEdit()) return;
    else if (m === 'import') openImport();
    else if (m === 'clear') { pushHist(); S.items = []; S.sel = null; changed(); toast('Sala svuotata. Con Annulla torni indietro.'); }
    else if (m === 'example') { pushHist(); restore(exampleProject()); afterBigChange(); setView(S.view, false); }
    else if (m === 'curtains') {
      const ws = S.room.openings.filter(o => o.t === 'win' && o.cur);
      if (!ws.length) { toast('Non ci sono tende. Si aggiungono in Sala, sotto Finestre e portone.'); return; }
      const v = ws.some(o => o.cl > 0.5) ? 0 : 1;
      for (const o of ws) o.cl = v;
      changed(); dirty = true; toast(v ? 'Tende chiuse.' : 'Tende aperte.', 2000);
    }
    else if (m === 'help') openHelp();
  });
  $('#room-dims').addEventListener('change', e => {
    const k = e.target.id.replace('rm-', ''), v = parseFloat(String(e.target.value).replace(',', '.'));
    if (!isFinite(v)) { renderRoomPane(); return; }
    applyRoom(r => { r[k] = v; });
    if (S.view !== 'walk') setView(S.view);
  });
  $('#wall-cols').addEventListener('change', e => {
    const k = e.target.dataset.wall; if (!k) return;
    applyRoom(r => { r.cols = Object.assign({}, r.cols, { [k]: e.target.value }); });
  });
  $('#wall-presets').addEventListener('click', e => {
    const b = e.target.closest('[data-wcol]'); if (!b) return;
    const c = b.dataset.wcol;
    applyRoom(r => { r.cols = c === WALL_COL ? {} : { A: c, B: c, C: c, D: c }; });
  });
  $('#rm-roof').addEventListener('change', e => { S.showRoof = e.target.checked; try { localStorage.setItem('sala3d.prefs', JSON.stringify({ showRoof: S.showRoof })); } catch (_) { } dirty = true; });
  $('#room-ops').addEventListener('change', e => {
    const row = e.target.closest('.op'), f = e.target.dataset.f; if (!row || !f) return;
    const i = +row.dataset.i, raw = e.target.value;
    applyRoom(r => { const o = r.openings[i]; if (!o) return; if (f === 'cur') { o.cur = e.target.checked; o.cl = 1; return; } if (f === 't' || f === 'wall') o[f] = raw; else { const v = parseFloat(String(raw).replace(',', '.')); if (isFinite(v)) o[f] = v; } if (o.t !== 'win') o.sill = 0; });
  });
  $('#room-ops').addEventListener('click', e => { const b = e.target.closest('[data-opdel]'); if (b) applyRoom(r => { r.openings.splice(+b.dataset.opdel, 1); }); });
  $('#cur-pat').addEventListener('change', e => { const v = e.target.value; applyRoom(r => { r.curPat = v; }); });
  $('#btn-curall').addEventListener('click', () => {
    const wins = S.room.openings.filter(o => o.t === 'win'), all = wins.length && wins.every(o => o.cur);
    applyRoom(r => { for (const o of r.openings) if (o.t === 'win') { o.cur = !all; o.cl = 1; } });
  });
  $('#btn-addwin').addEventListener('click', () => applyRoom(r => { r.openings.push({ t: 'win', wall: 'C', u: 1, w: 2, sill: 1.1, h: 1.5 }); }));
  $('#btn-adddoor').addEventListener('click', () => applyRoom(r => { r.openings.push({ t: 'door', wall: 'D', u: 1, w: 1, sill: 0, h: 2.1 }); }));
  $('#btn-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(listText()); toast('Elenco copiato.'); }
    catch (e) { openModal(`<h2>Elenco</h2><p>Seleziona il testo e copialo.</p><textarea id="ta-list" rows="12" readonly>${esc(listText())}</textarea><div class="row"><button type="button" data-close>Chiudi</button></div>`); }
  });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('click', e => { if (!e.target.closest('#menu') && !e.target.closest('#btn-menu')) closeMenu(); });

  function openCustom(c0) {
    const c = c0 || { name: '', w: 1, d: 0.5, h: 1, shape: 'box', wall: false, color: '#3a6ea5' };
    openModal(`<h2>${c0 ? 'Modifica attrezzo' : 'Nuovo attrezzo'}</h2><form id="f-custom">
      <label class="fld" for="cu-name"><span>Nome</span><input id="cu-name" type="text" maxlength="40" required placeholder="Es. Rastrelliera bastoni" value="${esc(c.name)}"></label>
      <div class="g3"><label class="fld" for="cu-w"><span>Larghezza</span><input id="cu-w" type="number" inputmode="decimal" min="1" max="1000" value="${cm(c.w)}" required><em>cm</em></label>
      <label class="fld" for="cu-d"><span>Profondità</span><input id="cu-d" type="number" inputmode="decimal" min="1" max="1000" value="${cm(c.d)}" required><em>cm</em></label>
      <label class="fld" for="cu-h"><span>Altezza</span><input id="cu-h" type="number" inputmode="decimal" min="1" max="600" value="${cm(c.h)}" required><em>cm</em></label></div>
      <div class="g3"><label class="fld" for="cu-shape"><span>Forma</span><select id="cu-shape"><option value="box">Parallelepipedo</option><option value="cyl"${c.shape === 'cyl' ? ' selected' : ''}>Cilindro</option></select></label>
      <label class="fld" for="cu-mount"><span>Posizione</span><select id="cu-mount"><option value="floor">A terra</option><option value="wall"${c.wall ? ' selected' : ''}>A parete</option></select></label>
      <label class="fld" for="cu-col"><span>Colore</span><input id="cu-col" type="color" value="${c.color}"></label></div>
      <div class="row"><button type="button" data-close>Annulla</button><button type="submit" class="primary">${c0 ? 'Salva' : 'Aggiungi alla sala'}</button></div></form>`);
    $('#f-custom').addEventListener('submit', e => {
      e.preventDefault();
      const v = id => parseFloat(String($('#' + id).value).replace(',', '.')) / 100;
      const vals = { name: $('#cu-name').value.trim() || 'Attrezzo', w: clamp(v('cu-w') || 1, 0.05, 10), d: clamp(v('cu-d') || 0.5, 0.05, 10), h: clamp(v('cu-h') || 1, 0.01, 6), color: $('#cu-col').value, shape: $('#cu-shape').value, wall: $('#cu-mount').value === 'wall' };
      closeModal();
      if (c0) {
        pushHist();
        const wasWall = c0.wall;
        S.custom = S.custom.map(x => x.id === c0.id ? Object.assign({ id: c0.id }, vals) : x);
        syncCustomDefs();
        for (const it of S.items) if (it.k === c0.id) { if (wasWall !== vals.wall) { delete it.wall; delete it.u; placeNew(it); } else clampItem(it); }
        renderCatalog(); changed(); return;
      }
      const nc = Object.assign({ id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36) }, vals);
      pushHist(); S.custom.push(nc); syncCustomDefs(); S.cat = 'miei'; renderCatalog(); undoSt.pop(); addItem(nc.id);
    });
    $('#cu-name').focus();
  }
  function openHelp() {
    openModal(`<h2>Come si usa</h2><ul class="help">
      <li><b>Guardare o modificare</b> All'apertura puoi solo guardare: giri attorno, zoomi e misuri senza spostare niente per sbaglio. Tocca <b>Modifica</b> in alto per spostare, aggiungere o eliminare, e <b>Fine</b> quando hai finito. Vale solo sul tuo dispositivo.</li>
      <li><b>Aggiungere</b> In modifica, apri Attrezzi e tocca una scheda: l'attrezzo compare al centro della vista.</li>
      <li><b>Spostare</b> Trascina l'attrezzo. Quelli a parete scorrono lungo i muri e si alzano o abbassano; quelli appesi arrivano fino al tetto.</li>
      <li><b>Vista</b> Un dito o tasto sinistro per ruotare, due dita o rotellina per lo zoom, due dita o tasto destro per spostarti.</li>
      <li><b>Decorazioni</b> In Attrezzi, Decorazioni: aggiungi un'immagine (anche montata come rotolo giapponese) o una scritta, su una parete o sul pavimento. Si spostano trascinandole come gli attrezzi.</li>
      <li><b>Posizione esatta</b> Seleziona un oggetto e tocca la riga delle distanze per scrivere le misure precise.</li>
      <li><b>Metro</b> Tocca Metro in alto e poi due punti del pavimento per misurare una distanza.</li>
      <li><b>Pavimento</b> Scegli un materiale e tocca o trascina sulle piastrelle da 1×1 m. In Pianta è più comodo.</li>
      <li><b>Interno</b> Guidi un karateka e lo segui alle sue spalle. Dal computer cammini con W A S D o con le frecce (← → per girarti, Q ed E anche, Maiuscolo per andare più veloce). Dal telefono usa le frecce in basso a sinistra. Trascina per guardarti intorno; doppio tocco sul pavimento e ci va camminando.</li>
      <li><b>Insieme</b> Menu, Condividi: chi apre il link modifica questa stessa sala, senza account. Le modifiche arrivano in un paio di secondi.</li>
      <li><b>Tastiera</b> In modifica: R ruota, D duplica, Canc elimina, Ctrl+Z annulla.</li>
      <li><b>Giorno e sera</b> Il pulsante sotto 3D / Pianta / Interno passa dalla luce del sole alla sera, con la sala illuminata solo da LED e lanterne (categoria Luci LED negli Attrezzi). Vale solo sul tuo dispositivo.</li>
      <li><b>Tende</b> In Sala, sotto Finestre e portone, metti una tenda nera alle finestre che vuoi. Poi toccala nella vista per aprirla o chiuderla (anche senza Modifica), oppure Menu, Apri / chiudi le tende.</li>
      <li><b>Sala</b> Correggi dimensioni, finestre e portone (quelle iniziali sono stimate dalle foto) e scegli il colore di ogni parete.</li>
      <li><b>Modelli 3D</b> Con la grafica realistica alcuni attrezzi e arredi usano modelli 3D veri presi da Sketchfab, con licenza CC BY 4.0. Autori: sousinho, carlaspalomo, plaggy, benchk, vulcanstrength, akio_illu, tboiston, AllQuad. <a href="https://github.com/alessandrop95/sala-3d/blob/main/models/CREDITS.md" target="_blank" rel="noopener">Titoli e link ai modelli</a>.</li></ul>
      <div class="row"><button type="button" class="primary" data-close>Ho capito</button></div>`);
  }
  function exportFile() {
    const json = JSON.stringify(JSON.parse(snapshot()), null, 1);
    download('progetto-sala.json', new Blob([json], { type: 'application/json' }));
    toast('File del progetto scaricato.');
  }
  function loadText(txt) {
    const prev = snapshot();
    try { restore(txt); undoSt.push(prev); redoSt.length = 0; closeModal(); afterBigChange(); setView(S.view === 'walk' ? 'orbit' : S.view); toast('Progetto caricato. Con Annulla torni a quello di prima.'); }
    catch (err) { restore(prev); toast('Non è un progetto valido. Usa un file o un testo salvato da qui.'); }
  }
  function openImport() {
    openModal(`<h2>Carica progetto</h2><p>Scegli un file salvato da qui, oppure incolla il testo del progetto.</p>
      <div class="row" style="justify-content:flex-start"><button type="button" id="btn-pick">Scegli file</button></div>
      <textarea id="ta-imp" rows="6" placeholder="Incolla qui il testo del progetto" aria-label="Testo del progetto"></textarea>
      <div class="row"><button type="button" data-close>Annulla</button><button type="button" class="primary" id="btn-load">Carica</button></div>`);
    $('#btn-pick').addEventListener('click', () => $('#file').click());
    $('#btn-load').addEventListener('click', () => { const t = $('#ta-imp').value.trim(); if (t) loadText(t); else toast('Incolla il testo oppure scegli un file.'); });
  }
  $('#file').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { loadText(await f.text()); } catch (err) { toast('Non riesco a leggere il file. Riprova.'); }
  });
  function savePhoto() {
    draw();
    const url = canvas.toDataURL('image/png'), bin = atob(url.split(',')[1]), u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    download('sala-3d.png', new Blob([u8], { type: 'image/png' }));
  }

  /* ---------------- aggiornamenti del programma ----------------
     Una pagina rimasta aperta a lungo continua a usare il programma vecchio: controlla version.json e propone di aggiornare. */
  let updShown = false;
  function showUpdate(newer) {
    if (updShown) return; updShown = true;
    $('#update-txt').textContent = newer ? 'Questa sala contiene elementi di una versione più nuova del programma.' : 'È disponibile una nuova versione del programma.';
    $('#update').hidden = false;
  }
  function doUpdate() { try { saveCache(); } catch (e) { /* si aggiorna comunque */ } location.reload(); }
  async function checkVersion() {
    try {
      const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      const j = await r.json();
      if (!j || !j.v || j.v === APP_VER) return;
      if (document.hidden && !net.dirty) { doUpdate(); return; }   // pagina in secondo piano e niente da salvare: si aggiorna da sola
      showUpdate(false);
    } catch (e) { /* senza rete si riprova più tardi */ }
  }
  $('#btn-update').addEventListener('click', doUpdate);

  /* ---------------- avvio ---------------- */
  try { const pf = JSON.parse(localStorage.getItem('sala3d.prefs') || 'null'); if (pf && pf.showRoof === false) S.showRoof = false; } catch (e) { /* preferenze non disponibili */ }
  let startId = (new URLSearchParams(location.search).get('s') || '').toLowerCase();
  if (!ROOM_RE.test(startId)) { try { startId = localStorage.getItem('sala3d.last') || ''; } catch (e) { startId = ''; } }
  const isNew = !ROOM_RE.test(startId);
  if (isNew) startId = newRoomId();
  const loaded = openRoom(startId, false);
  if (!loaded) restore(exampleProject());
  readTheme();
  new ResizeObserver(resize).observe(stage);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(readTheme, 30));
  new MutationObserver(() => setTimeout(readTheme, 30)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  resize();
  renderCatalog(); renderFloorPalette(); renderFloorInfo(); renderRoomPane(); updHist();
  setTab('cat'); if (isNarrow()) setPanelOpen(false);
  setEditing(false);
  setLightMode(lightMode);
  setView('orbit');
  requestAnimationFrame(frame);
  $('[data-m="gfx"]').textContent = gfx === 'hq' ? 'Grafica semplice (dispositivi lenti)' : 'Grafica realistica';
  eng.buildDetail(() => { dirty = true; thumbs.clear(); renderCatalog(); });
  if (!CFG.url) { setNet(false); toast('Server non configurato: la sala resta solo su questo dispositivo.', 7000); }
  else {
    if (!loaded && !isNew) $('#veil').hidden = false;              // link ricevuto: si aspetta la sala vera prima di toccare
    setTimeout(() => { if (!net.ready && !$('#veil').hidden) { $('#veil').hidden = true; toast('Non riesco a collegarmi: intanto vedi una sala di esempio. Riprovo da solo.', 7000); } }, 7000);
    if (isNew) toast('Nuova sala con una disposizione di esempio. Da Menu, Condividi mandi il link a chi deve modificarla con te.', 8000);
    syncTick(true);
    setInterval(() => syncTick(false), 2000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { net.next = 0; syncTick(false); } });
    window.addEventListener('online', () => { net.next = 0; syncTick(false); });
    window.addEventListener('pagehide', saveCache);
    checkVersion(); setInterval(checkVersion, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkVersion(); });
    if (CFG.refresh) fetch(CFG.refresh, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j && j.url && j.anon && (j.url !== CFG.url || j.anon !== CFG.anon)) { CFG.url = j.url; CFG.anon = j.anon; net.next = 0; } }).catch(() => { });
  }
  window.__sala = { S, cam, net, av, placeOnWall, setView, setTab, addItem, select, draw, snapshot, px(x, y, z) { const q = M4.tp(getVP(), [x, y, z]), rc = canvas.getBoundingClientRect(); return [rc.left + (q[0] * 0.5 + 0.5) * rc.width, rc.top + (0.5 - q[1] * 0.5) * rc.height]; } };
})();
