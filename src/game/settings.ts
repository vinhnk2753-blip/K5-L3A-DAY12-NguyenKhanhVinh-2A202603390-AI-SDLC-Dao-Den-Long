export type ActionKey =
  | 'moveUp'
  | 'moveDown'
  | 'moveLeft'
  | 'moveRight'
  | 'jump'
  | 'dash'
  | 'interact'
  | 'pulse'
  | 'pause';

export type KeyBindings = Record<ActionKey, string>;

export const DEFAULT_KEYBINDS: KeyBindings = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyQ',
  pause: 'Escape'
};

export const ACTION_LABELS: Record<ActionKey, string> = {
  moveUp: 'Đi tiến',
  moveDown: 'Đi lùi',
  moveLeft: 'Sang trái',
  moveRight: 'Sang phải',
  jump: 'Nhảy',
  dash: 'Lướt (Dash)',
  interact: 'Tương tác / Châm dầu',
  pulse: 'Tỏa Sáng',
  pause: 'Tạm dừng'
};

export interface GameSettings {
  volume: number;           // 0.0 .. 1.0
  mouseSensitivity: number; // 0.1 .. 1.0
  colorblindMode: boolean;  // "Bảng màu dễ phân biệt"
  reducedMotion: boolean;   // "Giảm chuyển động"
  largeText: boolean;       // "Chữ lớn (×1.25)"
  keybinds: KeyBindings;
}

const STORAGE_KEY = 'dao_den_long_settings_v1';

export function getDefaultSettings(): GameSettings {
  return {
    volume: 0.7,
    mouseSensitivity: 0.3,
    colorblindMode: false,
    reducedMotion: false,
    largeText: false,
    keybinds: { ...DEFAULT_KEYBINDS }
  };
}

export function findKeyConflict(keybinds: KeyBindings, targetAction: ActionKey, code: string): ActionKey | null {
  for (const key of Object.keys(keybinds) as ActionKey[]) {
    if (key !== targetAction && keybinds[key] === code) {
      return key;
    }
  }
  return null;
}

export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Escape') return 'Esc';
  return code;
}

export function loadSettings(): GameSettings {
  const def = getDefaultSettings();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    const kb: KeyBindings = { ...DEFAULT_KEYBINDS };
    if (parsed.keybinds && typeof parsed.keybinds === 'object') {
      for (const action of Object.keys(DEFAULT_KEYBINDS) as ActionKey[]) {
        const v = (parsed.keybinds as Record<string, unknown>)[action];
        if (typeof v === 'string' && v.length > 0) kb[action] = v;
      }
    }
    return {
      volume:
        typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
          ? Math.max(0, Math.min(1, parsed.volume))
          : def.volume,
      mouseSensitivity:
        typeof parsed.mouseSensitivity === 'number' && Number.isFinite(parsed.mouseSensitivity)
          ? Math.max(0.1, Math.min(1, parsed.mouseSensitivity))
          : def.mouseSensitivity,
      colorblindMode: typeof parsed.colorblindMode === 'boolean' ? parsed.colorblindMode : def.colorblindMode,
      reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : def.reducedMotion,
      largeText: typeof parsed.largeText === 'boolean' ? parsed.largeText : def.largeText,
      keybinds: kb
    };
  } catch {
    return def;
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota errors
  }
}
