import * as fs from 'fs';
import * as path from 'path';
import type { AiVideoRequest, AppSettings, GeneratedMedia } from '../shared/types';
import { mediaUrlFor } from './mediaRegistry';
import { probeMedia } from './probe';

/**
 * Adapter for a locally running ComfyUI instance (https://www.comfy.org) —
 * free, open-source, runs Stable Diffusion / LTX-Video / Wan / AnimateDiff
 * on the user's own GPU. No API key and no per-generation cost.
 *
 * Workflow: the user exports any ComfyUI workflow in API format, replaces the
 * positive prompt text with {{PROMPT}} (and optionally {{WIDTH}}/{{HEIGHT}}/
 * {{SEED}}), and pastes it into Settings. With no custom workflow set, a
 * built-in Stable Diffusion 1.5 text-to-image workflow is used.
 */

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30 * 60 * 1000; // local video gen can be slow

const DEFAULT_SD15_WORKFLOW = `{
  "3": {"class_type": "KSampler", "inputs": {"cfg": 7.5, "denoise": 1, "latent_image": ["5", 0], "model": ["4", 0], "negative": ["7", 0], "positive": ["6", 0], "sampler_name": "euler", "scheduler": "normal", "seed": {{SEED}}, "steps": 25}},
  "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "v1-5-pruned-emaonly.safetensors"}},
  "5": {"class_type": "EmptyLatentImage", "inputs": {"batch_size": 1, "height": {{HEIGHT}}, "width": {{WIDTH}}}},
  "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 1], "text": "{{PROMPT}}"}},
  "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 1], "text": "blurry, low quality, watermark, text"}},
  "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
  "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "ai-video-studio", "images": ["8", 0]}}
}`;

/** Latent sizes that fit SD-class models for each social aspect ratio. */
const ASPECT_SIZES: Record<string, { width: number; height: number }> = {
  '9:16': { width: 576, height: 1024 },
  '16:9': { width: 1024, height: 576 },
  '1:1': { width: 768, height: 768 },
  '4:5': { width: 768, height: 960 },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Escape prompt text so it stays a valid JSON string literal inside the template. */
function jsonEscape(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

interface ComfyOutputFile {
  filename: string;
  subfolder?: string;
  type?: string;
}

export async function generateWithComfyUi(
  request: AiVideoRequest,
  settings: AppSettings,
  outDir: string,
): Promise<GeneratedMedia> {
  const baseUrl = (settings.comfyUiUrl || 'http://127.0.0.1:8188').replace(/\/+$/, '');
  const template = settings.comfyUiWorkflow.trim() || DEFAULT_SD15_WORKFLOW;
  const size = ASPECT_SIZES[request.aspectRatio] ?? ASPECT_SIZES['9:16'];

  const workflowText = template
    .replaceAll('{{PROMPT}}', jsonEscape(request.prompt))
    .replaceAll('"{{WIDTH}}"', String(size.width))
    .replaceAll('"{{HEIGHT}}"', String(size.height))
    .replaceAll('"{{SEED}}"', String(Math.floor(Math.random() * 2 ** 31)))
    .replaceAll('{{WIDTH}}', String(size.width))
    .replaceAll('{{HEIGHT}}', String(size.height))
    .replaceAll('{{SEED}}', String(Math.floor(Math.random() * 2 ** 31)));

  let workflow: unknown;
  try {
    workflow = JSON.parse(workflowText);
  } catch {
    throw new Error('The ComfyUI workflow in Settings is not valid JSON. Re-export it from ComfyUI in API format.');
  }

  let queueResponse: Response;
  try {
    queueResponse = await fetch(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: 'ai-video-studio' }),
    });
  } catch {
    throw new Error(
      `Could not reach ComfyUI at ${baseUrl}. Start ComfyUI on this machine (it is free — see the README section "Free local AI"), then try again.`,
    );
  }
  if (!queueResponse.ok) {
    const body = await queueResponse.text();
    throw new Error(
      `ComfyUI rejected the workflow (${queueResponse.status}): ${body.slice(0, 500)}\n` +
        'Usually this means a model file referenced by the workflow is not installed.',
    );
  }
  const { prompt_id: promptId } = (await queueResponse.json()) as { prompt_id: string };

  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error('ComfyUI generation timed out.');
    await sleep(POLL_INTERVAL_MS);
    const historyResponse = await fetch(`${baseUrl}/history/${promptId}`);
    if (!historyResponse.ok) continue;
    const history = (await historyResponse.json()) as Record<string, any>;
    const entry = history[promptId];
    if (!entry) continue;

    if (entry.status?.status_str === 'error') {
      const messages = JSON.stringify(entry.status?.messages ?? []).slice(0, 600);
      throw new Error(`ComfyUI reported an error: ${messages}`);
    }

    const file = firstOutputFile(entry.outputs);
    if (file) {
      return downloadComfyOutput(baseUrl, file, outDir);
    }
    if (entry.status?.completed) {
      throw new Error('ComfyUI finished but produced no output file — add a SaveImage/video output node to the workflow.');
    }
  }
}

function firstOutputFile(outputs: Record<string, any> | undefined): ComfyOutputFile | null {
  if (!outputs) return null;
  for (const nodeOutput of Object.values(outputs)) {
    for (const key of ['videos', 'gifs', 'images']) {
      const files = (nodeOutput as any)?.[key];
      if (Array.isArray(files) && files.length > 0 && files[0]?.filename) {
        return files[0] as ComfyOutputFile;
      }
    }
  }
  return null;
}

async function downloadComfyOutput(
  baseUrl: string,
  file: ComfyOutputFile,
  outDir: string,
): Promise<GeneratedMedia> {
  const params = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder ?? '',
    type: file.type ?? 'output',
  });
  const response = await fetch(`${baseUrl}/view?${params.toString()}`);
  if (!response.ok) throw new Error(`Could not download the result from ComfyUI (${response.status}).`);
  const buffer = Buffer.from(await response.arrayBuffer());

  const ext = path.extname(file.filename).toLowerCase() || '.png';
  const fileName = `comfyui-${Date.now()}${ext}`;
  const filePath = path.join(outDir, fileName);
  await fs.promises.writeFile(filePath, buffer);

  const isVideo = ['.mp4', '.webm', '.mov', '.mkv'].includes(ext);
  const probe = isVideo ? await probeMedia(filePath) : { hasAudio: false, duration: 0 };
  return {
    filePath,
    src: mediaUrlFor(filePath),
    fileName,
    type: isVideo ? 'video' : 'image',
    duration: probe.duration,
    hasAudio: probe.hasAudio,
  };
}
