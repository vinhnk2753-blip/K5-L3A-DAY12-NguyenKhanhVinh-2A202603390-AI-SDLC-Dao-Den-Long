import { NIGHT_MAPS } from '../sim/config.js';
import { type LeaderboardEntry, validatePlayerName } from '../sim/leaderboard.js';
import type { NightNumber, SnapshotRecord, TuningConfig, Vec3 } from '../sim/types.js';
import type { ProjectedPoint } from './scene.js';
import {
  ACTION_LABELS,
  type ActionKey,
  DEFAULT_KEYBINDS,
  findKeyConflict,
  formatKeyCode,
  type GameSettings
} from './settings.js';

export interface MenuCallbacks {
  onStartCampaign(): void;
  onStartNight(night: NightNumber): void;
  onBeginNightPlay(): void;
  onResume(): void;
  onRestartNight(): void;
  onMainMenu(): void;
  onSettingsChange(settings: GameSettings): void;
  onCapturingKey(capturing: boolean): void;
  onLoadLeaderboard(): Promise<LeaderboardEntry[]>;
  onSaveScore(name: string): Promise<LeaderboardEntry[]>;
}

export class UiController {
  private readonly hudEl = document.getElementById('hud')!;
  private readonly flamesEl = document.getElementById('hud-flames')!;
  private readonly timerEl = document.getElementById('hud-timer')!;
  private readonly captionsEl = document.getElementById('hud-captions')!;
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
  private readonly shadeArrowEl = document.getElementById('hud-shade-arrow')!;
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
    const kb = settings.keybinds;
    this.overlayCardEl.innerHTML = `
      <h1>Đảo Đèn Lồng</h1>
      <p class="subtitle">Phiên bản v1.0.0 — Ba Hòn Đảo</p>
      <p class="story">
        Đồng hành cùng Mây giữ đảo sáng tới bình minh qua 3 đêm: Đảo Bến, Đảo Cau và Đảo Chuông.
      </p>
      <div class="controls-grid">
        <div><kbd>${formatKeyCode(kb.moveUp)}/${formatKeyCode(kb.moveLeft)}/${formatKeyCode(kb.moveDown)}/${formatKeyCode(kb.moveRight)}</kbd> Di chuyển</div>
        <div><kbd>${formatKeyCode(kb.jump)}</kbd> Nhảy · <kbd>${formatKeyCode(kb.dash)}</kbd> Lướt</div>
        <div><kbd>${formatKeyCode(kb.interact)}</kbd> Nạp / Châm dầu</div>
        <div><kbd>${formatKeyCode(kb.pulse)}</kbd> Tỏa Sáng · <kbd>${formatKeyCode(kb.pause)}</kbd> Tạm dừng</div>
      </div>
      <div class="btn-row">
        <button id="btn-campaign" class="btn-primary">Bắt đầu hành trình (3 Đêm)</button>
        <button id="btn-leaderboard" class="btn-secondary">Bảng xếp hạng</button>
        <button id="btn-settings" class="btn-secondary">Cài đặt</button>
      </div>
      <div class="btn-row">
        <button id="btn-n1" class="btn-secondary">Đêm 1 · Đảo Bến</button>
        <button id="btn-n2" class="btn-secondary">Đêm 2 · Đảo Cau</button>
        <button id="btn-n3" class="btn-secondary">Đêm 3 · Đảo Chuông</button>
      </div>
    `;

    document.getElementById('btn-campaign')!.addEventListener('click', () => cb.onStartCampaign());
    document.getElementById('btn-n1')!.addEventListener('click', () => cb.onStartNight(1));
    document.getElementById('btn-n2')!.addEventListener('click', () => cb.onStartNight(2));
    document.getElementById('btn-n3')!.addEventListener('click', () => cb.onStartNight(3));
    document.getElementById('btn-leaderboard')!.addEventListener('click', () => {
      void this.showLeaderboard(cb, () => this.showMainMenu(settings, cb));
    });
    document.getElementById('btn-settings')!.addEventListener('click', () => {
      this.showSettings(settings, () => this.showMainMenu(settings, cb), cb);
    });
  }

  async showLeaderboard(cb: MenuCallbacks, onBack: () => void): Promise<void> {
    this.overlayEl.classList.remove('hidden', 'dawn');
    this.overlayCardEl.innerHTML = `<h1>Bảng Xếp Hạng</h1><p class="subtitle">Đang tải Top 10...</p>`;
    const entries = await cb.onLoadLeaderboard();
    const rows =
      entries.length === 0
        ? `<tr><td colspan="5" style="text-align:center;">Chưa có kỷ lục nào. Hãy hoàn thành một lượt chơi!</td></tr>`
        : entries
            .map(
              (e, idx) =>
                `<tr><td>#${idx + 1}</td><td>${e.name}</td><td><strong>${e.score}</strong></td><td>${e.nights_won}/3</td><td>${e.seed}</td></tr>`
            )
            .join('');

    this.overlayCardEl.innerHTML = `
      <h1>Bảng Xếp Hạng (Top 10)</h1>
      <p class="subtitle">Lưu cục bộ · Sắp xếp theo điểm giảm dần</p>
      <table class="lb-table">
        <thead><tr><th>Hạng</th><th>Người chơi</th><th>Điểm</th><th>Đêm thắng</th><th>Seed</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="btn-row">
        <button id="btn-lb-back" class="btn-primary">Quay lại</button>
      </div>
    `;
    document.getElementById('btn-lb-back')!.addEventListener('click', onBack);
  }

  showNightIntro(night: NightNumber, totalScore: number, cb: MenuCallbacks): void {
    const cfg = NIGHT_MAPS[night];
    const needed = Math.ceil(this.tuning.win_ratio * cfg.lanterns.length);
    this.hudEl.classList.add('hidden');
    this.overlayEl.classList.remove('hidden', 'dawn');
    this.overlayCardEl.innerHTML = `
      <h1>${cfg.title} — ${cfg.islandName}</h1>
      <p class="subtitle">Cần giữ ≥ ${needed}/${cfg.lanterns.length} đèn sáng tới bình minh (${Math.floor(cfg.durationS / 60)}p${String(cfg.durationS % 60).padStart(2, '0')}s) · Tổng điểm: ${totalScore}</p>
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
        <button id="btn-pause-settings" class="btn-secondary">Cài đặt & Phím tắt</button>
        <button id="btn-pause-menu" class="btn-secondary">Về menu</button>
      </div>
    `;
    document.getElementById('btn-resume')!.addEventListener('click', () => cb.onResume());
    document.getElementById('btn-restart')!.addEventListener('click', () => cb.onRestartNight());
    document.getElementById('btn-pause-menu')!.addEventListener('click', () => cb.onMainMenu());
    document.getElementById('btn-pause-settings')!.addEventListener('click', () => {
      this.showSettings(settings, () => this.showPauseMenu(night, settings, cb), cb);
    });
  }

  showSettings(settings: GameSettings, onBack: () => void, cb: MenuCallbacks): void {
    this.overlayEl.classList.remove('hidden', 'dawn');
    const actions = Object.keys(ACTION_LABELS) as ActionKey[];
    const keybindHtml = actions
      .map(
        (act) => `
        <div class="keybind-item">
          <span>${ACTION_LABELS[act]}</span>
          <button class="keybind-btn" data-action="${act}">${formatKeyCode(settings.keybinds[act])}</button>
        </div>`
      )
      .join('');

    this.overlayCardEl.innerHTML = `
      <h1>Cài đặt & Trợ năng</h1>
      <div class="setting-row">
        <label for="set-vol">Âm lượng: <strong id="val-vol">${Math.round(settings.volume * 100)}%</strong></label>
        <input id="set-vol" type="range" min="0" max="100" value="${Math.round(settings.volume * 100)}" />
      </div>
      <div class="setting-row">
        <label for="set-sens">Độ nhạy chuột: <strong id="val-sens">${settings.mouseSensitivity.toFixed(2)}</strong></label>
        <input id="set-sens" type="range" min="10" max="100" value="${Math.round(settings.mouseSensitivity * 100)}" />
      </div>
      <div class="setting-row">
        <label for="set-cb">Bảng màu dễ phân biệt (Mù màu)</label>
        <input id="set-cb" type="checkbox" ${settings.colorblindMode ? 'checked' : ''} />
      </div>
      <div class="setting-row">
        <label for="set-rm">Giảm chuyển động (tắt rung & chớp)</label>
        <input id="set-rm" type="checkbox" ${settings.reducedMotion ? 'checked' : ''} />
      </div>
      <div class="setting-row">
        <label for="set-lt">Chữ lớn (×1.25)</label>
        <input id="set-lt" type="checkbox" ${settings.largeText ? 'checked' : ''} />
      </div>
      <p class="subtitle" style="margin-top:12px;">Đổi phím điều khiển</p>
      <div id="kb-warn" class="warn-msg hidden"></div>
      <div class="keybind-grid">${keybindHtml}</div>
      <div class="btn-row">
        <button id="btn-reset-kb" class="btn-secondary">Khôi phục mặc định</button>
        <button id="btn-back" class="btn-primary">Quay lại</button>
      </div>
    `;

    const volInput = document.getElementById('set-vol') as HTMLInputElement;
    const sensInput = document.getElementById('set-sens') as HTMLInputElement;
    const cbInput = document.getElementById('set-cb') as HTMLInputElement;
    const rmInput = document.getElementById('set-rm') as HTMLInputElement;
    const ltInput = document.getElementById('set-lt') as HTMLInputElement;
    const warnEl = document.getElementById('kb-warn')!;

    volInput.addEventListener('input', () => {
      settings.volume = Number(volInput.value) / 100;
      document.getElementById('val-vol')!.textContent = `${volInput.value}%`;
      cb.onSettingsChange({ ...settings, keybinds: { ...settings.keybinds } });
    });
    sensInput.addEventListener('input', () => {
      settings.mouseSensitivity = Number(sensInput.value) / 100;
      document.getElementById('val-sens')!.textContent = settings.mouseSensitivity.toFixed(2);
      cb.onSettingsChange({ ...settings, keybinds: { ...settings.keybinds } });
    });
    cbInput.addEventListener('change', () => {
      settings.colorblindMode = cbInput.checked;
      cb.onSettingsChange({ ...settings, keybinds: { ...settings.keybinds } });
    });
    rmInput.addEventListener('change', () => {
      settings.reducedMotion = rmInput.checked;
      cb.onSettingsChange({ ...settings, keybinds: { ...settings.keybinds } });
    });
    ltInput.addEventListener('change', () => {
      settings.largeText = ltInput.checked;
      cb.onSettingsChange({ ...settings, keybinds: { ...settings.keybinds } });
    });

    // Keybinding capture with conflict detection
    let activeListener: ((e: KeyboardEvent) => void) | null = null;
    const cleanupCapture = (): void => {
      if (activeListener) {
        window.removeEventListener('keydown', activeListener, true);
        activeListener = null;
      }
      cb.onCapturingKey(false);
    };

    const kbButtons = this.overlayCardEl.querySelectorAll<HTMLButtonElement>('.keybind-btn');
    kbButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        cleanupCapture();
        kbButtons.forEach((b) => b.classList.remove('listening'));
        const action = btn.dataset.action as ActionKey;
        btn.classList.add('listening');
        btn.textContent = 'Nhấn phím...';
        warnEl.classList.add('hidden');
        cb.onCapturingKey(true);

        activeListener = (e: KeyboardEvent): void => {
          e.preventDefault();
          e.stopPropagation();
          const conflict = findKeyConflict(settings.keybinds, action, e.code);
          if (conflict) {
            warnEl.textContent = `⚠ Phím ${formatKeyCode(e.code)} đang trùng với "${ACTION_LABELS[conflict]}"! Vui lòng chọn phím khác.`;
            warnEl.classList.remove('hidden');
            btn.classList.remove('listening');
            btn.textContent = formatKeyCode(settings.keybinds[action]);
            cleanupCapture();
            return;
          }
          settings.keybinds[action] = e.code;
          btn.classList.remove('listening');
          btn.textContent = formatKeyCode(e.code);
          warnEl.classList.add('hidden');
          cb.onSettingsChange({ ...settings, keybinds: { ...settings.keybinds } });
          cleanupCapture();
        };
        window.addEventListener('keydown', activeListener, true);
      });
    });

    document.getElementById('btn-reset-kb')!.addEventListener('click', () => {
      cleanupCapture();
      settings.keybinds = { ...DEFAULT_KEYBINDS };
      cb.onSettingsChange({ ...settings, keybinds: { ...settings.keybinds } });
      this.showSettings(settings, onBack, cb);
    });

    document.getElementById('btn-back')!.addEventListener('click', () => {
      cleanupCapture();
      onBack();
    });
  }

  private bindScoreSaveForm(cb: MenuCallbacks): void {
    const input = document.getElementById('lb-name-input') as HTMLInputElement | null;
    const btn = document.getElementById('btn-save-score') as HTMLButtonElement | null;
    const status = document.getElementById('lb-save-status');
    if (!input || !btn || !status) return;

    btn.addEventListener('click', async () => {
      const name = input.value.trim();
      if (!validatePlayerName(name)) {
        status.textContent = '⚠ Tên phải dài 3–12 ký tự (chữ, số hoặc _).';
        status.className = 'warn-msg';
        return;
      }
      btn.disabled = true;
      try {
        await cb.onSaveScore(name);
        status.textContent = `✓ Đã lưu "${name}" vào Bảng xếp hạng!`;
        status.className = 'subtitle';
      } catch (err) {
        status.textContent = `⚠ ${(err as Error).message}`;
        status.className = 'warn-msg';
        btn.disabled = false;
      }
    });
  }

  showNightResult(
    night: NightNumber,
    won: boolean,
    reason: string,
    nightScore: number,
    totalScore: number,
    nightsWon: number,
    cb: MenuCallbacks
  ): void {
    this.overlayEl.classList.remove('hidden');
    const scoreFormHtml = `
      <div class="name-form">
        <input id="lb-name-input" class="name-input" type="text" maxlength="12" placeholder="Nhập tên (3–12 ký tự)..." />
        <button id="btn-save-score" class="btn-secondary">Lưu bảng xếp hạng</button>
      </div>
      <div id="lb-save-status"></div>
    `;

    if (won && night === 3) {
      this.overlayEl.classList.add('dawn');
      this.overlayCardEl.innerHTML = `
        <h1>Bình Minh Đảo Đèn Lồng</h1>
        <p class="subtitle">Hoàn thành cả 3 Đêm! (${nightsWon}/3)</p>
        <p class="story">Tiếng chuông Đảo Chuông ngân vang giữa bình minh rực rỡ. Toàn bộ ba hòn đảo đã sáng bừng!</p>
        <p class="quote">Điểm Đêm 3: <strong>${nightScore}</strong><br/>Tổng điểm toàn hành trình: <strong>${totalScore}</strong></p>
        ${scoreFormHtml}
        <div class="btn-row">
          <button id="btn-again" class="btn-primary">Chơi lại từ Đêm 1</button>
          <button id="btn-menu" class="btn-secondary">Về menu</button>
        </div>
      `;
      this.bindScoreSaveForm(cb);
      document.getElementById('btn-again')!.addEventListener('click', () => cb.onStartCampaign());
      document.getElementById('btn-menu')!.addEventListener('click', () => cb.onMainMenu());
      return;
    }

    this.overlayEl.classList.remove('dawn');
    if (won) {
      const nextNight = (night + 1) as NightNumber;
      this.overlayCardEl.innerHTML = `
        <h1>Giữ Sáng ${NIGHT_MAPS[night].islandName} Tới Bình Minh!</h1>
        <p class="subtitle">Điểm Đêm ${night}: ${nightScore} · Tổng điểm: ${totalScore}</p>
        <p class="story">Đủ đèn đã giữ sáng cho tới bình minh. Chuẩn bị tiến sang ${NIGHT_MAPS[nextNight].title} — ${NIGHT_MAPS[nextNight].islandName}.</p>
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
          : 'Bình minh đã tới nhưng chưa đủ số đèn sáng theo yêu cầu.';
      this.overlayCardEl.innerHTML = `
        <h1>Đêm ${night} Chưa Hoàn Thành</h1>
        <p class="subtitle">${lossDesc}</p>
        <p class="story">Tổng điểm đã tích lũy: <strong>${totalScore}</strong> (${nightsWon} Đêm thắng). Lưu điểm hoặc thử lại!</p>
        ${scoreFormHtml}
        <div class="btn-row">
          <button id="btn-retry" class="btn-primary">Chơi lại Đêm ${night}</button>
          <button id="btn-menu" class="btn-secondary">Về menu</button>
        </div>
      `;
      this.bindScoreSaveForm(cb);
      document.getElementById('btn-retry')!.addEventListener('click', () => cb.onRestartNight());
      document.getElementById('btn-menu')!.addEventListener('click', () => cb.onMainMenu());
    }
  }

  private positionEdgeArrow(el: HTMLElement, proj: ProjectedPoint): void {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    let dx = proj.x - cx;
    let dy = proj.y - cy;
    if (!proj.inFront) {
      dx = -dx;
      dy = -dy;
    }
    const angle = Math.atan2(dy, dx);
    const pad = 56;
    const rx = cx - pad;
    const ry = cy - pad;
    const scale = Math.min(rx / Math.max(1e-3, Math.abs(Math.cos(angle))), ry / Math.max(1e-3, Math.abs(Math.sin(angle))));
    el.style.left = `${cx + Math.cos(angle) * scale - 20}px`;
    el.style.top = `${cy + Math.sin(angle) * scale - 20}px`;
    el.style.transform = `rotate(${(angle * 180) / Math.PI}deg)`;
    el.classList.remove('hidden');
  }

  updateHud(
    snap: SnapshotRecord,
    fps: number,
    settings: GameSettings,
    windWarning: boolean,
    recentShadeSpawnPos: Vec3 | null,
    projectFn: (pos: Vec3) => ProjectedPoint
  ): void {
    // Flames
    this.flamesEl.innerHTML = '';
    for (let i = 0; i < this.tuning.flames; i++) {
      const icon = document.createElement('span');
      icon.className = i < snap.player.flames ? 'flame-icon' : 'flame-icon lost';
      this.flamesEl.appendChild(icon);
    }

    // Timer mm:ss
    const totalSec = Math.ceil(snap.time_left_s);
    const mm = String(Math.floor(totalSec / 60)).padStart(2, '0');
    const ss = String(totalSec % 60).padStart(2, '0');
    this.timerEl.textContent = `${mm}:${ss}`;
    this.timerEl.classList.toggle('danger', snap.time_left_s <= 30);

    // Visual captions / accessibility indicators
    const captions: string[] = [];
    if (recentShadeSpawnPos) captions.push('⚠ Bóng Mực vừa xuất hiện!');
    if (snap.wind.active) captions.push(`⚠ Gió mạnh đang thổi (${Math.round(snap.wind.dir_deg)}°)!`);
    else if (windWarning) captions.push('⚠ Cảnh báo: Gió lớn sắp thổi!');
    if (totalSec <= 10 && totalSec > 0) captions.push(`⚠ Còn ${totalSec} giây tới bình minh!`);
    const lowLanterns = snap.lanterns.filter((l) => l.lit && l.fuel < this.tuning.low_fuel_threshold);
    if (lowLanterns.length > 0) {
      captions.push(`⚠ Đèn sắp cạn dầu (<30%): ${lowLanterns.map((l) => l.id).join(', ')}`);
    }
    this.captionsEl.innerHTML = captions.map((c) => `<div class="caption-pill">${c}</div>`).join('');

    // Edge arrow toward recently spawned Shade
    if (recentShadeSpawnPos) {
      const sp = projectFn(recentShadeSpawnPos);
      if (sp.onScreen) this.shadeArrowEl.classList.add('hidden');
      else this.positionEdgeArrow(this.shadeArrowEl, sp);
    } else {
      this.shadeArrowEl.classList.add('hidden');
    }

    // Night, lanterns, score, FPS
    const lit = snap.lanterns.filter((l) => l.lit).length;
    const needed = Math.ceil(this.tuning.win_ratio * snap.lanterns.length);
    this.nightEl.textContent = `Đêm ${snap.night}`;
    this.lanternsEl.textContent = `Đèn: ${lit}/${snap.lanterns.length} (≥${needed})`;
    this.scoreEl.textContent = `Điểm: ${snap.score}`;
    this.fpsEl.textContent = `${Math.round(fps)} FPS`;

    // Motes dynamic capacity bar (10..20)
    const cap = snap.player.capacity;
    this.motesLabelEl.textContent = `Đom đóm: ${snap.player.carried}/${cap}`;
    if (this.motesBarEl.children.length !== cap) {
      this.motesBarEl.innerHTML = '';
      for (let i = 0; i < cap; i++) {
        const pip = document.createElement('div');
        pip.className = 'mote-pip';
        this.motesBarEl.appendChild(pip);
      }
    }
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

    // Skill pills showing custom keybinds
    const dashKey = formatKeyCode(settings.keybinds.dash);
    const pulseKey = formatKeyCode(settings.keybinds.pulse);
    const interactKey = formatKeyCode(settings.keybinds.interact);

    if (snap.player.charm_s > 0) {
      this.dashEl.textContent = `${dashKey} · Lướt (0s)`;
      this.dashEl.classList.remove('cooldown');
    } else if (snap.player.dash_cd_s > 0) {
      this.dashEl.textContent = `${dashKey} · Lướt (${snap.player.dash_cd_s.toFixed(1)}s)`;
      this.dashEl.classList.add('cooldown');
    } else {
      this.dashEl.textContent = `${dashKey} · Lướt`;
      this.dashEl.classList.remove('cooldown');
    }

    if (snap.player.pulse_cd_s > 0) {
      this.pulseEl.textContent = `${pulseKey} · Tỏa Sáng (${snap.player.pulse_cd_s.toFixed(1)}s)`;
      this.pulseEl.classList.add('cooldown');
    } else if (snap.player.carried < this.tuning.pulse_cost) {
      this.pulseEl.textContent = `${pulseKey} · Tỏa Sáng (${snap.player.carried}/${this.tuning.pulse_cost})`;
      this.pulseEl.classList.add('cooldown');
    } else {
      this.pulseEl.textContent = `${pulseKey} · Tỏa Sáng`;
      this.pulseEl.classList.remove('cooldown');
    }

    // Nearest receivable lantern prompt & off-screen arrow
    let nearReceivable = null;
    let nearDist = Infinity;
    let nearestAnyPriority = null;
    let nearestDist = Infinity;
    for (const l of snap.lanterns) {
      const d = Math.hypot(snap.player.pos[0] - l.pos[0], snap.player.pos[2] - l.pos[2]);
      if (!l.lit || l.fuel < this.tuning.low_fuel_threshold) {
        if (d < nearestDist) {
          nearestDist = d;
          nearestAnyPriority = l;
        }
      }
      const canReceive = !l.lit || l.fuel < this.tuning.fuel_max;
      if (canReceive && d <= this.tuning.interact_radius && (d < nearDist - 1e-9 || (Math.abs(d - nearDist) <= 1e-9 && nearReceivable !== null && l.id < nearReceivable.id))) {
        nearDist = d;
        nearReceivable = l;
      }
    }

    if (nearReceivable) {
      if (nearReceivable.lit) {
        this.promptEl.textContent = `${interactKey} — Châm dầu (${nearReceivable.fuel.toFixed(0)}%)`;
      } else {
        const cost = nearReceivable.ever_lit ? this.tuning.relight_cost : this.tuning.lantern_cost;
        this.promptEl.textContent = `${interactKey} — ${nearReceivable.ever_lit ? 'Thắp lại' : 'Nạp ánh sáng'} (${nearReceivable.deposited}/${cost})`;
      }
      this.promptEl.classList.remove('hidden');
    } else {
      this.promptEl.classList.add('hidden');
    }

    if (nearestAnyPriority) {
      const proj = projectFn([nearestAnyPriority.pos[0], nearestAnyPriority.pos[1] + 3.0, nearestAnyPriority.pos[2]]);
      if (proj.onScreen) this.arrowEl.classList.add('hidden');
      else this.positionEdgeArrow(this.arrowEl, proj);
    } else {
      this.arrowEl.classList.add('hidden');
    }
  }
}
