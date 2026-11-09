/**
 * Regenerate tsc's declaration for the homepage showcase.
 *
 * The site itself runs TypeScript 7, which has no JavaScript API, so tsc's
 * side of the comparison is a snapshot made with the benchmark lab's pinned
 * TypeScript 6. The snapshot records the source hash; the website tests fail
 * when the showcase source changes without rerunning this script.
 *
 *   bun scripts/showcase-tsc.ts
 */
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
// The lab pins TypeScript 6, the last release with a JavaScript compiler API.
// eslint-disable-next-line pickier/no-import-node-modules-by-path
import ts from '../benchmarks/node_modules/typescript/lib/typescript.js'

const root = join(import.meta.dir, '..')
const source = await readFile(join(root, 'resources/data/showcase.ts.txt'), 'utf8')
const fileName = 'showcase.ts'
const options = { declaration: true, emitDeclarationOnly: true, strict: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext, skipLibCheck: true, noLib: true }
const host = ts.createCompilerHost(options)
const readSource = host.getSourceFile
host.getSourceFile = (name, version, ...rest) => name === fileName ? ts.createSourceFile(name, source, version) : readSource(name, version, ...rest)
let declaration = ''
host.writeFile = (name, text) => {
  if (name.endsWith('.d.ts')) declaration = text
}
const result = ts.createProgram([fileName], options, host).emit(undefined, undefined, undefined, true)
if (result.emitSkipped || !declaration) throw new Error('tsc did not emit a declaration for the showcase')

await writeFile(join(root, 'resources/data/showcase.tsc.json'), `${JSON.stringify({
  compiler: `tsc ${ts.version}`,
  sourceSha256: createHash('sha256').update(source).digest('hex'),
  declaration: declaration.trimEnd(),
}, null, 2)}\n`)
console.log(`Wrote tsc ${ts.version} showcase declaration`)
