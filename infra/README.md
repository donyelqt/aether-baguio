# infra/

Container, local orchestration, and deploy targets. All targets run the **same**
images, so moving between them is an operational change rather than a rewrite
(ARCH §12).

## Local

```bash
docker compose -f infra/compose.yaml up --build
```

`web` → `:3000`, `api` → `:8000`. No external services, no database. If this
ever needs Postgres or Redis running, ARCH §11 has been violated —
`apps/simulation/tests/guards/test_architectural_bans.py` asserts the compose
file never names one.

Note the compose file lives here, not at the repo root. There is deliberately
no root-level `docker-compose.yml`.

## Layout

| Path | Purpose |
|---|---|
| `compose.yaml` | Local full stack. Two services: `web`, `api`. |
| `docker/simulation.Dockerfile` | Engine + gateway. Pins the determinism env **in the image**. |
| `docker/web.Dockerfile` | Next.js standalone output. |
| `deploy/cloudrun/` | `service.yaml` — zero-ops, has the 3600 s request cap. |
| `deploy/fly/` | `fly.toml` — dedicated CPU, no request cap. Best balance. |
| `deploy/vercel/` | Web client only. |

## Choosing a deploy target

Operational, not architectural — nothing in the engine changes:

| Target | 24/7 cost | Dedicated CPU | WS timeout | Verdict |
|---|---|---|---|---|
| Cloud Run `min-instances=1` | ~$63/mo | Yes (always-allocated) | 3600 s | Zero-ops default |
| Fly `performance-1x` 2 GB | ~$33/mo | Yes | None | Best balance |
| Hetzner CAX11 | ~$4/mo | Shared | None | Cheapest; you own the box |

Re-verify pricing before committing — VPS providers reprice more often than
hyperscalers. Figures are from 2026-10-03 (ARCH §12.4).

## The determinism env vars

Set in `simulation.Dockerfile`, `compose.yaml`, `cloudrun/service.yaml`, and
`fly.toml` — all four, deliberately:

```
PYTHONHASHSEED=0
OMP_NUM_THREADS=1
MKL_NUM_THREADS=1
OPENBLAS_NUM_THREADS=1
```

These are not tuning. `PYTHONHASHSEED` changes string-keyed iteration order
between processes, and BLAS thread counts change float reduction partitioning.
Drop any one and replay diverges *between environments* while still passing
every in-process test (ARCH §8, §8.1).