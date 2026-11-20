import type { LiveInputState } from '../sim/types.js';

export class InputController {
  private keys = new Set<string>();
  private camYawDeg = 0;
  private dragging = false;
  private lastMouseX = 0;
  private mouseSensitivity = 0.25;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('mousemove', this.onMouseMove);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
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
    if (document.pointerLockElement === this.canvas) {
      this.camYawDeg -= e.movementX * this.mouseSensitivity;
    } else if (this.dragging) {
      const dx = e.clientX - this.lastMouseX;
      this.lastMouseX = e.clientX;
      this.camYawDeg -= dx * this.mouseSensitivity;
    }
  };

  getCamYawDeg(): number {
    return this.camYawDeg;
  }

  poll(): LiveInputState {
    if (this.keys.has('ArrowLeft')) this.camYawDeg += 2.2;
    if (this.keys.has('ArrowRight')) this.camYawDeg -= 2.2;

    // With camera positioned behind player looking toward +Z when yaw=0:
    // W moves forward (+Z), S moves backward (-Z), A moves left (+X), D moves right (-X)
    let mx = 0;
    let mz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) mz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) mz -= 1;
    if (this.keys.has('KeyA')) mx += 1;
    if (this.keys.has('KeyD')) mx -= 1;

    return {
      move: [mx, mz],
      cam_yaw_deg: this.camYawDeg,
      jump: this.keys.has('Space'),
      interact: this.keys.has('KeyE'),
      pulse: this.keys.has('KeyQ') || this.keys.has('KeyF')
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
