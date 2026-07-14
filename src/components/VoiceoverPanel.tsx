import { useEffect, useState } from 'react';
import { bridge } from '../services/bridge';
import { useProjectStore } from '../store/projectStore';
import { newAssetId } from '../services/assets';
import type { TtsVoice } from '../../shared/types';

/**
 * Free offline voiceover: turns a script into narration audio using the
 * voices built into Windows. No API key, no internet, no cost.
 */
export default function VoiceoverPanel() {
  const addAssets = useProjectStore((s) => s.addAssets);
  const addClipFromAsset = useProjectStore((s) => s.addClipFromAsset);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [voiceName, setVoiceName] = useState('');
  const [rate, setRate] = useState(0);
  const [script, setScript] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void bridge
      .listTtsVoices()
      .then((list) => {
        setVoices(list);
        if (list.length) setVoiceName(list[0].name);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const onGenerate = async () => {
    if (!script.trim() || busy) return;
    setBusy(true);
    setError(null);
    setStatus('Generating voiceover…');
    try {
      const media = await bridge.generateTts({ text: script.trim(), voiceName, rate });
      const assetId = newAssetId();
      addAssets([
        {
          id: assetId,
          name: media.fileName,
          type: 'audio',
          src: media.src,
          filePath: media.filePath,
          duration: media.duration,
          hasAudio: true,
          origin: 'ai',
        },
      ]);
      addClipFromAsset(assetId);
      setStatus(`Done — "${media.fileName}" added to the audio track.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-body">
      <p className="hint">
        🆓 100% free &amp; offline — uses the voices built into Windows. Great for narrating Reels: write a script,
        generate, and it lands on the audio track.
      </p>

      <label className="field">
        <span>Voice</span>
        <select value={voiceName} onChange={(e) => setVoiceName(e.target.value)}>
          {voices.length === 0 && <option value="">— no voices found —</option>}
          {voices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name.replace(/^Microsoft\s+/, '').replace(/\s+Desktop$/, '')}
            </option>
          ))}
        </select>
      </label>

      <label className="field field-slider">
        <span>
          Speed <em>{rate > 0 ? `+${rate}` : rate}</em>
        </span>
        <input type="range" min={-10} max={10} step={1} value={rate} onChange={(e) => setRate(Number(e.target.value))} />
      </label>

      <label className="field">
        <span>Script</span>
        <textarea
          rows={6}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Welcome back to the channel! Today I'll show you three tips that will change how you edit videos…"
        />
      </label>

      <button className="btn btn-primary btn-block" onClick={onGenerate} disabled={busy || !script.trim()}>
        {busy ? '⏳ Generating…' : '🎙 Generate voiceover'}
      </button>

      {status && <p className="hint hint-ok">{status}</p>}
      {error && <p className="hint hint-error">{error}</p>}
      <p className="hint">
        Tip: for a free "avatar" look, import a photo of the presenter, stretch it over the voiceover on the timeline,
        and add a subtle fade-in. Windows → Settings → Time &amp; language → Speech lets you install more voices.
      </p>
    </div>
  );
}
