# Declaration benchmark lab

Run from this directory with Bun 1.4.4:

```sh
bun install --frozen-lockfile
bun run.ts --smoke
bun run.ts
```

The complete run writes `public/benchmarks/results.json`. The smoke run qualifies adapters and never replaces published timings. Dependencies are exact versions with a separate lockfile so website updates cannot silently change the benchmark tools.

Each sample starts a new process with a fresh output directory. Timings include imports, source reads, generation, writes, and tool disposal. Inputs and strict consumer checks are outside timing. Filesystem caches are warm, but tool result caches do not survive between samples. Runs are sequential, with tool order rotated each round, two warmups, and nine measured samples. Report medians and ranges, not the single fastest run.

Three workloads stay separate: per-module emission, compiler emission with semantic checks, and a standalone declaration bundle. A compiler does more work than an unchecked emitter. Bundlers also differ in typechecking and JavaScript emission: Vite runs its JS pipeline, tsup uses declaration-only mode, tsdown runs with `emitDtsOnly`, and Rollup/API Extractor include the prerequisite tsc emission. These are useful workflow comparisons, not equivalent compiler internals.

Every sample must exit successfully, emit declarations, pass a strict positive consumer covering every module, and reject two negative assignments with exactly TS2322. Bundles are copied into a standalone directory before validation, preventing unresolved internal references from passing accidentally. These controls catch missing exports and permissive `any` for the exercised API. They do not establish equivalence for all TypeScript.

Fixtures are deterministic synthetic libraries with annotated interfaces, re-exports, generics, class private fields, mapped types, and enums. The sizes are 1, 25, and 100 modules plus an entrypoint. They exclude JSX, third-party dependencies, watch mode, incremental rebuilds, and maps. Published results are a single-machine snapshot; rerun for your project and hardware.

The Zig package published on npm is `@stacksjs/zig-dtsx@0.9.26`, whereas the development repository has a newer `zig-dtsx` workspace. The published package contains a Linux x64 shared library and no macOS library. Its unavailability is recorded rather than substituting a local development build or timing a failure. All other tools use published packages.

Primary documentation checked November 7, 2026:

- [Oxc isolated declarations](https://oxc.rs/docs/guide/usage/transformer/isolated-declarations.html)
- [tsdown declaration generation](https://tsdown.dev/options/dts)
- [rolldown-plugin-dts](https://github.com/sxzz/rolldown-plugin-dts)
- [unplugin-isolated-decl](https://github.com/unplugin/unplugin-isolated-decl)
- [unplugin-dts](https://github.com/qmhc/unplugin-dts)
- [dts-bundle-generator](https://github.com/timocov/dts-bundle-generator)

Vite and Rollup integrations represent their declaration plugins. JavaScript-only transpilers such as esbuild and Babel do not emit TypeScript declarations themselves, so a standalone JS-transpile timing would not be a declaration benchmark. No finite suite covers every tool; this lab covers the direct emitters and commonly used declaration build pipelines listed in the adapters.
