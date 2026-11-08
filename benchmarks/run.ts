/** Sequential fresh-process suite. Qualification is excluded from elapsed time. */
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, statfs, symlink, writeFile } from 'node:fs/promises'
import { cpus, platform, arch, release, tmpdir, totalmem } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { nativeProvenance } from './setup-zig'
import { entrySource, moduleSource, negativeConsumer, positiveConsumer, workloads, type Workload } from './fixtures'
const workload = (process.argv.find(argument => argument.startsWith('--workload='))?.slice('--workload='.length) ?? 'annotated') as Workload
if (!workloads.includes(workload)) throw new Error('Unknown benchmark workload')
const smoke = process.argv.includes('--smoke')
const iterations = smoke ? 1 : 9
const warmups = smoke ? 0 : 2
const counts = smoke ? [2] : [1, 25, 100]
async function checkDiskSpace(): Promise<void> {
  const disk = await statfs(tmpdir())
  if (disk.bavail * disk.bsize < 512 * 1024 * 1024)
    throw new Error('Insufficient temporary disk space for a valid run; free space or use the hosted benchmark workflow')
}
await checkDiskSpace()
const nativeZig = await nativeProvenance()
const root = await realpath(await mkdtemp(join(tmpdir(), 'dtsx-org-bench-')))
const allAdapters = [
  ['dtsx', 'dtsx', 'project-emit', '@stacksjs/dtsx'],
  ['zig', 'zig-dtsx', 'project-emit', 'zig-dtsx'],
  ['oxc', 'Oxc', 'project-emit', 'oxc-transform'],
  ['swc', 'SWC', 'project-emit', '@swc/core'],
  ['ts-transpile', 'TypeScript transpileDeclaration', 'project-emit', 'typescript'],
  ['tsc', 'TypeScript 6 tsc', 'checked-project', 'typescript'],
  ['tsgo', 'TypeScript 7 native', 'checked-project', 'typescript-native'],
  ['dtsx-bundle', 'dtsx bundle', 'bundled-project', '@stacksjs/dtsx'],
  ['tsdown-oxc', 'tsdown / Oxc', 'bundled-project', 'tsdown'],
  ['tsdown-tsc', 'tsdown / TypeScript', 'bundled-project', 'tsdown'],
  ['tsup', 'tsup', 'bundled-project', 'tsup'],
  ['rollup-dts', 'tsc + rollup-plugin-dts', 'bundled-project', 'rollup-plugin-dts'],
  ['api-extractor', 'tsc + API Extractor', 'bundled-project', '@microsoft/api-extractor'],
  ['dts-bundle-generator', 'dts-bundle-generator', 'bundled-project', 'dts-bundle-generator'],
  ['unplugin-dts', 'Vite + unplugin-dts', 'bundled-project', 'unplugin-dts'],
  ['unplugin-isolated', 'Rolldown + unplugin-isolated-decl', 'project-emit', 'unplugin-isolated-decl'],
].map(([id, name, group, pkg]) => ({ id, name, group, package: pkg }))
const requestedTools = process.argv.find(argument => argument.startsWith('--tools='))?.slice('--tools='.length).split(',')
if (requestedTools?.some(id => !allAdapters.some(tool => tool.id === id))) throw new Error('Unknown benchmark tool selection')
const adapters = requestedTools ? allAdapters.filter(tool => requestedTools.includes(tool.id)) : allAdapters
if (!adapters.length) throw new Error('No benchmark tools selected')
const compilerOptions: ts.CompilerOptions = { target: 99, module: 199, moduleResolution: 99, strict: true, skipLibCheck: false, types: [], noEmit: true }
interface Row { id: string; name: string; group: string; package: string; version: string; modules: number; sourceFiles: number; fixtureSha256: string; status: string; error?: string; failureStage?: string; samplesMs: number[]; medianMs: number | null; minMs: number | null; maxMs: number | null; outputSha256?: string }
const results: Row[] = []
function diagnostics(files: string[]) { return ts.getPreEmitDiagnostics(ts.createProgram(files, compilerOptions)) }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
async function declarations(dir: string): Promise<string[]> {
  const paths: string[] = []
  for (const file of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, file.name)
    if (file.isDirectory()) paths.push(...await declarations(path))
    else if (/\.d\.(ts|mts|cts)$/.test(file.name)) paths.push(path)
  }
  return paths.sort()
}
async function qualify(cwd: string, out: string, count: number, bundled: boolean) {
  const outputs = await declarations(out)
  assert(outputs.length > 0, 'No declaration files emitted')
  const entry = outputs.find(f => /bundle\.d\.ts$/.test(f)) ?? outputs.find(f => /index\.d\.(ts|mts)$/.test(f))
  assert(entry, `No declaration entry: ${outputs.join(', ')}`)
  const standalone = join(cwd, 'standalone')
  await rm(standalone, { recursive: true, force: true })
  await mkdir(standalone, { recursive: true })
  const path = bundled ? join(standalone, 'index.d.ts') : entry
  if (bundled) await writeFile(path, await readFile(entry))
  const imported = path.replace(/\.d\.(ts|mts)$/, '.js')
  await writeFile(join(cwd, 'positive.ts'), positiveConsumer(workload, imported, count))
  const positive = diagnostics([join(cwd, 'positive.ts')])
  assert(positive.length === 0, `Positive consumer: ${ts.formatDiagnostics(positive, { getCurrentDirectory: () => cwd, getCanonicalFileName: f => f, getNewLine: () => '\n' })}`)
  await writeFile(join(cwd, 'negative.ts'), negativeConsumer(workload, imported))
  const negative = diagnostics([join(cwd, 'negative.ts')])
  assert(negative.length === 2 && negative.every(d => d.code === 2322 && d.file?.fileName.endsWith('negative.ts')), 'Expected exactly two negative TS2322 controls')
  return createHash('sha256').update((await Promise.all(outputs.map(f => readFile(f, 'utf8')))).join('\n')).digest('hex')
}
try {
  for (const count of counts) {
    const cwd = join(root, `modules-${count}`)
    await mkdir(join(cwd, 'src'), { recursive: true })
    await symlink(join(import.meta.dir, 'node_modules'), join(cwd, 'node_modules'))
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ name: 'declaration-benchmark', type: 'module', version: '1.0.0' }))
    const fixtureHash = createHash('sha256')
    for (let i = 0; i < count; i++) {
      const source = moduleSource(workload, i)
      await writeFile(join(cwd, `src/module${i}.ts`), source)
      fixtureHash.update(`module${i}.ts\0${source}\0`)
    }
    const entry = entrySource(workload, count)
    await writeFile(join(cwd, 'src/index.ts'), entry)
    fixtureHash.update(`index.ts\0${entry}\0`)
    const fixtureSha256 = fixtureHash.digest('hex')
    await writeFile(join(cwd, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ESNext', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, isolatedDeclarations: workload === 'annotated', declaration: true, emitDeclarationOnly: true, skipLibCheck: false, types: [], rootDir: 'src' }, include: ['src'] }))
    assert(diagnostics([join(cwd, 'src/index.ts')]).length === 0, 'Invalid authored fixture')
    const samples = new Map(adapters.map(t => [t.id, [] as number[]]))
    const errors = new Map<string, string>()
    const hashes = new Map<string, string>()
    const failureStages = new Map<string, string>()
    for (let round = -warmups; round < iterations; round++) {
      await checkDiskSpace()
      const offset = (round + warmups) % adapters.length
      for (const tool of [...adapters.slice(offset), ...adapters.slice(0, offset)]) {
        if (errors.has(tool.id)) continue
        const out = join(cwd, 'output')
        await rm(out, { recursive: true, force: true })
        const start = performance.now()
        const child = Bun.spawn([process.execPath, join(import.meta.dir, 'worker.ts'), tool.id, cwd, out, workload], { cwd: import.meta.dir, env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', NO_COLOR: '1' }, stdout: 'pipe', stderr: 'pipe', timeout: 120000 })
        const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
        const elapsed = performance.now() - start
        let failureStage = 'emission'
        try {
          assert(exit === 0, `Exit ${exit}: ${(stdout + stderr).slice(-6000)}`)
          failureStage = 'consumer qualification'
          hashes.set(tool.id, await qualify(cwd, out, count, tool.group === 'bundled-project'))
          if (round >= 0) samples.get(tool.id)!.push(elapsed)
          console.log(`${count} modules | ${tool.id} | round ${round + 1} | ${elapsed.toFixed(2)} ms | qualified`)
        }
        catch (error) { errors.set(tool.id, String(error).slice(0, 12000)); failureStages.set(tool.id, failureStage); console.log(`${count} modules | ${tool.id} | FAILED (${failureStage}): ${String(error).slice(-1000)}`) }
      }
    }
    for (const tool of adapters) {
      const values = errors.has(tool.id) ? [] : samples.get(tool.id)!
      const sorted = [...values].sort((a, b) => a - b)
      let version = tool.id === 'zig' ? nativeZig.version : 'see lockfile'
      try { if (tool.id !== 'zig') version = (await Bun.file(Bun.resolveSync(`${tool.package}/package.json`, import.meta.dir)).json()).version } catch {}
      results.push({ ...tool, version, modules: count, sourceFiles: count + 1, fixtureSha256, status: errors.has(tool.id) ? 'failed' : 'passed', error: errors.get(tool.id), failureStage: failureStages.get(tool.id), samplesMs: values, medianMs: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null, minMs: sorted[0] ?? null, maxMs: sorted.at(-1) ?? null, outputSha256: hashes.get(tool.id) })
    }
  }
  const definitionFiles = ['run.ts', 'worker.ts', 'fixtures.ts', 'bun.lock']
  const benchmarkDefinition = Object.fromEntries(await Promise.all(definitionFiles.map(async file => [file, createHash('sha256').update(await readFile(join(import.meta.dir, file))).digest('hex') as string])))
  const result = { schemaVersion: 3, smoke, workload, benchmarkDefinition, nativeZig, executionEnvironment: process.env.GITHUB_ACTIONS === 'true' ? { kind: 'github-actions', repository: process.env.GITHUB_REPOSITORY, runId: process.env.GITHUB_RUN_ID, commit: process.env.GITHUB_SHA, runnerOS: process.env.RUNNER_OS, runnerArch: process.env.RUNNER_ARCH } : { kind: 'local' }, measuredAt: new Date().toISOString(), runtime: `Bun ${Bun.version}`, machine: { platform: platform(), arch: arch(), os: release(), cpu: cpus()[0]?.model, cores: cpus().length, memoryBytes: totalmem() }, methodology: { iterations, warmups, cache: 'Fresh process and output directory per sample; warm filesystem caches; no incremental/result cache reuse.', ordering: 'Sequential, deterministically rotating tool order each round.', timing: 'Wall clock: process startup, imports, reads, generation, writes and disposal. Cleanup and qualification excluded.', correctness: 'Every sample strictly consumed with TypeScript 6 and skipLibCheck=false. All module exports exercised. Two negative assignments require exactly TS2322. Inferred API positions additionally reject any and preserve widening. Bundles checked standalone.', scope: workload === 'annotated' ? 'Explicit annotations, re-exports, generics, private class fields, mapped types and enums.' : 'No type annotations: inferred parameter defaults, return objects, arrow functions, class members, mutable objects, arrays and imported function results. No JSX, dependencies, watch or declaration maps. Not proof of arbitrary TypeScript equivalence.', groups: { 'project-emit': 'Per-module declarations without a required semantic check.', 'checked-project': 'Includes semantic checking. Do not rank against unchecked emitters.', 'bundled-project': 'Standalone declaration entry. Extra typechecking/JavaScript work varies by tool; see adapters.' } }, results }
  const output = smoke ? `smoke-${workload}.json` : `../public/benchmarks/results${platform() === 'linux' ? '-linux' : ''}${workload === 'inferred' ? '-inferred' : ''}.json`
  await writeFile(join(import.meta.dir, output), JSON.stringify(result, null, 2) + '\n')
  const failures = results.filter(row => row.status === 'failed').length
  console.log(`Saved ${results.length} cases; ${failures} failed qualifications.`)
  if (process.argv.includes('--require-baselines')) {
    const baselines = results.filter(row => row.id === 'tsc' || row.id === 'tsgo')
    assert(baselines.length === counts.length * 2 && baselines.every(row => row.status === 'passed'), 'Both checked TypeScript baselines must qualify at every size')
  }
  if (failures && process.argv.includes('--require-all')) throw new Error(`${failures} tools failed qualification`)
}
finally { await rm(root, { recursive: true, force: true }) }
