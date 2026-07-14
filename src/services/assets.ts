import type { AssetType, MediaAsset } from '../../shared/types';
import type { ImportedFile } from './bridge';

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function assetTypeForName(name: string): AssetType {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'].includes(ext)) return 'audio';
  return 'video';
}

interface AssetMetadata {
  duration: number;
  width?: number;
  height?: number;
}

/** Read duration / dimensions by loading the media in a detached element. */
export function loadAssetMetadata(src: string, type: AssetType): Promise<AssetMetadata> {
  return new Promise((resolve) => {
    if (type === 'image') {
      const img = new Image();
      img.onload = () => resolve({ duration: 0, width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ duration: 0 });
      img.src = src;
      return;
    }
    const el = document.createElement(type === 'audio' ? 'audio' : 'video') as HTMLVideoElement;
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      resolve({
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        width: el.videoWidth || undefined,
        height: el.videoHeight || undefined,
      });
      el.src = '';
    };
    el.onerror = () => resolve({ duration: 0 });
    el.src = src;
  });
}

export async function importedFileToAsset(file: ImportedFile): Promise<MediaAsset> {
  const type = assetTypeForName(file.name);
  const meta = await loadAssetMetadata(file.src, type);
  return {
    id: uid(),
    name: file.name,
    type,
    src: file.src,
    filePath: file.filePath || undefined,
    duration: file.duration && file.duration > 0 ? file.duration : meta.duration,
    width: meta.width,
    height: meta.height,
    hasAudio: file.hasAudio ?? type !== 'image',
    origin: 'import',
  };
}

export function newAssetId(): string {
  return uid();
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const frac = Math.floor((s % 1) * 10);
  return `${m}:${String(sec).padStart(2, '0')}.${frac}`;
}
