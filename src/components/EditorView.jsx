import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import CommentHighlight from '../extensions/CommentHighlight';
import { TeleprompterExtension } from '../extensions/TeleprompterExtension';
import useTeleprompter from '../hooks/useTeleprompter';
import Toolbar from './Toolbar';
import Header from './Header';
import TeleprompterPanel from './TeleprompterPanel';
import { getColorForUser } from '../utils/colors';

const lowlight = createLowlight(common);

export default function EditorView({
  ydoc, provider, user, theme, toggleTheme,
  fontSize, increaseFontSize, decreaseFontSize,
  connected, onlineCount, desktopOnline, isElectron,
}) {
  const [controlsVisible, setControlsVisible] = useState(true);
  const [opacity, setOpacity] = useState(1);
  const [clickThrough, setClickThrough] = useState(false);
  const [resizeOn, setResizeOn] = useState(false);
  const [tpOpen, setTpOpen] = useState(false);

  const lastLocalToggle = useRef(0);
  const userColor = getColorForUser(user.name);

  // Make html/body transparent in electron
  useEffect(() => {
    if (isElectron) {
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
    }
  }, [isElectron]);

  // Strip tooltips in electron (no hover popups)
  useEffect(() => {
    if (!isElectron) return;
    const strip = () => {
      document.querySelectorAll('[title]').forEach((el) => {
        el.removeAttribute('title');
      });
    };
    strip();
    const obs = new MutationObserver(strip);
    obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
    return () => obs.disconnect();
  }, [isElectron]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ history: false, codeBlock: false }),
      CodeBlockLowlight.configure({ lowlight }),
      CommentHighlight,
      TeleprompterExtension,
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

  // ─── Teleprompter hook ──────────────────────────────────────────────────
  const tp = useTeleprompter(editor);

  // ─── Y.js shared controls map ────────────────────────────────────────────
  const controlsMap = useMemo(() => ydoc.getMap('controls'), [ydoc]);

  useEffect(() => {
    const handler = () => {
      if (Date.now() - lastLocalToggle.current < 300) return;
      const ct = controlsMap.get('clickThrough') ?? false;
      setClickThrough(ct);
      if (isElectron && window.electronAPI) {
        window.electronAPI.setClickThrough(ct);
      }
    };
    controlsMap.observe(handler);
    return () => controlsMap.unobserve(handler);
  }, [controlsMap, isElectron]);

  useEffect(() => {
    if (!isElectron || !window.electronAPI?.onClickThroughChanged) return;
    const cleanup = window.electronAPI.onClickThroughChanged((enabled) => {
      lastLocalToggle.current = Date.now();
      setClickThrough(enabled);
      controlsMap.set('clickThrough', enabled);
    });
    return cleanup;
  }, [controlsMap, isElectron]);

  // ─── Opacity (exe only — CSS variable) ───────────────────────────────────
  const handleOpacityChange = useCallback((val) => {
    setOpacity(val);
    document.documentElement.style.setProperty('--app-alpha', val.toString());
  }, []);

  // ─── Resize toggle ──────────────────────────────────────────────────────
  const toggleResize = useCallback(() => {
    const next = !resizeOn;
    setResizeOn(next);
    if (isElectron && window.electronAPI) {
      window.electronAPI.setResizable(next);
    }
  }, [resizeOn, isElectron]);

  // ─── Click-through (web → exe) ──────────────────────────────────────────
  const toggleClickThrough = useCallback(() => {
    const current = controlsMap.get('clickThrough') ?? false;
    controlsMap.set('clickThrough', !current);
  }, [controlsMap]);

  const toggleControls = useCallback(() => setControlsVisible((v) => !v), []);
  const toggleTeleprompter = useCallback(() => {
    setTpOpen((v) => {
      if (v && tp.isActive) tp.stop(); // close panel → stop
      return !v;
    });
  }, [tp]);

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
            resizeOn={resizeOn}
            toggleResize={toggleResize}
            tpOpen={tpOpen}
            toggleTeleprompter={toggleTeleprompter}
            tpActive={tp.isActive}
          />
          <Toolbar editor={editor} />
          {isElectron && tpOpen && (
            <TeleprompterPanel
              devices={tp.devices}
              selectedDevice={tp.selectedDevice}
              onDeviceChange={tp.setSelectedDevice}
              onRefresh={tp.refreshDevices}
              isActive={tp.isActive}
              onStart={tp.start}
              onStop={tp.stop}
              status={tp.status}
              progress={tp.progress}
              log={tp.log}
            />
          )}
        </>
      )}

      {!controlsVisible && (
        <button className="expand-btn" onClick={toggleControls} title="Show controls">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      )}

      <div className="document-container">
        <div className="document-page" style={{ fontSize: `${fontSize}px` }}>
          <EditorContent editor={editor} />
        </div>
      </div>

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
