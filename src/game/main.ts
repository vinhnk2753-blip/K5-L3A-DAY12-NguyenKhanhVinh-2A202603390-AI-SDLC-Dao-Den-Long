import './styles.css';
import { DT, STANDARD_TUNING } from '../sim/config.js';
import { createSimulation, type SimulationInstance } from '../sim/engine.js';
import type { EventRecord, NightNumber } from '../sim/types.js';
import { AudioEngine } from './audio.js';
import { InputController } from './input.js';
import { GameScene } from './scene.js';
import { loadSettings, saveSettings, type GameSettings } from './settings.js';
import { type MenuCallbacks, UiController } from './ui.js';

type ScreenMode = 'menu' | 'intro' | 'playing' | 'paused' | 'result';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const settings: GameSettings = loadSettings();
const audio = new AudioEngine();
audio.setVolume(settings.volume);

const input = new InputController(canvas, settings.mouseSensitivity);
const scene = new GameScene(canvas, STANDARD_TUNING);
const ui = new UiController(STANDARD_TUNING);

let currentNight: NightNumber = 1;
let totalCampaignScore = 0;
let screenMode: ScreenMode = 'menu';
let sim: SimulationInstance = createSimulation({ seed: 2026, night: 1 });
let accumulator = 0;
let lastTime = performance.now();
let lastGameOverReason = '';
let lastCountdownSec = 11;
let wasWindWarning = false;
let wasGrounded = true;

// Rolling FPS meter (also exposed on window.__DAO_DEN_LONG_PERF__ for automated verification)
const fpsSamples: number[] = [];
let smoothFps = 60;

declare global {
  interface Window {
    __DAO_DEN_LONG_PERF__?: {
      avgFps: number;
      samples: number;
      night: NightNumber;
      mode: ScreenMode;
    };
  }
}

function resetSimForNight(night: NightNumber): void {
  currentNight = night;
  sim = createSimulation({ seed: (Date.now() ^ (night * 7919)) & 0xfffffff, night });
  scene.loadNight(night);
  input.resetCamYaw();
  accumulator = 0;
  lastGameOverReason = '';
  lastCountdownSec = 11;
  wasWindWarning = false;
  wasGrounded = true;
}

const callbacks: MenuCallbacks = {
  onStartCampaign() {
    totalCampaignScore = 0;
    resetSimForNight(1);
    screenMode = 'intro';
    ui.showNightIntro(1, totalCampaignScore, callbacks);
  },
  onStartNight(night: NightNumber) {
    resetSimForNight(night);
    screenMode = 'intro';
    ui.showNightIntro(night, totalCampaignScore, callbacks);
  },
  onBeginNightPlay() {
    audio.startBgm();
    screenMode = 'playing';
    ui.showHudOnly();
  },
  onResume() {
    if (sim.getState() === 'paused') {
      sim.step(input.poll(true));
    }
    screenMode = 'playing';
    ui.showHudOnly();
  },
  onRestartNight() {
    resetSimForNight(currentNight);
    audio.startBgm();
    screenMode = 'playing';
    ui.showHudOnly();
  },
  onMainMenu() {
    screenMode = 'menu';
    ui.showMainMenu(settings, callbacks);
  },
  onSettingsChange(next: GameSettings) {
    settings.volume = next.volume;
    settings.mouseSensitivity = next.mouseSensitivity;
    saveSettings(settings);
    audio.setVolume(settings.volume);
    input.setMouseSensitivity(settings.mouseSensitivity);
  }
};

scene.loadNight(1);
ui.showMainMenu(settings, callbacks);

function playAudioForEvents(events: EventRecord[]): void {
  for (const ev of events) {
    switch (ev.name) {
      case 'mote_picked':
        audio.playPickup();
        break;
      case 'deposit':
        audio.playDeposit();
        break;
      case 'lantern_lit':
        audio.playLanternLit();
        break;
      case 'pulse':
        audio.playPulse();
        break;
      case 'dash':
        audio.playDash();
        break;
      case 'charm_picked':
        audio.playCharm();
        break;
      case 'drifter_steal':
        audio.playDrifterSteal();
        break;
      case 'player_hit':
        audio.playHit();
        break;
      case 'shade_spawned':
        audio.playShadeSpawn();
        break;
      case 'game_over':
        if (ev.data.result === 'won') audio.playWin();
        else audio.playLose();
        break;
      default:
        break;
    }
  }
}

function loop(now: number): void {
  requestAnimationFrame(loop);
  const rawDt = (now - lastTime) / 1000;
  lastTime = now;
  const frameDt = Math.min(0.1, Math.max(0.001, rawDt));

  const instFps = 1 / frameDt;
  smoothFps = smoothFps * 0.9 + instFps * 0.1;
  fpsSamples.push(instFps);
  if (fpsSamples.length > 180) fpsSamples.shift();
  const avgFps = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;
  window.__DAO_DEN_LONG_PERF__ = {
    avgFps: Math.round(avgFps * 10) / 10,
    samples: fpsSamples.length,
    night: currentNight,
    mode: screenMode
  };

  // Handle Esc / P pause toggle
  if (input.consumePauseToggle()) {
    if (screenMode === 'playing') {
      sim.step(input.poll(true));
      sim.step(input.poll(false));
      screenMode = 'paused';
      ui.showPauseMenu(currentNight, settings, callbacks);
    } else if (screenMode === 'paused') {
      callbacks.onResume();
    }
  }

  const frameEvents: EventRecord[] = [];
  if (screenMode === 'playing' && sim.getState() === 'playing') {
    accumulator += frameDt;
    const liveInput = input.poll(false);
    while (accumulator >= DT && sim.getState() === 'playing') {
      const stepEv = sim.step(liveInput);
      for (const e of stepEv) {
        frameEvents.push(e);
        if (e.name === 'game_over') {
          lastGameOverReason = String(e.data.reason ?? '');
        }
      }
      accumulator -= DT;
    }

    playAudioForEvents(frameEvents);

    const snapNow = sim.getSnapshot();
    // Jump SFX on leaving ground upward
    if (wasGrounded && !snapNow.player.grounded && snapNow.player.vel[1] > 1) {
      audio.playJump();
    }
    wasGrounded = snapNow.player.grounded;

    // 10-second countdown tick SFX
    const secCeil = Math.ceil(snapNow.time_left_s);
    if (secCeil <= 10 && secCeil > 0 && secCeil < lastCountdownSec) {
      lastCountdownSec = secCeil;
      audio.playCountdownTick();
    }

    // Wind warning SFX
    const windWarn = sim.isWindWarning();
    if (windWarn && !wasWindWarning) {
      audio.playWindWarn();
    }
    wasWindWarning = windWarn;

    const st = sim.getState();
    if (st === 'won' || st === 'lost') {
      screenMode = 'result';
      const nightScore = sim.getScore();
      if (st === 'won') {
        totalCampaignScore += nightScore;
      }
      ui.showNightResult(currentNight, st === 'won', lastGameOverReason, nightScore, totalCampaignScore, callbacks);
    }
  }

  const snap = sim.getSnapshot();
  scene.sync(snap, frameEvents, input.getCamYawDeg(), sim.getFacingYaw(), sim.isWindWarning(), sim.isRespawning(), frameDt);
  if (screenMode === 'playing' || screenMode === 'paused') {
    ui.updateHud(snap, smoothFps, sim.isWindWarning(), (p) => scene.projectToScreen(p));
  }
}

requestAnimationFrame(loop);
