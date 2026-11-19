# ADR 0004: Resume matching with local embeddings

- **Status:** Accepted, subject to the Phase 9 resource measurement (see *Validation*)
- **Date:** 2026-11-19

## Context

Phase 9 adds an AI match: the user pastes a job description (JD), picks one of their resume
versions, and gets a 0–100 score with an explanation (matched and missing skills, suggested
keywords, the resume lines that best support each requirement).

Constraints:

- **Hosting:** the backend runs on Render's free tier (512 MB RAM, 0.1 CPU, spins down when
  idle, ephemeral filesystem). The API itself must keep fitting alongside whatever does the
  matching.
- **Privacy:** resumes and JDs are personal data. Sending them to a third party should be a
  deliberate, documented choice, not a side effect.
- **Cost:** free to run for a portfolio project.
- **Testability:** CI must be fast and deterministic, with no model downloads or network calls.

## Options considered

| | sentence-transformers | fastembed (ONNX) | Hosted embeddings API |
|---|---|---|---|
| Runtime | PyTorch | ONNX Runtime, no PyTorch | HTTP call |
| Fits Render free | No: PyTorch alone makes the image huge and the RAM budget unrealistic | Expected to, with a small quantized model (to be measured) | Yes, no model in memory |
| Accuracy | Good | Weaker than the best hosted models | Best |
| Privacy | Text stays on our server | Text stays on our server | Text goes to a third party |
| Cost | Free | Free | Cheap per token, but needs a paid key |
| Offline / tests | Works offline; heavy | Works offline once the model is in the image | Needs network and a key; tests must mock it |
| Input limit | Model-dependent | 512 tokens for bge-small: we must chunk | Usually much larger |

- **sentence-transformers:** rejected for deployment. The accuracy is fine, but PyTorch
  doesn't fit the free tier.
- **Hosted embeddings API:** not the default, because resume and JD text would leave our
  server, it needs a key and network access, and every test would mock it. It stays possible
  as a second implementation of the same interface, and it is the fallback if the local model
  fails the measurement below.

## Decision

- **fastembed with `BAAI/bge-small-en-v1.5`**, behind an `Embedder` interface
  (`app/services/match/`). The scoring code depends only on the interface, so a hosted
  embedder can be added without touching it.
- **Pinned and baked in:** the fastembed version (via `uv.lock`) and the model name are
  pinned. The model is downloaded at Docker build time into a fixed `cache_dir` inside the
  image. A runtime download would repeat after every spin-down, because Render's filesystem
  is ephemeral.
- **Loaded lazily:** the model loads on the first match (or warm-up) request, not at startup,
  so a cold start doesn't get slower for every page. ONNX Runtime runs on 1 thread.
- **Bounded:** one match computation per process at a time (others wait briefly, then get
  503 with `Retry-After`). Resume chunk embeddings are cached in memory (LRU) by
  `sha256(content_text)` + model name; this is safe because a resume's text is frozen once used.
- **Chunked, never truncated:** both texts are split by lines, bullets and paragraphs into
  pieces under the model's 512-token limit, checked with the model's own tokenizer.
- **Embeddings drive only the semantic part of the score.** They can't name discrete missing
  skills, so skills come from a curated, versioned taxonomy with aliases. The score combines
  skill coverage (60 %) and a calibrated semantic similarity (40 %); the exact method lives
  in `docs/architecture.md` ("Match scoring").
- **Versioned results:** each result stores the model name, a scoring version and a
  calibration version. Results from different versions are never compared or trended; older
  ones offer a re-run.
- **English only**, stated in the UI and docs.
- **Tests** use a deterministic `FakeEmbedder` (hashed bag of words). One integration test
  uses the real model; it is marked and skipped by default, and runs locally and in the
  Docker build check.

## Validation

Before any UI is built, the image is measured with Render-like limits
(`docker run --memory=512m --cpus=0.1`): peak RSS with the API and model loaded, model load
time, match latency for a 2-page resume against a long JD, and the latency of an ordinary
request (`GET /applications/board`) while a match runs. If it doesn't fit in memory, or a
match takes more than about 15 s, this decision is revised in favour of the hosted embedder,
and the calibration (which is model-specific) is done for that model instead. The results
are recorded under *Revisions*.

## Consequences

- **Calibration is approximate.** Raw cosine similarities from bge models bunch in a narrow
  band, so they are mapped onto 0–100 using a small synthetic labelled set (10–20 invented
  resume/JD pairs, no real people's resumes). A set that small gives rough anchors, not a
  statistically validated scale. The UI says the score is an estimate of overlap, not how any
  employer or applicant tracking system screens.
- **The skills taxonomy needs upkeep.** Skills it doesn't know are invisible to the skill
  part of the score; frequent JD terms partly cover the gap in suggested keywords.
- **The first match after a cold start is slow** (model load). A warm-up endpoint, called
  when the match page opens, hides most of it, and the loading state explains the wait.
- **The image is larger** by the model files. That is the price of not downloading the model
  after every spin-down.
- **One match at a time** is a hard ceiling on throughput. That's fine for a single-user-scale
  portfolio deployment; scaling out would need a separate worker or the hosted embedder.
- **Privacy statement depends on the embedder:** "text is processed on our server and never
  sent to a third party" is true only while the local embedder is used. Switching to a hosted
  embedder means updating the README and privacy notes in the same change.
