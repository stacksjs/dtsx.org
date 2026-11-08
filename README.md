# dtsx.org

The dtsx website, built with [Stacks](https://stacksjs.com), STX, ts-css, and Bun. Maintained by Chris Breuer.

## Work locally

```sh
bun install --frozen-lockfile
bun run dev
bun run build
bun run typecheck
bun run test
./buddy lint
```

`./buddy build:views` runs the app's `build.ts` using native STX static generation and ts-css. The output is `dist/`. Application pages live in `resources/views`, shared fragments in `resources/partials`, and assets in `public`.

## Benchmarks

The benchmark toolchain has its own manifest and lockfile under [`benchmarks`](benchmarks/README.md). Install there and run `bun setup-zig.ts` first. The Zig binding and platform library come from checksum-pinned official release assets, including corrected GNU libc libraries for Linux. The website exposes separate macOS and Linux snapshots for explicitly annotated and unannotated inference workloads. The manual **Benchmark lab** GitHub workflow reruns every configuration in each selected workload and saves artifacts for review. It does not automatically replace the published snapshots.

## Deployment

Pushes to `main` run lint, typechecking, the native Stacks view build, artifact checks, and native Zig qualification on Linux x64/arm64 and Apple silicon/Intel macOS runners. After those pass, the same workflow calls `./buddy deploy --prod --yes`. Deploys are serialized and use the exact checked commit. Pull requests never receive production credentials or deploy. Inferred-output failures remain explicit in the benchmark evidence and never receive accepted timings.

`config/cloud.ts` declares an isolated server-static tenant on the existing Stacks host, plus a permanent www redirect. Stacks handles packaging, release activation, reverse-proxy configuration, and TLS. No frontend app service or database is needed.

The GitHub `production` environment supplies `DEPLOY_SSH_KEY`, `SSH_KNOWN_HOSTS`, `HCLOUD_TOKEN`, `APP_KEY`, `PORKBUN_API_KEY`, and `PORKBUN_SECRET_KEY`. Values are never committed. `.env.production` contains only public app settings. Porkbun API access is enabled for dtsx.org. The native Stacks deploy flow reconciles DNS from the declared sites using the production environment credentials.

Production: [dtsx.org](https://dtsx.org). Source: [stacksjs/dtsx.org](https://github.com/stacksjs/dtsx.org). Library: [stacksjs/dtsx](https://github.com/stacksjs/dtsx).
