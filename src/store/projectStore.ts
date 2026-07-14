import { create } from 'zustand';
import type { Clip, ClipEffects, MediaAsset, Project, TextStyle, Track } from '../../shared/types';

export const DEFAULT_EFFECTS: ClipEffects = { brightness: 0, contrast: 1, saturation: 1, opacity: 1 };
export const DEFAULT_TEXT_STYLE: TextStyle = { fontSize: 72, color: '#ffffff', x: 0.5, y: 0.5 };
const DEFAULT_IMAGE_DURATION = 5;
const MIN_CLIP_DURATION = 0.1;

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function defaultTracks(): Track[] {
  // Order is top-first: text above overlay video above main video above audio.
  return [
    { id: uid(), kind: 'text', name: 'T1' },
    { id: uid(), kind: 'video', name: 'V2' },
    { id: uid(), kind: 'video', name: 'V1' },
    { id: uid(), kind: 'audio', name: 'A1' },
  ];
}

function defaultProject(): Project {
  return {
    name: 'Untitled Reel',
    width: 1080,
    height: 1920,
    fps: 30,
    tracks: defaultTracks(),
    clips: [],
    assets: [],
  };
}

export function projectDuration(project: Project): number {
  return project.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
}

function trackEnd(project: Project, trackId: string): number {
  return project.clips
    .filter((c) => c.trackId === trackId)
    .reduce((max, c) => Math.max(max, c.start + c.duration), 0);
}

interface ProjectState {
  project: Project;
  playhead: number;
  playing: boolean;
  selectedClipId: string | null;
  pixelsPerSecond: number;

  newProject: () => void;
  setProjectFormat: (width: number, height: number) => void;
  setProjectName: (name: string) => void;

  addAssets: (assets: MediaAsset[]) => void;
  removeAsset: (assetId: string) => void;

  addClipFromAsset: (assetId: string, opts?: { trackId?: string; at?: number }) => void;
  addTextClip: (at?: number) => void;
  moveClip: (clipId: string, start: number, trackId?: string) => void;
  resizeClip: (clipId: string, edge: 'left' | 'right', deltaSeconds: number) => void;
  splitClipAtPlayhead: () => void;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  updateEffects: (clipId: string, patch: Partial<ClipEffects>) => void;
  updateTextStyle: (clipId: string, patch: Partial<TextStyle>) => void;
  toggleTrackMute: (trackId: string) => void;

  setPlayhead: (seconds: number) => void;
  setPlaying: (playing: boolean) => void;
  selectClip: (clipId: string | null) => void;
  setPixelsPerSecond: (pps: number) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: defaultProject(),
  playhead: 0,
  playing: false,
  selectedClipId: null,
  pixelsPerSecond: 60,

  newProject: () =>
    set({ project: defaultProject(), playhead: 0, playing: false, selectedClipId: null }),

  setProjectFormat: (width, height) =>
    set((s) => ({ project: { ...s.project, width, height } })),

  setProjectName: (name) => set((s) => ({ project: { ...s.project, name } })),

  addAssets: (assets) =>
    set((s) => ({ project: { ...s.project, assets: [...s.project.assets, ...assets] } })),

  removeAsset: (assetId) =>
    set((s) => ({
      project: {
        ...s.project,
        assets: s.project.assets.filter((a) => a.id !== assetId),
        clips: s.project.clips.filter((c) => c.assetId !== assetId),
      },
      selectedClipId: null,
    })),

  addClipFromAsset: (assetId, opts) => {
    const { project } = get();
    const asset = project.assets.find((a) => a.id === assetId);
    if (!asset) return;

    const wantKind = asset.type === 'audio' ? 'audio' : 'video';
    let track = opts?.trackId ? project.tracks.find((t) => t.id === opts.trackId) : undefined;
    if (!track || track.kind !== wantKind) {
      // Prefer the bottom-most matching track (V1 rather than V2).
      track = [...project.tracks].reverse().find((t) => t.kind === wantKind);
    }
    if (!track) return;

    const duration = asset.type === 'image' ? DEFAULT_IMAGE_DURATION : Math.max(asset.duration, MIN_CLIP_DURATION);
    const clip: Clip = {
      id: uid(),
      trackId: track.id,
      assetId: asset.id,
      start: opts?.at ?? trackEnd(project, track.id),
      duration,
      inPoint: 0,
      volume: 1,
      effects: { ...DEFAULT_EFFECTS },
      fadeIn: 0,
      fadeOut: 0,
    };
    set((s) => ({
      project: { ...s.project, clips: [...s.project.clips, clip] },
      selectedClipId: clip.id,
    }));
  },

  addTextClip: (at) => {
    const { project, playhead } = get();
    const track = project.tracks.find((t) => t.kind === 'text');
    if (!track) return;
    const clip: Clip = {
      id: uid(),
      trackId: track.id,
      start: at ?? playhead,
      duration: 4,
      inPoint: 0,
      volume: 0,
      effects: { ...DEFAULT_EFFECTS },
      fadeIn: 0,
      fadeOut: 0,
      text: 'Your text here',
      textStyle: { ...DEFAULT_TEXT_STYLE },
    };
    set((s) => ({
      project: { ...s.project, clips: [...s.project.clips, clip] },
      selectedClipId: clip.id,
    }));
  },

  moveClip: (clipId, start, trackId) =>
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) => {
          if (c.id !== clipId) return c;
          let nextTrackId = c.trackId;
          if (trackId) {
            const currentKind = s.project.tracks.find((t) => t.id === c.trackId)?.kind;
            const targetKind = s.project.tracks.find((t) => t.id === trackId)?.kind;
            if (currentKind && currentKind === targetKind) nextTrackId = trackId;
          }
          return { ...c, start: Math.max(0, start), trackId: nextTrackId };
        }),
      },
    })),

  resizeClip: (clipId, edge, deltaSeconds) =>
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) => {
          if (c.id !== clipId) return c;
          const asset = c.assetId ? s.project.assets.find((a) => a.id === c.assetId) : undefined;
          const stretchy = !asset || asset.type === 'image'; // text & images have no source bounds
          if (edge === 'right') {
            let duration = c.duration + deltaSeconds;
            if (!stretchy && asset) duration = Math.min(duration, asset.duration - c.inPoint);
            return { ...c, duration: Math.max(MIN_CLIP_DURATION, duration) };
          }
          // Left edge: shift start, consume/restore head of the source.
          let delta = deltaSeconds;
          delta = Math.max(delta, -c.start); // cannot move before 0
          delta = Math.min(delta, c.duration - MIN_CLIP_DURATION);
          if (!stretchy) delta = Math.max(delta, -c.inPoint); // cannot reveal before the source start
          return {
            ...c,
            start: c.start + delta,
            duration: c.duration - delta,
            inPoint: stretchy ? c.inPoint : c.inPoint + delta,
          };
        }),
      },
    })),

  splitClipAtPlayhead: () => {
    const { project, playhead, selectedClipId } = get();
    const clip = project.clips.find(
      (c) =>
        (selectedClipId ? c.id === selectedClipId : true) &&
        playhead > c.start + MIN_CLIP_DURATION &&
        playhead < c.start + c.duration - MIN_CLIP_DURATION,
    );
    if (!clip) return;
    const offset = playhead - clip.start;
    const left: Clip = { ...clip, duration: offset, fadeOut: 0 };
    const right: Clip = {
      ...clip,
      id: uid(),
      start: playhead,
      duration: clip.duration - offset,
      inPoint: clip.inPoint + offset,
      fadeIn: 0,
    };
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.flatMap((c) => (c.id === clip.id ? [left, right] : [c])),
      },
      selectedClipId: right.id,
    }));
  },

  removeClip: (clipId) =>
    set((s) => ({
      project: { ...s.project, clips: s.project.clips.filter((c) => c.id !== clipId) },
      selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
    })),

  updateClip: (clipId, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
      },
    })),

  updateEffects: (clipId, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) =>
          c.id === clipId ? { ...c, effects: { ...c.effects, ...patch } } : c,
        ),
      },
    })),

  updateTextStyle: (clipId, patch) =>
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) =>
          c.id === clipId
            ? { ...c, textStyle: { ...(c.textStyle ?? DEFAULT_TEXT_STYLE), ...patch } }
            : c,
        ),
      },
    })),

  toggleTrackMute: (trackId) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
      },
    })),

  setPlayhead: (seconds) => set({ playhead: Math.max(0, seconds) }),
  setPlaying: (playing) => set({ playing }),
  selectClip: (clipId) => set({ selectedClipId: clipId }),
  setPixelsPerSecond: (pps) => set({ pixelsPerSecond: Math.min(240, Math.max(12, pps)) }),
}));
