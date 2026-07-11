import asyncio
import time
from collections import defaultdict


class SlidingWindowLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self._max = max_requests
        self._window = window_seconds
        self._lock = asyncio.Lock()
        self._hits: dict[str, list[float]] = defaultdict(list)

    async def allow(self, key: str) -> bool:
        now = time.monotonic()
        async with self._lock:
            hits = self._hits[key]
            cutoff = now - self._window
            while hits and hits[0] < cutoff:
                hits.pop(0)
            if len(hits) >= self._max:
                return False
            hits.append(now)
            return True


guide_generate_limiter = SlidingWindowLimiter(max_requests=5, window_seconds=60)
