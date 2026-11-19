"""Measure the AI match (docs/adr/0004 "Validation"). Three subcommands:

`server`: the server-side embedder under Render-like limits. One process, like
production: the real API served by uvicorn in a thread, the fastembed model loaded in the
same process, matches run in another thread. Reports RSS (after importing the app, with
the API serving, after loading the model, and the peak), model load time, match latency
for a 2-page resume against a long JD (cold and warm) and for the worst case (50k-char
resume, 20k-char JD), and `GET /applications/board` latency idle and during a match.
RSS is read from /proc (Linux only); the demo user must exist (`python -m scripts.seed`
against the same database):

    docker build --build-arg BAKE_MATCH_MODEL=true -t jobtrack-backend:baked backend
    docker run --rm --memory=512m --memory-swap=512m --cpus=0.1 --network jobtrack_default \
      -e DATABASE_URL=postgresql+psycopg://jobtrack:jobtrack@db:5432/jobtrack \
      -v "$PWD/backend/scripts:/app/scripts:ro" jobtrack-backend:baked \
      python -m scripts.bench_match server

`export`: the browser path's input. Chunks both cases with the browser model's tokenizer
(exactly what `POST /match/prepare` will return) and writes them, with the model spec, to
frontend/bench/data/chunks.json for bench/match.html.

`browser FILE`: the browser path's output. Takes the results the bench page saved,
re-chunks deterministically and checks the vectors as `POST /match` will (counts, 384
dimensions, finite, unit length), then computes the semantic similarity with the server's
own code. If fastembed is available it also embeds the same chunks on this machine and
reports the drift between the two builds (cosine of each chunk's two vectors).
"""

import argparse
import json
import statistics
import threading
import time
import urllib.request
from collections.abc import Callable, Sequence
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np

from app.services.match.browser_model import BROWSER_MODEL, get_bge_tokenizer
from app.services.match.chunking import chunk_job_description, chunk_resume
from app.services.match.embedder import TokenCounter, Vectors
from app.services.match.semantic import ResumeEmbeddingCache, semantic_match

PORT = 8765
BASE = f"http://127.0.0.1:{PORT}/api/v1"
DATA = Path(__file__).with_name("bench_data")
EXPORT_PATH = Path(__file__).resolve().parents[2] / "frontend" / "bench" / "data" / "chunks.json"
MAX_RESUME_CHARS = 50_000
MAX_JD_CHARS = 20_000
IDLE_BOARD_REQUESTS = 5
UNIT_TOLERANCE = 1e-3


def bench_texts() -> dict[str, tuple[str, str, str]]:
    """name -> (label, jd, resume). The worst case repeats the real documents."""
    resume = (DATA / "resume_two_page.txt").read_text(encoding="utf-8").strip()
    jd = (DATA / "jd_long.txt").read_text(encoding="utf-8").strip()
    big_resume = ("\n\n".join([resume] * 8))[:MAX_RESUME_CHARS]
    big_jd = ("\n\n".join([jd] * 4))[:MAX_JD_CHARS]
    return {
        "two_page_vs_long_jd": ("2-page resume vs long JD", jd, resume),
        "worst_case": (
            f"{len(big_resume):,}-char resume vs {len(big_jd):,}-char JD",
            big_jd,
            big_resume,
        ),
    }


def chunk_texts(jd: str, resume: str, counter: TokenCounter) -> tuple[list[str], list[str]]:
    return (
        [chunk.text for chunk in chunk_job_description(jd, counter)],
        [chunk.text for chunk in chunk_resume(resume, counter)],
    )


# --------------------------------------------------------------------------- server


def memory_mb() -> dict[str, float]:
    """VmRSS (now) and VmHWM (peak) of this process, in MB. Empty off Linux."""
    status = Path("/proc/self/status")
    if not status.exists():
        return {}
    values: dict[str, float] = {}
    for line in status.read_text().splitlines():
        key, _, rest = line.partition(":")
        if key in ("VmRSS", "VmHWM"):
            values[key] = round(int(rest.split()[0]) / 1024, 1)
    return values


def timed[T](action: Callable[[], T]) -> tuple[T, float]:
    started = time.perf_counter()
    result = action()
    return result, time.perf_counter() - started


def request(path: str, token: str | None = None, body: dict[str, Any] | None = None) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{BASE}{path}", data=data, method="POST" if data else "GET")  # noqa: S310
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=120) as response:  # noqa: S310 (localhost)
        return json.loads(response.read())


def board_latency(token: str) -> float:
    return timed(lambda: request("/applications/board", token))[1]


def bench_server() -> dict[str, Any]:
    from scripts.seed import DEMO_EMAIL, DEMO_PASSWORD

    report: dict[str, Any] = {"memory_mb": {}}
    report["memory_mb"]["before_app"] = memory_mb()

    import uvicorn

    from app.core.config import get_settings
    from app.main import app
    from app.services.match.local_embedder import LocalEmbedder
    from app.services.match.skills import compare_skills

    report["memory_mb"]["app_imported"] = memory_mb()

    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning"))
    threading.Thread(target=server.run, daemon=True).start()
    while not server.started:
        time.sleep(0.05)

    token = request("/auth/login", body={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})[
        "access_token"
    ]
    idle = [board_latency(token) for _ in range(IDLE_BOARD_REQUESTS)]
    report["board_idle_s"] = {
        "median": round(statistics.median(idle), 3),
        "max": round(max(idle), 3),
    }
    report["memory_mb"]["api_serving"] = memory_mb()

    settings = get_settings()
    embedder = LocalEmbedder(settings.match_model_dir, offline=settings.match_model_offline)
    _, load_seconds = timed(embedder.load)
    report["model_load_s"] = round(load_seconds, 2)
    report["memory_mb"]["model_loaded"] = memory_mb()

    cases = bench_texts()
    _, jd, resume = cases["two_page_vs_long_jd"]
    _, big_jd, big_resume = cases["worst_case"]
    report["sizes_chars"] = {
        "resume": len(resume),
        "jd": len(jd),
        "big_resume": len(big_resume),
        "big_jd": len(big_jd),
    }

    def match(jd_text: str, resume_text: str, cache: ResumeEmbeddingCache) -> dict[str, Any]:
        skills = compare_skills(jd_text, resume_text)
        semantic = semantic_match(jd_text, resume_text, embedder, cache)
        return {
            "raw_similarity": round(semantic.similarity, 4),
            "chunks": [semantic.jd_chunks, semantic.resume_chunks],
            "coverage": None if skills.coverage is None else round(skills.coverage, 3),
        }

    cache = ResumeEmbeddingCache()
    result, cold = timed(lambda: match(jd, resume, cache))
    _, warm = timed(lambda: match(jd, resume, cache))
    report["match_two_page_vs_long_jd"] = {"cold_s": round(cold, 2), "warm_s": round(warm, 2)}
    report["match_result"] = result

    # Board latency while a cold match runs in another thread (as a request thread would).
    done = threading.Event()
    contended: list[float] = []
    match_seconds: list[float] = []

    def background_match() -> None:
        match_seconds.append(timed(lambda: match(jd, resume, ResumeEmbeddingCache()))[1])
        done.set()

    threading.Thread(target=background_match).start()
    while not done.is_set():
        contended.append(board_latency(token))
    report["board_during_match_s"] = {
        "requests": len(contended),
        "median": round(statistics.median(contended), 3),
        "max": round(max(contended), 3),
        "match_s": round(match_seconds[0], 2),
    }

    big, worst = timed(lambda: match(big_jd, big_resume, ResumeEmbeddingCache()))
    report["match_worst_case"] = {"cold_s": round(worst, 2), "chunks": big["chunks"]}

    report["memory_mb"]["end"] = memory_mb()
    server.should_exit = True
    return report


# --------------------------------------------------------------------------- export


def export(path: Path) -> dict[str, Any]:
    tokenizer = get_bge_tokenizer()
    cases = []
    for name, (label, jd, resume) in bench_texts().items():
        jd_chunks, resume_chunks = chunk_texts(jd, resume, tokenizer)
        cases.append(
            {"name": name, "label": label, "jd_chunks": jd_chunks, "resume_chunks": resume_chunks}
        )
    spec = asdict(BROWSER_MODEL)
    model = {key: spec[key] for key in ("id", "revision", "dtype", "dim")}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"model": model, "cases": cases}, indent=1), encoding="utf-8")
    return {
        "written": str(path),
        "cases": {c["name"]: [len(c["jd_chunks"]), len(c["resume_chunks"])] for c in cases},
    }


# --------------------------------------------------------------------------- browser


class PrecomputedEmbedder:
    """Serves vectors computed elsewhere (the browser), looked up by chunk text, with the
    browser model's tokenizer for chunking: the server's scoring code runs unchanged."""

    def __init__(self, vectors: dict[str, Vectors]) -> None:
        self._vectors = vectors
        self._tokenizer = get_bge_tokenizer()

    @property
    def model_name(self) -> str:
        return f"{BROWSER_MODEL.id}@{BROWSER_MODEL.revision}"

    @property
    def max_tokens(self) -> int:
        return self._tokenizer.max_tokens

    def count_tokens(self, text: str) -> int:
        return self._tokenizer.count_tokens(text)

    def embed(self, texts: Sequence[str]) -> Vectors:
        return np.vstack([self._vectors[text] for text in texts])


def validate(vectors: Any, expected_rows: int) -> Vectors:
    """The checks `POST /match` will make on client vectors."""
    array = np.asarray(vectors, dtype=np.float32)
    if array.shape != (expected_rows, BROWSER_MODEL.dim):
        raise ValueError(f"shape {array.shape}, expected ({expected_rows}, {BROWSER_MODEL.dim})")
    if not np.isfinite(array).all():
        raise ValueError("non-finite values")
    norms = np.linalg.norm(array, axis=1)
    if np.abs(norms - 1).max() > UNIT_TOLERANCE:
        raise ValueError(f"not unit length: norms {norms.min():.4f}..{norms.max():.4f}")
    return array


def compare_browser(path: Path) -> dict[str, Any]:
    saved = json.loads(path.read_text(encoding="utf-8"))
    model = saved["model"]
    if (model["id"], model["revision"]) != (BROWSER_MODEL.id, BROWSER_MODEL.revision):
        raise ValueError(f"vectors are from {model['id']}@{model['revision']}")

    try:
        from app.core.config import get_settings
        from app.services.match.local_embedder import LocalEmbedder

        settings = get_settings()
        local: LocalEmbedder | None = LocalEmbedder(
            settings.match_model_dir, offline=settings.match_model_offline
        )
    except ImportError:  # fastembed not installed: report the browser numbers only
        local = None

    tokenizer = get_bge_tokenizer()
    texts = bench_texts()
    report: dict[str, Any] = {"environment": saved["environment"], "load": saved["load"]}
    for case in saved["cases"]:
        _, jd, resume = texts[case["name"]]
        jd_chunks, resume_chunks = chunk_texts(jd, resume, tokenizer)
        jd_vectors = validate(case["jd"], len(jd_chunks))
        resume_vectors = validate(case["resume"], len(resume_chunks))
        lookup = dict(
            zip(jd_chunks + resume_chunks, np.vstack([jd_vectors, resume_vectors]), strict=True)
        )
        browser = semantic_match(jd, resume, PrecomputedEmbedder(lookup), ResumeEmbeddingCache())
        result: dict[str, Any] = {
            "embed_ms": [round(ms) for ms in case["embed_ms"]],
            "chunks": [len(jd_chunks), len(resume_chunks)],
            "browser_raw_similarity": round(browser.similarity, 4),
        }
        if local is not None:
            server = semantic_match(jd, resume, local, ResumeEmbeddingCache())
            all_texts = jd_chunks + resume_chunks
            server_vectors = local.embed(all_texts)
            server_vectors /= np.linalg.norm(server_vectors, axis=1, keepdims=True)
            drift = (np.vstack([jd_vectors, resume_vectors]) * server_vectors).sum(axis=1)
            result |= {
                "server_raw_similarity": round(server.similarity, 4),
                "chunk_cosine_browser_vs_server": {
                    "mean": round(float(drift.mean()), 5),
                    "min": round(float(drift.min()), 5),
                },
            }
        report[case["name"]] = result
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("server", help="server-side embedder under Render-like limits")
    export_parser = commands.add_parser("export", help="write chunks for bench/match.html")
    export_parser.add_argument("--out", type=Path, default=EXPORT_PATH)
    browser_parser = commands.add_parser("browser", help="check vectors saved by the bench page")
    browser_parser.add_argument("file", type=Path)
    args = parser.parse_args()

    if args.command == "server":
        report = bench_server()
    elif args.command == "export":
        report = export(args.out)
    else:
        report = compare_browser(args.file)
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
