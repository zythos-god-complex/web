import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * Highlights any paragraph/line whose text starts with # (even after whitespace/indentation).
 * Applies the CSS class 'comment-line' so it can be styled (e.g. red text).
 */
export const CommentHighlight = Extension.create({
  name: 'commentHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('commentHighlight'),
        state: {
          init(_, { doc }) {
            return buildDecorations(doc);
          },
          apply(tr, oldState) {
            return tr.docChanged ? buildDecorations(tr.doc) : oldState;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

function buildDecorations(doc) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (node.isTextblock) {
      const text = node.textContent;
      // Match lines starting with # (optionally preceded by whitespace)
      if (/^\s*#/.test(text)) {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: 'comment-line',
          })
        );
      }
    }
  });
  return DecorationSet.create(doc, decorations);
}

export default CommentHighlight;
