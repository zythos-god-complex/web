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
  ydoc,
  provider,
  user,
  theme,
  toggleTheme,
  fontSize,
  increaseFontSize,
  decreaseFontSize,
  connected,
  onlineUsers,
  onChangeName,
}) {
  const userColor = getColorForUser(user.name);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        history: false, // disabled — Y.js handles undo via CRDT
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      Placeholder.configure({
        placeholder: 'Start typing your document…',
      }),
      Collaboration.configure({
        document: ydoc,
      }),
      CollaborationCursor.configure({
        provider,
        user: {
          name: user.name,
          color: userColor.color,
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'editor-content',
        spellcheck: 'true',
      },
    },
  });

  return (
    <div className="app" data-theme={theme}>
      <Header
        theme={theme}
        toggleTheme={toggleTheme}
        fontSize={fontSize}
        increaseFontSize={increaseFontSize}
        decreaseFontSize={decreaseFontSize}
        connected={connected}
        onlineUsers={onlineUsers}
        userName={user.name}
        onChangeName={onChangeName}
      />
      <Toolbar editor={editor} />
      <div className="document-container">
        <div className="document-page" style={{ fontSize: `${fontSize}px` }}>
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
