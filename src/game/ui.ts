import { NIGHT_MAPS } from '../sim/config.js';
import type { NightNumber, SnapshotRecord, TuningConfig } from '../sim/types.js';
import type { ProjectedPoint } from './scene.js';
import type { GameSettings } from './settings.js';

export interface MenuCallbacks {
  onStartCampaign(): void;
  onStartNight(night: NightNumber): void;
  onBeginNightPlay(): void;
  onResume(): void;
  onRestartNight(): void;
  onMainMenu(): void;
  onSettingsChange(settings: GameSettings): void;
}

export class UiController {
  private readonly hudEl = document.getElementById('hud')!;
  private readonly flamesEl = document.getElementById('hud-flames')!;
  private readonly timerEl = document.getElementById('hud-timer')!;
  private readonly windEl = document.getElementById('hud-wind')!;
  private readonly nightEl = document.getElementById('hud-night')!;
  private readonly lanternsEl = document.getElementById('hud-lanterns')!;
  private readonly scoreEl = document.getElementById('hud-score')!;
  private readonly fpsEl = document.getElementById('hud-fps')!;
  private readonly motesLabelEl = document.getElementById('hud-motes-label')!;
  private readonly motesBarEl = document.getElementById('hud-motes-bar')!;
  private readonly charmEl = document.getElementById('hud-charm')!;
  private readonly dashEl = document.getElementById('hud-dash')!;
  private readonly pulseEl = document.getElementById('hud-pulse')!;
  private readonly promptEl = document.getElementById('hud-prompt')!;
  private readonly arrowEl = document.getElementById('hud-arrow')!;
  private readonly overlayEl = document.getElementById('overlay')!;
  private readonly overlayCardEl = document.getElementById('overlay-card')!;

  constructor(private readonly tuning: TuningConfig) {
    this.motesBarEl.innerHTML = '';
    for (let i = 0; i < tuning.carry_capacity; i++) {
      const pip = document.createElement('div');
      pip.className = 'mote-pip';
      this.motesBarEl.appendChild(pip);
    }
  }

  showHudOnly(): void {
    this.hudEl.classList.remove('hidden');
    this.overlayEl.classList.add('hidden');
    this.overlayEl.classList.remove('dawn');
  }

  showMainMenu(settings: GameSettings, cb: MenuCallbacks): void {
    this.hudEl.classList.add('hidden');
    this.overlayEl.classList.remove('hidden', 'dawn');
    this.overlayCardEl.innerHTML = `
      <h1>Đảo Đèn Lồng</h1>
      <p class="subtitle">Hành trình Ba Hòn Đảo</p>
      <p class="story">
        Đồng hành cùng Mây vượt qua 3 đêm — Đảo Bến, Đảo Cau và Đảo Chuông —
        gom đom đóm, thắp sáng mọi Đèn Lồng Lớn và đón Bình Minh trở lại.
      </p>
      <div class="controls-grid">
        <div><kbd>WASD</kbd> Di chuyển</div>
        <div><kbd>Space</kbd> Nhảy</div>
        <div><kbd>Shift</kbd> Lướt (Dash)</div>
        <div><kbd>E</kbd> Nạp ánh sáng</div>
        <div><kbd>Q / F</kbd> Tỏa Sáng (tốn 3)</div>
        <div><kbd>Esc / P</kbd> Tạm dừng</div>
      </div>
      <div class="btn-row">
        <button id="btn-campaign" class="btn-primary">Bắt đầu hành trình (3 Đêm)</button>
        <button id="btn-settings" class="btn-secondary">Cài đặt</button>
      </div>
      <div class="btn-row" style="margin-top: 12px;">
        <button id="btn-n1" class="btn-secondary">Đêm 1 · Đảo Bến</button>
        <button id="btn-n2" class="btn-secondary">Đêm 2 · Đảo Cau</button>
        <button id="btn-n3" class="btn-secondary">Đêm 3 · Đảo Chuông</button>
      </div>
    `;

    document.getElementById('btn-campaign')!.addEventListener('click', () => cb.onStartCampaign());
    document.getElementById('btn-n1')!.addEventListener('click', () => cb.onStartNight(1));
    document.getElementById('btn-n2')!.addEventListener('click', () => cb.onStartNight(2));
    document.getElementById('btn-n3')!.addEventListener('click', () => cb.onStartNight(3));
    document.getElementById('btn-settings')!.addEventListener('click', () => {
      this.showSettings(settings, () => this.showMainMenu(settings, cb), cb.onSettingsChange);
    });
  }

  showNightIntro(night: NightNumber, totalScore: number, cb: MenuCallbacks): void {
    const cfg = NIGHT_MAPS[night];
    this.hudEl.classList.add('hidden');
    this.overlayEl.classList.remove('hidden', 'dawn');
    this.overlayCardEl.innerHTML = `
      <h1>${cfg.title} — ${cfg.islandName}</h1>
      <p class="subtitle">${cfg.lanterns.length} Đèn Lồng Lớn · ${Math.floor(cfg.durationS / 60)}p${String(cfg.durationS % 60).padStart(2, '0')}s · Tổng điểm tích lũy: ${totalScore}</p>
      <p class="quote"><strong>Lời Ông Đăng:</strong><br/>${cfg.elderQuote}</p>
      <div class="btn-row">
        <button id="btn-begin" class="btn-primary">Bắt đầu ${cfg.title}</button>
        <button id="btn-menu" class="btn-secondary">Về menu</button>
      </div>
    `;
    document.getElementById('btn-begin')!.addEventListener('click', () => cb.onBeginNightPlay());
    document.getElementById('btn-menu')!.addEventListener('click', () => cb.onMainMenu());
  }

  showPauseMenu(night: NightNumber, settings: GameSettings, cb: MenuCallbacks): void {
    this.overlayEl.classList.remove('hidden', 'dawn');
    this.overlayCardEl.innerHTML = `
      <h1>Tạm dừng</h1>
      <p class="subtitle">${NIGHT_MAPS[night].title} — ${NIGHT_MAPS[night].islandName}</p>
      <div class="btn-row" style="flex-direction: column;">
        <button id="btn-resume" class="btn-primary">Tiếp tục</button>
        <button id="btn-restart" class="btn-secondary">Chơi lại Đêm này</button>
        <button id="btn-pause-settings" class="btn-secondary">Cài đặt</button>
        <button id="btn-pause-menu" class="btn-secondary">Về menu</button>
      </div>
    `;
    document.getElementById('btn-resume')!.addEventListener('click', () => cb.onResume());
    document.getElementById('btn-restart')!.addEventListener('click', () => cb.onRestartNight());
    document.getElementById('btn-pause-menu')!.addEventListener('click', () => cb.onMainMenu());
    document.getElementById('btn-pause-settings')!.addEventListener('click', () => {
      this.showSettings(settings, () => this.showPauseMenu(night, settings, cb), cb.onSettingsChange);
    });
  }

  showSettings(settings: GameSettings, onBack: () => void, onChange: (s: GameSettings) => void): void {
    this.overlayEl.classList.remove('hidden', 'dawn');
    this.overlayCardEl.innerHTML = `
      <h1>Cài đặt</h1>
      <p class="subtitle">Tự động lưu cho các lần mở sau</p>
      <div class="setting-row">
        <label for="set-vol">Âm lượng: <strong id="val-vol">${Math.round(settings.volume * 100)}%</strong></label>
        <input id="set-vol" type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}" />
      </div>
      <div class="setting-row">
        <label for="set-sens">Độ nhạy chuột: <strong id="val-sens">${settings.mouseSensitivity.toFixed(2)}</strong></label>
        <input id="set-sens" type="range" min="10" max="100" value="${Math.round(settings.mouseSensitivity * 100)}" />
      </div>
      <div class="btn-row">
        <button id="btn-back" class="btn-primary">Quay lại</button>
      </div>
    `;

    const volInput = document.getElementById('set-vol') as HTMLInputElement;
    const sensInput = document.getElementById('set-sens') as HTMLInputElement;
    const valVol = document.getElementById('val-vol')!;
    const valSens = document.getElementById('val-sens')!;

    volInput.addEventListener('input', () => {
      settings.volume = Number(volInput.value) / 100;
      valVol.textContent = `${volInput.value}%`;
      onChange({ ...settings });
    });
    sensInput.addEventListener('input', () => {
      settings.mouseSensitivity = Number(sensInput.value) / 100;
      valSens.textContent = settings.mouseSensitivity.toFixed(2);
      onChange({ ...settings });
    });
    document.getElementById('btn-back')!.addEventListener('click', onBack);
  }

  showNightResult(
    night: NightNumber,
    won: boolean,
    reason: string,
    nightScore: number,
    totalScore: number,
    cb: MenuCallbacks
  ): void {
    this.overlayEl.classList.remove('hidden');
    if (won && night === 3) {
      this.overlayEl.classList.add('dawn');
      this.overlayCardEl.innerHTML = `
        <h1>Bình Minh Đảo Đèn Lồng</h1>
        <p class="subtitle">Hoàn thành cả 3 Đêm!</p>
        <p class="story">
          Tiếng chuông Đảo Chuông ngân vang giữa bình minh rực rỡ. Toàn bộ ba hòn đảo đã sáng bừng ánh vàng ấm áp!
        </p>
        <p class="quote">Điểm Đêm 3: <strong>${nightScore}</strong><br/>Tổng điểm toàn hành trình: <strong>${totalScore}</strong></p>
        <div class="btn-row">
          <button id="btn-again" class="btn-primary">Chơi lại từ Đêm 1</button>
          <button id="btn-menu" class="btn-secondary">Về menu</button>
        </div>
      `;
      document.getElementById('btn-again')!.addEventListener('click', () => cb.onStartCampaign());
      document.getElementById('btn-menu')!.addEventListener('click', () => cb.onMainMenu());
      return;
    }

    this.overlayEl.classList.remove('dawn');
    if (won) {
      const nextNight = (night + 1) as NightNumber;
      this.overlayCardEl.innerHTML = `
        <h1>Thắp Sáng ${NIGHT_MAPS[night].islandName}!</h1>
        <p class="subtitle">Điểm Đêm ${night}: ${nightScore} · Tổng điểm: ${totalScore}</p>
        <p class="story">Tất cả Đèn Lồng Lớn đã bừng sáng. Chuẩn bị tiến sang ${NIGHT_MAPS[nextNight].title} — ${NIGHT_MAPS[nextNight].islandName}.</p>
        <div class="btn-row">
          <button id="btn-next" class="btn-primary">Sang ${NIGHT_MAPS[nextNight].title}</button>
          <button id="btn-menu" class="btn-secondary">Về menu</button>
        </div>
      `;
      document.getElementById('btn-next')!.addEventListener('click', () => cb.onStartNight(nextNight));
      document.getElementById('btn-menu')!.addEventListener('click', () => cb.onMainMenu());
    } else {
      const lossDesc =
        reason === 'no_flames'
          ? 'Mây đã mất hết Ngọn Lửa.'
          : 'Bình minh đã lên trước khi toàn bộ đèn được thắp.';
      this.overlayCardEl.innerHTML = `
        <h1>Đêm ${night} Chưa Hoàn Thành</h1>
        <p class="subtitle">${lossDesc}</p>
        <p class="story">Đừng nản lòng — hãy thử lại ${NIGHT_MAPS[night].title} (${NIGHT_MAPS[night].islandName})!</p>
        <div class="btn-row">
          <button id="btn-retry" class="btn-primary">Chơi lại Đêm ${night}</button>
          <button id="btn-menu" class="btn-secondary">Về menu</button>
        </div>
      `;
      document.getElementById('btn-retry')!.addEventListener('click', () => cb.onRestartNight());
      document.getElementById('btn-menu')!.addEventListener('click', () => cb.onMainMenu());
    }
  }

  updateHud(
    snap: SnapshotRecord,
    fps: number,
    windWarning: boolean,
    projectFn: (pos: [number, number, number]) => ProjectedPoint
  ): void {
    // Flames
    this.flamesEl.innerHTML = '';
    for (let i = 0; i < this.tuning.flames; i++) {
      const icon = document.createElement('span');
      icon.className = i < snap.player.flames ? 'flame-icon' : 'flame-icon lost';
      this.flamesEl.appendChild(icon);
    }

    // Timer mm:ss (red & blinking <= 30s)
    const totalSec = Math.ceil(snap.time_left_s);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    this.timerEl.textContent = `${mm}:${ss}`;
    this.timerEl.classList.toggle('danger', snap.time_left_s <= 30);

    // Wind indicator
    if (snap.wind.active) {
      this.windEl.textContent = `Gió mạnh! (${Math.round(snap.wind.dir_deg)}°)`;
      this.windEl.classList.remove('hidden');
    } else if (windWarning) {
      this.windEl.textContent = 'Cảnh báo: Gió lớn sắp nổi!';
      this.windEl.classList.remove('hidden');
    } else {
      this.windEl.classList.add('hidden');
    }

    // Night, lanterns, score, FPS
    const lit = snap.lanterns.filter((l) => l.lit).length;
    this.nightEl.textContent = `Đêm ${snap.night}`;
    this.lanternsEl.textContent = `Đèn: ${lit}/${snap.lanterns.length}`;
    this.scoreEl.textContent = `Điểm: ${snap.score}`;
    this.fpsEl.textContent = `${Math.round(fps)} FPS`;

    // Motes 10-pip bar + Charm badge
    this.motesLabelEl.textContent = `Đom đóm: ${snap.player.carried}/${this.tuning.carry_capacity}`;
    const pips = this.motesBarEl.children;
    for (let i = 0; i < pips.length; i++) {
      pips[i].classList.toggle('filled', i < snap.player.carried);
    }
    if (snap.player.charm_s > 0) {
      this.charmEl.textContent = `Bùa Gió: ${snap.player.charm_s.toFixed(1)}s`;
      this.charmEl.classList.remove('hidden');
    } else {
      this.charmEl.classList.add('hidden');
    }

    // Dash cooldown pill
    if (snap.player.charm_s > 0) {
      this.dashEl.textContent = 'Shift · Lướt (0s)';
      this.dashEl.classList.remove('cooldown');
    } else if (snap.player.dash_cd_s > 0) {
      this.dashEl.textContent = `Shift · Lướt (${snap.player.dash_cd_s.toFixed(1)}s)`;
      this.dashEl.classList.add('cooldown');
    } else {
      this.dashEl.textContent = 'Shift · Lướt';
      this.dashEl.classList.remove('cooldown');
    }

    // Pulse cooldown pill
    if (snap.player.pulse_cd_s > 0) {
      this.pulseEl.textContent = `Q · Tỏa Sáng (${snap.player.pulse_cd_s.toFixed(1)}s)`;
      this.pulseEl.classList.add('cooldown');
    } else if (snap.player.carried < this.tuning.pulse_cost) {
      this.pulseEl.textContent = `Q · Tỏa Sáng (${snap.player.carried}/${this.tuning.pulse_cost})`;
      this.pulseEl.classList.add('cooldown');
    } else {
      this.pulseEl.textContent = 'Q · Tỏa Sáng';
      this.pulseEl.classList.remove('cooldown');
    }

    // Interact prompt for nearest unlit lantern in interact_radius (2.0m)
    let nearUnlit = null;
    let nearestAnyUnlit = null;
    let nearestDist = Infinity;
    for (const l of snap.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(snap.player.pos[0] - l.pos[0], snap.player.pos[2] - l.pos[2]);
      if (d < nearestDist) {
        nearestDist = d;
        nearestAnyUnlit = l;
      }
      if (d <= this.tuning.interact_radius && !nearUnlit) {
        nearUnlit = l;
      }
    }

    if (nearUnlit) {
      this.promptEl.textContent = `E — Nạp ánh sáng (${nearUnlit.deposited}/${this.tuning.lantern_cost})`;
      this.promptEl.classList.remove('hidden');
    } else {
      this.promptEl.classList.add('hidden');
    }

    // Off-screen arrow pointing toward nearest unlit lantern
    if (nearestAnyUnlit) {
      const proj = projectFn([nearestAnyUnlit.pos[0], nearestAnyUnlit.pos[1] + 3.0, nearestAnyUnlit.pos[2]]);
      if (proj.onScreen) {
        this.arrowEl.classList.add('hidden');
      } else {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        let dx = proj.x - cx;
        let dy = proj.y - cy;
        if (!proj.inFront) {
          dx = -dx;
          dy = -dy;
        }
        const angle = Math.atan2(dy, dx);
        const pad = 54;
        const rx = cx - pad;
        const ry = cy - pad;
        const scale = Math.min(rx / Math.max(1e-3, Math.abs(Math.cos(angle))), ry / Math.max(1e-3, Math.abs(Math.sin(angle))));
        const ax = cx + Math.cos(angle) * scale;
        const ay = cy + Math.sin(angle) * scale;
        this.arrowEl.style.left = `${ax - 18}px`;
        this.arrowEl.style.top = `${ay - 18}px`;
        this.arrowEl.style.transform = `rotate(${(angle * 180) / Math.PI}deg)`;
        this.arrowEl.classList.remove('hidden');
      }
    } else {
      this.arrowEl.classList.add('hidden');
    }
  }
}
