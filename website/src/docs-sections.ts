import type { UiStringKey } from '@app/i18n/ui-strings'
import { shortcutLabel, shiftLabel } from '@app/lib/platform-keys'
import type { TopicId } from './docs-topics'

export type DocSection = {
  id: string
  heading: UiStringKey
  body: UiStringKey
  params?: Record<string, string>
}

export function docSections(topic: TopicId): DocSection[] {
  const primary = shortcutLabel
  const sections: Record<TopicId, DocSection[]> = {
    examples: [
      {
        id: 'open-an-example',
        heading: 'site.docs.examples.openHeading',
        body: 'site.docs.examples.openBody',
        params: { present: primary('Enter'), overview: 'O', escape: 'Esc' }
      },
      {
        id: 'save-a-copy',
        heading: 'site.docs.examples.saveHeading',
        body: 'site.docs.examples.saveBody',
        params: { save: primary('S'), format: '.canvaslide' }
      },
      {
        id: 'direct-links',
        heading: 'site.docs.examples.linksHeading',
        body: 'site.docs.examples.linksBody',
        params: { query: '?example=one-order' }
      }
    ],
    media: [
      {
        id: 'images-and-pdf',
        heading: 'site.docs.media.filesHeading',
        body: 'site.docs.media.filesBody',
        params: { import: primary('I'), pdf: 'PDF' }
      },
      {
        id: 'figma',
        heading: 'site.docs.media.figmaHeading',
        body: 'site.docs.media.figmaBody',
        params: { figma: 'Figma', format: '.fig' }
      },
      {
        id: 'linked-video',
        heading: 'site.docs.media.videoHeading',
        body: 'site.docs.media.videoBody',
        params: { youtube: 'YouTube', vimeo: 'Vimeo', html: 'HTML' }
      }
    ],
    ai: [
      {
        id: 'create-with-ai',
        heading: 'site.docs.ai.promptHeading',
        body: 'site.docs.ai.promptBody'
      },
      {
        id: 'adapt-the-prompt',
        heading: 'site.docs.ai.customizeHeading',
        body: 'site.docs.ai.customizeBody'
      },
      {
        id: 'choose-output-files',
        heading: 'site.docs.ai.outputHeading',
        body: 'site.docs.ai.outputBody',
        params: { format: '.canvaslide', html: 'HTML', app: 'CanvaSlide' }
      },
      {
        id: 'open-the-result',
        heading: 'site.docs.ai.openHeading',
        body: 'site.docs.ai.openBody',
        params: { format: '.canvaslide', open: primary('O'), html: 'HTML' }
      }
    ],
    overview: [
      {
        id: 'the-canvas',
        heading: 'site.docs.overview.canvasHeading',
        body: 'site.docs.overview.canvasBody'
      },
      {
        id: 'presentation-frames',
        heading: 'site.docs.overview.frameHeading',
        body: 'site.docs.overview.frameBody'
      },
      {
        id: 'your-first-story',
        heading: 'site.docs.overview.startHeading',
        body: 'site.docs.overview.startBody'
      }
    ],
    installation: [
      {
        id: 'desktop-app',
        heading: 'site.docs.install.availableHeading',
        body: 'site.docs.install.availableBody'
      },
      {
        id: 'build-from-source',
        heading: 'site.docs.install.sourceHeading',
        body: 'site.docs.install.sourceBody',
        params: { node: 'Node.js', version: '22.20', packageManager: 'pnpm' }
      },
      {
        id: 'create-an-installer',
        heading: 'site.docs.install.buildHeading',
        body: 'site.docs.install.buildBody'
      }
    ],
    'quick-start': [
      {
        id: 'new-canvas',
        heading: 'site.docs.quick.newHeading',
        body: 'site.docs.quick.newBody',
        params: { shortcut: primary('N') }
      },
      {
        id: 'add-ideas',
        heading: 'site.docs.quick.addHeading',
        body: 'site.docs.quick.addBody',
        params: { text: 'T', rectangle: 'R', paste: primary('V') }
      },
      {
        id: 'add-frames',
        heading: 'site.docs.quick.framesHeading',
        body: 'site.docs.quick.framesBody',
        params: { key: 'F' }
      },
      {
        id: 'set-the-order',
        heading: 'site.docs.quick.orderHeading',
        body: 'site.docs.quick.orderBody'
      },
      {
        id: 'present',
        heading: 'site.docs.quick.presentHeading',
        body: 'site.docs.quick.presentBody',
        params: { shortcut: primary('Enter'), next: '→ / Space', previous: '←', escape: 'Esc' }
      },
      {
        id: 'save',
        heading: 'site.docs.quick.saveHeading',
        body: 'site.docs.quick.saveBody',
        params: { shortcut: primary('S'), format: '.canvaslide' }
      }
    ],
    canvas: [
      {
        id: 'pan',
        heading: 'site.docs.canvas.panHeading',
        body: 'site.docs.canvas.panBody',
        params: { space: 'Space', hand: 'H' }
      },
      {
        id: 'zoom',
        heading: 'site.docs.canvas.zoomHeading',
        body: 'site.docs.canvas.zoomBody',
        params: { zoomIn: primary('+'), zoomOut: primary('−'), reset: primary('0') }
      },
      {
        id: 'overview',
        heading: 'site.docs.canvas.findHeading',
        body: 'site.docs.canvas.findBody',
        params: { fit: `${shiftLabel()}1` }
      }
    ],
    editing: [
      {
        id: 'elements',
        heading: 'site.docs.edit.textHeading',
        body: 'site.docs.edit.textBody',
        params: { text: 'T', rectangle: 'R', ellipse: 'O', diamond: 'D', paste: primary('V') }
      },
      {
        id: 'arrange',
        heading: 'site.docs.edit.arrangeHeading',
        body: 'site.docs.edit.arrangeBody',
        params: { select: 'V', shift: 'Shift' }
      },
      {
        id: 'connectors',
        heading: 'site.docs.edit.connectHeading',
        body: 'site.docs.edit.connectBody',
        params: { key: 'L' }
      },
      {
        id: 'duplicate-and-undo',
        heading: 'site.docs.edit.undoHeading',
        body: 'site.docs.edit.undoBody',
        params: {
          duplicate: primary('D'),
          copy: primary('C'),
          paste: primary('V'),
          undo: primary('Z')
        }
      }
    ],
    frames: [
      {
        id: 'make-a-frame',
        heading: 'site.docs.frames.makeHeading',
        body: 'site.docs.frames.makeBody',
        params: { key: 'F' }
      },
      {
        id: 'detail-frames',
        heading: 'site.docs.frames.detailHeading',
        body: 'site.docs.frames.detailBody',
        params: { format: 'HTML' }
      },
      {
        id: 'sequence',
        heading: 'site.docs.frames.orderHeading',
        body: 'site.docs.frames.orderBody'
      },
      {
        id: 'whole-story',
        heading: 'site.docs.frames.overviewHeading',
        body: 'site.docs.frames.overviewBody'
      },
      {
        id: 'slideshow',
        heading: 'site.docs.frames.presentHeading',
        body: 'site.docs.frames.presentBody',
        params: { start: primary('Enter'), next: '→ / Space', previous: '←', escape: 'Esc' }
      },
      {
        id: 'transition-timing',
        heading: 'site.docs.frames.timingHeading',
        body: 'site.docs.frames.timingBody',
        params: { settings: primary(','), range: '0–3 s' }
      },
      {
        id: 'camera-direction',
        heading: 'site.docs.frames.directionHeading',
        body: 'site.docs.frames.directionBody'
      },
      {
        id: 'preview-and-batch',
        heading: 'site.docs.frames.batchHeading',
        body: 'site.docs.frames.batchBody'
      }
    ],
    sharing: [
      {
        id: 'save-a-document',
        heading: 'site.docs.sharing.saveHeading',
        body: 'site.docs.sharing.saveBody',
        params: {
          save: primary('S'),
          saveAs: primary('S', { shift: true }),
          open: primary('O'),
          format: '.canvaslide'
        }
      },
      {
        id: 'cloud-links',
        heading: 'site.docs.sharing.cloudHeading',
        body: 'site.docs.sharing.cloudBody',
        params: { limit: '5 MiB', html: 'HTML' }
      },
      {
        id: 'export-html',
        heading: 'site.docs.sharing.exportHeading',
        body: 'site.docs.sharing.exportBody',
        params: { export: primary('E'), format: '.html' }
      },
      {
        id: 'play-anywhere',
        heading: 'site.docs.sharing.playHeading',
        body: 'site.docs.sharing.playBody'
      },
      {
        id: 'fonts-and-media',
        heading: 'site.docs.sharing.fontHeading',
        body: 'site.docs.sharing.fontBody',
        params: { html: 'HTML', format: '.canvaslide' }
      }
    ],
    shortcuts: [
      {
        id: 'keyboard-shortcuts',
        heading: 'site.docs.shortcuts.heading',
        body: 'site.docs.shortcuts.body'
      }
    ],
    faq: [
      { id: 'account', heading: 'site.docs.faq.accountQ', body: 'site.docs.faq.accountA' },
      { id: 'offline', heading: 'site.docs.faq.offlineQ', body: 'site.docs.faq.offlineA' },
      { id: 'saved-work', heading: 'site.docs.faq.autosaveQ', body: 'site.docs.faq.autosaveA' },
      { id: 'editing-an-export', heading: 'site.docs.faq.editQ', body: 'site.docs.faq.editA' },
      { id: 'license', heading: 'site.docs.faq.priceQ', body: 'site.docs.faq.priceA' },
      { id: 'report-a-problem', heading: 'site.docs.faq.helpQ', body: 'site.docs.faq.helpA' }
    ]
  }
  return sections[topic]
}
