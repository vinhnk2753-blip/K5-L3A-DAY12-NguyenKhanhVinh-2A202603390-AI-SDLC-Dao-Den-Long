import * as THREE from 'three';
import { ISLAND_RADIUS_NIGHT1 } from '../sim/config.js';
import type { EventRecord, SnapshotRecord, TuningConfig } from '../sim/types.js';

interface LanternVisual {
  group: THREE.Group;
  orbMat: THREE.MeshStandardMaterial;
  pointLight: THREE.PointLight;
  safeRing: THREE.Mesh;
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  rimMat: THREE.MeshBasicMaterial;
}

export class GameScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly moonLight: THREE.DirectionalLight;
  private readonly playerGroup: THREE.Group;
  private readonly miniLanternGroup: THREE.Group;
  private readonly pulseWaveMesh: THREE.Mesh;
  private pulseWaveTimer = 0;

  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly moteMeshes = new Map<string, THREE.Mesh>();
  private readonly shadeVisuals = new Map<string, ShadeVisual>();
  private readonly floatingSkyLanterns: THREE.Group[] = [];

  private readonly moteGeo = new THREE.SphereGeometry(0.24, 12, 12);
  private readonly moteMat = new THREE.MeshBasicMaterial({ color: 0xfff6c2 });
  private readonly moteHaloGeo = new THREE.SphereGeometry(0.42, 10, 10);
  private readonly moteHaloMat = new THREE.MeshBasicMaterial({
    color: 0xffe58a,
    transparent: true,
    opacity: 0.35
  });

  private animTime = 0;

  constructor(canvas: HTMLCanvasElement, private readonly tuning: TuningConfig) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1430);
    this.scene.fog = new THREE.FogExp2(0x1b2350, 0.014);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 260);

    this.ambientLight = new THREE.AmbientLight(0xdce6ff, 0.25);
    this.scene.add(this.ambientLight);

    this.moonLight = new THREE.DirectionalLight(0xaec4ff, 0.65);
    this.moonLight.position.set(25, 45, 20);
    this.scene.add(this.moonLight);

    this.buildEnvironment();
    const { group, miniLantern } = this.buildMayModel();
    this.playerGroup = group;
    this.miniLanternGroup = miniLantern;
    this.scene.add(this.playerGroup);

    // Expanding pulse VFX sphere
    const pulseGeo = new THREE.SphereGeometry(1, 24, 16);
    const pulseMat = new THREE.MeshBasicMaterial({
      color: 0xffb347,
      transparent: true,
      opacity: 0,
      wireframe: true
    });
    this.pulseWaveMesh = new THREE.Mesh(pulseGeo, pulseMat);
    this.pulseWaveMesh.visible = false;
    this.scene.add(this.pulseWaveMesh);

    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private buildEnvironment(): void {
    // Sea of clouds far below
    const cloudGeo = new THREE.PlaneGeometry(360, 360);
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0x12384a,
      roughness: 0.95,
      metalness: 0.05
    });
    const cloudSea = new THREE.Mesh(cloudGeo, cloudMat);
    cloudSea.rotation.x = -Math.PI / 2;
    cloudSea.position.y = -6;
    this.scene.add(cloudSea);

    // Đảo Bến main grassy disk + sandy shore rim
    const grassGeo = new THREE.CylinderGeometry(ISLAND_RADIUS_NIGHT1 - 1.2, ISLAND_RADIUS_NIGHT1, 2.2, 48);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x2f5d50, roughness: 0.9 });
    const island = new THREE.Mesh(grassGeo, grassMat);
    island.position.y = -1.1;
    this.scene.add(island);

    const rimGeo = new THREE.TorusGeometry(ISLAND_RADIUS_NIGHT1 - 0.6, 0.85, 8, 48);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 0.92 });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = -0.15;
    this.scene.add(rim);

    // Decorative wooden pier near south shore (visual only)
    const pierGeo = new THREE.BoxGeometry(3.2, 0.25, 7);
    const pierMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.85 });
    const pier = new THREE.Mesh(pierGeo, pierMat);
    pier.position.set(0, 0.08, ISLAND_RADIUS_NIGHT1 - 2.5);
    this.scene.add(pier);

    // Starfield
    const starPositions: number[] = [];
    for (let i = 0; i < 320; i++) {
      const a = (i * 137.5 * Math.PI) / 180;
      const r = 85 + (i % 45);
      const y = 20 + ((i * 29) % 60);
      starPositions.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xfff6c2, size: 0.65 });
    this.scene.add(new THREE.Points(starGeo, starMat));

    // Creative atmosphere (UI-only, zero sim effect): distant drifting paper lanterns over cloud sea
    const skyLanternGeo = new THREE.CylinderGeometry(0.45, 0.35, 0.85, 8);
    const skyLanternMat = new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.72 });
    for (let i = 0; i < 16; i++) {
      const g = new THREE.Group();
      const mesh = new THREE.Mesh(skyLanternGeo, skyLanternMat);
      g.add(mesh);
      const angle = (i / 16) * Math.PI * 2;
      const dist = 54 + (i % 4) * 9;
      g.position.set(Math.cos(angle) * dist, 4 + (i % 5) * 3.5, Math.sin(angle) * dist);
      g.userData = { baseY: g.position.y, phase: i * 0.7, angle, dist };
      this.floatingSkyLanterns.push(g);
      this.scene.add(g);
    }
  }

  private buildMayModel(): { group: THREE.Group; miniLantern: THREE.Group } {
    const group = new THREE.Group();

    // Ivory tunic (#E8E2D0)
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.42, 0.95, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8e2d0, roughness: 0.75 })
    );
    body.position.y = 0.52;
    group.add(body);

    // Crimson scarf (#C8102E)
    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.08, 8, 16),
      new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.6 })
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.98;
    group.add(scarf);

    // Head
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0xf4dcc4, roughness: 0.7 })
    );
    head.position.y = 1.18;
    group.add(head);

    // Conical Nón Lá hat
    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.62, 0.36, 20),
      new THREE.MeshStandardMaterial({ color: 0xd9c28a, roughness: 0.8 })
    );
    hat.position.y = 1.44;
    group.add(hat);

    // Mini hanging lantern on the brim of Nón Lá
    const miniLantern = new THREE.Group();
    miniLantern.position.set(0, 1.3, 0.56);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.24, 6),
      new THREE.MeshBasicMaterial({ color: 0x6b4a2f })
    );
    cord.position.y = -0.12;
    miniLantern.add(cord);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe9b0 })
    );
    bulb.position.y = -0.26;
    miniLantern.add(bulb);

    const miniLight = new THREE.PointLight(0xffb347, 2.2, 8);
    miniLight.position.y = -0.26;
    miniLantern.add(miniLight);
    group.add(miniLantern);

    return { group, miniLantern };
  }

  private getOrCreateLantern(id: string, pos: [number, number, number]): LanternVisual {
    const existing = this.lanternVisuals.get(id);
    if (existing) return existing;

    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.3, 3.2, 10),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.85 })
    );
    post.position.y = 1.6;
    group.add(post);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 0.65, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.8 })
    );
    roof.position.y = 4.1;
    group.add(roof);

    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x5b5f6e,
      emissive: 0x000000,
      roughness: 0.5
    });
    const orb = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.0, 12), orbMat);
    orb.position.y = 3.35;
    group.add(orb);

    const pointLight = new THREE.PointLight(0xffb347, 0, 18);
    pointLight.position.y = 3.4;
    group.add(pointLight);

    const safeRing = new THREE.Mesh(
      new THREE.RingGeometry(this.tuning.safe_radius - 0.14, this.tuning.safe_radius, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffb347,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.38
      })
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.05;
    safeRing.visible = false;
    group.add(safeRing);

    this.scene.add(group);
    const vis: LanternVisual = { group, orbMat, pointLight, safeRing };
    this.lanternVisuals.set(id, vis);
    return vis;
  }

  private getOrCreateShade(id: string): ShadeVisual {
    const existing = this.shadeVisuals.get(id);
    if (existing) return existing;

    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x120a1a,
      emissive: 0x260d47,
      roughness: 0.6
    });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 14), bodyMat);
    group.add(body);

    const rimMat = new THREE.MeshBasicMaterial({
      color: 0x7a3cff,
      wireframe: true,
      transparent: true,
      opacity: 0.65
    });
    const rim = new THREE.Mesh(new THREE.IcosahedronGeometry(0.76, 1), rimMat);
    group.add(rim);

    this.scene.add(group);
    const vis: ShadeVisual = { group, bodyMat, rimMat };
    this.shadeVisuals.set(id, vis);
    return vis;
  }

  triggerPulse(): void {
    this.pulseWaveTimer = 0.4;
    this.pulseWaveMesh.visible = true;
    this.pulseWaveMesh.position.copy(this.playerGroup.position);
    this.pulseWaveMesh.position.y += 0.8;
  }

  sync(snapshot: SnapshotRecord, events: EventRecord[], camYawDeg: number, facingYaw: number, invulnTicks: number, dt: number): void {
    this.animTime += dt;

    for (const ev of events) {
      if (ev.name === 'pulse') this.triggerPulse();
    }

    // Player
    this.playerGroup.position.set(snapshot.player.pos[0], snapshot.player.pos[1], snapshot.player.pos[2]);
    this.playerGroup.rotation.y = facingYaw;
    this.playerGroup.visible = invulnTicks === 0 || Math.floor(invulnTicks / 4) % 2 === 0;
    this.miniLanternGroup.rotation.z = Math.sin(this.animTime * 4) * 0.14;

    // Lanterns & ambient light progression
    let litCount = 0;
    for (const l of snapshot.lanterns) {
      const vis = this.getOrCreateLantern(l.id, l.pos);
      vis.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
      if (l.lit) {
        litCount += 1;
        vis.orbMat.color.setHex(0xffe9b0);
        vis.orbMat.emissive.setHex(0xffb347);
        vis.orbMat.emissiveIntensity = 1.4;
        vis.pointLight.intensity = 10;
        vis.safeRing.visible = true;
      } else {
        const ratio = l.deposited / Math.max(1, this.tuning.lantern_cost);
        vis.orbMat.color.setHex(0x5b5f6e);
        vis.orbMat.emissive.setHex(0xffb347);
        vis.orbMat.emissiveIntensity = ratio * 0.65;
        vis.pointLight.intensity = ratio * 3.5;
        vis.safeRing.visible = false;
      }
    }
    const progress = litCount / Math.max(1, snapshot.lanterns.length);
    this.ambientLight.intensity = 0.15 + 0.55 * progress;

    // Motes
    const activeMoteIds = new Set<string>();
    for (const m of snapshot.motes) {
      activeMoteIds.add(m.id);
      let mesh = this.moteMeshes.get(m.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.moteGeo, this.moteMat);
        const halo = new THREE.Mesh(this.moteHaloGeo, this.moteHaloMat);
        mesh.add(halo);
        this.scene.add(mesh);
        this.moteMeshes.set(m.id, mesh);
      }
      const bob = 0.75 + Math.sin(this.animTime * 3.5 + m.pos[0] + m.pos[2]) * 0.2;
      mesh.position.set(m.pos[0], m.pos[1] + bob, m.pos[2]);
    }
    for (const [id, mesh] of this.moteMeshes) {
      if (!activeMoteIds.has(id)) {
        this.scene.remove(mesh);
        this.moteMeshes.delete(id);
      }
    }

    // Shades
    const activeShadeIds = new Set<string>();
    for (const s of snapshot.shades) {
      activeShadeIds.add(s.id);
      const vis = this.getOrCreateShade(s.id);
      vis.group.position.set(s.pos[0], s.pos[1] + Math.sin(this.animTime * 4 + s.pos[0]) * 0.12, s.pos[2]);
      vis.group.rotation.y += dt * (s.state === 'stunned' ? 6 : 1.5);
      if (s.state === 'stunned') {
        vis.bodyMat.color.setHex(0x3a3450);
        vis.rimMat.color.setHex(0x8fa3b8);
      } else {
        vis.bodyMat.color.setHex(0x120a1a);
        vis.rimMat.color.setHex(0x7a3cff);
      }
    }
    for (const [id, vis] of this.shadeVisuals) {
      if (!activeShadeIds.has(id)) {
        this.scene.remove(vis.group);
        this.shadeVisuals.delete(id);
      }
    }

    // Pulse wave animation
    if (this.pulseWaveTimer > 0) {
      this.pulseWaveTimer = Math.max(0, this.pulseWaveTimer - dt);
      const t = 1 - this.pulseWaveTimer / 0.4;
      const scale = 0.5 + t * this.tuning.pulse_radius;
      this.pulseWaveMesh.scale.setScalar(scale);
      (this.pulseWaveMesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.75;
      if (this.pulseWaveTimer <= 0) this.pulseWaveMesh.visible = false;
    }

    // Creative background drifting sky lanterns
    for (const g of this.floatingSkyLanterns) {
      const { baseY, phase, angle, dist } = g.userData as { baseY: number; phase: number; angle: number; dist: number };
      const a = angle + this.animTime * 0.03;
      g.position.set(Math.cos(a) * dist, baseY + Math.sin(this.animTime * 0.9 + phase) * 1.1, Math.sin(a) * dist);
    }

    // Third-person camera following Mây along camYawDeg
    const yawRad = (camYawDeg * Math.PI) / 180;
    const camDist = 10.5;
    const camHeight = 5.4;
    const camX = snapshot.player.pos[0] - Math.sin(yawRad) * camDist;
    const camZ = snapshot.player.pos[2] - Math.cos(yawRad) * camDist;
    this.camera.position.set(camX, snapshot.player.pos[1] + camHeight, camZ);
    this.camera.lookAt(snapshot.player.pos[0], snapshot.player.pos[1] + 1.2, snapshot.player.pos[2]);

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
