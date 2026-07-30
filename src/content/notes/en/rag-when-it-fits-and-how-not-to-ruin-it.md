---
title: RAG — when it fits and how not to ruin it
description: Retrieval-Augmented Generation isn't magic, and it isn't a replacement for fine-tuning. It's an architectural decision with clear trade-offs — and most failures happen in retrieval, not in the model.
date: 2026-07-09
tags: [rag, llm, architecture, ai]
lang: en
translationOf: rag-cuando-conviene-y-como-no-arruinarlo
---

Every time someone wants an LLM to "know" about their own data, the same fork shows up: do I retrain the model, or hand it the information at question time? The second option is RAG — Retrieval-Augmented Generation — and in the vast majority of cases it's the right answer. Not because it's fashionable, but because the trade-offs almost always fall on its side.

The idea is boringly simple: when a question arrives, you first search for the most relevant fragments of your knowledge, paste them into the prompt, and let the model answer using them. The LLM memorizes nothing — it reasons over text you just handed it. That separation between *knowing* and *reasoning* is the whole advantage.

## Why not fine-tuning (almost never)

Fine-tuning looks like the serious option, but for "make the model know my documents" it's usually the expensive trap:

- **The data changes.** Updating a document in RAG means replacing a row. In fine-tuning it means retraining. If your knowledge has an expiry date — and almost all of it does — RAG wins on its own.
- **No citations.** A fine-tuned model gives you a confident answer without telling you where it came from. RAG returns *which fragment* backs it, and that's auditable. For anything a client is going to believe, traceability isn't optional.
- **It still hallucinates.** Fine-tuning teaches style and format, not reliable facts. If the goal is that it doesn't make things up, putting the fact in the context is more effective than hoping it internalized it.

Fine-tuning is still the right tool for *behavior*: tone, structured output, a very specific reasoning domain. For *knowledge*, RAG.

## The failure is always in retrieval

Here's what nobody tells you when you start: if your RAG answers badly, the problem is almost never the LLM. It's that you handed it the wrong fragments. Garbage in, garbage out — and no model, however good, fixes a context that doesn't contain the answer.

The three places it breaks, in order of frequency:

**Chunking.** Cutting documents into pieces is the most underrated decision in the pipeline. Chunks that are too large dilute the signal and waste context; too small and they split an idea in half, leaving neither fragment meaningful on its own. Cutting along semantic structure — paragraphs, sections — almost always beats cutting every N characters blindly.

**Purely semantic retrieval.** Embedding search understands meaning, but it's surprisingly bad with exact names, error codes, and identifiers. Searching for "error TTL_EXPIRED" by vector similarity may not find the document that mentions it literally. The cheap fix is hybrid search: combine embeddings with keyword search (BM25) and keep the best of both.

**No evaluation.** The costliest mistake is not measuring retrieval separately. Before blaming the model, ask: for the answers that were correct, was the needed fragment among the retrieved ones? If it wasn't, the generator never stood a chance. Measuring retrieval *recall* in isolation from the LLM is what turns "this doesn't work" into "this fails at step 2".

## The honest minimum design

A RAG that holds up in production is no more than this: documents chunked with judgment, embeddings stored in a vector index, hybrid search at query time, a reranking pass over the candidates, and a prompt that orders the model to answer **only** from what was retrieved — and to admit when the context has no answer.

That last instruction is what separates a trustworthy assistant from a plausibility generator. A RAG that would rather say "I don't have that information" than invent it is, to a client, infinitely more valuable than one that always sounds confident. Trust isn't built by answering everything: it's built by not lying.
