import { useProjectStore } from '../store/projectStore';
import { bridge } from '../services/bridge';

const FORMATS = [
  { id: '1080x1920', label: '📱 Reel / Story 9:16', width: 1080, height: 1920 },
  { id: '1080x1350', label: '📘 Facebook 4:5', width: 1080, height: 1350 },
  { id: '1080x1080', label: '⬛ Square 1:1', width: 1080, height: 1080 },
  { id: '1920x1080', label: '🖥 Landscape 16:9', width: 1920, height: 1080 },
];

export default function TopBar({
  onOpenExport,
  onOpenSettings,
}: {
  onOpenExport: () => void;
  onOpenSettings: () => void;
}) {
  const project = useProjectStore((s) => s.project);
  const setProjectName = useProjectStore((s) => s.setProjectName);
  const setProjectFormat = useProjectStore((s) => s.setProjectFormat);
  const newProject = useProjectStore((s) => s.newProject);

  const currentFormat = `${project.width}x${project.height}`;

  return (
    <header className="topbar">
      <span className="logo">🎬 AI Video Studio</span>
      <input
        className="project-name"
        value={project.name}
        onChange={(e) => setProjectName(e.target.value)}
        spellCheck={false}
      />
      <select
        value={FORMATS.some((f) => f.id === currentFormat) ? currentFormat : FORMATS[0].id}
        onChange={(e) => {
          const format = FORMATS.find((f) => f.id === e.target.value);
          if (format) setProjectFormat(format.width, format.height);
        }}
        title="Canvas format"
      >
        {FORMATS.map((f) => (
          <option key={f.id} value={f.id}>
            {f.label}
          </option>
        ))}
      </select>
      <span className="spacer" />
      {!bridge.isElectron && <span className="badge badge-warn">Browser preview — run “npm start” for export & AI</span>}
      <button
        className="btn"
        onClick={() => {
          if (window.confirm('Start a new project? Unsaved work will be lost.')) newProject();
        }}
      >
        New
      </button>
      <button className="btn" onClick={onOpenSettings} title="API keys & settings">
        ⚙
      </button>
      <button className="btn btn-primary" onClick={onOpenExport}>
        ⬆ Export
      </button>
    </header>
  );
}
