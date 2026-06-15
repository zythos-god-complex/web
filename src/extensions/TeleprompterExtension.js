import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const teleprompterKey = new PluginKey('teleprompter');

/**
 * Tiptap extension that manages teleprompter word highlighting via ProseMirror decorations.
 * - .tp-current  → green glow on the word being spoken
 * - .tp-read     → dimmed text for already-read words
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

/** Extract every word from the document with its position */
export function extractWords(doc) {
  const words = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      const regex = /[^\s]+/g;
      let match;
      while ((match = regex.exec(node.text)) !== null) {
        const raw = match[0];
        const normalized = raw.toLowerCase().replace(/[^a-z0-9]/gi, '');
        if (normalized.length > 0) {
          words.push({ raw, normalized, from: pos + match.index, to: pos + match.index + raw.length });
        }
      }
    }
  });
  return words;
}

/** Update decorations: highlight current word + dim read words */
export function setHighlight(view, currentIdx, allWords) {
  if (!view || view.isDestroyed) return;
  const { state } = view;
  const decorations = [];

  // Dim already-read words
  for (let i = 0; i < currentIdx; i++) {
    const w = allWords[i];
    if (w && w.from < state.doc.content.size && w.to <= state.doc.content.size) {
      decorations.push(Decoration.inline(w.from, w.to, { class: 'tp-read' }));
    }
  }

  // Highlight current word
  const cur = allWords[currentIdx];
  if (cur && cur.from < state.doc.content.size && cur.to <= state.doc.content.size) {
    decorations.push(Decoration.inline(cur.from, cur.to, { class: 'tp-current' }));
  }

  try {
    const decoSet = DecorationSet.create(state.doc, decorations);
    view.dispatch(state.tr.setMeta(teleprompterKey, decoSet));
  } catch (_) { /* ignore position errors during concurrent edits */ }
}

/** Clear all teleprompter decorations */
export function clearHighlight(view) {
  if (!view || view.isDestroyed) return;
  try {
    view.dispatch(view.state.tr.setMeta(teleprompterKey, DecorationSet.empty));
  } catch (_) {}
}

/** Scroll the document container so the current word is visible */
export function scrollToWord(view, pos) {
  if (!view || view.isDestroyed) return;
  try {
    const coords = view.coordsAtPos(pos);
    const container = document.querySelector('.document-container');
    if (!container || !coords) return;
    const rect = container.getBoundingClientRect();
    // Keep the word in the top 1/3
    if (coords.top < rect.top + 40 || coords.top > rect.top + rect.height * 0.6) {
      container.scrollTo({ top: container.scrollTop + (coords.top - rect.top - rect.height * 0.3), behavior: 'smooth' });
    }
  } catch (_) {}
}

export default TeleprompterExtension;
