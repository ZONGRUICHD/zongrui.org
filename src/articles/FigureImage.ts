import { mergeAttributes, Node } from '@tiptap/core'

const IMAGE_ALIGNS = new Set(['start', 'center', 'end'])
const IMAGE_WIDTHS = new Set([33, 50, 75, 100])

function imageAlign(value: unknown) {
  return typeof value === 'string' && IMAGE_ALIGNS.has(value) ? value : 'center'
}

function imageWidth(value: unknown) {
  const width = typeof value === 'number' ? value : Number(value)
  return IMAGE_WIDTHS.has(width) ? width : 100
}

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
      align: { default: 'center' },
      width: { default: 100 },
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
          align: imageAlign(node.getAttribute('data-align')),
          width: imageWidth(node.getAttribute('data-width')),
        }
      },
    }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'figure',
      {
        'data-figure-image': '',
        'data-align': imageAlign(HTMLAttributes.align),
        'data-width': String(imageWidth(HTMLAttributes.width)),
      },
      ['img', mergeAttributes({ loading: 'lazy', decoding: 'async' }, { src: HTMLAttributes.src, alt: HTMLAttributes.alt })],
      ['figcaption', {}, HTMLAttributes.caption || ''],
    ]
  },
})
