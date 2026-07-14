import * as fs from 'fs';
import * as path from 'path';
import type {
  AiVideoRequest,
  AppSettings,
  AvatarListItem,
  AvatarRequest,
  AvatarVoice,
  GeneratedMedia,
} from '../shared/types';
import { mediaUrlFor } from './mediaRegistry';
import { probeMedia } from './probe';
import { generateWithComfyUi } from './comfyui';

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireKey(value: string, providerLabel: string): string {
  if (!value.trim()) {
    throw new Error(`${providerLabel} API key is not set. Add it in Settings (gear icon).`);
  }
  return value.trim();
}

async function fetchJson(url: string, init: RequestInit, providerLabel: string): Promise<any> {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${providerLabel} request failed (${response.status}): ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${providerLabel} returned a non-JSON response: ${text.slice(0, 300)}`);
  }
}

async function downloadToLibrary(
  url: string,
  outDir: string,
  baseName: string,
  extension: string,
  init?: RequestInit,
): Promise<GeneratedMedia> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const safeBase = baseName.replace(/[^a-z0-9-_ ]/gi, '').slice(0, 40).trim() || 'generated';
  const fileName = `${safeBase}-${Date.now()}${extension}`;
  const filePath = path.join(outDir, fileName);
  await fs.promises.writeFile(filePath, buffer);
  const type = extension === '.png' || extension === '.jpg' ? 'image' : 'video';
  const probe = type === 'image' ? { hasAudio: false, duration: 0 } : await probeMedia(filePath);
  return {
    filePath,
    src: mediaUrlFor(filePath),
    fileName,
    type,
    duration: probe.duration,
    hasAudio: probe.hasAudio,
  };
}

// ---------------------------------------------------------------------------
// Text-to-video / text-to-image providers
// ---------------------------------------------------------------------------

export async function generateAiVideo(
  request: AiVideoRequest,
  settings: AppSettings,
  outDir: string,
): Promise<GeneratedMedia> {
  switch (request.provider) {
    case 'comfyui':
      return generateWithComfyUi(request, settings, outDir);
    case 'replicate':
      return generateWithReplicate(request, settings, outDir);
    case 'runway':
      return generateWithRunway(request, settings, outDir);
    case 'stability':
      return generateImageWithStability(request, settings, outDir);
    default:
      throw new Error(`Unknown provider: ${String(request.provider)}`);
  }
}

/**
 * Replicate hosts many text-to-video models behind one API shape.
 * Default model is a fast Wan 2.2 text-to-video; change it in the AI panel.
 */
async function generateWithReplicate(
  request: AiVideoRequest,
  settings: AppSettings,
  outDir: string,
): Promise<GeneratedMedia> {
  const key = requireKey(settings.replicateApiKey, 'Replicate');
  const model = request.model?.trim() || 'wan-video/wan-2.2-t2v-fast';
  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };

  const created = await fetchJson(
    `https://api.replicate.com/v1/models/${model}/predictions`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: {
          prompt: request.prompt,
          aspect_ratio: request.aspectRatio,
        },
      }),
    },
    'Replicate',
  );

  const pollUrl: string = created?.urls?.get ?? `https://api.replicate.com/v1/predictions/${created.id}`;
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let prediction = created;
  while (prediction.status !== 'succeeded') {
    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      throw new Error(`Replicate generation ${prediction.status}: ${prediction.error ?? 'unknown error'}`);
    }
    if (Date.now() > deadline) throw new Error('Replicate generation timed out.');
    await sleep(POLL_INTERVAL_MS);
    prediction = await fetchJson(pollUrl, { headers }, 'Replicate');
  }

  const output = prediction.output;
  const videoUrl: string | undefined = Array.isArray(output) ? output[0] : typeof output === 'string' ? output : output?.url;
  if (!videoUrl) throw new Error('Replicate finished but returned no video URL.');
  return downloadToLibrary(videoUrl, outDir, request.prompt, '.mp4');
}

/**
 * Runway dev API. Model slugs evolve quickly — if the default is rejected,
 * set a current one in the AI panel's model field.
 */
async function generateWithRunway(
  request: AiVideoRequest,
  settings: AppSettings,
  outDir: string,
): Promise<GeneratedMedia> {
  const key = requireKey(settings.runwayApiKey, 'Runway');
  const headers = {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'X-Runway-Version': '2024-11-06',
  };
  const ratioMap: Record<string, string> = {
    '9:16': '720:1280',
    '16:9': '1280:720',
    '1:1': '960:960',
    '4:5': '720:900',
  };

  const created = await fetchJson(
    'https://api.dev.runwayml.com/v1/text_to_video',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: request.model?.trim() || 'veo3',
        promptText: request.prompt,
        ratio: ratioMap[request.aspectRatio] ?? '720:1280',
        duration: request.durationSeconds ?? 8,
      }),
    },
    'Runway',
  );

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error('Runway generation timed out.');
    await sleep(POLL_INTERVAL_MS);
    const task = await fetchJson(`https://api.dev.runwayml.com/v1/tasks/${created.id}`, { headers }, 'Runway');
    if (task.status === 'SUCCEEDED') {
      const url = Array.isArray(task.output) ? task.output[0] : task.output;
      if (!url) throw new Error('Runway finished but returned no video URL.');
      return downloadToLibrary(url, outDir, request.prompt, '.mp4');
    }
    if (task.status === 'FAILED' || task.status === 'CANCELLED') {
      throw new Error(`Runway generation failed: ${task.failure ?? task.failureCode ?? 'unknown error'}`);
    }
  }
}

/** Stability AI generates still images — ideal for Facebook post graphics. */
async function generateImageWithStability(
  request: AiVideoRequest,
  settings: AppSettings,
  outDir: string,
): Promise<GeneratedMedia> {
  const key = requireKey(settings.stabilityApiKey, 'Stability AI');
  const form = new FormData();
  form.append('prompt', request.prompt);
  form.append('aspect_ratio', request.aspectRatio);
  form.append('output_format', 'png');

  const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/core', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' },
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Stability AI request failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const safeBase = request.prompt.replace(/[^a-z0-9-_ ]/gi, '').slice(0, 40).trim() || 'image';
  const fileName = `${safeBase}-${Date.now()}.png`;
  const filePath = path.join(outDir, fileName);
  await fs.promises.writeFile(filePath, buffer);
  return { filePath, src: mediaUrlFor(filePath), fileName, type: 'image', duration: 0, hasAudio: false };
}

// ---------------------------------------------------------------------------
// Avatar providers
// ---------------------------------------------------------------------------

export async function generateAvatarVideo(
  request: AvatarRequest,
  settings: AppSettings,
  outDir: string,
): Promise<GeneratedMedia> {
  if (request.provider === 'heygen') return generateHeygenAvatar(request, settings, outDir);
  return generateDidAvatar(request, settings, outDir);
}

async function generateHeygenAvatar(
  request: AvatarRequest,
  settings: AppSettings,
  outDir: string,
): Promise<GeneratedMedia> {
  const key = requireKey(settings.heygenApiKey, 'HeyGen');
  const headers = { 'X-Api-Key': key, 'Content-Type': 'application/json' };

  const created = await fetchJson(
    'https://api.heygen.com/v2/video/generate',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        video_inputs: [
          {
            character: { type: 'avatar', avatar_id: request.avatarId, avatar_style: 'normal' },
            voice: { type: 'text', input_text: request.script, voice_id: request.voiceId },
          },
        ],
        dimension: { width: request.width ?? 720, height: request.height ?? 1280 },
      }),
    },
    'HeyGen',
  );

  const videoId = created?.data?.video_id;
  if (!videoId) throw new Error(`HeyGen did not return a video id: ${JSON.stringify(created).slice(0, 300)}`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error('HeyGen generation timed out.');
    await sleep(POLL_INTERVAL_MS);
    const status = await fetchJson(
      `https://api.heygen.com/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`,
      { headers: { 'X-Api-Key': key } },
      'HeyGen',
    );
    const state = status?.data?.status;
    if (state === 'completed') {
      const url = status?.data?.video_url;
      if (!url) throw new Error('HeyGen completed but returned no video URL.');
      return downloadToLibrary(url, outDir, 'avatar', '.mp4');
    }
    if (state === 'failed') {
      throw new Error(`HeyGen generation failed: ${JSON.stringify(status?.data?.error ?? 'unknown error')}`);
    }
  }
}

async function generateDidAvatar(
  request: AvatarRequest,
  settings: AppSettings,
  outDir: string,
): Promise<GeneratedMedia> {
  const key = requireKey(settings.didApiKey, 'D-ID');
  if (!request.sourceImageUrl) {
    throw new Error('D-ID needs a source photo URL (a publicly reachable image of the presenter).');
  }
  const auth = `Basic ${Buffer.from(key).toString('base64')}`;
  const headers = { Authorization: auth, 'Content-Type': 'application/json' };

  const created = await fetchJson(
    'https://api.d-id.com/talks',
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source_url: request.sourceImageUrl,
        script: { type: 'text', input: request.script },
      }),
    },
    'D-ID',
  );

  const talkId = created?.id;
  if (!talkId) throw new Error(`D-ID did not return a talk id: ${JSON.stringify(created).slice(0, 300)}`);

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error('D-ID generation timed out.');
    await sleep(POLL_INTERVAL_MS);
    const talk = await fetchJson(`https://api.d-id.com/talks/${talkId}`, { headers: { Authorization: auth } }, 'D-ID');
    if (talk.status === 'done') {
      if (!talk.result_url) throw new Error('D-ID finished but returned no video URL.');
      return downloadToLibrary(talk.result_url, outDir, 'avatar', '.mp4');
    }
    if (talk.status === 'error' || talk.status === 'rejected') {
      throw new Error(`D-ID generation failed: ${JSON.stringify(talk.error ?? talk.status)}`);
    }
  }
}

export async function listAvatars(provider: string, settings: AppSettings): Promise<AvatarListItem[]> {
  if (provider !== 'heygen') return [];
  const key = requireKey(settings.heygenApiKey, 'HeyGen');
  const data = await fetchJson('https://api.heygen.com/v2/avatars', { headers: { 'X-Api-Key': key } }, 'HeyGen');
  const avatars: any[] = data?.data?.avatars ?? [];
  return avatars.slice(0, 200).map((a) => ({
    id: a.avatar_id,
    name: a.avatar_name ?? a.avatar_id,
    previewUrl: a.preview_image_url,
  }));
}

export async function listVoices(provider: string, settings: AppSettings): Promise<AvatarVoice[]> {
  if (provider !== 'heygen') return [];
  const key = requireKey(settings.heygenApiKey, 'HeyGen');
  const data = await fetchJson('https://api.heygen.com/v2/voices', { headers: { 'X-Api-Key': key } }, 'HeyGen');
  const voices: any[] = data?.data?.voices ?? [];
  return voices.slice(0, 300).map((v) => ({
    id: v.voice_id,
    name: v.name ?? v.voice_id,
    language: v.language,
  }));
}
