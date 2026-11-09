import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { processSource } from '@dtsx/dtsx'
import { generateStaticSite } from '@stacksjs/stx/ssg'
import { CSSGenerator, defaultConfig } from '@stacksjs/ts-css/engine'

const root = import.meta.dir
const source = `export interface Options {\n  name: string\n  retries?: number\n}\n\nexport function greet(options: Options): string {\n  return \`Hello, \${options.name}\`\n}`
const declaration = processSource(source, 'example.ts', true, [], true)
if (!declaration.includes('declare function greet')) throw new Error('Example declaration generation failed')
await mkdir(join(root, 'resources/data'), { recursive: true })
await writeFile(join(root, 'resources/data/example.json'), JSON.stringify({ source, declaration }, null, 2))

// The homepage showcase: dtsx's declaration is emitted here from the published
// SDK; tsc's comes from a snapshot (scripts/showcase-tsc.ts).
const showcaseSource = await readFile(join(root, 'resources/data/showcase.ts.txt'), 'utf8')
const showcaseDeclaration = processSource(showcaseSource, 'showcase.ts')
if (!showcaseDeclaration.includes('@defaultValue')) throw new Error('Showcase declaration lost its @defaultValue annotations')
await writeFile(join(root, 'resources/data/showcase.json'), `${JSON.stringify({ source: showcaseSource, declaration: showcaseDeclaration }, null, 2)}\n`)
await rm(join(root, 'dist'), { recursive: true, force: true })
const result = await generateStaticSite({
  pagesDir: join(root, 'resources/views'),
  partialsDir: join(root, 'resources/partials'),
  componentsDir: join(root, 'resources/components'),
  outputDir: join(root, 'dist'),
  publicDir: join(root, 'public'),
  baseUrl: '/',
  domain: 'https://dtsx.org',
  sitemap: true,
  robots: true,
  trailingSlash: true,
  cache: false,
  minify: false,
  generate404: false,
  failOnServerScriptError: true,
  failOnIncludeError: true,
})
if (result.failedCount > 0) throw new Error(`STX static build failed: ${JSON.stringify(result.errors)}`)
const generator = new CSSGenerator(defaultConfig)
for await (const path of new Bun.Glob('**/*.html').scan(join(root, 'dist'))) {
  const html = await readFile(join(root, 'dist', path), 'utf8')
  for (const match of html.matchAll(/class="([^"]+)"/g)) {
    for (const token of match[1].split(/\s+/)) generator.generate(token)
  }
}
await mkdir(join(root, 'dist/assets'), { recursive: true })
await writeFile(join(root, 'dist/assets/utilities.css'), generator.toCSS())
await writeFile(join(root, 'dist/benchmarks/methodology.md'), await readFile(join(root, 'benchmarks/README.md')))
console.log(`Built ${result.pages.length} STX pages with ts-css`)
