/* ==========================================================================
   app.js — flow controller for 11:11
   - Password check (201281) and the unlock transition
   - Hands off to the envelope (screen 2) and then the prayer letter (screen 3)
   - Ambient particle field with mouse / device parallax
   ========================================================================== */

(function () {
  'use strict';

  var PASSWORD = '201281';
  var ERROR_TEXT = 'الكلمة دي مش صح… جرّبي تاني';

  var prefersReducedMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(id) { return document.getElementById(id); }

  /* ---------- Helpers ---------- */

  // Convert Arabic-Indic and Persian digits to ASCII, and strip spaces
  function normalizeDigits(s) {
    return s
      .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
      .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/\s+/g, '');
  }

  // Tween opacity with GSAP when present, otherwise use a CSS transition
  function fade(el, to, duration, done) {
    if (window.gsap) {
      window.gsap.to(el, {
        opacity: to,
        duration: duration,
        ease: 'power2.inOut',
        onComplete: done
      });
    } else {
      el.style.transition = 'opacity ' + duration + 's ease';
      el.style.opacity = String(to);
      setTimeout(function () { if (done) { done(); } }, duration * 1000);
    }
  }

  function showScreen(name) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.remove('is-active');
    }
    var target = document.querySelector('[data-screen="' + name + '"]');
    if (target) { target.classList.add('is-active'); }
  }

  // A soft burgundy veil used between screens
  function createVeil() {
    var v = document.createElement('div');
    v.setAttribute('aria-hidden', 'true');
    v.style.cssText =
      'position:fixed;inset:0;z-index:5;pointer-events:none;opacity:0;' +
      'background:radial-gradient(circle at 50% 45%, rgba(161,57,95,0.55) 0%, ' +
      'rgba(100,29,57,0.45) 35%, rgba(17,26,44,0.92) 85%);';
    document.body.appendChild(v);
    return v;
  }

  /* ---------- Lock screen ---------- */

  var unlocking = false;
  var veil = null;

  function wrongPassword() {
    var input = $('password');
    var error = $('lock-error');

    error.textContent = ERROR_TEXT;
    error.classList.add('is-visible');

    input.classList.remove('is-wrong');
    void input.offsetWidth;            // restart the shake animation
    input.classList.add('is-wrong');
    input.select();
  }

  function unlock() {
    unlocking = true;
    var input = $('password');
    var btn = $('unlock-btn');

    btn.disabled = true;
    input.disabled = true;
    input.blur();
    $('lock-error').classList.remove('is-visible');

    Lock.open().then(function () {
      fade(veil, 1, 0.7, function () {
        showScreen('letter');
        Envelope.activate();
        Lock.setActive(false);

        setTimeout(function () {
          $('screen-letter').classList.add('is-revealed');
        }, 700);

        fade(veil, 0, 1.2);
      });
    });
  }

  function onSubmit(e) {
    e.preventDefault();
    if (unlocking) { return; }

    // Ask for motion permission on iOS while we have a user gesture
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().catch(function () { /* ignored */ });
    }

    var value = normalizeDigits($('password').value);
    if (value === PASSWORD) {
      unlock();
    } else {
      wrongPassword();
    }
  }

  function bindLockForm() {
    var form = $('unlock-form');
    var input = $('password');
    form.addEventListener('submit', onSubmit);
    input.addEventListener('input', function () {
      $('lock-error').classList.remove('is-visible');
      input.classList.remove('is-wrong');
    });
  }

  /* ---------- Prayer letter (screen 3) ---------- */

  function revealPrayer() {
    showScreen('prayer');

    var paper = $('paper');
    var parts = paper.querySelectorAll('.paper-title, .paper-body p, .signature');

    if (window.gsap) {
      window.gsap.fromTo(paper,
        { opacity: 0, y: 60, rotateX: 12, scale: 0.94 },
        { opacity: 1, y: 0, rotateX: 0, scale: 1, duration: 1.7, ease: 'power3.out' }
      );
      window.gsap.fromTo(parts,
        { opacity: 0, y: 14 },
        { opacity: 1, y: 0, duration: 1.1, stagger: 0.28, ease: 'power2.out', delay: 1.0 }
      );
    } else {
      paper.style.transition = 'opacity 1.6s ease, transform 1.6s ease';
      paper.style.opacity = '1';
      paper.style.transform = 'none';
    }
  }

  /* ---------- Particles and parallax ---------- */

  var Ambient = (function () {
    var canvas = $('particles');
    var ctx = canvas.getContext('2d');
    var w = 0, h = 0, dpr = 1;
    var list = [];
    var sprite = null;
    var rafId = null;
    var running = false;
    var time = 0;

    // Parallax state (pointer or device tilt)
    var par = { x: 0, y: 0, tx: 0, ty: 0 };

    function makeSprite() {
      var c = document.createElement('canvas');
      c.width = c.height = 48;
      var g = c.getContext('2d');
      var grd = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      grd.addColorStop(0, 'rgba(255, 238, 220, 1)');
      grd.addColorStop(0.3, 'rgba(246, 190, 210, 0.55)');
      grd.addColorStop(1, 'rgba(161, 57, 95, 0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 48, 48);
      return c;
    }

    function rand(min, max) { return min + Math.random() * (max - min); }

    function build() {
      var count = Math.round(Math.max(40, Math.min(110, (w * h) / 16000)));
      list = [];
      for (var i = 0; i < count; i++) {
        list.push({
          x: Math.random() * w,
          y: Math.random() * h,
          z: rand(0.25, 1),
          vy: rand(0.05, 0.22),
          size: rand(3, 9),
          phase: rand(0, Math.PI * 2),
          speed: rand(0.6, 1.6)
        });
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      time += 0.016;

      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        p.y -= p.vy * p.z * 0.6;
        if (p.y < -12) { p.y = h + 12; p.x = Math.random() * w; }

        var x = p.x + par.x * 26 * p.z;
        var y = p.y + par.y * 18 * p.z;
        var alpha = 0.35 + 0.5 * Math.sin(time * p.speed + p.phase);
        var s = p.size * p.z * 2.4;

        ctx.globalAlpha = Math.max(0.05, Math.min(0.9, alpha * p.z));
        ctx.drawImage(sprite, x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }

    function frame() {
      rafId = null;
      if (!running) { return; }

      par.x += (par.tx - par.x) * 0.04;
      par.y += (par.ty - par.y) * 0.04;

      // Background gradient follows the same parallax
      var root = document.documentElement.style;
      root.setProperty('--px', (par.x * -14).toFixed(2) + 'px');
      root.setProperty('--py', (par.y * -10).toFixed(2) + 'px');

      draw();
      rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (running) { return; }
      running = true;
      rafId = requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    return {
      init: function () {
        sprite = makeSprite();
        resize();

        if (prefersReducedMotion) {
          draw();  // one static frame, no loop
          return;
        }

        window.addEventListener('resize', resize, { passive: true });

        window.addEventListener('pointermove', function (e) {
          par.tx = (e.clientX / w) * 2 - 1;
          par.ty = (e.clientY / h) * 2 - 1;
        }, { passive: true });

        window.addEventListener('deviceorientation', function (e) {
          if (e.gamma == null || e.beta == null) { return; }
          par.tx = Math.max(-1, Math.min(1, e.gamma / 30));
          par.ty = Math.max(-1, Math.min(1, (e.beta - 45) / 30));
        }, { passive: true });

        document.addEventListener('visibilitychange', function () {
          if (document.hidden) { stop(); } else { start(); }
        });

        start();
      }
    };
  })();

  /* ---------- Boot ---------- */

  function boot() {
    veil = createVeil();

    Ambient.init();

    // First screen: 3D padlock (falls back to CSS automatically)
    Lock.init($('lock-stage'));
    Lock.setActive(true);
    bindLockForm();

    // Second screen: 3D envelope (falls back to CSS automatically)
    Envelope.init($('letter-stage'), $('env-fallback'), revealPrayer);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
