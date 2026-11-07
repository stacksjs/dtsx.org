# GitHub Actions

- `ci.yml`: lint, typecheck, native Stacks build, and artifact verification plus native Zig qualification on macOS and Linux. A successful push to `main` then deploys with `./buddy deploy --prod --yes`, including native DNS reconciliation and TLS.
- `benchmarks.yml`: a manually dispatched, sequential benchmark run on each of macOS and Linux. Uploads raw results for review without replacing the published snapshot.
- `buddy-bot.yml`: Stacks dependency maintenance using buddy-bot.
