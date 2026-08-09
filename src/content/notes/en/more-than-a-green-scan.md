---
title: More than a green scan
description: Wiring npm audit, CodeQL, and axe-core into a panel of my own with history and dedup - so a security and accessibility scan tells a story instead of showing a checkmark nobody looks at twice.
date: 2026-07-17
tags: [security, accessibility, sast, testing, ci-cd]
lang: en
translationOf: no-solo-un-scan-verde
---

A security scanner that runs in CI and reports nowhere is decorative noise: it shows green on a badge, nobody opens it, and the day it finds something real it gets lost among a hundred GitHub notifications that are also ignored. What makes an automated scan valuable isn't that it exists - it's that someone can look at it six months later and see the whole story: this was found, this was fixed, this was knowingly accepted.

So instead of letting `npm audit` and axe-core live and die inside a CI job, I wired them into the same panel I already used for the pipeline and the chaos experiments: a table with state, an ingest endpoint, a page with history. The new piece is small - a stable `fingerprint` per finding and a three-state lifecycle - but it completely changes what can be said about the site's security.

## Identity, not just detection

The problem with running a scan on every push is that the same finding shows up over and over. Without a notion of identity, "17 vulnerabilities found" doesn't say whether they're the same 17 as yesterday or whether 5 new ones appeared. The fix is a fingerprint - a hash of the source, the rule, and the affected path - that identifies a finding *across* runs, deliberately excluding severity and title: if `npm` bumps a vulnerability's rating from medium to high, it's still the same problem, not a new one duplicating the old.

With that stable identity, the lifecycle becomes honest: a finding is born `open`, someone marks it `resolved` when they fix it or `accepted` when they decide to take the risk - with a note explaining why. Re-ingesting a finding that's already resolved doesn't reopen it on its own; if the scan sees it again, it's probably because the fix hasn't reached production yet, and reopening automatically would be more noise, not less.

## Actually running it changes what you find

Writing the `npm audit --json` parser and testing it with a sample JSON feels like being done. It isn't. Running the axe-core scanner against the real pages, the library failed immediately: it requires an explicit `browser.newContext()`, something no example in the docs makes clear and no test with fake data would ever have revealed. The symmetric bug showed up in the ingest: the endpoint read the authorization token from `process.env`, which simply doesn't exist in Astro's dev server - the rest of the site's code uses `import.meta.env` for this, and that inconsistency produced a silent 401 no unit test was going to catch, because unit tests don't boot a real server.

And when everything finally ran: **9 real contrast violations**, across eight public pages of the site itself. Not fixtures, not test data - text with contrast ratios of 2.4 and 2.95 against the 4.5 minimum WCAG AA requires, in color classes that had been there since the CSS was written. `npm audit` found 15 packages with reported vulnerabilities, 8 of them high or critical. No invented data would have been as convincing as finding the real problems, on my own site, running the tool against itself.

## The rule that keeps repeating

Every module of this lab ends up reusing the one that already exists: the accessibility scanner runs over the same eight pages and the same external-resource blocking the end-to-end tests already had; the ingest extends the same endpoint the CI pipeline already used; the admin page follows the same fetch-and-repaint pattern as the other LAB panel pages. Not one piece was built from scratch. The discipline isn't writing more code - it's noticing when the code that already exists nearly solves the new problem, and stretching it instead of duplicating it.
