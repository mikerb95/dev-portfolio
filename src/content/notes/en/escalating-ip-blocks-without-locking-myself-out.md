---
title: Escalating IP blocks without locking myself out
description: Detecting threats wasn't enough anymore. The portfolio's micro-SIEM gets real enforcement — a TTL that escalates with repeat offenses and honeypots that block on the request itself, not on the next cron.
date: 2026-07-19
tags: [security, observability, sre]
lang: en
translationOf: bloqueo-escalado-de-ips-sin-desconectarme-a-mi-mismo
---

[This site's micro-SIEM](/en/notes/building-a-micro-siem-for-my-portfolio) had spent weeks detecting and classifying hostile traffic, but it fell short on the part that matters most: acting. A scanner that touched a honeypot generated an event, the event waited for the auto-block cron, and between the cron running and deciding to block, minutes could pass in which the same IP kept hitting the site with no friction. Detecting without blocking is half the job.

## The trigger that never fired

When I went to look into why the same IP kept touching a decoy endpoint several days running without anything blocking it, the diagnosis was more uncomfortable than "the cron is late": the cron never arrived at all. The auto-block lived entirely inside a scheduled task that depended on an external trigger, and that trigger had never been registered — on top of that, the platform entry that would have run it had been dropped in an earlier edit. The blocking engine was written, tested, and deployed, and it had never executed once.

That's the lesson I took away, and it isn't about latency: **a defense that depends on an external trigger nobody activated isn't a slow defense, it's an absent one.** The panel showed the events, the rules classified correctly, the tests were green — everything gave the impression of a working system, and none of those signals touched the only question that mattered: *is anyone calling this?* A security component that only runs when something external invokes it inherits that external thing's reliability, not the reliability of the code you wrote. That's why the most trustworthy part of reacting — the unambiguous signal — couldn't keep living there.

## A single TTL doesn't represent reality

The first version of the block used a fixed TTL: an IP got blocked, and an hour later it had a clear path again. That treats a scanner that came by once exactly like one that returns religiously every week. The fix was escalating the TTL with repeat offenses — 1 hour the first time, 24 hours the second, 7 days from there on — reading the `hits` counter from the persistent row in `blocked_ips`. The row survives even after the previous block expires (only the purge cron deletes it), so that counter is real memory of how many times that IP has already been blocked, not a value that resets itself.

```ts
export function escalatedTtlSec(priorHits: number): number {
  const i = Math.min(Math.max(priorHits, 0), BLOCK_TTL_STEPS_SEC.length - 1)
  return BLOCK_TTL_STEPS_SEC[i]!
}
```

It's a pure function over a three-step array — no exponential curves, no per-IP configuration. Real repeat offending almost never gets past the third block, and when it does, a week is already enough friction that giving up is cheaper than continuing.

## Blocking on the request itself, not on the next cron

The auto-block still lives in the cron for the same reason I documented in the previous note: aggregating events and deciding blocks is work that shouldn't compete with a request's hot path. But honeypots are the exception I'd already identified as the only unambiguous signal — nobody legitimate asks for `/wp-login.php` on this site — and waiting for the cron on a 100% reliable signal hands a scanner a free window to keep scanning.

So the middleware now blocks inline the moment it detects a honeypot, reusing the same `blockIpEscalated` the cron uses:

```ts
if (threat?.category === 'honeypot' && ip) {
  await blockIpEscalated(
    { ip, reason: 'honeypot tocado', ruleId: 'honeypot.inline', source: 'auto' }
  ).catch(() => {})
}
```

The request that touches the honeypot does run its course — it gets the decoy with its tarpit and fake HTML, so as not to give away the trap on first contact. It's the *next* request from that IP, to any route, that meets a bare 403. Sharing `blockIpEscalated` between the cron and the middleware was deliberate: two paths deciding the same TTL with different logic is the kind of silent divergence that ends in a bug nobody notices until someone asks why two IPs with identical histories got different blocks.

## The same safeguards, now on the hot path

Putting a database write inside the request that serves enforcement is exactly the kind of decision that can turn a defense into the incident itself, so it inherits the safeguards that already existed for the cron instead of duplicating them:

- **Allowlist first.** `blockIpEscalated` delegates to `blockIp`, which never blocks an allowlisted IP — not even if it touches a honeypot by accident (an internal monitoring scanner, for instance).
- **Explicit fail-open.** The `.catch(() => {})` isn't an oversight: if the escalation insert fails, the request already in flight carries on regardless. A failure in blocking should never turn into a 500 for whoever triggered it.
- **Cached read, not the write.** `isBlocked` still reads from a 30-second in-memory cache — that doesn't change. What's new is only the inline write for honeypots, which is infrequent by design: a legitimate visitor never triggers it.

## Why this doesn't become a cannon pointed at me

The obvious fear with any automatic blocking is blocking yourself, or a legitimate service, on a false alarm. Three things prevent it together: the allowlist (my own IP and trusted ranges never enter the equation, not by honeypot, not by burst), the fact that the only signal with inline blocking is the one with zero known false positives (honeypots), and that everything else — bursts of high-severity events — still goes through the cron with its threshold and its cap on active blocks. Inline enforcement is a surgical exception for an unambiguous case, not the general rule.

The result is a system where the fastest part to react (the in-flight request) is also the most conservative about what it blocks, and the part with the most context to decide (the cron, with several minutes of aggregates) is the one handling the gray areas. Detecting is no longer enough if the block arrives late; but blocking fast is worthless if you can't trust the signal is real.
