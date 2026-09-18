---
title: The blocker that was never a credential
description: Two months with the last lab phase waiting on a Vercel secret that, once added, opened no door at all. The load test didn't need a permission: it needed someone to reread its own guardrail.
date: 2026-09-18
tags: [k6, load-testing, ci-cd, lab, postmortem]
lang: en
translationOf: el-bloqueo-que-no-era-una-credencial
---

For two months, every to-do list in this project opened with the same line: `VERCEL_TOKEN` is missing from the GitHub secrets. Underneath it, the consequence: without it, the automatic rollback only warns instead of reverting, and Phase 5 of the lab (load testing with k6) has no preview environment to run against.

The first half was true. The second was not, and nobody checked, because the item was copied from list to list without ever being reverified. When I finally loaded the token, rollback was enabled in five minutes and the load tests stayed exactly as blocked as before. The credential opened no door, because the door the plan described did not exist.

## What the plan said

The original design was reasonable: load never runs against production (Vercel bills per invocation and active CPU, Turso has a rows-read quota, and a thousand synthetic users look a lot like an attack), so it runs against a disposable preview deployment. Asking Vercel for that URL takes a token. Hence the dependency.

Something happened between writing that plan and implementing it: in August, a k6 run against `localhost` drained the real database's read quota. The local server was up with a `.env` pointing at production's Turso, and one in four requests in the mix went to `/status`, which aggregates ninety days of probes on every render. The URL was local. The database was not.

The answer to that incident was a two-halves guardrail in the shared profile of the scripts:

```js
export function exigirBaseLocal(base) {
  const res = http.get(`${base}/api/health`, { timeout: '10s' })
  // ...
  if (salud?.checks?.db?.local !== true) {
    exec.test.abort(`El objetivo ${base} está conectado a una base REMOTA.`)
  }
}
```

The first half looks at the target URL and rejects production domains. The second one, the half that actually mattered, asks which database that target is connected to before spinning up a single virtual user.

## The contradiction nobody read out loud

A Vercel preview deployment reads from Turso. That is what makes it useful: it is the real site, with real data. And it is exactly what the guardrail forbids.

With or without the token, a run against a preview aborts in `setup()`, before the first load request. The blocker was never administrative, it was a design conflict, and it had been sitting in the repository in writing for two months: the plan asked for a target the code refused to accept. Both pieces were correct on their own. Nobody read them together.

It is worth pausing on why this trap works so well. An item blamed on a credential is comfortable: it asks for no thinking, only waiting. It gets copied from one list to the next without rereading the reason, and every copy makes it look more verified than it is. To-do items that depend on third parties deserve a periodic reread precisely because nobody argues with them.

## The way out was in the e2e suite

This site's end-to-end tests had been solving the same problem for months without calling it that: they bring the site up against two disposable libSQL databases seeded when the test server starts. Nothing remote, nothing that costs money, nothing that depends on a secret.

The load workflow does the same. It installs dependencies, seeds the databases with the very same script the e2e tests use, starts the server on the runner itself, confirms via `/api/health` that the database is local, and only then unleashes k6 against that `localhost`. It costs zero invocations, zero Turso rows, and needs no Vercel token.

What it buys is that the test is possible again. What it costs has to be said just as plainly, which is why it lives in the workflow's header: a GitHub runner has two shared vCPUs, so these numbers characterize the application (where the bottleneck is, which route is expensive, how long recovery takes), not Vercel's infrastructure. Absolute values are only comparable against other runs of the same kind. That is what having the series in the panel is for, instead of a loose screenshot.

## Three copies of the same rule

The never-against-production rule now lives in three places, each one where the previous can no longer reach: the script (which validates URL and database), the workflow (which stops before spending a runner minute), and the ingest endpoint that receives the result (which rejects the row if the target was production, in case someone runs k6 by hand, bypassing the script).

That last layer forced me to duplicate the list of forbidden domains: the k6 profile runs inside the k6 runtime, which is not Node and cannot import TypeScript. Duplicating a security rule is how silent holes get opened, so the copy does not stand on its own. A test reads the `.js` file, pulls the list out with a regular expression, and compares it against the TypeScript module's:

```ts
const perfil = readFileSync('lab/k6/lib/perfil.js', 'utf8')
const enScript = [...linea[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
expect(enScript.sort()).toEqual([...OBJETIVOS_PROHIBIDOS].sort())
```

Relaxing one copy without the other stops being an invisible slip and becomes a red test.

## What it measures, now that it runs

The scenarios already existed and had genuinely run since August; what was missing was for their evidence to stop living in JSON files inside the repository. The load ladder looks for sustained capacity by measuring only on the plateau, never the ramp-plus-plateau aggregate, which averages a healthy level with a saturated one and describes neither. The stress scenario chases two other things: the breaking point, and how long the system takes to come back.

That third question is the hardest to answer well. Recovery is not a number, it is a curve: the average over the whole phase blends a system still draining with one already recovered. It is measured in segments, and the panel distinguishes "back in 75 seconds" from "never came back", which could print similarly and mean opposite things. A segment with no requests does not count as recovery either: its percentile is zero for lack of samples, not for health, and reading that as a healthy system would repeat the mistake the sampling endpoint itself made when it saturated and reported 0% CPU instead of "no data".

## What I take from it

The technical finding of this phase was no latency figure. It was that a to-do item can survive two months being false if its cause sounds bureaucratic enough. "A permission is missing" does not invite investigation. "The target the plan asks for is incompatible with the guardrail I wrote later" does, but that sentence does not show up on its own: you have to go read both pieces and notice they contradict each other.

Before calling something blocked on a credential, it is worth checking that the path that credential opens exists at all. Sometimes the permission arrives, the door opens, and behind it there is a wall.
