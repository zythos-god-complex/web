import {
  Sun, Moon, Plus, Minus, Wifi, WifiOff,
  ChevronUp, MousePointer2, Monitor, Maximize2,
} from 'lucide-react';

export default function Header({
  theme, toggleTheme, fontSize, increaseFontSize, decreaseFontSize,
  connected, onlineCount, desktopOnline, isElectron,
  opacity, onOpacityChange, clickThrough, toggleClickThrough, toggleControls,
  resizeOn, toggleResize,
}) {
  return (
    <header className={`header${isElectron ? ' draggable' : ''}`}>
      {/* ── Left: brand ──────────────────────────────────────── */}
      <div className="header-left">
        <span className="app-title">ZYTHOS</span>
      </div>

      {/* ── Center: font size + extras ───────────────────────── */}
      <div className="header-center">
        <div className="font-size-controls">
          <button onClick={decreaseFontSize} className="ctrl-btn" disabled={fontSize <= 10} title="Decrease">
            <Minus size={13} />
          </button>
          <span className="font-size-val">{fontSize}</span>
          <button onClick={increaseFontSize} className="ctrl-btn" disabled={fontSize >= 32} title="Increase">
            <Plus size={13} />
          </button>
        </div>

        {/* Opacity slider — exe only */}
        {isElectron && (
          <div className="opacity-wrap">
            <span className="opacity-icon">◐</span>
            <input
              type="range"
              min="8"
              max="100"
              value={Math.round(opacity * 100)}
              onChange={(e) => onOpacityChange(parseInt(e.target.value, 10) / 100)}
              className="opacity-slider"
              title={`Opacity ${Math.round(opacity * 100)}%`}
            />
          </div>
        )}

        {/* Resize toggle — exe only */}
        {isElectron && (
          <button
            onClick={toggleResize}
            className={`ctrl-btn resize-btn ${resizeOn ? 'active' : ''}`}
            title={resizeOn ? 'Resize ON — click to lock size' : 'Resize OFF — click to enable'}
          >
            <Maximize2 size={13} />
          </button>
        )}
      </div>

      {/* ── Right: status + actions ──────────────────────────── */}
      <div className="header-right">
        {/* Exe-only: shortcuts info */}
        {isElectron && (
          <div className="shortcuts-info">
            <span className="shortcut-tag" title="Close app">Ctrl+Q</span>
            <span className="shortcut-tag" title="Hide / Show">Ctrl+H</span>
            <span className="shortcut-tag" title="Click-through toggle">Ctrl+D</span>
          </div>
        )}

        {/* Web-only controls */}
        {!isElectron && (
          <>
            <div className={`conn-pill ${connected ? 'on' : 'off'}`}>
              {connected ? <Wifi size={12} /> : <WifiOff size={12} />}
              <span>{connected ? 'Live' : 'Offline'}</span>
              {connected && <span className="conn-count">{onlineCount}</span>}
            </div>

            <div className={`desk-status ${desktopOnline ? 'on' : 'off'}`} title={desktopOnline ? 'Desktop app is online' : 'Desktop app is offline'}>
              <Monitor size={13} />
              <span>{desktopOnline ? 'ON' : 'OFF'}</span>
            </div>

            <button
              onClick={toggleClickThrough}
              className={`ct-btn ${clickThrough ? 'active' : ''}`}
              title={clickThrough ? 'Exe is click-through — click to disable' : 'Make exe click-through'}
            >
              <MousePointer2 size={13} />
              <span>{clickThrough ? 'Clickable' : 'Locked'}</span>
            </button>
          </>
        )}

        {isElectron && clickThrough && (
          <div className="ct-badge">
            <span className="ct-dot-blink" />
            CT
          </div>
        )}

        <button onClick={toggleTheme} className="ctrl-btn theme-btn" title="Toggle theme">
          {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
        </button>

        <button onClick={toggleControls} className="ctrl-btn" title="Hide controls">
          <ChevronUp size={15} />
        </button>
      </div>
    </header>
  );
}
