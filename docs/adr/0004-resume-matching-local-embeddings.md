# ADR 0004: Resume matching with local embeddings

- **Status:** Revised (see *Revisions*): the server-side model failed the measurement, so
  embeddings are now computed in the user's browser, with the same model family. The rest
  of the design (chunking, skills, scoring, versioning) stands. The browser path is itself
  subject to a measurement (*Revision 1, Validation*).
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

## Revisions

### Revision 1 (2026-11-19): embeddings in the browser

#### The server-side measurement failed

`scripts/bench_match.py server`, in the backend image with the model baked in, under
`docker run --memory=512m --memory-swap=512m --cpus=0.1`:

| Measure | Result |
|---|---|
| RSS: before the app / app imported / API serving | 79 / 98 / 111 MB |
| RSS with the model loaded | 339 MB |
| Peak RSS over the run (VmHWM) | 409 MB |
| Model load | 12.2 s |
| Match, 2-page resume vs long JD (35 JD and 42 resume chunks): cold / warm | 52.2 s / 22.0 s |
| Worst case, 29.5k-char resume vs 19.1k-char JD (134 / 336 chunks) | 182.9 s |
| `GET /applications/board`: idle, median / max | 0.40 / 1.5 s |
| `GET /applications/board` during a match, median / max | 0.50 / 2.1 s (the match took 90.5 s) |

Memory fits, and other requests stay usable, but a typical match misses the ~15 s budget by
about 3x, and the worst case by more than 10x. 0.1 CPU is the bottleneck, not RAM.

#### Options after the measurement

The project has a hard **zero-spend** constraint: no paid APIs, no paid tiers, no payment
method on file.

| Option | Verdict |
|---|---|
| Render Starter (0.5 CPU) | Rejected: paid. Even at 5x the CPU, a cold match would still take about 10 s. |
| Keep the server model, process matches in the background with a progress UI | Rejected as the default: it hides the wait instead of removing it (a typical match still takes 20–50 s and a worst case minutes), and it ties up the single 0.1 CPU. It stays the zero-cost fallback if the browser path fails its own measurement. |
| OpenAI `text-embedding-3-small` | Rejected: no free tier. Its API data terms were otherwise suitable (not used for training by default). |
| Gemini API free tier; Voyage AI free tokens | Rejected: free-tier inputs may be used to improve the provider's products (Gemini), or are licensed for training unless you opt out, and the opt-out needs a payment method (Voyage). Resume text must not become training data. |
| Hugging Face Spaces (a free inference endpoint) | Rejected: Hugging Face's docs say Spaces that run compute (Gradio or Docker) need a paid plan; only static Spaces are free. |
| **Embed in the browser** (Transformers.js) | **Chosen.** Costs nothing to run, keeps text off third parties, and moves the CPU work to the user's device, which is far faster than 0.1 CPU. |

#### Decision

- **The browser computes the embeddings** with Transformers.js, in a Web Worker (never on
  the main thread), using `Xenova/bge-small-en-v1.5`: the ONNX export of the same model,
  quantized (`q8`, 34 MB). The library and model load only on the match page, never in the
  main bundle.
- **The server does everything else**, statelessly:
  1. `POST /match/prepare {resume_id, jd_text}` validates (ownership, not archived, JD
     length, rate limits), chunks both texts and returns the chunks plus the model id,
     revision and scoring version.
  2. The browser embeds the chunks and sends `POST /match` with the vectors.
  3. The server re-chunks deterministically and checks the vectors: chunk counts match,
     the model id and revision are the expected ones, 384 dimensions, all values finite,
     unit length within a tolerance. Then it runs max-sim, skills, calibrated scoring and
     storage as before.
- **Exact chunk limits without the model:** the server ships only the model's
  `tokenizer.json` (0.7 MB, no weights), pinned to the same revision. A test checks its git
  blob id against that revision. A model-marked test checks it tokenizes exactly like
  fastembed's bge build, so the server embedder can use the same chunks.
- **Pinned weights:** the model is loaded at a commit hash, never `main`, so the weights
  can't change under us and stored scores stay comparable. `@huggingface/transformers` is
  pinned exactly. ONNX Runtime's version is locked to the one Transformers.js declares
  (a test checks).
- **Where files come from:**
  - **Model files:** from our own origin, at `/models/<id>/<revision>/`. The build runs
    `frontend/scripts/fetch-model.mjs`, which downloads the pinned files from Hugging
    Face, checks each against the hash in `scripts/model-manifest.json` (git blob id, or
    sha256 for the LFS weights), and puts them under `public/`. The files are never
    committed. A backend test checks the manifest names the same model, revision and
    tokenizer as the server.
    - **Why not the Hugging Face CDN directly** (the first plan): from the developer's
      network it redirected to a US edge and delivered **9–87 KB/s**, while Cloudflare
      and jsdelivr gave 2–3 MB/s on the same connection. At those rates the first match
      would wait 7–60 minutes for 34 MB. That's unacceptable, and it's outside our
      control.
    - **Vercel Hobby fits:** static files up to 100 MB, and 100 GB a month of transfer,
      which is about 2,900 first downloads. Hobby can't bill, so over the limit the site
      is paused, not charged; the zero-spend constraint holds.
    - **Caching:** `vercel.json` serves `/models/*` with
      `Cache-Control: immutable, max-age=1y`. Any change is a new revision in the path,
      so cached files are never stale. `/models/` is excluded from the SPA rewrite, so a
      missing file is a 404, not `index.html`.
    - **The fetch is resumable and parallel:** 8 byte ranges at once, each continued
      after an interruption, because the slow CDN is also what builds fetch from.
  - **ONNX Runtime WebAssembly:** from our own origin, bundled by Vite (14 MB, 2.4 MB with
    brotli). We use the plain SIMD build, not the default WebGPU-capable "asyncify" build
    (27 MB), and not jsdelivr, which is Transformers.js's default.
  - **Caching:** Transformers.js caches both in the Cache API (`transformers-cache`), so
    returning visits don't download again.
- **CSP** (none is set today). One added later must allow:
  - `script-src 'self' 'wasm-unsafe-eval' blob:` (Transformers.js loads ONNX Runtime's
    factory from a blob URL);
  - `worker-src 'self'` (superseded by Revision 2: `'self' blob:`, for ONNX Runtime's
    thread workers);
  - `connect-src 'self'`. The browser contacts no third party.
- **`MATCH_EMBEDDINGS=client|server|off`.** `client` is the default and the production
  setting. `server` keeps the fastembed embedder for dev, self-hosting and as a reference;
  the model is baked into the image only with `BAKE_MATCH_MODEL=true`. `off` disables
  matching, and the page explains why.

#### Trusting client vectors

The server can't verify that the vectors really are the embeddings of the chunks it
returned: checking would mean running the model, which is what we can't afford. It checks
everything cheap (counts, model, shape, finiteness, unit length) and otherwise trusts them.

That's acceptable here because a user can only change **their own** score for **their
own** resume against a JD they pasted. Nothing is shared, ranked or shown to anyone else,
so there's no one to deceive but themselves. The skills part of the score (60 %) is always
computed on the server from the text. The rate limits still apply. If scores ever became
visible to others, such as recruiters, this would have to be revisited.

#### Trade-offs

- **The first match downloads ~34 MB** (model) plus the WebAssembly runtime, once per
  browser. The page says so before downloading and shows progress.
- **Speed depends on the device.** A low-end phone may be slow, and an old browser may
  not run it at all (no WebAssembly SIMD, too little memory). The page checks support before
  downloading and explains failures.
- **Two builds of the model.** The browser runs the Xenova `q8` export; the server
  reference runs fastembed's `Qdrant/bge-small-en-v1.5-onnx-Q`. Their vectors differ
  slightly, so calibration constants are stored per model id, and the browser build (the
  one users run) is the one calibrated. The drift between them is measured on the labelled
  pairs.
- **Hugging Face is a build-time dependency only.** If it's down or slow, a build fails
  or waits (the fetch resumes); users are unaffected. The model's bandwidth comes out of
  Vercel's free allowance.
- **Privacy improves:** text is embedded on the user's device; skills and scoring run on
  our server; nothing goes to a third party, and the browser loads everything, the model
  included, from our own origin.

#### Validation

Measured with `frontend/bench/match.html`, which uses the server's real chunks
(`bench_match.py export`), on the developer's laptop in Chrome and with DevTools 4x CPU
throttling as a phone proxy. It records:
- first-run download plus model load;
- the load from cache;
- embedding time for the 2-page resume vs the long JD, and for the worst case.

The model is served by the dev server from `public/models` (run `pnpm fetch-model`
first), so the first-run number measures loading from our origin; Vercel's speed from a
given network is confirmed after the first deploy.

The target is a warm match (model loaded) of 5 s or less on the laptop. If the browser path
fails badly, the fallback is the server model with background processing and a progress UI.

Results: in Revision 2. The single-threaded measurement missed the target, which led to
it; with several threads, warm matches are within 5 s on the laptop.

### Revision 2 (2026-11-20): several threads through cross-origin isolation

#### Why

The laptop measurement missed the target. On one thread, embedding the 2-page case took
a median of **5.62 s** (10 runs, 5.39–6.74 s), before `/match/prepare` and the save request
are added. ONNX Runtime ran on one thread because the page wasn't cross-origin isolated:
its WebAssembly threads need `SharedArrayBuffer`, which browsers only allow on isolated
pages.

#### Decision

- **Every response sends** `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp`. That covers the Vite dev server and
  `vite preview` (`vite.config.ts`), Vercel (`vercel.json`, every path, because the app is
  an SPA) and the nginx image. A test keeps the three in step
  (`cross-origin-isolation.test.ts`).
- **Threads:** one per logical CPU, capped at 4 (`features/match/embedding/threads.ts`).
  If the page isn't isolated, it uses 1 thread: slower, never an error.
- `require-corp`, not `credentialless`: `require-corp` is the long-supported value
  (`credentialless` arrived later and not in every browser; check current support
  before switching), and we load nothing cross-origin that would need the looser one.

#### Consequences

- **COOP `same-origin` rules out popup-based OAuth.** A popup on another origin loses its
  link to the opener, so "Sign in with Google" in a popup wouldn't work. Redirect flows are
  fine. Phase 12 (email verification, password reset) isn't affected.
- **COEP `require-corp` blocks any cross-origin subresource** that doesn't send
  `Cross-Origin-Resource-Policy` or allow CORS. Today there are none: fonts are
  self-hosted, and the model and ONNX Runtime come from our own origin. A future
  third-party image, embed, script or analytics tag must allow cross-origin embedding,
  or it will be blocked.
- **A future CSP** must also allow ONNX Runtime's thread workers. It starts them inside the
  embedding worker from `blob:` URLs (seen in the production build), so the CSP needs
  `worker-src 'self' blob:`, not `'self'` alone as Revision 1 assumed.
- **Storybook isn't isolated.** It serves its own pages and doesn't take the Vite
  `server.headers`. That's harmless: no story runs the model.
- **The vectors don't change.** Four threads and one thread gave bit-identical vectors on
  the bench chunks (largest difference 0), so the calibration stands.

#### How it was measured

Chrome 157, headless, with a fresh profile, driven over the DevTools protocol:
`frontend/bench/match.html?thread=worker&case=…` (and `&threads=1` to compare) on the
developer's laptop (12 logical CPUs), dev server in Docker.

- **No throttled number exists for the real path.** DevTools CPU throttling (the
  protocol's `Emulation.setCPUThrottlingRate`, which the DevTools panel uses) applies only
  to the page, never to a worker. Throttling the page left worker timings unchanged
  (median 5.65 s at "4x" against 5.62 s at 1x). Throttling the worker directly is refused:
  "Operation is only supported for pages, not workers". On the main thread, throttling
  works: about 6x slower, not exactly 4x, which also makes it a rough phone stand-in. So
  phone-class performance is unmeasured until a real device is tried.
- **First-run download:** **12.1 s** for download plus model load with
  `pnpm build && pnpm preview` over localhost (fresh profile). Through the Docker dev server
  it took minutes, because the dev server serves a 34 MB file slowly from a Windows bind
  mount. Real networks are slower than localhost: it is measured again after the first
  deploy.

#### Results (laptop, model loaded)

| Embedding only, worker | Threads | Median | Range | Runs |
|---|---|---|---|---|
| 2-page case (35 + 42 chunks) | 1, not isolated (before) | 5.62 s | 5.39–6.74 s | 10 |
| 2-page case | 1, isolated (`?threads=1`) | 4.00 s | 3.59–5.07 s | 6 |
| 2-page case | 4 | **1.88 s** | 1.67–2.04 s | 10 |
| Worst case (134 + 336 chunks) | 4 | **9.46 s** | 9.38–9.96 s | 4 |

The single-thread runs differ between the two sessions (5.62 s against 4.00 s), which
these measurements don't explain. The fair comparison is within one session: 4 threads
are **2.1x** faster than 1.

**End to end, through the match page** (click Match → result shown, so including
`/match/prepare`, embedding and the save request), all against the long JD:

- Dev server, the bench's 2-page resume (3,693 characters): 3.10, 2.87 and 2.46 s.
- Production build (`vite preview`), the demo's default resume (876 characters), warm:
  1.76, 1.56, 2.21, 5.08 and 2.31 s. The first match on a fresh page (worker start plus
  model load from the cache): 3.16 s. `/match/prepare` took 38–51 ms and the save 99–304 ms,
  except once, when `/match/prepare` took 1.5 s: that's the 5.08 s run. It's a backend
  spike (the dev backend runs with `--reload` in Docker), worth watching after deploy.

Within the 5 s target, apart from that spike. The bench resume is nearer 1.5 pages than
2–3, so a 3-page resume was measured too (below).

**3-page resume** (`bench_data/resume_three_page.txt`, Sam's resume at full length: 1,271
words, 35 JD + 67 resume chunks against the long JD; bench case `three_page_vs_long_jd`):

| Measure | Conditions | Median | Range | Runs |
|---|---|---|---|---|
| Embedding only (bench page) | Docker Desktop off, local dev server | 1.70 s | 1.63–1.79 s | 10 |
| Embedding only, 2-page case, same session | as above | 1.04 s | 1.03–1.11 s | 8 |
| **End to end**, fresh page, nothing cached | production build (`vite preview`), backend + db in Docker | **3.84 s** | 3.22–4.65 s | 6 |
| End to end, the same | as above, plus the polling frontend dev container running | 5.61 s | 4.74–8.18 s | 5 |

"End to end" is click Match → result shown, on a freshly loaded page with an empty vector
cache: worker start, model load from the browser cache (0.5–0.9 s), embedding every chunk
(2.6–3.7 s), `/match/prepare` (33–61 ms) and the save (71–128 ms). That's stricter than
the target's warm match, where the model is already loaded.

- **Within the 5 s target** for a 3-page resume in normal conditions. Work grows with
  the resume's tokens: 67 resume chunks against 42 cost about 1.6x the embedding time.
- **A busy machine pushes it over.** With Docker Desktop running, the same embedding took
  2.4–3.9 s on the bench page instead of 1.7 s, and the frontend dev container (polling
  for file changes, about 30% CPU when idle) added roughly 2 s more end to end. A user's
  laptop running other work is closer to that than to a quiet benchmark, and phones are
  still unmeasured.
- **Repeat matches are the common case and much cheaper:** with the resume's vectors
  cached, only the advert is embedded (see "Vector cache" below).

The production build was also checked for threads: the embedding worker reports
`crossOriginIsolated`, and ONNX Runtime starts 3 thread workers beside it (4 threads).
Every page (landing, sign-in, register, dashboard, board, table, calendar, resumes,
settings, match, match result) loads isolated, with no blocked request, on both the dev
server and the production build.

#### Vector cache (added with this revision)

Most matches reuse a resume: one resume, several adverts. The browser keeps the chunk
vectors it computed (`features/match/vector-cache.ts`), so a repeat match embeds only what
is new.

- **Key:** user id + model id + revision + SHA-256 of the chunk text. JD chunks are cached
  too. A new model revision or another user never reads these vectors, and an edited
  resume still reuses its unchanged lines.
- **Size:** least recently used first, capped at 4,000 vectors (one vector is 1.5 KB at
  384 dimensions, so about 6 MB). A hit counts as a use.
- **Cleared,** for every user, on sign-out, wherever it starts (the button, an expired
  session, another tab), and with "Delete match history" in Settings (after the server
  has deleted the results).
- **Never a failed match:** private mode, a full quota, an open that fails or hangs
  (2 s timeout), or no `crypto.subtle` all mean "not cached".
- **The model doesn't load at all** when every chunk is cached.
- **The server is unchanged.** It still receives every vector and checks them; the cache
  holds only the user's own texts' vectors, on their own device.

**Repeat matches** (production build, the 2-page bench resume, match page click → result):

| Case | Result |
|---|---|
| Same advert again, everything cached | 0.24 s (same page and after a reload: no model load) |
| New advert, resume cached, model loaded | median **0.60 s** (0.55–0.71 s, 3 runs) |
| The same advert, nothing cached, model loaded | median 1.94 s (1.67–1.97 s, 3 runs) |
| New advert, resume cached, fresh page | 1.93 s (1 run; includes loading the model from the browser cache) |
| Nothing cached, fresh page | 2.86 s (1 run, another advert) |
