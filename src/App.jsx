import { useState, useEffect, useCallback, useMemo } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import EditorView from './components/EditorView';
import UserModal from './components/UserModal';
import { getColorForUser } from './utils/colors';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4444';
const ROOM_NAME = 'custom-doc-main';
const isElectron = !!window.electronAPI?.isElectron;

export default function App() {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('cd-theme') || (isElectron ? 'dark' : 'light'));
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('cd-fontSize'), 10) || 16);
  const [connected, setConnected] = useState(false);
  const [onlineCount, setOnlineCount] = useState(0);
  const [desktopOnline, setDesktopOnline] = useState(false);

  // ─── Y.js doc & provider ─────────────────────────────────────────────────
  const { ydoc, provider } = useMemo(() => {
    const doc = new Y.Doc();
    const prov = new WebsocketProvider(WS_URL, ROOM_NAME, doc, {
      connect: true,
      maxBackoffTime: 10000,
    });
    return { ydoc: doc, provider: prov };
  }, []);

  useEffect(() => () => { provider.destroy(); ydoc.destroy(); }, [provider, ydoc]);

  // ─── Connection status ────────────────────────────────────────────────────
  useEffect(() => {
    const h = ({ status }) => setConnected(status === 'connected');
    provider.on('status', h);
    return () => provider.off('status', h);
  }, [provider]);

  // ─── Awareness ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const c = getColorForUser(user.name);
    provider.awareness.setLocalStateField('user', {
      name: user.name,
      color: c.color,
      colorLight: c.light,
      isDesktop: isElectron,
    });

    const refresh = () => {
      let count = 0;
      let deskOnline = false;
      provider.awareness.getStates().forEach((state) => {
        if (state.user) {
          count++;
          if (state.user.isDesktop) deskOnline = true;
        }
      });
      setOnlineCount(count);
      setDesktopOnline(deskOnline);
    };

    provider.awareness.on('change', refresh);
    refresh();
    return () => provider.awareness.off('change', refresh);
  }, [provider, user]);

  // ─── Theme ────────────────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cd-theme', theme);
  }, [theme]);

  useEffect(() => { localStorage.setItem('cd-fontSize', String(fontSize)); }, [fontSize]);

  // ─── Restore user ─────────────────────────────────────────────────────────
  useEffect(() => {
    const s = localStorage.getItem('cd-userName');
    if (s) setUser({ name: s });
  }, []);

  const handleSetUser = useCallback((name) => {
    localStorage.setItem('cd-userName', name);
    setUser({ name });
  }, []);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);
  const increaseFontSize = useCallback(() => setFontSize((s) => Math.min(s + 2, 32)), []);
  const decreaseFontSize = useCallback(() => setFontSize((s) => Math.max(s - 2, 10)), []);

  if (!user) {
    return <UserModal onSubmit={handleSetUser} theme={theme} toggleTheme={toggleTheme} />;
  }

  return (
    <EditorView
      ydoc={ydoc}
      provider={provider}
      user={user}
      theme={theme}
      toggleTheme={toggleTheme}
      fontSize={fontSize}
      increaseFontSize={increaseFontSize}
      decreaseFontSize={decreaseFontSize}
      connected={connected}
      onlineCount={onlineCount}
      desktopOnline={desktopOnline}
      isElectron={isElectron}
    />
  );
}
