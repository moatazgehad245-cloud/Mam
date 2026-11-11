/* ==========================================================================
   lock.js — 3D padlock (Three.js) for screen 1
   Exposes window.Lock = { init, open, setActive, isReady }
   If WebGL or Three.js is unavailable, the CSS padlock in index.html is used.
   ========================================================================== */

(function () {
  'use strict';

  var state = {
    ready: false,
    active: false,
    renderer: null,
    scene: null,
    camera: null,
    shackle: null,
    body: null,
    group: null,
    frameId: null,
    pointer: { x: 0, y: 0, tx: 0, ty: 0 },
    opened: false
  };

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  function showFallback(reason) {
    // Keep the CSS padlock visible; console note helps when debugging.
    if (reason) { console.info('[11:11] Lock using CSS fallback:', reason); }
    var fb = document.getElementById('lock-fallback');
    if (fb) { fb.style.display = ''; }
  }

  function buildScene(container) {
    var THREE = window.THREE;
    var width = container.clientWidth || 260;
    var height = container.clientHeight || 260;

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 6.2);

    // Lights: warm key, burgundy fill, navy rim
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    var key = new THREE.DirectionalLight(0xffe2c2, 1.05);
    key.position.set(3, 4, 5);
    scene.add(key);

    var fill = new THREE.PointLight(0xA1395F, 1.4, 14);
    fill.position.set(-3, -1, 3);
    scene.add(fill);

    var rim = new THREE.DirectionalLight(0x6E88B8, 0.7);
    rim.position.set(-4, 3, -3);
    scene.add(rim);

    var group = new THREE.Group();
    scene.add(group);

    // Body: burgundy padlock block with soft rounded feel via bevelled box
    var bodyMat = new THREE.MeshStandardMaterial({
      color: 0x641D39,
      roughness: 0.38,
      metalness: 0.15
    });
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.6), bodyMat);
    body.position.y = -0.35;
    group.add(body);

    // Gold ring plate on front
    var goldMat = new THREE.MeshStandardMaterial({
      color: 0xD9B98A,
      roughness: 0.3,
      metalness: 0.55
    });
    var plate = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.04, 40), goldMat);
    plate.rotation.x = Math.PI / 2;
    plate.position.set(0, -0.35, 0.32);
    group.add(plate);

    // Keyhole (dark disc + slot)
    var holeMat = new THREE.MeshStandardMaterial({ color: 0x070B14, roughness: 0.9 });
    var hole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 28), holeMat);
    hole.rotation.x = Math.PI / 2;
    hole.position.set(0, -0.3, 0.35);
    group.add(hole);

    var slot = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.05), holeMat);
    slot.position.set(0, -0.5, 0.35);
    group.add(slot);

    // Shackle: upper half-torus with two posts, grouped so it can lift and open
    var shackle = new THREE.Group();
    shackle.position.y = 0.25;
    group.add(shackle);

    var arcMat = new THREE.MeshStandardMaterial({
      color: 0xB8A07A,
      roughness: 0.32,
      metalness: 0.6
    });
    var arc = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.11, 18, 64, Math.PI), arcMat);
    shackle.add(arc);

    var postGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.5, 18);
    var leftPost = new THREE.Mesh(postGeo, arcMat);
    leftPost.position.set(-0.42, -0.25, 0);
    shackle.add(leftPost);
    var rightPost = new THREE.Mesh(postGeo, arcMat);
    rightPost.position.set(0.42, -0.25, 0);
    shackle.add(rightPost);

    // Slight initial pose so it reads as 3D
    group.rotation.set(0.12, -0.35, 0);

    state.renderer = renderer;
    state.scene = scene;
    state.camera = camera;
    state.group = group;
    state.body = body;
    state.shackle = shackle;

    // Resize handling
    window.addEventListener('resize', function () {
      var w = container.clientWidth || 260;
      var h = container.clientHeight || 260;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }, { passive: true });

    // Parallax: pointer or device tilt
    window.addEventListener('pointermove', function (e) {
      state.pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      state.pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null || e.beta == null) { return; }
      state.pointer.tx = Math.max(-1, Math.min(1, e.gamma / 30));
      state.pointer.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
    }, { passive: true });
  }

  function loop() {
    state.frameId = null;
    if (!state.active || !state.ready) { return; }

    var t = performance.now() * 0.001;
    var p = state.pointer;
    p.x += (p.tx - p.x) * 0.06;
    p.y += (p.ty - p.y) * 0.06;

    // Gentle float + tilt toward pointer
    state.group.position.y = Math.sin(t * 1.1) * 0.08;
    state.group.rotation.y = -0.35 + p.x * 0.35 + Math.sin(t * 0.6) * 0.05;
    state.group.rotation.x = 0.12 + p.y * 0.22;

    state.renderer.render(state.scene, state.camera);
    state.frameId = requestAnimationFrame(loop);
  }

  var Lock = {
    isReady: false,

    init: function (container) {
      if (!container) { showFallback('no container'); return; }
      if (!window.THREE) { showFallback('Three.js did not load'); return; }
      if (!hasWebGL()) { showFallback('WebGL not available'); return; }

      try {
        buildScene(container);
        state.ready = true;
        Lock.isReady = true;
        // Hide the CSS fallback once the 3D version is live
        var fb = document.getElementById('lock-fallback');
        if (fb) { fb.style.display = 'none'; }
      } catch (err) {
        console.warn('[11:11] 3D padlock failed, using fallback.', err);
        showFallback('exception');
      }
    },

    setActive: function (on) {
      state.active = !!on;
      if (state.active && state.ready && !state.frameId) {
        state.frameId = requestAnimationFrame(loop);
      }
    },

    // Opens the lock: lifts the shackle and tilts the body, then returns a Promise.
    open: function () {
      return new Promise(function (resolve) {
        var fb = document.getElementById('lock-fallback');
        var shackleCss = document.getElementById('lock-shackle');

        if (!state.ready) {
          // CSS fallback path
          if (fb) { fb.classList.add('is-open'); }
          if (shackleCss) { shackleCss.style.transform = ''; }
          setTimeout(resolve, 1100);
          return;
        }

        state.opened = true;
        var s = state.shackle;

        if (window.gsap) {
          window.gsap.timeline({ onComplete: resolve })
            .to(s.position, { y: 0.95, duration: 1.1, ease: 'power2.out' }, 0)
            .to(s.rotation, { z: -0.28, duration: 1.1, ease: 'power2.out' }, 0)
            .to(state.group.rotation, { y: 0.1, duration: 1.2, ease: 'power2.inOut' }, 0.05)
            .to(state.group.position, { z: 0.6, duration: 0.9, ease: 'power2.in' }, 0.7);
        } else {
          s.position.y = 0.95;
          s.rotation.z = -0.28;
          setTimeout(resolve, 1100);
        }
      });
    }
  };

  window.Lock = Lock;
})();
