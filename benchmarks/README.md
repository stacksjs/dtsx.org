# Declaration benchmark lab

Run from this directory with Bun 1.4.4:

```sh
bun install --frozen-lockfile
bun setup-zig.ts
bun run.ts --smoke
bun run.ts
```

The complete run writes `public/benchmarks/results.json`. The smoke run qualifies adapters and never replaces published timings. Dependencies are exact versions with a separate lockfile so website updates cannot silently change the benchmark tools.

Each sample starts a new process with a fresh output directory. Timings include imports, source reads, generation, writes, and tool disposal. Inputs and strict consumer checks are outside timing. Filesystem caches are warm, but tool result caches do not survive between samples. Runs are sequential, with tool order rotated each round, two warmups, and nine measured samples. Report medians and ranges, not the single fastest run.

Three workloads stay separate: per-module emission, compiler emission with semantic checks, and a standalone declaration bundle. A compiler does more work than an unchecked emitter. Bundlers also differ in typechecking and JavaScript emission: Vite runs its JS pipeline, tsup uses declaration-only mode, tsdown runs with `emitDtsOnly`, and Rollup/API Extractor include the prerequisite tsc emission. These are useful workflow comparisons, not equivalent compiler internals.

Every sample must exit successfully, emit declarations, pass a strict positive consumer covering every module, and reject two negative assignments with exactly TS2322. Bundles are copied into a standalone directory before validation, preventing unresolved internal references from passing accidentally. These controls catch missing exports and permissive `any` for the exercised API. They do not establish equivalence for all TypeScript.

Fixtures are deterministic synthetic libraries with annotated interfaces, re-exports, generics, class private fields, mapped types, and enums. The sizes are 1, 25, and 100 modules plus an entrypoint. They exclude JSX, third-party dependencies, watch mode, incremental rebuilds, and maps. Published results are a single-runner snapshot; rerun for your project and hardware. The full macOS rerun is the website default, and hosted Linux results are kept separately. Timings from different operating systems are never combined. Hardware, runtime, workflow run, and source commit are recorded in each result file. Virtualization and shared host activity can affect timing. A disk-space preflight aborts a resource-constrained run instead of treating failed writes as tool performance.

Zig uses the supported `zig-dtsx` v0.11.31 release from [GitHub Releases](https://github.com/stacksjs/dtsx/releases/tag/v0.11.31), not the obsolete scoped npm package. `zig-release.json` pins release commit `78404ebf3762331a5d3204ed5d31731de5ad75c2`, the matching official Bun FFI binding, and each platform's shared-library archive by SHA-256. `bun setup-zig.ts` verifies and installs those artifacts under the ignored `.native` directory. It requires Bun and tar, not a Zig compiler. The lock includes macOS arm64/x64 and Linux arm64/x64 artifacts; each report records the measured platform and its qualification status. All tools use released artifacts.

Every run verifies the installed binding and library before creating fixtures. Downloads, extraction, and checksum verification happen outside timing. Each timed Zig worker loads the native library, emits every file in isolated-declaration mode, and writes its declarations just like the other per-module adapters. The raw results retain the release commit, platform, asset URL, archive checksum, binding checksum, and extracted library checksum.

The earlier snapshot excluded Zig because it used an obsolete npm distribution. The current dataset replaces that snapshot with a full rerun of every tool; no old timings are spliced into the new comparison. The release artifacts also load on macOS without depending on a developer's local build or toolchain selection.

CI gates deployment on the released Zig library passing the strict positive/negative consumer on both Apple silicon and Intel macOS runners. `bun run.ts --smoke --tools=zig --require-all` runs that qualification. `--require-all` returns failure after saving evidence if any selected tool fails, so unavailable binaries cannot silently pass CI. The separate Linux run records a native-library loading failure for the official Linux release on the hosted Ubuntu runner. Its Zig rows are failed qualifications with no accepted timings. This does not exclude Zig from the complete macOS comparison shown on the website.

Primary documentation checked November 7, 2026:

- [Oxc isolated declarations](https://oxc.rs/docs/guide/usage/transformer/isolated-declarations.html)
- [tsdown declaration generation](https://tsdown.dev/options/dts)
- [rolldown-plugin-dts](https://github.com/sxzz/rolldown-plugin-dts)
- [unplugin-isolated-decl](https://github.com/unplugin/unplugin-isolated-decl)
- [unplugin-dts](https://github.com/qmhc/unplugin-dts)
- [dts-bundle-generator](https://github.com/timocov/dts-bundle-generator)

Vite and Rollup integrations represent their declaration plugins. JavaScript-only transpilers such as esbuild and Babel do not emit TypeScript declarations themselves, so a standalone JS-transpile timing would not be a declaration benchmark. No finite suite covers every tool; this lab covers the direct emitters and commonly used declaration build pipelines listed in the adapters.
