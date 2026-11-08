/** Install verified release artifacts before, never during, a benchmark sample. */
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { arch, platform, tmpdir } from 'node:os'
import { join } from 'node:path'
import { dlopen, FFIType } from 'bun:ffi'
import release from './zig-release.json'

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

const directory = join(import.meta.dir, '.native/zig-dtsx')
const platformKey = `${platform() === 'win32' ? 'windows' : platform()}-${arch()}`
const artifact = release.libraries[platformKey as keyof typeof release.libraries]

/** Preserve the actual system loader error instead of hiding it in the binding's fallback. */
function verifyNativeLoader(): void {
  if (!artifact) throw new Error(`No pinned Zig artifact for ${platformKey}`)
  const library = dlopen(join(directory, 'prebuilt', platformKey, artifact.file), {
    result_length: { args: [FFIType.ptr], returns: FFIType.u64 },
  })
  library.close()
}

async function download(url: string, expected: string): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`Native download failed: HTTP ${response.status}: ${url}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (sha256(bytes) !== expected) throw new Error(`Native checksum mismatch: ${url}`)
  return bytes
}

export interface NativeProvenance {
  version: string
  repository: string
  tag: string
  commit: string
  platform: string
  asset: string
  archiveSha256: string
  bindingSha256: string
  librarySha256: string
  url: string
  target?: string
  compiler?: string
  optimize?: string
}

/** Reject stale or modified installs before any samples are timed. */
export async function nativeProvenance(): Promise<NativeProvenance> {
  if (!artifact) throw new Error(`No pinned Zig artifact for ${platformKey}`)
  // The official binding prefers zig-out over prebuilt. Reject that override so
  // a stray local build can never bypass the release checksum.
  if (await Bun.file(join(directory, 'zig-out/lib', artifact.file)).exists()
    || await Bun.file(join(directory, 'zig-out/bin', artifact.file)).exists())
    throw new Error('A local Zig build shadows the release; run bun setup-zig.ts')
  const provenance: NativeProvenance = JSON.parse(await readFile(join(directory, 'provenance.json'), 'utf8'))
  const binding = await readFile(join(directory, 'src/index.ts'))
  const library = await readFile(join(directory, 'prebuilt', platformKey, artifact.file))
  if (provenance.commit !== release.commit || provenance.platform !== platformKey
    || provenance.archiveSha256 !== artifact.sha256 || sha256(binding) !== release.binding.sha256
    || ('librarySha256' in artifact && sha256(library) !== artifact.librarySha256)
    || sha256(library) !== provenance.librarySha256)
    throw new Error('Zig artifacts do not match the lock; run bun setup-zig.ts')
  return provenance
}

export async function setupNativeZig(): Promise<void> {
  if (!artifact) throw new Error(`No pinned Zig artifact for ${platformKey}`)
  try {
    await nativeProvenance()
    verifyNativeLoader()
    console.log(`zig-dtsx ${release.version} (${platformKey}) verified`)
    return
  }
  catch { /* Replace an absent or incomplete install below. */ }
  const staging = await mkdtemp(join(tmpdir(), 'dtsx-native-setup-'))
  const pending = `${directory}.pending`
  try {
    const sourceBase = `https://raw.githubusercontent.com/${release.repository}/${release.commit}`
    const url = `https://github.com/${release.repository}/releases/download/${release.tag}/${artifact.asset}`
    const [binding, license, archive] = await Promise.all([
      download(`${sourceBase}/${release.binding.path}`, release.binding.sha256),
      download(`${sourceBase}/${release.license.path}`, release.license.sha256),
      download(url, artifact.sha256),
    ])
    const packageDir = join(staging, 'package')
    const libraryDir = join(packageDir, 'prebuilt', platformKey)
    await mkdir(libraryDir, { recursive: true })
    await mkdir(join(packageDir, 'src'), { recursive: true })
    const archivePath = join(staging, artifact.asset)
    await writeFile(archivePath, archive)
    const child = Bun.spawn(['tar', '-xzf', archivePath, '-C', libraryDir, artifact.file], { stdout: 'pipe', stderr: 'pipe' })
    const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()])
    if (code !== 0) throw new Error(`Could not unpack Zig: ${error}`)
    await writeFile(join(packageDir, 'src/index.ts'), binding)
    await writeFile(join(packageDir, 'LICENSE.md'), license)
    const provenance: NativeProvenance = {
      version: release.version, repository: release.repository, tag: release.tag, commit: release.commit,
      platform: platformKey, asset: artifact.asset, archiveSha256: artifact.sha256,
      bindingSha256: release.binding.sha256,
      librarySha256: sha256(await readFile(join(libraryDir, artifact.file))),
      url: `https://github.com/${release.repository}/releases/tag/${release.tag}`,
      ...('target' in artifact ? { target: artifact.target, compiler: artifact.compiler, optimize: artifact.optimize } : {}),
    }
    await writeFile(join(packageDir, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n')
    await mkdir(join(import.meta.dir, '.native'), { recursive: true })
    await rm(pending, { recursive: true, force: true })
    await cp(packageDir, pending, { recursive: true })
    await rm(directory, { recursive: true, force: true })
    await rename(pending, directory)
    await nativeProvenance()
    verifyNativeLoader()
    console.log(`Installed verified zig-dtsx ${release.version} (${platformKey})`)
  }
  finally {
    await rm(staging, { recursive: true, force: true })
    await rm(pending, { recursive: true, force: true })
  }
}

if (import.meta.main) await setupNativeZig()
