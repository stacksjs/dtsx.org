import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { benchmarkName } from '../resources/functions/benchmark-names'

interface BenchmarkRow {
  id: string
  name: string
  group: string
  version: string
  modules: number
  sourceFiles: number
  fixtureSha256: string
  status: 'passed' | 'failed'
  samplesMs: number[]
  medianMs: number | null
  minMs: number | null
  maxMs: number | null
  outputSha256?: string
  error?: string
  failureStage?: string
}
interface BenchmarkReport {
  schemaVersion: number
  smoke: boolean
  workload: string
  runtime: string
  benchmarkDefinition: Record<string, string>
  machine: { platform: string; arch: string }
  executionEnvironment: { kind: string; commit: string; runId: string }
  methodology: { iterations: number; warmups: number }
  nativeZig: { version: string; commit: string; platform: string; archiveSha256: string; bindingSha256: string; librarySha256: string; target?: string; compiler?: string; optimize?: string }
  results: BenchmarkRow[]
}
const root = join(import.meta.dir, '..')
const specifications = [
  { file: 'results.json', platform: 'darwin', workload: 'annotated' },
  { file: 'results-linux.json', platform: 'linux', workload: 'annotated' },
  { file: 'results-inferred.json', platform: 'darwin', workload: 'inferred' },
  { file: 'results-linux-inferred.json', platform: 'linux', workload: 'inferred' },
]
const snapshots = await Promise.all(specifications.map(async specification => ({ ...specification, report: await Bun.file(join(root, 'public/benchmarks', specification.file)).json() as BenchmarkReport })))
const report = snapshots[0].report
const zigRelease = await Bun.file(join(root, 'benchmarks/zig-release.json')).json()
const configurationIds = ['dtsx', 'zig', 'oxc', 'swc', 'ts-transpile', 'tsc', 'tsgo', 'dtsx-bundle', 'tsdown-oxc', 'tsdown-tsc', 'tsup', 'rollup-dts', 'api-extractor', 'dts-bundle-generator', 'unplugin-dts', 'unplugin-isolated']
const expectedCases = configurationIds.flatMap(id => [1, 25, 100].map(count => `${id}:${count}`)).sort()
const frozenDefinition = Object.fromEntries(await Promise.all(['run.ts', 'worker.ts', 'fixtures.ts', 'bun.lock', 'native-zig.ts', 'setup-zig.ts', 'zig-release.json'].map(async file => [file, createHash('sha256').update(await readFile(join(root, 'benchmarks', file))).digest('hex')])))

test('all four full snapshots use the frozen harness, locked native artifacts and complete case matrix', () => {
  for (const snapshot of snapshots) {
    const data = snapshot.report
    expect(data.schemaVersion).toBe(3)
    expect(data.smoke).toBe(false)
    expect(data.workload).toBe(snapshot.workload)
    expect(data.machine.platform).toBe(snapshot.platform)
    expect(data.runtime).toBe('Bun 1.4.4')
    expect(data.benchmarkDefinition).toEqual(frozenDefinition)
    expect(data.executionEnvironment.kind).toBe('github-actions')
    expect(data.executionEnvironment.commit).toMatch(/^[a-f\d]{40}$/)
    expect(data.executionEnvironment.runId).toMatch(/^\d+$/)
    expect(data.methodology.iterations).toBe(9)
    expect(data.methodology.warmups).toBe(2)
    expect(data.results.map(row => `${row.id}:${row.modules}`).sort()).toEqual(expectedCases)
    const native = data.nativeZig
    const artifact = zigRelease.libraries[native.platform]
    expect(native.version).toBe(zigRelease.version)
    expect(native.commit).toBe(zigRelease.commit)
    expect(native.archiveSha256).toBe(artifact.sha256)
    expect(native.bindingSha256).toBe(zigRelease.binding.sha256)
    expect(native.librarySha256).toMatch(/^[a-f\d]{64}$/)
    expect(native.target).toBe(artifact.target)
    expect(native.compiler).toBe(artifact.compiler)
    expect(native.optimize).toBe(artifact.optimize)
    expect(native.librarySha256).toBe(artifact.librarySha256)
    for (const row of data.results) {
      expect(row.version).not.toBe('see lockfile')
      expect(row.sourceFiles).toBe(row.modules + 1)
      expect(row.fixtureSha256).toMatch(/^[a-f\d]{64}$/)
      if (['dtsx', 'zig', 'dtsx-bundle'].includes(row.id)) expect(row.version).toBe(zigRelease.version)
      if (snapshot.workload === 'annotated' || ['tsc', 'tsgo', 'dtsx', 'zig', 'dtsx-bundle'].includes(row.id)) expect(row.status).toBe('passed')
      if (row.status === 'passed') {
        expect(row.samplesMs).toHaveLength(9)
        expect(row.samplesMs.every(time => Number.isFinite(time) && time > 0)).toBe(true)
        const sorted = [...row.samplesMs].sort((a, b) => a - b)
        expect(row.medianMs).toBe(sorted[4])
        expect(row.minMs).toBe(sorted[0])
        expect(row.maxMs).toBe(sorted[sorted.length - 1])
        expect(row.outputSha256).toMatch(/^[a-f\d]{64}$/)
      }
      else {
        expect(row.status).toBe('failed')
        expect(row.samplesMs).toHaveLength(0)
        expect(row.medianMs).toBeNull()
        expect(row.minMs).toBeNull()
        expect(row.maxMs).toBeNull()
        expect((row.error ?? '').length).toBeGreaterThan(0)
        expect(['emission', 'consumer qualification']).toContain(row.failureStage ?? '')
      }
    }
  }
})

test('every configuration receives identical fixture inputs on each platform', () => {
  for (const workload of ['annotated', 'inferred']) {
    const matching = snapshots.filter(snapshot => snapshot.workload === workload)
    for (const count of [1, 25, 100]) {
      const rows = matching.flatMap(snapshot => snapshot.report.results.filter(row => row.modules === count))
      expect(new Set(rows.map(row => row.fixtureSha256)).size).toBe(1)
    }
    expect(matching[0].report.results.map(row => [row.id, row.modules, row.version, row.group])).toEqual(matching[1].report.results.map(row => [row.id, row.modules, row.version, row.group]))
  }
  for (const count of [1, 25, 100]) {
    expect(snapshots[0].report.results.find(row => row.modules === count)?.fixtureSha256).not.toBe(snapshots[2].report.results.find(row => row.modules === count)?.fixtureSha256)
  }
})

test('built pages retain content, canonical URLs, and resolvable local assets and links', async () => {
  const pages = ['', 'docs/', 'benchmarks/', '404/']
  for (const route of pages) {
    const html = await readFile(join(root, 'dist', route, 'index.html'), 'utf8')
    expect(html).toContain('<h1')
    expect(html).toContain(`rel="canonical" href="https://dtsx.org/${route}"`)
    expect(html).not.toMatch(/\[(?:Include|Server Script|SEO|Component) Error/)
    expect(html).not.toMatch(/@(?:include|foreach|endforeach|nolayout)\b/)
    for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
      const path = match[1]
      if (!path || path === '/') continue
      const direct = Bun.file(join(root, 'dist', path))
      const directory = Bun.file(join(root, 'dist', path, 'index.html'))
      expect(await direct.exists() || await directory.exists()).toBe(true)
    }
  }
  const sitemap = await Bun.file(join(root, 'dist/sitemap.xml')).text()
  expect(sitemap).toContain('https://dtsx.org/')
  expect(sitemap).not.toContain('localhost')
  expect(sitemap).not.toContain('/404')
})

test('the homepage publishes the actual full-run bundled medians', async () => {
  const html = await Bun.file(join(root, 'dist/index.html')).text()
  for (const row of report.results.filter(row => row.modules === 100 && row.group === 'bundled-project')) {
    expect(html).toContain(benchmarkName(row))
    expect(html).toContain(row.medianMs!.toFixed(1))
  }
  const winner = report.results.filter(row => row.modules === 100 && row.group === 'project-emit').sort((a, b) => a.medianMs! - b.medianMs!)[0]
  expect(html).toContain(`${benchmarkName(winner)} has the lowest median`)
})


test('the lab exposes both platforms and both fixture workloads with their raw evidence', async () => {
  const html = await Bun.file(join(root, 'dist/benchmarks/index.html')).text()
  expect(html).toContain('id="benchmark-platform"')
  expect(html).toContain('id="benchmark-workload"')
  expect(html).toContain('Inferred APIs')
  const emptyEmitterGroup = snapshots.some(snapshot => !snapshot.report.results.some(row => row.group === 'project-emit' && row.status === 'passed'))
  expect(html.includes('No per-module emitter qualified for this fixture.')).toBe(emptyEmitterGroup)
  for (const snapshot of snapshots) {
    expect(html).toContain(`/benchmarks/${snapshot.file}`)
    for (const row of snapshot.report.results.filter(row => row.status === 'passed')) expect(html).toContain(row.medianMs!.toFixed(1))
  }
})

test('the lab publishes the engine benchmark tables with their machine', async () => {
  const html = await Bun.file(join(root, 'dist/benchmarks/index.html')).text()
  const engine = await Bun.file(join(root, 'public/benchmarks/engine.json')).json() as { machine: { cpu: string, model: string, memoryGB: number }, rows: Array<{ section: string, tool: string, avgNs: number }> }
  expect(html).toContain('id="engine-heading"')
  expect(html).toContain(engine.machine.cpu)
  expect(html).toContain(engine.machine.model)
  expect(html).toContain('/benchmarks/engine.json')
  const format = (ns: number): string => ns < 1e3 ? `${ns.toFixed(0)} ns` : ns < 1e6 ? `${(ns / 1e3).toFixed(2)} µs` : `${(ns / 1e6).toFixed(2)} ms`
  // In-process rows for every tool; CLI rows for the executables the page compares.
  const presented = (row: { section: string, tool: string }): boolean => row.section === 'inproc' || ((row.section === 'cli' || row.section === 'project') && row.tool !== 'dtsx')
  for (const row of engine.rows.filter(presented)) expect(html).toContain(format(row.avgNs))
})

test('benchmark pages present one dtsx and keep its JS SDK separate', async () => {
  for (const route of ['', 'benchmarks/']) {
    const html = await Bun.file(join(root, 'dist', route, 'index.html')).text()
    expect(html).not.toContain('zig-dtsx')
  }
  const lab = await Bun.file(join(root, 'dist/benchmarks/index.html')).text()
  expect(lab).toContain('dtsx JS SDK')
  expect(lab).toContain('id="engine-sdk-heading"')
  expect(lab).not.toContain('process call')
})

test('the JS SDK is described as running its native engine in-process', async () => {
  const lab = await Bun.file(join(root, 'dist/benchmarks/index.html')).text()
  expect(lab).toContain('runs its bundled native engine through Bun FFI')
  expect(lab).toContain('falling back to its TypeScript engine where no native library applies')
  expect(lab).not.toContain('The dtsx TypeScript SDK against')
})
