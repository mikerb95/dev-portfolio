---
title: Two logins on one site, and neither knows the other
description: "My admin panel already had authentication solved with OAuth and JWT. When I built the client portal, the hard decision wasn't how to authenticate them: it was not reusing anything that already worked."
date: 2026-07-24
tags: [security, auth, architecture, astro]
lang: en
translationOf: dos-logins-en-el-mismo-sitio-y-ninguno-conoce-al-otro
---

This site's admin panel authenticates with GitHub OAuth, a one-name allowlist, and an Auth.js JWT. It works, it's tested, and it's been in production for months. When I built the client portal - where each client logs in to see their invoices, their documents, and their project's progress - the obvious move was to hang off that infrastructure: same `auth-astro`, another provider, a role field in the token, done.

I didn't. The portal has its own login, its own cookie, its own sessions table, and zero shared lines with the admin.

## Two populations, two risk surfaces

The reason isn't architectural purism, it's failure arithmetic.

The admin has exactly one user: me. Authorization is an allowlist of GitHub logins revalidated on every request. The portal has N users I don't control, who sign up by invitation, who pick their own password, and who, by design, are **legitimately authenticated** while they browse.

If both share the same session mechanism, a class of bug appears that doesn't exist in separate systems: a client session turning into an admin one. It doesn't take a sophisticated attack - a callback that assigns a claim wrong, a role comparison returning `undefined` instead of `false`, a refactor that moves a check somewhere else. In a unified system those mistakes are privilege escalation. In two separate systems they're, at worst, a broken session.

The cookie is different too (`portal_session`, not Auth.js's), so they don't even travel together in the same request. A cookie-handling bug in one system can't touch the other because it never sees it.

## Opaque token, not JWT

In the admin, the session *is* the JWT: the token carries the signed identity inside and the server stores nothing. It's convenient and it has a blind spot I've already covered [in another article](/en/notes/revocable-sessions-on-stateless-jwt): revocation isn't immediate, because the token stays cryptographically valid until it expires. I added a revocation layer keyed on `sid`, but the nature of the JWT is still there.

For the portal I inverted the design. The token is **opaque**: 256 bits of randomness with no meaning at all. The identity lives in the database, and the database **only stores the sha-256 of the token**, never the token.

That buys two concrete things:

- A dump of the `portal_sessions` table lets you impersonate nobody. Whoever takes the table takes hashes; the plaintext token only exists in the client's browser.
- Revoking is an `UPDATE`. Immediate effect, no window, no waiting for anything to expire. Signing out a device, or cutting off access for someone who no longer works at the client's company, takes effect on the next request.

The price is honest: every portal request costs a database query, which the JWT didn't charge. I took it on, and I make it cheaper below.

## Nothing is cached in the cookie

The query that resolves a session doesn't just read the session row: it `JOIN`s with the user and the client, and verifies in the same shot that the session isn't revoked or expired, that the user is still active, and that the client still has the portal enabled.

I could have stuffed that state into the cookie at login and saved myself the `JOIN`. I deliberately didn't: if the state travels in the cookie, disabling a user has no effect until their session lapses. I want switching off a client's portal to be instantaneous, not a 30-day promise.

Renewal is sliding - each use pushes the expiry out, convenient for a client who logs in once a month to look at an invoice - but with a five-minute throttle on the write. Without it, every page load would be an `UPDATE`. With it, most requests only read.

## Brute force: two layers that don't overlap

The middleware already rate-limits authentication routes by IP, the portal's included. That isn't enough.

A distributed attacker changes IP whenever they like; what they can't avoid is failures accumulating **against the account**. So the portal login carries its own per-user counter: ten failed attempts and the account locks for fifteen minutes. Ten is generous for a human second-guessing their password and ridiculous for a dictionary.

The two layers complement each other because they measure different things: one, the volume from a source; the other, the pressure on a target. And outward, **every failure is the same failure**: nothing in the response lets you distinguish "that account doesn't exist" from "it exists but the password is wrong". A different message turns the login into a client enumerator.

Passwords use scrypt from Node's standard library, with no native dependencies to complicate the build on Vercel, with N=2^15 and r=8 (~32 MB and ~100 ms per hash). The stored hash carries its own parameters embedded, so I can harden them the day I need to and old hashes keep verifying: they're re-hashed on the fly at the next successful login.

## What nearly got past me

From `/admin` I can enter the portal "as" a client to provide support. It's useful and it's dangerous: an impersonation session has to be read-only, because writing on someone's behalf through their own interface is indistinguishable from them having done it.

The cut was simple: if the session is impersonated, any method other than `GET` or `HEAD` answers 403. I put it in the middleware, covering `/api/portal/*`, and considered it done.

It wasn't. The payment simulator lives at `/api/payments/mock/pay` - **outside** the portal prefix, because it's infrastructure shared with the public gateway. My guard didn't see it. It was, literally, the only mutator an impersonating admin could reach, and it sat exactly where it hurts most.

The lesson isn't "check your prefixes". It's that **a guard based on URL shape is only as good as the mental map you had the day you wrote it**, and that map ages the moment a shared route enters the picture. Now there are two cuts: the prefix one and an explicit one on that specific route. Redundant on purpose.

The only exception to the block is signing out (`POST /api/portal/logout`). Blocking it would leave the admin trapped in the client's view with no way out but clearing the cookie by hand - and signing out doesn't write over the client's data, it only revokes its own session row.

## What isn't there yet

The portal doesn't update on its own. A client with the tab open doesn't see the reply to their message, or that their monitor went down, until they reload. The data *is* real time; the interface isn't yet. The decision is already made - polling a cheap digest, not SSE or WebSockets, because without pub/sub in the database the server would have to poll anyway and would additionally pay for the open connection - but it's unbuilt.

I'd rather say that than pretend the portal is finished. What is finished is the part that, if it fails, isn't fixed with a deploy: the part that decides who sees what.
