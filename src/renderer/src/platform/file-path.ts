/** Mirrors Rust FilePath; strings stay literal, while native bytes never become display text. */
export type FilePath =
  | string
  | { encoding: 'unix-bytes'; bytes: number[]; display: string }
  | { encoding: 'windows-wide'; units: number[]; display: string }

export function displayFilePath(path: FilePath): string {
  return typeof path === 'string' ? path : path.display
}
