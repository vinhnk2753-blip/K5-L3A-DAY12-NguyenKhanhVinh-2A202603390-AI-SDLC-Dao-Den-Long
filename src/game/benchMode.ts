import * as THREE from 'three';
import { NIGHT_MAPS, STANDARD_TUNING } from '../sim/config.js';
import { createRng } from '../sim/rng.js';
import { ISLAND1_RADIUS } from '../sim/terrain.js';
import { PALETTE } from './palette.js';

interface WanderShade {
  x: number;
  z: number;
  angle: number;
  timer: number;
}

/**
 * Standardized Benchmark Scene (Ticket-04 Part 1):
 * - Night 1 Đảo Bến with full lighting & effects, NO creative additions.
 * - 200 Shades in 'wander' state (seed), 100 Motes, L1-L3 lit with fuel=100.
 * - Mây stationary at (0,0,0), zero player input.
 * - Camera orbits circle r=30, Y=15 looking at (0,0,0), starting at (30,15,0), CCW 15s/rev.
 * - 3s warmup, then measures frame dts for `duration` seconds and posts results to bench server.
 */
export function startBenchmarkMode(canvas: HTMLCanvasElement, seed: number, durationS: number): void {
  document.getElementById('hud')?.classList.add('hidden');
  document.getElementById('overlay')?.classList.add('hidden');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); // exact 1280x720 measurement
  renderer.setSize(1280, 720, false);

  const gl = renderer.getContext();
  let gpuName = 'WebGL';
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    gpuName = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? 'WebGL');
  }
  const rendererDesc = `Three.js ${THREE.REVISION} (${gpuName})`;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.skyNight);
  scene.fog = new THREE.FogExp2(PALETTE.fogNight, 0.011);

  const camera = new THREE.PerspectiveCamera(60, 1280 / 720, 0.1, 260);

  // Ambient intensity for 3/5 lit lanterns: 0.15 + 0.55 * (3/5) = 0.48
  scene.add(new THREE.AmbientLight(0xdce6ff, 0.15 + 0.55 * (3 / 5)));
  const moon = new THREE.DirectionalLight(0xaec4ff, 0.65);
  moon.position.set(30, 55, 25);
  scene.add(moon);

  // Cloud sea & Đảo Bến (no creative floating sky lanterns!)
  const cloudSea = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: PALETTE.cloudSea, roughness: 0.95 })
  );
  cloudSea.rotation.x = -Math.PI / 2;
  cloudSea.position.y = -8;
  scene.add(cloudSea);

  const grass = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLAND1_RADIUS - 0.8, ISLAND1_RADIUS, 2.4, 48),
    new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.9 })
  );
  grass.position.y = -1.2;
  scene.add(grass);

  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(ISLAND1_RADIUS - 0.4, 0.65, 8, 48),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.92 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = -0.12;
  scene.add(rim);

  // Mây stationary at (0, 0, 0)
  const mayGroup = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.42, 0.95, 12),
    new THREE.MeshStandardMaterial({ color: PALETTE.mayRobe, roughness: 0.75 })
  );
  body.position.y = 0.52;
  mayGroup.add(body);
  const scarf = new THREE.Mesh(
    new THREE.TorusGeometry(0.27, 0.08, 8, 16),
    new THREE.MeshStandardMaterial({ color: PALETTE.mayScarfAndCharm, roughness: 0.6 })
  );
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 0.98;
  mayGroup.add(scarf);
  const hat = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 0.36, 18),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.8 })
  );
  hat.position.y = 1.44;
  mayGroup.add(hat);
  const mayLight = new THREE.PointLight(PALETTE.lanternLit, 2.2, 9);
  mayLight.position.set(0, 1.04, 0.56);
  mayGroup.add(mayLight);
  scene.add(mayGroup);

  // 5 Lanterns: L1-L3 lit with fuel=100, L4-L5 unlit
  const litLanternPositions: Array<[number, number]> = [];
  for (let i = 0; i < NIGHT_MAPS[1].lanterns.length; i++) {
    const def = NIGHT_MAPS[1].lanterns[i];
    const isLit = i < 3;
    if (isLit) litLanternPositions.push([def.pos[0], def.pos[2]]);
    const g = new THREE.Group();
    g.position.set(def.pos[0], 0, def.pos[2]);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.3, 3.2, 10),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 })
    );
    post.position.y = 1.6;
    g.add(post);

    const orb = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, isLit ? 1.0 : 0.8, 12),
      new THREE.MeshStandardMaterial({
        color: isLit ? PALETTE.lanternCore : PALETTE.lanternUnlit,
        emissive: isLit ? PALETTE.lanternLit : 0x000000,
        emissiveIntensity: isLit ? 1.4 : 0
      })
    );
    orb.position.y = 3.35;
    g.add(orb);

    if (isLit) {
      const pl = new THREE.PointLight(PALETTE.lanternLit, 10, 18);
      pl.position.y = 3.4;
      g.add(pl);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(STANDARD_TUNING.safe_radius - 0.14, STANDARD_TUNING.safe_radius, 36),
        new THREE.MeshBasicMaterial({ color: PALETTE.lanternLit, side: THREE.DoubleSide, transparent: true, opacity: 0.38 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      g.add(ring);
    }
    scene.add(g);
  }

  const rng = createRng(seed);

  function insideLitSafe(x: number, z: number): boolean {
    for (const [lx, lz] of litLanternPositions) {
      if (Math.hypot(x - lx, z - lz) < STANDARD_TUNING.safe_radius + 0.2) return true;
    }
    return false;
  }

  // 200 Shades evenly spread on island in wander state (InstancedMesh for optimal FPS)
  const SHADE_COUNT = 200;
  const shades: WanderShade[] = [];
  for (let i = 0; i < SHADE_COUNT; i++) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 25; tries++) {
      const r = Math.sqrt(rng.next()) * (ISLAND1_RADIUS - 2.5);
      const a = rng.range(0, Math.PI * 2);
      const cx = Math.cos(a) * r;
      const cz = Math.sin(a) * r;
      if (!insideLitSafe(cx, cz)) {
        x = cx;
        z = cz;
        break;
      }
    }
    shades.push({ x, z, angle: rng.range(0, Math.PI * 2), timer: rng.int(45, 120) });
  }

  const shadeBodyInst = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.62, 10, 10),
    new THREE.MeshStandardMaterial({ color: PALETTE.shadeBody, emissive: 0x1b0b33, roughness: 0.6 }),
    SHADE_COUNT
  );
  const shadeRimInst = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.76, 1),
    new THREE.MeshBasicMaterial({ color: PALETTE.shadeRim, wireframe: true, transparent: true, opacity: 0.65 }),
    SHADE_COUNT
  );
  scene.add(shadeBodyInst, shadeRimInst);

  // 100 Motes spread evenly on island (InstancedMesh)
  const MOTE_COUNT = 100;
  const motePos: Array<[number, number]> = [];
  for (let i = 0; i < MOTE_COUNT; i++) {
    const r = Math.sqrt(rng.next()) * (ISLAND1_RADIUS - 2.0);
    const a = rng.range(0, Math.PI * 2);
    motePos.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const moteCoreInst = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.24, 8, 8),
    new THREE.MeshBasicMaterial({ color: PALETTE.moteCore }),
    MOTE_COUNT
  );
  const moteHaloInst = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.42, 8, 8),
    new THREE.MeshBasicMaterial({ color: PALETTE.moteHalo, transparent: true, opacity: 0.35 }),
    MOTE_COUNT
  );
  scene.add(moteCoreInst, moteHaloInst);

  const dummy = new THREE.Object3D();
  const wanderSpeed = STANDARD_TUNING.shade_speed * 0.5;
  const startTime = performance.now();
  let lastFrameTime = startTime;
  let firstFrameSent = false;
  let finished = false;
  const dts: number[] = [];
  const WARMUP_S = 3.0;

  function stepBench(now: number): void {
    if (finished) return;
    const dtMs = Math.max(0.1, now - lastFrameTime);
    const dt = Math.min(0.05, dtMs / 1000);
    lastFrameTime = now;

    const elapsedS = (now - startTime) / 1000;

    // Update 200 wandering shades
    for (let i = 0; i < SHADE_COUNT; i++) {
      const s = shades[i];
      s.timer -= 1;
      if (s.timer <= 0) {
        s.angle += rng.range(-0.9, 0.9);
        s.timer = rng.int(45, 120);
      }
      let nx = s.x + Math.cos(s.angle) * wanderSpeed * dt;
      let nz = s.z + Math.sin(s.angle) * wanderSpeed * dt;
      if (Math.hypot(nx, nz) > ISLAND1_RADIUS - 1.5 || insideLitSafe(nx, nz)) {
        s.angle += Math.PI * 0.75;
        nx = s.x;
        nz = s.z;
      }
      s.x = nx;
      s.z = nz;

      dummy.position.set(s.x, 1.0 + Math.sin(elapsedS * 4 + i) * 0.1, s.z);
      dummy.rotation.set(0, elapsedS * 1.5 + i, 0);
      dummy.updateMatrix();
      shadeBodyInst.setMatrixAt(i, dummy.matrix);
      shadeRimInst.setMatrixAt(i, dummy.matrix);
    }
    shadeBodyInst.instanceMatrix.needsUpdate = true;
    shadeRimInst.instanceMatrix.needsUpdate = true;

    // Update 100 bobbing motes
    for (let i = 0; i < MOTE_COUNT; i++) {
      const [mx, mz] = motePos[i];
      dummy.position.set(mx, 0.72 + Math.sin(elapsedS * 3.5 + i) * 0.18, mz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      moteCoreInst.setMatrixAt(i, dummy.matrix);
      moteHaloInst.setMatrixAt(i, dummy.matrix);
    }
    moteCoreInst.instanceMatrix.needsUpdate = true;
    moteHaloInst.instanceMatrix.needsUpdate = true;

    // Camera orbit: center (0,0,0), r=30, Y=15, starts at (30,15,0), CCW 15s/rev
    const camAngle = ((Math.PI * 2) / 15.0) * elapsedS;
    camera.position.set(Math.cos(camAngle) * 30, 15, Math.sin(camAngle) * 30);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);

    if (!firstFrameSent) {
      firstFrameSent = true;
      void fetch('/bench-first-frame', { method: 'POST' }).catch(() => {});
    }

    if (elapsedS >= WARMUP_S) {
      dts.push(dtMs);
    }

    if (elapsedS >= WARMUP_S + durationS) {
      finished = true;
      void fetch('/bench-done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dts, renderer: rendererDesc })
      }).catch(() => {});
      return;
    }

    requestAnimationFrame(stepBench);
  }

  requestAnimationFrame(stepBench);
}
