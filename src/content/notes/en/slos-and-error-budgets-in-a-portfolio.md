---
title: SLOs and error budgets for small projects
description: Uptime as a percentage is misleading. Adapting Google's SRE discipline - SLI, SLO, error budget, and burn rate - to a portfolio of small projects.
date: 2026-07-05
tags: [sre, slo, observability]
lang: en
translationOf: slos-y-error-budgets-en-un-portfolio
---

"99.2% uptime this month" sounds fine until you do the math: that's almost six hours down. Is that acceptable? Is it a crisis? The percentage alone doesn't say. Google's SRE discipline solved this years ago with three concepts almost nobody applies outside large companies - and they work just as well on a portfolio of small projects.

## The three numbers

**SLI (indicator)**: *observed* availability. In my case, successful checks over total checks in a 30-day window. It's a fact, not a goal.

**SLO (objective)**: *promised* availability. I use 99.5%. Picking it forces an honest conversation: 100% doesn't exist, and promising 99.99% on projects running on free tiers would be a lie.

**Error budget**: the arithmetic consequence of the SLO. If I promise 99.5% over 30 days, I'm entitled to ~3.6 hours of downtime in that window. That time is a *budget*: it can be spent on risky deploys, on migrations, on not getting up at 3 a.m. for a 2-minute blip.

The mental shift is this: **the goal stops being "zero outages" (impossible) and becomes "don't burn through the budget" (measurable)**.

## Burn rate: the metric that warns you in time

Remaining budget tells you where you are; **burn rate** tells you where you're heading. It's the observed failure rate divided by the rate the budget allows:

- burn rate **1.0** - you're spending at exactly the sustainable pace: the budget runs out right as the window closes.
- burn rate **> 1** - you're on track to miss the SLO before the window ends.
- burn rate **14** - what looked like "a slightly unstable service" is actually a fire.

A high burn rate with budget still available is the most valuable signal in the system: it warns you *before* you miss, while you can still act.

## The implementation fits in one file

The whole calculation - SLI, budget minutes, consumption, burn rate - is pure functions over a list of checks `(date, ok)`. No dependencies, with their own unit tests. Edge cases matter more than they look: what happens with a 100% objective (zero budget)? With a window that has no data? Deciding those explicitly in code is what keeps the status page from showing a `NaN%` on a bad day.

For the [public status page](/en/status) the calculation doesn't materialize every check: the database aggregates by day (`GROUP BY`) and the same functions run over the counts. Same math, ~700 rows instead of ~200,000.

## Why bother on small projects

Because the error budget turns the conversation with a client from "sorry, it went down" into "we used 40 minutes of the 3.6 hours the agreement allows this month, and here's what happened". The first sentence is an apology; the second is engineering. The difference between them isn't the size of the project - it's the discipline of whoever runs it.
