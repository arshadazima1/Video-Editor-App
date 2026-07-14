import { spawn } from 'child_process';
import { ffmpegBinary } from './ffmpegPath';

export interface ProbeResult {
  hasAudio: boolean;
  hasVideo: boolean;
  /** Seconds; 0 when it could not be determined (e.g. still images). */
  duration: number;
}

/**
 * Cheap probe using `ffmpeg -i` stderr output (ffmpeg-static does not bundle
 * ffprobe). Good enough to know stream layout and container duration.
 */
export function probeMedia(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegBinary(), ['-hide_banner', '-i', filePath], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const finish = () => {
      const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      let duration = 0;
      if (durationMatch) {
        duration =
          parseInt(durationMatch[1], 10) * 3600 +
          parseInt(durationMatch[2], 10) * 60 +
          parseFloat(durationMatch[3]);
      }
      resolve({
        hasAudio: /Stream #[^\n]*Audio:/.test(stderr),
        hasVideo: /Stream #[^\n]*Video:/.test(stderr),
        duration,
      });
    };
    child.on('close', finish);
    child.on('error', () => resolve({ hasAudio: false, hasVideo: false, duration: 0 }));
  });
}
