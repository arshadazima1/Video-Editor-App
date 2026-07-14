import { contextBridge, ipcRenderer } from 'electron';
import type {
  AiVideoRequest,
  AppSettings,
  AvatarRequest,
  ExportProgress,
  ExportRequest,
} from '../shared/types';

const api = {
  isElectron: true,

  openImportDialog: (): Promise<Array<{ filePath: string; src: string; name: string }>> =>
    ipcRenderer.invoke('media:openImportDialog'),

  openSaveDialog: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('media:openSaveDialog', defaultName),

  revealInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('media:revealInFolder', filePath),

  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: AppSettings): Promise<void> => ipcRenderer.invoke('settings:set', settings),

  startExport: (request: ExportRequest): Promise<ExportProgress> => ipcRenderer.invoke('export:start', request),
  cancelExport: (): Promise<void> => ipcRenderer.invoke('export:cancel'),
  onExportProgress: (listener: (progress: ExportProgress) => void): (() => void) => {
    const wrapped = (_event: unknown, progress: ExportProgress) => listener(progress);
    ipcRenderer.on('export:progress', wrapped);
    return () => ipcRenderer.removeListener('export:progress', wrapped);
  },

  generateAiVideo: (request: AiVideoRequest) => ipcRenderer.invoke('ai:generateVideo', request),
  generateAvatarVideo: (request: AvatarRequest) => ipcRenderer.invoke('avatar:generate', request),
  listAvatars: (provider: string) => ipcRenderer.invoke('avatar:listAvatars', provider),
  listVoices: (provider: string) => ipcRenderer.invoke('avatar:listVoices', provider),
};

export type ElectronApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
