---
title: Revocable sessions on top of a stateless JWT
description: My admin panel used plain JWTs; a stolen cookie was unstoppable until it expired. Here's how I added a device list, remote revocation, and alerts without giving up the JWT.
date: 2026-07-09
tags: [security, auth, astro]
lang: en
translationOf: sesiones-revocables-sobre-jwt-stateless
---

This site's admin panel authenticates with GitHub OAuth and a JWT session. It's a comfortable design — no session store, no server state — but it has an uncomfortable blind spot: **the server doesn't know how many sessions exist, or where**. If someone steals the cookie (a lost device, a shared laptop, a moment of carelessness), that session is invisible and unstoppable until the token expires on its own.

The classic fix is migrating to database-backed sessions. I didn't want to: the stateless JWT gives me logins that never touch the DB and zero session infrastructure. What I did instead was add the missing part — visibility and revocation — on top of the JWT, without changing the strategy.

## A signed `sid` inside the token

In the login callback, every new session gets a unique identifier (`sid`) that travels **signed inside the JWT itself**. That detail matters: the session's identity doesn't depend on any auxiliary cookie an attacker could delete or forge. If the token is valid, the `sid` is authentic; there's no way to dodge a revocation by clearing cookies.

The panel's middleware, which already validated session and allowlist on every request, now also records the device in its own table: `sid`, browser and operating system (parsed from the User-Agent), IP (from the proxy headers), and first/last activity timestamps.

## The cost: one read per request, writes every 5 minutes

A naive session log puts a *write* in the database on every navigation. Mine splits the two paths:

- **A read on every request** — cheap, and it's what makes revoking a session take effect immediately: the revoked device loses access on its next click, its JWT is cleared, and it goes back to the login.
- **A throttled write** — `lastSeen` is only rewritten if the record is more than 5 minutes old. For a 24-hour expiry window, ±5 minutes of precision is irrelevant.

The whole path is *fail-open*: if the session log fails, the panel keeps working. A secondary security system should never be the thing that takes down legitimate access.

## Active defense, not just visibility

A device list nobody looks at is theater. Two pieces turn it into a defense:

1. **Instant push on a new device.** The first time an unknown device opens an admin session, a notification hits my phone via [ntfy](https://ntfy.sh) with browser, OS, and IP — the same pipe [my uptime monitor](/en/notes/why-i-built-my-own-uptime-monitor) already used. If the login wasn't me, I know within seconds and revoke it from my phone.
2. **24-hour inactivity expiry.** A session with no activity for a day revokes itself, in two layers: immediately if the device comes back (the middleware checks) and via a sweep in the cron that was already running every few minutes, so the panel's list reflects reality even if the device never returns.

## What doesn't change

None of these pieces reduces the probability of a break-in: the door is still GitHub OAuth with a single-user allowlist, and the best defense there is 2FA on the GitHub account. What changes is the **response time to a compromise**: before, a stolen cookie lived until it expired; now it lives until the push reaches me. That difference — from hours or days to seconds — is the metric that actually matters in incident response.
