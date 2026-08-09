---
title: Scanning any domain without putting your own at risk
description: Turning a diagnostics endpoint only I could use into a public tool for my classmates - and why that means solving abuse and SSRF first, not the analysis itself.
date: 2026-07-17
tags: [security, ssrf, rate-limiting, accessibility, lab]
lang: en
translationOf: analizar-cualquier-dominio-sin-poner-en-riesgo-el-propio
---

A classmate asked for something simple: a place to paste his project's URL and see how well it's put together - headers, TLS, SEO, accessibility. I already had almost all of that written. It lived in `src/lib/diagnostics.ts`, behind the admin panel, used only to diagnose my own monitors. The temptation was to copy the endpoint, strip the auth `middleware`, and call it done. I didn't, because that's exactly where the real problem starts: the moment an endpoint accepts an arbitrary URL from an anonymous visitor, it stops being a diagnostics tool and becomes an attack surface.

## The endpoint isn't the risk - being a proxy is

The question that matters isn't "can I scan `google.com`?" - that always worked. It's "what happens if someone enters `169.254.169.254`, or a `10.x` address on my own internal network?". With nothing to stop it, the server happily opens that connection: it does a `fetch`, opens a TLS socket, resolves DNS - all from inside my infrastructure. That's SSRF: using my server as a middleman to probe networks an attacker has no direct access to. I searched the whole repo for anything that already filtered private IPs before connecting. There was nothing - not in the diagnostics engine, not in the uptime monitoring engine that does something very similar. I had to write it: resolve the hostname, check every returned IP against the reserved ranges (`10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `fc00::/7`, and the rest), and reject before the first connection.

Alongside that, a limit of 5 scans per minute per IP, reusing the same `enforceLimit` that already protects the contact form. Neither of those makes the analysis "better" - they just keep the tool from becoming something I never authorized.

## Saying no to axe-core, for now

I wanted accessibility checked by a real engine - the same axe-core that already runs against my own site in CI. The problem is that scanner needs an actual headless browser, and today it only exists as a dev dependency, invoked from GitHub Actions with Playwright explicitly installed. Putting it in a public serverless function means bundling Chromium (`@sparticuz/chromium`, tens of megabytes), accepting multi-second cold starts, and edging toward the function duration limit on Vercel's free plan - all of that for every visitor who pastes a URL.

Instead, the accessibility test runs heuristics over the already-downloaded HTML: `<img>` without `alt`, form fields without a `label` or `aria-label`, a missing `<h1>` or `lang` attribute. It's deliberately less precise than axe-core, and the result says so explicitly in the summary - "this does not replace an axe-core audit" - because the worst version of this tool would be one that pretends to be a full audit and isn't.

## Reuse, don't reinvent

Of the eleven tests the scanner runs, eight already existed as-is in `diagnosticSuite()` - availability, TLS, HTTPS redirect, headers, DNS, domain expiry, robots.txt, sitemap.xml. Only three were new (SEO metadata, basic performance, heuristic accessibility), and all three share a single download of the HTML instead of asking the other site for it three times - something worth being careful about when the domain you're scanning isn't yours.

The lesson that keeps repeating in this lab: when something already solves 80% of the new problem, the discipline isn't writing another version from scratch - it's noticing what's missing and stretching it exactly there.
