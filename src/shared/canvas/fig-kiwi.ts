import { ByteBuffer, type Field, type Schema } from 'kiwi-schema'

/** Interpret embedded schemas without runtime code generation, so Tauri's CSP stays intact. */
export function decodeFigMessage(schema: Schema, bytes: Uint8Array): unknown {
  const definitions = new Map(schema.definitions.map((definition) => [definition.name, definition]))
  const fields = new Map(
    schema.definitions.map((definition) => [
      definition.name,
      new Map(definition.fields.map((field) => [field.value, field]))
    ])
  )
  const buffer = new ByteBuffer(bytes)
  let remaining = 20_000_000
  function read(type: string, depth: number): unknown {
    if (--remaining < 0 || depth > 128) {
      throw new Error('FIG_LIMIT')
    }
    switch (type) {
      case 'bool':
        return buffer.readByte() !== 0
      case 'byte':
        return buffer.readByte()
      case 'int':
        return buffer.readVarInt()
      case 'uint':
        return buffer.readVarUint()
      case 'float':
        return buffer.readVarFloat()
      case 'string':
        return buffer.readString()
      case 'int64':
        return buffer.readVarInt64()
      case 'uint64':
        return buffer.readVarUint64()
    }
    const definition = definitions.get(type)
    if (!definition) {
      throw new Error('FIG_SCHEMA')
    }
    if (definition.kind === 'ENUM') {
      return fields.get(type)?.get(buffer.readVarUint())?.name
    }
    const result: Record<string, unknown> = Object.create(null)
    const readField = (field: Field) => {
      if (!field.type) {
        throw new Error('FIG_SCHEMA')
      }
      let value: unknown
      if (field.isArray && field.type === 'byte') {
        value = buffer.readByteArray()
      } else if (field.isArray) {
        const length = buffer.readVarUint()
        if (length > remaining) {
          throw new Error('FIG_LIMIT')
        }
        const values: unknown[] = []
        for (let i = 0; i < length; i += 1) {
          values.push(read(field.type, depth + 1))
        }
        value = values
      } else {
        value = read(field.type, depth + 1)
      }
      if (!field.isDeprecated) {
        result[field.name] = value
      }
    }
    if (definition.kind === 'STRUCT') {
      definition.fields.forEach(readField)
    } else {
      for (let tag = buffer.readVarUint(); tag !== 0; tag = buffer.readVarUint()) {
        const field = fields.get(type)?.get(tag)
        if (!field) {
          throw new Error('FIG_SCHEMA')
        }
        readField(field)
      }
    }
    return result
  }
  return read('Message', 0)
}
