/**
 * Pin a published zig-dtsx release for the lab: `bun pin-zig-release.ts v0.11.33`.
 *
 * Every archive must match the release's checksums.txt and its provenance
 * (native-build.json or release-manifest.json) before its library hash is
 * recorded. Downloads and archive
 * extraction happen in a temporary directory; nothing is executed.
 */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tag = process.argv[2]
if (!tag?.startsWith('v')) throw new Error('Usage: bun pin-zig-release.ts v<version>')

const lockPath = join(import.meta.dir, 'zig-release.json')
const previous = JSON.parse(await readFile(lockPath, 'utf8'))
const releaseBase = `https://github.com/${previous.repository}/releases/download/${tag}`

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Release provenance: a hand-attached native-build.json (v0.11.32), or the
 * release workflow's release-manifest.json. The manifest records the commit
 * and archive hashes; its toolchain is the one release.yml pins (Zig 0.17.1,
 * -Doptimize=fast, GNU libc 2.17 Linux libraries), carried over from the
 * previous lock.
 */
async function releaseProvenance(): Promise<{ tag: string, sourceCommit: string, archives: Record<string, string>, compiler: string, optimize: string, linuxLibraryTargets: string[] }> {
  const legacy = await fetch(`${releaseBase}/native-build.json`, { signal: AbortSignal.timeout(60_000) })
  if (legacy.ok) return await legacy.json()
  const manifest = JSON.parse(new TextDecoder().decode(await fetchBytes(`${releaseBase}/release-manifest.json`)))
  const linux = ['linux-x64', 'linux-arm64'].map(key => previous.libraries[key].target)
  return {
    tag: manifest.tag,
    sourceCommit: manifest.commit,
    archives: Object.fromEntries(manifest.assets.map((asset: { name: string, sha256: string }) => [asset.name, asset.sha256])),
    compiler: previous.libraries['darwin-arm64'].compiler,
    optimize: previous.libraries['darwin-arm64'].optimize,
    linuxLibraryTargets: linux,
  }
}

const provenance = await releaseProvenance()
if (provenance.tag !== tag) throw new Error(`Release provenance describes ${provenance.tag}, not ${tag}`)
const checksums = new Map(new TextDecoder().decode(await fetchBytes(`${releaseBase}/checksums.txt`)).trim().split('\n').map((line) => {
  const [hash, name] = line.trim().split(/\s+/)
  return [name, hash] as const
}))

const staging = await mkdtemp(join(tmpdir(), 'dtsx-pin-'))
try {
  const libraries: Record<string, unknown> = {}
  for (const [platform, artifact] of Object.entries<any>(previous.libraries)) {
    const archive = await fetchBytes(`${releaseBase}/${artifact.asset}`)
    const archiveSha256 = sha256(archive)
    if (archiveSha256 !== checksums.get(artifact.asset) || archiveSha256 !== provenance.archives?.[artifact.asset])
      throw new Error(`${artifact.asset} does not match the release checksums and provenance`)
    const directory = join(staging, platform)
    await Bun.write(join(directory, artifact.asset), archive)
    const child = Bun.spawnSync(['tar', '-xzf', join(directory, artifact.asset), '-C', directory, artifact.file])
    if (child.exitCode !== 0) throw new Error(`Could not unpack ${artifact.asset}: ${child.stderr.toString()}`)
    const linuxTarget = platform === 'linux-x64' ? provenance.linuxLibraryTargets?.[0] : platform === 'linux-arm64' ? provenance.linuxLibraryTargets?.[1] : undefined
    libraries[platform] = {
      ...artifact,
      sha256: archiveSha256,
      librarySha256: sha256(await readFile(join(directory, artifact.file))),
      target: linuxTarget ?? artifact.target,
      compiler: provenance.compiler,
      optimize: provenance.optimize,
    }
  }
  const sourceBase = `https://raw.githubusercontent.com/${previous.repository}/${provenance.sourceCommit}`
  const lock = {
    version: tag.slice(1),
    repository: previous.repository,
    tag,
    commit: provenance.sourceCommit,
    binding: { path: previous.binding.path, sha256: sha256(await fetchBytes(`${sourceBase}/${previous.binding.path}`)) },
    license: { path: previous.license.path, sha256: sha256(await fetchBytes(`${sourceBase}/${previous.license.path}`)) },
    libraries,
  }
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  console.log(`Pinned zig-dtsx ${tag} at ${provenance.sourceCommit}`)
}
finally {
  await rm(staging, { recursive: true, force: true })
}
