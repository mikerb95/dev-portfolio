---
title: Mutating my code to find out if my tests actually work
description: Coverage tells you which lines ran. Mutation testing asks something more uncomfortable - if I break this line on purpose, does any test notice? Plus Zod contracts, so an endpoint can't change shape without anyone realizing.
date: 2026-07-17
tags: [testing, quality, ci-cd]
lang: en
translationOf: mutar-el-codigo-para-saber-si-mis-tests-sirven
---

This site has more than 400 tests and coverage that looks good on any badge. For a long time that was enough for me as proof the suite was solid. But coverage measures a very limited question: did this line execute at least once during the tests? An `if` that runs but whose condition never matters to the outcome counts as "covered" exactly like one that's genuinely being verified. High coverage with weak assertions is a number that lies with a clear conscience.

The question I actually cared about was a different one: if someone - me, in a rushed refactor, or a collaborator who doesn't know why a line is there - breaks something on purpose, does any test notice? That's the question mutation testing answers, and it's a technique almost nobody at junior or mid level knows about, which makes it a better conversation piece than its reputation suggests.

## How it works, in one sentence

Stryker takes my code, generates hundreds of slightly broken variants - flips a `>` into a `<`, swaps an `&&` for an `||`, deletes a negation - and runs the full suite against each one. If some test fails, the mutant died: my tests caught it. If the suite stays green with the line broken, the mutant survived: I have a line of code I can break without anyone noticing, which is the exact definition of a test that tests nothing.

The result, running over `src/lib/**` - where all the pure logic lives: payments, P&L, threat classification, SLOs - was a **real mutation score of 87.2%**, not a number invented for the article. With the threshold configured in Stryker (`high: 80, low: 60, break: 50`), that lands in the good band.

## Stryker's report doesn't include the number I need

A detail I didn't expect: the JSON Stryker produces doesn't include an aggregate score. It brings, per file, the list of mutants with their individual state - `Killed`, `Survived`, `NoCoverage`, `Timeout`, `Ignored`, `CompileError` - and computing the percentage is the responsibility of whoever consumes the report. I wrote that function isolated from network and disk (`computeMutationScore`, in `src/lib/lab/mutation.ts`) precisely so I could test it like any other piece of pure logic in the repo: I hand it a fake report with mutants in every state and verify the calculation excludes what shouldn't count.

The decision that matters most there is which states count as "detected" and which don't. `Ignored` and `CompileError` are excluded from the total - a mutation out of scope or invalid says nothing about the quality of my tests - the same criterion Stryker uses internally. But `NoCoverage` **does** count as undetected, and that's the entire point of the exercise: a line no test touches is exactly the hole this technique exists to find. If I excluded it from the calculation, a module with no tests would get a perfect score by omission - 87.2% with that line present in the count is a number I can defend; without it, it would be a more elaborate lie than the one I was trying to avoid.

## An exit code that isn't the whole truth

Stryker exits with a non-zero code when the score falls below the `break` threshold. The obvious temptation in the script that orchestrates all this (`scripts/mutation-scan.mjs`) was to let that exit code decide whether the CI job fails. I didn't: the script carries on, reads the JSON report anyway, computes the real score, and reports it to the panel - even if Stryker "failed". A mutation score of 45% isn't an infrastructure error that should silently take down the pipeline; it's information I want to see in the panel so I can decide what to do about it. Treating a low score as a binary CI failure hides exactly the data this exercise exists to expose.

## Slow on purpose, never on every push

Mutating every line of `src/lib` and running the full suite against each mutant is, by design, far more expensive than running the tests once. The workflow (`mutation.yml`) runs manually (`workflow_dispatch`) or weekly (Sundays, when nobody's waiting on a PR), never on every push - blocking a merge with a 90-minute job would be optimizing the wrong metric. Day-to-day iteration speed is protected by the normal suite; the mutation score is a periodic audit of how honest that suite is, not a gate.

## Contracts: the other half of the finish

Mutation testing's question is "do my tests detect a bug?". Contract testing's is different: "did my response's shape change without anyone deciding it on purpose?". Front end and API live in the same Astro repository, so tools like Pact - designed to verify contracts between separate repos, consumer and provider - were oversized for what I needed. The honest version was simpler: Zod schemas describing the exact *shape* of the response for four key endpoints (`/api/health`, `/api/payments/checkout`, `/api/status/latency`, `/api/admin/lab/slo`), and one test per endpoint that calls the real handler and validates the real response against that schema.

The test that convinces me most that this isn't theater is the last one in the file: it takes a real response from `/api/health`, renames the `ok` field to `healthy` - the kind of change someone would make without thinking twice in a refactor - and confirms the schema rejects it. A contract test that has never been seen to fail is indistinguishable from one that tests nothing; this one actively proves it catches the break it exists to catch.

## What this finish makes clear

Coverage, mutation score, and contracts answer three different questions that sound alike: did it run?, if I break it does anyone notice?, is the shape still what I promised? None replaces the others. A file with 100% coverage and a 40% mutation score has tests that execute code without verifying anything; an endpoint with perfectly tested logic can still break a consumer if it changes shape without any test noticing. The three layers together are, so far, the most honest answer I've been able to give to the question "how do I know my tests are worth anything?" - and that's a question worth more than the green badge most projects settle for showing.
