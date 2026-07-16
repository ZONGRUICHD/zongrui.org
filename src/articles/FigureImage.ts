import { mergeAttributes, Node } from '@tiptap/core'

export const FigureImage = Node.create({
  name: 'figureImage',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      caption: { default: '' },
    }
  },

  parseHTML() {
    return [{
      tag: 'figure[data-figure-image]',
      getAttrs: (node) => {
        if (!(node instanceof HTMLElement)) return false
        const image = node.querySelector('img')
        return {
          src: image?.getAttribute('src'),
          alt: image?.getAttribute('alt') ?? '',
          caption: node.querySelector('figcaption')?.textContent ?? '',
        }
      },
    }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'figure',
      { 'data-figure-image': '' },
      ['img', mergeAttributes({ loading: 'lazy', decoding: 'async' }, { src: HTMLAttributes.src, alt: HTMLAttributes.alt })],
      ['figcaption', {}, HTMLAttributes.caption || ''],
    ]
  },
})
