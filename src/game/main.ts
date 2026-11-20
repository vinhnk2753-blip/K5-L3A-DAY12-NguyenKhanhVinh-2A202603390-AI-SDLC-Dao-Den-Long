import './styles.css';
import { DT, PHASE1_TUNING } from '../sim/config.js';
import { createSimulation, type SimulationInstance } from '../sim/engine.js';
import type { EventRecord } from '../sim/types.js';
import { InputController } from './input.js';
import { GameScene } from './scene.js';
import { HudController } from './ui.js';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const input = new InputController(canvas);
const scene = new GameScene(canvas, PHASE1_TUNING);
const hud = new HudController(PHASE1_TUNING);

let sim: SimulationInstance = createSimulation({ seed: 2026, night: 1 });
let running = false;
let accumulator = 0;
let lastTime = performance.now();
let lastGameOverReason = '';

function startNewRun(): void {
  sim = createSimulation({ seed: Date.now() & 0xfffffff, night: 1 });
  accumulator = 0;
  lastGameOverReason = '';
  running = true;
  hud.showHud();
}

document.getElementById('btn-start')?.addEventListener('click', startNewRun);

function loop(now: number): void {
  requestAnimationFrame(loop);
  const frameDt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;

  const events: EventRecord[] = [];
  if (running && sim.getState() === 'playing') {
    accumulator += frameDt;
    const liveInput = input.poll();
    while (accumulator >= DT && sim.getState() === 'playing') {
      const stepEv = sim.step(liveInput);
      for (const e of stepEv) {
        events.push(e);
        if (e.name === 'game_over') {
          lastGameOverReason = String(e.data.reason ?? '');
        }
      }
      accumulator -= DT;
    }

    const st = sim.getState();
    if (st !== 'playing') {
      running = false;
      hud.showEndScreen(st, sim.getScore(), lastGameOverReason, startNewRun);
    }
  }

  const snap = sim.getSnapshot();
  scene.sync(snap, events, input.getCamYawDeg(), sim.getFacingYaw(), sim.getInvulnTicks(), frameDt);
  hud.update(snap, sim.getPulseCooldownTicks());
}

requestAnimationFrame(loop);
