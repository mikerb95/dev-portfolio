---
title: Getting an assistant to recommend you without making up your price
description: I got the site ready for ChatGPT, Claude and Perplexity to cite it with correct data. The llms.txt I had was handwritten and no longer said what I sell; now it is generated from the same rate card as the pricing page, robots.txt cannot open the admin panel to a bot by accident, and a counter shows which agents come to read.
date: 2026-10-20
tags: [seo, ai, observability, architecture]
lang: en
translationOf: que-un-asistente-te-recomiende-sin-inventarte-el-precio
decision:
  problem: "Assistants read a stale llms.txt: no services, no prices, no notes."
  rejected: "Rewriting llms.txt by hand"
  chosen: "Generate it from the rate card and notes, invite bots, count them"
---

More and more people ask an assistant what they used to search on Google: "who can build me a website in Colombia, and how much do they charge?". The assistant answers with what it finds, and what it finds about a small site tends to be thin and stale. This has a name, AEO (answer engine optimization), and most of what gets said about it is plain SEO with a new label. What does change is who you are talking to: a model that copies sentences, not a person who clicks.

## The problem was not the door, it was the message

The first step was checking whether AI bots could get in. With the User-Agents of GPTBot, ClaudeBot, PerplexityBot and the rest, production answered 200 on every page: neither the micro-SIEM nor the WAF stopped them.

The problem was what they read. The site's `llms.txt`, the file assistants check to understand what a website is about, was something I had written by hand in July. It introduced me as a software engineer working with TypeScript and React. It did not say the site sells websites or AI training, it had no prices, and it listed none of the 23 notes. An assistant reading it would know less about my business than someone landing on the home page.

Rewriting it by hand would fix it for a month. The same file had already gone stale once, and it would go stale again with the next price change.

## One place for every fact

The site had already solved this problem elsewhere: prices live in `tarifario.ts`, and both the pricing page and the chat advisor read from it. If the price lived in two places, the website and the advisor would end up telling the same client different things.

So `llms.txt` became a route generated from three sources that already existed: the rate card for the figures, the dictionaries for each page's description and the FAQs, and the notes collection for the articles. The key facts section is written in short, complete sentences ("Business plan: from $1,500,000 COP. Ready in 1 to 2 weeks"), because an answer engine copies the sentence, not the paragraph. Next to it sits `llms-full.txt`, with the full text of the notes, so an assistant can cite without crawling page by page.

The same goes for structured data. The site used to declare a Person with a tech stack and two services with no price. Now there is a business node with a fixed identifier, an offer catalog with each plan's starting price taken from the rate card (pesos in Spanish, dollars in English), and the FAQs on both service pages marked up as FAQ.

## The robots.txt that could open the panel

The underlying decision was to let everyone in, including the bots that crawl to train models. For a site that wants to be recommended, a model that already knows the business by heart is a plus: it names it even without searching the web.

Declaring them in `robots.txt` has a trap. A bot that finds a group with its own name stops reading the `*` group. If the GPTBot group says `Allow: /` and nothing else, the `Disallow: /admin` above stops applying to it. With a handwritten file, someone adding a blocked path only to the first group would silently open it to fifteen bots.

That is why `robots.txt` is generated too: blocked paths are one list, and both groups come from it. A test reads the file the way a bot does, groups it by User-agent, and requires both groups to have exactly the same Disallow lines.

## Knowing whether they come

The last step was measuring, because optimizing something you cannot see is faith. There are two different signals: bots reading the site, and people arriving from an assistant.

Bots are counted in the middleware with an in-memory regular expression, like the SIEM sensor, and the write is not awaited. There is a limit worth stating: the notes and the pricing page are prerendered, the CDN serves them without touching the server, and the middleware sees nothing there. The bot count is a floor, not a total. That is why `llms.txt` and `llms-full.txt` are served through SSR: an agent coming to read the map is the signal that matters most, and that one does get counted.

People are counted in the browser, which runs on every page. ChatGPT and Perplexity tag their links with `utm_source`; the others are recognized by the referrer host. The browser sends only the assistant's id, once per session, and the server accepts only ids from a fixed list.

Everything goes into one counter per day and source, with no IP or User-Agent. The panel reads 30 days in a few dozen rows, which on a database that bills by rows read is the difference between a cheap page and an expensive one.

## What this does not solve

No file makes an assistant recommend you. Models cite what other sites confirm: a business directory, a Google business profile, an article published elsewhere that links here. This technical layer makes sure that when an assistant arrives, it finds correct data and not a file from July. Whether it arrives still depends on the same old things: publishing work that answers real questions, and getting others to link to it.
