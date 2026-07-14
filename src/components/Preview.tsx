import { useEffect, useRef, useState } from 'react';
import { useProjectStore, projectDuration } from '../store/projectStore';
import { formatTime } from '../services/assets';
import type { Clip, MediaAsset, Project } from '../../shared/types';

function clipOpacity(clip: Clip, playhead: number): number {
  const t = playhead - clip.start;
  let opacity = clip.effects.opacity;
  if (clip.fadeIn > 0) opacity *= Math.min(1, t / clip.fadeIn);
  if (clip.fadeOut > 0) opacity *= Math.min(1, (clip.duration - t) / clip.fadeOut);
  return Math.max(0, Math.min(1, opacity));
}

function cssFilter(clip: Clip): string {
  const fx = clip.effects;
  return `brightness(${1 + fx.brightness}) contrast(${fx.contrast}) saturate(${fx.saturation})`;
}

/** Keeps a <video>/<audio> element in sync with the timeline playhead. */
function MediaLayer({
  clip,
  asset,
  playhead,
  playing,
  muted,
  hidden,
}: {
  clip: Clip;
  asset: MediaAsset;
  playhead: number;
  playing: boolean;
  muted: boolean;
  hidden?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wanted = playhead - clip.start + clip.inPoint;
    if (Math.abs(el.currentTime - wanted) > 0.2) {
      el.currentTime = wanted;
    }
    if (playing && el.paused) void el.play().catch(() => undefined);
    if (!playing && !el.paused) el.pause();
  }, [playhead, playing, clip.start, clip.inPoint]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.min(1, Math.max(0, clip.volume));
    el.muted = muted || clip.volume <= 0;
  }, [clip.volume, muted]);

  if (asset.type === 'image') {
    return (
      <img
        className="layer"
        src={asset.src}
        alt=""
        style={{ opacity: clipOpacity(clip, playhead), filter: cssFilter(clip) }}
      />
    );
  }
  if (asset.type === 'audio') {
    return <audio ref={ref as never} src={asset.src} preload="auto" />;
  }
  return (
    <video
      ref={ref}
      className="layer"
      src={asset.src}
      preload="auto"
      playsInline
      style={hidden ? { display: 'none' } : { opacity: clipOpacity(clip, playhead), filter: cssFilter(clip) }}
    />
  );
}

function activeClips(project: Project, playhead: number): Clip[] {
  return project.clips.filter((c) => playhead >= c.start && playhead < c.start + c.duration);
}

export default function Preview() {
  const project = useProjectStore((s) => s.project);
  const playhead = useProjectStore((s) => s.playhead);
  const playing = useProjectStore((s) => s.playing);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.2);

  const duration = projectDuration(project);

  // Playback clock.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const state = useProjectStore.getState();
      const total = projectDuration(state.project);
      const next = state.playhead + dt;
      if (next >= total) {
        state.setPlayhead(total);
        state.setPlaying(false);
        return;
      }
      state.setPlayhead(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Fit the stage into the container.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const pad = 24;
      const s = Math.min(
        (el.clientWidth - pad) / project.width,
        (el.clientHeight - pad) / project.height,
      );
      setScale(Math.max(0.05, s));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [project.width, project.height]);

  const trackIndex = new Map(project.tracks.map((t, i) => [t.id, i]));
  const mutedTracks = new Set(project.tracks.filter((t) => t.muted).map((t) => t.id));
  const active = activeClips(project, playhead);

  // Visual layers: bottom track first so upper tracks paint on top.
  const visual = active
    .filter((c) => {
      const asset = project.assets.find((a) => a.id === c.assetId);
      return asset && (asset.type === 'video' || asset.type === 'image');
    })
    .sort((a, b) => (trackIndex.get(b.trackId) ?? 0) - (trackIndex.get(a.trackId) ?? 0));

  const audible = active.filter((c) => {
    const asset = project.assets.find((a) => a.id === c.assetId);
    return asset?.type === 'audio';
  });

  const texts = active
    .filter((c) => c.text !== undefined)
    .sort((a, b) => (trackIndex.get(b.trackId) ?? 0) - (trackIndex.get(a.trackId) ?? 0));

  return (
    <div className="preview-wrap">
      <div className="preview-stage-container" ref={containerRef}>
        <div
          className="preview-stage"
          style={{
            width: project.width * scale,
            height: project.height * scale,
          }}
        >
          {visual.map((clip) => {
            const asset = project.assets.find((a) => a.id === clip.assetId)!;
            return (
              <MediaLayer
                key={clip.id}
                clip={clip}
                asset={asset}
                playhead={playhead}
                playing={playing}
                muted={mutedTracks.has(clip.trackId)}
              />
            );
          })}
          {audible.map((clip) => {
            const asset = project.assets.find((a) => a.id === clip.assetId)!;
            return (
              <MediaLayer
                key={clip.id}
                clip={clip}
                asset={asset}
                playhead={playhead}
                playing={playing}
                muted={mutedTracks.has(clip.trackId)}
                hidden
              />
            );
          })}
          {texts.map((clip) => {
            const style = clip.textStyle ?? { fontSize: 72, color: '#fff', x: 0.5, y: 0.5 };
            return (
              <div
                key={clip.id}
                className="layer-text"
                style={{
                  left: `${style.x * 100}%`,
                  top: `${style.y * 100}%`,
                  fontSize: style.fontSize * scale,
                  color: style.color,
                  opacity: clipOpacity(clip, playhead),
                  background: style.background ? `${style.background}99` : 'transparent',
                }}
              >
                {clip.text}
              </div>
            );
          })}
        </div>
      </div>
      <div className="transport">
        <button className="btn" onClick={() => setPlayhead(0)} title="Go to start">
          ⏮
        </button>
        <button className="btn btn-primary" onClick={() => setPlaying(!playing)} title="Play / pause (Space)">
          {playing ? '⏸' : '▶'}
        </button>
        <span className="time-display">
          {formatTime(playhead)} / {formatTime(duration)}
        </span>
        <span className="format-display">
          {project.width}×{project.height} · {project.fps} fps
        </span>
      </div>
    </div>
  );
}
