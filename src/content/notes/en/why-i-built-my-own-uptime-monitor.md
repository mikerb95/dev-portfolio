---
title: Why I built my own uptime monitor
description: UptimeRobot kept telling me everything was fine while production served the wrong page. So I wrote the check engine I actually needed.
date: 2026-07-05
tags: [observability, astro, sre]
lang: en
translationOf: por-que-construi-mi-propio-monitor
---

A generic uptime service answers exactly one question: did the server return 200? And that's the wrong question. A broken deploy can return 200 with a blank page, with an uncompiled bundle, or with another project's HTML. The site is "up" and completely down for anyone visiting it, at the same time.

After running into exactly that, I decided the monitoring for my projects and my clients' would be my own engine. Not for sport: because the questions I needed answered weren't answered by any free tier of any service.

## What each check validates

Every probe runs three validations, not one:

1. **Expected HTTP status** — the obvious one.
2. **Expected content** — the response must *contain* a string configured per monitor. If the HTML doesn't carry the expected marker, it counts as down even when the status is 200. This catches the broken deploys a ping never sees.
3. **Latency threshold** — above the threshold (configurable per monitor), the service is flagged as *degraded*: an in-between state that deserves attention but not a 3 a.m. page.

On top of that, every ~12 hours the engine checks TLS certificate expiry. An expired certificate is a perfectly avoidable outage, and it's still one of the most common.

## Incidents, not loose failures

An isolated failed check is noise; what matters is the window between the first failure and the first success after it. The engine groups consecutive failures into **incidents** with a start, a resolution, and a duration. That turns "there were 14 failed checks" into "the service was down for 23 minutes on Tuesday", which is the sentence a client understands and the one I need to compute real availability.

Transitions — down and recovery, not every failure — fire a push notification to my phone via [ntfy](https://ntfy.sh). Alerting on every failed check trains you to ignore alerts; alerting on transitions keeps them meaningful.

## The cron detail

This site runs on Vercel, and the Hobby plan only allows one daily cron job — useless for uptime. The fix cost nothing: an external cron (cron-job.org) hits an endpoint authenticated with a secret token every few minutes, and that endpoint runs the probe round. Vercel keeps its own daily cron as a safety net in case the external one fails.

It's a good reminder that a platform's constraint is almost never the end of the design; it's the start of it.

## What came out of it

SLOs and error budgets are computed on top of the check history ([I cover that in another note](/en/notes/slos-and-error-budgets-in-a-portfolio)), and the same data feeds the [public status page](/en/status): what a visitor sees is exactly what I see in the panel, no touch-ups. A monitor of your own isn't just a tool — it's verifiable evidence of how you work.
