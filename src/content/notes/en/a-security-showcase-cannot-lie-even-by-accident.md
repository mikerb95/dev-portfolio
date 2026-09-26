---
title: A security showcase cannot lie, even by accident
description: I redesigned this site's security page to show the defense instead of describing it. The most useful part wasn't the animation, but the five things the page said that weren't true.
date: 2026-09-26
tags: [security, opsec, turso, motion]
lang: en
translationOf: una-vitrina-de-seguridad-no-puede-mentir-ni-por-accidente
---

This site's [security page](/en/security) is titled "Security, with evidence". Since July it had been a headline, a paragraph and almost twenty identical cards: numbers from the [micro-SIEM](/en/notes/building-a-micro-siem-for-my-portfolio), four findings from an audit and a list of controls. Everything it said was true, but nothing proved it. The four layers of defense, for instance, were a numbered list.

I set out to redesign it so that every section would show what it claims. What I didn't expect is that, once each claim had to be drawn, the ones that didn't hold up would surface.

## What is data and what is illustration

The centerpiece is a filter: dots that cross the layers of defense from left to right and end up where the system would really leave them. A hostile dot is stopped at the classifier if its category is a repeat offender or rate-limit abuse, gets caught if it touches a decoy, and otherwise drops into the log. The animation doesn't decide the destination; the same rule that describes the system does:

```ts
export function destinoDe(categoria: string) {
  if (categoria === CATEGORIA_SENUELO) return 'senuelo'
  if (CATEGORIAS_FRENADAS.includes(categoria)) return 'frenada'
  return 'registrada'
}
```

The first problem was about honesty, not design. The mix between attack types is real: it comes from the 30-day aggregates the page already published. But how many clean dots do I draw for each hostile one? The site doesn't count clean visits, so I don't know. I could invent a ratio and let it pass as data, or say so. The ratio is a constant in the code, and the piece carries a footnote that says exactly that: the mix between categories is real, and the amount of clean traffic is illustrative.

The same goes for the first layer, the platform's mitigation. It exists, but its work happens outside this site and I don't measure it from here. In the filter it's drawn dashed and without a number, and no dot is stopped there. A layer catching dots with no data behind it would have been a claim dressed up as a chart.

Two more decisions come from the same rule. Before the classifier every dot is gray, because a hostile request is indistinguishable from a clean one until something inspects it. And one dot, labeled "you", crosses clean all the way to the site. That one I can claim without measuring anything: if you are reading the page, no layer stopped you.

## What the page was saying without meaning to

Going through every number to decide how to animate it turned up five things that weren't true, or not quite.

**A target among measurements.** The fourth card on the panel read "p99 overhead ≤5ms", next to detected events and automatic blocks. Those two are measurements; this one isn't. It's a design target nobody measures in production. I removed it from the panel, and it stays in the SLO list, which is presented as a list of targets.

**A label more ambitious than its number.** "OWASP categories" counted every category the classifier has, including repeat offenders, bots, decoys and API abuse, none of which are OWASP categories. It now reads "Categories detected", which is what it counts.

**A cap that hid exactly the interesting part.** The per-category breakdown was limited to eight rows, and there are ten possible categories. The one left out was almost always the decoy: the smallest, and the only unambiguous signal the system has. I noticed because the filter, which spreads that same breakdown, showed "0 trapped" on the test database, which did have decoy events. Raising the cap doesn't read a single extra row: the scan is the same and only the cut changes.

**An outdated promise.** The methodology said the page was updated with every audit, but it only listed July's. September's, on the admin panel, closed nine findings that appeared nowhere.

**A detail in the methodology.** It said every finding was fixed "in a dedicated commit". Linking September's showed otherwise: two commits close two findings each, and one of the endpoint moves happened in a commit whose title is about something else. I link the real commit and the text says so, instead of pretending the history is tidier than it is.

None of the five was serious on its own. Together, on a page called "with evidence", they were.

## Findings as a commit history

Fixed findings are shown as a line of commits. As you scroll, when the line reaches a commit, its finding flips from "vulnerable" to "fixed": the problem is struck through, the fix is revealed and the hash lights up. The server renders everything already fixed, because that's the real state, and the script only reopens what isn't in view yet. Without JavaScript, or with reduced motion, there is nothing to reopen.

Going from four findings to thirteen introduced a risk that didn't exist before. The text of each one lives in the language dictionary and its metadata (commit, date, classification) in a separate module, and they are joined by position. A finding added on one side and not the other breaks nothing visible: it shifts every commit by one, and each card ends up linking another one's fix. It's the kind of error no visitor notices and that undermines the whole page. A test pins that the lengths match in both languages.

Only fixed findings are published. Whatever an audit deliberately leaves open doesn't appear until it's closed, and nothing published works as a playbook: no decoy routes, no rule names, no account identifiers.

## Evidence that doesn't burn the quota

The animation didn't add a single query: the filter spreads the same aggregates that were already there. But reviewing them surfaced the underlying problem. Every visit summed thirty days of raw events across five queries, and Turso bills scanned rows, not queries. It's the same pattern that has already exhausted my read quota more than once, and the CDN cache doesn't bound it, because it revalidates per region.

The aggregates are now computed at most once every three hours and stored as a snapshot in a single settings row. Each visit reads that row, or nothing at all if the instance already holds it in memory. If recomputing fails, the previous snapshot is served instead of publishing zeros, and the page says how old it is: "Computed 2 hours ago". A stale number that states its age is still evidence. A stale number that passes for current isn't.

## What I take away

A security showcase has two readers with opposite interests. The one assessing the work wants to see that the system exists and works. The one looking for a gap wants the playbook. I already had the rule about not handing over the playbook. What I was missing was the other half: every number has to say exactly what it counts, every illustration has to say it is one, and whatever isn't measured must not be drawn as if it were.
