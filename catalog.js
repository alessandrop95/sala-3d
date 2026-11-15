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

const CATS = [['strutture', 'Strutture'], ['pesi', 'Pesi liberi'], ['funzionale', 'Funzionale'], ['cardio', 'Cardio'], ['marziali', 'Arti marziali'], ['arredo', 'Arredo'], ['miei', 'I miei attrezzi']];

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
