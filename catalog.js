'use strict';
/* Catalogo attrezzi: misure in metri (w = larghezza X, d = profondità Z, h = altezza Y).
   Origine al centro dell'ingombro a terra; il fronte guarda +Z. Gli attrezzi a parete hanno il retro a z = -d/2. */
const K = '#1b1c1f', ST = '#a3a9af', RD = '#c63a2f', WD = '#c9a36c', RB = '#232427', PAD = '#2b2d31', BL = '#2f5fa8';
const G3 = { g: 0.3 }, G8 = { g: 0.8 };

function barbell(b, y, z, plates) {
  b.cyl(0, y, z, 0.014, 1.32, ST, { axis: 'x', g: 0.8 });
  for (const s of [-1, 1]) {
    b.cyl(s * 0.885, y, z, 0.025, 0.43, ST, { axis: 'x', g: 0.8 });
    b.cyl(s * 0.665, y, z, 0.04, 0.03, ST, { axis: 'x', g: 0.8 });
    for (let i = 0; i < plates; i++) {
      b.cyl(s * (0.715 + i * 0.068), y, z, 0.225, 0.06, i ? RB : '#b0352c', { axis: 'x', seg: 24 });
      b.cyl(s * (0.715 + i * 0.068), y, z, 0.085, 0.064, ST, { axis: 'x', g: 0.6 });
    }
  }
}
function dumbbell(b, x, y, z, r) {
  const t = r * 0.9, L = 0.13 + 2 * t;
  b.cyl(x, y, z, 0.015, L, ST, { axis: 'z', g: 0.8, seg: 8 });
  for (const s of [-1, 1]) b.cyl(x, y, z + s * (L / 2 - t / 2), r, t, RB, { axis: 'z', seg: 6 });
}
function kettle(b, x, y, z, r, hex) {
  b.sph(x, y + r * 0.96, z, r, hex, { s: [1, 0.96, 1], g: 0.35 });
  b.cyl(x, y + 0.012, z, r * 0.62, 0.024, hex);
  b.tor(x, y + r * 1.68, z, r * 0.6, r * 0.16, K, { r: [-PI / 2, 0, 0], a0: 0, a1: PI, g: 0.4, seg: 12 });
}
function plate(b, x, y, z, r, t, hex, axis) {
  b.cyl(x, y, z, r, t, hex, { axis, seg: 24 }); b.cyl(x, y, z, r * 0.38, t + 0.004, ST, { axis, g: 0.6 });
}

const WL = '#d9bf8c', WDK = '#6b4f33', PAPER = '#f4efe2', INDIGO = '#22355e';
/* cifra a 7 segmenti (per il timer): segmenti a,b,c,d,e,f,g */
const SEG7 = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function digit(b, x, y, z, n, s) {
  const on = SEG7[n], L = 0.05 * s, T = 0.011 * s;
  const segs = { a: [0, L, L, T], d: [0, -L, L, T], g: [0, 0, L, T], b: [L / 2, L / 2, T, L], c: [L / 2, -L / 2, T, L], f: [-L / 2, L / 2, T, L], e: [-L / 2, -L / 2, T, L] };
  for (const k in segs) { const [dx, dy, w, h] = segs[k]; b.box(x + dx, y + dy, z, w, h, 0.004, on.includes(k) ? '#ff3b2f' : '#3a1210', { e: on.includes(k) ? 1 : 0 }); }
}

const CATS = [['decor', 'Decorazioni'], ['giappone', 'Stile giapponese'], ['strutture', 'Strutture'], ['pesi', 'Pesi liberi'], ['funzionale', 'Funzionale'], ['cardio', 'Cardio'], ['marziali', 'Arti marziali'], ['arredo', 'Arredo e servizi'], ['miei', 'I miei attrezzi']];

const CATALOG = [
  {
    k: 'rack', name: 'Power rack con bilanciere', cat: 'strutture', w: 2.2, d: 1.45, h: 2.3,
    build(b) {
      const U = 0.08, w = 1.22, d = 1.45, h = 2.3, x = w / 2 - U / 2, z = d / 2 - U / 2;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) b.box(sx * x, h / 2, sz * z, U, h, U, K, G3);
        b.box(sx * x, h - U / 2, 0, U, U, d - 2 * U, K, G3); b.box(sx * x, U / 2, 0, U, U, d - 2 * U, K, G3);
        b.box(sx * x, 0.92, 0, 0.05, 0.06, d - 2 * U, RD, G3);
        b.box(sx * (x - 0.01), 1.42, z - U / 2 - 0.05, 0.09, 0.14, 0.1, RD, G3);
      }
      for (const sz of [-1, 1]) b.box(0, h - U / 2, sz * z, w - 2 * U, U, U, K, G3);
      b.box(0, U / 2, -z, w - 2 * U, U, U, K, G3);
      b.cyl(0, h - 0.2, z, 0.017, w - U, ST, { axis: 'x', g: 0.8 });
      barbell(b, 1.5, z - U / 2 - 0.05, 2);
    },
  },
  {
    k: 'halfrack', name: 'Squat rack con bilanciere', cat: 'strutture', w: 2.2, d: 1.3, h: 2.3,
    build(b) {
      const U = 0.08, w = 1.22, h = 2.3, x = w / 2 - U / 2;
      for (const sx of [-1, 1]) {
        b.box(sx * x, h / 2, -0.3, U, h, U, K, G3);
        b.box(sx * x, U / 2, 0, U, U, 1.3, K, G3);
        b.beam([sx * x, U, -0.62], [sx * x, 0.75, -0.3], 0.05, 0.05, K, G3);
        b.box(sx * (x - 0.01), 1.42, -0.3 + U / 2 + 0.05, 0.09, 0.14, 0.1, RD, G3);
        b.box(sx * x, 0.9, 0.1, 0.05, 0.06, 0.72, RD, G3);
      }
      b.box(0, h - U / 2, -0.3, w - 2 * U, U, U, K, G3); b.box(0, U / 2, -0.61, w - 2 * U, U, U, K, G3);
      b.cyl(0, h - 0.18, -0.2, 0.017, w - U, ST, { axis: 'x', g: 0.8 });
      barbell(b, 1.5, -0.3 + U / 2 + 0.05, 2);
    },
  },
  {
    k: 'rig', name: 'Rig calisthenics 2 campate', cat: 'strutture', w: 3.7, d: 1.3, h: 2.75,
    build(b) {
      const U = 0.08, h = 2.75;
      for (const x of [-1.8, 0, 1.8]) {
        for (const z of [-0.6, 0.6]) { b.box(x, h / 2, z, U, h, U, K, G3); b.box(x, 0.008, z, 0.22, 0.016, 0.22, K, G3); }
        b.box(x, h - U / 2, 0, U, U, 1.2 - U, K, G3); b.box(x, 2.3, 0, 0.05, 0.05, 1.2 - U, K, G3);
      }
      for (const z of [-0.6, 0.6]) {
        b.cyl(0, 2.42, z, 0.017, 3.6, ST, { axis: 'x', g: 0.8 });
        b.cyl(-0.9, 2.62, z, 0.017, 1.8, ST, { axis: 'x', g: 0.8 });
      }
      b.cyl(0.9, 2.05, 0.6, 0.017, 1.8, ST, { axis: 'x', g: 0.8 });
    },
  },
  {
    k: 'pullbar', name: 'Sbarra trazioni a parete', cat: 'strutture', w: 1.2, d: 0.6, h: 0.4, wall: true, elev: 2.2,
    build(b) {
      for (const sx of [-1, 1]) {
        b.box(sx * 0.4, 0.2, -0.295, 0.06, 0.4, 0.01, K, G3);
        b.box(sx * 0.4, 0.37, 0, 0.05, 0.05, 0.6, K, G3);
        b.beam([sx * 0.4, 0.02, -0.28], [sx * 0.4, 0.35, 0.2], 0.04, 0.04, K, G3);
      }
      b.cyl(0, 0.37, 0.27, 0.017, 1.2, ST, { axis: 'x', g: 0.8 });
    },
  },
  {
    k: 'spalliera', name: 'Spalliera svedese', cat: 'strutture', w: 0.9, d: 0.16, h: 2.4, wall: true, fixElev: true,
    build(b) {
      for (const sx of [-1, 1]) b.box(sx * 0.43, 1.2, -0.02, 0.035, 2.4, 0.12, WD);
      for (let i = 0; i < 13; i++) b.cyl(0, 0.14 + i * 0.165, 0, 0.018, 0.84, '#d8b98a', { axis: 'x', seg: 8 });
      b.cyl(0, 2.33, 0.055, 0.018, 0.84, '#d8b98a', { axis: 'x', seg: 8 });
    },
  },
  {
    k: 'dip', name: 'Parallele dip', cat: 'strutture', w: 0.75, d: 1.1, h: 1.3,
    build(b) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) b.cyl(sx * 0.29, 0.65, sz * 0.42, 0.022, 1.3, K, G3);
        b.cyl(sx * 0.29, 1.28, 0, 0.02, 1.0, ST, { axis: 'z', g: 0.8 });
        b.box(sx * 0.29, 0.02, 0, 0.06, 0.04, 1.1, K, G3);
      }
      for (const sz of [-1, 1]) b.box(0, 0.02, sz * 0.42, 0.7, 0.04, 0.06, K, G3);
    },
  },
  { k: 'barbell', name: 'Bilanciere olimpico con dischi', cat: 'pesi', w: 2.2, d: 0.45, h: 0.45, build(b) { barbell(b, 0.225, 0, 2); } },
  {
    k: 'dbrack', name: 'Rastrelliera manubri', cat: 'pesi', w: 2.2, d: 0.62, h: 0.9,
    build(b) {
      for (const sx of [-1, 1]) {
        b.box(sx * 1.05, 0.42, -0.2, 0.06, 0.84, 0.06, K, G3); b.box(sx * 1.05, 0.03, 0, 0.06, 0.06, 0.62, K, G3);
        b.beam([sx * 1.05, 0.06, 0.28], [sx * 1.05, 0.5, -0.2], 0.05, 0.05, K, G3);
      }
      for (const [y, z] of [[0.32, 0.1], [0.72, -0.08]]) {
        b.box(0, y, z, 2.1, 0.03, 0.34, K, { g: 0.3, r: [0.25, 0, 0] });
        for (let i = 0; i < 9; i++) dumbbell(b, -0.92 + i * 0.23, y + 0.09 - 0.0, z, 0.05 + i * 0.006 + (y > 0.5 ? 0 : 0.012));
      }
    },
  },
  { k: 'kb8', name: 'Kettlebell 8 kg', cat: 'pesi', w: 0.19, d: 0.19, h: 0.22, build(b) { kettle(b, 0, 0, 0, 0.088, '#d24f8e'); } },
  { k: 'kb16', name: 'Kettlebell 16 kg', cat: 'pesi', w: 0.22, d: 0.22, h: 0.27, build(b) { kettle(b, 0, 0, 0, 0.105, '#d9b02c'); } },
  { k: 'kb24', name: 'Kettlebell 24 kg', cat: 'pesi', w: 0.25, d: 0.25, h: 0.3, build(b) { kettle(b, 0, 0, 0, 0.12, '#3d8f4d'); } },
  {
    k: 'kbrack', name: 'Rastrelliera kettlebell', cat: 'pesi', w: 1.4, d: 0.5, h: 0.95,
    build(b) {
      for (const sx of [-1, 1]) { b.box(sx * 0.67, 0.35, 0, 0.05, 0.7, 0.46, K, G3); }
      const cols = ['#d24f8e', '#2f5fa8', '#d9b02c', '#7b4fa3', '#3d8f4d', '#d07a2a'];
      for (const [y, o] of [[0.12, 0], [0.62, 3]]) {
        b.box(0, y, 0, 1.34, 0.03, 0.46, K, G3);
        for (let i = 0; i < 5; i++) kettle(b, -0.5 + i * 0.25, y + 0.015, 0, 0.085 + ((i + o) % 6) * 0.006, cols[(i + o) % 6]);
      }
    },
  },
  {
    k: 'platetree', name: 'Porta dischi', cat: 'pesi', w: 0.7, d: 0.7, h: 1.15,
    build(b) {
      b.box(0, 0.03, 0, 0.7, 0.06, 0.08, K, G3); b.box(0, 0.03, 0, 0.08, 0.06, 0.7, K, G3); b.box(0, 0.58, 0, 0.07, 1.1, 0.07, K, G3);
      const cs = ['#b0352c', '#2f5fa8', '#d9b02c'];
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
        const y = 0.3 + i * 0.32;
        b.cyl(s * 0.15, y, 0, 0.024, 0.24, ST, { axis: 'x', g: 0.8 });
        plate(b, s * 0.1, y, 0, 0.225 - i * 0.03, 0.05, i ? RB : cs[0], 'x'); plate(b, s * 0.16, y, 0, 0.225 - i * 0.03, 0.05, RB, 'x');
      }
    },
  },
  { k: 'bumper', name: 'Disco bumper 20 kg', cat: 'pesi', w: 0.45, d: 0.45, h: 0.07, build(b) { plate(b, 0, 0.035, 0, 0.225, 0.07, RB, 'y'); } },
  {
    k: 'bench', name: 'Panca piana', cat: 'pesi', w: 0.6, d: 1.25, h: 0.45,
    build(b) {
      b.box(0, 0.405, 0, 0.3, 0.09, 1.2, PAD); b.box(0, 0.33, 0, 0.07, 0.06, 1.0, K, G3);
      for (const sz of [-1, 1]) { b.box(0, 0.17, sz * 0.45, 0.06, 0.3, 0.06, K, G3); b.box(0, 0.025, sz * 0.45, 0.58, 0.05, 0.06, K, G3); }
    },
  },
  {
    k: 'benchadj', name: 'Panca regolabile', cat: 'pesi', w: 0.65, d: 1.4, h: 1.0,
    build(b) {
      b.box(0, 0.44, 0.42, 0.3, 0.08, 0.36, PAD);
      b.box(0, 0.7, -0.2, 0.3, 0.08, 0.92, PAD, { r: [-0.72, 0, 0] });
      b.box(0, 0.2, 0, 0.07, 0.07, 1.25, K, G3); b.beam([0, 0.23, -0.1], [0, 0.6, -0.42], 0.05, 0.05, K, G3);
      b.box(0, 0.32, 0.42, 0.06, 0.2, 0.06, K, G3);
      for (const sz of [-1, 1]) { b.box(0, 0.1, sz * 0.6, 0.06, 0.2, 0.06, K, G3); b.box(0, 0.025, sz * 0.6, 0.62, 0.05, 0.06, K, G3); }
    },
  },
  {
    k: 'medball', name: 'Palla medica / wall ball', cat: 'pesi', w: 0.35, d: 0.35, h: 0.35,
    build(b) { b.sph(0, 0.175, 0, 0.175, '#2b2d31'); b.tor(0, 0.175, 0, 0.172, 0.012, RD, {}); },
  },
  {
    k: 'plyo', name: 'Plyo box in legno 50/60/75', cat: 'funzionale', w: 0.75, d: 0.5, h: 0.6,
    build(b) {
      b.box(0, 0.3, 0, 0.75, 0.6, 0.5, '#d1ad77');
      for (const sx of [-1, 1]) b.box(sx * 0.376, 0.42, 0, 0.004, 0.05, 0.14, '#4a3a26');
      for (const sz of [-1, 1]) b.box(0, 0.3, sz * 0.251, 0.6, 0.012, 0.004, '#b08c58');
    },
  },
  {
    k: 'plyosoft', name: 'Plyo box morbido', cat: 'funzionale', w: 0.9, d: 0.75, h: 0.6,
    build(b) { b.box(0, 0.3, 0, 0.9, 0.6, 0.75, '#26272b'); b.box(0, 0.3, 0.376, 0.5, 0.2, 0.004, RD); b.box(0, 0.601, 0, 0.84, 0.004, 0.69, '#34363b'); },
  },
  {
    k: 'elastici', name: 'Elastici a parete', cat: 'funzionale', w: 0.8, d: 0.14, h: 1.15, wall: true, elev: 0.95,
    build(b) {
      b.box(0, 1.12, -0.05, 0.8, 0.05, 0.03, K, G3);
      const cs = ['#e3c62f', '#c63a2f', '#1f2023', '#7b4fa3', '#3d8f4d', '#2f5fa8'], ws = [0.013, 0.02, 0.03, 0.045, 0.064, 0.083];
      for (let i = 0; i < 6; i++) {
        const x = -0.33 + i * 0.132;
        b.cyl(x, 1.12, 0.0, 0.011, 0.12, ST, { axis: 'z', g: 0.8, seg: 8 });
        b.box(x, 0.6, 0.03, ws[i], 1.04, 0.012, cs[i]);
      }
    },
  },
  {
    k: 'sled', name: 'Slitta da spinta', cat: 'funzionale', w: 0.65, d: 1.05, h: 1.0,
    build(b) {
      for (const sx of [-1, 1]) { b.box(sx * 0.28, 0.03, 0, 0.08, 0.06, 1.05, K, G3); b.cyl(sx * 0.28, 0.52, -0.42, 0.022, 0.96, K, G3); b.cyl(sx * 0.28, 0.4, 0.42, 0.022, 0.72, K, G3); }
      b.box(0, 0.07, 0, 0.6, 0.02, 0.7, K, G3); b.cyl(0, 0.3, 0, 0.025, 0.45, ST, G8);
      plate(b, 0, 0.115, 0, 0.225, 0.07, RB, 'y'); plate(b, 0, 0.19, 0, 0.225, 0.07, '#b0352c', 'y');
    },
  },
  {
    k: 'anelli', name: 'Anelli da ginnastica', cat: 'funzionale', w: 0.75, d: 0.25, h: 0.26, hang: true, elev: 1.9, ropes: [[-0.25, 0], [0.25, 0]], ropeR: 0.012, ropeCol: 'dark',
    build(b) { for (const s of [-1, 1]) b.tor(s * 0.25, 0.13, 0, 0.105, 0.016, WD, { r: [PI / 2, 0, 0], seg: 24 }); },
  },
  {
    k: 'corda', name: 'Corda per arrampicata', cat: 'funzionale', w: 0.3, d: 0.3, h: 0.12, hang: true, elev: 0.15, ropes: [[0, 0]], ropeR: 0.019, ropeCol: 'rope',
    build(b) { b.sph(0, 0.07, 0, 0.045, '#bfa67a'); b.cyl(0, 0.11, 0, 0.019, 0.04, '#bfa67a'); },
  },
  {
    k: 'tappetino', name: 'Tappetino 180×60', cat: 'funzionale', w: 0.6, d: 1.8, h: 0.015,
    build(b) { b.box(0, 0.0075, 0, 0.6, 0.015, 1.8, '#6a4c93'); },
  },
  {
    k: 'rower', name: 'Vogatore', cat: 'cardio', w: 0.6, d: 2.4, h: 1.0,
    build(b) {
      b.box(0, 0.33, 0.35, 0.09, 0.05, 1.7, ST, G8); b.box(0, 0.4, 0.5, 0.28, 0.06, 0.26, PAD);
      b.cyl(0, 0.48, -0.85, 0.3, 0.16, '#2a2c30', { axis: 'x', seg: 24 }); b.cyl(0, 0.48, -0.85, 0.2, 0.17, '#55595e', { axis: 'x', seg: 24 });
      b.box(0, 0.16, -0.75, 0.55, 0.05, 0.06, K, G3); b.box(0, 0.16, 1.15, 0.45, 0.05, 0.06, K, G3);
      b.box(0, 0.2, 1.15, 0.05, 0.3, 0.05, K, G3); b.box(0, 0.25, -0.75, 0.06, 0.25, 0.3, K, G3);
      b.beam([0, 0.6, -0.6], [0, 0.95, -0.45], 0.04, 0.04, K, G3); b.box(0, 0.97, -0.42, 0.2, 0.14, 0.03, '#1f2023');
      b.box(0, 0.36, -0.38, 0.4, 0.03, 0.28, K, { r: [0.7, 0, 0] });
    },
  },
  {
    k: 'airbike', name: 'Air bike', cat: 'cardio', w: 0.65, d: 1.25, h: 1.3,
    build(b) {
      b.cyl(0, 0.42, -0.3, 0.34, 0.12, '#2a2c30', { axis: 'x', seg: 24 }); b.cyl(0, 0.42, -0.3, 0.3, 0.13, '#666a70', { axis: 'x', seg: 24 });
      b.box(0, 0.03, -0.5, 0.6, 0.06, 0.07, K, G3); b.box(0, 0.03, 0.55, 0.6, 0.06, 0.07, K, G3);
      b.beam([0, 0.06, -0.5], [0, 0.06, 0.55], 0.07, 0.07, K, G3); b.beam([0, 0.1, 0.25], [0, 0.85, 0.42], 0.06, 0.06, K, G3);
      b.box(0, 0.9, 0.44, 0.24, 0.06, 0.28, PAD);
      for (const sx of [-1, 1]) { b.beam([sx * 0.2, 0.4, -0.1], [sx * 0.24, 1.22, -0.05], 0.035, 0.035, K, G3); b.cyl(sx * 0.24, 1.24, 0.02, 0.018, 0.16, PAD, { axis: 'z' }); }
      b.beam([0, 0.7, -0.3], [0, 1.2, -0.25], 0.04, 0.04, K, G3); b.box(0, 1.24, -0.24, 0.18, 0.12, 0.03, '#1f2023');
    },
  },
  {
    k: 'tapis', name: 'Tapis roulant', cat: 'cardio', w: 0.85, d: 1.9, h: 1.45,
    build(b) {
      b.box(0, 0.12, 0.1, 0.8, 0.14, 1.7, '#2a2c30'); b.box(0, 0.195, 0.1, 0.56, 0.012, 1.55, '#111214');
      b.box(0, 0.15, -0.82, 0.82, 0.3, 0.26, '#3a3d42');
      for (const sx of [-1, 1]) { b.beam([sx * 0.38, 0.2, -0.72], [sx * 0.38, 1.25, -0.55], 0.06, 0.06, '#3a3d42', G3); b.box(sx * 0.38, 0.95, -0.25, 0.04, 0.04, 0.55, PAD); }
      b.box(0, 1.3, -0.55, 0.8, 0.22, 0.08, '#1f2023', { r: [-0.5, 0, 0] });
    },
  },
  {
    k: 'skierg', name: 'Ski erg', cat: 'cardio', w: 0.6, d: 1.3, h: 2.15,
    build(b) {
      b.box(0, 0.03, 0.1, 0.6, 0.06, 1.25, '#2a2c30'); b.box(0, 1.05, -0.45, 0.1, 2.0, 0.07, K, G3);
      b.cyl(0, 1.85, -0.32, 0.27, 0.14, '#2a2c30', { axis: 'x', seg: 24 }); b.cyl(0, 1.85, -0.32, 0.2, 0.15, '#666a70', { axis: 'x', seg: 24 });
      b.box(0, 1.3, -0.38, 0.2, 0.14, 0.03, '#1f2023');
      for (const sx of [-1, 1]) { b.tube([sx * 0.2, 2.05, -0.3], [sx * 0.2, 1.75, -0.12], 0.004, K); b.cyl(sx * 0.2, 1.7, -0.12, 0.016, 0.13, PAD); }
    },
  },
  {
    k: 'sacco', name: 'Sacco da boxe appeso', cat: 'marziali', w: 0.36, d: 0.36, h: 1.5, hang: true, elev: 0.7, ropes: [[0, 0]], ropeR: 0.008, ropeCol: 'steel',
    build(b) {
      b.cyl(0, 0.6, 0, 0.175, 1.2, '#8c1f1a', { seg: 20 });
      b.cyl(0, 0.05, 0, 0.176, 0.03, K, { seg: 20 }); b.cyl(0, 1.15, 0, 0.176, 0.03, K, { seg: 20 });
      for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; b.tube([cos(a) * 0.15, 1.2, sin(a) * 0.15], [0, 1.49, 0], 0.006, ST, G8); }
    },
  },
  {
    k: 'saccoterra', name: 'Sacco autoportante', cat: 'marziali', w: 0.62, d: 0.62, h: 1.75,
    build(b) { b.cyl(0, 0.25, 0, 0.31, 0.5, '#1f2023', { r2: 0.24, seg: 22 }); b.cyl(0, 0.56, 0, 0.1, 0.14, '#1f2023'); b.cyl(0, 1.18, 0, 0.16, 1.14, '#b0352c', { seg: 20 }); },
  },
  {
    k: 'makiwara', name: 'Makiwara', cat: 'marziali', w: 0.4, d: 0.5, h: 1.4,
    build(b) {
      b.box(0, 0.015, 0, 0.4, 0.03, 0.5, '#8a6a42'); b.box(0, 0.1, -0.05, 0.14, 0.16, 0.14, '#8a6a42');
      b.beam([0, 0.03, -0.05], [0, 1.38, 0.0], 0.1, 0.035, '#b8905a');
      b.box(0, 1.24, 0.03, 0.12, 0.3, 0.05, '#d9c48a');
      for (let i = 0; i < 5; i++) b.box(0, 1.13 + i * 0.055, 0.057, 0.124, 0.012, 0.004, '#a88f55');
    },
  },
  {
    k: 'manichino', name: 'Manichino da colpi', cat: 'marziali', w: 0.6, d: 0.6, h: 1.8,
    build(b) {
      b.cyl(0, 0.3, 0, 0.3, 0.6, '#1f2023', { r2: 0.22, seg: 22 }); b.cyl(0, 0.8, 0, 0.07, 0.45, '#1f2023');
      b.sph(0, 1.22, 0, 0.24, '#c99a7a', { s: [1, 1.25, 0.62] }); b.cyl(0, 1.55, 0, 0.06, 0.1, '#c99a7a');
      b.sph(0, 1.67, 0, 0.115, '#c99a7a', { s: [0.9, 1.1, 1] });
    },
  },
  {
    k: 'specchio', name: 'Specchio a parete 100×200', cat: 'arredo', w: 1.0, d: 0.03, h: 2.0, wall: true, elev: 0.3,
    build(b) {
      b.box(0, 1.0, 0.004, 0.97, 1.97, 0.008, '#c3d8e2', { g: 1 });
      b.box(0, 1.0, -0.006, 1.0, 2.0, 0.018, '#8b9197', G3);
    },
  },
  {
    k: 'panchina', name: 'Panchina', cat: 'arredo', w: 1.5, d: 0.4, h: 0.45,
    build(b) {
      for (let i = 0; i < 4; i++) b.box(0, 0.43, -0.15 + i * 0.1, 1.5, 0.03, 0.085, WD);
      for (const sx of [-1, 1]) { b.box(sx * 0.6, 0.39, 0, 0.04, 0.04, 0.38, K, G3); for (const sz of [-1, 1]) b.box(sx * 0.6, 0.2, sz * 0.17, 0.04, 0.4, 0.04, K, G3); }
    },
  },
  {
    k: 'scaffale', name: 'Armadietto / scaffale', cat: 'arredo', w: 1.0, d: 0.45, h: 1.8,
    build(b) {
      b.box(0, 0.9, 0, 1.0, 1.8, 0.45, '#8f959c');
      b.box(0, 0.9, 0.226, 0.006, 1.74, 0.002, '#5f656c');
      for (const sx of [-1, 1]) b.box(sx * 0.06, 0.95, 0.232, 0.015, 0.12, 0.012, '#3a3d42');
    },
  },
  {
    k: 'persona', name: 'Persona 175 cm (scala)', cat: 'arredo', w: 0.52, d: 0.3, h: 1.75,
    build(b) {
      const c = '#7f95ad';
      for (const s of [-1, 1]) {
        b.tube([s * 0.085, 0.03, 0], [s * 0.095, 0.92, 0], 0.062, c); b.sph(s * 0.085, 0.04, 0.045, 0.062, c, { s: [0.95, 0.6, 1.9] });
        b.tube([s * 0.21, 1.42, 0], [s * 0.245, 0.86, 0.02], 0.04, c); b.sph(s * 0.21, 1.42, 0, 0.055, c);
      }
      b.sph(0, 1.18, 0, 0.18, c, { s: [0.98, 1.62, 0.6] }); b.sph(0, 0.95, 0, 0.16, c, { s: [1, 0.7, 0.68] });
      b.cyl(0, 1.5, 0, 0.042, 0.1, c); b.sph(0, 1.63, 0, 0.1, c, { s: [0.92, 1.14, 1] });
    },
  },
  /* ---------- stile giapponese ---------- */
  {
    k: 'kamidana', name: 'Kamidana (altarino)', cat: 'giappone', w: 0.9, d: 0.36, h: 0.55, wall: true, elev: 2.0,
    build(b) {
      b.box(0, 0.02, 0, 0.9, 0.04, 0.36, WL);
      for (const sx of [-1, 1]) b.beam([sx * 0.36, -0.12, -0.17], [sx * 0.36, 0, 0.12], 0.03, 0.03, WL);
      b.box(0, 0.06, -0.02, 0.52, 0.04, 0.26, WL);
      b.box(0, 0.19, -0.03, 0.34, 0.22, 0.17, '#e7d3a6');
      b.box(0, 0.19, 0.057, 0.08, 0.15, 0.004, WDK);
      for (const sz of [-1, 1]) b.box(0, 0.34, -0.03 + sz * 0.075, 0.5, 0.02, 0.19, '#4a3a2a', { r: [-sz * 0.62, 0, 0] });
      b.cyl(0, 0.4, -0.03, 0.012, 0.52, '#c9a24a', { axis: 'x', g: 0.6 });
      b.cyl(0, -0.03, 0.17, 0.028, 0.84, '#d8c79a', { axis: 'x' });
      for (let i = 0; i < 4; i++) { const x = -0.27 + i * 0.18; b.box(x, -0.1, 0.17, 0.035, 0.09, 0.004, '#ffffff'); b.box(x + 0.012, -0.16, 0.17, 0.035, 0.05, 0.004, '#ffffff'); }
      for (const sx of [-1, 1]) { b.cyl(sx * 0.32, 0.09, 0.08, 0.035, 0.07, '#ffffff'); b.sph(sx * 0.32, 0.17, 0.08, 0.06, '#3f7a3a', { s: [0.6, 1.3, 0.6] }); }
    },
  },
  {
    k: 'shoji', name: 'Pannello shoji', cat: 'giappone', w: 0.9, d: 0.04, h: 1.8, wall: true, elev: 0,
    build(b) {
      b.box(0, 0.9, -0.008, 0.86, 1.76, 0.008, PAPER, { e: 0.25 });
      for (const sx of [-1, 1]) b.box(sx * 0.43, 0.9, 0, 0.04, 1.8, 0.035, WL);
      for (const y of [0.02, 1.78]) b.box(0, y, 0, 0.9, 0.04, 0.035, WL);
      b.box(0, 0.2, 0, 0.86, 0.02, 0.02, WL);
      for (let i = 1; i < 4; i++) b.box(-0.43 + i * 0.215, 1.0, 0, 0.014, 1.56, 0.02, WL);
      for (let j = 1; j < 7; j++) b.box(0, 0.2 + j * 0.225, 0, 0.86, 0.014, 0.02, WL);
    },
  },
  {
    k: 'koshiita', name: 'Rivestimento in legno', cat: 'giappone', w: 2.0, d: 0.03, h: 1.0, wall: true, elev: 0,
    build(b) {
      const n = 13, bw = 2.0 / n;
      for (let i = 0; i < n; i++) b.box(-1 + bw / 2 + i * bw, 0.5, 0, bw - 0.006, 1.0, 0.025, i % 2 ? '#a77d4f' : '#b68a59');
      b.box(0, 1.0, 0.012, 2.0, 0.05, 0.05, WDK);
      b.box(0, 0.04, 0.012, 2.0, 0.08, 0.04, WDK);
    },
  },
  {
    k: 'noren', name: 'Noren (tenda)', cat: 'giappone', w: 0.9, d: 0.05, h: 0.95, wall: true, elev: 1.2,
    build(b) {
      b.cyl(0, 0.93, 0.0, 0.012, 0.98, WDK, { axis: 'x' });
      for (let i = 0; i < 3; i++) b.box(-0.3 + i * 0.3, 0.47, 0.012, 0.28, 0.88, 0.006, INDIGO);
      b.sph(0, 0.62, 0.016, 0.1, '#f2efe6', { s: [1, 1, 0.05] });
    },
  },
  {
    k: 'byobu', name: 'Paravento byōbu', cat: 'giappone', w: 1.85, d: 0.32, h: 1.7,
    build(b) {
      const n = 6, pw = 0.31;
      for (let i = 0; i < n; i++) {
        const x = -0.775 + i * pw, a = i % 2 ? -0.48 : 0.48, z = 0;
        b.box(x, 0.86, z, pw * 0.98, 1.62, 0.025, '#c9a85a', { r: [0, a, 0], g: 0.4 });
        b.box(x, 1.69, z, pw, 0.04, 0.035, '#2a1d14', { r: [0, a, 0] });
        b.box(x, 0.04, z, pw, 0.08, 0.035, '#2a1d14', { r: [0, a, 0] });
      }
    },
  },
  {
    k: 'andon', name: 'Lanterna andon', cat: 'giappone', w: 0.34, d: 0.34, h: 0.95,
    build(b) {
      b.box(0, 0.05, 0, 0.34, 0.06, 0.34, WDK);
      b.box(0, 0.5, 0, 0.28, 0.66, 0.28, '#f6e4bb', { e: 0.9 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.145, 0.5, sz * 0.145, 0.025, 0.86, 0.025, WDK);
      b.box(0, 0.86, 0, 0.32, 0.03, 0.32, WDK); b.box(0, 0.93, 0, 0.2, 0.03, 0.2, WDK);
    },
  },
  {
    k: 'bonsai', name: 'Bonsai su tavolino', cat: 'giappone', w: 0.6, d: 0.45, h: 1.0,
    build(b) {
      b.box(0, 0.47, 0, 0.6, 0.04, 0.45, '#3b2a1e');
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * 0.26, 0.23, sz * 0.18, 0.04, 0.45, 0.04, '#3b2a1e');
      b.box(0, 0.53, 0, 0.36, 0.08, 0.24, '#5a6b7a', { g: 0.4 });
      b.tube([0, 0.57, 0], [-0.05, 0.72, 0], 0.025, '#5c4430'); b.tube([-0.05, 0.72, 0], [0.06, 0.84, 0.02], 0.02, '#5c4430'); b.tube([0.06, 0.84, 0.02], [0.14, 0.86, 0], 0.012, '#5c4430');
      b.sph(0.15, 0.89, 0, 0.11, '#3d6b35', { s: [1.2, 0.45, 0.9] }); b.sph(-0.08, 0.8, 0.03, 0.12, '#46793c', { s: [1.3, 0.45, 1] }); b.sph(0.02, 0.95, -0.02, 0.1, '#3d6b35', { s: [1.4, 0.45, 1] });
    },
  },
  {
    k: 'taiko', name: 'Tamburo taiko', cat: 'giappone', w: 0.75, d: 0.6, h: 1.15,
    build(b) {
      b.cyl(0, 0.78, 0, 0.3, 0.5, '#7a3a22', { axis: 'z', seg: 24 });
      b.cyl(0, 0.78, 0, 0.302, 0.42, '#8e472b', { axis: 'z', seg: 24 });
      for (const sz of [-1, 1]) { b.cyl(0, 0.78, sz * 0.25, 0.29, 0.004, '#efe3c6', { axis: 'z', seg: 24 }); b.tor(0, 0.78, sz * 0.245, 0.29, 0.012, '#1d1d1d', { r: [PI / 2, 0, 0] }); }
      for (const sx of [-1, 1]) { b.beam([sx * 0.3, 0, -0.18], [sx * 0.2, 0.62, -0.05], 0.05, 0.05, '#2b1d14'); b.beam([sx * 0.3, 0, 0.18], [sx * 0.2, 0.62, 0.05], 0.05, 0.05, '#2b1d14'); }
      b.box(0, 0.03, 0, 0.7, 0.05, 0.05, '#2b1d14');
    },
  },
  {
    k: 'katanakake', name: 'Rastrelliera bokken e bō', cat: 'giappone', w: 1.0, d: 0.36, h: 1.7,
    build(b) {
      for (const sx of [-1, 1]) { b.box(sx * 0.48, 0.85, -0.12, 0.05, 1.7, 0.05, WDK); b.box(sx * 0.48, 0.03, 0, 0.06, 0.06, 0.36, WDK); }
      for (const y of [0.25, 1.45]) b.box(0, y, -0.12, 0.92, 0.05, 0.05, WDK);
      b.box(0, 0.06, 0.04, 0.92, 0.04, 0.22, WDK);
      for (let i = 0; i < 6; i++) b.cyl(-0.38 + i * 0.075, 0.9, -0.06, 0.013, 1.68, WL, { seg: 8 });
      for (let i = 0; i < 4; i++) { const x = 0.1 + i * 0.09; b.beam([x, 0.08, 0.06], [x - 0.02, 1.05, -0.07], 0.03, 0.022, '#b98d55'); b.box(x - 0.01, 0.75, -0.02, 0.06, 0.012, 0.05, '#2a2a2a', { r: [0.13, 0, 0] }); }
    },
  },
  /* ---------- servizi e arredo ---------- */
  {
    k: 'timer', name: 'Timer LED a parete', cat: 'arredo', w: 0.62, d: 0.08, h: 0.22, wall: true, elev: 2.4,
    build(b) {
      b.box(0, 0.11, 0, 0.62, 0.22, 0.08, '#141414', { g: 0.3 });
      const z = 0.041, xs = [-0.21, -0.1, 0.1, 0.21];
      [1, 2, 0, 0].forEach((n, i) => digit(b, xs[i], 0.11, z, n, 1.4));
      for (const y of [0.08, 0.14]) b.box(0, y, z, 0.016, 0.016, 0.004, '#ff3b2f', { e: 1 });
    },
  },
  {
    k: 'tv', name: 'TV a parete 55"', cat: 'arredo', w: 1.24, d: 0.06, h: 0.72, wall: true, elev: 1.5,
    build(b) { b.box(0, 0.36, 0, 1.24, 0.72, 0.05, '#111214', { g: 0.3 }); b.box(0, 0.37, 0.026, 1.2, 0.67, 0.003, '#1b2430', { g: 1 }); },
  },
  {
    k: 'cassa', name: 'Cassa audio a parete', cat: 'arredo', w: 0.3, d: 0.26, h: 0.45, wall: true, elev: 2.3,
    build(b) {
      b.box(0, 0.225, 0, 0.3, 0.45, 0.24, '#1a1b1e', { g: 0.2 });
      b.cyl(0, 0.17, 0.121, 0.09, 0.004, '#3a3d42', { axis: 'z', seg: 20 }); b.cyl(0, 0.35, 0.121, 0.035, 0.004, '#3a3d42', { axis: 'z' });
    },
  },
  {
    k: 'clima', name: 'Condizionatore split', cat: 'arredo', w: 0.9, d: 0.24, h: 0.3, wall: true, elev: 2.6,
    build(b) { b.box(0, 0.15, 0, 0.9, 0.3, 0.22, '#f3f4f2', { g: 0.3 }); b.box(0, 0.035, 0.08, 0.82, 0.03, 0.07, '#cfd3d4'); b.box(0.36, 0.25, 0.111, 0.05, 0.012, 0.002, '#4fb36a', { e: 1 }); },
  },
  {
    k: 'ventilatore', name: 'Ventilatore a piantana', cat: 'arredo', w: 0.55, d: 0.42, h: 1.35,
    build(b) {
      b.cyl(0, 0.02, 0, 0.2, 0.04, '#2a2c30', { seg: 20 }); b.cyl(0, 0.6, 0, 0.02, 1.15, ST, { g: 0.6 });
      b.cyl(0, 1.12, -0.03, 0.07, 0.16, '#2a2c30', { axis: 'z' });
      b.tor(0, 1.12, 0.07, 0.24, 0.008, ST, { r: [PI / 2, 0, 0], g: 0.6, seg: 28 });
      for (let i = 0; i < 3; i++) { const a = i * 2 * PI / 3; b.box(cos(a) * 0.12, 1.12 + sin(a) * 0.12, 0.06, 0.2, 0.08, 0.008, '#6e8fb0', { r: [0, 0, a] }); }
    },
  },
  {
    k: 'estintore', name: 'Estintore', cat: 'arredo', w: 0.22, d: 0.2, h: 0.65, wall: true, elev: 0.25,
    build(b) {
      b.box(0, 0.35, -0.095, 0.08, 0.1, 0.01, '#2a2c30');
      b.cyl(0, 0.27, 0.0, 0.085, 0.52, '#c4271f', { g: 0.5 }); b.sph(0, 0.53, 0, 0.085, '#c4271f', { s: [1, 0.4, 1], g: 0.5 });
      b.cyl(0, 0.59, 0, 0.022, 0.06, '#1d1d1d'); b.box(0.03, 0.63, 0, 0.09, 0.015, 0.03, '#1d1d1d');
      b.tube([0.02, 0.58, 0.02], [0.09, 0.3, 0.06], 0.012, '#1d1d1d');
    },
  },
  {
    k: 'scarpiera', name: 'Scarpiera', cat: 'arredo', w: 1.0, d: 0.35, h: 0.9,
    build(b) {
      for (const sx of [-1, 1]) b.box(sx * 0.49, 0.45, 0, 0.02, 0.9, 0.35, WL);
      b.box(0, 0.45, -0.165, 0.96, 0.9, 0.02, '#c9ad7c');
      for (let i = 0; i < 4; i++) b.box(0, 0.02 + i * 0.29, 0, 0.96, 0.02, 0.35, WL);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) b.box(-0.3 + j * 0.3, 0.07 + i * 0.29, 0.02, 0.2, 0.08, 0.27, j % 2 ? '#2a2c30' : '#ececec');
    },
  },
  {
    k: 'appendiabiti', name: 'Appendiabiti a parete', cat: 'arredo', w: 1.2, d: 0.12, h: 0.14, wall: true, elev: 1.65,
    build(b) {
      b.box(0, 0.07, -0.045, 1.2, 0.12, 0.025, WL);
      for (let i = 0; i < 6; i++) { const x = -0.5 + i * 0.2; b.tube([x, 0.07, -0.03], [x, 0.04, 0.05], 0.008, ST, { g: 0.8 }); b.sph(x, 0.04, 0.05, 0.014, ST, { g: 0.8 }); }
    },
  },
  {
    k: 'lavagna', name: 'Lavagna / bacheca', cat: 'arredo', w: 1.2, d: 0.04, h: 0.9, wall: true, elev: 1.0,
    build(b) { b.box(0, 0.45, -0.005, 1.2, 0.9, 0.025, '#b9bec3', { g: 0.6 }); b.box(0, 0.45, 0.009, 1.16, 0.86, 0.004, '#fbfbf8', { g: 0.5 }); b.box(0, 0.02, 0.03, 1.0, 0.025, 0.05, '#b9bec3'); },
  },
  {
    k: 'plafoniera', name: 'Plafoniera LED', cat: 'arredo', w: 1.2, d: 0.3, h: 0.06, hang: true, elev: 3.2, ropes: [[-0.5, 0], [0.5, 0]], ropeR: 0.003, ropeCol: 'steel',
    build(b) { b.box(0, 0.035, 0, 1.2, 0.05, 0.3, '#d9dcde', { g: 0.4 }); b.box(0, 0.008, 0, 1.16, 0.006, 0.26, '#fffdf6', { e: 1 }); },
  },
  {
    k: 'scrivania', name: 'Scrivania / reception', cat: 'arredo', w: 1.4, d: 0.7, h: 0.75,
    build(b) {
      b.box(0, 0.735, 0, 1.4, 0.03, 0.7, WL);
      for (const sx of [-1, 1]) b.box(sx * 0.68, 0.36, 0, 0.03, 0.72, 0.66, '#2a2c30');
      b.box(0, 0.42, -0.31, 1.34, 0.5, 0.02, '#2a2c30');
    },
  },
  {
    k: 'acqua', name: 'Distributore d\'acqua', cat: 'arredo', w: 0.32, d: 0.32, h: 1.35,
    build(b) {
      b.box(0, 0.48, 0, 0.32, 0.96, 0.32, '#eceeef', { g: 0.3 }); b.box(0, 0.62, 0.161, 0.16, 0.14, 0.004, '#3a3d42');
      b.cyl(0, 1.12, 0, 0.13, 0.32, '#7fb3d9', { g: 0.9, seg: 20 }); b.cyl(0, 0.99, 0, 0.05, 0.06, '#7fb3d9', { g: 0.9 });
    },
  },
  {
    k: 'pianta', name: 'Pianta in vaso', cat: 'arredo', w: 0.5, d: 0.5, h: 1.45,
    build(b) {
      b.cyl(0, 0.2, 0, 0.18, 0.4, '#e8e4dc', { r2: 0.21, seg: 20 });
      b.tube([0, 0.38, 0], [0.02, 0.9, 0], 0.02, '#5c4430');
      for (const [x, y, z, r] of [[0, 1.15, 0, 0.24], [0.12, 0.95, 0.06, 0.18], [-0.12, 1.0, -0.05, 0.19], [0.04, 1.3, -0.04, 0.15]]) b.sph(x, y, z, r, '#3f7a3a', { s: [1, 0.9, 1] });
    },
  },
  {
    k: 'crashpad', name: 'Materasso di caduta', cat: 'funzionale', w: 1.0, d: 2.0, h: 0.2,
    build(b) { b.box(0, 0.1, 0, 1.0, 0.2, 2.0, '#2f5fa8'); b.box(0, 0.1, 0, 1.006, 0.06, 2.006, '#8a9098'); },
  },
  {
    k: 'battlerope', name: 'Battle rope 15 m', cat: 'funzionale', w: 0.45, d: 7.6, h: 0.1,
    build(b) {
      b.box(0, 0.05, -3.72, 0.16, 0.1, 0.16, K, G3); b.tor(0, 0.1, -3.72, 0.05, 0.012, ST, { r: [PI / 2, 0, 0], g: 0.8 });
      for (const sx of [-1, 1]) { b.tube([sx * 0.03, 0.02, -3.65], [sx * 0.18, 0.02, 3.5], 0.019, '#2b2d31', { seg: 8 }); b.cyl(sx * 0.18, 0.02, 3.66, 0.024, 0.3, '#c63a2f', { axis: 'z' }); }
    },
  },
];

/* Pavimentazioni: spessore in metri */
const FLOORS = [
  { id: 'tb', name: 'Tatami blu', th: 0.04, col: '#2b5ea6' },
  { id: 'tr', name: 'Tatami rosso', th: 0.04, col: '#c23a30' },
  { id: 'tn', name: 'Tatami nero', th: 0.04, col: '#2a2c30' },
  { id: 'tg', name: 'Tatami grigio', th: 0.04, col: '#8a9098' },
  { id: 'tv', name: 'Tatami verde', th: 0.04, col: '#3d8a4f' },
  { id: 'ty', name: 'Tatami giallo', th: 0.04, col: '#dcb538' },
  { id: 'g4', name: 'Gomma antitrauma 4 cm', th: 0.04, col: '#1c1d20' },
  { id: 'g2', name: 'Gomma antitrauma 2 cm', th: 0.02, col: '#2c2e33' },
  { id: 'er', name: 'Erba sintetica', th: 0.02, col: '#3f7d36' },
  { id: 'lg', name: 'Pedana in legno', th: 0.04, col: '#bd9460' },
  { id: 'ce', name: 'Cemento a vista', th: 0, col: '#9c9a95' },
];
