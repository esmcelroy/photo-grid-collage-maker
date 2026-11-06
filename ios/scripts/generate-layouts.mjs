#!/usr/bin/env node
// Generates ios/CollageMaker/Resources/layouts.json from the web app's
// GRID_LAYOUTS (src/lib/layouts.ts), so the native catalog is never maintained by hand.
//
//   node ios/scripts/generate-layouts.mjs          write layouts.json
//   node ios/scripts/generate-layouts.mjs --check  exit 1 if layouts.json is stale
//
// Runtime: any Node 20 or newer with `npm ci` dependencies installed. The TypeScript
// sources are transpiled with the repository's locked `typescript` package
// (`transpileModule`) and evaluated in memory, so Node type stripping is not required
// and nothing else is written.

import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../..')
const layoutsSource = path.join(repoRoot, 'src/lib/layouts.ts')
const typesSource = path.join(repoRoot, 'src/lib/types.ts')
const outputPath = path.join(repoRoot, 'ios/CollageMaker/Resources/layouts.json')

const SCHEMA_VERSION = 1

const ts = createRequire(path.join(repoRoot, 'package.json'))('typescript')

async function importTypeScript(file) {
  const source = await readFile(file, 'utf8')
  const { outputText } = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  if (/^\s*import\s/m.test(outputText)) {
    throw new Error(`${path.relative(repoRoot, file)} has runtime imports; the generator only supports type-only imports`)
  }
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}

function fail(id, reason) {
  throw new Error(`Layout ${JSON.stringify(id)}: ${reason}`)
}

function parseTracks(id, tokens, axis) {
  return tokens.map(token => {
    const match = /^(\d+(?:\.\d+)?)fr$/.exec(token)
    const value = match ? Number(match[1]) : NaN
    if (!(value > 0)) fail(id, `${axis} track ${JSON.stringify(token)} is not a positive fr track`)
    return value
  })
}

// Mirrors parseTemplate in src/components/CollagePreview.tsx:
// "rows / columns", and a template without "/" is one row of columns.
function parseTemplate(id, template) {
  const parts = template.split('/')
  if (parts.length > 2) fail(id, `gridTemplate ${JSON.stringify(template)} has more than one "/"`)
  if (parts.length === 1) {
    return { rows: [1], columns: parseTracks(id, parts[0].trim().split(' '), 'column') }
  }
  return {
    rows: parseTracks(id, parts[0].trim().split(' '), 'row'),
    columns: parseTracks(id, parts[1].trim().split(' '), 'column'),
  }
}

function parseAspectRatio(id, value) {
  if (typeof value !== 'string') fail(id, 'aspectRatio is missing')
  const match = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(value)
  const ratio = match ? Number(match[1]) / Number(match[2]) : NaN
  if (!(ratio > 0) || !Number.isFinite(ratio)) fail(id, `aspectRatio ${JSON.stringify(value)} is not "width/height"`)
  return ratio
}

function convertLayout(layout, maxPhotos) {
  const { id } = layout
  if (typeof id !== 'string' || id === '') fail(id, 'id must be a non-empty string')
  if (typeof layout.name !== 'string' || layout.name === '') fail(id, 'name must be a non-empty string')
  if (!Number.isInteger(layout.photoCount) || layout.photoCount < 1 || layout.photoCount > maxPhotos) {
    fail(id, `photoCount ${layout.photoCount} is outside 1...${maxPhotos}`)
  }
  if (!Array.isArray(layout.platforms) || layout.platforms.length === 0) fail(id, 'platforms must be non-empty')

  const { rows, columns } = parseTemplate(id, layout.gridTemplate)
  const areas = layout.areas.map(row => row.split(' '))
  if (areas.length !== rows.length) fail(id, `${areas.length} area rows for ${rows.length} row tracks`)

  const cells = new Map()
  areas.forEach((row, r) => {
    if (row.length !== columns.length) fail(id, `area row ${r} has ${row.length} cells for ${columns.length} column tracks`)
    row.forEach((name, c) => {
      if (name === '') fail(id, `area row ${r} has an empty cell name`)
      if (name === '.') return
      if (!cells.has(name)) cells.set(name, [])
      cells.get(name).push([r, c])
    })
  })

  if (cells.size !== layout.photoCount) fail(id, `${cells.size} named areas for photoCount ${layout.photoCount}`)
  for (const [name, positions] of cells) {
    const rs = positions.map(p => p[0])
    const cs = positions.map(p => p[1])
    const height = Math.max(...rs) - Math.min(...rs) + 1
    const width = Math.max(...cs) - Math.min(...cs) + 1
    if (positions.length !== width * height) fail(id, `area ${JSON.stringify(name)} is not a filled rectangle`)
  }

  return {
    id,
    name: layout.name,
    photoCount: layout.photoCount,
    rows,
    columns,
    areas,
    aspectRatio: parseAspectRatio(id, layout.aspectRatio),
    platforms: [...layout.platforms],
  }
}

function render(layouts) {
  // One layout per line keeps diffs readable.
  const lines = layouts.map(layout => `    ${JSON.stringify(layout)}`)
  return `{\n  "schemaVersion": ${SCHEMA_VERSION},\n  "source": "src/lib/layouts.ts",\n  "layouts": [\n${lines.join(',\n')}\n  ]\n}\n`
}

async function main() {
  const args = process.argv.slice(2)
  const unknown = args.filter(arg => arg !== '--check')
  if (unknown.length > 0) throw new Error(`Unknown arguments: ${unknown.join(' ')}`)
  const check = args.includes('--check')

  const { MAX_PHOTOS } = await importTypeScript(typesSource)
  const { GRID_LAYOUTS } = await importTypeScript(layoutsSource)
  if (!Number.isInteger(MAX_PHOTOS) || !Array.isArray(GRID_LAYOUTS)) {
    throw new Error('Could not read MAX_PHOTOS and GRID_LAYOUTS from src/lib')
  }

  const layouts = GRID_LAYOUTS.map(layout => convertLayout(layout, MAX_PHOTOS))
  const seen = new Set()
  for (const { id } of layouts) {
    if (seen.has(id)) fail(id, 'duplicate id')
    seen.add(id)
  }
  for (let count = 1; count <= MAX_PHOTOS; count++) {
    if (!layouts.some(layout => layout.photoCount === count)) {
      throw new Error(`No layout for photo count ${count}`)
    }
  }

  const output = render(layouts)
  const relativeOutput = path.relative(repoRoot, outputPath)

  if (check) {
    const current = await readFile(outputPath, 'utf8').catch(() => null)
    if (current !== output) {
      console.error(`${relativeOutput} is out of date with src/lib/layouts.ts. Run: node ios/scripts/generate-layouts.mjs`)
      process.exit(1)
    }
    console.log(`${relativeOutput} is up to date (${layouts.length} layouts).`)
    return
  }

  await writeFile(outputPath, output)
  console.log(`Wrote ${relativeOutput} (${layouts.length} layouts).`)
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
