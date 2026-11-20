export interface GameSettings {
  volume: number;           // 0.0 .. 1.0
  mouseSensitivity: number; // 0.1 .. 1.0
}

const STORAGE_KEY = 'dao_den_long_settings_v1';

const DEFAULT_SETTINGS: GameSettings = {
  volume: 0.7,
  mouseSensitivity: 0.3
};

export function loadSettings(): GameSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<GameSettings>;
    return {
      volume:
        typeof parsed.volume === 'number' && Number.isFinite(parsed.volume)
          ? Math.max(0, Math.min(1, parsed.volume))
          : DEFAULT_SETTINGS.volume,
      mouseSensitivity:
        typeof parsed.mouseSensitivity === 'number' && Number.isFinite(parsed.mouseSensitivity)
          ? Math.max(0.1, Math.min(1, parsed.mouseSensitivity))
          : DEFAULT_SETTINGS.mouseSensitivity
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / private mode errors
  }
}
