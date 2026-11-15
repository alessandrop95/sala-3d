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
class MB {
  constructor() {
    this.a = [];
    this.C = [0, 0, 0]; this.X = [1, 0, 0]; this.Y = [0, 1, 0]; this.Z = [0, 0, 1];
    this.F = null; this.c = [1, 1, 1]; this.e = 0; this.g = 0;
  }
  get count() { return this.a.length / 11; }
  frame(C, X, Y, Z) { this.F = C ? { C, X, Y, Z } : null; return this; }
  _mat(hex, o) { this.c = colLin(hex); this.e = (o && o.e) || 0; this.g = (o && o.g) || 0; }
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
    this.a.push(px, py, pz, qx, qy, qz, this.c[0], this.c[1], this.c[2], this.e, this.g);
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
    this._cyl(r, o && o.r2 != null ? o.r2 : r, h, (o && o.seg) || 14);
    return this;
  }
  /* tubo tra due punti */
  tube(p0, p1, r, hex, o) { this._mat(hex, o); const l = this._dir(p0, p1); this._cyl(r, r, l, (o && o.seg) || 10); return this; }
  /* sfera / ellissoide (o.s = [sx,sy,sz]) */
  sph(x, y, z, r, hex, o) {
    this._mat(hex, o); this._euler([x, y, z], o && o.r);
    const s = (o && o.s) || [1, 1, 1], NU = (o && o.seg) || 16, NV = 10;
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
    const a0 = (o && o.a0) || 0, a1 = o && o.a1 != null ? o.a1 : 2 * PI, NU = (o && o.seg) || 20, NV = 8;
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
}

const VS = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor; layout(location=2) in vec3 aCol; layout(location=3) in vec2 aMat;
uniform mat4 uVP, uModel, uLightVP;
out vec3 vN, vW, vC; out vec2 vM; out vec4 vL;
void main(){ vec4 w = uModel*vec4(aPos,1.0); vW = w.xyz; vN = mat3(uModel)*aNor; vC = aCol; vM = aMat; vL = uLightVP*w; gl_Position = uVP*w; }`;
const FS = `#version 300 es
precision highp float; precision highp sampler2DShadow;
uniform sampler2DShadow uShadow; uniform vec3 uEye, uLightDir; uniform vec4 uTint; uniform float uShadowOn, uTexel;
in vec3 vN, vW, vC; in vec2 vM; in vec4 vL; out vec4 o;
float shadow(){
  vec3 p = vL.xyz/vL.w*0.5+0.5;
  if(p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0) return 1.0;
  float s = 0.0;
  for(int i=-1;i<=1;i++) for(int j=-1;j<=1;j++) s += texture(uShadow, vec3(p.xy+vec2(float(i),float(j))*uTexel*1.6, p.z-0.0012));
  return s/9.0;
}
void main(){
  vec3 n = normalize(vN);
  float ndl = max(dot(n,uLightDir),0.0);
  float sh = uShadowOn>0.5 ? shadow() : 1.0;
  vec3 amb = mix(vec3(0.70,0.69,0.67), vec3(0.88,0.89,0.91), n.y*0.5+0.5);
  vec3 c = vC*(amb + vec3(1.0,0.98,0.94)*0.46*ndl*sh);
  vec3 v = normalize(uEye-vW); vec3 h = normalize(v+uLightDir);
  c += pow(max(dot(n,h),0.0),48.0)*vM.y*0.55*(0.35+0.65*sh);
  c += vM.y*0.10*pow(1.0-max(dot(n,v),0.0),3.0);
  c = mix(c, vC, vM.x);
  c = mix(c, uTint.rgb, uTint.a);
  o = vec4(pow(clamp(c,0.0,1.0), vec3(1.0/2.2)), 1.0);
}`;
const VS_SH = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uLightVP, uModel;
void main(){ gl_Position = uLightVP*uModel*vec4(aPos,1.0); }`;
const FS_SH = `#version 300 es
precision mediump float; void main(){}`;

class Engine {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true });
    if (!gl) throw new Error('WebGL2 non disponibile');
    this.gl = gl; this.canvas = canvas;
    this.prog = this._program(VS, FS); this.progSh = this._program(VS_SH, FS_SH);
    this.u = {}; for (const n of ['uVP', 'uModel', 'uLightVP', 'uShadow', 'uEye', 'uLightDir', 'uTint', 'uShadowOn', 'uTexel']) this.u[n] = gl.getUniformLocation(this.prog, n);
    this.us = { uLightVP: gl.getUniformLocation(this.progSh, 'uLightVP'), uModel: gl.getUniformLocation(this.progSh, 'uModel') };
    this.SM = 2048;
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
    const S = 44;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, S, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.FLOAT, false, S, 36);
    gl.bindVertexArray(null);
    return { vao, vbo, n: mb.count };
  }
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
  }
  /* draws: [{mesh, m, tint:[r,g,b,a]|null, cast}] */
  render({ draws, view, proj, eye, clear, shadows }) {
    const gl = this.gl;
    if (shadows) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFbo);
      gl.viewport(0, 0, this.SM, this.SM); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.progSh); gl.uniformMatrix4fv(this.us.uLightVP, false, this.lightVP);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
      for (const d of draws) if (d.cast && d.mesh.n) {
        gl.uniformMatrix4fv(this.us.uModel, false, d.m); gl.bindVertexArray(d.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, d.mesh.n);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(clear[0], clear[1], clear[2], clear[3]); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.uVP, false, M4.mul(proj, view));
    gl.uniformMatrix4fv(this.u.uLightVP, false, this.lightVP);
    gl.uniform3fv(this.u.uEye, eye); gl.uniform3fv(this.u.uLightDir, this.lightDir);
    gl.uniform1f(this.u.uShadowOn, shadows ? 1 : 0); gl.uniform1f(this.u.uTexel, 1 / this.SM);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.shTex); gl.uniform1i(this.u.uShadow, 0);
    for (const d of draws) if (d.mesh.n) {
      gl.uniformMatrix4fv(this.u.uModel, false, d.m);
      const t = d.tint; gl.uniform4f(this.u.uTint, t ? t[0] : 0, t ? t[1] : 0, t ? t[2] : 0, t ? t[3] : 0);
      gl.bindVertexArray(d.mesh.vao); gl.drawArrays(gl.TRIANGLES, 0, d.mesh.n);
    }
    gl.bindVertexArray(null);
  }
}
