import { useEffect, useState } from 'react';
import { bridge } from '../services/bridge';
import { DEFAULT_SETTINGS, type AppSettings } from '../../shared/types';

const KEY_FIELDS: Array<{ key: keyof AppSettings; label: string; hint: string }> = [
  { key: 'replicateApiKey', label: 'Replicate API key', hint: 'replicate.com/account/api-tokens — text-to-video (Wan, Kling, Hunyuan…)' },
  { key: 'runwayApiKey', label: 'Runway API key', hint: 'dev.runwayml.com — text-to-video' },
  { key: 'stabilityApiKey', label: 'Stability AI API key', hint: 'platform.stability.ai — text-to-image' },
  { key: 'heygenApiKey', label: 'HeyGen API key', hint: 'app.heygen.com → Settings → API — avatar videos' },
  { key: 'didApiKey', label: 'D-ID API key', hint: 'studio.d-id.com → API — animate a photo' },
];

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_SETTINGS });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void bridge.getSettings().then(setSettings);
  }, []);

  const onSave = async () => {
    await bridge.setSettings(settings);
    setSaved(true);
    setTimeout(onClose, 600);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <p className="hint">
          Keys are stored locally on this machine only and sent directly to each provider. Every provider is optional —
          add the ones you plan to use.
        </p>
        {KEY_FIELDS.map(({ key, label, hint }) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input
              type="password"
              value={settings[key]}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
              placeholder="paste key…"
            />
            <small>{hint}</small>
          </label>
        ))}
        <label className="field">
          <span>Font file for exported text</span>
          <input
            value={settings.drawTextFontFile}
            onChange={(e) => setSettings({ ...settings, drawTextFontFile: e.target.value })}
          />
          <small>Any .ttf on disk, e.g. C:/Windows/Fonts/arialbd.ttf</small>
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={onSave}>
            {saved ? '✅ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
