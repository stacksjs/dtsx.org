# Declaration benchmark lab

Run from this directory with Bun 1.4.4:

```sh
bun install --frozen-lockfile
bun setup-zig.ts
bun test fixtures.test.ts
bun run.ts --smoke --workload=annotated --require-all
bun run.ts --workload=annotated --require-all
bun run.ts --workload=inferred --require-baselines
```

The manual **Benchmark lab** workflow runs both fixture workloads on macOS and Linux. Each job runs all 16 configurations sequentially on one runner. The four snapshots remain separate:

| Platform | Fixture workload | Published file |
|---|---|---|
| macOS | Explicit annotations | `public/benchmarks/results.json` |
| Linux | Explicit annotations | `public/benchmarks/results-linux.json` |
| macOS | Inferred APIs | `public/benchmarks/results-inferred.json` |
| Linux | Inferred APIs | `public/benchmarks/results-linux-inferred.json` |

Local runs choose the filename from the operating system and workload. Smoke runs write ignored `smoke-<workload>.json` files and never replace published timings. Dependencies are exact versions with a separate lockfile. The snapshots record hashes of the harness, adapters, fixture generator, lockfile and each authored fixture, plus the workflow run and source commit.

Each sample starts a new process with a fresh output directory. Timings include imports, source reads, generation, writes and tool disposal. Inputs and strict consumer checks are outside timing. Filesystem caches are warm, but incremental and result caches do not survive between samples. Runs are sequential, with tool order rotated each round, two warmups and nine measured samples. Medians and ranges are published, not just the fastest run.

Three output groups stay separate: per-module emission, compiler emission with semantic checks, and a standalone declaration bundle. A compiler does more work than an unchecked emitter. Bundlers also differ in typechecking and JavaScript emission: Vite runs its JS pipeline, tsup uses declaration-only mode, tsdown uses `emitDtsOnly`, and Rollup/API Extractor include prerequisite tsc emission. These are workflow comparisons, not equivalent compiler internals.

## Two fixture workloads

**Explicit annotations** use interfaces, re-exports, generic classes, private fields, mapped types and enums. Public types are authored explicitly, and `isolatedDeclarations` is enabled.

**Inferred APIs** contain no type annotations or type assertions. They exercise inferred parameter defaults, function returns, arrow functions, class members, mutable object properties, arrays and exported results of imported functions. The AST test checks that annotations have not slipped into this workload. `isolatedDeclarations` is disabled. The adapters request inference where available: dtsx receives `isolatedDeclarations: false`, and Zig uses its source-inference mode. Isolated-only adapters are still attempted through their supported declaration APIs. They receive the same unannotated source, with no annotated replacement.

Both workloads use 1, 25 and 100 modules plus an entrypoint. They exclude JSX, third-party dependencies, watch mode, incremental rebuilds and declaration maps. Changing the fixture also changes the work a tool can perform, so compare within the selected platform, fixture and output group.

## Correctness before timing claims

Every accepted sample must exit successfully, emit declarations, pass a strict TypeScript 6 positive consumer covering every module and reject two negative assignments with exactly TS2322. `skipLibCheck` is false. Positive controls reject `any` in exercised public API positions. The inference controls also check expected type widening, including mutable settings, arrays, imported values and returned objects. A regression test verifies that the consumer accepts compiler output and rejects mutations to `any` or overly narrow literal types. Bundles are copied into a standalone directory before checking, so unresolved internal references cannot pass accidentally.

A failed configuration stays in the results with its emission or consumer diagnostic. It receives no median and no accepted timing samples. It is not ranked. This includes dtsx and Zig if their emitted inferred API does not pass. A failure describes this configuration against this fixture; it does not prove a tool cannot handle any unannotated source. Neither workload establishes correctness for arbitrary TypeScript.

`--require-all` requires every selected configuration to qualify and is used for the annotated suite. The inference suite uses `--require-baselines`: both checked TypeScript compilers must qualify at every size, while other failures remain visible as results. Unsupported or incorrect output is never counted as a fast result. All successful full-run rows contain nine samples; failed or partial configurations retain no accepted performance claim.

## Native Zig release provenance

Zig uses `zig-dtsx` v0.11.31 from [GitHub Releases](https://github.com/stacksjs/dtsx/releases/tag/v0.11.31). `zig-release.json` pins release commit `78404ebf3762331a5d3204ed5d31731de5ad75c2`, its matching Bun FFI binding and each platform archive by SHA-256. `bun setup-zig.ts` installs under ignored `.native`, verifies hashes and probes the actual system loader before measurement. No Zig compiler is needed on a benchmark runner. Downloads, extraction, verification and qualification tests happen outside timing.

The original Linux shared libraries used the default musl target and requested `libc.so`. On a glibc host that path is a linker script, causing `invalid ELF header`. The additional `*-linux-*-gnu.tar.gz` release assets correct the shared-library target to GNU libc 2.17. They use the unchanged tagged emitter, original Zig `0.17.0-dev.1282+c0f9b51d8` compiler and ReleaseFast settings. Both x64 and arm64 assets passed packaged FFI loading and strict consumer checks on their matching Linux architectures before publication. The [repair manifest](https://github.com/stacksjs/dtsx/releases/download/v0.11.31/linux-gnu-manifest.json) records source, compiler, targets, qualification workflow and hashes. Original assets and checksums remain unchanged. The website lock pins the additional assets; raw Linux results include the target, compiler and optimization level.

Each timed Zig worker loads the released library, reads every file, emits in the selected annotated or inference mode and writes declarations. No development emitter build is substituted. Both platforms and both workloads are rerun across every configuration; previous timings are not spliced into the new comparison.

CI gates deployment on annotated native qualification on Linux x64/arm64 and Apple silicon/Intel macOS. The website checks all four full snapshots, their fixture identities, baseline consumers, accepted sample counts and published page values. Each snapshot records its actual hardware and runtime. Virtualization and shared host activity can affect timings. A disk-space preflight aborts resource-constrained runs.

Primary documentation checked November 7, 2026:

- [Oxc isolated declarations](https://oxc.rs/docs/guide/usage/transformer/isolated-declarations.html)
- [tsdown declaration generation](https://tsdown.dev/options/dts)
- [rolldown-plugin-dts](https://github.com/sxzz/rolldown-plugin-dts)
- [unplugin-isolated-decl](https://github.com/unplugin/unplugin-isolated-decl)
- [unplugin-dts](https://github.com/qmhc/unplugin-dts)
- [dts-bundle-generator](https://github.com/timocov/dts-bundle-generator)

Vite and Rollup integrations represent their declaration plugins. JavaScript-only transpilers such as esbuild and Babel do not emit TypeScript declarations themselves, so a standalone JS-transpile timing would not be a declaration benchmark. No finite suite covers every tool; this lab covers the direct emitters and commonly used declaration build pipelines listed in the adapters.
