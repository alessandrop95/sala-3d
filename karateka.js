/* Karateka: figura articolata (karategi bianco, cintura nera) con camminata.
   Ogni parte è costruita col perno sull'articolazione, l'arto pende verso -Y e il fronte guarda +Z. */
'use strict';
const KARATEKA = (() => {
  const GI = '#f2efe6', GI2 = '#e2ddd0', SKIN = '#c98f68', HAIR = '#1d1712', BELT = '#141414';
  const giO = { m: MAT.PAPER }, gi2O = { m: MAT.PAPER }, skO = { m: MAT.PLAIN, g: 0.12 };
  // misure (m): persona di 175 cm
  const HIP_Y = 0.94, HIP_X = 0.088, THIGH = 0.43, SHIN = 0.44, SH_Y = 0.47, SH_X = 0.182, UARM = 0.29, FARM = 0.25, NECK_Y = 0.555;

  /* scala/sposta un pezzo: frame con assi scalati per ottenere sezioni ellittiche */
  const ell = (b, c, sx, sy, sz, fn) => {
    const F0 = b.F;
    if (!F0) b.frame(c, [sx, 0, 0], [0, sy, 0], [0, 0, sz]);
    else {
      const t = (v, k) => [v[0] * k, v[1] * k, v[2] * k];
      b.frame([F0.C[0] + F0.X[0] * c[0] + F0.Y[0] * c[1] + F0.Z[0] * c[2], F0.C[1] + F0.X[1] * c[0] + F0.Y[1] * c[1] + F0.Z[1] * c[2], F0.C[2] + F0.X[2] * c[0] + F0.Y[2] * c[1] + F0.Z[2] * c[2]],
        t(F0.X, sx), t(F0.Y, sy), t(F0.Z, sz));
    }
    fn(); b.F = F0;
  };

  const parts = {
    pelvis(b) {
      // pantaloni sui fianchi e falde della giacca sotto la cintura
      b.sph(0, -0.03, 0, 0.165, GI, Object.assign({ s: [1, 0.62, 0.74] }, giO));
      ell(b, [0, 0, 0], 1, 1, 0.68, () => b.cyl(0, -0.02, 0, 0.178, 0.2, GI, Object.assign({ r2: 0.168, seg: 18 }, giO)));
    },
    torso(b) {
      ell(b, [0, 0, 0], 1, 1, 0.62, () => {
        b.cyl(0, 0.17, 0, 0.168, 0.26, GI, Object.assign({ r2: 0.19, seg: 18 }, giO));        // vita → petto
        b.sph(0, 0.36, 0, 0.19, GI, Object.assign({ s: [1, 0.72, 1], seg: 18 }, giO));        // petto e spalle
      });
      // cintura nera attorno alla vita, nodo e due capi davanti
      const N = 18;
      for (let i = 0; i < N; i++) {
        const a0 = i / N * 2 * Math.PI, a1 = (i + 1) / N * 2 * Math.PI, R = 0.176;
        b.beam([Math.cos(a0) * R, 0.065, Math.sin(a0) * R * 0.7], [Math.cos(a1) * R, 0.065, Math.sin(a1) * R * 0.7], 0.016, 0.05, BELT, { g: 0.12 });
      }
      b.box(0, 0.066, 0.128, 0.06, 0.05, 0.03, BELT, { g: 0.12 });
      b.beam([-0.012, 0.05, 0.138], [-0.05, -0.17, 0.142], 0.012, 0.044, BELT, { g: 0.12 });
      b.beam([0.012, 0.05, 0.138], [0.045, -0.165, 0.14], 0.012, 0.044, BELT, { g: 0.12 });
      // bavero incrociato (sinistro sopra destro) e scollo a V
      b.beam([-0.075, 0.535, 0.03], [0.07, 0.11, 0.122], 0.014, 0.05, GI2, gi2O);
      b.beam([0.075, 0.535, 0.03], [-0.035, 0.2, 0.112], 0.012, 0.05, GI2, gi2O);
      b.sph(0, 0.47, 0.055, 0.05, SKIN, Object.assign({ s: [0.9, 1.3, 0.55] }, skO));
      b.cyl(0, 0.545, 0, 0.05, 0.1, SKIN, skO);                                               // collo
    },
    head(b) {
      b.sph(0, 0.11, 0.008, 0.103, SKIN, Object.assign({ s: [0.9, 1.15, 1.02], seg: 18 }, skO));
      b.sph(0, 0.142, -0.014, 0.106, HAIR, { s: [0.94, 1.02, 1.0], seg: 18, g: 0.2 });          // capelli corti
      b.sph(0, 0.098, 0.106, 0.019, SKIN, Object.assign({ s: [0.8, 1.2, 1] }, skO));          // naso
      for (const s of [-1, 1]) {
        b.sph(s * 0.093, 0.105, 0.0, 0.022, SKIN, Object.assign({ s: [0.5, 1.1, 0.8] }, skO)); // orecchie
        b.sph(s * 0.034, 0.127, 0.094, 0.011, '#20160f', { g: 0.5 });                           // occhi
        b.box(s * 0.035, 0.148, 0.098, 0.034, 0.007, 0.01, HAIR, {});                           // sopracciglia
      }
      b.box(0, 0.06, 0.102, 0.04, 0.007, 0.01, '#9a5a48', {});                                  // bocca
    },
    uarm(b) {
      b.sph(0, -0.01, 0, 0.06, GI, giO);
      b.cyl(0, -UARM / 2, 0, 0.054, UARM, GI, Object.assign({ r2: 0.06, seg: 14 }, giO));
    },
    farm(b) {
      b.sph(0, 0, 0, 0.056, GI, giO);
      b.cyl(0, -0.085, 0, 0.056, 0.17, GI, Object.assign({ r2: 0.058, seg: 14 }, giO));        // manica larga a 3/4
      b.cyl(0, -0.2, 0, 0.03, 0.08, SKIN, Object.assign({ r2: 0.036 }, skO));                  // polso
      b.sph(0, -0.282, 0.004, 0.043, SKIN, Object.assign({ s: [0.5, 1.15, 0.95] }, skO));      // mano
      b.sph(0.006, -0.255, 0.04, 0.018, SKIN, Object.assign({ s: [0.8, 1.6, 0.9] }, skO));      // pollice
    },
    thigh(b) {
      b.sph(0, 0, 0, 0.092, GI, giO);
      b.cyl(0, -THIGH / 2, 0, 0.074, THIGH, GI, Object.assign({ r2: 0.094, seg: 14 }, giO));
    },
    shin(b) {
      b.sph(0, 0, 0, 0.074, GI, giO);
      b.cyl(0, -0.2, 0, 0.07, 0.4, GI, Object.assign({ r2: 0.074, seg: 14 }, giO));            // pantalone largo
      b.cyl(0, -0.41, 0, 0.038, 0.07, SKIN, Object.assign({ r2: 0.042 }, skO));                // caviglia
    },
    foot(b) {
      b.sph(0, -0.038, 0.045, 0.05, SKIN, Object.assign({ s: [0.92, 0.6, 2.15] }, skO));       // piede scalzo
      b.sph(0, -0.03, -0.01, 0.042, SKIN, Object.assign({ s: [1, 0.85, 1.05] }, skO));         // tallone
    },
  };

  /* matrici di supporto */
  const rx = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
  const rz = a => { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
  const T = (x, y, z) => M4.compose(x, y, z, 0);
  const RY = a => M4.compose(0, 0, 0, a);
  const mul = (...ms) => ms.reduce((a, b) => M4.mul(a, b));

  /* posa: ph fase del passo (rad), w quanto sta camminando (0..1.3) */
  function pose(ph, w) {
    const s = Math.sin(ph), c = Math.cos(ph), sw = v => Math.max(0, v);
    const leg = (p) => {
      const sp = Math.sin(p), cp = Math.cos(p);
      const hip = 0.4 * w * sp;                                    // avanti positivo
      const knee = w * (0.06 + 0.95 * sw(cp) * sw(cp) + 0.12 * sw(-sp));
      const ank = -(hip - knee) * 0.85 - 0.25 * w * sw(-Math.sin(p - 0.5)) * sw(-cp);
      return { hip, knee, ank };
    };
    return {
      bob: -0.012 * w + 0.02 * w * Math.cos(2 * ph),
      sway: 0.018 * w * c,
      pYaw: 0.08 * w * s, tYaw: -0.13 * w * s, roll: 0.035 * w * c,
      L: leg(ph), R: leg(ph + Math.PI),
      armL: -0.36 * w * s, armR: 0.36 * w * s,
      elbL: 0.22 + 0.32 * w * sw(-s), elbR: 0.22 + 0.32 * w * sw(s),
      lean: 0.05 * Math.min(1, w),
    };
  }

  /* elenco {key, m} delle parti per una posa, a partire dalla matrice del corpo (piedi a terra, fronte +Z) */
  function matrices(root, P) {
    const out = [];
    const pel = mul(root, T(P.sway, HIP_Y + P.bob, 0), RY(P.pYaw), rz(P.roll));
    out.push(['pelvis', pel]);
    const tor = mul(pel, RY(P.tYaw), rx(P.lean), rz(-P.roll * 1.4));
    out.push(['torso', tor]);
    out.push(['head', mul(tor, T(0, NECK_Y, 0), RY(-(P.pYaw + P.tYaw) * 0.8), rx(-P.lean * 0.8))]);
    for (const [sd, L, arm, elb] of [[-1, P.L, P.armL, P.elbL], [1, P.R, P.armR, P.elbR]]) {
      const th = mul(pel, T(sd * HIP_X, 0, 0), rz(-P.roll), rx(-L.hip));
      const sh = mul(th, T(0, -THIGH, 0), rx(L.knee));
      out.push(['thigh', th], ['shin', sh], ['foot', mul(sh, T(0, -SHIN, 0), rx(-L.ank))]);
      const ua = mul(tor, T(sd * SH_X, SH_Y, 0), rz(sd * 0.07), rx(-arm));
      out.push(['uarm', ua], ['farm', mul(ua, T(0, -UARM, 0), rx(-elb))]);
    }
    return out;
  }

  /* figura ferma in un unico pezzo (per l'attrezzo "Karateka 175 cm" del catalogo) */
  function buildStatic(b) {
    const P = pose(0, 0);
    for (const [k, m] of matrices(M4.compose(0, 0, 0, 0), P)) {
      b.frame([m[12], m[13], m[14]], [m[0], m[1], m[2]], [m[4], m[5], m[6]], [m[8], m[9], m[10]]);
      parts[k](b);
    }
    b.frame(null);
  }

  return { parts, pose, matrices, buildStatic, STRIDE: 1.42 };
})();
