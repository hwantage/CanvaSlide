import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { insertElement } from '@shared/canvas/document-mutations'
import {
  createEmptyDocument,
  type ConnectorElement as ConnectorModel
} from '@shared/canvas/element-types'
import { defaultStyleMemory } from '@shared/canvas/style-memory'
import { useDocumentStore } from '@/store/document-store'
import { ConnectorElement } from './connector-element'

const connector: ConnectorModel = {
  id: 'connector',
  type: 'connector',
  x: 0,
  y: 0,
  width: 200,
  height: 100,
  start: { x: 0, y: 0 },
  end: { x: 200, y: 100 },
  route: 'straight',
  startHead: 'none',
  endHead: 'arrow',
  style: { ...defaultStyleMemory.connector },
  label: 'Saved label',
  textStyle: { ...defaultStyleMemory.connectorText }
}

beforeEach(() => {
  useDocumentStore.getState().loadDocument(insertElement(createEmptyDocument(), connector), null)
})
afterEach(cleanup)

describe('connector label colour', () => {
  it.each([false, true])(
    'uses the theme foreground for saved default labels (editing: %s)',
    (editing) => {
      const before = useDocumentStore.getState().document
      const view = render(<ConnectorElement element={connector} editing={editing} />)
      expect(view.getByText(connector.label).style.color).toBe('var(--foreground)')
      view.unmount()
      expect(useDocumentStore.getState().document).toBe(before)
      expect(useDocumentStore.getState().dirty).toBe(false)
      expect(useDocumentStore.getState().past).toHaveLength(0)
      expect(connector.textStyle).toEqual(defaultStyleMemory.connectorText)
    }
  )

  it('recognizes uppercase default hex colours from imported documents', () => {
    const element = {
      ...connector,
      textStyle: { ...connector.textStyle, color: connector.textStyle.color.toUpperCase() }
    }
    const view = render(<ConnectorElement element={element} editing={false} />)
    expect(view.getByText(connector.label).style.color).toBe('var(--foreground)')
  })

  it.each([false, true])('preserves custom colours and typography (editing: %s)', (editing) => {
    const element = {
      ...connector,
      textStyle: { ...connector.textStyle, color: '#c026d3', fontSize: 24, bold: true }
    }
    const view = render(<ConnectorElement element={element} editing={editing} />)
    expect(view.getByText(connector.label).style).toMatchObject({
      color: '#c026d3',
      fontSize: '24px',
      fontWeight: '700',
      textAlign: 'center'
    })
  })
})
