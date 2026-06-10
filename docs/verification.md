# GODMODE - Runtime Verification

GODMODE verification comes in **three honest levels**. Each proves something
different — don't mistake one for another.

| Level | What it proves | Needs real API keys? | Where it runs |
|---|---|---|---|
| 1. **Static validation** | config/YAML/lint are well-formed | No | CI (always) + local |
| 2. **Local stack verification** | the stack **builds, boots, and reaches a healthy state**; local health endpoints respond | No | CI smoke job + local |
| 3. **End-to-end product verification** | real model replies (Talk/Vision/Camera/Memory) actually work | **Yes** | Manual, on the target host |

> Level 2 says *"the stack boots locally and every service's health endpoint
> answers."* It does **not** say *"the product works"* — that's Level 3, which
> requires real Anthropic/OpenAI keys and is performed by an operator. This repo
> never fakes model success.

---

## Level 2 - Verify the stack locally (one command)

```bash
# Linux / macOS - build local images, start the full stack, verify, then report
./scripts/verify-stack.sh --up --build

# Windows / PowerShell
./scripts/verify-stack.ps1 -Up -Build
```

Already have the stack running? Drop `--up`/`--build` to just verify it:

```bash
./scripts/verify-stack.sh
```

Only the services that need **no external API keys** (handy on a machine without
keys):

```bash
./scripts/verify-stack.sh --core --up --build      # mongodb, meilisearch, qdrant, vision-bridge
```

Useful flags: `--prod` (include `docker-compose.prod.yml`), `--down` (tear down
after), `--timeout N` (seconds to wait for healthy, default 240).

### What the script checks

1. `docker compose config` is valid.
2. (with `--build`) the local **vision-bridge** image builds.
3. (with `--up`) services start and `docker compose up --wait` blocks until
   healthchecks pass.
4. Each service reaches Docker **health = healthy**.
5. Each service's **local health endpoint** answers, probed *inside* the
   container (no host ports required, nothing external contacted):

   | Service | Probe |
   |---|---|
   | mongodb | `mongosh` ping |
   | meilisearch | `GET :7700/health` -> `available` |
   | qdrant | TCP connect `:6333` |
   | rag_api | `GET :8000/health` |
   | openmemory-mcp | `GET :8765/openapi.json` |
   | vision-bridge | `GET :8000/health` -> `status: ok` |
   | librechat | `GET :3080/health` |

6. Prints a **PASS/FAIL** summary and **exits non-zero** on any failure. On
   failure it dumps `docker compose ps` and the **logs of the failed services**
   so you can see what broke.

> The full stack reaches a healthy state even with **placeholder** API keys,
> because every health endpoint above is independent of real provider calls.
> That is exactly what makes Level 2 deterministic and CI-safe.

### What Level 2 does **not** prove

- It does **not** call Anthropic or OpenAI, so it does not prove a model will
  actually answer, that your keys are valid, or that Vision/Camera analysis
  returns real descriptions.
- It does **not** verify TLS, DNS, or the Caddy production path (run
  `--prod` for config + container health, but real HTTPS needs a real domain).
- It is **not** a load/security test.

---

## CI smoke verification

`.github/workflows/ci.yml` includes a **`smoke-test`** job that goes beyond
static validation (pattern inspired by `hoverkraft-tech/compose-action`):

1. writes a throwaway `.env` with **placeholder** secrets (no real keys),
2. builds + brings the stack up with `docker compose up -d --wait`,
3. runs `scripts/verify-stack.sh` (health + endpoint probes),
4. on failure, uploads/dumps `docker compose logs`,
5. always tears the stack down (`docker compose down -v`).

It validates the **service graph and startup**, not real provider responses, so
it never depends on external APIs, keys, or rate limits.

---

## Level 3 - End-to-end product verification (manual, needs real keys)

Only a human with **real** API keys can confirm the product works. After
deploying, walk through **[Verifying Each Feature](../README.md#verifying-each-feature)**
in the README:

- **Talk** - a model actually replies.
- **Vision** - image upload is described.
- **Camera** - the webcam frame is analyzed (Vision Bridge + a real provider).
- **Memory** - facts persist across sessions.

This is the only level that proves "GODMODE works", and it is intentionally
**operator-owned** — see also [docs/security.md](security.md) for the
production go-live checklist.
