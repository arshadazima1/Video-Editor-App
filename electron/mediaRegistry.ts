import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Only files the user imported or the app generated are served over media://.
 * This keeps the custom protocol from becoming an arbitrary file reader.
 */
const allowedPaths = new Set<string>();

export function allowMediaPath(filePath: string): void {
  allowedPaths.add(path.normalize(filePath));
}

export function isMediaPathAllowed(filePath: string): boolean {
  const normalized = path.normalize(filePath);
  if (allowedPaths.has(normalized)) return true;
  // Everything inside the app's generated-media folder is always allowed.
  return normalized.startsWith(generatedMediaDir() + path.sep);
}

export function mediaUrlFor(filePath: string): string {
  return 'media://' + encodeURIComponent(path.normalize(filePath));
}

export function generatedMediaDir(): string {
  const dir = path.join(app.getPath('userData'), 'generated-media');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
