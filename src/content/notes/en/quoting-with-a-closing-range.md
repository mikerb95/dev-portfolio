---
title: Quoting with a range that closes
description: I built Plano, the quoting tool I use for every proposal. The price starts as a range and closes with every answer, the client receives their project drawn as a floor plan, and the AI reads the conversation without being able to write a single figure.
date: 2026-10-06
tags: [architecture, ai, payments, product]
lang: en
translationOf: cotizar-con-un-rango-que-se-cierra
decision:
  problem: "Every quote started from scratch, with a price that was a hunch."
  rejected: "A template with a fixed price per package"
  chosen: "A range that closes with questions, on the site's own engine"
---

Quoting was the part of my work I did worst. Every proposal started from zero: a WhatsApp conversation, a spreadsheet, a number that felt reasonable and a hand-made PDF. Then came the genuinely hard part: when the client pays, how many payments, what happens if they vanish for three weeks, who signs off on the design. All of that stayed vague until it was needed, which is exactly the worst moment to decide it.

I built Plano to stop improvising. It rests on three ideas I had not seen together in any quoting tool, and all three came from looking honestly at what I kept getting wrong.

## The price is a range, not a number

When a client says "I want an online store", I don't know what it costs. I know a store in my table runs from 20 to 35 hours, and that the difference depends on things they haven't told me yet: 30 products or 800, inventory or not, sizes and colors.

The tools I knew forced me to pick a number up front. Plano does the opposite: every component starts with its full range and comes with two or three questions. Each answer selects a band inside that range. "Fewer than 50 products" keeps the low end; "more than 500 or with variants" the high one. Bands overlap on purpose, because an answer reduces uncertainty, it doesn't remove it.

What makes this safe is that **no answer can push a component outside the table**. The band is expressed as fractions of the approved range, from 0 to 1, and the engine rejects anything outside it. At worst the range is the table's; at best, a narrow band inside it.

What I offer the client is the top of the range. That turns questions into something worth asking: with everything open I have to charge the worst case to cover myself; with every answer the ceiling drops and the proposal becomes more competitive. The builder shows it as a cone that narrows, with a certainty percentage next to it.

## One pricing engine

The obvious temptation was to write Plano's calculation from scratch. I didn't, and it is probably the most important decision in the project.

The site already computes prices in three places: the web design page, the AI advisor in the chat bubble and the assistant's quoting tool. All three read the same rate card and the same engine. If Plano had its own math, sooner or later the site would tell a client one number and the proposal another. So Plano only added the ability to narrow each component's band, with tests proving that without a band the result is identical to before.

On top of the price, Plano builds the rest with pure modules: the payment plan by amount, dates in Colombian business days (holidays included), installments with a surcharge on a fixed payment, and the clauses that apply given what the project contains. Being pure is not a whim: the same function runs in the browser so the builder recalculates live, and on the server when a version is frozen. Each version sent keeps a SHA-256 fingerprint over canonical JSON, so any divergence would show.

## The AI reads, but writes no figures

The first step of a proposal is almost always a messy conversation. Plano has a button to paste it and let Claude draft the proposal. I gave the AI a narrow job and removed everything that could go wrong:

- It can only pick components from my table. The output schema is an enum of valid ids, and the code drops anything else.
- The schema has no field where a price could go. It is not a prompt instruction: there is simply nowhere to write one.
- For each component it must quote the client's exact sentence that justifies it. The code then searches the conversation for that sentence. If it isn't there verbatim, the quote is removed and counted as discarded. Traceability you can't trust is worthless.

The second AI feature is the one I use most: "the difficult client". Claude reads the proposal as the pickiest client would and returns where it can be read two ways, where scope can grow without anyone paying for it, and a pre-mortem. Everything it writes goes through the assistant's money guard: if a finding mentions an amount that doesn't come from the calculation, the whole finding is dropped.

## The client gets a floor plan, not a PDF

The part I enjoyed building most is what the client sees. Their proposal arrives as a private link, and the first thing they find is their project drawn as a house floor plan: each component is a room, what's included is built with solid walls and what can be added is dashed.

If I enabled that knob, they tap a dashed room, the room gets built, the price counts toward the new value and the delivery date shifts. They can also choose between the three versions and between paying per milestone or in installments. The client's browser never has my rules or my hours: every knob is a server-side simulation that recalculates from the version I sent, not from a draft I may be editing.

Terms read in plain language, with the formal text one click away. On acceptance, with name and ID number, the server recalculates once more and only accepts if the total matches what the client saw. A receipt keeps the fingerprint of the exact version. If the client moved knobs, that choice is frozen as a new version marked as theirs.

## From "yes" to a project without touching anything

The deposit is paid with Wompi from the same link, with an idempotency key derived from the proposal and the accepted version: two clicks, one charge. When the webhook confirms the payment, Plano claims the proposal with a conditional UPDATE and creates the client, the project, the milestones with their dates, draft invoices for the remaining payments and the client portal invitation. Webhooks repeat by design; the conditional UPDATE means only the first one converts.

The integration test I trust most walks through all of it against a temporary libSQL database built from the real migrations: versions that don't duplicate, knobs that only change what I enabled, an acceptance rejected because the price doesn't match, the deposit requested twice and a single conversion even if the webhook arrives twice.

## What I don't know yet

I have no history of real hours today, so the component table is an honest estimate and nothing more. Plano already has a place to log how long each component took on accepted projects and, with three measurements per component, it will tell me whether the table runs short or long relative to the buffer. It never changes the table by itself: it suggests, and I decide. In a few months I'll know whether my ranges were any good, and that will be the second part of this note.
