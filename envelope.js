/* ==========================================================================
   envelope.js — the flying letter (screen 2)
   Three.js envelope with floating motion, soft blob shadow, wax seal,
   and a 3-touch sequence: escape, escape, then open with glow.
   Falls back to a CSS 3D envelope if WebGL or Three.js is unavailable.
   Exposes window.Envelope = { init, activate, deactivate }
   ========================================================================== */

(function () {
  'use strict';

  var TOUCHES_TO_OPEN = 3;

  var E = {
    mode: null,            // '3d' | 'css'
    container: null,
    cssWrap: null,
    onOpened: null,
    active: false,
    touches: 0,
    opening: false,
    frameId: null,
    pointer: { x: 0, y: 0, tx: 0, ty: 0 },

    // 3D state
    renderer: null, scene: null, camera: null,
    root: null, flapPivot: null, sealGroup: null, letterGroup: null,
    halo: null, haloMat: null, frontMat: null,
    shadow: null, shadowMat: null,
    home: { x: 0, y: 0 },
    tilt: { x: 0.12, y: -0.28, z: 0 },
    floating: true,
    envScale: 1,
    halfW: 2,
    halfH: 1.5,
    fov: 40,
    dist: 7
  };

  /* ---------- Utilities ---------- */

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Radial gradient texture for halos and shadows
  function radialTexture(THREE, rgb, alpha) {
    var c = makeCanvas(256, 256);
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(' + rgb.join(',') + ',' + alpha + ')');
    grad.addColorStop(0.45, 'rgba(' + rgb.join(',') + ',' + (alpha * 0.45) + ')');
    grad.addColorStop(1, 'rgba(' + rgb.join(',') + ',0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }

  // Envelope front: cream paper, faint border, small "11:11" detail
  function makeEnvelopeFront(THREE) {
    var c = makeCanvas(1024, 710);
    var g = c.getContext('2d');

    function draw() {
      g.clearRect(0, 0, c.width, c.height);
      var grad = g.createLinearGradient(0, 0, c.width, c.height);
      grad.addColorStop(0, '#F7EBD7');
      grad.addColorStop(1, '#E4CDA8');
      g.fillStyle = grad;
      g.fillRect(0, 0, c.width, c.height);

      // Paper grain
      for (var i = 0; i < 2200; i++) {
        g.fillStyle = 'rgba(120,80,40,' + (Math.random() * 0.05) + ')';
        g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
      }

      // Inner border
      g.strokeStyle = 'rgba(100,29,57,0.22)';
      g.lineWidth = 4;
      g.strokeRect(34, 34, c.width - 68, c.height - 68);

      // 11:11 detail
      g.fillStyle = 'rgba(100,29,57,0.78)';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '300 78px "Cormorant Garamond", Georgia, serif';
      g.fillText('11:11', c.width / 2, c.height * 0.82);
    }

    draw();
    var texture = new THREE.CanvasTexture(c);
    texture.anisotropy = 4;

    if (document.fonts && document.fonts.load) {
      document.fonts.load('300 78px "Cormorant Garamond"').then(function () {
        draw();
        texture.needsUpdate = true;
      }, function () { /* keep the fallback font */ });
    }
    return texture;
  }

  // Letter paper that rises out of the envelope
  function makeLetterTexture(THREE) {
    var c = makeCanvas(512, 352);
    var g = c.getContext('2d');
    g.fillStyle = '#FBF3E4';
    g.fillRect(0, 0, c.width, c.height);

    g.strokeStyle = 'rgba(100,29,57,0.22)';
    g.lineWidth = 2;
    for (var y = 80; y < 330; y += 34) {
      g.beginPath();
      g.moveTo(44, y);
      g.lineTo(c.width - 44, y);
      g.stroke();
    }

    // Small heart at the top
    g.fillStyle = 'rgba(100,29,57,0.85)';
    g.beginPath();
    var cx = c.width / 2, cy = 46, s = 16;
    g.moveTo(cx, cy + s * 0.6);
    g.bezierCurveTo(cx - s * 1.4, cy - s * 0.2, cx - s * 0.6, cy - s * 1.4, cx, cy - s * 0.4);
    g.bezierCurveTo(cx + s * 0.6, cy - s * 1.4, cx + s * 1.4, cy - s * 0.2, cx, cy + s * 0.6);
    g.fill();

    return new THREE.CanvasTexture(c);
  }

  // Heart outline for the wax seal (k = scale)
  function heartShape(THREE, k) {
    var s = new THREE.Shape();
    s.moveTo(0, -0.45 * k);
    s.bezierCurveTo(-0.55 * k, -0.05 * k, -0.5 * k, 0.42 * k, 0, 0.18 * k);
    s.bezierCurveTo(0.5 * k, 0.42 * k, 0.55 * k, -0.05 * k, 0, -0.45 * k);
    return s;
  }

  /* ---------- 3D build ---------- */

  function computeView() {
    var aspect = E.camera.aspect;
    E.halfH = Math.tan((E.fov * Math.PI) / 360) * E.dist;
    E.halfW = E.halfH * aspect;
  }

  function resize3D() {
    var w = E.container.clientWidth || 320;
    var h = E.container.clientHeight || 300;
    E.renderer.setSize(w, h, false);
    E.camera.aspect = w / h;
    E.camera.updateProjectionMatrix();
    computeView();

    // Scale the envelope so it always fits the visible area
    var s = Math.min(1.05, Math.max(0.5, E.halfW / 1.6));
    s = Math.min(s, (E.halfH * 0.8) / 0.9);
    E.envScale = s;

    var b = bounds();
    E.home.x = clamp(E.home.x, -b.x, b.x);
    E.home.y = clamp(E.home.y, -b.y, b.y);
  }

  function bounds() {
    var s = E.envScale;
    return {
      x: Math.max(0.05, E.halfW - 1.3 * s - 0.15),
      y: Math.max(0.05, E.halfH - 0.95 * s - 0.2)
    };
  }

  function build3D(stage) {
    var THREE = window.THREE;
    var w = stage.clientWidth || 320;
    var h = stage.clientHeight || 300;

    E.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    E.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    E.renderer.setSize(w, h, false);
    E.renderer.domElement.style.touchAction = 'none';
    stage.appendChild(E.renderer.domElement);

    E.scene = new THREE.Scene();
    E.camera = new THREE.PerspectiveCamera(E.fov, w / h, 0.1, 100);
    E.camera.position.set(0, 0, E.dist);

    E.scene.add(new THREE.AmbientLight(0xffffff, 0.75));

    var key = new THREE.DirectionalLight(0xffe6cc, 1.0);
    key.position.set(2.5, 3.5, 6);
    E.scene.add(key);

    var warm = new THREE.PointLight(0xA1395F, 1.1, 20);
    warm.position.set(-3, -2, 4);
    E.scene.add(warm);

    // Envelope body
    var sideMat = new THREE.MeshStandardMaterial({ color: 0xE8D5B2, roughness: 0.9 });
    E.frontMat = new THREE.MeshStandardMaterial({
      map: makeEnvelopeFront(THREE),
      roughness: 0.85,
      emissive: new THREE.Color(0x641D39),
      emissiveIntensity: 0
    });
    var body = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.8, 0.04),
      [sideMat, sideMat, sideMat, sideMat, E.frontMat, sideMat]
    );

    // Flap (triangle hinged at the top edge)
    var flapShape = new THREE.Shape();
    flapShape.moveTo(-1.3, 0);
    flapShape.lineTo(1.3, 0);
    flapShape.lineTo(0, -1.1);
    flapShape.closePath();
    var flapMat = new THREE.MeshStandardMaterial({
      color: 0xF3E4C8, roughness: 0.85, side: THREE.DoubleSide
    });
    var flap = new THREE.Mesh(
      new THREE.ExtrudeGeometry(flapShape, {
        depth: 0.02, bevelEnabled: true, bevelThickness: 0.008,
        bevelSize: 0.008, bevelSegments: 2
      }),
      flapMat
    );
    E.flapPivot = new THREE.Group();
    E.flapPivot.position.set(0, 0.9, 0.03);
    E.flapPivot.add(flap);

    // Burgundy wax seal with a heart, riding on the flap tip
    E.sealGroup = new THREE.Group();
    E.sealGroup.position.set(0, -0.98, 0.03);
    E.flapPivot.add(E.sealGroup);

    var disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.06, 48),
      new THREE.MeshStandardMaterial({ color: 0x641D39, roughness: 0.35, metalness: 0.1 })
    );
    disc.rotation.x = Math.PI / 2;
    E.sealGroup.add(disc);

    var heartGeo = new THREE.ExtrudeGeometry(heartShape(THREE, 0.45), {
      depth: 0.02, bevelEnabled: true, bevelThickness: 0.005,
      bevelSize: 0.005, bevelSegments: 2
    });
    var heart = new THREE.Mesh(
      heartGeo,
      new THREE.MeshStandardMaterial({ color: 0xD9749A, roughness: 0.4, emissive: 0x3A0A1C })
    );
    heart.position.set(0, 0.01, 0.03);
    E.sealGroup.add(heart);

    // Letter paper, hidden inside until it rises
    E.letterGroup = new THREE.Group();
    var letter = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 1.55),
      new THREE.MeshStandardMaterial({ map: makeLetterTexture(THREE), roughness: 0.9 })
    );
    letter.position.z = -0.005;
    E.letterGroup.add(letter);

    // Soft glow used when the envelope opens
    E.haloMat = new THREE.SpriteMaterial({
      map: radialTexture(THREE, [161, 57, 95], 1),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    E.halo = new THREE.Sprite(E.haloMat);
    E.halo.scale.set(4.2, 4.2, 1);
    E.halo.position.z = -0.4;

    E.root = new THREE.Group();
    E.root.add(body, E.flapPivot, E.letterGroup, E.halo);
    E.scene.add(E.root);

    // Blob shadow beneath the envelope
    E.shadowMat = new THREE.MeshBasicMaterial({
      map: radialTexture(THREE, [8, 4, 10], 0.7),
      transparent: true,
      depthWrite: false
    });
    E.shadow = new THREE.Mesh(new THREE.PlaneGeometry(3, 1), E.shadowMat);
    E.scene.add(E.shadow);

    computeView();
    resize3D();

    window.addEventListener('resize', resize3D, { passive: true });
    window.addEventListener('pointermove', function (e) {
      E.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      E.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });
    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null || e.beta == null) { return; }
      E.pointer.tx = clamp(e.gamma / 30, -1, 1);
      E.pointer.ty = clamp((e.beta - 45) / 30, -1, 1);
    }, { passive: true });

    E.mode = '3d';
  }

  /* ---------- 3D motion ---------- */

  function frame() {
    E.frameId = null;
    if (!E.active || E.mode !== '3d') { return; }

    var t = performance.now() * 0.001;
    var p = E.pointer;
    p.x += (p.tx - p.x) * 0.05;
    p.y += (p.ty - p.y) * 0.05;

    var fx = 0, fy = 0, swayX = 0, swayY = 0, swayZ = 0;
    if (E.floating) {
      fx = Math.sin(t * 0.7) * 0.14 + Math.sin(t * 1.9 + 1.3) * 0.04;
      fy = Math.sin(t * 1.05) * 0.18 + Math.cos(t * 0.45) * 0.05;
      swayX = Math.sin(t * 0.9) * 0.1;
      swayY = Math.cos(t * 0.6) * 0.18;
      swayZ = Math.sin(t * 0.5) * 0.05;
    }

    E.root.position.set(E.home.x + fx + p.x * 0.15, E.home.y + fy + p.y * 0.1, 0);
    E.root.rotation.set(
      E.tilt.x + swayX + p.y * 0.12,
      E.tilt.y + swayY + p.x * 0.22,
      E.tilt.z + swayZ
    );
    E.root.scale.setScalar(E.envScale);

    // Shadow sits further down and softens as the envelope lifts
    var lift = E.root.position.y - E.home.y;
    var k = 1 - clamp(Math.abs(lift) * 0.14, 0, 0.35);
    E.shadow.position.set(E.root.position.x, E.home.y - 1.6 * E.envScale, -0.4);
    E.shadow.scale.set(k * E.envScale * 3.2, k * E.envScale * 0.9, 1);
    E.shadowMat.opacity = 0.55 * k;

    E.renderer.render(E.scene, E.camera);
    E.frameId = requestAnimationFrame(frame);
  }

  function startLoop() {
    if (!E.frameId && E.mode === '3d') {
      E.frameId = requestAnimationFrame(frame);
    }
  }

  function pickTarget() {
    var b = bounds();
    var best = null, bestD = -1;
    for (var i = 0; i < 12; i++) {
      var c = { x: rand(-b.x, b.x), y: rand(-b.y, b.y) };
      var d = Math.hypot(c.x - E.home.x, c.y - E.home.y);
      if (d > 1.8 * E.envScale) { return c; }
      if (d > bestD) { bestD = d; best = c; }
    }
    return best;
  }

  function escape3D() {
    var gsap = window.gsap;
    var target = pickTarget();
    var dur = rand(0.75, 1.15);
    var eases = ['power3.out', 'back.out(1.4)', 'expo.out'];
    var ease = eases[Math.floor(Math.random() * eases.length)];
    var spin = Math.random() < 0.5 ? -0.5 : 0.5;

    if (!gsap) {
      E.home.x = target.x;
      E.home.y = target.y;
      return;
    }

    gsap.killTweensOf(E.home);
    gsap.killTweensOf(E.tilt);
    gsap.to(E.home, { x: target.x, y: target.y, duration: dur, ease: ease });
    gsap.timeline()
      .to(E.tilt, { z: spin, x: 0.28, duration: dur * 0.5, ease: 'power2.out' })
      .to(E.tilt, { z: 0, x: 0.12, duration: dur * 0.5, ease: 'power2.inOut' });

    pulseHalo(0.5, 0.45);
  }

  function pulseHalo(peak, dur) {
    var gsap = window.gsap;
    if (!gsap) { return; }
    gsap.killTweensOf(E.haloMat);
    gsap.timeline()
      .to(E.haloMat, { opacity: peak, duration: dur * 0.4, ease: 'sine.out' })
      .to(E.haloMat, { opacity: 0, duration: dur * 0.6, ease: 'sine.in' });
  }

  function open3D() {
    E.opening = true;
    E.floating = false;

    var finish = function () {
      E.active = false;
      setTimeout(function () { if (E.onOpened) { E.onOpened(); } }, 350);
    };

    var gsap = window.gsap;
    if (!gsap) {
      // Graceful path without GSAP: snap to the open state
      E.home.x = 0; E.home.y = 0;
      E.tilt.x = 0.04; E.tilt.y = 0; E.tilt.z = 0;
      E.flapPivot.rotation.x = Math.PI * 0.94;
      E.sealGroup.scale.set(0.001, 0.001, 0.001);
      E.letterGroup.position.set(0, 1.3, 0.7);
      E.haloMat.opacity = 0.35;
      setTimeout(finish, 1600);
      return;
    }

    gsap.killTweensOf([E.home, E.tilt, E.flapPivot.rotation, E.letterGroup.position, E.letterGroup.rotation]);

    gsap.timeline({ onComplete: finish })
      .to(E.home, { x: 0, y: 0, duration: 0.9, ease: 'power2.inOut' }, 0)
      .to(E.tilt, { x: 0.04, y: 0, z: 0, duration: 0.9, ease: 'power2.inOut' }, 0)
      .to(E.frontMat, { emissiveIntensity: 0.6, duration: 0.9, ease: 'sine.inOut' }, 0)
      .to(E.haloMat, { opacity: 0.9, duration: 0.9, ease: 'sine.out' }, 0)
      .to(E.halo.scale, { x: 6.5, y: 6.5, duration: 1.4, ease: 'power2.out' }, 0)
      .to(E.sealGroup.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, ease: 'power2.in' }, 0.85)
      .to(E.flapPivot.rotation, { x: Math.PI * 0.94, duration: 1.2, ease: 'back.out(1.1)' }, 0.9)
      .to(E.letterGroup.position, { y: 1.3, z: 0.7, duration: 1.4, ease: 'power2.out' }, 1.6)
      .to(E.letterGroup.rotation, { x: -0.1, duration: 1.0, ease: 'power1.out' }, 1.6)
      .to(E.haloMat, { opacity: 0.25, duration: 1.2, ease: 'sine.inOut' }, 2.4);
  }

  /* ---------- CSS fallback ---------- */

  function initCSS(wrap) {
    E.mode = 'css';
    E.cssWrap = wrap;
    wrap.hidden = false;
    wrap.style.transition = 'transform 1s cubic-bezier(0.22, 1, 0.36, 1), filter 1s ease';
    wrap.style.transform = 'translate3d(0, 0, 0)';
  }

  function escapeCSS() {
    var wrap = E.cssWrap;
    var stageW = E.container.clientWidth;
    var stageH = E.container.clientHeight;
    var baseW = wrap.offsetWidth;
    var baseH = wrap.offsetHeight;
    var maxX = Math.max(0, (stageW - baseW) / 2 - 12);
    var maxY = Math.max(0, (stageH - baseH) / 2 - 12);

    var x = rand(-maxX, maxX), y = rand(-maxY, maxY);
    wrap.style.transitionDuration = rand(0.7, 1.1).toFixed(2) + 's';
    wrap.style.transform = 'translate3d(' + x.toFixed(1) + 'px, ' + y.toFixed(1) + 'px, 0)';
  }

  function openCSS() {
    E.opening = true;
    var wrap = E.cssWrap;
    var env = wrap.querySelector('.env');
    var flap = document.getElementById('env-flap');
    var seal = document.getElementById('env-seal-css');

    wrap.style.transitionDuration = '0.9s';
    wrap.style.transform = 'translate3d(0, 0, 0)';
    wrap.style.filter = 'drop-shadow(0 0 28px rgba(161, 57, 95, 0.85))';
    if (env) { env.style.animation = 'none'; env.style.transform = 'rotateX(4deg) rotateY(0deg)'; }

    setTimeout(function () {
      if (flap) { flap.classList.add('is-open'); }
      if (seal) { seal.style.opacity = '0'; seal.style.transition = 'opacity 0.4s'; }
    }, 900);

    setTimeout(function () {
      E.active = false;
      if (E.onOpened) { E.onOpened(); }
    }, 2200);
  }

  /* ---------- Interaction ---------- */

  function hitTest(clientX, clientY) {
    var rect = E.container.getBoundingClientRect();
    var cx, cy, radius;

    if (E.mode === '3d') {
      var p = E.root.position.clone().project(E.camera);
      cx = rect.left + ((p.x + 1) / 2) * rect.width;
      cy = rect.top + ((1 - p.y) / 2) * rect.height;
      var envPx = (2.6 * E.envScale / (2 * E.halfW)) * rect.width;
      radius = Math.max(64, envPx * 0.55);
    } else {
      var r = E.cssWrap.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      radius = Math.max(64, r.width * 0.55);
    }

    var dx = clientX - cx, dy = clientY - cy;
    return dx * dx + dy * dy <= radius * radius;
  }

  function registerTouch() {
    if (E.opening) { return; }
    E.touches += 1;

    if (E.touches < TOUCHES_TO_OPEN) {
      if (E.mode === '3d') { escape3D(); } else { escapeCSS(); }
    } else {
      if (E.mode === '3d') { open3D(); } else { openCSS(); }
    }
  }

  function onPointerDown(e) {
    if (!E.active || E.opening) { return; }
    if (!hitTest(e.clientX, e.clientY)) { return; }
    e.preventDefault();
    registerTouch();
  }

  /* ---------- Public API ---------- */

  var Envelope = {
    init: function (stage, cssWrap, onOpened) {
      E.container = stage;
      E.cssWrap = cssWrap;
      E.onOpened = onOpened;

      var built = false;
      if (window.THREE && hasWebGL()) {
        try {
          build3D(stage);
          built = true;
        } catch (err) {
          console.warn('[11:11] 3D envelope failed, using CSS fallback.', err);
        }
      }
      if (!built) { initCSS(cssWrap); }

      stage.addEventListener('pointerdown', onPointerDown, { passive: false });
    },

    activate: function () {
      E.active = true;
      if (E.mode === '3d') { startLoop(); }
    },

    deactivate: function () {
      E.active = false;
    }
  };

  window.Envelope = Envelope;
})();
