import { useState } from 'react';
import { FileText, ArrowRight, Moon, Sun } from 'lucide-react';

export default function UserModal({ onSubmit, theme, toggleTheme }) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="modal-overlay" data-theme={theme}>
      {/* Theme toggle in corner */}
      <button
        onClick={toggleTheme}
        className="modal-theme-btn"
        title="Toggle theme"
        type="button"
      >
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <div className="modal-card">
        <div className="modal-icon">
          <div className="modal-icon-ring">
            <FileText size={36} strokeWidth={1.5} />
          </div>
        </div>

        <h2 className="modal-title">Custom Doc</h2>
        <p className="modal-subtitle">Enter your name to start collaborating in real-time</p>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="modal-input-wrapper">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="modal-input"
              autoFocus
              maxLength={20}
              autoComplete="off"
              spellCheck="false"
            />
          </div>
          <button type="submit" className="modal-submit" disabled={!name.trim()}>
            <span>Get started</span>
            <ArrowRight size={18} />
          </button>
        </form>

        <p className="modal-footer">Up to 3 collaborators · End-to-end real-time sync</p>
      </div>
    </div>
  );
}
