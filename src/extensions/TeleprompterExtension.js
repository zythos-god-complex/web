import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const teleprompterKey = new PluginKey('teleprompter');

/**
 * Line-based teleprompter highlighting.
 * Highlights the entire current line/paragraph the user is reading.
 */
export const TeleprompterExtension = Extension.create({
  name: 'teleprompter',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: teleprompterKey,
        state: {
          init() { return DecorationSet.empty; },
          apply(tr, old) {
            const meta = tr.getMeta(teleprompterKey);
            if (meta !== undefined) return meta;
            return tr.docChanged ? old.map(tr.mapping, tr.doc) : old;
          },
        },
        props: {
          decorations(state) {
            return teleprompterKey.getState(state);
          },
        },
      }),
    ];
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Extract lines (paragraphs/blocks) with their text and word lists */
export function extractLines(doc) {
  const lines = [];
  doc.forEach((node, offset) => {
    const text = node.textContent.trim();
    if (!text) return; // skip empty lines
    const words = text
      .split(/\s+/)
      .map((w) => w.toLowerCase().replace(/[^a-z0-9]/gi, ''))
      .filter((w) => w.length > 0);
    if (words.length === 0) return;
    lines.push({
      from: offset,
      to: offset + node.nodeSize,
      text,
      words,
      wordSet: new Set(words),
    });
  });
  return lines;
}

/** Highlight a specific line with a node decoration */
export function setLineHighlight(view, lineIdx, lines) {
  if (!view || view.isDestroyed) return;
  const { state } = view;
  const decorations = [];

  const line = lines[lineIdx];
  if (line && line.from < state.doc.content.size && line.to <= state.doc.content.size) {
    decorations.push(Decoration.node(line.from, line.to, { class: 'tp-current-line' }));
  }

  try {
    const decoSet = DecorationSet.create(state.doc, decorations);
    view.dispatch(state.tr.setMeta(teleprompterKey, decoSet));
  } catch (_) {}
}

/** Clear all decorations */
export function clearHighlight(view) {
  if (!view || view.isDestroyed) return;
  try {
    view.dispatch(view.state.tr.setMeta(teleprompterKey, DecorationSet.empty));
  } catch (_) {}
}

/** Scroll so the line is visible */
export function scrollToLine(view, from) {
  if (!view || view.isDestroyed) return;
  try {
    const coords = view.coordsAtPos(from + 1);
    const container = document.querySelector('.document-container');
    if (!container || !coords) return;
    const rect = container.getBoundingClientRect();
    if (coords.top < rect.top + 30 || coords.top > rect.top + rect.height * 0.5) {
      container.scrollTo({
        top: container.scrollTop + (coords.top - rect.top - 60),
        behavior: 'smooth',
      });
    }
  } catch (_) {}
}

export default TeleprompterExtension;
