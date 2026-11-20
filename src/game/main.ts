import './styles.css';
import { DT, STANDARD_TUNING } from '../sim/config.js';
import { createSimulation, type SimulationInstance } from '../sim/engine.js';
import {
  addLeaderboardEntry,
  formatIsoWithLocalOffset,
  type LeaderboardEntry,
  sortLeaderboard
} from '../sim/leaderboard.js';
import type { EventRecord, NightNumber, Vec3 } from '../sim/types.js';
import { AudioEngine } from './audio.js';
import { startBenchmarkMode } from './benchMode.js';
import { InputController } from './input.js';
import { GameScene } from './scene.js';
import { loadSettings, saveSettings, type GameSettings } from './settings.js';
import { type MenuCallbacks, UiController } from './ui.js';

type ScreenMode = 'menu' | 'intro' | 'playing' | 'paused' | 'result';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const params = new URLSearchParams(window.location.search);

if (params.get('bench') === '1') {
  const seed = Number.parseInt(params.get('seed') ?? '42', 10) || 42;
  const duration = Number.parseFloat(params.get('duration') ?? '30') || 30;
  startBenchmarkMode(canvas, seed, duration);
} else {
  bootInteractiveGame(canvas);
}

function bootInteractiveGame(gameCanvas: HTMLCanvasElement): void {
  const LB_LOCAL_KEY = 'dao_den_long_leaderboard_v1';
  const hitFlashEl = document.getElementById('hit-flash')!;
  const settings: GameSettings = loadSettings();

  function applyAccessibilityClasses(): void {
    document.body.classList.toggle('colorblind', settings.colorblindMode);
    document.body.classList.toggle('reduced-motion', settings.reducedMotion);
    document.body.classList.toggle('large-text', settings.largeText);
  }
  applyAccessibilityClasses();

  const audio = new AudioEngine();
  audio.setVolume(settings.volume);

  const input = new InputController(gameCanvas, settings.mouseSensitivity, settings.keybinds);
  const scene = new GameScene(gameCanvas, STANDARD_TUNING);
  const ui = new UiController(STANDARD_TUNING);

  let currentNight: NightNumber = 1;
  let currentSeed = 2026;
  let totalCampaignScore = 0;
  let nightsWonCount = 0;
  let screenMode: ScreenMode = 'menu';
  let sim: SimulationInstance = createSimulation({ seed: currentSeed, night: 1 });
  let accumulator = 0;
  let lastTime = performance.now();
  let lastGameOverReason = '';
  let lastCountdownSec = 11;
  let wasWindWarning = false;
  let wasGrounded = true;
  let hitShakeTimer = 0;
  let hitFlashTimer = 0;
  let recentShadeSpawnPos: Vec3 | null = null;
  let recentShadeTimer = 0;
  let smoothFps = 60;

  async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
    try {
      const resp = await fetch('/api/leaderboard');
      if (resp.ok) {
        const json = (await resp.json()) as { entries?: LeaderboardEntry[] };
        const sorted = sortLeaderboard(json.entries ?? []);
        window.localStorage.setItem(LB_LOCAL_KEY, JSON.stringify(sorted));
        return sorted;
      }
    } catch {
      // Fall back to localStorage when served purely statically
    }
    try {
      const raw = window.localStorage.getItem(LB_LOCAL_KEY);
      if (!raw) return [];
      return sortLeaderboard(JSON.parse(raw) as LeaderboardEntry[]);
    } catch {
      return [];
    }
  }

  async function submitLeaderboard(name: string): Promise<LeaderboardEntry[]> {
    const entry: LeaderboardEntry = {
      name,
      score: totalCampaignScore,
      nights_won: nightsWonCount,
      achieved_at: formatIsoWithLocalOffset(),
      seed: currentSeed
    };
    try {
      const resp = await fetch('/api/leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
      if (resp.ok) {
        const json = (await resp.json()) as { entries?: LeaderboardEntry[] };
        const sorted = sortLeaderboard(json.entries ?? []);
        window.localStorage.setItem(LB_LOCAL_KEY, JSON.stringify(sorted));
        return sorted;
      }
    } catch {
      // Static fallback
    }
    const existing = await fetchLeaderboard();
    const updated = addLeaderboardEntry(existing, entry);
    window.localStorage.setItem(LB_LOCAL_KEY, JSON.stringify(updated));
    return updated;
  }

  function resetSimForNight(night: NightNumber): void {
    currentNight = night;
    currentSeed = (Date.now() ^ (night * 7919)) & 0xfffffff;
    sim = createSimulation({ seed: currentSeed, night });
    scene.loadNight(night);
    input.resetCamYaw();
    accumulator = 0;
    lastGameOverReason = '';
    lastCountdownSec = 11;
    wasWindWarning = false;
    wasGrounded = true;
    hitShakeTimer = 0;
    hitFlashTimer = 0;
    recentShadeSpawnPos = null;
    recentShadeTimer = 0;
  }

  const callbacks: MenuCallbacks = {
    onStartCampaign() {
      totalCampaignScore = 0;
      nightsWonCount = 0;
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
      settings.colorblindMode = next.colorblindMode;
      settings.reducedMotion = next.reducedMotion;
      settings.largeText = next.largeText;
      settings.keybinds = { ...next.keybinds };
      applyAccessibilityClasses();
      saveSettings(settings);
      audio.setVolume(settings.volume);
      input.setMouseSensitivity(settings.mouseSensitivity);
      input.setKeybinds(settings.keybinds);
    },
    onCapturingKey(capturing: boolean) {
      input.setCapturingKey(capturing);
    },
    onLoadLeaderboard: fetchLeaderboard,
    onSaveScore: submitLeaderboard
  };

  scene.loadNight(1);
  ui.showMainMenu(settings, callbacks);

  function handleEvents(events: EventRecord[], snap: ReturnType<SimulationInstance['getSnapshot']>): void {
    for (const ev of events) {
      switch (ev.name) {
        case 'mote_picked':
          audio.playPickup();
          break;
        case 'deposit':
          audio.playDeposit();
          break;
        case 'refuel':
          audio.playRefuel();
          break;
        case 'lantern_lit':
          audio.playLanternLit();
          break;
        case 'lantern_out':
          audio.playLanternOut();
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
          if (!settings.reducedMotion) {
            hitShakeTimer = 0.25;
            hitFlashTimer = 0.22;
          }
          break;
        case 'shade_spawned': {
          audio.playShadeSpawn();
          const spawned = snap.shades.find((s) => s.id === String(ev.data.id ?? ''));
          if (spawned) {
            recentShadeSpawnPos = [...spawned.pos];
            recentShadeTimer = 3.5;
          }
          break;
        }
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
    smoothFps = smoothFps * 0.9 + (1 / frameDt) * 0.1;

    if (hitShakeTimer > 0) hitShakeTimer = Math.max(0, hitShakeTimer - frameDt);
    if (hitFlashTimer > 0) {
      hitFlashTimer = Math.max(0, hitFlashTimer - frameDt);
      hitFlashEl.classList.toggle('hidden', settings.reducedMotion || hitFlashTimer <= 0);
    } else {
      hitFlashEl.classList.add('hidden');
    }

    if (recentShadeTimer > 0) {
      recentShadeTimer = Math.max(0, recentShadeTimer - frameDt);
      if (recentShadeTimer <= 0) recentShadeSpawnPos = null;
    }

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

      const snapNow = sim.getSnapshot();
      handleEvents(frameEvents, snapNow);

      if (wasGrounded && !snapNow.player.grounded && snapNow.player.vel[1] > 1) {
        audio.playJump();
      }
      wasGrounded = snapNow.player.grounded;

      const secCeil = Math.ceil(snapNow.time_left_s);
      if (secCeil <= 10 && secCeil > 0 && secCeil < lastCountdownSec) {
        lastCountdownSec = secCeil;
        audio.playCountdownTick();
      }

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
          nightsWonCount = Math.min(3, nightsWonCount + 1);
        }
        ui.showNightResult(currentNight, st === 'won', lastGameOverReason, nightScore, totalCampaignScore, nightsWonCount, callbacks);
      }
    }

    const snap = sim.getSnapshot();
    const shakeAmt = settings.reducedMotion ? 0 : hitShakeTimer * 1.4;
    scene.sync(
      snap,
      frameEvents,
      input.getCamYawDeg(),
      sim.getFacingYaw(),
      sim.isWindWarning(),
      sim.isRespawning(),
      frameDt,
      settings.colorblindMode,
      shakeAmt
    );
    if (screenMode === 'playing' || screenMode === 'paused') {
      ui.updateHud(snap, smoothFps, settings, sim.isWindWarning(), recentShadeSpawnPos, (p) => scene.projectToScreen(p));
    }
  }

  requestAnimationFrame(loop);
}
