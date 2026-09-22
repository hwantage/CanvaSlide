/** The export contains only our playback modules, never an editor or package runtime. */
export function assertPlayerModules(ids) {
  const forbidden = ids.filter((id) => {
    const path = id.replaceAll('\\', '/')
    return (
      path.includes('/node_modules/') ||
      path.includes('/src/renderer/') ||
      /\/src\/shared\/canvas\/(element-types|document-schema)\.[cm]?[jt]s/.test(path)
    )
  })
  if (forbidden.length) {
    throw new Error(`player runtime boundary: ${forbidden.join(', ')}`)
  }
}
