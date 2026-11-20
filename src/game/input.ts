import type { LiveInputState } from '../sim/types.js';
import { DEFAULT_KEYBINDS, type KeyBindings } from './settings.js';

export class InputController {
  private keys = new Set<string>();
  private camYawDeg = 0;
  private dragging = false;
  private lastMouseX = 0;
  private mouseSensitivity = 0.3;
  private keybinds: KeyBindings = { ...DEFAULT_KEYBINDS };
  private pauseQueued = false;
  private capturingKey = false;

  constructor(private readonly canvas: HTMLCanvasElement, sensitivity = 0.3, keybinds: KeyBindings = DEFAULT_KEYBINDS) {
    this.mouseSensitivity = sensitivity;
    this.keybinds = { ...keybinds };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
  }

  setMouseSensitivity(s: number): void {
    this.mouseSensitivity = s;
  }

  setKeybinds(kb: KeyBindings): void {
    this.keybinds = { ...kb };
  }

  setCapturingKey(flag: boolean): void {
    this.capturingKey = flag;
  }

  resetCamYaw(): void {
    this.camYawDeg = 0;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.capturingKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    if (!e.repeat && (e.code === this.keybinds.pause || e.code === 'KeyP')) {
      this.pauseQueued = true;
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.dragging = true;
      this.lastMouseX = e.clientX;
    }
  };

  private onMouseUp = (): void => {
    this.dragging = false;
  };

  private onMouseMove = (e: MouseEvent): void => {
    const scale = this.mouseSensitivity * 0.8;
    if (document.pointerLockElement === this.canvas) {
      this.camYawDeg -= e.movementX * scale;
    } else if (this.dragging) {
      const dx = e.clientX - this.lastMouseX;
      this.lastMouseX = e.clientX;
      this.camYawDeg -= dx * scale;
    }
  };

  getCamYawDeg(): number {
    return this.camYawDeg;
  }

  consumePauseToggle(): boolean {
    const p = this.pauseQueued;
    this.pauseQueued = false;
    return p;
  }

  poll(pauseSignal = false): LiveInputState {
    if (this.keys.has('ArrowLeft')) this.camYawDeg += 2.2;
    if (this.keys.has('ArrowRight')) this.camYawDeg -= 2.2;

    let mx = 0;
    let mz = 0;
    if (this.keys.has(this.keybinds.moveUp) || this.keys.has('ArrowUp')) mz += 1;
    if (this.keys.has(this.keybinds.moveDown) || this.keys.has('ArrowDown')) mz -= 1;
    if (this.keys.has(this.keybinds.moveLeft)) mx += 1;
    if (this.keys.has(this.keybinds.moveRight)) mx -= 1;

    const dashDown =
      this.keys.has(this.keybinds.dash) ||
      (this.keybinds.dash === 'ShiftLeft' && this.keys.has('ShiftRight'));

    return {
      move: [mx, mz],
      cam_yaw_deg: this.camYawDeg,
      jump: this.keys.has(this.keybinds.jump),
      interact: this.keys.has(this.keybinds.interact),
      pulse: this.keys.has(this.keybinds.pulse),
      dash: dashDown,
      pause: pauseSignal
    };
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('mousemove', this.onMouseMove);
  }
}
