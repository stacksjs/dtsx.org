import { expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')
const report = await Bun.file(join(root, 'public/benchmarks/results.json')).json()
const zigRelease = await Bun.file(join(root, 'benchmarks/zig-release.json')).json()

test('published benchmark evidence contains complete, qualified measured samples', () => {
  expect(report.smoke).toBe(false)
  expect(report.results).toHaveLength(48)
  expect(report.methodology.iterations).toBe(9)
  expect(report.nativeZig.version).toBe(zigRelease.version)
  expect(report.nativeZig.commit).toBe(zigRelease.commit)
  expect(report.nativeZig.archiveSha256).toBe(zigRelease.libraries[report.nativeZig.platform].sha256)
  expect(report.nativeZig.bindingSha256).toBe(zigRelease.binding.sha256)
  expect(report.nativeZig.librarySha256).toMatch(/^[a-f\d]{64}$/)
  const zigRows = report.results.filter((row: { id: string }) => row.id === 'zig')
  expect(zigRows).toHaveLength(3)
  expect(zigRows.map((row: { modules: number }) => row.modules).sort((a: number, b: number) => a - b)).toEqual([1, 25, 100])
  for (const row of zigRows) expect(row.version).toBe(zigRelease.version)
  for (const row of report.results) {
    expect(row.version).not.toBe('see lockfile')
    expect(row.status).toBe('passed')
    if (row.status === 'passed') {
      expect(row.samplesMs).toHaveLength(9)
      expect(row.samplesMs.every((time: number) => Number.isFinite(time) && time > 0)).toBe(true)
      const ordered = [...row.samplesMs].sort((a, b) => a - b)
      expect(row.medianMs).toBe(ordered[4])
      expect(row.outputSha256).toMatch(/^[a-f\d]{64}$/)
    }
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
  for (const row of report.results.filter((row: { modules: number, group: string }) => row.modules === 100 && row.group === 'bundled-project')) {
    expect(html).toContain(row.name)
    expect(html).toContain(row.medianMs.toFixed(1))
  }
  const winner = report.results.filter((row: { modules: number, group: string }) => row.modules === 100 && row.group === 'project-emit').sort((a: { medianMs: number }, b: { medianMs: number }) => a.medianMs - b.medianMs)[0]
  expect(html).toContain(`${winner.name} leads`)
})
