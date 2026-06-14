import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Highlighter,
  Code2,
  RemoveFormatting,
} from 'lucide-react';

function ToolBtn({ onClick, isActive = false, icon: Icon, title }) {
  return (
    <button
      className={`toolbar-btn${isActive ? ' is-active' : ''}`}
      onClick={onClick}
      title={title}
      type="button"
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}

export default function Toolbar({ editor }) {
  if (!editor) return null;

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting toolbar">
      {/* ── Text style ─────────────────────────────────────────── */}
      <div className="toolbar-group">
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive('bold')}
          icon={Bold}
          title="Bold (Ctrl+B)"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive('italic')}
          icon={Italic}
          title="Italic (Ctrl+I)"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive('underline')}
          icon={Underline}
          title="Underline (Ctrl+U)"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive('strike')}
          icon={Strikethrough}
          title="Strikethrough"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleHighlight().run()}
          isActive={editor.isActive('highlight')}
          icon={Highlighter}
          title="Highlight"
        />
      </div>

      <div className="toolbar-divider" />

      {/* ── Headings ───────────────────────────────────────────── */}
      <div className="toolbar-group">
        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          isActive={editor.isActive('heading', { level: 1 })}
          icon={Heading1}
          title="Heading 1"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          isActive={editor.isActive('heading', { level: 2 })}
          icon={Heading2}
          title="Heading 2"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          isActive={editor.isActive('heading', { level: 3 })}
          icon={Heading3}
          title="Heading 3"
        />
      </div>

      <div className="toolbar-divider" />

      {/* ── Lists & Blocks ─────────────────────────────────────── */}
      <div className="toolbar-group">
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive('bulletList')}
          icon={List}
          title="Bullet List"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive('orderedList')}
          icon={ListOrdered}
          title="Ordered List"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          isActive={editor.isActive('blockquote')}
          icon={Quote}
          title="Blockquote"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          icon={Minus}
          title="Horizontal Rule"
        />
      </div>

      <div className="toolbar-divider" />

      {/* ── Code ───────────────────────────────────────────────── */}
      <div className="toolbar-group">
        <ToolBtn
          onClick={() => editor.chain().focus().toggleCode().run()}
          isActive={editor.isActive('code')}
          icon={Code}
          title="Inline Code"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          isActive={editor.isActive('codeBlock')}
          icon={Code2}
          title="Code Block"
        />
      </div>

      <div className="toolbar-divider" />

      {/* ── Alignment ──────────────────────────────────────────── */}
      <div className="toolbar-group">
        <ToolBtn
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          isActive={editor.isActive({ textAlign: 'left' })}
          icon={AlignLeft}
          title="Align Left"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          isActive={editor.isActive({ textAlign: 'center' })}
          icon={AlignCenter}
          title="Align Center"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          isActive={editor.isActive({ textAlign: 'right' })}
          icon={AlignRight}
          title="Align Right"
        />
        <ToolBtn
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          isActive={editor.isActive({ textAlign: 'justify' })}
          icon={AlignJustify}
          title="Justify"
        />
      </div>

      <div className="toolbar-divider" />

      {/* ── Clear ──────────────────────────────────────────────── */}
      <div className="toolbar-group">
        <ToolBtn
          onClick={() => editor.chain().focus().clearNodes().unsetAllMarks().run()}
          icon={RemoveFormatting}
          title="Clear Formatting"
        />
      </div>
    </div>
  );
}
