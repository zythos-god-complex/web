import { Sun, Moon, Plus, Minus, Wifi, WifiOff, UserCircle } from 'lucide-react';

export default function Header({
  theme,
  toggleTheme,
  fontSize,
  increaseFontSize,
  decreaseFontSize,
  connected,
  onlineUsers,
  userName,
  onChangeName,
}) {
  return (
    <header className="header">
      {/* ── Left: branding ─────────────────────────────────────── */}
      <div className="header-left">
        <div className="logo" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect x="6" y="2" width="20" height="28" rx="3" fill="var(--accent)" />
            <rect x="10" y="8" width="12" height="2" rx="1" fill="#fff" />
            <rect x="10" y="13" width="12" height="2" rx="1" fill="#fff" />
            <rect x="10" y="18" width="8" height="2" rx="1" fill="#fff" />
          </svg>
        </div>
        <h1 className="app-title">Custom Doc</h1>
      </div>

      {/* ── Center: font size control ─────────────────────────── */}
      <div className="header-center">
        <div className="font-size-controls">
          <button
            onClick={decreaseFontSize}
            className="control-btn"
            title="Decrease font size (min 10px)"
            disabled={fontSize <= 10}
          >
            <Minus size={14} />
          </button>
          <span className="font-size-display">{fontSize}px</span>
          <button
            onClick={increaseFontSize}
            className="control-btn"
            title="Increase font size (max 32px)"
            disabled={fontSize >= 32}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* ── Right: users, status, theme, profile ──────────────── */}
      <div className="header-right">
        {/* Online user avatars */}
        <div className="online-users">
          {onlineUsers.map((u, i) => (
            <div
              key={u.clientId}
              className="user-avatar"
              style={{
                backgroundColor: u.color,
                zIndex: onlineUsers.length - i,
              }}
              title={u.name}
            >
              {u.name.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>

        {/* Connection badge */}
        <div
          className={`connection-status ${connected ? 'connected' : 'disconnected'}`}
          title={connected ? 'Real-time sync active' : 'Reconnecting…'}
        >
          {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="connection-label">{connected ? 'Live' : 'Offline'}</span>
        </div>

        {/* Theme toggle */}
        <button onClick={toggleTheme} className="control-btn theme-toggle" title="Toggle dark / light mode">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        {/* User profile */}
        <button onClick={onChangeName} className="control-btn user-btn" title={`Signed in as ${userName} — click to change`}>
          <UserCircle size={20} />
        </button>
      </div>
    </header>
  );
}
