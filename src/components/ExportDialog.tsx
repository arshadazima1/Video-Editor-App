import { useEffect, useState } from 'react';
import { useProjectStore, projectDuration } from '../store/projectStore';
import { bridge } from '../services/bridge';
import { EXPORT_PRESETS, type ExportProgress } from '../../shared/types';

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const [presetId, setPresetId] = useState(EXPORT_PRESETS[0].id);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  useEffect(() => bridge.onExportProgress(setProgress), []);

  const missingFiles = project.clips.some((c) => {
    if (c.text !== undefined) return false;
    const asset = project.assets.find((a) => a.id === c.assetId);
    return asset ? !asset.filePath : false;
  });

  const onExport = async () => {
    setError(null);
    const preset = EXPORT_PRESETS.find((p) => p.id === presetId)!;
    const safeName = project.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'export';
    const path = await bridge.openSaveDialog(`${safeName}.mp4`);
    if (!path) return;
    setRunning(true);
    setProgress({ ratio: 0, message: 'Starting ffmpeg…', done: false });
    try {
      const result = await bridge.startExport({ project, preset, outputPath: path });
      setProgress(result);
      if (result.error) {
        setError(result.error);
      } else {
        setOutputPath(result.outputPath ?? path);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={running ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export video</h2>
        <p className="hint">Timeline duration: {projectDuration(project).toFixed(1)}s</p>

        <label className="field">
          <span>Preset</span>
          <select value={presetId} onChange={(e) => setPresetId(e.target.value)} disabled={running}>
            {EXPORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>

        {missingFiles && (
          <p className="hint hint-error">
            Some clips use browser-imported files without a disk path and will be skipped. Import media inside the
            desktop app for full export support.
          </p>
        )}

        {progress && !progress.done && (
          <div className="progress-wrap">
            <div className="progress-bar" style={{ width: `${Math.round(progress.ratio * 100)}%` }} />
            <span className="progress-text">{progress.message}</span>
          </div>
        )}

        {outputPath && (
          <p className="hint hint-ok">
            ✅ Exported to {outputPath}{' '}
            <button className="btn btn-small" onClick={() => bridge.revealInFolder(outputPath)}>
              Show in folder
            </button>
          </p>
        )}
        {error && <pre className="hint hint-error error-log">{error}</pre>}

        <div className="modal-actions">
          {running ? (
            <button className="btn btn-danger" onClick={() => bridge.cancelExport()}>
              Cancel export
            </button>
          ) : (
            <>
              <button className="btn" onClick={onClose}>
                Close
              </button>
              <button className="btn btn-primary" onClick={onExport} disabled={project.clips.length === 0}>
                🎬 Export MP4
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
