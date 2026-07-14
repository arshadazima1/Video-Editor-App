import { useRef } from 'react';
import { useProjectStore, projectDuration } from '../store/projectStore';
import { ASSET_DRAG_TYPE } from './MediaLibrary';
import { formatTime } from '../services/assets';
import type { Clip, Track } from '../../shared/types';

const TRACK_HEIGHT = 52;
const LABEL_WIDTH = 72;
const SNAP_SECONDS = 0.05;

function snap(seconds: number): number {
  return Math.max(0, Math.round(seconds / SNAP_SECONDS) * SNAP_SECONDS);
}

interface DragState {
  mode: 'move' | 'trim-left' | 'trim-right';
  clipId: string;
  startX: number;
  startY: number;
  originalStart: number;
  originalTrackIndex: number;
  lastDelta: number;
}

export default function Timeline() {
  const project = useProjectStore((s) => s.project);
  const playhead = useProjectStore((s) => s.playhead);
  const playing = useProjectStore((s) => s.playing);
  const pps = useProjectStore((s) => s.pixelsPerSecond);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const setPlayhead = useProjectStore((s) => s.setPlayhead);
  const setPlaying = useProjectStore((s) => s.setPlaying);
  const setPps = useProjectStore((s) => s.setPixelsPerSecond);
  const selectClip = useProjectStore((s) => s.selectClip);
  const moveClip = useProjectStore((s) => s.moveClip);
  const resizeClip = useProjectStore((s) => s.resizeClip);
  const removeClip = useProjectStore((s) => s.removeClip);
  const splitClipAtPlayhead = useProjectStore((s) => s.splitClipAtPlayhead);
  const addTextClip = useProjectStore((s) => s.addTextClip);
  const toggleTrackMute = useProjectStore((s) => s.toggleTrackMute);
  const addClipFromAsset = useProjectStore((s) => s.addClipFromAsset);

  const lanesRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const duration = projectDuration(project);
  const timelineWidth = Math.max(600, (duration + 20) * pps);

  const timeAtClientX = (clientX: number): number => {
    const lanes = lanesRef.current;
    if (!lanes) return 0;
    const rect = lanes.getBoundingClientRect();
    return Math.max(0, (clientX - rect.left + lanes.scrollLeft) / pps);
  };

  const trackIndexAtClientY = (clientY: number): number => {
    const lanes = lanesRef.current;
    if (!lanes) return 0;
    const rect = lanes.getBoundingClientRect();
    const idx = Math.floor((clientY - rect.top + lanes.scrollTop - RULER_HEIGHT) / TRACK_HEIGHT);
    return Math.min(project.tracks.length - 1, Math.max(0, idx));
  };

  const beginDrag = (e: React.PointerEvent, clip: Clip, mode: DragState['mode']) => {
    e.stopPropagation();
    selectClip(clip.id);
    dragRef.current = {
      mode,
      clipId: clip.id,
      startX: e.clientX,
      startY: e.clientY,
      originalStart: clip.start,
      originalTrackIndex: project.tracks.findIndex((t) => t.id === clip.trackId),
      lastDelta: 0,
    };
    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaSeconds = (ev.clientX - drag.startX) / pps;
      if (drag.mode === 'move') {
        const targetIdx = trackIndexAtClientY(ev.clientY);
        const targetTrack = project.tracks[targetIdx];
        moveClip(drag.clipId, snap(drag.originalStart + deltaSeconds), targetTrack?.id);
      } else {
        const stepDelta = deltaSeconds - drag.lastDelta;
        drag.lastDelta = deltaSeconds;
        resizeClip(drag.clipId, drag.mode === 'trim-left' ? 'left' : 'right', stepDelta);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onLanesPointerDown = (e: React.PointerEvent) => {
    // Clicking empty lane space scrubs the playhead.
    if ((e.target as HTMLElement).closest('.clip')) return;
    const scrub = (ev: { clientX: number }) => setPlayhead(timeAtClientX(ev.clientX));
    scrub(e);
    selectClip(null);
    const onMove = (ev: PointerEvent) => scrub(ev);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onDrop = (e: React.DragEvent) => {
    const assetId = e.dataTransfer.getData(ASSET_DRAG_TYPE);
    if (!assetId) return;
    e.preventDefault();
    const at = snap(timeAtClientX(e.clientX));
    const track = project.tracks[trackIndexAtClientY(e.clientY)];
    addClipFromAsset(assetId, { trackId: track?.id, at });
  };

  // Ruler tick spacing that stays readable at any zoom.
  const tickEvery = pps >= 120 ? 0.5 : pps >= 60 ? 1 : pps >= 30 ? 2 : 5;
  const tickCount = Math.ceil((timelineWidth / pps) / tickEvery);

  return (
    <div className="timeline">
      <div className="timeline-toolbar">
        <button className="btn" onClick={() => setPlaying(!playing)}>
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button className="btn" onClick={splitClipAtPlayhead} title="Split selected clip at playhead">
          ✂ Split
        </button>
        <button
          className="btn"
          onClick={() => selectedClipId && removeClip(selectedClipId)}
          disabled={!selectedClipId}
        >
          🗑 Delete
        </button>
        <button className="btn" onClick={() => addTextClip()}>
          T Add text
        </button>
        <span className="spacer" />
        <span className="zoom-label">Zoom</span>
        <input
          type="range"
          min={12}
          max={240}
          value={pps}
          onChange={(e) => setPps(Number(e.target.value))}
        />
        <span className="time-display">{formatTime(playhead)}</span>
      </div>

      <div className="timeline-body">
        <div className="track-labels" style={{ width: LABEL_WIDTH }}>
          <div className="ruler-spacer" />
          {project.tracks.map((track: Track) => (
            <div key={track.id} className="track-label" style={{ height: TRACK_HEIGHT }}>
              <span>{track.name}</span>
              {track.kind !== 'text' && (
                <button
                  className={`btn btn-tiny ${track.muted ? 'btn-danger' : ''}`}
                  title={track.muted ? 'Unmute track' : 'Mute track'}
                  onClick={() => toggleTrackMute(track.id)}
                >
                  {track.muted ? '🔇' : '🔊'}
                </button>
              )}
            </div>
          ))}
        </div>

        <div
          className="lanes"
          ref={lanesRef}
          onPointerDown={onLanesPointerDown}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) e.preventDefault();
          }}
          onDrop={onDrop}
        >
          <div className="lanes-inner" style={{ width: timelineWidth }}>
            <div className="ruler">
              {Array.from({ length: tickCount }, (_, i) => {
                const t = i * tickEvery;
                return (
                  <div key={i} className="ruler-tick" style={{ left: t * pps }}>
                    {formatTime(t)}
                  </div>
                );
              })}
            </div>

            {project.tracks.map((track) => (
              <div key={track.id} className={`lane lane-${track.kind}`} style={{ height: TRACK_HEIGHT }}>
                {project.clips
                  .filter((c) => c.trackId === track.id)
                  .map((clip) => {
                    const asset = project.assets.find((a) => a.id === clip.assetId);
                    const label = clip.text !== undefined ? `T: ${clip.text}` : asset?.name ?? '?';
                    return (
                      <div
                        key={clip.id}
                        className={`clip clip-${track.kind} ${selectedClipId === clip.id ? 'clip-selected' : ''}`}
                        style={{ left: clip.start * pps, width: Math.max(8, clip.duration * pps) }}
                        onPointerDown={(e) => beginDrag(e, clip, 'move')}
                      >
                        <div
                          className="clip-handle clip-handle-left"
                          onPointerDown={(e) => beginDrag(e, clip, 'trim-left')}
                        />
                        <span className="clip-label">{label}</span>
                        <div
                          className="clip-handle clip-handle-right"
                          onPointerDown={(e) => beginDrag(e, clip, 'trim-right')}
                        />
                      </div>
                    );
                  })}
              </div>
            ))}

            <div className="playhead" style={{ left: playhead * pps }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const RULER_HEIGHT = 26;
