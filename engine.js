'use strict';
/* Motore 3D minimale (WebGL2): matematica, costruttore di mesh, rendering con ombre. */
const { cos, sin, tan, PI, abs, min, max, sqrt, floor, ceil, round, atan2, hypot } = Math;

const V3 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => hypot(a[0], a[1], a[2]),
  norm: a => { const l = hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

const M4 = {
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  },
  persp(fovy, asp, n, f) {
    const t = 1 / tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  },
  ortho(l, r, b, t, n, f) {
    const o = new Float32Array(16);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
    return o;
  },
  lookAt(e, c, u) {
    const z = V3.norm(V3.sub(e, c)), x = V3.norm(V3.cross(u, z)), y = V3.cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -V3.dot(x, e), -V3.dot(y, e), -V3.dot(z, e), 1]);
  },
  /* traslazione * rotazione attorno a Y * scala */
  compose(tx, ty, tz, ry, sx = 1, sy = 1, sz = 1) {
    const c = cos(ry), s = sin(ry);
    return new Float32Array([c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sz, 0, c * sz, 0, tx, ty, tz, 1]);
  },
  invert(m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
      a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10,
      b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
      b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30,
      b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    det = 1 / (det || 1e-12);
    const o = new Float32Array(16);
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
  /* trasforma un punto con divisione prospettica */
  tp(m, p) {
    const x = p[0], y = p[1], z = p[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
    return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
      (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];
  },
};

const _colCache = new Map();
function colLin(hex) {
  let c = _colCache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => Math.pow(v / 255, 2.2));
    _colCache.set(hex, c);
  }
  return c;
}

/* Costruttore di mesh: 11 float per vertice (pos, normale, colore, emissivo, lucido).
   Ogni primitiva ha una base locale (C,X,Y,Z); `frame` aggiunge una base esterna. */
/* materiali: ognuno ha una trama procedurale (vedi makeDetailLayer) */
const MAT = { PLAIN: 0, WOOD: 1, TATAMI: 2, RUBBER: 3, METAL: 4, CONCRETE: 5, PLASTER: 6, LEATHER: 7, PAPER: 8, GRASS: 9 };
const MAT_COUNT = 10;
const _matCache = new Map();
/* colori del catalogo che corrispondono a un materiale preciso (imbottiture, gomma, carta) */
const COLOR_MAT = { '#2b2d31': 7, '#26272b': 7, '#8c1f1a': 7, '#efe3c6': 7, '#2f5fa8': 7, '#232427': 3, '#b0352c': 3, '#1f2023': 3, '#f4efe2': 8, '#f6e4bb': 8, '#c99a7a': 0 };
/* materiale dedotto dal colore quando l'oggetto non lo dichiara: metallo se lucido, legno se marrone */
function guessMat(hex, o) {
  if (o && o.m != null) return o.m;
  if (o && o.e >= 0.5) return MAT.PLAIN;
  if (o && o.g >= 0.6) return MAT.METAL;
  if (COLOR_MAT[hex] != null) return COLOR_MAT[hex];
  let m = _matCache.get(hex);
  if (m != null) return m;
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = max(r, g, b), mn = min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  m = MAT.PLAIN;
  if (d > 1e-3) {
    const sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360;
    if (h >= 15 && h <= 42 && sat > 0.2 && l > 0.12 && l < 0.86) m = MAT.WOOD;
  }
  _matCache.set(hex, m);
  return m;
}

class MB {
  constructor() {
    this.a = [];
    this.C = [0, 0, 0]; this.X = [1, 0, 0]; this.Y = [0, 1, 0]; this.Z = [0, 0, 1];
    this.F = null; this.c = [1, 1, 1]; this.e = 0; this.g = 0; this.m = 0;
  }
  get count() { return this.a.length / 12; }
  frame(C, X, Y, Z) { this.F = C ? { C, X, Y, Z } : null; return this; }
  _mat(hex, o) { this.c = colLin(hex); this.e = (o && o.e) || 0; this.g = (o && o.g) || 0; this.m = guessMat(hex, o); }
  _euler(c, r) {
    this.C = c;
    if (!r) { this.X = [1, 0, 0]; this.Y = [0, 1, 0]; this.Z = [0, 0, 1]; return; }
    const cx = cos(r[0]), sx = sin(r[0]), cy = cos(r[1]), sy = sin(r[1]), cz = cos(r[2]), sz = sin(r[2]);
    // R = Ry * Rx * Rz (colonne = immagini degli assi)
    this.X = [cy * cz + sy * sx * sz, cx * sz, -sy * cz + cy * sx * sz];
    this.Y = [-cy * sz + sy * sx * cz, cx * cz, sy * sz + cy * sx * cz];
    this.Z = [sy * cx, -sx, cy * cx];
  }
  _dir(p0, p1) {
    const Y = V3.norm(V3.sub(p1, p0));
    let X, Z;
    if (abs(Y[1]) > 0.999) { X = [1, 0, 0]; Z = V3.cross(X, Y); }
    else { X = V3.norm(V3.cross([0, 1, 0], Y)); Z = V3.cross(X, Y); }
    this.C = V3.mul(V3.add(p0, p1), 0.5); this.X = X; this.Y = Y; this.Z = Z;
    return V3.len(V3.sub(p1, p0));
  }
  _v(x, y, z, nx, ny, nz) {
    const X = this.X, Y = this.Y, Z = this.Z, C = this.C;
    let px = C[0] + X[0] * x + Y[0] * y + Z[0] * z, py = C[1] + X[1] * x + Y[1] * y + Z[1] * z, pz = C[2] + X[2] * x + Y[2] * y + Z[2] * z;
    let qx = X[0] * nx + Y[0] * ny + Z[0] * nz, qy = X[1] * nx + Y[1] * ny + Z[1] * nz, qz = X[2] * nx + Y[2] * ny + Z[2] * nz;
    const F = this.F;
    if (F) {
      const a = px, b = py, c = pz, d = qx, e = qy, f = qz;
      px = F.C[0] + F.X[0] * a + F.Y[0] * b + F.Z[0] * c; py = F.C[1] + F.X[1] * a + F.Y[1] * b + F.Z[1] * c; pz = F.C[2] + F.X[2] * a + F.Y[2] * b + F.Z[2] * c;
      qx = F.X[0] * d + F.Y[0] * e + F.Z[0] * f; qy = F.X[1] * d + F.Y[1] * e + F.Z[1] * f; qz = F.X[2] * d + F.Y[2] * e + F.Z[2] * f;
    }
    this.a.push(px, py, pz, qx, qy, qz, this.c[0], this.c[1], this.c[2], this.e, this.g, this.m);
  }
  _quad(p0, p1, p2, p3, n) {
    this._v(p0[0], p0[1], p0[2], n[0], n[1], n[2]); this._v(p1[0], p1[1], p1[2], n[0], n[1], n[2]); this._v(p2[0], p2[1], p2[2], n[0], n[1], n[2]);
    this._v(p0[0], p0[1], p0[2], n[0], n[1], n[2]); this._v(p2[0], p2[1], p2[2], n[0], n[1], n[2]); this._v(p3[0], p3[1], p3[2], n[0], n[1], n[2]);
  }
  _box(w, h, d) {
    const x = w / 2, y = h / 2, z = d / 2;
    this._quad([x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z], [1, 0, 0]);
    this._quad([-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z], [-1, 0, 0]);
    this._quad([-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z], [0, 1, 0]);
    this._quad([-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z], [0, -1, 0]);
    this._quad([-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]);
    this._quad([x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]);
  }
  _cyl(r1, r2, h, seg) {
    const y0 = -h / 2, y1 = h / 2, sl = (r1 - r2) / h, nl = hypot(1, sl);
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 2 * PI, a1 = (i + 1) / seg * 2 * PI;
      const c0 = cos(a0), s0 = sin(a0), c1 = cos(a1), s1 = sin(a1);
      const n0 = [c0 / nl, sl / nl, s0 / nl], n1 = [c1 / nl, sl / nl, s1 / nl];
      this._v(r1 * c0, y0, r1 * s0, n0[0], n0[1], n0[2]); this._v(r2 * c0, y1, r2 * s0, n0[0], n0[1], n0[2]); this._v(r2 * c1, y1, r2 * s1, n1[0], n1[1], n1[2]);
      this._v(r1 * c0, y0, r1 * s0, n0[0], n0[1], n0[2]); this._v(r2 * c1, y1, r2 * s1, n1[0], n1[1], n1[2]); this._v(r1 * c1, y0, r1 * s1, n1[0], n1[1], n1[2]);
      if (r2 > 0) { this._v(0, y1, 0, 0, 1, 0); this._v(r2 * c0, y1, r2 * s0, 0, 1, 0); this._v(r2 * c1, y1, r2 * s1, 0, 1, 0); }
      if (r1 > 0) { this._v(0, y0, 0, 0, -1, 0); this._v(r1 * c1, y0, r1 * s1, 0, -1, 0); this._v(r1 * c0, y0, r1 * s0, 0, -1, 0); }
    }
  }
  /* parallelepipedo centrato in (x,y,z); o.r = [rx,ry,rz] */
  box(x, y, z, w, h, d, hex, o) { this._mat(hex, o); this._euler([x, y, z], o && o.r); this._box(w, h, d); return this; }
  /* barra a sezione rettangolare tra due punti */
  beam(p0, p1, w, d, hex, o) { this._mat(hex, o); const l = this._dir(p0, p1); this._box(w, l, d); return this; }
  /* cilindro centrato; o.axis 'x'|'y'|'z', o.r2 raggio in cima, o.seg */
  cyl(x, y, z, r, h, hex, o) {
    this._mat(hex, o);
    const ax = (o && o.axis) || 'y';
    this._euler([x, y, z], ax === 'x' ? [0, 0, -PI / 2] : ax === 'z' ? [PI / 2, 0, 0] : (o && o.r) || null);
    this._cyl(r, o && o.r2 != null ? o.r2 : r, h, MB.seg((o && o.seg) || 14));
    return this;
  }
  /* tubo tra due punti */
  tube(p0, p1, r, hex, o) { this._mat(hex, o); const l = this._dir(p0, p1); this._cyl(r, r, l, MB.seg((o && o.seg) || 10)); return this; }
  /* sfera / ellissoide (o.s = [sx,sy,sz]) */
  sph(x, y, z, r, hex, o) {
    this._mat(hex, o); this._euler([x, y, z], o && o.r);
    const s = (o && o.s) || [1, 1, 1], NU = MB.seg((o && o.seg) || 16), NV = MB.seg(10);
    const P = (u, v) => {
      const th = u / NU * 2 * PI, ph = v / NV * PI;
      const n = [sin(ph) * cos(th), cos(ph), sin(ph) * sin(th)];
      const nn = V3.norm([n[0] / s[0], n[1] / s[1], n[2] / s[2]]);
      return [n[0] * r * s[0], n[1] * r * s[1], n[2] * r * s[2], nn[0], nn[1], nn[2]];
    };
    for (let u = 0; u < NU; u++) for (let v = 0; v < NV; v++) {
      const a = P(u, v), b = P(u + 1, v), c = P(u + 1, v + 1), d = P(u, v + 1);
      for (const q of [a, b, c, a, c, d]) this._v(q[0], q[1], q[2], q[3], q[4], q[5]);
    }
    return this;
  }
  /* toro: anello nel piano XZ locale; o.r rotazione, o.a0/o.a1 arco */
  tor(x, y, z, R, r, hex, o) {
    this._mat(hex, o); this._euler([x, y, z], o && o.r);
    const a0 = (o && o.a0) || 0, a1 = o && o.a1 != null ? o.a1 : 2 * PI, NU = MB.seg((o && o.seg) || 20), NV = MB.seg(8);
    const P = (i, j) => {
      const u = a0 + (a1 - a0) * i / NU, v = j / NV * 2 * PI;
      return [(R + r * cos(v)) * cos(u), r * sin(v), (R + r * cos(v)) * sin(u), cos(v) * cos(u), sin(v), cos(v) * sin(u)];
    };
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1);
      for (const q of [a, b, c, a, c, d]) this._v(q[0], q[1], q[2], q[3], q[4], q[5]);
    }
    return this;
  }
  /* pezzo di parete: lungo X locale da u0 a u1, da yb fino a yt0/yt1, spessore t verso -Z */
  prism(u0, u1, yb, yt0, yt1, t, hex, o) {
    this._mat(hex, o); this._euler([0, 0, 0], null);
    this._quad([u0, yb, 0], [u1, yb, 0], [u1, yt1, 0], [u0, yt0, 0], [0, 0, 1]);
    this._quad([u1, yb, -t], [u0, yb, -t], [u0, yt0, -t], [u1, yt1, -t], [0, 0, -1]);
    const tn = V3.norm([-(yt1 - yt0), u1 - u0, 0]);
    this._quad([u0, yt0, 0], [u1, yt1, 0], [u1, yt1, -t], [u0, yt0, -t], tn);
    if (yb > 0) this._quad([u0, yb, -t], [u1, yb, -t], [u1, yb, 0], [u0, yb, 0], [0, -1, 0]);
    this._quad([u0, yb, -t], [u0, yb, 0], [u0, yt0, 0], [u0, yt0, -t], [-1, 0, 0]);
    this._quad([u1, yb, 0], [u1, yb, -t], [u1, yt1, -t], [u1, yt1, 0], [1, 0, 0]);
    return this;
  }
  static seg(n) { return round(n * MB.detail); }
}
MB.detail = 1;   // 1,6 in alta qualità: cilindri, sfere e anelli più lisci

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCol; layout(location=3) in vec3 aMat;
uniform mat4 uVP, uModel, uLightVP;
out vec3 vN, vW, vC, vM, vP, vNl; out vec4 vL;
void main(){ vec4 w = uModel*vec4(aPos,1.0); vW = w.xyz; vN = mat3(uModel)*aNor; vC = aCol; vM = aMat; vP = aPos; vNl = aNor; vL = uLightVP*w; gl_Position = uVP*w; }`;
/* parti comuni: ombre morbide, occlusione negli angoli della sala, tone mapping */
const GLSL_COMMON = `
uniform sampler2DShadow uShadow; uniform vec3 uEye, uLightDir; uniform vec4 uRoom; uniform float uShadowOn, uTexel, uSoft, uExposure;
const vec2 PD[12] = vec2[12](vec2(-0.326,-0.406),vec2(-0.840,-0.074),vec2(-0.696,0.457),vec2(-0.203,0.621),vec2(0.962,-0.195),vec2(0.473,-0.480),vec2(0.519,0.767),vec2(0.185,-0.893),vec2(0.507,0.064),vec2(0.896,0.412),vec2(-0.322,-0.933),vec2(-0.792,-0.598));
float shadowF(vec4 L, vec3 n){
  vec3 p = L.xyz/L.w*0.5+0.5;
  if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0) return 1.0;
  float b = 0.0004 + 0.0012*(1.0-clamp(dot(n,uLightDir),0.0,1.0));
  float a = 6.2831*fract(52.9829*fract(dot(gl_FragCoord.xy, vec2(0.06711,0.00584))));
  mat2 R = mat2(cos(a), sin(a), -sin(a), cos(a));
  float s = 0.0;
  for(int i=0;i<12;i++) s += texture(uShadow, vec3(p.xy + R*PD[i]*uTexel*uSoft, p.z-b));
  return s/12.0;
}
float roomAO(vec3 P){
  if(uRoom.x <= 0.0) return 1.0;
  if(P.x < -0.02 || P.z < -0.02 || P.x > uRoom.x+0.02 || P.z > uRoom.y+0.02) return 1.0;
  float a = 1.0, d;
  d = P.y; if(d > 0.05) a *= mix(0.58, 1.0, smoothstep(0.0, 0.85, d));
  d = P.z; if(d > 0.03) a *= mix(0.68, 1.0, smoothstep(0.0, 0.75, d));
  d = uRoom.y - P.z; if(d > 0.03) a *= mix(0.68, 1.0, smoothstep(0.0, 0.75, d));
  d = P.x; if(d > 0.03) a *= mix(0.68, 1.0, smoothstep(0.0, 0.75, d));
  d = uRoom.x - P.x; if(d > 0.03) a *= mix(0.68, 1.0, smoothstep(0.0, 0.75, d));
  return a;
}
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }
const vec3 SUN = vec3(1.0,0.95,0.88)*3.1;
const vec3 SKY_UP = vec3(0.80,0.86,0.97), SKY_DN = vec3(0.52,0.47,0.42);
`;
const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow; precision highp sampler2DArray;
uniform sampler2DArray uDetail; uniform vec4 uTint; uniform float uTexOn;
in vec3 vN, vW, vC, vM, vP, vNl; in vec4 vL; out vec4 o;
${GLSL_COMMON}
/* per materiale: metri per ripetizione della trama, intensità del colore, rilievo */
const float SC[10] = float[10](1.2, 0.9, 0.42, 0.5, 0.6, 1.6, 1.4, 0.35, 0.7, 0.4);
const float AM[10] = float[10](0.08, 0.42, 0.26, 0.30, 0.16, 0.36, 0.10, 0.26, 0.16, 0.45);
const float BU[10] = float[10](0.10, 0.50, 1.00, 0.80, 0.30, 0.80, 0.45, 0.70, 0.35, 1.00);
vec4 tri(vec3 P, vec3 N, float layer, float sc, bool vert){
  vec3 w = pow(abs(N), vec3(6.0)); w /= (w.x+w.y+w.z+1e-5);
  // legno: sulle facce verticali le venature corrono in verticale, lungo le doghe
  vec2 px = vert ? P.yz : P.zy, pz = vert ? P.yx : P.xy;
  return texture(uDetail, vec3(px/sc, layer))*w.x + texture(uDetail, vec3(P.xz/sc, layer))*w.y + texture(uDetail, vec3(pz/sc, layer))*w.z;
}
vec3 bump(vec3 N, vec3 P, float h, float k){
  vec3 dpx = dFdx(P), dpy = dFdy(P); float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx); float det = dot(dpx, r1);
  vec3 g = sign(det)*(dhx*r1 + dhy*r2);
  return normalize(abs(det)*N - k*g);
}
void main(){
  vec3 n = normalize(vN);
  int mi = int(vM.z + 0.5);
  vec3 alb = vC;
  float rough = mix(0.86, 0.24, vM.y);
  float metal = mi == 4 ? 0.85 : 0.0;
  if(uTexOn > 0.5 && vM.x < 0.5){
    vec4 t = tri(vP, normalize(vNl), float(mi), SC[mi], mi == 1);
    alb *= clamp(1.0 + (t.r-0.5)*2.0*AM[mi], 0.25, 1.8);
    rough = clamp(rough + (t.b-0.5)*0.35, 0.08, 1.0);
    n = bump(n, vW, t.g, BU[mi]*0.0025);
  }
  vec3 V = normalize(uEye - vW), L = uLightDir, H = normalize(L + V);
  float NdL = max(dot(n,L),0.0), NdV = max(dot(n,V),1e-3), NdH = max(dot(n,H),0.0), VdH = max(dot(V,H),0.0);
  float sh = uShadowOn > 0.5 ? shadowF(vL, n) : 1.0;
  float ao = roomAO(vW);
  float a = rough*rough, a2 = a*a, dd = NdH*NdH*(a2-1.0)+1.0, D = a2/(3.14159*dd*dd);
  float k = (rough+1.0)*(rough+1.0)/8.0, G = NdL/(NdL*(1.0-k)+k) * NdV/(NdV*(1.0-k)+k);
  vec3 F0 = mix(vec3(0.04), alb, metal), F = F0 + (1.0-F0)*pow(1.0-VdH, 5.0);
  vec3 kd = (1.0-F)*(1.0-metal);
  vec3 direct = (kd*alb/3.14159 + D*G*F/(4.0*NdL*NdV+1e-4)) * SUN * NdL * sh;
  vec3 amb = mix(SKY_DN, SKY_UP, n.y*0.5+0.5);
  vec3 R = reflect(-V, n), env = mix(SKY_DN, SKY_UP*1.15, clamp(R.y*0.5+0.5, 0.0, 1.0));
  vec3 Fa = F0 + (max(vec3(1.0-rough), F0)-F0)*pow(1.0-NdV, 5.0);
  vec3 ambient = (kd*alb*amb*0.82 + Fa*env*(1.0-rough*0.75)*0.55) * ao;
  vec3 c = direct + ambient;
  c = mix(c, alb*1.7, vM.x);
  c = mix(c, uTint.rgb*1.4, uTint.a);
  o = vec4(pow(aces(c*uExposure), vec3(1.0/2.2)), 1.0);
}`;
const VS_SH = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uLightVP, uModel;
void main(){ gl_Position = uLightVP*uModel*vec4(aPos,1.0); }`;
const FS_SH = `#version 300 es
precision mediump float; void main(){}`;
/* decorazioni: rettangoli con immagine (pareti e pavimento), con luce e ombre come il resto della sala */
const VS_T = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV;
uniform mat4 uVP, uModel, uLightVP;
out vec3 vN, vW; out vec2 vUV; out vec4 vL;
void main(){ vec4 w = uModel*vec4(aPos,1.0); vW = w.xyz; vN = mat3(uModel)*aNor; vUV = aUV; vL = uLightVP*w; gl_Position = uVP*w; }`;
const FS_T = `#version 300 es
precision highp float; precision highp sampler2DShadow;
uniform sampler2D uTex; uniform float uAlpha;
in vec3 vN, vW; in vec2 vUV; in vec4 vL; out vec4 o;
${GLSL_COMMON}
void main(){
  vec4 t = texture(uTex, vUV);
  if(t.a < 0.01) discard;
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  float NdL = max(dot(n,uLightDir),0.0);
  float sh = uShadowOn>0.5 ? shadowF(vL, n) : 1.0;
  vec3 alb = pow(t.rgb, vec3(2.2));
  vec3 c = alb*(SUN*NdL*sh*0.96/3.14159 + mix(SKY_DN, SKY_UP, n.y*0.5+0.5)*0.82*roomAO(vW));
  o = vec4(pow(aces(c*uExposure), vec3(1.0/2.2)), t.a*uAlpha);
}`;

/* ---- trame procedurali ripetibili (rumore periodico), una per materiale: R = colore, G = rilievo, B = ruvidità ---- */
function _h(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, px, py, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px, y0 = ((yi % py) + py) % py, x1 = (x0 + 1) % px, y1 = (y0 + 1) % py;
  const a = _h(x0, y0, s), b = _h(x1, y0, s), c = _h(x0, y1, s), d = _h(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(u, v, fx, fy, oct, s) { let a = 0.5, t = 0, n = 0, m = 1; for (let i = 0; i < oct; i++) { t += a * vnoise(u * fx * m, v * fy * m, fx * m, fy * m, s + i * 31); n += a; a *= 0.5; m *= 2; } return t / n; }
function makeDetailLayer(layer, S, out) {
  const T = 2 * PI;
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S, v = j / S; let r = 0.5, g = 0.5, b = 0.5;
    switch (layer) {
      case 0: { const n = fbm(u, v, 8, 8, 3, 1); r = 0.5 + (n - 0.5) * 0.5; g = n; break; }
      case 1: { // legno: anelli deformati e fibre fitte
        const w = fbm(u, v, 3, 4, 3, 2), rings = 0.5 + 0.5 * sin((v * 14 + w * 1.1) * T), fib = vnoise(u * 5, v * 170, 5, 170, 3);
        r = 0.5 + (rings - 0.5) * 0.3 + (fib - 0.5) * 0.42; g = 0.5 + (fib - 0.5) * 0.75 + (rings - 0.5) * 0.15; b = 0.5 + (rings - 0.5) * 0.3; break; }
      case 2: { // tatami: righe sottili come la paglia intrecciata
        const ridge = 0.5 + 0.5 * sin(v * 96 * T), straw = vnoise(u * 28, v * 96, 28, 96, 4), n = fbm(u, v, 6, 6, 2, 5);
        r = 0.5 + (ridge - 0.5) * 0.22 + (straw - 0.5) * 0.25 + (n - 0.5) * 0.2; g = ridge * 0.65 + straw * 0.35; b = 0.5 + (ridge - 0.5) * 0.25; break; }
      case 3: { // gomma: granuli con scaglie chiare
        const n = fbm(u, v, 72, 72, 2, 6), cx = Math.floor(u * 140), cy = Math.floor(v * 140), fl = _h(cx, cy, 7) > 0.93 ? 1 : 0;
        r = 0.5 + (n - 0.5) * 0.35 + fl * 0.32; g = n * 0.75 + fl * 0.25; b = 0.56; break; }
      case 4: { const st = fbm(u, v, 3, 220, 2, 8); r = 0.5 + (st - 0.5) * 0.2; g = 0.5 + (st - 0.5) * 0.3; b = 0.5 + (st - 0.5) * 0.6; break; }
      case 5: { // cemento: macchie e pori
        const big = fbm(u, v, 5, 5, 4, 9), fine = vnoise(u * 90, v * 90, 90, 90, 10), pore = _h(Math.floor(u * 170), Math.floor(v * 170), 11) > 0.965 ? 1 : 0;
        r = 0.5 + (big - 0.5) * 0.7 + (fine - 0.5) * 0.15 - pore * 0.25; g = big * 0.5 + fine * 0.5 - pore * 0.35; b = 0.5 + (big - 0.5) * 0.3; break; }
      case 6: { const n = fbm(u, v, 14, 14, 3, 12), fine = vnoise(u * 120, v * 120, 120, 120, 13); r = 0.5 + (n - 0.5) * 0.3 + (fine - 0.5) * 0.08; g = n * 0.45 + fine * 0.55; break; }
      case 7: { const n = fbm(u, v, 44, 44, 3, 14), cr = fbm(u, v, 6, 6, 2, 15); r = 0.5 + (n - 0.5) * 0.35 + (cr - 0.5) * 0.2; g = n; b = 0.5 + (n - 0.5) * 0.3; break; }
      case 8: { const n = fbm(u, v, 18, 18, 3, 16), f = Math.max(vnoise(u * 7, v * 110, 7, 110, 17), vnoise(u * 110, v * 7, 110, 7, 18)); r = 0.5 + (n - 0.5) * 0.25 + (f - 0.5) * 0.18; g = n * 0.6 + f * 0.4; break; }
      case 9: { const bl = vnoise(u * 170, v * 14, 170, 14, 19), n = fbm(u, v, 16, 16, 2, 20); r = 0.5 + (bl - 0.5) * 0.65 + (n - 0.5) * 0.3; g = bl; b = 0.6; break; }
    }
    const k = (j * S + i) * 4;
    out[k] = clamp01(r) * 255; out[k + 1] = clamp01(g) * 255; out[k + 2] = clamp01(b) * 255; out[k + 3] = 255;
  }
}
const clamp01 = x => x < 0 ? 0 : x > 1 ? 1 : x;

class Engine {
  constructor(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 non disponibile');
    this.gl = gl; this.canvas = canvas; this.hq = opts.hq !== false;
    this.exposure = 0.9; this.room = [0, 0, 0, 0]; this.texOn = 0;
    this.prog = this._program(VS, FS); this.progSh = this._program(VS_SH, FS_SH);
    const COMMON_U = ['uShadow', 'uEye', 'uLightDir', 'uRoom', 'uShadowOn', 'uTexel', 'uSoft', 'uExposure'];
    this.u = {}; for (const n of ['uVP', 'uModel', 'uLightVP', 'uTint', 'uDetail', 'uTexOn', ...COMMON_U]) this.u[n] = gl.getUniformLocation(this.prog, n);
    this.us = { uLightVP: gl.getUniformLocation(this.progSh, 'uLightVP'), uModel: gl.getUniformLocation(this.progSh, 'uModel') };
    this.progT = this._program(VS_T, FS_T);
    this.ut = {}; for (const n of ['uVP', 'uModel', 'uLightVP', 'uTex', 'uAlpha', ...COMMON_U]) this.ut[n] = gl.getUniformLocation(this.progT, n);
    /* rettangolo unitario centrato, normale +Z, coordinate immagine (v=1 in alto) */
    const q = new Float32Array([-0.5, -0.5, 0, 0, 0, 1, 0, 0, 0.5, -0.5, 0, 0, 0, 1, 1, 0, 0.5, 0.5, 0, 0, 0, 1, 1, 1,
      -0.5, -0.5, 0, 0, 0, 1, 0, 0, 0.5, 0.5, 0, 0, 0, 1, 1, 1, -0.5, 0.5, 0, 0, 0, 1, 0, 1]);
    this.quad = gl.createVertexArray(); const qb = gl.createBuffer();
    gl.bindVertexArray(this.quad); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, q, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
    gl.bindVertexArray(null);
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.SM = this.hq && gl.getParameter(gl.MAX_TEXTURE_SIZE) >= 4096 ? 4096 : 2048; this.soft = 2;
    this.shTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, this.SM, this.SM, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shTex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.lightDir = V3.norm([0.22, 1, 0.3]);
    this.lightVP = new Float32Array(16); this.lightVP[0] = this.lightVP[5] = this.lightVP[10] = this.lightVP[15] = 1;
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    this.initModels();
    /* trame dei materiali: array di texture, generato a pezzi dopo l'avvio per non bloccare la pagina */
    this.detail = gl.createTexture();
    this.detailSize = this.hq ? (opts.small ? 256 : 512) : 0;
    {
      const S = this.detailSize || 4, levels = Math.floor(Math.log2(S)) + 1;
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.detail);
      gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, S, S, MAT_COUNT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
      if (this.aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      if (!this.detailSize) {   // grafica semplice: trama neutra minuscola, così la texture è sempre completa
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, 4, 4, MAT_COUNT, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4 * 4 * 4 * MAT_COUNT).fill(128));
        gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      }
    }
  }
  /* genera le trame un materiale alla volta; onReady quando sono tutte pronte */
  buildDetail(onReady) {
    const S = this.detailSize; if (!S) return;
    const gl = this.gl, buf = new Uint8Array(S * S * 4);
    let layer = 0;
    const step = () => {
      makeDetailLayer(layer, S, buf);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.detail);
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, S, S, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      if (++layer < MAT_COUNT) { setTimeout(step, 0); return; }
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      this.texOn = 1; if (onReady) onReady();
    };
    setTimeout(step, 30);
  }
  _program(vs, fs) {
    const gl = this.gl, p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Program: ' + gl.getProgramInfoLog(p));
    return p;
  }
  mesh(mb) {
    const gl = this.gl, vao = gl.createVertexArray(), vbo = gl.createBuffer();
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.a), gl.STATIC_DRAW);
    const S = 48;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 3, gl.FLOAT, false, S, 36);
    gl.bindVertexArray(null);
    return { vao, vbo, n: mb.count };
  }
  /* immagine o canvas → texture con mipmap */
  texture(src) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  }
  freeTex(t) { if (t) this.gl.deleteTexture(t); }
  free(m) { if (!m) return; this.gl.deleteVertexArray(m.vao); this.gl.deleteBuffer(m.vbo); }
  /* inquadra il volume della sala nella mappa delle ombre */
  setShadowBounds(mn, mx) {
    const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const view = M4.lookAt(V3.add(c, V3.mul(this.lightDir, 60)), c, [0, 0, -1]);
    let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < 8; i++) {
      const p = M4.tp(view, [i & 1 ? mx[0] : mn[0], i & 2 ? mx[1] : mn[1], i & 4 ? mx[2] : mn[2]]);
      for (let k = 0; k < 3; k++) { lo[k] = min(lo[k], p[k]); hi[k] = max(hi[k], p[k]); }
    }
    this.lightVP = M4.mul(M4.ortho(lo[0] - 0.2, hi[0] + 0.2, lo[1] - 0.2, hi[1] + 0.2, -hi[2] - 1, -lo[2] + 1), view);
    // penombra di circa 2,5 cm, qualunque sia la risoluzione della mappa delle ombre
    const texelWorld = max(hi[0] - lo[0], hi[1] - lo[1]) / this.SM;
    this.soft = min(10, max(1.5, 0.025 / texelWorld));
  }
  /* draws: [{mesh, m, tint:[r,g,b,a]|null, cast}] */
  _common(u, eye, shadows, room) {
    const gl = this.gl;
    gl.uniformMatrix4fv(u.uLightVP, false, this.lightVP);
    gl.uniform3fv(u.uEye, eye); gl.uniform3fv(u.uLightDir, this.lightDir);
    gl.uniform1f(u.uShadowOn, shadows ? 1 : 0); gl.uniform1f(u.uTexel, 1 / this.SM); gl.uniform1f(u.uSoft, this.soft); gl.uniform1f(u.uExposure, this.exposure);
    gl.uniform4fv(u.uRoom, room || [0, 0, 0, 0]); gl.uniform1i(u.uShadow, 0);
  }
  render({ draws, view, proj, eye, clear, shadows, decals, room }) {
    const gl = this.gl;
    if (shadows) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFbo);
      gl.viewport(0, 0, this.SM, this.SM); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.progSh); gl.uniformMatrix4fv(this.us.uLightVP, false, this.lightVP);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
      for (const d of draws) if (d.cast) {
        gl.uniformMatrix4fv(this.us.uModel, false, d.m);
        if (d.model) this._drawModel(d.model, true);
        else if (d.mesh.n) { gl.bindVertexArray(d.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, d.mesh.n); }
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(clear[0], clear[1], clear[2], clear[3]); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uVP, false, M4.mul(proj, view));
    this._common(this.u, eye, shadows, room);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.detail); gl.uniform1i(this.u.uDetail, 2);
    gl.uniform1f(this.u.uTexOn, this.texOn);
    gl.activeTexture(gl.TEXTURE0);
    for (const d of draws) if (d.mesh && d.mesh.n) {
      gl.uniformMatrix4fv(this.u.uModel, false, d.m);
      const t = d.tint; gl.uniform4f(this.u.uTint, t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0, t ? t[3] : 0);
      gl.bindVertexArray(d.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, d.mesh.n);
    }
    if (draws.some(d => d.model)) {
      gl.useProgram(this.progP);
      gl.uniformMatrix4fv(this.up.uVP, false, M4.mul(proj, view));
      this._common(this.up, eye, shadows, room);
      gl.uniform1i(this.up.uBase, 3); gl.uniform1i(this.up.uMR, 4); gl.uniform1i(this.up.uNorm, 5); gl.uniform1i(this.up.uOcc, 6);
      for (const d of draws) if (d.model) {
        gl.uniformMatrix4fv(this.up.uModel, false, d.m); gl.uniformMatrix3fv(this.up.uNM, false, normalMat(d.m));
        const t = d.tint; gl.uniform4f(this.up.uTint, t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0, t ? t[3] : 0);
        this._drawModel(d.model, false);
      }
      gl.activeTexture(gl.TEXTURE0);
    }
    if (decals && decals.length) {
      gl.useProgram(this.progT);
      gl.uniformMatrix4fv(this.ut.uVP, false, M4.mul(proj, view));
      this._common(this.ut, eye, shadows, room);
      gl.uniform1i(this.ut.uTex, 1);
      gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -4); gl.depthMask(false);
      gl.bindVertexArray(this.quad); gl.activeTexture(gl.TEXTURE1);
      for (const d of decals) {
        gl.bindTexture(gl.TEXTURE_2D, d.tex);
        gl.uniformMatrix4fv(this.ut.uModel, false, d.m); gl.uniform1f(this.ut.uAlpha, d.alpha == null ? 1 : d.alpha);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      gl.depthMask(true); gl.disable(gl.POLYGON_OFFSET_FILL); gl.disable(gl.BLEND);
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.bindVertexArray(null);
  }
}

/* ---- modelli GLB (glTF 2.0 binario): geometria, trasformazioni dei nodi e materiali PBR ---- */
const VS_P = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec2 aUV;
uniform mat4 uVP, uModel, uLightVP; uniform mat3 uNM;
out vec3 vN, vW; out vec2 vUV; out vec4 vL;
void main(){ vec4 w = uModel*vec4(aPos,1.0); vW = w.xyz; vN = uNM*aNor; vUV = aUV; vL = uLightVP*w; gl_Position = uVP*w; }`;
const FS_P = `#version 300 es
precision highp float; precision highp sampler2DShadow;
uniform sampler2D uBase, uMR, uNorm, uOcc; uniform vec4 uBaseF, uTint; uniform vec3 uMRF; uniform float uHasNorm, uCut, uOccS;
in vec3 vN, vW; in vec2 vUV; in vec4 vL; out vec4 o;
${GLSL_COMMON}
vec3 perturb(vec3 N, vec3 P, vec2 uv, vec3 tn){
  vec3 dp1 = dFdx(P), dp2 = dFdy(P); vec2 du1 = dFdx(uv), du2 = dFdy(uv);
  vec3 dp2p = cross(dp2, N), dp1p = cross(N, dp1);
  vec3 T = dp2p*du1.x + dp1p*du2.x, B = dp2p*du1.y + dp1p*du2.y;
  float inv = inversesqrt(max(dot(T,T), dot(B,B)) + 1e-12);
  return normalize(mat3(T*inv, B*inv, N) * tn);
}
void main(){
  vec4 bc = texture(uBase, vUV) * uBaseF;
  if(bc.a < uCut) discard;
  vec3 alb = bc.rgb;
  vec4 mr = texture(uMR, vUV);
  float rough = clamp(mr.g * uMRF.y, 0.05, 1.0), metal = clamp(mr.b * uMRF.x, 0.0, 1.0);
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  if(uHasNorm > 0.5){ vec3 tn = texture(uNorm, vUV).xyz*2.0-1.0; tn.xy *= uMRF.z; n = perturb(n, vW, vUV, normalize(tn)); }
  vec3 V = normalize(uEye - vW), L = uLightDir, H = normalize(L + V);
  float NdL = max(dot(n,L),0.0), NdV = max(dot(n,V),1e-3), NdH = max(dot(n,H),0.0), VdH = max(dot(V,H),0.0);
  float sh = uShadowOn > 0.5 ? shadowF(vL, n) : 1.0;
  float ao = roomAO(vW) * mix(1.0, texture(uOcc, vUV).r, uOccS);
  float a = rough*rough, a2 = a*a, dd = NdH*NdH*(a2-1.0)+1.0, D = a2/(3.14159*dd*dd);
  float k = (rough+1.0)*(rough+1.0)/8.0, G = NdL/(NdL*(1.0-k)+k) * NdV/(NdV*(1.0-k)+k);
  vec3 F0 = mix(vec3(0.04), alb, metal), F = F0 + (1.0-F0)*pow(1.0-VdH, 5.0);
  vec3 kd = (1.0-F)*(1.0-metal);
  vec3 direct = (kd*alb/3.14159 + D*G*F/(4.0*NdL*NdV+1e-4)) * SUN * NdL * sh;
  vec3 amb = mix(SKY_DN, SKY_UP, n.y*0.5+0.5);
  vec3 R = reflect(-V, n), env = mix(SKY_DN, SKY_UP*1.15, clamp(R.y*0.5+0.5, 0.0, 1.0));
  vec3 Fa = F0 + (max(vec3(1.0-rough), F0)-F0)*pow(1.0-NdV, 5.0);
  vec3 c = direct + (kd*alb*amb*0.82 + Fa*env*(1.0-rough*0.75)*0.55) * ao;
  c = mix(c, uTint.rgb*1.4, uTint.a);
  o = vec4(pow(aces(c*uExposure), vec3(1.0/2.2)), 1.0);
}`;

function m4FromTRS(t, r, s) {
  const [x, y, z, w] = r || [0, 0, 0, 1], [sx, sy, sz] = s || [1, 1, 1], [tx, ty, tz] = t || [0, 0, 0];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return new Float32Array([
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1]);
}
/* matrice normale (inversa trasposta della parte 3x3) */
function normalMat(m) {
  const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C || 1e-12;
  return new Float32Array([A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det,
    (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det]);
}

Engine.prototype.initModels = function () {
  const gl = this.gl;
  this.progP = this._program(VS_P, FS_P);
  this.up = {};
  for (const n of ['uVP', 'uModel', 'uNM', 'uLightVP', 'uBase', 'uMR', 'uNorm', 'uOcc', 'uOccS', 'uBaseF', 'uMRF', 'uHasNorm', 'uCut', 'uTint',
    'uShadow', 'uEye', 'uLightDir', 'uRoom', 'uShadowOn', 'uTexel', 'uSoft', 'uExposure']) this.up[n] = gl.getUniformLocation(this.progP, n);
  const px = (r, g, b, a) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([r, g, b, a])); return t; };
  this.texWhite = px(255, 255, 255, 255); this.texFlat = px(128, 128, 255, 255);
};

/* legge un file GLB e prepara buffer e texture; restituisce {prims, min, max} in coordinate del modello */
Engine.prototype.loadGLB = async function (buf) {
  const gl = this.gl, dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('Non è un file GLB');
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004E4942) bin = new Uint8Array(buf, off + 8, len);
    off += 8 + len;
  }
  if (!json || !bin) throw new Error('GLB incompleto');
  if ((json.extensionsRequired || []).length) throw new Error('Estensioni non supportate: ' + json.extensionsRequired.join(', '));
  const view = i => { const bv = json.bufferViews[i]; return { data: bin, off: bv.byteOffset || 0, len: bv.byteLength, stride: bv.byteStride || 0 }; };
  const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
  const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const acc = i => {
    const a = json.accessors[i], v = view(a.bufferView), [T, bytes] = COMP[a.componentType], nc = NC[a.type];
    const out = new Float32Array(a.count * nc), stride = v.stride || bytes * nc, base = v.off + (a.byteOffset || 0);
    const d = new DataView(v.data.buffer, v.data.byteOffset);
    const rd = { 5126: o => d.getFloat32(o, true), 5125: o => d.getUint32(o, true), 5123: o => d.getUint16(o, true), 5121: o => d.getUint8(o), 5122: o => d.getInt16(o, true), 5120: o => d.getInt8(o) }[a.componentType];
    const norm = a.normalized ? { 5121: 255, 5123: 65535, 5120: 127, 5122: 32767 }[a.componentType] || 1 : 1;
    for (let k = 0; k < a.count; k++) for (let c = 0; c < nc; c++) out[k * nc + c] = rd(base + k * stride + c * bytes) / norm;
    return out;
  };
  // texture (immagini dentro il GLB), create una volta sola
  const texCache = new Map();
  const tex = async (ti, srgb) => {
    if (ti == null) return null;
    const key = ti + (srgb ? 's' : 'l');
    if (texCache.has(key)) return texCache.get(key);
    const p = (async () => {
      const src = json.textures[ti].source, im = json.images[src], v = view(im.bufferView);
      const bmp = await createImageBitmap(new Blob([v.data.slice(v.off, v.off + v.len)], { type: im.mimeType || 'image/png' }), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      if (bmp.close) bmp.close();
      return t;
    })();
    texCache.set(key, p);
    return p;
  };
  const prims = [], mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const walk = async (ni, parent) => {
    const nd = json.nodes[ni];
    const local = nd.matrix ? new Float32Array(nd.matrix) : m4FromTRS(nd.translation, nd.rotation, nd.scale);
    const world = M4.mul(parent, local);
    if (nd.mesh != null) for (const pr of json.meshes[nd.mesh].primitives) {
      if (pr.mode != null && pr.mode !== 4) continue;
      const P = acc(pr.attributes.POSITION), n = P.length / 3;
      const N = pr.attributes.NORMAL != null ? acc(pr.attributes.NORMAL) : null, UV = pr.attributes.TEXCOORD_0 != null ? acc(pr.attributes.TEXCOORD_0) : null;
      const I = pr.indices != null ? acc(pr.indices) : null;
      const nm = normalMat(world);
      const vb = new Float32Array(n * 8);
      for (let k = 0; k < n; k++) {
        const p = M4.tp(world, [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]]);
        for (let c = 0; c < 3; c++) { mn[c] = min(mn[c], p[c]); mx[c] = max(mx[c], p[c]); }
        let nx = 0, ny = 1, nz = 0;
        if (N) { const a = N[k * 3], b = N[k * 3 + 1], c = N[k * 3 + 2]; nx = nm[0] * a + nm[3] * b + nm[6] * c; ny = nm[1] * a + nm[4] * b + nm[7] * c; nz = nm[2] * a + nm[5] * b + nm[8] * c; const l = hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
        vb.set([p[0], p[1], p[2], nx, ny, nz, UV ? UV[k * 2] : 0, UV ? UV[k * 2 + 1] : 0], k * 8);
      }
      // senza normali: normali piatte per triangolo
      let verts = vb, idx = I;
      if (!N) {
        const tri = I ? I.length : n, flat = new Float32Array(tri * 8);
        for (let t = 0; t < tri; t += 3) {
          const ids = [0, 1, 2].map(q => I ? I[t + q] : t + q), p = ids.map(j => [vb[j * 8], vb[j * 8 + 1], vb[j * 8 + 2]]);
          const fn = V3.norm(V3.cross(V3.sub(p[1], p[0]), V3.sub(p[2], p[0])));
          ids.forEach((j, q) => { flat.set(vb.subarray(j * 8, j * 8 + 8), (t + q) * 8); flat.set(fn, (t + q) * 8 + 3); });
        }
        verts = flat; idx = null;
      }
      const vao = gl.createVertexArray(), vbo = gl.createBuffer();
      gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, vbo); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
      let count = verts.length / 8, ib = null, itype = 0;
      if (idx) {
        ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        const big = count > 65535; gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, big ? new Uint32Array(idx) : new Uint16Array(idx), gl.STATIC_DRAW);
        itype = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT; count = idx.length;
      }
      gl.bindVertexArray(null);
      const ma = pr.material != null ? json.materials[pr.material] : {}, pb = ma.pbrMetallicRoughness || {};
      prims.push({
        vao, vbo, ib, itype, count,
        baseF: pb.baseColorFactor || [1, 1, 1, 1], mrf: [pb.metallicFactor == null ? 1 : pb.metallicFactor, pb.roughnessFactor == null ? 1 : pb.roughnessFactor, ma.normalTexture ? (ma.normalTexture.scale || 1) : 1],
        cut: ma.alphaMode === 'MASK' ? (ma.alphaCutoff == null ? 0.5 : ma.alphaCutoff) : (ma.alphaMode === 'BLEND' ? 0.5 : -1),
        base: await tex(pb.baseColorTexture && pb.baseColorTexture.index, true),
        mr: await tex(pb.metallicRoughnessTexture && pb.metallicRoughnessTexture.index, false),
        norm: await tex(ma.normalTexture && ma.normalTexture.index, false),
        occ: await tex(ma.occlusionTexture && ma.occlusionTexture.index, false), occS: ma.occlusionTexture ? (ma.occlusionTexture.strength == null ? 1 : ma.occlusionTexture.strength) : 0,
      });
    }
    for (const c of nd.children || []) await walk(c, world);
  };
  const sc = json.scenes[json.scene || 0], I4 = M4.compose(0, 0, 0, 0);
  for (const r of sc.nodes) await walk(r, I4);
  return { prims, min: mn, max: mx };
};

Engine.prototype._drawModel = function (mdl, shadowPass) {
  const gl = this.gl;
  for (const p of mdl.prims) {
    gl.bindVertexArray(p.vao);
    if (!shadowPass) {
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, p.base || this.texWhite);
      gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, p.mr || this.texWhite);
      gl.activeTexture(gl.TEXTURE5); gl.bindTexture(gl.TEXTURE_2D, p.norm || this.texFlat);
      gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, p.occ || this.texWhite); gl.uniform1f(this.up.uOccS, p.occS);
      gl.uniform4fv(this.up.uBaseF, p.baseF); gl.uniform3fv(this.up.uMRF, p.mrf); gl.uniform1f(this.up.uHasNorm, p.norm ? 1 : 0); gl.uniform1f(this.up.uCut, p.cut);
    }
    if (p.ib) gl.drawElements(gl.TRIANGLES, p.count, p.itype, 0); else gl.drawArrays(gl.TRIANGLES, 0, p.count);
  }
};
