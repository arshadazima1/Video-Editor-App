// Types shared between the renderer (React UI) and the Electron main process.

export type AssetType = 'video' | 'image' | 'audio';

export interface MediaAsset {
  id: string;
  name: string;
  type: AssetType;
  /** URL usable by the renderer for preview (media:// in Electron, blob: in browser). */
  src: string;
  /** Absolute path on disk. Required for export; missing for browser-only blob imports. */
  filePath?: string;
  /** Duration in seconds. Images use a nominal duration and can be stretched freely. */
  duration: number;
  width?: number;
  height?: number;
  /** Whether the file contains an audio stream (probed in the main process). */
  hasAudio?: boolean;
  /** Where the asset came from, for badges in the media library. */
  origin?: 'import' | 'ai' | 'avatar';
}

export type TrackKind = 'video' | 'audio' | 'text';

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted?: boolean;
}

/** Values map directly onto ffmpeg's eq filter defaults. */
export interface ClipEffects {
  /** -1..1, default 0 */
  brightness: number;
  /** 0..2, default 1 */
  contrast: number;
  /** 0..3, default 1 */
  saturation: number;
  /** 0..1, default 1 */
  opacity: number;
}

export interface TextStyle {
  fontSize: number;
  color: string;
  /** 0..1 relative horizontal position of the text block centre. */
  x: number;
  /** 0..1 relative vertical position of the text block centre. */
  y: number;
  background?: string;
}

export interface Clip {
  id: string;
  trackId: string;
  /** Undefined for text clips. */
  assetId?: string;
  /** Timeline position in seconds. */
  start: number;
  /** Duration on the timeline in seconds. */
  duration: number;
  /** Offset into the source asset in seconds. */
  inPoint: number;
  /** 0..2 */
  volume: number;
  effects: ClipEffects;
  fadeIn: number;
  fadeOut: number;
  text?: string;
  textStyle?: TextStyle;
}

export interface Project {
  name: string;
  width: number;
  height: number;
  fps: number;
  tracks: Track[];
  clips: Clip[];
  assets: MediaAsset[];
}

export interface ExportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  fps: number;
  videoBitrate: string;
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { id: 'ig-reel', label: 'Instagram Reel / Story (1080x1920, 9:16)', width: 1080, height: 1920, fps: 30, videoBitrate: '8M' },
  { id: 'fb-post', label: 'Facebook Post (1080x1350, 4:5)', width: 1080, height: 1350, fps: 30, videoBitrate: '8M' },
  { id: 'square', label: 'Square Post (1080x1080, 1:1)', width: 1080, height: 1080, fps: 30, videoBitrate: '8M' },
  { id: 'landscape', label: 'Landscape / YouTube (1920x1080, 16:9)', width: 1920, height: 1080, fps: 30, videoBitrate: '10M' },
];

export interface ExportRequest {
  project: Project;
  preset: ExportPreset;
  outputPath: string;
}

export interface ExportProgress {
  /** 0..1, best effort parsed from ffmpeg output. */
  ratio: number;
  message: string;
  done: boolean;
  error?: string;
  outputPath?: string;
}

// ---------------------------------------------------------------------------
// AI generation
// ---------------------------------------------------------------------------

export type AiVideoProvider = 'comfyui' | 'replicate' | 'runway' | 'stability';
export type AvatarProvider = 'heygen' | 'did';

export interface AiVideoRequest {
  provider: AiVideoProvider;
  prompt: string;
  /** e.g. "9:16", "1:1", "16:9" */
  aspectRatio: string;
  /** Provider-specific model slug; adapters supply a sensible default. */
  model?: string;
  durationSeconds?: number;
}

export interface AvatarListItem {
  id: string;
  name: string;
  previewUrl?: string;
}

export interface AvatarVoice {
  id: string;
  name: string;
  language?: string;
}

export interface AvatarRequest {
  provider: AvatarProvider;
  script: string;
  avatarId: string;
  voiceId?: string;
  /** D-ID uses a photo URL as the avatar source. */
  sourceImageUrl?: string;
  width?: number;
  height?: number;
}

export interface GeneratedMedia {
  filePath: string;
  /** media:// URL the renderer can play directly. */
  src: string;
  fileName: string;
  type: AssetType;
  duration: number;
  hasAudio: boolean;
}

export interface AppSettings {
  replicateApiKey: string;
  runwayApiKey: string;
  stabilityApiKey: string;
  heygenApiKey: string;
  didApiKey: string;
  /** Font file used for burned-in text when exporting. */
  drawTextFontFile: string;
  /** Local ComfyUI server (free, runs models on your own GPU). */
  comfyUiUrl: string;
  /**
   * ComfyUI workflow in API format with {{PROMPT}}, {{WIDTH}}, {{HEIGHT}},
   * {{SEED}} placeholders. Empty = built-in Stable Diffusion text-to-image.
   */
  comfyUiWorkflow: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  replicateApiKey: '',
  runwayApiKey: '',
  stabilityApiKey: '',
  heygenApiKey: '',
  didApiKey: '',
  drawTextFontFile: 'C:/Windows/Fonts/arialbd.ttf',
  comfyUiUrl: 'http://127.0.0.1:8188',
  comfyUiWorkflow: '',
};

// ---------------------------------------------------------------------------
// Local text-to-speech (free, offline — Windows built-in voices)
// ---------------------------------------------------------------------------

export interface TtsVoice {
  name: string;
}

export interface TtsRequest {
  text: string;
  voiceName?: string;
  /** Speaking rate, -10 (slow) .. 10 (fast), 0 = normal. */
  rate?: number;
}
