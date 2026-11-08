/** Fresh process adapter: includes imports, reads, emission and writes. */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
const [tool, cwd, outdir, workload = 'annotated'] = process.argv.slice(2)
const isolatedDeclarations = workload === 'annotated'
process.chdir(cwd)
await mkdir(outdir, { recursive: true })
const files = (await readdir(join(cwd, 'src'))).filter(f => f.endsWith('.ts')).sort()
const entry = join(cwd, 'src/index.ts')
const options = { declaration: true, emitDeclarationOnly: true, isolatedDeclarations, strict: true, skipLibCheck: false, target: 99, module: 199, moduleResolution: 99, types: [], rootDir: join(cwd, 'src'), outDir: outdir }
async function tsc(): Promise<void> {
  const ts = await import('typescript')
  const program = ts.createProgram(files.map(f => join(cwd, 'src', f)), options)
  const emit = program.emit()
  const errors = [...ts.getPreEmitDiagnostics(program), ...emit.diagnostics]
  if (emit.emitSkipped || errors.length) throw new Error(ts.formatDiagnostics(errors, { getCurrentDirectory: () => cwd, getCanonicalFileName: f => f, getNewLine: () => '\n' }))
}
if (tool === 'dtsx' || tool === 'dtsx-bundle') {
  const { generate } = await import('@stacksjs/dtsx')
  const stats = await generate({ cwd, root: 'src', entrypoints: ['index.ts'], outdir, bundle: tool === 'dtsx-bundle', bundleOutput: 'index.d.ts', incremental: false, isolatedDeclarations })
  if (stats.generationMode !== (isolatedDeclarations ? 'isolated' : 'semantic')) throw new Error('Generator did not use the requested declaration mode')
  if (stats.filesFailed) throw new Error(`${stats.filesFailed} files failed`)
}
else if (['oxc', 'swc', 'zig', 'ts-transpile'].includes(tool)) {
  const oxc = tool === 'oxc' ? await import('oxc-transform') : undefined
  const swc = tool === 'swc' ? await import('@swc/core') : undefined
  const zig = tool === 'zig' ? await import('./native-zig') : undefined
  const ts = tool === 'ts-transpile' ? await import('typescript') : undefined
  for (const file of files) {
    const source = await readFile(join(cwd, 'src', file), 'utf8')
    let output = ''
    if (oxc) {
      const result = oxc.isolatedDeclarationSync(file, source, { sourcemap: false })
      if (result.errors.length) throw new Error(JSON.stringify(result.errors))
      output = result.code
    }
    if (swc) {
      const result = swc.transformSync(source, { filename: file, swcrc: false, configFile: false, jsc: { parser: { syntax: 'typescript' }, experimental: { emitIsolatedDts: true }, target: 'esnext' } })
      const experimental = result as typeof result & { output?: string }
      output = JSON.parse(experimental.output ?? '{}').__swc_isolated_declarations__ ?? ''
    }
    if (zig) {
      if (!zig.ZIG_AVAILABLE) throw new Error('Pinned Zig library could not be loaded')
      output = zig.processSource(source, true, isolatedDeclarations)
    }
    if (ts) {
      const result = ts.transpileDeclaration(source, { fileName: join(cwd, 'src', file), compilerOptions: options, reportDiagnostics: true })
      if (result.diagnostics?.length) throw new Error(JSON.stringify(result.diagnostics))
      output = result.outputText
    }
    if (!output.trim()) throw new Error(`Empty declaration: ${file}`)
    await writeFile(join(outdir, file.replace(/\.ts$/, '.d.ts')), output)
  }
}
else if (tool === 'tsc') await tsc()
else if (tool === 'tsgo') {
  const child = Bun.spawn([process.execPath, join(dirname(Bun.resolveSync('typescript-native/package.json', import.meta.dir)), 'bin/tsc'), '-p', join(cwd, 'tsconfig.json'), '--outDir', outdir], { stdout: 'pipe', stderr: 'pipe' })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  if (code) throw new Error(stdout + stderr)
}
else if (tool.startsWith('tsdown-')) {
  const { build } = await import('tsdown')
  const result = await build({ cwd, config: false, entry: [entry], outDir: outdir, format: 'esm', dts: { emitDtsOnly: true, generator: tool.endsWith('oxc') ? 'oxc' : 'tsc' }, logLevel: 'silent', report: false })
  for (const bundle of result.bundles) await bundle[Symbol.asyncDispose]()
}
else if (tool === 'tsup') {
  const { build } = await import('tsup')
  await build({ entry: [entry], outDir: outdir, format: ['esm'], dts: { only: true }, silent: true, config: false, tsconfig: join(cwd, 'tsconfig.json') })
}
else if (tool === 'dts-bundle-generator') {
  const { generateDtsBundle } = await import('dts-bundle-generator')
  const [output] = generateDtsBundle([{ filePath: entry, output: { noBanner: true } }], { preferredConfigPath: join(cwd, 'tsconfig.json') })
  await writeFile(join(outdir, 'index.d.ts'), output)
}
else if (tool === 'rollup-dts') {
  await tsc()
  const { rollup } = await import('rollup')
  const { dts } = await import('rollup-plugin-dts')
  const bundle = await rollup({ input: join(outdir, 'index.d.ts'), plugins: [dts({ tsconfig: join(cwd, 'tsconfig.json') })] })
  await bundle.write({ file: join(outdir, 'bundle.d.ts'), format: 'es' })
  await bundle.close()
}
else if (tool === 'api-extractor') {
  await tsc()
  const { Extractor, ExtractorConfig, ExtractorLogLevel } = await import('@microsoft/api-extractor')
  const config = ExtractorConfig.prepare({ configObject: { projectFolder: cwd, mainEntryPointFilePath: join(outdir, 'index.d.ts'), compiler: { tsconfigFilePath: join(cwd, 'tsconfig.json') }, apiReport: { enabled: false }, docModel: { enabled: false }, dtsRollup: { enabled: true, untrimmedFilePath: join(outdir, 'bundle.d.ts') }, tsdocMetadata: { enabled: false }, messages: { extractorMessageReporting: { default: { logLevel: ExtractorLogLevel.None } } } }, configObjectFullPath: join(cwd, 'api-extractor.json'), packageJsonFullPath: join(cwd, 'package.json') })
  if (!Extractor.invoke(config, { localBuild: true }).succeeded) throw new Error('API Extractor failed')
}
else if (tool === 'unplugin-dts') {
  const { build } = await import('vite')
  const { default: dts } = await import('unplugin-dts/vite')
  await build({ root: cwd, configFile: false, logLevel: 'silent', plugins: [dts({ tsconfigPath: join(cwd, 'tsconfig.json'), outDirs: [outdir], bundleTypes: true })], build: { outDir: outdir, lib: { entry, formats: ['es'], fileName: 'index' }, emptyOutDir: false, minify: false } })
}
else if (tool === 'unplugin-isolated') {
  const { rolldown } = await import('rolldown')
  const { default: isolated } = await import('unplugin-isolated-decl/rolldown')
  const build = await rolldown({ input: entry, plugins: [isolated({ transformer: 'oxc', inputBase: join(cwd, 'src') })] })
  await build.write({ dir: outdir, format: 'es' })
  await build.close()
}
else throw new Error(`Unknown adapter: ${tool}`)
