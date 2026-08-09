---
title: The clientId never comes from the URL
description: "I built a portal where every client sees their projects, their invoices, and their documents. The number one risk wasn't someone getting in without permission: it was someone getting in with their own and seeing somebody else's."
date: 2026-07-24
tags: [security, multi-tenant, architecture, astro]
lang: en
translationOf: el-client-id-nunca-viene-de-la-url
---

A client portal has an uncomfortable attack surface: almost everyone using it is **legitimately authenticated**. The login can be perfect - scrypt password hashing, revocable sessions, rate limiting - and one badly written `WHERE` is still enough for one company to see another's invoice. That failure trips no security alarm, because from the outside it looks like a normal query from a normal user.

So the entire design revolves around a single rule.

## The rule

**The client identifier always comes from the session. Never from the URL, never from the body, never from a hidden field.**

There's exactly one helper that resolves cookie → session → user → company → role, and it's the only door that identifier can come through. No endpoint accepts it as a parameter. It isn't that it's validated: it's that **there's no way to pass it**.

Written like that it sounds obvious. It stops being obvious the moment the second screen arrives and someone needs `/invoices/482`. That `482` does come from the URL - and that's where the real work starts.

## Defense in depth, or why the filter goes in twice

When I ask for a project's milestones, the `WHERE` carries the project id **and** the client id, even though the project id alone is enough to find the row:

```
where projectId = ? and projects.clientId = ?
```

The second filter is redundant on the happy path. It isn't on the path where someone changes the number in the URL. Without it, the query finds another company's project and happily returns it, because the session gate already said yes - the gate answers "there is a session", which is a different question from "this data is theirs".

The practical consequence is that **security doesn't live in the middleware**. The middleware says who you are; each query decides what's yours. A gate that gets bypassed shouldn't be able to show anything.

## 404, not 403

When you request a resource that exists but belongs to someone else, the answer is **404, not 403**.

A 403 confirms the resource exists. Walking `/invoices/1`, `/invoices/2`, `/invoices/3`, a 403 draws the map: how many clients there are, how many invoices I issue, when I started. Every "you can't see this" is an answer.

With a uniform 404, someone else's resource and a nonexistent one are indistinguishable. It's the same logic as the password reset form, which answers identically whether the account exists or not: if it said "that email isn't registered", it would be a tool for figuring out who my clients are.

## Three logins that don't know each other

Three authentication systems live on the same domain, and **none shares a cookie, a table, or code** with the others:

- The **admin panel**, with GitHub OAuth and an allowlist revalidated on every request.
- The **client portal**, with email and password, its own cookie, and sessions in its own table.
- The **public demo**, with a short-lived signed pass and no login.

Reusing the admin system for clients would have been less code. It would also have meant that a bug in an OAuth callback could, in the worst case, turn a client session into an administrator one. These are two populations with two different risk profiles: I keep them separate at the cookie level so they don't even travel together in the same request.

Portal sessions are opaque: 256 bits of randomness, of which the database only stores the sha-256. A dump of the sessions table lets you impersonate nobody, and revoking is an `UPDATE` with immediate effect - no "the token stays valid until it expires" window.

## The detail that nearly got past me

I can enter a client's portal to see exactly what they see. It's extremely useful for support and extremely dangerous: it's real data, and an action of mine from there would be recorded as theirs.

That session is born flagged, and the middleware makes it read-only: any method other than `GET` gets a 403.

The problem is that this cut covered the portal's routes, and the payment gateway **doesn't live there** - it's shared infrastructure with public collections, under a different prefix. An administrator viewing the portal as a client could reach the one mutator all the rest of the code blocked.

It's the classic failure of prefix-based lists: you protect a namespace and the exception sits outside it. The fix was a second explicit cut on that specific route, and the lesson is more general - **every time authorization leans on "routes starting with", go look for what fell outside**. There's almost always something.

## What keeps it honest

None of this matters if it erodes over time. What holds it up are the tests that try to break it: a perfectly valid session requesting another company's resources, and an assertion that it gets empty results or a 404, never data. It's the kind of test that never fails until the day someone adds a new endpoint with one `WHERE` too few.

That day is exactly what it's there for.
