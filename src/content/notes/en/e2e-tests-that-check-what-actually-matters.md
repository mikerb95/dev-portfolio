---
title: E2E tests that check what actually matters
description: Closing the testing pyramid with Playwright without making it brittle — disposable databases, a sentinel that proves the demo's isolation, and why every test needs its own IP.
date: 2026-07-16
tags: [testing, playwright, e2e, quality]
lang: en
translationOf: e2e-que-prueban-lo-que-de-verdad-importa
---

I have more than 400 unit tests over this site's logic: payment idempotency, P&L calculation, threat classification, anomaly detection. They all run in milliseconds and none of them opens a browser. They're excellent at what they do — and blind to what they don't.

A unit test verifies that a function returns the right thing. It doesn't see the middleware letting through a request it should block, a page blowing up during server render, or the panel demo leaking a real record. That lives in the seams between the pieces, and the only way to test a seam is to exercise the whole system from outside. That's what end-to-end tests are for.

The problem with e2e tests is their reputation: slow, brittle, the ones a team ends up disabling "until we have time to fix them". Almost always for the same three reasons. It's worth designing against each one.

## Test data can't be real data

The first instinct — pointing the tests at the usual database — is also the most dangerous. These tests **write**: they submit the contact form, they create payments. Against the real database that means accumulated garbage, spent quota, and, if something goes wrong, real data touched.

So every run boots two file-backed libsql databases, disposable, seeded from scratch and thrown away at the end. They never touch production. The detail that matters is *when* they're seeded: Playwright starts the test server **before** running its `globalSetup`, so seeding in the setup arrives too late — the server boots against a database that doesn't exist yet. Seeding has to be part of the server's own startup. It's the kind of thing that costs an afternoon of confusing errors and one line of code to understand.

## A sentinel that really proves isolation

The public demo of my panel lets anyone walk through `/admin` with fictional data. Its central guarantee is that it **never** shows real data, because that data comes from a different database. How do you test a negative like that?

Checking that the fictional data shows up isn't enough: that says nothing about whether something real also slipped in. The technique is to seed the "real" test database with a sentinel — a recognizable prefix on every name, `CENTINELA-REAL` — and then walk every page of the demo asserting that string appears **nowhere**. If isolation ever breaks, the sentinel surfaces in the HTML and the test screams. You test absence by making what should be absent visible.

## Every test needs its own IP

This one cost me a while of bewilderment. The tests started failing intermittently, depending on the order they ran in. The cause: the site rate-limits by IP, and the whole suite comes from `localhost`. The test that deliberately saturates the submission limit — to check that rate limiting works — left the counter exhausted, and the next test that submitted anything ate the inherited `429`.

The `x-forwarded-for` header solves it: each test invents an IP and uses it for all its requests. The one testing rate limiting saturates *its* IP; the rest live on theirs, isolated. A test that depends on execution order isn't a test, it's a coin flip.

## What they cover, in the end

Five files, thirty-six tests. That public pages render with no console errors and with their security headers. That `/admin` is closed to anonymous visitors through every door — pages, APIs, the private deck. That the demo isolates data, rejects every write, and vetoes sensitive routes even when they're `GET`. That the contact form validates and rate-limits. That a payment with the same idempotency key returns the same payment and doesn't charge twice.

None of those statements can be made by a unit test, because all of them live on the boundary between pieces. They run on every push, against databases nobody will miss, and they fail loudly if a seam opens. Which is exactly what I ask of a test: wake me up before a user does.
