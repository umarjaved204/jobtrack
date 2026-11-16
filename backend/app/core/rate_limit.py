"""In-process sliding-window rate limiter for the auth endpoints.

Deliberately small and dependency-free. State lives in this process's memory, which is
correct for a single API instance (Render free tier). With several instances, each would
count separately, so swap the storage for Redis before scaling out.
"""

import math
import threading
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass

from app.core.errors import RateLimitedError


@dataclass(frozen=True)
class Limit:
    max_requests: int
    window_seconds: int


class SlidingWindowLimiter:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}
        # Sync endpoints run in a thread pool, so access must be serialised.
        self._lock = threading.Lock()

    def hit(self, key: str, limit: Limit) -> None:
        """Record one request for `key`, or raise RateLimitedError if it's over the limit.
        Rejected requests are not recorded, so a blocked client recovers on schedule."""
        now = self._clock()
        with self._lock:
            hits = self._hits.setdefault(key, deque())
            while hits and hits[0] <= now - limit.window_seconds:
                hits.popleft()
            if len(hits) >= limit.max_requests:
                retry_after = math.ceil(hits[0] + limit.window_seconds - now)
                raise RateLimitedError(
                    "Too many attempts, please try again later",
                    headers={"Retry-After": str(max(retry_after, 1))},
                )
            hits.append(now)

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()
