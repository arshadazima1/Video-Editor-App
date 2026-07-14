import { useEffect, useState } from 'react';
import TopBar from './components/TopBar';
import MediaLibrary from './components/MediaLibrary';
import AIGeneratePanel from './components/AIGeneratePanel';
import AvatarPanel from './components/AvatarPanel';
import VoiceoverPanel from './components/VoiceoverPanel';
import Preview from './components/Preview';
import Timeline from './components/Timeline';
import Inspector from './components/Inspector';
import ExportDialog from './components/ExportDialog';
import SettingsDialog from './components/SettingsDialog';
import { useProjectStore } from './store/projectStore';

type LeftTab = 'media' | 'ai' | 'voice' | 'avatar';

export default function App() {
  const [tab, setTab] = useState<LeftTab>('media');
  const [showExport, setShowExport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Global shortcuts: space = play/pause, delete = remove clip, s = split.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;
      const s = useProjectStore.getState();
      if (e.code === 'Space') {
        e.preventDefault();
        s.setPlaying(!s.playing);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selectedClipId) s.removeClip(s.selectedClipId);
      } else if (e.key.toLowerCase() === 's') {
        s.splitClipAtPlayhead();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <TopBar onOpenExport={() => setShowExport(true)} onOpenSettings={() => setShowSettings(true)} />
      <div className="workspace">
        <aside className="left-panel">
          <nav className="tabs">
            <button className={tab === 'media' ? 'tab active' : 'tab'} onClick={() => setTab('media')}>
              Media
            </button>
            <button className={tab === 'ai' ? 'tab active' : 'tab'} onClick={() => setTab('ai')}>
              ✨ AI Video
            </button>
            <button className={tab === 'voice' ? 'tab active' : 'tab'} onClick={() => setTab('voice')}>
              🎙 Voice
            </button>
            <button className={tab === 'avatar' ? 'tab active' : 'tab'} onClick={() => setTab('avatar')}>
              🧑‍🎤 Avatar
            </button>
          </nav>
          {tab === 'media' && <MediaLibrary />}
          {tab === 'ai' && <AIGeneratePanel />}
          {tab === 'voice' && <VoiceoverPanel />}
          {tab === 'avatar' && <AvatarPanel />}
        </aside>
        <main className="center-panel">
          <Preview />
        </main>
        <aside className="right-panel">
          <h3 className="panel-title">Inspector</h3>
          <Inspector />
        </aside>
      </div>
      <Timeline />
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
