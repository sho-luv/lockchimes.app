/* The hero padlock from the iPhone app, rebuilt for the web with three.js.
 * Same clay look, same proportions, same moves: drag to spin (flick for a full turn), tap to unlock,
 * tap again to slam it shut. Falls back to the PNG when WebGL isn't available.
 * Numbers mirror TeslaSounds/Design/LockModel.swift and LockSceneView.swift. */
(function () {
  const host = document.getElementById('lock3d');
  if (!host || typeof THREE === 'undefined') return;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (e) { return; }
  host.classList.add('live');

  // Same values as LockModel.
  const BODY = { w: 1.5, h: 1.25, d: 0.62, r: 0.22 };
  const SHACKLE = { R: 0.52, r: 0.31, L: 0.62, sink: 0.34, lift: 0.36, twist: 0.85 };
  const REST_YAW = -0.38;
  const colors = { body: 0xff2e2e, shackle: 0x2b2b2b, hole: 0x0f0f0f };

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0.55, 6.4);
  camera.lookAt(0, 0.25, 0);

  // Felt: random per-pixel normals around "straight out".
  const felt = (() => {
    const size = 256, c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d'), img = ctx.createImageData(size, size);
    let seed = 0x12345678;
    const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed >>> 24; };
    for (let i = 0; i < size * size; i++) {
      img.data[i * 4] = 128 + ((rand() - 128) / 3) | 0;
      img.data[i * 4 + 1] = 128 + ((rand() - 128) / 3) | 0;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(3, 3);
    return tex;
  })();
  const clay = (color, roughness = 0.92) => new THREE.MeshStandardMaterial({
    color, roughness, metalness: 0, normalMap: felt, normalScale: new THREE.Vector2(0.55, 0.55),
  });

  // Rounded box: a rounded rectangle extruded with a deep bevel, so every edge is soft.
  function roundedBox(w, h, d, bevel) {
    const s = new THREE.Shape(), x = w / 2 - bevel, y = h / 2 - bevel, r = 0.04;
    s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r);
    s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
    s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r);
    s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
    const depth = d - 2 * bevel;
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 8, curveSegments: 6 });
    g.translate(0, 0, -depth / 2);
    return g;
  }

  const root = new THREE.Group();          // squash & stretch
  const turntable = new THREE.Group();     // yaw from dragging
  const bob = new THREE.Group();           // idle float
  turntable.rotation.set(0.05, REST_YAW, 0);
  turntable.add(root); bob.add(turntable); scene.add(bob);

  const bodyMat = clay(colors.body);
  const body = new THREE.Mesh(roundedBox(BODY.w, BODY.h, BODY.d, BODY.r), bodyMat);
  body.castShadow = body.receiveShadow = true;
  root.add(body);

  // Keyhole: round hole over a slot, sitting just proud of the front face.
  const holeMat = clay(colors.hole, 1);
  const circle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 32), holeMat);
  circle.rotation.x = Math.PI / 2;
  circle.position.set(0, 0.06, BODY.d / 2 - 0.01);
  body.add(circle);
  const slot = new THREE.Mesh(roundedBox(0.1, 0.26, 0.06, 0.02), holeMat);
  slot.position.set(0, -0.1, BODY.d / 2 - 0.01);
  body.add(slot);

  // Shackle: U outline extruded, hinged on its left leg like a real padlock.
  const shackleShape = (() => {
    const { R, r, L } = SHACKLE, s = new THREE.Shape();
    s.moveTo(-R, 0); s.lineTo(-R, L); s.absarc(0, L, R, Math.PI, 0, true);
    s.lineTo(R, 0); s.lineTo(r, 0); s.lineTo(r, L); s.absarc(0, L, r, 0, Math.PI, false);
    s.lineTo(-r, 0); s.closePath();
    return s;
  })();
  const shackleGeo = new THREE.ExtrudeGeometry(shackleShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 24 });
  shackleGeo.translate(0, 0, -0.06);
  const shackleMat = clay(colors.shackle, 0.7);
  const shackle = new THREE.Mesh(shackleGeo, shackleMat);
  shackle.castShadow = true;
  const legCenter = (SHACKLE.R + SHACKLE.r) / 2;
  shackle.position.x = legCenter;
  const hinge = new THREE.Group();
  const closedY = BODY.h / 2 - SHACKLE.sink;
  hinge.position.set(-legCenter, closedY, 0);
  hinge.add(shackle);
  root.add(hinge);

  // Stage: soft ambient, a shadow-casting key from upper left, a rim from behind, and a shadow catcher.
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-2.6, 4.6, 3.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 6;
  key.shadow.camera.near = 1; key.shadow.camera.far = 14;
  key.shadow.camera.left = key.shadow.camera.bottom = -2.5;
  key.shadow.camera.right = key.shadow.camera.top = 2.5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 1.2);
  rim.position.set(3.2, 1.2, -4);
  scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ opacity: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.66;
  floor.receiveShadow = true;
  scene.add(floor);

  // Tiny tween runner: duration in seconds, fn(t) with t in 0..1.
  const tweens = [];
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeIn = t => t * t * t;
  const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const tween = (key, duration, fn, easing = easeOut) => new Promise(resolve => {
    for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].key === key) tweens.splice(i, 1);
    if (duration <= 0) { fn(1); resolve(); return; }
    tweens.push({ key, start: performance.now() / 1000, duration, fn, easing, resolve });
  });
  const cancel = key => { for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].key === key) tweens.splice(i, 1); };

  // UI sounds, synthesized like the app's (no files). Created on the first gesture, as browsers require.
  let audio;
  const sound = (kind) => {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
      const now = audio.currentTime, out = audio.createGain();
      out.connect(audio.destination);
      const tone = (freq, dur, gain, type = 'sine', slide = 1) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, now); o.frequency.exponentialRampToValueAtTime(freq * slide, now + dur);
        g.gain.setValueAtTime(gain, now); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        o.connect(g); g.connect(out); o.start(now); o.stop(now + dur);
      };
      const noise = (dur, gain, cutoff) => {
        const len = Math.max(1, (audio.sampleRate * dur) | 0), buf = audio.createBuffer(1, len, audio.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = audio.createBufferSource(), f = audio.createBiquadFilter(), g = audio.createGain();
        src.buffer = buf; f.type = 'lowpass'; f.frequency.value = cutoff; g.gain.value = gain;
        src.connect(f); f.connect(g); g.connect(out); src.start(now);
      };
      if (kind === 'clink') { tone(2400, 0.09, 0.08, 'triangle', 0.9); noise(0.03, 0.06, 6000); }
      else if (kind === 'clunk') { tone(110, 0.16, 0.22, 'sine', 0.55); noise(0.05, 0.12, 900); }
      else if (kind === 'ratchet') { noise(0.012, 0.07, 4000); }
      else if (kind === 'whoosh') { noise(0.35, 0.05, 1200); }
      else if (kind === 'thock') { tone(220, 0.07, 0.1, 'sine', 0.7); noise(0.02, 0.05, 2000); }
    } catch (e) { /* no audio, no problem */ }
  };

  // Squash & stretch: a damped wobble on the whole lock.
  const squash = amount => tween('squash', 0.5, t => {
    const s = amount * Math.exp(-6 * t) * Math.cos(18 * t);
    root.scale.set(1 + s * 0.6, 1 - s, 1 + s * 0.6);
  }, t => t);

  let isOpen = false, busy = false;
  const moveHinge = (toY, duration, easing) => {
    const from = hinge.position.y;
    return tween('shackle-y', duration, t => { hinge.position.y = from + (toY - from) * t; }, easing);
  };
  const twistHinge = (toRot, duration, easing) => {
    const from = hinge.rotation.y;
    return tween('shackle-rot', duration, t => { hinge.rotation.y = from + (toRot - from) * t; }, easing);
  };
  async function open() {
    if (isOpen || busy) return;
    busy = true; isOpen = true;
    sound('clink');
    await moveHinge(closedY + SHACKLE.lift, 0.22, easeOut);
    await twistHinge(SHACKLE.twist, 0.28, easeInOut);
    busy = false;
  }
  async function slam() {
    if (!isOpen || busy) return;
    busy = true; isOpen = false;
    await twistHinge(0, 0.18, easeIn);
    await moveHinge(closedY, 0.09, easeIn);
    sound('clunk');
    squash(0.12);
    busy = false;
  }
  function bounce() {
    squash(0.06);
    if (isOpen) return;
    moveHinge(closedY + 0.07, 0.07, easeOut).then(() => moveHinge(closedY, 0.09, easeIn));
  }

  // Drag to spin, flick for a full turn, tap to toggle. Vertical swipes still scroll the page.
  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';
  el.style.cursor = 'grab';
  let pointer = null;
  const DETENT = 0.32;
  el.addEventListener('pointerdown', e => {
    if (e.button !== undefined && e.button !== 0) return;
    el.setPointerCapture(e.pointerId);
    cancel('spin');
    pointer = { id: e.pointerId, x0: e.clientX, startYaw: turntable.rotation.y, lastDetent: turntable.rotation.y, dragging: false, vx: 0, lastX: e.clientX, lastT: performance.now() };
    el.style.cursor = 'grabbing';
  });
  el.addEventListener('pointermove', e => {
    if (!pointer || e.pointerId !== pointer.id) return;
    const dx = e.clientX - pointer.x0;
    if (!pointer.dragging && Math.abs(dx) < 4) return;
    pointer.dragging = true;
    const yaw = pointer.startYaw + dx * 0.012;
    turntable.rotation.y = yaw;
    if (Math.abs(yaw - pointer.lastDetent) >= DETENT) { pointer.lastDetent = yaw; sound('ratchet'); }
    const now = performance.now(), dt = Math.max(1, now - pointer.lastT);
    pointer.vx = 0.6 * pointer.vx + 0.4 * ((e.clientX - pointer.lastX) / dt) * 1000; // px/s, smoothed
    pointer.lastX = e.clientX; pointer.lastT = now;
  });
  const release = e => {
    if (!pointer || e.pointerId !== pointer.id) return;
    const p = pointer; pointer = null;
    el.style.cursor = 'grab';
    if (!p.dragging) { sound('thock'); (isOpen ? slam() : open()); return; }
    // A hard flick spins it all the way around before it settles back.
    const spins = Math.abs(p.vx) > 900 ? Math.sign(p.vx) * 2 * Math.PI : 0;
    if (spins) sound('whoosh');
    const current = turntable.rotation.y, target = REST_YAW + spins, duration = spins ? 1.1 : 0.7;
    let lastTick = current;
    tween('spin', duration, t => {
      const eased = 1 - Math.pow(1 - t, 3) + Math.sin(t * Math.PI) * 0.08;
      const yaw = current + (target - current) * eased;
      turntable.rotation.y = yaw;
      if (Math.abs(yaw - lastTick) >= DETENT) { lastTick = yaw; sound('ratchet'); }
    }, t => t).then(() => { turntable.rotation.y = REST_YAW; });
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
  el.addEventListener('dblclick', e => e.preventDefault());

  // Size to the host, render while visible.
  function resize() {
    const w = host.clientWidth || 300, h = host.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);
  let visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(host);

  const t0 = performance.now();
  renderer.render(scene, camera); // first paint right away, even in a background tab
  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const now = performance.now() / 1000;
    bob.position.y = Math.sin((now - t0 / 1000) * Math.PI / 1.8) * 0.06; // slow float, 3.6 s round trip
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i], t = Math.min(1, (now - tw.start) / tw.duration);
      tw.fn(tw.easing(t));
      if (t >= 1) { tweens.splice(i, 1); tw.resolve(); }
    }
    renderer.render(scene, camera);
  }
  frame();

  // Let the page poke it (e.g. the Pro section plays a sound).
  window.lock3d = { open, slam, bounce, setColors(bodyHex, shackleHex) { bodyMat.color.set(bodyHex); shackleMat.color.set(shackleHex); } };
  window.dispatchEvent(new Event('lock3d-ready'));
})();
