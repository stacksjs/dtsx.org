# GitHub Actions

- `ci.yml`: lint, typecheck, native Stacks build, and artifact verification. A successful push to `main` then deploys with `./buddy deploy --prod --yes`, including native DNS reconciliation and TLS.
- `benchmarks.yml`: a manually dispatched, sequential Linux benchmark run. Uploads raw results for review without replacing the published snapshot.
- `buddy-bot.yml`: Stacks dependency maintenance using buddy-bot.
