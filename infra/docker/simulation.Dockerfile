# Simulation engine + gateway — one deployable unit, not two services.
#
# Splitting the gateway from the engine would buy nothing at V1 and cost a
# network hop *inside* the tick loop (ARCH §3).
#
# The same image runs on every deploy target (Cloud Run, Fly, VPS). Nothing in
# the engine branches on where it is running; the target is an operational
# choice, not an architectural one (ARCH §12.4).

# --- builder -----------------------------------------------------------------
FROM python:3.13-slim AS builder

WORKDIR /build

# Build tools are needed for any source-only dependency, then discarded.
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY apps/simulation/pyproject.toml ./
COPY apps/simulation/app ./app

RUN pip install --no-cache-dir --prefix=/install .

# --- runtime -----------------------------------------------------------------
FROM python:3.13-slim AS runtime

# Determinism, pinned in the image rather than left to the deploy environment.
# A tick loop that silently loses reproducibility because someone dropped an
# env var is worse than one that refuses to start (ARCH §8, §8.1).
ENV PYTHONHASHSEED=0 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1

COPY --from=builder /install /usr/local

WORKDIR /app
COPY apps/simulation/app ./app

# Unprivileged: the engine needs no write access and no root.
RUN useradd --create-home --shell /usr/sbin/nologin aether \
 && chown -R aether:aether /app
USER aether

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz')"

# Single worker on purpose. The tick loop is single-threaded by contract, and
# running multiple uvicorn workers would fork the session registry — which is
# exactly the state that must stay in one process (ARCH §8, §12.2).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]