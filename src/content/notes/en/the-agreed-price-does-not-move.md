---
title: The agreed price does not move
description: I built Cotiza, the tool I use to run my logistics consulting engagements. The price is set up front and never reopened; anything that comes later is an add-on, with its own price and the client's approval before the work starts. The AI helps count, but never charges.
date: 2026-10-06
tags: [product, ai, security, architecture]
lang: en
translationOf: el-precio-pactado-no-se-toca
decision:
  problem: "Engagements that started small and ended in hours nobody paid for."
  rejected: "Re-pricing at the end based on the work done"
  chosen: "A frozen price, counted allowances and add-ons approved up front"
---

Before software I spent eight years in logistics, foreign trade, purchasing and operations, and people still come to me for that work. The problem was never the work itself. It was the scope. An engagement starts as "help me with a few presentations and review some documents" and ends in hour-long meetings nobody agreed to, messages at ten at night and new requests justified with "we talked about that".

My first idea was a calculator that would adjust the final price based on what had been done. I dropped it quickly: changing the price halfway through is bad practice, the client experiences it as a surprise, and the conversation stops being about the work and becomes about trust. The price has to be fixed up front. What needed solving was everything else.

## Five rules, and a tool that enforces them

None of the rules is new. What is new is not depending on my own discipline to apply them.

1. **Quote deliverables you can count.** Not "help with presentations", but how many presentations, how many slides each and how many source documents.
2. **What is included comes as allowances.** A number of meetings of a set length, a number of revision rounds per deliverable, support hours and a response time. The tool counts them down.
3. **If it is not written down, it was not agreed.** Every meeting produces a written summary with a deadline to correct it. If nobody corrects it, the summary stands.
4. **The agreed price does not move.** New work comes in as an add-on, priced from the rate already in the proposal, and approved before it starts.
5. **Outside business hours costs more**, and that surcharge is also written down from day one.

With those rules, the "calculator" I wanted at first turns into something else: it does not adjust the price, it shows three figures. The agreed price, which never changes; the approved add-ons; and what is still waiting for a decision.

## A pure engine and a frozen proposal

The calculation lives in a pure module with no database, and it is the same code in the browser and on the server. In the browser it gives a live price while I build the proposal. On the server, when the proposal is frozen, it is recalculated from the configuration and the full result is stored: that day's rates, allowances and rules, with a SHA-256 fingerprint over canonical JSON. Whatever the browser showed does not count. If I change my rates tomorrow, an engagement accepted last week keeps its own, and so do its add-ons.

The payment plan has no calculation of its own: it reuses the amount brackets Plano, my software quoting tool, already used, with consulting names instead of "design" and "launch". Two tools with two different splits would end up telling the same client different things.

The state machine is short on purpose: draft, sent, accepted, closed. Reopening only exists before acceptance. After that there is no button to "adjust" an accepted proposal, because that is exactly the bad practice the tool exists to prevent. Every transition is a conditional UPDATE on the state that was read, so two crossed clicks collide instead of overwriting each other.

## The log decides on its own when something is an add-on

Once an engagement is accepted, everything gets logged, and half of the decisions are made by the code:

- A request marked as an add-on is born with its price. The surcharge is not a checkbox: it is decided by the time of the request read in Bogotá time, counting weekends and Colombian holidays. The server runs in UTC, and a message sent at half past seven in the evening here is the next morning there; without that conversion, an after-hours request would look like a normal one.
- A meeting that no longer fits the allowances, or that runs past the agreed length plus a few minutes of grace, becomes an add-on in half-hour blocks. Allowances are spent in the order meetings are logged, not by date: a meeting recorded late does not steal the slot of one already counted as included.
- One revision round too many asks for the hours I estimate. There is no honest way to compute on its own what "one more change" costs.

Each entry and its add-on go in the same transaction. The tests run against a libSQL database created from the real migration SQL, with a frozen clock, because a test that depends on the day it runs is a test that will one day fail for no reason.

## The client approves, with a receipt

The proposal reaches the client as a private link. They see what is included and what is not, their allowances with what they have already used, the price, the summary of every meeting and, at the very top, the add-ons waiting for approval, with one sentence doing most of the work: nothing starts until you approve it.

The token has 128 bits and the database only holds its hash, plus an encrypted copy so I can copy the link again from the panel. Generating a new one kills the old one. The page is public but uncached and out of search engines, because it is a personal document with prices.

When accepting, the client leaves their name and ID number, and the page sends the fingerprint of the proposal it displayed. If I changed it while they were reading, the old version is not accepted. For every add-on, the amount goes into the WHERE clause of the UPDATE: the figure the client saw gets approved, or nothing does. Every decision leaves a SHA-256 receipt anyone can recompute from the stored data. That is the written answer to "I never approved that".

## The AI counts, but never charges

There are three places where Claude helps: turning the client's message into a countable scope with the questions worth asking before quoting, classifying a new request against the accepted scope, and turning my meeting notes into a summary. The guarantees live in code, not in the prompt:

- **No money figure comes from the AI.** The output schemas have nowhere to put one, and a guard drops any text containing money that was not already in what I pasted. The AI can repeat the freight cost the client mentioned; it cannot invent a price. Prices come from the engine.
- **Quotes are literal.** Each deliverable carries the client's sentence that justifies it, and the code looks for it in the original text. If it is not there word for word, it is removed. An invented quote is worse than none, because it gets used to say "you asked for this".
- **Nothing is logged on its own.** The scope goes into the draft, which I review before freezing, and the classification and the summary fill in forms I confirm with a click.

I asked the classifier for something explicit: when in doubt between "in scope" and "add-on", if the request adds quantity or a new topic, it is an add-on. Being accommodating there is exactly the habit I want to break.

## A weaker door that opens a single room

I use this tool where the client is, sometimes on a machine that is not mine, so getting in could not depend on GitHub or a physical key. It opens with a short PIN. A key that weak is only acceptable for three reasons: it opens this tool and nothing else in the panel (routes matched against anchored patterns, so a new page with a similar name is not left open by accident), it has a per-IP brake plus a global one that shuts the door when failures pile up from many IPs, and it fails closed: if the PIN cannot be read, it does not open. Every entry pings my phone. Changing the PIN invalidates every session opened with the old one, because the PIN version is part of the cookie signature.

## What I still do not know

The AI is tested against a fake API with deliberately invented quotes and figures, and against the real model with a realistic request. The first real run already taught me something: it proposed an assumption that contradicted my allowances, and now the prompt forbids writing about what the tool already fixes. I have not yet used it with real client requests. And the hours-per-deliverable table is today's estimate; in a few months, with closed engagements, I will know whether presentations take me as long as I think. What I do know is that the next time someone tells me "we talked about that", there will be something in writing.
