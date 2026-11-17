# CI performance audit — 17 November 2026

Baseline revision: `a5814536b4e7239e740ba95b5c2cfe0d6f152948`.
The changes are locally verified; no post-change GitHub Actions run has been
measured. Local timings are not hosted-runner results.

## Baseline

The five latest successful **Run Tests / test (22.x)** jobs, plus the intervening
failure, were fetched using GitHub's run and jobs APIs. Durations below are job
completion minus job start, including setup and post steps, not just Jest time.

| Run | Event | Result | Runner seconds |
| --- | --- | --- | ---: |
| [43132270626](https://github.com/tinkertanker/bamboobot-cert-generator/actions/runs/43132270626) | push | success | 160 |
| [43562001031](https://github.com/tinkertanker/bamboobot-cert-generator/actions/runs/43562001031) | PR | success | 166 |
| [43562421908](https://github.com/tinkertanker/bamboobot-cert-generator/actions/runs/43562421908) | PR | failure | 108 |
| [43562931757](https://github.com/tinkertanker/bamboobot-cert-generator/actions/runs/43562931757) | PR | success | 202 |
| [43563353408](https://github.com/tinkertanker/bamboobot-cert-generator/actions/runs/43563353408) | push | success | 150 |
| [43596392716](https://github.com/tinkertanker/bamboobot-cert-generator/actions/runs/43596392716) | push | success | 200 |

Successful-job median: **166 seconds**, range 150–202. Creation-to-completion
median, including queue time: **169 seconds**. These are five different revisions,
not a controlled replay or an all-outcome latency guarantee.

| Step | Median seconds | Latest run seconds |
| --- | ---: | ---: |
| Install dependencies | 37 | 48 |
| Node build, including worker and agent bundles | 36 | 44 |
| Full Jest suite | 17 | 26 |
| Lint | 4 | 4 |
| Cloudflare build | 52 | 63 |
| Wrangler dry run | 3 | 3 |

The latest log confirms 116 suites and 935 tests. It also shows that OpenNext
invokes `npm run build`, repeating PDF-worker compilation. npm's download cache
already hits. Next's application builds cannot be reused across Node and Workers:
their inlined runtime and persistence selectors differ.

The repository is public and uses standard `ubuntu-latest` runners. There is no
incremental GitHub-hosted runner charge to reduce here; runner-seconds and local
CPU-seconds measure resource use, not an invoice. No model-token or CodeRabbit
cost data was available. Six recent Claude-review workflows completed in 34–42
seconds; that is workflow elapsed time, not model usage.

The branch-protection API returned 403; the rulesets endpoint returned an empty
list. This does not prove there are no required checks. The workflow/job name,
Node matrix, event triggers and all existing check commands are preserved.
Claude and CodeRabbit configuration is untouched.

## Choices, in reviewable steps

1. **Earlier feedback and less obsolete work.** Run lint first, then generate
   Prisma and build the browser PDF worker before running all Jest tests. Both
   application builds and packaging still gate success, sequentially. Cancel
   only superseded PR runs; each main push gets a unique concurrency group.
   There is no path filter, draft bypass or new successful-skip path. Update the
   obsolete Node-16 Actions to commit-pinned checkout 7.0.1 and setup-node 7.1.0;
   their action runtime is Node 24, but the application still uses Node 22.
2. **Reuse compilation within one job.** Enable webpack's filesystem cache for
   the PDF worker. The preparation step creates it; both subsequent builds
   invoke webpack again and reuse unchanged compilation. `npm ci` clears this
   cache on every job. No remote cache, archive upload or stale bundle restore
   is added. Production and development caches have different names. Explicit
   build dependencies include both TypeScript configs, the lockfile, parser
   patch script and budget implementation: patched `node_modules` contents must
   not be treated as unchanged just because pdf-lib's version is unchanged.

The first step improves failure feedback; it does not make a successful workflow
finish earlier by itself. Type/build errors are discovered later in the order
than before; lint and test errors are discovered earlier. Main validation is
not removed or deferred to a schedule.

## Measurements and correctness

Local environment: Linux orb, four logical CPUs, about 8 GiB RAM, Node 22.23.5.
Measure with `/usr/bin/time -f 'elapsed=%e user=%U sys=%S maxrss=%M'` and separate
stdout/stderr logs. CPU time is user + system across child processes.

Three trials each, same sources and locked dependencies:

| PDF-worker compilation | Wall seconds, median (range) | CPU seconds, median |
| --- | ---: | ---: |
| `npm run build:worker -- --no-cache` | 7.38 (7.32–7.43) | 19.31 |
| Filesystem cache, empty at start | 8.73 (8.58–8.81) | 21.47 |
| Filesystem cache, warm | 1.02 (0.95–1.05) | 1.44 |

All nine invocations produced identical SHA-256 hashes for both worker bundles.
The cache occupied 32 MiB locally. Two uncached compilations cost approximately
14.76 wall seconds / 38.62 CPU seconds. Cold + warm costs 9.75 / 22.91: about five
wall seconds saved by caching alone. The new test order adds another warm
invocation and an explicit Prisma generation. Including those, the component
estimate is only **2–3 fewer wall seconds per full job**, not a measured hosted
workflow reduction. Earlier termination on a lint/test failure or cancellation
can save more; no cancellation savings are claimed from this small cohort.

The preparation step took 10.15 seconds. Applied to the historical step medians,
Jest feedback arrives about 22 seconds earlier after installation
(36 − 10.15 − 4); the latest-run estimate is about 30 seconds earlier. Lint no
longer waits behind the Node build and Jest (53 seconds at the component
medians). These estimates exclude queue changes and are not hosted observations.

`npm ci --prefer-offline` was tested in default/offline/offline/default order
with the npm cache populated. Default: 34.29 and 32.32 seconds; prefer-offline:
32.92 and 31.50. The roughly one-second difference is too small for a confident
benefit from two trials; installation flags, audit and lifecycle hooks stay
unchanged. The initial cache-filling install took 70.87 seconds and is not used
as the comparison baseline.

Verification performed:

- Before: full Jest, **116 suites / 935 tests passed**. After moving `.next`,
  `.open-next` and `build` out of the workspace root, lint and test preparation
  passed, followed by the same **116 suites / 935 tests**. Compared the sorted
  suite/test-name inventories, not just totals. After preparation, Jest took
  18.48 wall seconds; lint took 4.28 seconds.
- Seeded the worker cache, temporarily changed the parser-budget error text,
  rebuilt without clearing the cache and ran the real built-worker tests. Both
  worker modes observed the changed error and the two relevant assertions
  failed. Restoring the source and rebuilding restored the original hashes;
  parser-budget and built-worker tests passed **35/35**. No mutation remains.
- Built development mode into a scratch output directory, then rebuilt
  production. Separate cache directories existed and production hashes remained
  identical. The committed worker artifacts have no diff.
- Node and OpenNext builds completed; their generated configurations reported
  `node` and `workers` respectively, and OpenNext retained standalone output.
  Wrangler packaging ended with `--dry-run: exiting now.` No deployment ran.
- `actionlint` 1.7.12 passes. A YAML comparison confirms the same workflow name,
  triggers, matrix and every original command, without conditional skips or
  `continue-on-error`. `git diff --check` passes.

**Local build limitation:** Next 16.4.3 stops agent-run builds on a security
advisory, then permits its documented immediate retry. Both baseline and changed
builds encountered this; no reminder/guard was disabled and no retry was added
to CI. Successful post-change retry timings were 36.86 seconds for Node and
71.69 seconds for Cloudflare; dry-run packaging took 4.31 seconds. Cache warming
and retries make these unsuitable for claiming a controlled end-to-end speedup.
`npm audit` identifies [GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h)
as moderate, affecting Next 16.3.0–16.4.4, and offers 16.4.6. This is a dependency
advisory, not evidence that this Pages Router application uses the affected API.
An upgrade needs separate scope and compatibility verification.

## What did not transfer from OpenClaw

Sources: [Vincent's article](https://vincent.build/openclaw-ci-cost-reduction/),
[pinned CI workflow](https://github.com/openclaw/openclaw/blob/a7d05c7af04aa17ac57c994da238d0c60f058ca6/.github/workflows/ci.yml),
[scope planner](https://github.com/openclaw/openclaw/blob/a7d05c7af04aa17ac57c994da238d0c60f058ca6/scripts/ci-changed-scope.mjs),
and [webpack cache documentation](https://webpack.js.org/configuration/cache/).

OpenClaw's workflow separates planning from execution, bounds cache trust and
uses conservative full-scope fallback when changed-path computation fails. Its
headline savings combine changing workloads and runner sizes; its learned model
does not have authority to omit tests. Those percentages do not predict ours.

- No Jest affected-test selector: tests read generated workers, fonts and
  filesystem fixtures, beyond an ordinary import graph. At 17–26 seconds for
  the whole suite, an unqualified selector is a poor safety/maintenance tradeoff.
  All tests always run when the prerequisite steps succeed.
- No sharding or extra jobs: duplicate install/setup would increase resource
  use for a small suite. No Bun, Vitest or native compiler migration.
- No automatic-review removal: repeat reviews may be policy requirements, and
  no model-cost evidence supports weakening them.
- No next-build bypass or cross-runtime artifact reuse. No persistent Actions
  build cache until restore/save overhead and invalidation are measured.
- No test deletions based on duration. Existing security/parser, D1 and import
  contracts remain intact; this change adds no assertion-count padding.

## Hosted acceptance after approval to push

1. Push a review branch; verify `test (22.x)` still satisfies the repository's
   actual required-check configuration. Capture commit, runner image, Node/npm
   versions, queue time, job/step start/end times and outcomes using
   `gh api repos/tinkertanker/bamboobot-cert-generator/actions/runs/RUN_ID/jobs`.
2. Confirm a new PR revision cancels only its preceding test run, that another
   PR is unaffected and that both main pushes retain their complete checks.
   This requires real events; YAML linting cannot establish hosted behaviour.
3. Compare several equivalent baseline/candidate runs on the same runner class
   and npm-cache state. Include failures, cancellations and post steps in
   compute totals; distinguish first lint/test answer from final green status.
   Keep all tests, both builds and packaging in the comparison. Reject a net
   runtime regression; do not infer cost savings from fewer planned steps.

Until then, the evidence supports cache correctness and a small local resource
reduction, not a fleet-wide percentage or a new hosted latency guarantee.
