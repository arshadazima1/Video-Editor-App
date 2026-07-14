import type {
  AiVideoRequest,
  AppSettings,
  AvatarListItem,
  AvatarRequest,
  AvatarVoice,
  ExportProgress,
  ExportRequest,
  GeneratedMedia,
  TtsRequest,
  TtsVoice,
} from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';

export interface ImportedFile {
  filePath: string;
  src: string;
  name: string;
  hasAudio?: boolean;
  duration?: number;
}

export interface Bridge {
  isElectron: boolean;
  openImportDialog(): Promise<ImportedFile[]>;
  openSaveDialog(defaultName: string): Promise<string | null>;
  revealInFolder(filePath: string): Promise<void>;
  getSettings(): Promise<AppSettings>;
  setSettings(settings: AppSettings): Promise<void>;
  startExport(request: ExportRequest): Promise<ExportProgress>;
  cancelExport(): Promise<void>;
  onExportProgress(listener: (progress: ExportProgress) => void): () => void;
  generateAiVideo(request: AiVideoRequest): Promise<GeneratedMedia>;
  generateAvatarVideo(request: AvatarRequest): Promise<GeneratedMedia>;
  listAvatars(provider: string): Promise<AvatarListItem[]>;
  listVoices(provider: string): Promise<AvatarVoice[]>;
  listTtsVoices(): Promise<TtsVoice[]>;
  generateTts(request: TtsRequest): Promise<GeneratedMedia>;
}

declare global {
  interface Window {
    api?: Bridge;
  }
}

const BROWSER_SETTINGS_KEY = 'ai-video-studio-settings';

/**
 * Browser fallback so `npm run dev` in a plain browser still lets you play
 * with the editor. Export and AI calls need the Electron shell (native ffmpeg,
 * no CORS restrictions), so they explain themselves instead of half-working.
 */
const browserBridge: Bridge = {
  isElectron: false,
  openImportDialog: () =>
    new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.accept = 'video/*,audio/*,image/*';
      input.onchange = () => {
        const files = Array.from(input.files ?? []);
        resolve(files.map((file) => ({ filePath: '', src: URL.createObjectURL(file), name: file.name })));
      };
      input.oncancel = () => resolve([]);
      input.click();
    }),
  openSaveDialog: async () => null,
  revealInFolder: async () => undefined,
  getSettings: async () => {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(BROWSER_SETTINGS_KEY) ?? '{}') };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },
  setSettings: async (settings) => {
    localStorage.setItem(BROWSER_SETTINGS_KEY, JSON.stringify(settings));
  },
  startExport: async () => {
    throw new Error('Export requires the desktop app. Run "npm start" to launch AI Video Studio in Electron.');
  },
  cancelExport: async () => undefined,
  onExportProgress: () => () => undefined,
  generateAiVideo: async () => {
    throw new Error('AI generation requires the desktop app (browser CORS blocks provider APIs). Run "npm start".');
  },
  generateAvatarVideo: async () => {
    throw new Error('Avatar generation requires the desktop app. Run "npm start".');
  },
  listAvatars: async () => [],
  listVoices: async () => [],
  listTtsVoices: async () => [],
  generateTts: async () => {
    throw new Error('Voiceover uses Windows text-to-speech and needs the desktop app. Run "npm start".');
  },
};

export const bridge: Bridge = window.api ?? browserBridge;
