---
title: Chaos engineering that can't hurt you
description: Injecting failures in production to prove the alerts work - with fail-open, a mandatory TTL, and a panic button, so the chaos can never become a real incident.
date: 2026-07-05
tags: [chaos-engineering, resilience, sre]
lang: en
translationOf: chaos-engineering-que-no-puede-hacerte-dano
---

How do you know your monitoring detects an outage if you've never seen one? Trusting alerts that have never fired is faith, not engineering. The only way to know the full chain works - the monitor detects, the incident is recorded, the push lands on your phone - is to break something on purpose and watch.

That's chaos engineering. And the reason it sounds insane ("inject 500s in production?") is that most people picture the version without brakes. The interesting part of the design isn't injecting failures: it's guaranteeing that **the experiment can't turn into the disaster it's meant to prevent**.

## Three brakes, all of them in the design

**Fail-open.** The chaos engine is consulted on every request, and anything can fail: the database doesn't answer, a flag is corrupt, the code throws. The rule is absolute: if the chaos engine fails, the request goes through clean. The worst possible behavior of the chaos system is doing nothing - never amplifying the problem.

**Mandatory TTL.** No chaos flag lives longer than 15 minutes, and the limit is in the code, not in the discipline of whoever uses it. The scenario this rules out: you turn on extra latency for an experiment, a call interrupts you, you forget - and the site stays degraded forever. With a TTL, forgetting costs 15 minutes at most.

**Untouchable routes.** The admin panel and authentication are excluded in code, not in configuration. Whatever happens, you can always get in and hit the **panic** button that kills every flag at once. A fault-injection system that can lock out its own kill switch is a trap that springs on itself.

## What can be injected

Three failure types, switchable per route from the panel:

- **Extra latency** - does the monitor's degradation threshold actually trip?
- **Error 500** - is the outage detected, grouped into an incident, and does the alert arrive?
- **Dead service** - the hard version: how long does the whole detection pipeline take end to end?

The most valuable experiment I've run wasn't any of those: it was killing the database *mid-transaction* and verifying the rollback left the data consistent. That's the kind of question nobody answers until production asks it by surprise.

## The real cost: nearly zero

With no active flags, the engine costs one cached read every few seconds per instance - nothing. No agents, no separate infrastructure: it's middleware on the same site, a table with a TTL, and one page in the panel.

The payoff is hard to overstate. The first time I turned on an `error500` and a few minutes later my phone buzzed with the outage alert - and then the recovery one when I switched it off - I stopped *believing* my monitoring worked. I'd seen it. That difference, between believing and having seen, is exactly what a client is buying when they hire someone who works with this discipline.
