import * as THREE from 'three';
import {
  BELL_TOWER_HEIGHT,
  BELL_TOWER_RADIUS,
  BRIDGE_X_MAX,
  BRIDGE_X_MIN,
  BRIDGE_Z_HALF,
  getJumpPads,
  ISLAND1_RADIUS,
  ISLAND2_B_CENTER_X,
  ISLAND2_RADIUS,
  ISLAND3_RADIUS,
  RAMP_ANGLES_DEG,
  RAMP_HALF_WIDTH,
  RAMP_R_BOTTOM,
  RAMP_R_TOP,
  TIER1_R_MAX,
  TIER1_R_MIN,
  TIER1_Y,
  TIER2_RADIUS,
  TIER2_Y
} from '../sim/terrain.js';
import type { EventRecord, NightNumber, SnapshotRecord, TuningConfig, Vec3 } from '../sim/types.js';
import { PALETTE } from './palette.js';

interface LanternVisual {
  group: THREE.Group;
  orbMesh: THREE.Mesh;
  orbMat: THREE.MeshStandardMaterial;
  tearStripes: THREE.Group;
  fuelBarGroup: THREE.Group;
  fuelFillMesh: THREE.Mesh;
  fuelFillMat: THREE.MeshBasicMaterial;
  pointLight: THREE.PointLight;
  safeRing: THREE.Mesh;
}

interface ShadeVisual {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  rimMat: THREE.MeshBasicMaterial;
  eyeMat: THREE.MeshBasicMaterial;
}

interface DrifterVisual {
  group: THREE.Group;
  ribbons: THREE.Mesh[];
  stolenOrb: THREE.Mesh;
}

interface CharmVisual {
  group: THREE.Group;
}

export interface ProjectedPoint {
  x: number; // pixel X
  y: number; // pixel Y
  inFront: boolean;
  onScreen: boolean;
}

export class GameScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly moonLight: THREE.DirectionalLight;

  private readonly mapGroup = new THREE.Group();
  private readonly entityGroup = new THREE.Group();
  private readonly playerGroup: THREE.Group;
  private readonly miniLanternGroup: THREE.Group;
  private readonly charmAuraMesh: THREE.Mesh;
  private readonly pulseWaveMesh: THREE.Mesh;
  private pulseWaveTimer = 0;

  private readonly lanternVisuals = new Map<string, LanternVisual>();
  private readonly moteMeshes = new Map<string, THREE.Mesh>();
  private readonly shadeVisuals = new Map<string, ShadeVisual>();
  private readonly drifterVisuals = new Map<string, DrifterVisual>();
  private readonly charmVisuals = new Map<string, CharmVisual>();

  private readonly floatingSkyLanterns: THREE.Group[] = [];
  private readonly windLeaves: THREE.Mesh[] = [];
  private readonly windLeafGroup = new THREE.Group();

  private readonly moteGeo = new THREE.SphereGeometry(0.24, 10, 10);
  private readonly moteMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteCore });
  private readonly moteHaloGeo = new THREE.SphereGeometry(0.42, 8, 8);
  private readonly moteHaloMat = new THREE.MeshBasicMaterial({
    color: PALETTE.moteHalo,
    transparent: true,
    opacity: 0.36
  });

  private animTime = 0;
  private loadedNight: NightNumber | null = null;

  constructor(canvas: HTMLCanvasElement, private readonly tuning: TuningConfig) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(PALETTE.skyNight);
    this.scene.fog = new THREE.FogExp2(PALETTE.fogNight, 0.011);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 320);

    this.ambientLight = new THREE.AmbientLight(0xdce6ff, 0.15);
    this.scene.add(this.ambientLight);

    this.moonLight = new THREE.DirectionalLight(0xaec4ff, 0.65);
    this.moonLight.position.set(30, 55, 25);
    this.scene.add(this.moonLight);

    this.scene.add(this.mapGroup);
    this.scene.add(this.entityGroup);

    this.buildBackdrop();
    const { group, miniLantern, charmAura } = this.buildMayModel();
    this.playerGroup = group;
    this.miniLanternGroup = miniLantern;
    this.charmAuraMesh = charmAura;
    this.scene.add(this.playerGroup);

    // Expanding pulse VFX sphere
    this.pulseWaveMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({
        color: PALETTE.lanternLit,
        transparent: true,
        opacity: 0,
        wireframe: true
      })
    );
    this.pulseWaveMesh.visible = false;
    this.scene.add(this.pulseWaveMesh);

    this.buildWindLeaves();
    this.scene.add(this.windLeafGroup);

    window.addEventListener('resize', this.onResize);
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  };

  private buildBackdrop(): void {
    // Sea of clouds below islands (#12384A)
    const cloudSea = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 520),
      new THREE.MeshStandardMaterial({ color: PALETTE.cloudSea, roughness: 0.95, metalness: 0.05 })
    );
    cloudSea.rotation.x = -Math.PI / 2;
    cloudSea.position.set(25, -8, 0);
    this.scene.add(cloudSea);

    // Starfield
    const starPositions: number[] = [];
    for (let i = 0; i < 360; i++) {
      const a = (i * 137.5 * Math.PI) / 180;
      const r = 105 + (i % 65);
      const y = 22 + ((i * 29) % 65);
      starPositions.push(20 + Math.cos(a) * r, y, Math.sin(a) * r);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: PALETTE.moteCore, size: 0.7 })));

    // Creative atmosphere (UI-only, zero sim impact): floating distant lanterns over cloud sea
    const skyLanternGeo = new THREE.CylinderGeometry(0.45, 0.35, 0.85, 8);
    const skyLanternMat = new THREE.MeshBasicMaterial({ color: PALETTE.lanternLit, transparent: true, opacity: 0.68 });
    for (let i = 0; i < 18; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(skyLanternGeo, skyLanternMat));
      const angle = (i / 18) * Math.PI * 2;
      const dist = 62 + (i % 4) * 12;
      g.position.set(Math.cos(angle) * dist, 5 + (i % 5) * 3.5, Math.sin(angle) * dist);
      g.userData = { baseY: g.position.y, phase: i * 0.7, angle, dist };
      this.floatingSkyLanterns.push(g);
      this.scene.add(g);
    }
  }

  private buildWindLeaves(): void {
    const leafGeo = new THREE.PlaneGeometry(0.45, 0.22);
    const leafMat = new THREE.MeshBasicMaterial({
      color: PALETTE.goldTrim,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    for (let i = 0; i < 36; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(((i * 19) % 40) - 20, 1 + (i % 8), ((i * 23) % 40) - 20);
      this.windLeaves.push(leaf);
      this.windLeafGroup.add(leaf);
    }
    this.windLeafGroup.visible = false;
  }

  private buildMayModel(): { group: THREE.Group; miniLantern: THREE.Group; charmAura: THREE.Mesh } {
    const group = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.42, 0.95, 12),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayRobe, roughness: 0.75 })
    );
    body.position.y = 0.52;
    group.add(body);

    const scarf = new THREE.Mesh(
      new THREE.TorusGeometry(0.27, 0.08, 8, 16),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayScarfAndCharm, roughness: 0.6 })
    );
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = 0.98;
    group.add(scarf);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xf4dcc4, roughness: 0.7 })
    );
    head.position.y = 1.18;
    group.add(head);

    const hat = new THREE.Mesh(
      new THREE.ConeGeometry(0.62, 0.36, 18),
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.8 })
    );
    hat.position.y = 1.44;
    group.add(hat);

    const miniLantern = new THREE.Group();
    miniLantern.position.set(0, 1.3, 0.56);
    const cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.24, 6),
      new THREE.MeshBasicMaterial({ color: PALETTE.wood })
    );
    cord.position.y = -0.12;
    miniLantern.add(cord);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 10),
      new THREE.MeshBasicMaterial({ color: PALETTE.lanternCore })
    );
    bulb.position.y = -0.26;
    miniLantern.add(bulb);

    const miniLight = new THREE.PointLight(PALETTE.lanternLit, 2.2, 9);
    miniLight.position.y = -0.26;
    miniLantern.add(miniLight);
    group.add(miniLantern);

    // Wind charm active golden aura ring around Mây
    const charmAura = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.05, 8, 24),
      new THREE.MeshBasicMaterial({ color: PALETTE.goldTrim, transparent: true, opacity: 0.8 })
    );
    charmAura.rotation.x = Math.PI / 2;
    charmAura.position.y = 0.25;
    charmAura.visible = false;
    group.add(charmAura);

    return { group, miniLantern, charmAura };
  }

  private addDiskIsland(cx: number, cz: number, radius: number, topY = 0, height = 2.4): void {
    const grass = new THREE.Mesh(
      new THREE.CylinderGeometry(radius - 0.8, radius, height, 48),
      new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.9 })
    );
    grass.position.set(cx, topY - height / 2, cz);
    this.mapGroup.add(grass);

    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius - 0.4, 0.65, 8, 48),
      new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.92 })
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(cx, topY - 0.12, cz);
    this.mapGroup.add(rim);
  }

  private addJumpPadsForNight(night: NightNumber): void {
    const pads = getJumpPads(night);
    for (const pad of pads) {
      const g = new THREE.Group();
      g.position.set(pad.pos[0], pad.pos[1] + 0.08, pad.pos[2]);

      const base = new THREE.Mesh(
        new THREE.CylinderGeometry(pad.radius, pad.radius * 1.1, 0.18, 20),
        new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.7 })
      );
      g.add(base);

      const glow = new THREE.Mesh(
        new THREE.RingGeometry(0.35, pad.radius * 0.9, 20),
        new THREE.MeshBasicMaterial({ color: PALETTE.goldTrim, side: THREE.DoubleSide })
      );
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.11;
      g.add(glow);

      this.mapGroup.add(g);
    }
  }

  private clearEntities(): void {
    this.entityGroup.clear();
    this.lanternVisuals.clear();
    this.moteMeshes.clear();
    this.shadeVisuals.clear();
    this.drifterVisuals.clear();
    this.charmVisuals.clear();
  }

  loadNight(night: NightNumber): void {
    if (this.loadedNight === night) {
      this.clearEntities();
      return;
    }
    this.loadedNight = night;
    this.mapGroup.clear();
    this.clearEntities();

    if (night === 1) {
      this.addDiskIsland(0, 0, ISLAND1_RADIUS, 0, 2.4);
      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 0.25, 7),
        new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 })
      );
      pier.position.set(0, 0.08, ISLAND1_RADIUS - 2.5);
      this.mapGroup.add(pier);
    } else if (night === 2) {
      this.addDiskIsland(0, 0, ISLAND2_RADIUS, 0, 2.4);
      this.addDiskIsland(ISLAND2_B_CENTER_X, 0, ISLAND2_RADIUS, 0, 2.4);

      // Bamboo bridge x in [26, 44], z in [-2, 2], NO railings
      const bridgeLen = BRIDGE_X_MAX - BRIDGE_X_MIN;
      const bridgeWidth = BRIDGE_Z_HALF * 2;
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(bridgeLen, 0.3, bridgeWidth),
        new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 })
      );
      bridge.position.set((BRIDGE_X_MIN + BRIDGE_X_MAX) / 2, -0.14, 0);
      this.mapGroup.add(bridge);

      // Bamboo cross slats (pure visual detail)
      const slatGeo = new THREE.BoxGeometry(0.45, 0.08, bridgeWidth + 0.1);
      const slatMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.85 });
      for (let x = BRIDGE_X_MIN + 0.5; x <= BRIDGE_X_MAX - 0.5; x += 1.2) {
        const slat = new THREE.Mesh(slatGeo, slatMat);
        slat.position.set(x, 0.01, 0);
        this.mapGroup.add(slat);
      }

      this.addJumpPadsForNight(2);
    } else {
      // Night 3 — Đảo Chuông (3 tiers, 2 ramps, jump pad, bell tower)
      this.addDiskIsland(0, 0, ISLAND3_RADIUS, 0, 2.4);

      // Tier 1 semi-annulus: z > 0, r in [12, 24], Y = 3
      const shape = new THREE.Shape();
      shape.absarc(0, 0, TIER1_R_MAX, 0, Math.PI, false);
      shape.absarc(0, 0, TIER1_R_MIN, Math.PI, 0, true);
      shape.closePath();
      const tier1Geo = new THREE.ExtrudeGeometry(shape, { depth: TIER1_Y, bevelEnabled: false, curveSegments: 36 });
      // Rotate shape (XY where Y>0 -> XZ where Z>0): rotateX(PI/2) maps (x, y, z_extrude) -> (x, -z_extrude, y)
      tier1Geo.rotateX(Math.PI / 2);
      const tier1Mesh = new THREE.Mesh(
        tier1Geo,
        new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.9 })
      );
      tier1Mesh.position.y = TIER1_Y;
      this.mapGroup.add(tier1Mesh);

      // 2 Straight Ramps at 30° and 150°: r=30 (Y=0) to r=24 (Y=3), width 3m
      const horizLen = RAMP_R_BOTTOM - RAMP_R_TOP; // 6m
      const slopeLen = Math.hypot(horizLen, TIER1_Y);
      const pitch = Math.atan2(TIER1_Y, horizLen);
      for (const deg of RAMP_ANGLES_DEG) {
        const rad = (deg * Math.PI) / 180;
        const midR = (RAMP_R_TOP + RAMP_R_BOTTOM) / 2;
        const rampGroup = new THREE.Group();
        rampGroup.position.set(Math.cos(rad) * midR, TIER1_Y / 2, Math.sin(rad) * midR);
        // Align local +X along radial outward (cos rad, 0, sin rad)
        rampGroup.rotation.y = -rad;

        const rampMesh = new THREE.Mesh(
          new THREE.BoxGeometry(slopeLen + 0.4, 0.3, RAMP_HALF_WIDTH * 2),
          new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 })
        );
        rampMesh.rotation.z = -pitch;
        rampGroup.add(rampMesh);
        this.mapGroup.add(rampGroup);
      }

      // Tier 2 central plateau: disk r=8, Y=6
      const tier2 = new THREE.Mesh(
        new THREE.CylinderGeometry(TIER2_RADIUS, TIER2_RADIUS + 0.2, TIER2_Y, 36),
        new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.88 })
      );
      tier2.position.y = TIER2_Y / 2;
      this.mapGroup.add(tier2);

      // Bell Tower at center of Tier 2: cylinder r=2, height=8
      const towerBase = new THREE.Mesh(
        new THREE.CylinderGeometry(BELL_TOWER_RADIUS * 0.9, BELL_TOWER_RADIUS, BELL_TOWER_HEIGHT, 16),
        new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.8 })
      );
      towerBase.position.y = TIER2_Y + BELL_TOWER_HEIGHT / 2;
      this.mapGroup.add(towerBase);

      const towerRoof = new THREE.Mesh(
        new THREE.ConeGeometry(BELL_TOWER_RADIUS * 1.65, 2.6, 8),
        new THREE.MeshStandardMaterial({ color: PALETTE.mayScarfAndCharm, roughness: 0.7 })
      );
      towerRoof.position.y = TIER2_Y + BELL_TOWER_HEIGHT + 1.1;
      this.mapGroup.add(towerRoof);

      const bell = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.72, 1.1, 12),
        new THREE.MeshStandardMaterial({ color: PALETTE.goldTrim, metalness: 0.5, roughness: 0.3 })
      );
      bell.position.y = TIER2_Y + BELL_TOWER_HEIGHT - 1.2;
      this.mapGroup.add(bell);

      this.addJumpPadsForNight(3);
    }
  }

  private getOrCreateLantern(id: string, pos: Vec3): LanternVisual {
    const existing = this.lanternVisuals.get(id);
    if (existing) return existing;

    const group = new THREE.Group();
    group.position.set(pos[0], pos[1], pos[2]);

    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.3, 3.2, 10),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 })
    );
    post.position.y = 1.6;
    group.add(post);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.1, 0.65, 6),
      new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.8 })
    );
    roof.position.y = 4.1;
    group.add(roof);

    const orbMat = new THREE.MeshStandardMaterial({
      color: PALETTE.lanternUnlit,
      emissive: 0x000000,
      roughness: 0.5
    });
    const orbMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.0, 12), orbMat);
    orbMesh.position.y = 3.35;
    group.add(orbMesh);

    // Non-color distinction when unlit: visible dark torn-paper rips on the cylinder
    const tearStripes = new THREE.Group();
    tearStripes.position.y = 3.35;
    const tearMat = new THREE.MeshBasicMaterial({ color: 0x120a1a });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const rip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.62, 0.04), tearMat);
      rip.position.set(Math.cos(angle) * 0.56, 0, Math.sin(angle) * 0.56);
      rip.rotation.y = -angle + Math.PI / 2;
      rip.rotation.z = 0.25;
      tearStripes.add(rip);
    }
    group.add(tearStripes);

    // Overhead 3D fuel bar above lit lanterns
    const fuelBarGroup = new THREE.Group();
    fuelBarGroup.position.y = 4.85;
    const barBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x0e1430, side: THREE.DoubleSide })
    );
    fuelBarGroup.add(barBg);
    const fuelFillMat = new THREE.MeshBasicMaterial({ color: PALETTE.lanternLit, side: THREE.DoubleSide });
    const fuelFillMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.14), fuelFillMat);
    fuelFillMesh.position.z = 0.02;
    fuelBarGroup.add(fuelFillMesh);
    fuelBarGroup.visible = false;
    group.add(fuelBarGroup);

    const pointLight = new THREE.PointLight(PALETTE.lanternLit, 0, 18);
    pointLight.position.y = 3.4;
    group.add(pointLight);

    const safeRing = new THREE.Mesh(
      new THREE.RingGeometry(this.tuning.safe_radius - 0.14, this.tuning.safe_radius, 36),
      new THREE.MeshBasicMaterial({
        color: PALETTE.lanternLit,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.38
      })
    );
    safeRing.rotation.x = -Math.PI / 2;
    safeRing.position.y = 0.06;
    safeRing.visible = false;
    group.add(safeRing);

    this.entityGroup.add(group);
    const vis: LanternVisual = { group, orbMesh, orbMat, tearStripes, fuelBarGroup, fuelFillMesh, fuelFillMat, pointLight, safeRing };
    this.lanternVisuals.set(id, vis);
    return vis;
  }

  private getOrCreateShade(id: string): ShadeVisual {
    const existing = this.shadeVisuals.get(id);
    if (existing) return existing;

    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.shadeBody,
      emissive: 0x1b0b33,
      roughness: 0.6
    });
    group.add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 12), bodyMat));

    const rimMat = new THREE.MeshBasicMaterial({
      color: PALETTE.shadeRim,
      wireframe: true,
      transparent: true,
      opacity: 0.7
    });
    group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.76, 1), rimMat));

    // Glowing eyes (switch from #7A3CFF to #00B3FF in colorblind mode)
    const eyeMat = new THREE.MeshBasicMaterial({ color: PALETTE.shadeRim });
    const eyeGeo = new THREE.SphereGeometry(0.11, 8, 8);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.2, 0.14, 0.56);
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.2, 0.14, 0.56);
    group.add(leftEye, rightEye);

    this.entityGroup.add(group);
    const vis: ShadeVisual = { group, bodyMat, rimMat, eyeMat };
    this.shadeVisuals.set(id, vis);
    return vis;
  }

  private getOrCreateDrifter(id: string): DrifterVisual {
    const existing = this.drifterVisuals.get(id);
    if (existing) return existing;

    const group = new THREE.Group();
    const ribbons: THREE.Mesh[] = [];
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.drifter,
      emissive: 0x26384d,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.88
    });
    for (let i = 0; i < 4; i++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.35 - i * 0.04, 0.08, 0.65), mat);
      seg.position.z = -i * 0.55;
      ribbons.push(seg);
      group.add(seg);
    }

    const stolenOrb = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 10, 10),
      new THREE.MeshBasicMaterial({ color: PALETTE.moteCore })
    );
    stolenOrb.position.set(0, 0.35, 0.25);
    stolenOrb.visible = false;
    group.add(stolenOrb);

    this.entityGroup.add(group);
    const vis: DrifterVisual = { group, ribbons, stolenOrb };
    this.drifterVisuals.set(id, vis);
    return vis;
  }

  private getOrCreateCharm(id: string, pos: Vec3): CharmVisual {
    const existing = this.charmVisuals.get(id);
    if (existing) return existing;

    const group = new THREE.Group();
    group.position.set(pos[0], pos[1] + 1.0, pos[2]);

    const border = new THREE.Mesh(
      new THREE.BoxGeometry(0.56, 0.92, 0.06),
      new THREE.MeshBasicMaterial({ color: PALETTE.goldTrim })
    );
    group.add(border);

    const paper = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.8, 0.09),
      new THREE.MeshStandardMaterial({
        color: PALETTE.mayScarfAndCharm,
        emissive: 0x550814,
        roughness: 0.5
      })
    );
    group.add(paper);

    this.entityGroup.add(group);
    const vis: CharmVisual = { group };
    this.charmVisuals.set(id, vis);
    return vis;
  }

  projectToScreen(pos: Vec3): ProjectedPoint {
    const v = new THREE.Vector3(pos[0], pos[1], pos[2]);
    v.project(this.camera);
    const inFront = v.z >= -1 && v.z <= 1;
    const onScreen = inFront && v.x >= -0.94 && v.x <= 0.94 && v.y >= -0.94 && v.y <= 0.94;
    const x = (v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
    return { x, y, inFront, onScreen };
  }

  sync(
    snapshot: SnapshotRecord,
    events: EventRecord[],
    camYawDeg: number,
    facingYaw: number,
    windWarning: boolean,
    respawning: boolean,
    dt: number,
    colorblindMode = false,
    shakeIntensity = 0
  ): void {
    this.animTime += dt;
    if (this.loadedNight !== snapshot.night) {
      this.loadNight(snapshot.night);
    }

    for (const ev of events) {
      if (ev.name === 'pulse') {
        this.pulseWaveTimer = 0.4;
        this.pulseWaveMesh.visible = true;
        this.pulseWaveMesh.position.set(snapshot.player.pos[0], snapshot.player.pos[1] + 0.8, snapshot.player.pos[2]);
      }
    }

    // Player
    this.playerGroup.position.set(snapshot.player.pos[0], snapshot.player.pos[1], snapshot.player.pos[2]);
    this.playerGroup.rotation.y = facingYaw;
    if (respawning) {
      this.playerGroup.visible = false;
    } else {
      this.playerGroup.visible = !snapshot.player.invuln || Math.floor(this.animTime * 16) % 2 === 0;
    }
    this.miniLanternGroup.rotation.z = Math.sin(this.animTime * 4) * 0.14;
    this.charmAuraMesh.visible = snapshot.player.charm_s > 0;
    this.charmAuraMesh.rotation.z = this.animTime * 4;

    // Lanterns & standardized ambient intensity: 0.15 + 0.55 * (lit / total)
    let litCount = 0;
    const blink1HzOn = Math.floor(this.animTime * 2) % 2 === 0;
    for (const l of snapshot.lanterns) {
      const vis = this.getOrCreateLantern(l.id, l.pos);
      vis.group.position.set(l.pos[0], l.pos[1], l.pos[2]);
      if (l.lit) {
        litCount += 1;
        const lowFuel = l.fuel < this.tuning.low_fuel_threshold;
        const blinkScale = lowFuel && !blink1HzOn ? 0.3 : 1.0;
        vis.orbMesh.scale.set(1, 1, 1);
        vis.tearStripes.visible = false;
        vis.orbMat.color.setHex(PALETTE.lanternCore);
        vis.orbMat.emissive.setHex(PALETTE.lanternLit);
        vis.orbMat.emissiveIntensity = 1.4 * blinkScale;
        vis.pointLight.intensity = 10 * blinkScale;
        // Safe zone only active when fuel >= 30
        vis.safeRing.visible = !lowFuel;

        // Fuel bar above lit lantern (billboard toward camera)
        vis.fuelBarGroup.visible = !lowFuel || blink1HzOn;
        vis.fuelBarGroup.lookAt(this.camera.position);
        const fuelRatio = Math.max(0.01, Math.min(1, l.fuel / this.tuning.fuel_max));
        vis.fuelFillMesh.scale.x = fuelRatio;
        vis.fuelFillMesh.position.x = -0.75 * (1 - fuelRatio);
        vis.fuelFillMat.color.setHex(lowFuel ? (colorblindMode ? 0xffffff : PALETTE.uiDanger) : PALETTE.lanternLit);
      } else {
        const cost = l.ever_lit ? this.tuning.relight_cost : this.tuning.lantern_cost;
        const ratio = l.deposited / Math.max(1, cost);
        // Unlit lantern squashed 20% vertically + visible paper tear stripes
        vis.orbMesh.scale.set(1, 0.8, 1);
        vis.tearStripes.visible = true;
        vis.orbMat.color.setHex(PALETTE.lanternUnlit);
        vis.orbMat.emissive.setHex(PALETTE.lanternLit);
        vis.orbMat.emissiveIntensity = ratio * 0.65;
        vis.pointLight.intensity = ratio * 3.5;
        vis.safeRing.visible = false;
        vis.fuelBarGroup.visible = false;
      }
    }
    this.ambientLight.intensity = 0.15 + 0.55 * (litCount / Math.max(1, snapshot.lanterns.length));

    // Motes
    const activeMoteIds = new Set<string>();
    for (const m of snapshot.motes) {
      activeMoteIds.add(m.id);
      let mesh = this.moteMeshes.get(m.id);
      if (!mesh) {
        mesh = new THREE.Mesh(this.moteGeo, this.moteMat);
        mesh.add(new THREE.Mesh(this.moteHaloGeo, this.moteHaloMat));
        this.entityGroup.add(mesh);
        this.moteMeshes.set(m.id, mesh);
      }
      const bob = 0.72 + Math.sin(this.animTime * 3.5 + m.pos[0] + m.pos[2]) * 0.18;
      mesh.position.set(m.pos[0], m.pos[1] + bob, m.pos[2]);
    }
    for (const [id, mesh] of this.moteMeshes) {
      if (!activeMoteIds.has(id)) {
        this.entityGroup.remove(mesh);
        this.moteMeshes.delete(id);
      }
    }

    // Shades
    const shadeAccentHex = colorblindMode ? PALETTE.shadeRimColorblind : PALETTE.shadeRim;
    const activeShadeIds = new Set<string>();
    for (const s of snapshot.shades) {
      activeShadeIds.add(s.id);
      const vis = this.getOrCreateShade(s.id);
      vis.group.position.set(s.pos[0], s.pos[1] + Math.sin(this.animTime * 4 + s.pos[0]) * 0.1, s.pos[2]);
      vis.group.rotation.y += dt * (s.state === 'stunned' ? 6 : s.state === 'drain' ? 3.5 : 1.5);
      if (s.state === 'stunned') {
        vis.bodyMat.color.setHex(PALETTE.shadeStunned);
        vis.rimMat.color.setHex(PALETTE.drifter);
        vis.eyeMat.color.setHex(PALETTE.drifter);
      } else {
        vis.bodyMat.color.setHex(PALETTE.shadeBody);
        vis.rimMat.color.setHex(shadeAccentHex);
        vis.eyeMat.color.setHex(shadeAccentHex);
      }
    }
    for (const [id, vis] of this.shadeVisuals) {
      if (!activeShadeIds.has(id)) {
        this.entityGroup.remove(vis.group);
        this.shadeVisuals.delete(id);
      }
    }

    // Drifters (Gió Lạc)
    const activeDrifterIds = new Set<string>();
    for (const d of snapshot.drifters) {
      activeDrifterIds.add(d.id);
      const vis = this.getOrCreateDrifter(d.id);
      vis.group.position.set(d.pos[0], d.pos[1] + Math.sin(this.animTime * 5 + d.pos[0]) * 0.2, d.pos[2]);
      vis.group.rotation.y = Math.atan2(snapshot.player.pos[0] - d.pos[0], snapshot.player.pos[2] - d.pos[2]);
      for (let i = 0; i < vis.ribbons.length; i++) {
        vis.ribbons[i].position.y = Math.sin(this.animTime * 7 - i * 0.8) * 0.14;
      }
      vis.stolenOrb.visible = d.stolen > 0;
    }
    for (const [id, vis] of this.drifterVisuals) {
      if (!activeDrifterIds.has(id)) {
        this.entityGroup.remove(vis.group);
        this.drifterVisuals.delete(id);
      }
    }

    // Wind Charms (Bùa Gió)
    const activeCharmIds = new Set<string>();
    for (const c of snapshot.charms) {
      activeCharmIds.add(c.id);
      const vis = this.getOrCreateCharm(c.id, c.pos);
      vis.group.visible = c.available;
      vis.group.position.set(c.pos[0], c.pos[1] + 1.0 + Math.sin(this.animTime * 3) * 0.15, c.pos[2]);
      vis.group.rotation.y = this.animTime * 2.2;
    }
    for (const [id, vis] of this.charmVisuals) {
      if (!activeCharmIds.has(id)) {
        this.entityGroup.remove(vis.group);
        this.charmVisuals.delete(id);
      }
    }

    // Wind leaf particles (Night 3 warning & active gust)
    const showLeaves = windWarning || snapshot.wind.active;
    this.windLeafGroup.visible = showLeaves;
    if (showLeaves) {
      const dirRad = (snapshot.wind.dir_deg * Math.PI) / 180;
      const speed = snapshot.wind.active ? 14 : 6;
      const dx = Math.cos(dirRad) * speed * dt;
      const dz = Math.sin(dirRad) * speed * dt;
      for (const leaf of this.windLeaves) {
        leaf.position.x += dx;
        leaf.position.z += dz;
        leaf.rotation.x += dt * 4;
        leaf.rotation.z += dt * 3;
        if (Math.hypot(leaf.position.x - snapshot.player.pos[0], leaf.position.z - snapshot.player.pos[2]) > 26) {
          leaf.position.set(
            snapshot.player.pos[0] + (Math.sin(this.animTime + leaf.id) * 18 - Math.cos(dirRad) * 14),
            snapshot.player.pos[1] + 1 + (leaf.id % 6),
            snapshot.player.pos[2] + (Math.cos(this.animTime + leaf.id) * 18 - Math.sin(dirRad) * 14)
          );
        }
      }
    }

    // Pulse wave VFX
    if (this.pulseWaveTimer > 0) {
      this.pulseWaveTimer = Math.max(0, this.pulseWaveTimer - dt);
      const t = 1 - this.pulseWaveTimer / 0.4;
      this.pulseWaveMesh.scale.setScalar(0.5 + t * this.tuning.pulse_radius);
      (this.pulseWaveMesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.75;
      if (this.pulseWaveTimer <= 0) this.pulseWaveMesh.visible = false;
    }

    // Distant floating sky lanterns
    for (const g of this.floatingSkyLanterns) {
      const { baseY, phase, angle, dist } = g.userData as { baseY: number; phase: number; angle: number; dist: number };
      const a = angle + this.animTime * 0.025;
      const centerX = snapshot.night === 2 ? 35 : 0;
      g.position.set(centerX + Math.cos(a) * dist, baseY + Math.sin(this.animTime * 0.9 + phase) * 1.1, Math.sin(a) * dist);
    }

    // Camera (with optional hit shake disabled in reducedMotion mode)
    const yawRad = (camYawDeg * Math.PI) / 180;
    const camDist = 11.0;
    const camHeight = 5.6;
    const targetY = Math.max(-2, snapshot.player.pos[1]);
    const shakeX = shakeIntensity > 0 ? Math.sin(this.animTime * 65) * shakeIntensity : 0;
    const shakeY = shakeIntensity > 0 ? Math.cos(this.animTime * 73) * shakeIntensity * 0.6 : 0;
    this.camera.position.set(
      snapshot.player.pos[0] - Math.sin(yawRad) * camDist + shakeX,
      targetY + camHeight + shakeY,
      snapshot.player.pos[2] - Math.cos(yawRad) * camDist
    );
    this.camera.lookAt(snapshot.player.pos[0], targetY + 1.2, snapshot.player.pos[2]);

    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.dispose();
  }
}
