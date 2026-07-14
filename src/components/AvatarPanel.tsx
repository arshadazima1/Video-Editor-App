import { useState } from 'react';
import { bridge } from '../services/bridge';
import { useProjectStore } from '../store/projectStore';
import { newAssetId, loadAssetMetadata } from '../services/assets';
import type { AvatarListItem, AvatarProvider, AvatarVoice } from '../../shared/types';

export default function AvatarPanel() {
  const addAssets = useProjectStore((s) => s.addAssets);
  const addClipFromAsset = useProjectStore((s) => s.addClipFromAsset);
  const [provider, setProvider] = useState<AvatarProvider>('heygen');
  const [avatars, setAvatars] = useState<AvatarListItem[]>([]);
  const [voices, setVoices] = useState<AvatarVoice[]>([]);
  const [avatarId, setAvatarId] = useState('');
  const [voiceId, setVoiceId] = useState('');
  const [sourceImageUrl, setSourceImageUrl] = useState('');
  const [script, setScript] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingLists, setLoadingLists] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onLoadLists = async () => {
    setLoadingLists(true);
    setError(null);
    try {
      const [avatarList, voiceList] = await Promise.all([bridge.listAvatars(provider), bridge.listVoices(provider)]);
      setAvatars(avatarList);
      setVoices(voiceList);
      if (avatarList.length && !avatarId) setAvatarId(avatarList[0].id);
      if (voiceList.length && !voiceId) setVoiceId(voiceList[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingLists(false);
    }
  };

  const onGenerate = async () => {
    if (!script.trim() || busy) return;
    setBusy(true);
    setError(null);
    setStatus('Rendering avatar video… this can take a few minutes.');
    try {
      const media = await bridge.generateAvatarVideo({
        provider,
        script: script.trim(),
        avatarId,
        voiceId: voiceId || undefined,
        sourceImageUrl: sourceImageUrl.trim() || undefined,
        width: 720,
        height: 1280,
      });
      const meta = await loadAssetMetadata(media.src, media.type);
      const assetId = newAssetId();
      addAssets([
        {
          id: assetId,
          name: media.fileName,
          type: 'video',
          src: media.src,
          filePath: media.filePath,
          duration: media.duration > 0 ? media.duration : meta.duration,
          width: meta.width,
          height: meta.height,
          hasAudio: media.hasAudio,
          origin: 'avatar',
        },
      ]);
      addClipFromAsset(assetId);
      setStatus(`Done — "${media.fileName}" added to the timeline.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus(null);
    } finally {
      setBusy(false);
    }
  };

  const selectedAvatar = avatars.find((a) => a.id === avatarId);

  return (
    <div className="panel-body">
      <p className="hint">
        These providers are paid services. 🆓 Free alternative: generate narration in the 🎙 Voice tab and place a
        photo of your presenter over it on the timeline.
      </p>
      <label className="field">
        <span>Provider</span>
        <select value={provider} onChange={(e) => setProvider(e.target.value as AvatarProvider)}>
          <option value="heygen">HeyGen — stock &amp; custom avatars</option>
          <option value="did">D-ID — animate a photo</option>
        </select>
      </label>

      {provider === 'heygen' && (
        <>
          <button className="btn btn-block" onClick={onLoadLists} disabled={loadingLists}>
            {loadingLists ? 'Loading…' : '🔄 Load avatars & voices'}
          </button>
          <label className="field">
            <span>Avatar</span>
            <select value={avatarId} onChange={(e) => setAvatarId(e.target.value)}>
              {avatars.length === 0 && <option value="">— load avatars first —</option>}
              {avatars.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {selectedAvatar?.previewUrl && (
            <img className="avatar-preview" src={selectedAvatar.previewUrl} alt={selectedAvatar.name} />
          )}
          <label className="field">
            <span>Voice</span>
            <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              {voices.length === 0 && <option value="">— load voices first —</option>}
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.language ? ` (${v.language})` : ''}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {provider === 'did' && (
        <label className="field">
          <span>Presenter photo URL</span>
          <input
            value={sourceImageUrl}
            onChange={(e) => setSourceImageUrl(e.target.value)}
            placeholder="https://…/portrait.jpg (public URL)"
          />
        </label>
      )}

      <label className="field">
        <span>Script (what the avatar says)</span>
        <textarea
          rows={5}
          value={script}
          onChange={(e) => setScript(e.target.value)}
          placeholder="Hey everyone! Today I'm showing you three tips to grow on Instagram…"
        />
      </label>

      <button
        className="btn btn-primary btn-block"
        onClick={onGenerate}
        disabled={busy || !script.trim() || (provider === 'heygen' && !avatarId) || (provider === 'did' && !sourceImageUrl.trim())}
      >
        {busy ? '⏳ Rendering…' : '🧑‍🎤 Generate avatar video'}
      </button>

      {status && <p className="hint hint-ok">{status}</p>}
      {error && <p className="hint hint-error">{error}</p>}
      <p className="hint">API keys are configured in Settings (⚙ in the top bar).</p>
    </div>
  );
}
