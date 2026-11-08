import { expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { entrySource, moduleSource, positiveConsumer } from './fixtures'

test('inferred fixtures contain no type annotations or type assertions', () => {
  for (const index of [0, 1, 24, 99]) {
    const source = moduleSource('inferred', index)
    const file = ts.createSourceFile(`module${index}.ts`, source, ts.ScriptTarget.Latest, true)
    let exports = 0
    function inspect(node: ts.Node): void {
      if ('type' in node) expect(node.type).toBeUndefined()
      expect(ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)).toBe(false)
      if (ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) exports++
      ts.forEachChild(node, inspect)
    }
    inspect(file)
    expect(exports).toBe(7)
    if (index) expect(source).toContain(`from './module${index - 1}.js'`)
  }
})

test('the strict inference consumer accepts compiler output and rejects degraded types', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dtsx-inference-controls-'))
  try {
    await mkdir(join(directory, 'src'))
    for (const index of [0, 1]) await writeFile(join(directory, `src/module${index}.ts`), moduleSource('inferred', index))
    const entry = join(directory, 'src/index.ts')
    await writeFile(entry, entrySource('inferred', 2))
    const options: ts.CompilerOptions = { strict: true, skipLibCheck: false, types: [], target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext }
    const program = ts.createProgram([entry], { ...options, declaration: true, emitDeclarationOnly: true, outDir: join(directory, 'out') })
    expect(ts.getPreEmitDiagnostics(program)).toHaveLength(0)
    expect(program.emit().emitSkipped).toBe(false)
    const consumer = join(directory, 'consumer.ts')
    await writeFile(consumer, positiveConsumer('inferred', join(directory, 'out/index.js'), 2))
    function diagnostics() { return ts.getPreEmitDiagnostics(ts.createProgram([consumer], { ...options, noEmit: true })) }
    expect(diagnostics()).toHaveLength(0)
    const path = join(directory, 'out/module0.d.ts')
    const declaration = await readFile(path, 'utf8')
    await writeFile(path, declaration.replaceAll('value: number', 'value: any'))
    expect(diagnostics().some(error => error.code === 2344)).toBe(true)
    await writeFile(path, declaration.replace('retries: number', 'retries: 3'))
    expect(diagnostics().some(error => error.code === 2322)).toBe(true)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})
