import { spawn, ChildProcess } from 'child_process';
import type { Clip, ExportProgress, ExportRequest, MediaAsset, Project, Track } from '../shared/types';
import { ffmpegBinary } from './ffmpegPath';
import { loadSettings } from './settings';

let currentProcess: ChildProcess | null = null;

export function cancelExport(): void {
  if (currentProcess) {
    currentProcess.kill('SIGKILL');
    currentProcess = null;
  }
}

export function runExport(
  request: ExportRequest,
  onProgress: (progress: ExportProgress) => void,
): Promise<ExportProgress> {
  const { args, totalDuration } = buildFfmpegArgs(request);

  return new Promise((resolve) => {
    const child = spawn(ffmpegBinary(), args, { windowsHide: true });
    currentProcess = child;
    let stderrTail = '';

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrTail = (stderrTail + text).slice(-4000);
      const match = text.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (match && totalDuration > 0) {
        const seconds =
          parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseFloat(match[3]);
        onProgress({
          ratio: Math.min(seconds / totalDuration, 0.99),
          message: `Rendering… ${seconds.toFixed(1)}s / ${totalDuration.toFixed(1)}s`,
          done: false,
        });
      }
    });

    child.on('close', (code) => {
      currentProcess = null;
      if (code === 0) {
        resolve({ ratio: 1, message: 'Export complete', done: true, outputPath: request.outputPath });
      } else {
        resolve({
          ratio: 0,
          message: 'Export failed',
          done: true,
          error: `ffmpeg exited with code ${code}.\n${stderrTail}`,
        });
      }
    });

    child.on('error', (err) => {
      currentProcess = null;
      resolve({ ratio: 0, message: 'Export failed', done: true, error: String(err) });
    });
  });
}

// ---------------------------------------------------------------------------
// Filter graph construction
// ---------------------------------------------------------------------------

interface InputClip {
  clip: Clip;
  asset: MediaAsset;
  inputIndex: number;
}

function clipEnd(clip: Clip): number {
  return clip.start + clip.duration;
}

function projectDuration(project: Project): number {
  return Math.max(1, ...project.clips.map(clipEnd));
}

/** Escape a value used inside a drawtext option. */
function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "’") // typographic apostrophe avoids nested quoting pitfalls
    .replace(/%/g, '\\%')
    .replace(/:/g, '\\:');
}

/** Escape a font file path for drawtext (Windows drive colons need escaping). */
function escapeFontPath(fontPath: string): string {
  return fontPath.replace(/\\/g, '/').replace(/:/g, '\\:');
}

function num(value: number): string {
  return Number(value.toFixed(4)).toString();
}

export function buildFfmpegArgs(request: ExportRequest): { args: string[]; totalDuration: number } {
  const { project, preset, outputPath } = request;
  const total = projectDuration(project);
  const assetById = new Map(project.assets.map((a) => [a.id, a]));
  const trackById = new Map(project.tracks.map((t) => [t.id, t]));
  const trackIndex = new Map(project.tracks.map((t, i) => [t.id, i]));

  const inputs: string[] = [];
  const inputClips: InputClip[] = [];

  const mediaClips = project.clips
    .filter((c) => c.assetId && assetById.get(c.assetId)?.filePath)
    .sort((a, b) => a.start - b.start);

  for (const clip of mediaClips) {
    const asset = assetById.get(clip.assetId!)!;
    const inputIndex = inputClips.length;
    if (asset.type === 'image') {
      inputs.push('-loop', '1', '-t', num(clip.duration), '-i', asset.filePath!);
    } else {
      inputs.push('-ss', num(clip.inPoint), '-t', num(clip.duration), '-i', asset.filePath!);
    }
    inputClips.push({ clip, asset, inputIndex });
  }

  const filters: string[] = [];
  const W = preset.width;
  const H = preset.height;

  filters.push(`color=c=black:s=${W}x${H}:r=${preset.fps}:d=${num(total)}[base]`);

  // Track order in the project is top-first; composite bottom tracks first.
  const isVisual = (ic: InputClip) => ic.asset.type === 'video' || ic.asset.type === 'image';
  const visualClips = inputClips
    .filter(isVisual)
    .sort((a, b) => {
      const ta = trackIndex.get(a.clip.trackId) ?? 0;
      const tb = trackIndex.get(b.clip.trackId) ?? 0;
      if (ta !== tb) return tb - ta; // higher index = lower layer, composite first
      return a.clip.start - b.clip.start;
    });

  let lastVideoLabel = 'base';
  visualClips.forEach((ic, order) => {
    const { clip, inputIndex } = ic;
    const fx = clip.effects;
    const chain: string[] = [];
    chain.push(`fps=${preset.fps}`);
    if (fx.brightness !== 0 || fx.contrast !== 1 || fx.saturation !== 1) {
      chain.push(`eq=brightness=${num(fx.brightness)}:contrast=${num(fx.contrast)}:saturation=${num(fx.saturation)}`);
    }
    chain.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`);
    chain.push('format=rgba');
    chain.push(`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black@0`);
    if (fx.opacity < 1) {
      chain.push(`colorchannelmixer=aa=${num(fx.opacity)}`);
    }
    if (clip.fadeIn > 0) {
      chain.push(`fade=t=in:st=0:d=${num(clip.fadeIn)}:alpha=1`);
    }
    if (clip.fadeOut > 0) {
      chain.push(`fade=t=out:st=${num(Math.max(0, clip.duration - clip.fadeOut))}:d=${num(clip.fadeOut)}:alpha=1`);
    }
    chain.push(`setpts=PTS-STARTPTS+${num(clip.start)}/TB`);
    const clipLabel = `vc${order}`;
    filters.push(`[${inputIndex}:v]${chain.join(',')}[${clipLabel}]`);
    const outLabel = `vo${order}`;
    filters.push(
      `[${lastVideoLabel}][${clipLabel}]overlay=eof_action=pass:enable='between(t,${num(clip.start)},${num(clipEnd(clip))})'[${outLabel}]`,
    );
    lastVideoLabel = outLabel;
  });

  // Burn in text clips (top-most last so upper tracks draw above lower ones).
  const settings = loadSettings();
  const fontFile = escapeFontPath(settings.drawTextFontFile);
  const scaleY = H / project.height;
  const textClips = project.clips
    .filter((c) => c.text !== undefined)
    .sort((a, b) => {
      const ta = trackIndex.get(a.trackId) ?? 0;
      const tb = trackIndex.get(b.trackId) ?? 0;
      if (ta !== tb) return tb - ta;
      return a.start - b.start;
    });

  let textChain = '';
  for (const clip of textClips) {
    const style = clip.textStyle ?? { fontSize: 64, color: '#ffffff', x: 0.5, y: 0.5 };
    const fontSize = Math.round(style.fontSize * scaleY);
    const parts = [
      `fontfile='${fontFile}'`,
      `text='${escapeDrawText(clip.text ?? '')}'`,
      `fontsize=${fontSize}`,
      `fontcolor=${style.color}`,
      `x=w*${num(style.x)}-text_w/2`,
      `y=h*${num(style.y)}-text_h/2`,
      `enable='between(t,${num(clip.start)},${num(clipEnd(clip))})'`,
    ];
    if (style.background) {
      parts.push('box=1', `boxcolor=${style.background}@0.6`, 'boxborderw=12');
    }
    textChain += (textChain ? ',' : '') + `drawtext=${parts.join(':')}`;
  }
  if (textChain) {
    filters.push(`[${lastVideoLabel}]${textChain}[vtext]`);
    lastVideoLabel = 'vtext';
  }
  filters.push(`[${lastVideoLabel}]format=yuv420p[vout]`);

  // ----- Audio -----
  const audioLabels: string[] = [];
  filters.push(`anullsrc=channel_layout=stereo:sample_rate=48000:d=${num(total)}[abase]`);
  audioLabels.push('abase');

  const audibleClips = inputClips.filter((ic) => {
    const track: Track | undefined = trackById.get(ic.clip.trackId);
    if (track?.muted) return false;
    if (ic.clip.volume <= 0) return false;
    if (ic.asset.type === 'audio') return true;
    return ic.asset.type === 'video' && ic.asset.hasAudio === true;
  });

  audibleClips.forEach((ic, order) => {
    const { clip, inputIndex } = ic;
    const chain: string[] = ['aresample=48000', 'aformat=channel_layouts=stereo'];
    if (clip.volume !== 1) chain.push(`volume=${num(clip.volume)}`);
    if (clip.fadeIn > 0) chain.push(`afade=t=in:st=0:d=${num(clip.fadeIn)}`);
    if (clip.fadeOut > 0) {
      chain.push(`afade=t=out:st=${num(Math.max(0, clip.duration - clip.fadeOut))}:d=${num(clip.fadeOut)}`);
    }
    const delayMs = Math.round(clip.start * 1000);
    chain.push(`adelay=${delayMs}:all=1`);
    const label = `ac${order}`;
    filters.push(`[${inputIndex}:a]${chain.join(',')}[${label}]`);
    audioLabels.push(label);
  });

  if (audioLabels.length > 1) {
    filters.push(
      `${audioLabels.map((l) => `[${l}]`).join('')}amix=inputs=${audioLabels.length}:duration=first:normalize=0[aout]`,
    );
  } else {
    filters.push(`[abase]anull[aout]`);
  }

  const args = [
    '-y',
    ...inputs,
    '-filter_complex',
    filters.join(';'),
    '-map',
    '[vout]',
    '-map',
    '[aout]',
    '-c:v',
    'libx264',
    '-preset',
    'medium',
    '-b:v',
    preset.videoBitrate,
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-r',
    String(preset.fps),
    '-t',
    num(total),
    '-movflags',
    '+faststart',
    outputPath,
  ];

  return { args, totalDuration: total };
}
