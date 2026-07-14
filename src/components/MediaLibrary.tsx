import { useState } from 'react';
import { useProjectStore } from '../store/projectStore';
import { bridge } from '../services/bridge';
import { importedFileToAsset, formatTime } from '../services/assets';
import type { MediaAsset } from '../../shared/types';

export const ASSET_DRAG_TYPE = 'application/x-asset-id';

function AssetThumb({ asset }: { asset: MediaAsset }) {
  if (asset.type === 'image') return <img className="asset-thumb" src={asset.src} alt="" />;
  if (asset.type === 'video') return <video className="asset-thumb" src={asset.src} preload="metadata" muted />;
  return <div className="asset-thumb asset-thumb-audio">♪</div>;
}

export default function MediaLibrary() {
  const assets = useProjectStore((s) => s.project.assets);
  const addAssets = useProjectStore((s) => s.addAssets);
  const removeAsset = useProjectStore((s) => s.removeAsset);
  const addClipFromAsset = useProjectStore((s) => s.addClipFromAsset);
  const [busy, setBusy] = useState(false);

  const onImport = async () => {
    setBusy(true);
    try {
      const files = await bridge.openImportDialog();
      const imported = await Promise.all(files.map(importedFileToAsset));
      if (imported.length) addAssets(imported);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-body">
      <button className="btn btn-primary btn-block" onClick={onImport} disabled={busy}>
        {busy ? 'Importing…' : '📁 Import Media'}
      </button>
      {assets.length === 0 && (
        <p className="hint">
          Import videos, images or music — or generate footage from the AI Video and Avatar tabs. Drag items onto the
          timeline below.
        </p>
      )}
      <div className="asset-grid">
        {assets.map((asset) => (
          <div
            key={asset.id}
            className="asset-card"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ASSET_DRAG_TYPE, asset.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            title={asset.name}
          >
            <AssetThumb asset={asset} />
            {asset.origin === 'ai' && <span className="badge badge-ai">AI</span>}
            {asset.origin === 'avatar' && <span className="badge badge-ai">Avatar</span>}
            <div className="asset-name">{asset.name}</div>
            <div className="asset-meta">
              {asset.type}
              {asset.duration > 0 ? ` · ${formatTime(asset.duration)}` : ''}
            </div>
            <div className="asset-actions">
              <button className="btn btn-small" onClick={() => addClipFromAsset(asset.id)}>
                + Timeline
              </button>
              <button className="btn btn-small btn-danger" onClick={() => removeAsset(asset.id)}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
