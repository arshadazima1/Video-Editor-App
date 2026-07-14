import { useState } from 'react';
import { bridge } from '../services/bridge';
import { useProjectStore } from '../store/projectStore';
import { newAssetId, loadAssetMetadata } from '../services/assets';
import type { AiVideoProvider } from '../../shared/types';

const PROVIDERS: Array<{ id: AiVideoProvider; label: string; kind: 'video' | 'image'; defaultModel: string }> = [
  { id: 'replicate', label: 'Replicate — text to video (Wan, Kling, …)', kind: 'video', defaultModel: 'wan-video/wan-2.2-t2v-fast' },
  { id: 'runway', label: 'Runway — text to video', kind: 'video', defaultModel: 'veo3' },
  { id: 'stability', label: 'Stability AI — text to image', kind: 'image', defaultModel: '' },
];

const ASPECTS = [
  { id: '9:16', label: '9:16 — Reel / Story' },
  { id: '1:1', label: '1:1 — Square' },
  { id: '4:5', label: '4:5 — Facebook post' },
  { id: '16:9', label: '16:9 — Landscape' },
];

export default function AIGeneratePanel() {
  const addAssets = useProjectStore((s) => s.addAssets);
  const addClipFromAsset = useProjectStore((s) => s.addClipFromAsset);
  const [provider, setProvider] = useState<AiVideoProvider>('replicate');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('');
  const [aspect, setAspect] = useState('9:16');
  const [duration, setDuration] = useState(8);
  const [addToTimeline, setAddToTimeline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const providerInfo = PROVIDERS.find((p) => p.id === provider)!;

  const onGenerate = async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    setStatus('Generating… this can take a few minutes.');
    try {
      const media = await bridge.generateAiVideo({
        provider,
        prompt: prompt.trim(),
        aspectRatio: aspect,
        model: model.trim() || undefined,
        durationSeconds: duration,
      });
      const meta = await loadAssetMetadata(media.src, media.type);
      const assetId = newAssetId();
      addAssets([
        {
          id: assetId,
          name: media.fileName,
          type: media.type,
          src: media.src,
          filePath: media.filePath,
          duration: media.duration > 0 ? media.duration : meta.duration,
          width: meta.width,
          height: meta.height,
          hasAudio: media.hasAudio,
          origin: 'ai',
        },
      ]);
      if (addToTimeline) addClipFromAsset(assetId);
      setStatus(`Done — "${media.fileName}" added to your media library.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-body">
      <label className="field">
        <span>Provider</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value as AiVideoProvider)}>
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      {providerInfo.defaultModel && (
        <label className="field">
          <span>Model (optional)</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={providerInfo.defaultModel} />
        </label>
      )}

      <label className="field">
        <span>Prompt</span>
        <textarea
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A golden retriever surfing a wave at sunset, cinematic, slow motion…"
        />
      </label>

      <label className="field">
        <span>Aspect ratio</span>
        <select value={aspect} onChange={(e) => setAspect(e.target.value)}>
          {ASPECTS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>

      {provider === 'runway' && (
        <label className="field">
          <span>Duration (seconds)</span>
          <input
            type="number"
            min={4}
            max={16}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value) || 8)}
          />
        </label>
      )}

      <label className="field-check">
        <input type="checkbox" checked={addToTimeline} onChange={(e) => setAddToTimeline(e.target.checked)} />
        <span>Add result to timeline automatically</span>
      </label>

      <button className="btn btn-primary btn-block" onClick={onGenerate} disabled={busy || !prompt.trim()}>
        {busy ? '⏳ Generating…' : `✨ Generate ${providerInfo.kind}`}
      </button>

      {status && <p className="hint hint-ok">{status}</p>}
      {error && <p className="hint hint-error">{error}</p>}
      <p className="hint">API keys are configured in Settings (⚙ in the top bar).</p>
    </div>
  );
}
