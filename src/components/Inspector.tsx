import { useProjectStore } from '../store/projectStore';
import { formatTime } from '../services/assets';

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="field field-slider">
      <span>
        {label} <em>{value.toFixed(2)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export default function Inspector() {
  const project = useProjectStore((s) => s.project);
  const selectedClipId = useProjectStore((s) => s.selectedClipId);
  const updateClip = useProjectStore((s) => s.updateClip);
  const updateEffects = useProjectStore((s) => s.updateEffects);
  const updateTextStyle = useProjectStore((s) => s.updateTextStyle);
  const removeClip = useProjectStore((s) => s.removeClip);

  const clip = project.clips.find((c) => c.id === selectedClipId);
  if (!clip) {
    return (
      <div className="panel-body">
        <p className="hint">Select a clip on the timeline to edit its properties, effects and fades.</p>
      </div>
    );
  }

  const asset = project.assets.find((a) => a.id === clip.assetId);
  const isText = clip.text !== undefined;
  const hasAudio = asset ? asset.type === 'audio' || (asset.type === 'video' && asset.hasAudio) : false;
  const style = clip.textStyle ?? { fontSize: 72, color: '#ffffff', x: 0.5, y: 0.5 };

  return (
    <div className="panel-body">
      <h3 className="inspector-title">{isText ? 'Text clip' : asset?.name ?? 'Clip'}</h3>
      <p className="hint">
        {formatTime(clip.start)} → {formatTime(clip.start + clip.duration)} ({clip.duration.toFixed(2)}s)
      </p>

      {isText && (
        <>
          <label className="field">
            <span>Text</span>
            <textarea rows={3} value={clip.text} onChange={(e) => updateClip(clip.id, { text: e.target.value })} />
          </label>
          <Slider
            label="Font size"
            value={style.fontSize}
            min={16}
            max={240}
            step={2}
            onChange={(v) => updateTextStyle(clip.id, { fontSize: v })}
          />
          <label className="field field-inline">
            <span>Color</span>
            <input
              type="color"
              value={style.color}
              onChange={(e) => updateTextStyle(clip.id, { color: e.target.value })}
            />
          </label>
          <Slider label="Position X" value={style.x} min={0} max={1} step={0.01} onChange={(v) => updateTextStyle(clip.id, { x: v })} />
          <Slider label="Position Y" value={style.y} min={0} max={1} step={0.01} onChange={(v) => updateTextStyle(clip.id, { y: v })} />
          <label className="field-check">
            <input
              type="checkbox"
              checked={!!style.background}
              onChange={(e) => updateTextStyle(clip.id, { background: e.target.checked ? '#000000' : undefined })}
            />
            <span>Background box</span>
          </label>
        </>
      )}

      {!isText && (
        <>
          <h4 className="inspector-section">Effects</h4>
          <Slider
            label="Brightness"
            value={clip.effects.brightness}
            min={-1}
            max={1}
            step={0.02}
            onChange={(v) => updateEffects(clip.id, { brightness: v })}
          />
          <Slider
            label="Contrast"
            value={clip.effects.contrast}
            min={0}
            max={2}
            step={0.02}
            onChange={(v) => updateEffects(clip.id, { contrast: v })}
          />
          <Slider
            label="Saturation"
            value={clip.effects.saturation}
            min={0}
            max={3}
            step={0.02}
            onChange={(v) => updateEffects(clip.id, { saturation: v })}
          />
          <Slider
            label="Opacity"
            value={clip.effects.opacity}
            min={0}
            max={1}
            step={0.02}
            onChange={(v) => updateEffects(clip.id, { opacity: v })}
          />
        </>
      )}

      <h4 className="inspector-section">Fades</h4>
      <Slider
        label="Fade in (s)"
        value={clip.fadeIn}
        min={0}
        max={Math.min(5, clip.duration)}
        step={0.1}
        onChange={(v) => updateClip(clip.id, { fadeIn: v })}
      />
      <Slider
        label="Fade out (s)"
        value={clip.fadeOut}
        min={0}
        max={Math.min(5, clip.duration)}
        step={0.1}
        onChange={(v) => updateClip(clip.id, { fadeOut: v })}
      />

      {hasAudio && (
        <>
          <h4 className="inspector-section">Audio</h4>
          <Slider
            label="Volume"
            value={clip.volume}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => updateClip(clip.id, { volume: v })}
          />
        </>
      )}

      <button className="btn btn-danger btn-block" onClick={() => removeClip(clip.id)}>
        🗑 Delete clip
      </button>
    </div>
  );
}
