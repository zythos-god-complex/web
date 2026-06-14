import { useState } from 'react';
import { ArrowRight, Moon, Sun } from 'lucide-react';

export default function UserModal({ onSubmit, theme, toggleTheme }) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className="modal-overlay" data-theme={theme}>
      <button onClick={toggleTheme} className="modal-theme-btn" title="Toggle theme" type="button">
        {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
      </button>

      <div className="modal-card">
        <h2 className="modal-title">ZYTHOS</h2>
        <p className="modal-subtitle">Enter your name to start collaborating</p>
        <form onSubmit={handleSubmit} className="modal-form">
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
          <button type="submit" className="modal-submit" disabled={!name.trim()}>
            <span>Enter</span>
            <ArrowRight size={18} />
          </button>
        </form>
      </div>
    </div>
  );
}
