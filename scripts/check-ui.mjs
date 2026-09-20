import { readFile } from 'node:fs/promises'

const files = [
  new URL('../src/client/Panel.tsx', import.meta.url),
  new URL('../src/client/ToolCard.tsx', import.meta.url),
]
const source = (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n')
if (/<svg\b/u.test(source)) throw new Error('Use lucide-react instead of inline SVG')
for (const tag of ['input', 'button']) {
  const matches = [...source.matchAll(new RegExp(`<${tag}\\b`, 'gu'))].length
  const allowed = tag === 'input' ? 1 : 4
  if (matches !== allowed) {
    throw new Error(`Expected exactly ${String(allowed)} justified native <${tag}> uses, found ${String(matches)}`)
  }
}
for (const primitive of ['Button', 'Input', 'Modal', 'MarkdownText', 'Tag', 'Pill']) {
  if (!source.includes(primitive)) throw new Error(`Required DSH primitive is missing: ${primitive}`)
}
const styles = await readFile(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
if (/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/iu.test(styles)) {
  throw new Error('Client styles must use DSH theme variables instead of hardcoded colors')
}
if (!styles.includes('@container')) throw new Error('Notebook panel must respond to its sidebar container')
