---
title: Building a micro-SIEM for my portfolio
description: Scanners hit any site with a public IP, this one included. Instead of ignoring the noise, I built an engine of my own that detects it, classifies it, blocks it, and shows it in public.
date: 2026-07-10
tags: [security, observability, sre]
lang: en
translationOf: construyendo-un-micro-siem-para-mi-portfolio
---

Any site with a public IP gets hostile traffic from the first minute, personal portfolios included. Automated scanners try `/wp-login.php`, `/.env`, `/.git/config`, injections in every query parameter - not because they picked you, but because they scan the entire internet and you happen to be in range. The normal reaction is to ignore it: they're 404s, nothing breaks, why look?

Because those 404s are information. What they probe you for, how often, from where, with what tooling - that's your site's real attack surface, and discarding it is throwing away a free signal. So I built my own security observability engine: in the industry this lives in a SIEM (Security Information & Event Management); here it's a portfolio-scale version, but with the same principles.

## A classifier, not a blocklist

The core is a pure function: it takes method, path, query, and user-agent, and returns a category aligned with the OWASP Top 10 if the request matches a signature - CMS reconnaissance, secret hunting, path traversal, injection, offensive bots known by their user-agent. If nothing matches, it returns `null` and the request goes on with no friction.

The design decision that weighed most was the counterintuitive one: **prefer false negatives to false positives**. It's tempting to write aggressive rules that catch everything, but a rule that's too broad ends up classifying legitimate traffic as an attack, and a site that defends itself against its own visitors is worse than one with no defense at all. Every rule is deliberately conservative, and the classifier's 58 tests spend more cases confirming what must *not* fire than confirming what must.

## Fail-open, at every layer

If there's one thing I learned writing [the chaos engineering engine](/en/notes/chaos-engineering-that-cannot-hurt-you) for this same site, it's that a defense system can never become the incident. The same principle applies here, at every point:

- If recording an event fails, the request continues - the response never waits on the write.
- If the database doesn't answer when checking the blocklist, the request is **allowed**, not blocked.
- If the anomaly detector throws, the cron carries on with the purge and the auto-block; it doesn't abort the whole pipeline over one isolated failure.

A security sensor that can take down the site it protects isn't a sensor, it's a new attack surface.

## Bursts without inflating the database

A typical scanner tries hundreds of paths in seconds, all from the same IP. Writing one row per request under that pattern would amplify the attack itself: the more paths they try, the more writes my database takes. The fix was deduplicating identical bursts (same IP, same rule, one-second window) into a single row that accumulates a repetition counter. The cost of a 500-path scan goes from 500 inserts to a few dozen at worst.

## Honeypots: the only unambiguous signal

Almost all threat classification is probabilistic - a signature suggests malicious intent, it doesn't prove it. Decoy endpoints are the exception. Routes like a fake WordPress login don't exist on the real site and no legitimate user has any reason to touch them; `robots.txt` even asks crawlers to avoid them. If something lands there, the intent is unmistakable.

That's why they're the only category that triggers an automatic block on a single hit, with no repetition threshold needed. They also serve a plausible fake response after a delay of under two seconds - not so fast it gives away the trap, not so slow it holds the connection longer than it should.

## Blocking without locking yourself out

The auto-block runs in a cron, not on the request path - so an attack can't force synchronous writes at the most expensive moment. And every block has a mandatory TTL with escalation on repeat offense: one hour the first time, one day the second, one week from there on. Never permanent by default, because a badly applied permanent block is an error that only a manual intervention fixes, and that's exactly the kind of silent failure I'd rather not discover by accident.

## Anomalies with statistics you can explain

To spot patterns outside the norm I used a z-score over a 30-day baseline for the same hour of day, not a trained model. That's deliberate: in a technical conversation I can explain exactly why something was flagged as anomalous - "40 injection events against a historical mean of 2, 47 standard deviations above the mean" is a complete sentence, not a black box. Anti-fatigue included: an anomaly of the same type doesn't alert again while one is still open and unacknowledged, so the hourly cron doesn't end up training me to ignore its own alerts - the same mistake I'd already avoided with [the uptime monitor's state transitions](/en/notes/why-i-built-my-own-uptime-monitor).

## What gets shown in public, and what doesn't

The [security page](/en/security) exposes real aggregates - how many attempts were detected this month, the breakdown by OWASP category, geographic origin, a 14-day trend - because showing the real level of instrumentation is part of the point. But there's a line I don't cross: never full IPs, never the exact name of a rule, never the list of which routes are decoys. Publishing the full playbook hands the next attacker information in exchange for nothing. The showcase proves the system exists and works; it doesn't need to teach anyone how to evade it.

That balance - verifiable evidence without an attack manual - is, underneath, the same idea behind everything I document publicly on this site: what you see is real, but what you need to operate securely is never the same as what you need to attack it.
