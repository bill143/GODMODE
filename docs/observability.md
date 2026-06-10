# GODMODE — Observability (optional)

An **optional** single-host monitoring overlay: Prometheus, Grafana, Loki +
Promtail, plus cAdvisor, node-exporter and blackbox-exporter. It is **not part
of the default stack** and only runs when you explicitly add the overlay file.

> This is a pragmatic single-host setup, not an enterprise/HA monitoring
> platform. There is no Alertmanager, no remote-write, and no multi-node
> clustering. See [What's intentionally out of scope](#whats-intentionally-out-of-scope).

---

## Enable it

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.observability.yml \
  up -d
```

Leave the third `-f` off and you get the normal stack — the overlay never
changes the default deployment path.

> **Host requirement:** cAdvisor and node-exporter mount host paths and need a
> **Linux Docker host** for full metrics. On Docker Desktop (Windows/macOS)
> the rest of the stack still works, but host/container metrics are partial.

---

## What gets monitored

Only real, existing surfaces are scraped — nothing is fabricated.

| Source | How | Metrics |
|---|---|---|
| Host (CPU/mem/disk/load) | `node-exporter` | native `/metrics` |
| Containers (CPU/mem/net/fs) | `cAdvisor` | native `/metrics` |
| Qdrant | direct scrape of `qdrant:6333/metrics` | **native** Prometheus metrics |
| LibreChat, Meilisearch, RAG API, Vision Bridge | `blackbox-exporter` HTTP probe of each `/health` surface | up/down + latency |
| MongoDB, Qdrant (port) | `blackbox-exporter` TCP probe | up/down + latency |
| Prometheus / Loki / exporters | self-scrape | native `/metrics` |

LibreChat, Mongo, Meilisearch, the RAG API and Vision Bridge do **not** expose
Prometheus metrics, so they are health-probed (black-box) rather than given
fake exporters. Meilisearch *can* expose native metrics if started with
`MEILI_EXPERIMENTAL_ENABLE_METRICS=true` — a commented scrape job is included in
`deploy/observability/prometheus/prometheus.yml` for operators who opt in.

---

## Access

Both UIs bind to **localhost only** — nothing is published to the public
interface. Reach them via an SSH tunnel or your own reverse proxy.

| UI | URL | Notes |
|---|---|---|
| Grafana | `http://127.0.0.1:3000` | login from `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` |
| Prometheus | `http://127.0.0.1:9090` | targets, alerts, ad-hoc queries |

> **Change `GRAFANA_ADMIN_PASSWORD`** in `.env` before exposing Grafana in any
> way. The default (`changeme`) is for first-boot only.

Example tunnel from your workstation:

```bash
ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 user@your-host
```

---

## What "healthy" looks like

- **Prometheus → Status → Targets:** every target `UP` except any you left
  commented (e.g. the optional Meilisearch native-metrics job).
- **Grafana → Dashboards → GODMODE → "GODMODE — Stack Overview":**
  - *Service Health Probes* tiles all green (`UP`).
  - *Container Memory / CPU* show each `godmode-*` container within its compose
    `mem_limit` (LibreChat ≤ 2 GB, datastores ≤ 1 GB, etc.).
  - *Host Memory Used* below the yellow (80%) threshold.
  - *GODMODE Container Logs* streaming recent lines from Loki.
- **Prometheus → Alerts:** all rules `Inactive`.

Datasources (Prometheus + Loki) and the overview dashboard are
auto-provisioned — no manual Grafana setup needed.

---

## Logs (Loki + Promtail)

Promtail discovers containers through the Docker socket and ships the logs of
every `godmode-*` container to Loki. Query them in **Grafana → Explore → Loki**:

```logql
{job="godmode"}                                  # everything
{job="godmode", container="godmode-librechat"}   # one service
{job="godmode"} |= "error"                        # filter by text
```

Retention is **7 days** (enforced by the Loki compactor in
`deploy/observability/loki/loki-config.yml`).

---

## Alerts

Alert rules live in `deploy/observability/prometheus/alerts.yml` and cover
probe failures, down scrape targets, high host memory and low host disk. They
are **visible** in the Prometheus *Alerts* tab and in Grafana.

There is **no Alertmanager** wired in, so alerts do **not** notify anyone.
Routing alerts to email/Slack/PagerDuty is an intentional operator decision —
add an Alertmanager and a `alerting:` block to `prometheus.yml` if you want
paging.

---

## Resource footprint & teardown

Roughly ~1–1.5 GB RAM total across the seven observability containers (limits
are set in the overlay). Metrics retention defaults to **15 days**
(`PROM_RETENTION`).

Stop just the observability overlay (leaving the app running):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.observability.yml \
  stop prometheus grafana loki promtail cadvisor node-exporter blackbox-exporter
```

Remove it entirely (data volumes persist unless you add `-v`):

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.observability.yml \
  rm -sf prometheus grafana loki promtail cadvisor node-exporter blackbox-exporter
```

---

## What's intentionally out of scope

- **Alertmanager / paging** — rules are evaluated and visible, not routed.
- **Long-term / remote storage** — local TSDB + filesystem Loki only.
- **App-level (LibreChat) metrics** — LibreChat exposes none; we health-probe it.
- **TLS / auth in front of Grafana/Prometheus** — bind localhost + tunnel, or
  put them behind the existing Caddy reverse proxy yourself.
- **mongodb-exporter / per-DB query metrics** — not included to keep the
  footprint small; Mongo is covered by container metrics + a TCP health probe.
