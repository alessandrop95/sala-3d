'use strict';
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fm = (n, d = 2) => n.toFixed(d).replace('.', ',');
  const cm = n => Math.round(n * 100);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const snap = v => Math.round(v * 20) / 20;
  const CFG = Object.assign({ url: '', anon: '' }, window.SALA_CFG || {});
  const ROOM_RE = /^[a-z0-9]{10,40}$/;
  const newId = () => Math.floor(Math.random() * 9e15) + 1;
  const ACCENT = '#e0463a';

  const canvas = $('#gl'), stage = $('#stage');
  let eng;
  try { eng = new Engine(canvas); }
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
  const S = { room: null, nx: 0, nz: 0, cells: [], items: [], custom: [], sel: null, view: 'orbit', tab: 'cat', paint: 'g4', showRoof: true, cat: 'tutti' };
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
  const defOf = it => DEF.get(it.k);
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
  function getMesh(k) {
    let m = meshes.get(k);
    if (!m) { const b = new MB(); DEF.get(k).build(b); m = eng.mesh(b); meshes.set(k, m); }
    return m;
  }

  /* ---------------- progetto: salva / carica ---------------- */
  function snapshot() {
    return JSON.stringify({ v: 1, room: S.room, nx: S.nx, nz: S.nz, cells: S.cells, items: S.items, custom: S.custom });
  }
  function sanitizeRoom(r) {
    const o = {
      W: clamp(+r.W || 10, 3, 40), D: clamp(+r.D || 12, 3, 40), hLow: clamp(+r.hLow || 3, 2.2, 12), hHigh: clamp(+r.hHigh || 3, 2.2, 15), openings: [],
    };
    const prev = S.room; S.room = o;
    for (const p of (r.openings || []).slice(0, 24)) {
      const wi = wallInfo(WALL_KEYS.includes(p.wall) ? p.wall : 'A');
      const w = clamp(+p.w || 1, 0.3, wi.len), u = clamp(+p.u || 0, 0, wi.len - w);
      const hm = min(wi.hAt(u), wi.hAt(u + w)) - 0.05;
      const sill = p.t === 'door' ? 0 : clamp(+p.sill || 0, 0, hm - 0.3), h = clamp(+p.h || 1, 0.3, hm - sill);
      o.openings.push({ t: p.t === 'door' ? 'door' : 'win', wall: wi.key, u, w, sill, h });
    }
    S.room = prev;
    return o;
  }
  function resizeFloor(oldNx, oldNz, oldCells) {
    const nx = ceil(S.room.W - 1e-6), nz = ceil(S.room.D - 1e-6), cells = new Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const v = oldCells && oldNx ? oldCells[clamp(j, 0, oldNz - 1) * oldNx + clamp(i, 0, oldNx - 1)] : 'tb';
      cells[j * nx + i] = FLOOR_BY.has(v) ? v : 'tb';
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
    S.items = []; const ids = new Set();
    for (const q of p.items || []) {
      if (!DEF.has(q.k)) continue;
      let id = +q.id || 0; if (!id || ids.has(id)) id = newId(); ids.add(id);
      const it = { id, k: q.k, x: +q.x || 0, z: +q.z || 0, rot: +q.rot || 0, elev: +q.elev || 0 };
      if (DEF.get(q.k).wall) { it.wall = WALL_KEYS.includes(q.wall) ? q.wall : 'C'; it.u = +q.u || 0; }
      clampItem(it); S.items.push(it);
    }
    if (!S.items.some(i => i.id === S.sel)) S.sel = null;
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
    const room = { W: pick('W'), D: pick('D'), hLow: pick('hLow'), hHigh: pick('hHigh'), openings: pick('openings') };
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
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => clamp(round(v * f), 0, 255));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  }
  function buildWall(key) {
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
      for (const o of cov) { if (o.sill > y + 1e-4) mb.prism(a, b, y, o.sill, o.sill, T, WALL_COL); y = max(y, o.sill + o.h); }
      if (hAt(a) > y + 1e-4 || hAt(b) > y + 1e-4) mb.prism(a, b, y, max(hAt(a), y), max(hAt(b), y), T, WALL_COL);
    }
    const z = -T / 2;
    for (const o of ops) {
      const cx = o.u + o.w / 2, cy = o.sill + o.h / 2;
      if (o.t === 'door') {
        mb.box(cx, cy, z, o.w, o.h, 0.06, '#8e9499', { g: 0.25 });
        const n = max(1, round(o.w / 1.0));
        for (let i = 1; i < n; i++) mb.box(o.u + i * o.w / n, cy, z + 0.035, 0.016, o.h, 0.012, '#5f646a');
        mb.box(cx, o.sill + o.h * 0.52, z + 0.035, o.w, 0.03, 0.012, '#787e84');
        mb.box(cx, o.sill + 0.06, z + 0.035, o.w, 0.12, 0.012, '#787e84');
      } else {
        mb.box(cx, o.sill + o.h * 0.7, z, o.w, o.h * 0.6, 0.02, '#f2f7fb', { e: 1 });
        mb.box(cx, o.sill + o.h * 0.2, z, o.w, o.h * 0.4, 0.02, '#dfe8ea', { e: 1 });
        const fc = '#5a5f65', nv = max(1, round(o.w / 0.5)), nh = max(1, round(o.h / 0.55));
        for (let i = 0; i <= nv; i++) mb.box(o.u + i * o.w / nv, cy, z, i === 0 || i === nv ? 0.05 : 0.022, o.h, 0.06, fc);
        for (let j = 0; j <= nh; j++) mb.box(cx, o.sill + j * o.h / nh, z, o.w, j === 0 || j === nh ? 0.05 : 0.022, 0.06, fc);
      }
    }
    mb.frame(null);
    return eng.mesh(mb);
  }
  function buildRoof() {
    const r = S.room, W = r.W, D = r.D, mb = new MB(), t = 0.08, ov = 0.3, sl = (r.hHigh - r.hLow) / D;
    mb.beam([W / 2, r.hLow - ov * sl + t / 2, -ov], [W / 2, r.hHigh + ov * sl + t / 2, D + ov], W + 2 * ov, t, '#e7eaea');
    for (let x = 1; x < W - 0.05; x += 1) mb.beam([x, r.hLow - 0.003, 0], [x, r.hHigh - 0.003, D], 0.014, 0.004, '#c2c8c8');
    const n = max(2, round(D / 3)), TC = '#b4babf', dp = 0.32, G = { g: 0.5 };
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
    mb.box(r.W / 2, -0.06, r.D / 2, r.W + 2 * T, 0.12, r.D + 2 * T, '#9c9a95');
    R.base = eng.mesh(mb);
    for (const k of WALL_KEYS) R[k] = buildWall(k);
    R.roof = buildRoof();
    eng.setShadowBounds([0, 0, 0], [r.W, max(r.hLow, r.hHigh), r.D]);
  }
  function buildFloor() {
    eng.free(R.floor);
    const mb = new MB(), W = S.room.W, D = S.room.D, g = 0.004;
    for (let j = 0; j < S.nz; j++) for (let i = 0; i < S.nx; i++) {
      const f = FLOOR_BY.get(S.cells[j * S.nx + i]);
      if (!f || !f.th) continue;
      const x0 = i, x1 = min(i + 1, W), z0 = j, z1 = min(j + 1, D);
      if (x1 - x0 < 0.02 || z1 - z0 < 0.02) continue;
      mb.box((x0 + x1) / 2, 0.001, (z0 + z1) / 2, x1 - x0, 0.002, z1 - z0, shade(f.col, 0.45));
      mb.box((x0 + x1) / 2, f.th / 2, (z0 + z1) / 2, x1 - x0 - 2 * g, f.th, z1 - z0 - 2 * g, f.col);
    }
    R.floor = eng.mesh(mb); floorDirty = false;
  }
  const ROPE = {};
  {
    const mk = (hex, o) => { const b = new MB(); b.cyl(0, 0.5, 0, 1, 1, hex, o); return eng.mesh(b); };
    ROPE.steel = mk('#a3a9af', { g: 0.8, seg: 8 }); ROPE.dark = mk('#2b2d31', { seg: 8 }); ROPE.rope = mk('#bfa67a', { seg: 8 });
    const b = new MB(); b.box(0, 0, 0, 1, 1, 1, ACCENT, { e: 1 }); R.outline = eng.mesh(b);
  }

  /* ---------------- camera ---------------- */
  const FOV_O = 0.72, FOV_W = 1.2;
  function aspect() { return (canvas.clientWidth || 1) / (canvas.clientHeight || 1); }
  function camEye() {
    if (S.view === 'walk') return cam.walk.slice();
    const cp = cos(cam.pitch);
    return [cam.target[0] + cam.dist * cp * sin(cam.yaw), cam.target[1] + cam.dist * sin(cam.pitch), cam.target[2] + cam.dist * cp * cos(cam.yaw)];
  }
  function camMats() {
    const eye = camEye();
    if (S.view === 'walk') {
      const cp = cos(cam.wpitch), dir = [sin(cam.wyaw) * cp, sin(cam.wpitch), -cos(cam.wyaw) * cp];
      return { eye, view: M4.lookAt(eye, V3.add(eye, dir), [0, 1, 0]), proj: M4.persp(FOV_W, aspect(), 0.05, 200) };
    }
    return { eye, view: M4.lookAt(eye, cam.target, [0, 1, 0]), proj: M4.persp(FOV_O, aspect(), 0.1, 400) };
  }
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
  function pickItem(px, py) {
    const ray = rayAt(px, py); let best = null;
    for (const it of S.items) {
      const d = defOf(it), c = cos(it.rot), s = sin(it.rot), y0 = itemY(it);
      const ox = ray.o[0] - it.x, oy = ray.o[1] - y0, oz = ray.o[2] - it.z;
      const lo = [c * ox - s * oz, oy, s * ox + c * oz], ld = [c * ray.d[0] - s * ray.d[2], ray.d[1], s * ray.d[0] + c * ray.d[2]];
      const hw = max(d.w, 0.34) / 2, hd = max(d.d, 0.34) / 2, hh = max(d.h, 0.2);
      const mn = [-hw, 0, -hd], mx = [hw, hh, hd];
      let t0 = 0, t1 = 1e9, ok = true;
      for (let k = 0; k < 3; k++) {
        if (abs(ld[k]) < 1e-8) { if (lo[k] < mn[k] || lo[k] > mx[k]) { ok = false; break; } continue; }
        let a = (mn[k] - lo[k]) / ld[k], b = (mx[k] - lo[k]) / ld[k];
        if (a > b) [a, b] = [b, a];
        t0 = max(t0, a); t1 = min(t1, b);
        if (t0 > t1) { ok = false; break; }
      }
      if (ok && (!best || t0 < best.t)) best = { it, t: t0, point: V3.add(ray.o, V3.mul(ray.d, t0)) };
    }
    return best;
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
    if (!a) return ovSet;
    const A = obb(a);
    for (const b of S.items) {
      if (b === a) continue;
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
  function readTheme() {
    const m = /rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/.exec(getComputedStyle(stage).backgroundColor || '');
    if (m) clearCol = [m[1] / 255, m[2] / 255, m[3] / 255, 1];
    dirty = true;
  }
  function buildDraws(eye) {
    const r = S.room, dr = [];
    if (floorDirty) buildFloor();
    dr.push({ mesh: R.base, m: IDENT }, { mesh: R.floor, m: IDENT });
    const walk = S.view === 'walk';
    if (walk || eye[2] > 0) dr.push({ mesh: R.A, m: IDENT });
    if (walk || eye[0] < r.W) dr.push({ mesh: R.B, m: IDENT });
    if (walk || eye[2] < r.D) dr.push({ mesh: R.C, m: IDENT });
    if (walk || eye[0] > 0) dr.push({ mesh: R.D, m: IDENT });
    if (S.showRoof && S.view !== 'plan' && (walk || eye[1] < roofH(eye[2]))) dr.push({ mesh: R.roof, m: IDENT });
    const ov = overlapsOfSel();
    for (const it of S.items) {
      const d = defOf(it), y = itemY(it);
      dr.push({
        mesh: getMesh(it.k), m: M4.compose(it.x, y, it.z, it.rot), cast: true,
        tint: it.id === S.sel ? [accLin[0], accLin[1], accLin[2], 0.14] : ov.has(it.id) ? [0.85, 0.08, 0.05, 0.4] : null,
      });
      if (d.hang && d.ropes) {
        const c = cos(it.rot), s = sin(it.rot);
        for (const [lx, lz] of d.ropes) {
          const x = it.x + c * lx + s * lz, z = it.z - s * lx + c * lz, y0 = y + d.h, len = roofH(z) - y0;
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
    return dr;
  }
  function draw() {
    const c = camMats();
    eng.render({ draws: buildDraws(c.eye), view: c.view, proj: c.proj, eye: c.eye, clear: clearCol, shadows: true });
    lastVP = M4.mul(c.proj, c.view);
    placeWallLabels();
  }
  /* spostamento morbido della vista (usato dall'elenco) */
  let anim = null;
  const lerp = (a, b, t) => a + (b - a) * t;
  const angTo = (a, b) => { let d = (b - a) % (2 * PI); if (d > PI) d -= 2 * PI; if (d < -PI) d += 2 * PI; return a + d; };
  function animStep(now) {
    const t = clamp((now - anim.t0) / anim.ms, 0, 1), e = 1 - Math.pow(1 - t, 3), a = anim.a, b = anim.b;
    if (b.target) { cam.target = [0, 1, 2].map(i => lerp(a.target[i], b.target[i], e)); cam.dist = lerp(a.dist, b.dist, e); cam.pitch = lerp(a.pitch, b.pitch, e); }
    if (b.walk) { cam.walk = [0, 1, 2].map(i => lerp(a.walk[i], b.walk[i], e)); cam.wyaw = lerp(a.wyaw, b.wyaw, e); cam.wpitch = lerp(a.wpitch, b.wpitch, e); }
    dirty = true;
    if (t >= 1) anim = null;
  }
  function flyTo(b) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const a = { target: cam.target.slice(), dist: cam.dist, pitch: cam.pitch, walk: cam.walk.slice(), wyaw: cam.wyaw, wpitch: cam.wpitch };
    if (b.wyaw != null) b.wyaw = angTo(cam.wyaw, b.wyaw);
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
    } else {
      flyTo({ target: c, dist: clamp(r / sin(FOV_O / 2) * 1.7, 2.6, 40), pitch: clamp(cam.pitch, 0.35, 0.95) });
    }
  }
  function frame(now) { if (anim) animStep(now || performance.now()); if (dirty) { dirty = false; draw(); } requestAnimationFrame(frame); }
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
  function makeThumb(k) {
    const d = DEF.get(k), S0 = 168;
    canvas.width = S0; canvas.height = S0;
    const rad = 0.5 * hypot(d.w, d.h, d.d), fov = 0.5, dist = rad / sin(fov / 2) * 1.02;
    const yaw = 0.62, pitch = 0.36, cp = cos(pitch), tg = [0, d.h / 2, 0];
    const eye = [tg[0] + dist * cp * sin(yaw), tg[1] + dist * sin(pitch), tg[2] + dist * cp * cos(yaw)];
    eng.render({ draws: [{ mesh: getMesh(k), m: IDENT }], view: M4.lookAt(eye, tg, [0, 1, 0]), proj: M4.persp(fov, 1, 0.05, 100), eye, clear: [0, 0, 0, 0], shadows: false });
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
  function addItem(k) {
    const d = DEF.get(k); if (!d) return;
    pushHist();
    const it = { id: newId(), k, x: 0, z: 0, rot: 0, elev: d.elev || 0 };
    const walk = S.view === 'walk';
    if (d.wall) {
      const e = walk ? [-sin(cam.wyaw), 0, cos(cam.wyaw)] : [sin(cam.yaw), 0, cos(cam.yaw)];
      let bk = 'C', bv = -9;
      for (const key of WALL_KEYS) { const v = V3.dot(wallInfo(key).n, e); if (v > bv) { bv = v; bk = key; } }
      const wi = wallInfo(bk);
      let u = wi.len / 2;
      while (S.items.some(o => o.wall === bk && abs(o.u - u) < 0.3) && u < wi.len - 0.6) u += 0.5;
      placeOnWall(it, bk, u, d.elev || 0);
    } else {
      if (walk) { it.x = cam.walk[0] + sin(cam.wyaw) * 3; it.z = cam.walk[2] - cos(cam.wyaw) * 3; it.rot = -cam.wyaw; }
      else { it.x = cam.target[0]; it.z = cam.target[2]; it.rot = round(cam.yaw / (PI / 2)) * PI / 2; }
      it.x = snap(it.x); it.z = snap(it.z); clampItem(it);
      const bx = it.x, bz = it.z, free = () => { const A = obb(it, 0.2); return !S.items.some(o => { const B = obb(o); return !(A.y1 <= B.y0 + 0.005 || B.y1 <= A.y0 + 0.005) && sat(A, B) && sat(B, A); }); };
      search: for (let rad = 0; rad <= 5; rad += 0.5) for (let k = 0; k < (rad ? 12 : 1); k++) {
        it.x = snap(bx + rad * cos(k * PI / 6)); it.z = snap(bz + rad * sin(k * PI / 6)); clampItem(it);
        if (free()) break search;
        if (rad === 5 && k === 11) { it.x = bx; it.z = bz; clampItem(it); }
      }
    }
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
    if (act.tap && !act.moved && e.type === 'pointerup') {
      const now = performance.now();
      if (S.view === 'walk' && now - lastTap.t < 380 && hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        const q = rayPlaneY(rayAt(e.clientX, e.clientY), 0.04);
        if (q) { cam.walk[0] = clamp(q[0], 0.4, S.room.W - 0.4); cam.walk[2] = clamp(q[2], 0.4, S.room.D - 0.4); dirty = true; }
      } else select(null);
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
  window.addEventListener('keydown', e => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement && document.activeElement.tagName || '')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { if (selItem()) { e.preventDefault(); deleteSel(); } }
    else if (e.key === 'r' || e.key === 'R') rotateSel(e.shiftKey ? -PI / 12 : PI / 12);
    else if (e.key === 'Escape') { select(null); closeMenu(); closeModal(); }
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
    canvas.classList.toggle('painting', t === 'floor');
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
    let h = list.map(d => `<button type="button" class="card" data-add="${esc(d.k)}" title="Aggiungi alla sala">
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
  function renderList() {
    const g = new Map();
    for (const it of S.items) { const d = defOf(it); g.set(d.k, (g.get(d.k) || 0) + 1); }
    const rows = [...g.entries()].map(([k, n]) => {
      const d = DEF.get(k), lab = n > 1 ? `Elimina un ${esc(d.name)} (ne restano ${n - 1})` : `Elimina ${esc(d.name)}`;
      return `<li><button type="button" class="go" data-go="${esc(k)}" title="Mostra nella vista"><span>${esc(d.name)}<small>${cm(d.w)}×${cm(d.d)}×${cm(d.h)} cm</small></span><b>× ${n}</b></button><button type="button" class="x" data-delk="${esc(k)}" aria-label="${lab}" title="${lab}">×</button></li>`;
    }).join('');
    $('#list-items').innerHTML = rows || '<li class="empty">Nessun attrezzo nella sala. Aprine uno dal catalogo.</li>';
    $('#list-floor').innerHTML = floorStats().map(s => `<li><span><i style="background:${s.f.col}"></i>${esc(s.f.name)}${s.f.th ? `<small>piastrelle 1×1 m, ${cm(s.f.th)} cm</small>` : ''}</span><b>${s.f.th ? s.n + ' pz · ' : ''}${fm(s.a, 1)} m²</b></li>`).join('');
    $('#list-tot').textContent = `${S.items.length} attrezzi · sala ${fm(S.room.W, 1)} × ${fm(S.room.D, 1)} m (${fm(S.room.W * S.room.D, 1)} m²)`;
  }
  function listText() {
    const g = new Map();
    for (const it of S.items) { const d = defOf(it); g.set(d.name, (g.get(d.name) || 0) + 1); }
    let t = `SALA ${fm(S.room.W, 1)} × ${fm(S.room.D, 1)} m\n\nATTREZZI\n`;
    for (const [n, q] of g) t += `- ${q} × ${n}\n`;
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
    $('#room-ops').innerHTML = r.openings.map((o, i) => `<div class="op" data-i="${i}">
      <div class="op-h"><select id="op-t-${i}" data-f="t" aria-label="Tipo"><option value="win"${o.t === 'win' ? ' selected' : ''}>Finestra</option><option value="door"${o.t === 'door' ? ' selected' : ''}>Portone</option></select>
      <select id="op-w-${i}" data-f="wall" aria-label="Parete">${WALL_KEYS.map(k => `<option value="${k}"${o.wall === k ? ' selected' : ''}>Parete ${k}</option>`).join('')}</select>
      <button type="button" class="ic" data-opdel="${i}" aria-label="Elimina apertura">×</button></div>
      <div class="op-g">
      <label for="op-u-${i}">Dall'angolo<input id="op-u-${i}" data-f="u" type="number" inputmode="decimal" step="0.05" value="${+o.u.toFixed(2)}"></label>
      <label for="op-l-${i}">Larghezza<input id="op-l-${i}" data-f="w" type="number" inputmode="decimal" step="0.05" value="${+o.w.toFixed(2)}"></label>
      <label for="op-s-${i}">Da terra<input id="op-s-${i}" data-f="sill" type="number" inputmode="decimal" step="0.05" value="${+o.sill.toFixed(2)}"${o.t === 'door' ? ' disabled' : ''}></label>
      <label for="op-h-${i}">Altezza<input id="op-h-${i}" data-f="h" type="number" inputmode="decimal" step="0.05" value="${+o.h.toFixed(2)}"></label></div></div>`).join('');
  }
  function applyRoom(mut) {
    pushHist();
    const next = JSON.parse(JSON.stringify(S.room)); mut(next);
    const oNx = S.nx, oNz = S.nz, oCells = S.cells;
    S.room = sanitizeRoom(next);
    resizeFloor(oNx, oNz, oCells);
    for (const it of S.items) clampItem(it);
    buildRoom(); floorDirty = true; renderRoomPane(); changed();
  }
  function updateSelbar() {
    const it = selItem(), bar = $('#selbar');
    if (!it) { bar.hidden = true; return; }
    const d = defOf(it), r = S.room;
    let h = `<div class="sb-top"><strong>${esc(d.name)}</strong><span class="mono">${cm(d.w)}×${cm(d.d)}×${cm(d.h)} cm</span></div><div class="sb-btn">`;
    if (!d.wall) h += `<button type="button" data-act="rl" aria-label="Ruota di 15 gradi a sinistra">↺ 15°</button><button type="button" data-act="rr" aria-label="Ruota di 15 gradi a destra">↻ 15°</button><button type="button" data-act="r90">90°</button>`;
    h += `<button type="button" data-act="dup">Duplica</button><button type="button" data-act="del" class="danger">Elimina</button></div>`;
    if (d.hang || (d.wall && !d.fixElev)) h += `<div class="sb-el"><span>Da terra</span><button type="button" data-act="e-" aria-label="Abbassa di 5 cm">−</button><b class="mono">${fm(it.elev)} m</b><button type="button" data-act="e+" aria-label="Alza di 5 cm">+</button></div>`;
    if (d.wall) h += `<div class="sb-ds mono"><span>Parete ${it.wall}</span><span>dall'angolo ${fm(it.u - d.w / 2)} m</span></div>`;
    else {
      const [hx, hz] = halfExt(it);
      h += `<div class="sb-ds mono"><span>A ${fm(max(0, it.z - hz))}</span><span>B ${fm(max(0, r.W - it.x - hx))}</span><span>C ${fm(max(0, r.D - it.z - hz))}</span><span>D ${fm(max(0, it.x - hx))}</span><em>m dalle pareti</em></div>`;
    }
    if (overlapsOfSel().size) h += `<div class="sb-warn">Si sovrappone a un altro attrezzo (in rosso).</div>`;
    bar.innerHTML = h; bar.hidden = false;
  }

  /* ---------------- eventi interfaccia ---------------- */
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) setTab(b.dataset.tab); });
  $('#views').addEventListener('click', e => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); });
  $('#cat-chips').addEventListener('click', e => { const b = e.target.closest('[data-cat]'); if (b) { S.cat = b.dataset.cat; renderCatalog(); } });
  $('#cat-grid').addEventListener('click', e => {
    const del = e.target.closest('[data-delcustom]');
    if (del) {
      e.stopPropagation(); pushHist();
      const id = del.dataset.delcustom;
      S.custom = S.custom.filter(c => c.id !== id); S.items = S.items.filter(i => i.k !== id);
      if (!selItem()) S.sel = null;
      syncCustomDefs(); renderCatalog(); changed(); return;
    }
    if (e.target.closest('#btn-custom')) { openCustom(); return; }
    const b = e.target.closest('[data-add]'); if (b) addItem(b.dataset.add);
  });
  $('#floor-pal').addEventListener('click', e => { const b = e.target.closest('[data-floor]'); if (b) { S.paint = b.dataset.floor; renderFloorPalette(); } });
  $('#btn-fill').addEventListener('click', fillFloor);
  $('#btn-plan').addEventListener('click', () => setView('plan'));
  $('#selbar').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, it = selItem();
    if (a === 'rl') rotateSel(PI / 12); else if (a === 'rr') rotateSel(-PI / 12); else if (a === 'r90') rotateSel(PI / 2);
    else if (a === 'dup') duplicateSel(); else if (a === 'del') deleteSel();
    else if (a === 'e-' && it) setElev(snap(it.elev - 0.05)); else if (a === 'e+' && it) setElev(snap(it.elev + 0.05));
  });
  /* elenco: la X toglie un attrezzo di quel tipo (quello selezionato se è di quel tipo, altrimenti l'ultimo aggiunto) */
  let goIdx = { k: '', i: -1 };
  $('#list-items').addEventListener('click', e => {
    const g = e.target.closest('[data-go]');
    if (g) {
      const k = g.dataset.go, all = S.items.filter(i => i.k === k);
      if (!all.length) return;
      const sel = selItem();
      // primo tocco: quello selezionato (se è di questo tipo) o il primo; tocchi successivi: il seguente
      const i = goIdx.k === k ? (goIdx.i + 1) % all.length : sel && sel.k === k ? all.indexOf(sel) : 0;
      goIdx = { k, i };
      const it = all[i];
      select(it.id); focusItem(it);
      if (all.length > 1) toast(`${DEF.get(k).name}: ${i + 1} di ${all.length}. Tocca di nuovo per il successivo.`, 2600);
      return;
    }
    const b = e.target.closest('[data-delk]'); if (!b) return;
    const k = b.dataset.delk, sel = selItem();
    const it = sel && sel.k === k ? sel : [...S.items].reverse().find(i => i.k === k);
    if (!it) return;
    pushHist();
    S.items = S.items.filter(i => i !== it);
    if (S.sel === it.id) S.sel = null;
    changed();
    toast(`Eliminato: ${DEF.get(k).name}. Con ↶ lo ripristini.`);
    const next = $('#list-items [data-delk="' + k + '"]') || $('#list-items [data-delk]');
    if (next) next.focus();
  });
  $('#btn-undo').addEventListener('click', undo); $('#btn-redo').addEventListener('click', redo);
  $('#btn-menu').addEventListener('click', e => { e.stopPropagation(); const m = $('#menu'); m.hidden = !m.hidden; $('#btn-menu').setAttribute('aria-expanded', String(!m.hidden)); });
  $('#menu').addEventListener('click', e => {
    const b = e.target.closest('[data-m]'); if (!b) return; closeMenu();
    const m = b.dataset.m;
    if (m === 'share') shareLink(); else if (m === 'copy') copyRoom(); else if (m === 'export') exportFile(); else if (m === 'import') openImport(); else if (m === 'photo') savePhoto();
    else if (m === 'clear') { pushHist(); S.items = []; S.sel = null; changed(); toast('Sala svuotata. Con Annulla torni indietro.'); }
    else if (m === 'example') { pushHist(); restore(exampleProject()); afterBigChange(); setView(S.view, false); }
    else if (m === 'help') openHelp();
  });
  $('#room-dims').addEventListener('change', e => {
    const k = e.target.id.replace('rm-', ''), v = parseFloat(String(e.target.value).replace(',', '.'));
    if (!isFinite(v)) { renderRoomPane(); return; }
    applyRoom(r => { r[k] = v; });
    if (S.view !== 'walk') setView(S.view);
  });
  $('#rm-roof').addEventListener('change', e => { S.showRoof = e.target.checked; try { localStorage.setItem('sala3d.prefs', JSON.stringify({ showRoof: S.showRoof })); } catch (_) { } dirty = true; });
  $('#room-ops').addEventListener('change', e => {
    const row = e.target.closest('.op'), f = e.target.dataset.f; if (!row || !f) return;
    const i = +row.dataset.i, raw = e.target.value;
    applyRoom(r => { const o = r.openings[i]; if (!o) return; if (f === 't' || f === 'wall') o[f] = raw; else { const v = parseFloat(String(raw).replace(',', '.')); if (isFinite(v)) o[f] = v; } if (o.t === 'door') o.sill = 0; });
  });
  $('#room-ops').addEventListener('click', e => { const b = e.target.closest('[data-opdel]'); if (b) applyRoom(r => { r.openings.splice(+b.dataset.opdel, 1); }); });
  $('#btn-addwin').addEventListener('click', () => applyRoom(r => { r.openings.push({ t: 'win', wall: 'C', u: 1, w: 2, sill: 1.1, h: 1.5 }); }));
  $('#btn-adddoor').addEventListener('click', () => applyRoom(r => { r.openings.push({ t: 'door', wall: 'D', u: 1, w: 1, sill: 0, h: 2.1 }); }));
  $('#btn-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(listText()); toast('Elenco copiato.'); }
    catch (e) { openModal(`<h2>Elenco</h2><p>Seleziona il testo e copialo.</p><textarea id="ta-list" rows="12" readonly>${esc(listText())}</textarea><div class="row"><button type="button" data-close>Chiudi</button></div>`); }
  });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('click', e => { if (!e.target.closest('#menu') && !e.target.closest('#btn-menu')) closeMenu(); });

  function openCustom() {
    openModal(`<h2>Nuovo attrezzo</h2><form id="f-custom">
      <label class="fld" for="cu-name"><span>Nome</span><input id="cu-name" type="text" maxlength="40" required placeholder="Es. Rastrelliera bastoni"></label>
      <div class="g3"><label class="fld" for="cu-w"><span>Larghezza</span><input id="cu-w" type="number" inputmode="decimal" min="1" max="1000" value="100" required><em>cm</em></label>
      <label class="fld" for="cu-d"><span>Profondità</span><input id="cu-d" type="number" inputmode="decimal" min="1" max="1000" value="50" required><em>cm</em></label>
      <label class="fld" for="cu-h"><span>Altezza</span><input id="cu-h" type="number" inputmode="decimal" min="1" max="600" value="100" required><em>cm</em></label></div>
      <div class="g3"><label class="fld" for="cu-shape"><span>Forma</span><select id="cu-shape"><option value="box">Parallelepipedo</option><option value="cyl">Cilindro</option></select></label>
      <label class="fld" for="cu-mount"><span>Posizione</span><select id="cu-mount"><option value="floor">A terra</option><option value="wall">A parete</option></select></label>
      <label class="fld" for="cu-col"><span>Colore</span><input id="cu-col" type="color" value="#3a6ea5"></label></div>
      <div class="row"><button type="button" data-close>Annulla</button><button type="submit" class="primary">Aggiungi alla sala</button></div></form>`);
    $('#f-custom').addEventListener('submit', e => {
      e.preventDefault();
      const v = id => parseFloat(String($('#' + id).value).replace(',', '.')) / 100;
      const c = { id: 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36), name: $('#cu-name').value.trim() || 'Attrezzo', w: clamp(v('cu-w') || 1, 0.05, 10), d: clamp(v('cu-d') || 0.5, 0.05, 10), h: clamp(v('cu-h') || 1, 0.01, 6), color: $('#cu-col').value, shape: $('#cu-shape').value, wall: $('#cu-mount').value === 'wall' };
      closeModal(); pushHist(); S.custom.push(c); syncCustomDefs(); S.cat = 'miei'; renderCatalog(); undoSt.pop(); addItem(c.id);
    });
    $('#cu-name').focus();
  }
  function openHelp() {
    openModal(`<h2>Come si usa</h2><ul class="help">
      <li><b>Aggiungere</b> Apri Attrezzi e tocca una scheda: l'attrezzo compare al centro della vista.</li>
      <li><b>Spostare</b> Trascina l'attrezzo. Quelli a parete scorrono lungo i muri e si alzano o abbassano; quelli appesi arrivano fino al tetto.</li>
      <li><b>Vista</b> Un dito o tasto sinistro per ruotare, due dita o rotellina per lo zoom, due dita o tasto destro per spostarti.</li>
      <li><b>Pavimento</b> Scegli un materiale e tocca o trascina sulle piastrelle da 1×1 m. In Pianta è più comodo.</li>
      <li><b>Interno</b> Vedi la sala ad altezza occhi. Doppio tocco sul pavimento per spostarti.</li>
      <li><b>Insieme</b> Menu, Condividi: chi apre il link modifica questa stessa sala, senza account. Le modifiche arrivano in un paio di secondi.</li>
      <li><b>Tastiera</b> R ruota, D duplica, Canc elimina, Ctrl+Z annulla.</li>
      <li><b>Misure</b> In Sala correggi dimensioni, finestre e portone: quelle iniziali sono stimate dalle foto.</li></ul>
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
  setView('orbit');
  requestAnimationFrame(frame);
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
    if (CFG.refresh) fetch(CFG.refresh, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => { if (j && j.url && j.anon && (j.url !== CFG.url || j.anon !== CFG.anon)) { CFG.url = j.url; CFG.anon = j.anon; net.next = 0; } }).catch(() => { });
  }
  window.__sala = { S, cam, net, setView, setTab, addItem, select, draw, snapshot, px(x, y, z) { const q = M4.tp(getVP(), [x, y, z]), rc = canvas.getBoundingClientRect(); return [rc.left + (q[0] * 0.5 + 0.5) * rc.width, rc.top + (0.5 - q[1] * 0.5) * rc.height]; } };
})();
