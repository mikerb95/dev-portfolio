---
title: Some providers bill you, others cut you off
description: "Going over a quota can only mean two things, and they cost very different things: money, or your site down. Why my infrastructure cost simulator paints them in different colors."
date: 2026-09-15
tags: [cost, infrastructure, turso, vercel]
lang: en
translationOf: unos-proveedores-te-cobran-otros-te-cortan
---

"What does this cost to run per month?" has a boring answer and a useful one. The boring one is adding up what you pay for each plan. The useful one answers a different question: what happens the month traffic spikes, and what breaks first when it does.

I learned the difference twice, both times the same way.

## What gets billed isn't always what you think

In July 2026 the latency chart on my status page requested its series every 30 seconds. The query was missing the composite index it needed, so every load scanned the entire checks table: at 62,000 rows, **a single query ate 93% of my monthly read quota**. In August it happened again by another route: a load test hit the site without the CDN cache in front and drained the quota completely.

The lesson wasn't "watch your spending". It was that Turso doesn't bill gigabytes or requests: it bills **rows scanned**, which is not the same as rows returned. A query that returns ten rows after looking at two hundred thousand costs you two hundred thousand. That dimension shows up in no budget you do in your head, and it's the one that took me down twice.

That's where the page I use now came from: a simulator of what my basic infrastructure costs, dimension by dimension, with growth scenarios.

## Two behaviors, not one

When usage goes past the included quota, only two things can happen, and conflating them is what makes the bottom line of a spreadsheet useless:

- **Overage**: the provider charges you per extra unit. It costs money, and money can be budgeted.
- **Hard cap**: the provider charges you nothing and throttles you instead. It costs you the service, until somebody notices.

A free plan never overcharges you. It cuts you off. So in my panel an overage and a hard cap show up in different colors, the cell reads "cut off" instead of a figure, and the summary carries a separate count of broken quotas next to the dollar total. A total that adds up to zero when it actually means "this doesn't work" is worse than having no total at all.

The plan recommendation follows from the same idea. The simulator doesn't propose the cheapest plan: it proposes **the cheapest one that doesn't hit a hard cap**. A free tier that falls short doesn't cost zero, it costs you an outage.

## The same rates I bill with

This system already measured compute usage per project in order to bill it back to each client, with rates versioned by effective date. The simulator didn't copy those numbers: it imports them from that same module.

That looks like a housekeeping detail and it isn't. If the simulator had its own arithmetic, I'd quote with one number and invoice with another, and the gap would only surface the day a client disputes an invoice. Making it impossible for the two to drift apart is worth more than what it cost to wire up.

The same discipline applies to the provider that doesn't bill by usage at all. Email is paid per seat, not per consumption, and it enters the model as zero included quota with a price per unit, rather than as a special branch in the calculation. An exception written for a single provider is exactly the one nobody ever tests again.

## What the simulator doesn't know

Quotas and rates are entered by hand, and every card shows the date they were last checked against the provider's pricing page. That isn't decoration: all three change terms without warning, and an out-of-date simulator doesn't fail with an error, it lies with confidence. The visible date is what turns "this number is wrong" into something you can catch at a glance.

The scenarios aren't predictions either. They're three points on a curve, editable cell by cell, and they exist to answer a single question: **how much does this have to grow before it breaks, and where.** Knowing that in advance is the difference between upgrading a plan on a Tuesday afternoon and discovering the limit on a Saturday, with a client's site down and the quota exhausted until the end of the month.
