import { TICK_RATE } from '../sim/config.js';
import type { SnapshotRecord, TuningConfig } from '../sim/types.js';

export class HudController {
  private readonly hudEl = document.getElementById('hud')!;
  private readonly flamesEl = document.getElementById('hud-flames')!;
  private readonly timerEl = document.getElementById('hud-timer')!;
  private readonly lanternsEl = document.getElementById('hud-lanterns')!;
  private readonly scoreEl = document.getElementById('hud-score')!;
  private readonly motesLabelEl = document.getElementById('hud-motes-label')!;
  private readonly motesBarEl = document.getElementById('hud-motes-bar')!;
  private readonly pulseEl = document.getElementById('hud-pulse')!;
  private readonly promptEl = document.getElementById('hud-prompt')!;
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

  showHud(): void {
    this.hudEl.classList.remove('hidden');
    this.overlayEl.classList.add('hidden');
  }

  update(snap: SnapshotRecord, pulseCdTicks: number): void {
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

    // Lanterns & score
    const lit = snap.lanterns.filter((l) => l.lit).length;
    this.lanternsEl.textContent = `Đèn: ${lit}/${snap.lanterns.length}`;
    this.scoreEl.textContent = `Điểm: ${snap.score}`;

    // Motes
    this.motesLabelEl.textContent = `Đom đóm: ${snap.player.carried}/${this.tuning.carry_capacity}`;
    const pips = this.motesBarEl.children;
    for (let i = 0; i < pips.length; i++) {
      pips[i].classList.toggle('filled', i < snap.player.carried);
    }

    // Pulse status
    if (pulseCdTicks > 0) {
      this.pulseEl.textContent = `Q · Tỏa Sáng (${(pulseCdTicks / TICK_RATE).toFixed(1)}s)`;
      this.pulseEl.classList.add('cooldown');
    } else if (snap.player.carried < this.tuning.pulse_cost) {
      this.pulseEl.textContent = `Q · Cần ${this.tuning.pulse_cost} đom đóm`;
      this.pulseEl.classList.add('cooldown');
    } else {
      this.pulseEl.textContent = `Q · Tỏa Sáng sẵn sàng`;
      this.pulseEl.classList.remove('cooldown');
    }

    // Nearby unlit lantern prompt
    let nearLantern = null;
    for (const l of snap.lanterns) {
      if (l.lit) continue;
      const d = Math.hypot(snap.player.pos[0] - l.pos[0], snap.player.pos[2] - l.pos[2]);
      if (d <= this.tuning.interact_radius) {
        nearLantern = l;
        break;
      }
    }
    if (nearLantern) {
      this.promptEl.textContent = `E — Nạp ánh sáng (${nearLantern.deposited}/${this.tuning.lantern_cost})`;
      this.promptEl.classList.remove('hidden');
    } else {
      this.promptEl.classList.add('hidden');
    }
  }

  showEndScreen(state: 'won' | 'lost', score: number, reason: string, onReplay: () => void): void {
    this.overlayEl.classList.remove('hidden');
    const title = state === 'won' ? 'Ánh Sáng Trở Lại!' : 'Đêm Tối Bao Phủ';
    const desc =
      state === 'won'
        ? 'Bạn đã thắp sáng toàn bộ 5 Đèn Lồng Lớn của Đảo Bến!'
        : reason === 'no_flames'
          ? 'Mây đã mất hết Ngọn Lửa giữa màn sương mực.'
          : 'Bình minh đã tới trước khi đảo được thắp sáng.';

    this.overlayCardEl.innerHTML = `
      <h1>${title}</h1>
      <p class="subtitle">Tổng điểm: ${score}</p>
      <p class="story">${desc}</p>
      <button id="btn-replay" class="btn-primary">Chơi lại Đêm 1</button>
    `;
    document.getElementById('btn-replay')!.addEventListener('click', onReplay);
  }
}
