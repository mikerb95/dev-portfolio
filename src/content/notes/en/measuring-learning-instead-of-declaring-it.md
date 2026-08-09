---
title: Measuring learning instead of declaring it
description: A checkbox ticked in January can't tell forty minutes of daily practice apart from opening the topic once and never coming back. I built a tracker that measures the habit, and the three decisions that make it correct are about dates, not UI.
date: 2026-08-09
tags: [learning, architecture, testing]
lang: en
translationOf: medir-el-aprendizaje-en-vez-de-declararlo
---

I decided to specialize in .NET and C#. The reason is prosaic: enterprise backends in Colombia (banking, healthcare, public sector) run on C#, and a portfolio that only speaks TypeScript opens half the doors. The interesting part isn't that decision, it's what I found when I went to record it in my own panel.

I already had two places where it should have fit. `/admin/certifications` keeps the inventory of courses and certifications, with status and date. The Evolution Path keeps learning paths with a checkbox per lab. I put the intent in the first one, ticked a couple of boxes in the second, and sat there with the distinct feeling of having recorded nothing at all.

The problem is that both tools answer **"what did I do"**, and the question that matters when you want to learn a new stack while working in another one is **"how much time have I actually been putting in, and is the habit holding"**. A checkbox ticked in January can't tell apart someone practicing forty minutes a day from someone who opened the topic one afternoon and never came back. Both look identical: one blue box.

So I built a third thing. And the interesting part is that the hard decisions weren't in the dashboard, they were in how you store a date.

## The only thing persisted is the session

The whole model rests on one idea: **the practice session is the only fact**. Day, minutes, topic, and what I understood. Everything else (streak, accumulated hours, progress against the weekly goal, heatmap, syllabus percentage, achievements) is computed from that.

This isn't minimalism for its own sake. Every derived figure you choose to persist is a figure that can drift out of sync with the data that produced it. And that case isn't hypothetical: you log a session wrong, you delete it, and now you have an hours counter that includes a session that no longer exists.

The track's syllabus (28 milestones across 8 areas, from C# fundamentals to deploying a real API) does live in the database, because I want to edit it from the panel as I discover an area was badly split. But the template it's seeded from lives in code, and seeding is idempotent by title: running it again adds the template's new milestones without duplicating or overwriting the state of the ones I already closed.

## The decision that nearly broke the streak before it existed

The server runs in UTC. I study at night, after work.

When I log a session at 8pm in Colombia, in UTC it's already 1am the **next day**. If I store the session as an instant and then compute the streak by grouping days in UTC, that session counts toward tomorrow. The result: I practice every day of the week and the dashboard shows a broken streak, because every session lands one day past the day it happened.

A motivational tracker that punishes you for practicing late is strictly worse than no tracker.

The fix was to stop storing instants. `skill_sessions.day` is text formatted `YYYY-MM-DD`, resolved once in the `America/Bogota` zone at logging time:

```ts
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TRACKER_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
})

export function dayKeyOf(date: Date = new Date()): DayKey {
  return dayFormatter.format(date)
}
```

From there on, all the arithmetic is calendar arithmetic over those keys, never clocks. Adding a day adds a day, with no hours in between that could shift.

What convinced me this was right and not a detour: **a streak is a fact of the calendar, not of the clock**. Storing the instant forces you to reinterpret the time zone on every query, every test, and every chart. Storing the day forces nothing. The test that pins this down is one line and says it all:

```ts
// 8pm in Bogotá is already the next day in UTC.
expect(dayKeyOf(new Date('2026-08-09T01:30:00Z'))).toBe('2026-08-08')
```

## One day of grace, because the alternative is cruel

The second decision was when a streak breaks.

The obvious implementation (no session today means the streak is zero) produces this: you open the panel on a Tuesday at nine in the morning and see your twelve-day streak at zero, because you haven't studied yet on a day that's been alive for nine hours. It's technically true and motivationally disastrous.

The streak stays alive if the last session was **yesterday**, and only breaks after two days. But keeping it alive silently doesn't help either, so the computation returns a separate field:

```ts
return {
  current,
  record: Math.max(record, current),
  lastActive,
  activeToday: gap === 0,
  atRisk: current > 0 && gap === 1,
}
```

`atRisk` is what drives the dashboard's headline message. If I already practiced today, it says how many days I'm on. If the streak is alive but there's nothing logged yet today, it says it's on the line. And if it broke a while back, it doesn't pretend: it says how many days passed and what the record was, which is the only honest way to invite starting over.

That one boolean does more for the habit than the rest of the dashboard combined.

## Achievements are computed, and that's why they're honest

Ten achievements: first session, 7 and 30-day streaks, the first week hitting the goal, thresholds at 10, 50, and 100 hours, and three from the syllabus.

There's no unlocked-badges table. They're recomputed on every render from the sessions and milestones the page already loaded.

The reasoning is the previous one taken to its limit. A badges table forces a write on every session `POST`, with the "did this insert unlock anything?" logic duplicated inside the endpoint. And it corrupts the moment you delete a mislogged session: you're left with badges granted by data that no longer exists. Recomputing over data already in memory costs nothing and can't lie.

The non-trivial part is the dating. An achievement has to say **the day it was earned**, not the day I opened the panel. For hour thresholds that means walking the sessions in order and finding where the running total crossed:

```ts
let acc = 0
for (const s of sorted) {
  const before = acc
  acc += s.minutes
  for (const h of hourThresholds) {
    if (before < h * 60 && acc >= h * 60) crossedOn.set(h, s.day)
  }
}
```

And for streaks, the day that closed the first run of N consecutive days, which may have been three months ago. There are 31 tests over this logic, and a good share of them exist precisely to pin those dates down: month rollover, leap year, year end, and that the 7-day streak badge is dated the day it was completed rather than today.

## Multi-track from day one, with a single track

The model knows nothing about .NET. There's a `skill_tracks` table, and .NET is a row with its syllabus attached. Adding Rust or Azure means seeding another row.

I questioned this while writing it, because generalizing for a hypothetical case is one of the most common ways to complicate code for nothing. But the real cost was a `trackId` on two tables and a selector in the header, while the alternative (`dotnet_sessions`, `dotnet_milestones`, `/admin/dotnet`) guaranteed a full copy-paste the first time a second technology showed up. When generality costs one field, you pay it.

## What's public is only the aggregate

The tracker is private. But a track can be marked public, and then `/certifications` shows three numbers: accumulated hours, syllabus percentage, and best streak.

The log never leaves. Neither do per-session dates, nor per-milestone status. It's the same rule I apply on `/status`, where public means aggregates and nothing else, for reasons that over there are about OPSEC and here are simply that the detail of my practice interests nobody and conditions what I write. A log field I know will be public stops being a log and becomes a publication.

And a track seeded with no sessions is filtered out before it reaches the page. Zero hours and zero percent say nothing good about anyone.

## What I'm taking away

I expected the hard part of a tracker to be the dashboard: the heatmap, the bars, the colors. That turned out to be the fastest bit.

What took thinking was the invisible part. That a date without a time is a different data type from a date with one, and confusing them breaks the only metric the user cares about. That a derived value shouldn't be persisted unless you can afford the cost of it drifting. And that the difference between a tool you use and one you abandon in two weeks can come down to a boolean deciding whether the message up top reads "you're twelve days in" or "your streak is on the line".

The next step is for that message to arrive on its own, as a notification, when the streak is at risk and there are few hours left in the day. The infrastructure is already there: optional notifications that no-op silently when configuration is missing, and crons already running. Nothing new is needed, which is usually the sign that the previous decision was the right one.
