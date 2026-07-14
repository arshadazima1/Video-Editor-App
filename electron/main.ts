import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { runExport, cancelExport } from './ffmpegExport';
import { generateAiVideo, generateAvatarVideo, listAvatars, listVoices } from './aiProviders';
import { loadSettings, saveSettings } from './settings';
import { probeMedia } from './probe';
import { allowMediaPath, isMediaPathAllowed, mediaUrlFor, generatedMediaDir } from './mediaRegistry';
import type { AiVideoRequest, AvatarRequest, ExportRequest, AppSettings } from '../shared/types';

let mainWindow: BrowserWindow | null = null;

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: false, supportFetchAPI: true, stream: true, bypassCSP: true } },
]);

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 950,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#111318',
    title: 'AI Video Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Serve whitelisted local files to the renderer as media://<encoded absolute path>
  protocol.handle('media', (request) => {
    const filePath = decodeURIComponent(request.url.slice('media://'.length));
    if (!isMediaPathAllowed(filePath)) {
      return new Response('Forbidden', { status: 403 });
    }
    return fetchFileResponse(filePath);
  });

  registerIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

async function fetchFileResponse(filePath: string): Promise<Response> {
  try {
    const data = await fs.promises.readFile(filePath);
    return new Response(new Uint8Array(data), {
      headers: { 'Content-Type': mimeFor(filePath) },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.ogg': 'audio/ogg',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  };
  return map[ext] ?? 'application/octet-stream';
}

function registerIpc(): void {
  ipcMain.handle('media:openImportDialog', async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import media',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: ['mp4', 'mov', 'webm', 'mkv', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'png', 'jpg', 'jpeg', 'gif', 'webp'] },
      ],
    });
    if (result.canceled) return [];
    return Promise.all(
      result.filePaths.map(async (filePath) => {
        allowMediaPath(filePath);
        const probe = await probeMedia(filePath);
        return {
          filePath,
          src: mediaUrlFor(filePath),
          name: path.basename(filePath),
          hasAudio: probe.hasAudio,
          duration: probe.duration,
        };
      }),
    );
  });

  ipcMain.handle('media:openSaveDialog', async (_event, defaultName: string) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export video',
      defaultPath: defaultName,
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }],
    });
    return result.canceled || !result.filePath ? null : result.filePath;
  });

  ipcMain.handle('media:revealInFolder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:set', (_event, settings: AppSettings) => saveSettings(settings));

  ipcMain.handle('export:start', (event, request: ExportRequest) => {
    return runExport(request, (progress) => {
      event.sender.send('export:progress', progress);
    });
  });
  ipcMain.handle('export:cancel', () => cancelExport());

  ipcMain.handle('ai:generateVideo', (_event, request: AiVideoRequest) =>
    generateAiVideo(request, loadSettings(), generatedMediaDir()),
  );
  ipcMain.handle('avatar:generate', (_event, request: AvatarRequest) =>
    generateAvatarVideo(request, loadSettings(), generatedMediaDir()),
  );
  ipcMain.handle('avatar:listAvatars', (_event, provider: string) => listAvatars(provider, loadSettings()));
  ipcMain.handle('avatar:listVoices', (_event, provider: string) => listVoices(provider, loadSettings()));
}
