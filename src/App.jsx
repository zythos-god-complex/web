import { useState, useEffect, useCallback, useMemo } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import EditorView from './components/EditorView';
import UserModal from './components/UserModal';
import { getColorForUser } from './utils/colors';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4444';
const ROOM_NAME = 'custom-doc-main';

export default function App() {
  const [user, setUser] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('cd-theme') || 'light');
  const [fontSize, setFontSize] = useState(() => parseInt(localStorage.getItem('cd-fontSize'), 10) || 16);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);

  // ─── Y.js document & WebSocket provider (singleton) ──────────────────────
  const { ydoc, provider } = useMemo(() => {
    const doc = new Y.Doc();
    const prov = new WebsocketProvider(WS_URL, ROOM_NAME, doc, {
      connect: true,
      maxBackoffTime: 10000,
    });
    return { ydoc: doc, provider: prov };
  }, []);

  useEffect(() => {
    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [provider, ydoc]);

  // ─── Connection status ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = ({ status }) => setConnected(status === 'connected');
    provider.on('status', handler);
    return () => provider.off('status', handler);
  }, [provider]);

  // ─── Awareness: publish local user & track remote users ───────────────────
  useEffect(() => {
    if (!user) return;

    const c = getColorForUser(user.name);
    provider.awareness.setLocalStateField('user', {
      name: user.name,
      color: c.color,
      colorLight: c.light,
    });

    const refresh = () => {
      const list = [];
      provider.awareness.getStates().forEach((state, clientId) => {
        if (state.user) list.push({ ...state.user, clientId });
      });
      setOnlineUsers(list);
    };

    provider.awareness.on('change', refresh);
    refresh();
    return () => provider.awareness.off('change', refresh);
  }, [provider, user]);

  // ─── Theme persistence ────────────────────────────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cd-theme', theme);
  }, [theme]);

  // ─── Font size persistence ────────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem('cd-fontSize', String(fontSize));
  }, [fontSize]);

  // ─── Restore saved user ───────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('cd-userName');
    if (saved) setUser({ name: saved });
  }, []);

  // ─── Callbacks ────────────────────────────────────────────────────────────
  const handleSetUser = useCallback((name) => {
    localStorage.setItem('cd-userName', name);
    setUser({ name });
  }, []);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);
  const increaseFontSize = useCallback(() => setFontSize((s) => Math.min(s + 2, 32)), []);
  const decreaseFontSize = useCallback(() => setFontSize((s) => Math.max(s - 2, 10)), []);
  const changeName = useCallback(() => {
    localStorage.removeItem('cd-userName');
    setUser(null);
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────
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
      onlineUsers={onlineUsers}
      onChangeName={changeName}
    />
  );
}
