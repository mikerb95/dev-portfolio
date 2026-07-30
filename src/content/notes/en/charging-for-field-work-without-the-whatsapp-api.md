---
title: Charging for field work without the WhatsApp API
description: Not all my work is code. I needed to charge for on-site tech support from my phone, out in the street, without paying for the WhatsApp Business API or exposing the amount in a link anyone could edit.
date: 2026-07-16
tags: [payments, security, product]
lang: en
translationOf: cobrar-un-trabajo-de-campo-sin-api-de-whatsapp
---

Not everything I do is writing software. I also fix computers, install networks, do on-site support — work that gets charged at the end of the visit, standing up, with the client next to you. The real way to charge for that isn't a checkout with a cart: it's a number, a link, and "pay me here". I wanted that link to arrive over WhatsApp, without paying for the WhatsApp Business API (designed for volume, not for a freelancer sending three messages a day) and without giving up anything I'd already built into the gateway that runs `/pay`: real idempotency, Wompi signature verification, and a state machine that never lets an approved payment go backwards.

## Reuse the gateway, don't duplicate it

The easy temptation was building a separate "collections" system: another table, another flow, another state logic. I resisted it. A field collection *is* a payment — same `payments` table, same idempotency, same Wompi webhooks, same signature verification. All I added to the row were five columns: the payer's phone, where it was born (`pay` vs `cobro`), a short code for the link, an optional expiry, and a soft link to the client record if they already existed in the CRM. Zero new tables, zero parallel state machine. Voiding a collection goes through the same `applyGatewayEvent` that processes a real webhook: the `approved → voided` transition that already existed for manual refunds is, without changing a line, also the "Void" button on the field screen.

## The amount never travels in the link

The link WhatsApp delivers is `/c/AB3K9F` — a six-character code, nothing else. The temptation to put the amount straight in the URL (`/c/AB3K9F?amount=150000`) is what opens the door to someone editing it before paying. Instead, the server looks up the payment by its code and signs the Wompi parameters *at click time* — the same integrity pattern the public checkout already used, only now the trigger is a short code instead of a form. The client never sees, and can never touch, a figure other than the one I configured.

## A phone number is not a password

The second problem was history: I wanted the client to see their past payments without me having to build an accounts system. The obvious solution — "look it up by your phone number" — has an evident flaw: anyone who knows someone else's number would see their complete payment history. A phone number gets shared constantly; it isn't a secret.

So I split access into two levels. Every WhatsApp message carries a link with an HMAC of the phone number — a credential only I can generate because only I have the server secret — and that link shows the full history. But I also left open a manual lookup by number alone, for when someone loses the link: that view returns real dates and statuses, but the amount arrives masked (`$ •••.500`) and with a limit of five lookups per hour. Enough for the owner to recognize their own payment; useless for a third party trying to profile what I charge whom.

## Authorizing without a session

A detail I didn't anticipate until implementing it: in test mode (with no Wompi keys configured), the endpoint that simulates the gateway required an admin session or ownership of a client-portal invoice. Neither applies to someone who just received a link over WhatsApp. The fix was treating the short code as what it is — proof of possession, no different in spirit from a portal client proving they own their invoice — and accepting it as one more authorization path, compared in constant time so that not even the response timing leaks whether a code is nearly right.

## What I learned about mixing conventions

The most annoying bug wasn't a security one but an environment one: part of this repo's code reads variables with `import.meta.env` and part with `process.env`, and they aren't interchangeable — Astro's dev server loads `.env` only into the first, and Vercel in production only injects into the second. I wrote the code reading a single source and it worked perfectly in production and failed silently locally: the signed history link always fell back to the backup form, as if the secret didn't exist. The bug didn't show up as an error — it showed up as a polite degradation to a secondary path, which is the worst kind of bug because it breaks nothing, it just makes sure the good thing never activates. The fix was a helper that checks both sources; the lesson was not to trust that "works on my machine" and "works in production" measure the same thing when the environment has two different ways of loading configuration.
