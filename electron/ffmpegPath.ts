// ffmpeg-static exports the path to a bundled ffmpeg binary. Inside a packaged
// app the binary lives in app.asar.unpacked (see build.asarUnpack in package.json).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegStatic: string | null = require('ffmpeg-static');

export function ffmpegBinary(): string {
  if (!ffmpegStatic) {
    throw new Error('Bundled ffmpeg binary not found. Reinstall dependencies (npm install).');
  }
  return ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
}
