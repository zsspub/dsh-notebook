import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../lib/', import.meta.url))
const clientBundle = join(root, 'client.js')
const manifest = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))

function normalize(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      normalize(path)
      continue
    }
    if (!/\.(?:js|d\.ts|map)$/u.test(entry.name)) continue
    const source = readFileSync(path, 'utf8')
    const normalized = `${source.replace(/[\t ]+$/gmu, '').replace(/\n*$/u, '')}\n`
    if (normalized !== source) writeFileSync(path, normalized)
  }
}

normalize(root)
const source = readFileSync(clientBundle, 'utf8')
if (/\bprocess\.env\.NODE_ENV\b/u.test(source)) throw new Error('client bundle contains process.env.NODE_ENV')
const injected = new Set(manifest.dsh.client.inject)
const required = new Set(
  [...source.matchAll(/\brequire\((["'`])([^"'`]+)\1\)/gu)]
    .map(match => match[2])
    .filter(specifier => specifier.startsWith('@deepseek-ai/')),
)
const missing = [...required].filter(specifier => !injected.has(specifier))
if (missing.length > 0) throw new Error(`client inject is missing: ${missing.join(', ')}`)
