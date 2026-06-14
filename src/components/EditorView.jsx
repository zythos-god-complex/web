import { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Toolbar from './Toolbar';
import Header from './Header';
import { getColorForUser } from '../utils/colors';

export default function EditorView({
  ydoc, provider, user, theme, toggleTheme,
  fontSize, increaseFontSize, decreaseFontSize,
  connected, onlineCount, desktopOnline, isElectron,
}) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [opacity, setOpacity] = useState(1);
  const [clickThrough, setClickThrough] = useState(false);

  const userColor = getColorForUser(user.name);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false }),
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: 'Start typing…' }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({
        provider,
        user: { name: user.name, color: userColor.color },
      }),
    ],
    editorProps: {
      attributes: { class: 'editor-content', spellcheck: 'true' },
    },
  });

  // ─── Y.js shared controls map (web ↔ exe sync) ───────────────────────────
  const controlsMap = ydoc.getMap('controls');

  // Observe click-through changes from the shared map
  useEffect(() => {
    const handler = () => {
      const ct = controlsMap.get('clickThrough') ?? false;
      setClickThrough(ct);
      // If we're in Electron, apply the change natively
      if (isElectron && window.electronAPI) {
        window.electronAPI.setClickThrough(ct);
      }
    };
    controlsMap.observe(handler);
    handler();
    return () => controlsMap.unobserve(handler);
  }, [controlsMap, isElectron]);

  // Exe: listen for Ctrl+D toggle from main process
  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onClickThroughChanged) return;
    window.electronAPI.onClickThroughChanged((enabled) => {
      setClickThrough(enabled);
      // Sync back to shared map so web users see the state
      controlsMap.set('clickThrough', enabled);
    });
  }, [controlsMap, isElectron]);

  // ─── Opacity (exe only, local) ───────────────────────────────────────────
  const handleOpacityChange = useCallback((val) => {
    setOpacity(val);
    if (isElectron && window.electronAPI) window.electronAPI.setOpacity(val);
  }, [isElectron]);

  // ─── Web user toggles click-through for exe ──────────────────────────────
  const toggleClickThrough = useCallback(() => {
    controlsMap.set('clickThrough', !controlsMap.get('clickThrough'));
  }, [controlsMap]);

  const toggleControls = useCallback(() => setControlsVisible((v) => !v), []);

  return (
    <div className={`app ${isElectron ? 'electron-mode' : 'web-mode'}`} data-theme={theme}>
      {controlsVisible && (
        <>
          <Header
            theme={theme}
            toggleTheme={toggleTheme}
            fontSize={fontSize}
            increaseFontSize={increaseFontSize}
            decreaseFontSize={decreaseFontSize}
            connected={connected}
            onlineCount={onlineCount}
            desktopOnline={desktopOnline}
            isElectron={isElectron}
            opacity={opacity}
            onOpacityChange={handleOpacityChange}
            clickThrough={clickThrough}
            toggleClickThrough={toggleClickThrough}
            toggleControls={toggleControls}
          />
          <Toolbar editor={editor} />
        </>
      )}

      {!controlsVisible && (
        <button className="expand-btn" onClick={toggleControls} title="Show controls (toolbar)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      )}

      <div className="document-container">
        <div className="document-page" style={{ fontSize: `${fontSize}px` }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      {/* Click-through floating indicator (exe only) */}
      {isElectron && clickThrough && (
        <div className="ct-floating">
          <span className="ct-pulse" />
          CLICK-THROUGH
          <span className="ct-shortcut">Ctrl+D to toggle</span>
        </div>
      )}
    </div>
  );
}
