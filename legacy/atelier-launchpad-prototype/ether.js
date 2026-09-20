'use strict';

/* Ether backdrop — a lightweight stand-in for the portfolio's LiquidEther.
 *
 * The site runs a full three.js viscous-fluid solve; a new-tab page can't justify
 * ~500 KB of three plus a per-frame fluid sim. This is one fragment shader:
 * domain-warped fbm streaks in the same ETHER_PALETTE, laid over the same radial
 * placeholder gradient. Ambient only — it does not react to the cursor.
 *
 * Cost control: half-resolution canvas, 30 fps cap, stops while the tab is
 * hidden, and never starts on touch devices or under prefers-reduced-motion —
 * those get the static CSS gradient behind it, exactly like the site does.
 */
(() => {
  const canvas = document.getElementById('ether');
  if (!canvas) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (reduced || coarse) return;

  const gl = canvas.getContext('webgl', { antialias: false, alpha: true, premultipliedAlpha: false, powerPreference: 'low-power' });
  if (!gl) return;

  const PALETTES = {
    dark: {
      streaks: ['#2E3558', '#465078', '#5E6491', '#878CB4'],
      base: ['#1E233C', '#13172B', '#0A0F19'],
      strength: 0.62,
    },
    light: {
      streaks: ['#E8EAF5', '#C8CDEB', '#A8B0D9', '#878CB4'],
      base: ['#E8EAF5', '#DDDFF0', '#F0F1F8'],
      strength: 0.5,
    },
  };

  const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

  const FRAG = `
    precision mediump float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec3 uS0, uS1, uS2, uS3;
    uniform vec3 uB0, uB1, uB2;
    uniform float uStrength;

    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1,0)), u.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
    }
    float fbm(vec2 p){
      float v = 0.0, a = 0.5;
      mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
      for (int i = 0; i < 5; i++){ v += a * noise(p); p = r * p * 2.02; a *= 0.5; }
      return v;
    }

    void main(){
      vec2 uv = gl_FragCoord.xy / uRes;
      float aspect = uRes.x / uRes.y;
      vec2 p = vec2(uv.x * aspect, uv.y) * 1.6;

      float t = uTime * 0.045;
      vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
      vec2 r = vec2(fbm(p + 3.2 * q + vec2(1.7, 9.2) + t * 1.6), fbm(p + 3.2 * q + vec2(8.3, 2.8) - t * 1.3));
      float f = fbm(p + 3.0 * r);

      vec3 streak = mix(uS0, uS1, smoothstep(0.2, 0.6, f));
      streak = mix(streak, uS2, smoothstep(0.45, 0.8, length(q)));
      streak = mix(streak, uS3, smoothstep(0.62, 0.95, r.x) * 0.8);

      // radial-gradient(140% 120% at 50% 0%, b0, b1 48%, b2)
      vec2 g = (uv - vec2(0.5, 1.0)) / vec2(1.4, 1.2);
      float gd = length(g);
      vec3 base = mix(uB0, uB1, smoothstep(0.0, 0.48, gd));
      base = mix(base, uB2, smoothstep(0.48, 1.0, gd));

      float mask = smoothstep(0.35, 0.85, f + 0.25 * r.y) * uStrength;
      mask *= mix(0.55, 1.0, smoothstep(0.0, 0.9, uv.y)); // quieter toward the bottom, like the site's fade

      gl_FragColor = vec4(mix(base, streak, clamp(mask, 0.0, 1.0)), 1.0);
    }`;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };

  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  } catch { return; }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const U = Object.fromEntries(
    ['uRes', 'uTime', 'uS0', 'uS1', 'uS2', 'uS3', 'uB0', 'uB1', 'uB2', 'uStrength']
      .map((n) => [n, gl.getUniformLocation(prog, n)]),
  );

  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

  function applyTheme() {
    const theme = document.documentElement.dataset.resolvedTheme === 'light' ? 'light' : 'dark';
    const pal = PALETTES[theme];
    pal.streaks.forEach((c, i) => gl.uniform3fv(U[`uS${i}`], rgb(c)));
    pal.base.forEach((c, i) => gl.uniform3fv(U[`uB${i}`], rgb(c)));
    gl.uniform1f(U.uStrength, pal.strength);
  }
  applyTheme();
  new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-resolved-theme'] });

  const SCALE = 0.5;
  function resize() {
    const w = Math.max(1, Math.round(innerWidth * SCALE));
    const h = Math.max(1, Math.round(innerHeight * SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(U.uRes, w, h);
    }
  }
  resize();
  addEventListener('resize', resize);

  let raf = 0;
  let last = 0;
  const start = performance.now() - Math.random() * 60_000;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return; // ~30 fps is plenty for a slow flow
    last = now;
    gl.uniform1f(U.uTime, (now - start) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function run() {
    cancelAnimationFrame(raf);
    if (!document.hidden) raf = requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', run);

  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); cancelAnimationFrame(raf); canvas.remove(); });

  // Paint one frame, then fade the canvas in over the CSS placeholder.
  frame(performance.now());
  cancelAnimationFrame(raf);
  canvas.classList.add('is-live');
  run();
})();
