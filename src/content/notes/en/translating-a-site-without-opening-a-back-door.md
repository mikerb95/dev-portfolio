---
title: Translating a site without opening a back door
description: "Putting the site into English looked like writing work. What I found while planning it is that a language prefix gives every route a second name, and that all of my security guards authorize by comparing names."
date: 2026-09-16
tags: [security, i18n, architecture, astro]
lang: en
translationOf: traducir-un-sitio-sin-abrirle-una-puerta-trasera
---

Translating the site into English started out as a content job: pull the copy into dictionaries, set up the routes under `/en/` and start writing. The plan went sideways in the first hour, before a single sentence got translated, when I went to look at how the middleware classifies routes.

Because a language prefix does not add pages. **It adds a second name for every page that already exists.** And all of my authorization was written by comparing names.

## The guard is not comparing what you think

This repo has a dozen functions that take a pathname and return a boolean. They decide serious things:

- Whether the route is off limits in the public demo (the credential vault, the environment variables).
- Whether it is a login, which carries a tight rate limit so it cannot be brute forced.
- Whether it is a payment link, capped at 30 per minute.
- Whether it falls under the global rate limiting umbrella.
- Whether it belongs to the admin panel and requires a session against an allowlist.
- Whether it belongs to the client portal.

They all compare against literal routes: `/admin`, `/portal`, `/api/portal/login`. None of them knows anything about languages, and there is no reason they should: they were written when the site had a single set of URLs.

The day `/en/` exists, `isDemoBlockedPath('/en/admin/backup')` returns `false`. It does not fail, it does not throw, it does not log anything odd. It calmly reports that the route is not blocked, because that is true: `/en/admin/backup` is not on its list. What is on its list is `/admin/backup`.

That is the whole failure, and it is the kind nobody sees: a block that turns into a pass without anyone writing a new line of code.

## What breaks is not cosmetic

It is worth separating the two kinds of damage, because they carry very different urgency.

A link pointing at an English page that does not exist is a 404. Annoying, fixable, harmless.

A guard that is blind to the prefix is something else. A login without its tight rate limit is viable brute force. A public demo without its blocked routes is the secrets vault served to anyone who can type three letters in front of the path. A blind admin gate would simply be the panel, open.

That is why this was not a phase of the translation plan. It was Phase 0, the one that blocks all the others: **until it was solved, every new English page was a potential back door.**

## Normalize once, at the very top

The fix fits on one line, and its value lies in where that line lives:

```
const canonicalPath = delocalizePath(pathname)
```

From there on, no guard in the middleware ever sees the raw pathname again. They all receive the canonical route, the same one it would have in Spanish. `/notes` and `/en/notes` get identical treatment because, for security purposes, **they are the same route under two names**.

The rule holding it up is that normalization happens once and as high up as possible. Normalizing inside each guard would have been worse than not normalizing at all: twelve places to remember, and guard number thirteen, written six months from now by someone in a hurry, does not remember.

## Private routes are not normalized, they are cut off

Normalizing solves the classification problem, but it leaves a question open: what should actually *happen* to `/en/admin`?

The answer is that this URL must never exist. The panel is not translatable content, and neither is the API, the portal, the payment links or the three login gates. So before normalizing anything, the middleware cuts:

```
if (isLocalizedPrivateRequest(pathname)) return new Response('Not Found', { status: 404 })
```

A flat 404, and it runs **before everything else**: before the canonical-host redirect, before the lab's chaos engineering, before the security sensor. There is no scenario in which that combination should execute any code at all.

I could have redirected `/en/admin` to `/admin`, which is what I do with public pages that are not translated yet. That would be a mistake: a redirect confirms the route exists, and it would walk a hostile request through half the middleware chain only to land in the same place. For anything private, the right answer is the one that says nothing.

Untranslated public pages do get redirected, with one detail: **302, not 308**. That page will exist in English some day, and a permanent redirect cached in browsers and search engines would be a parting gift from today's me to the me of three months from now.

## The prefix is not stripped with a `slice`

The function that normalizes is three lines long and still has more tests than anything around it, because trimming a prefix is exactly the kind of operation that looks trivial and swallows edge cases.

The naive version (`pathname.startsWith('/en')` plus a `slice(3)`) turns `/entrar` into `trar` and `/enterprise` into `terprise`. The second one is a weird 404. The first one is worse: `/entrar` is one of my login gates, so the operation meant to neutralize the prefix has just hidden a login from the guards that were watching it.

That is why the prefix is matched with an anchor and a segment boundary (`/^\/(en)(\/|$)/`), and why the test cases are adversarial before they are happy: `/en//admin` with the double slash, `/EN/admin` in uppercase, a bare `/en`, and `/english/something`, which must be left alone.

For `/EN/admin` the decision was to let it fall through: the prefix is case sensitive, like the filesystem, so that URL is not "the panel in English", it is a route that does not exist. It never reaches a guard because it never reaches a page.

## The test that asserts the vulnerability

The net under all of this is two tests, and the second one is my favorite.

The first is a parity test: it walks every guard in the repo against a list of real routes and asserts that the verdict for `/x` and the verdict for a normalized `/en/x` match. It is boring, and it is the one that has to stay green.

The second does the opposite. It asserts that the guard **is in fact blind**:

```
expect(isDemoBlockedPath('/en/admin/backup')).toBe(false)
expect(isDemoBlockedPath(delocalizePath('/en/admin/backup'))).toBe(true)
```

Written out like that, it looks like I am certifying a bug. What I am doing is pinning down in writing where the security actually comes from: not from the guard, but from the normalization that happens before it. If someone "fixed" the guard by teaching it about languages, this test would go red and force them to read the comment above it. And if someone removes the normalization from the middleware, the first test falls.

A test that documents why something is fragile is worth more than one that pretends it is not.

## What I took away

There is nothing special about a language prefix. Any layer that rewrites URLs creates aliases: a tenant prefix, an API version, an optional trailing slash, casing, percent encoding. They all produce the same pattern - the same resource under several names - and they all do damage in the same place, which is any authorization decision made by comparing strings.

The rule I came out with, and now apply well outside i18n, is short: **if you authorize by route name, canonicalize first, do it in exactly one place, and put that place above everything that decides.**

The expensive part was not implementing it. It was realizing in time that translating a site is, technically, doubling its namespace.
