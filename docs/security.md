# GODMODE - Production Security

This document explains GODMODE's security defaults, how local-dev and
production differ, and the hardening steps that remain **operator-owned**.

> **Honest scope:** these defaults make an internet-facing deployment *safer*,
> but GODMODE is **not** "fully secure" or "enterprise-grade" out of the box.
> Real-world safety still depends on the operator actions in the
> [checklist](#production-security-checklist) below (DNS/TLS, secrets, closing
> registration, optional database auth, monitoring).

---

## Defaults at a glance

| Area | Local base stack (`docker compose up`) | Production overlay (`-f docker-compose.prod.yml`) |
|---|---|---|
| Public entrypoint | LibreChat on `127.0.0.1:3080` (loopback only) | **Caddy only** (`:80`/`:443`), HTTPS-terminated |
| LibreChat host port | published to loopback | **not published** (internal network only) |
| Other services (Mongo, Meili, Qdrant, RAG, MCP) | internal only | internal only |
| Registration | **OPEN** (easy first run) | **CLOSED** by default |
| Cookies / CORS domain | `http://localhost:3080` | `https://${GODMODE_DOMAIN}` (Secure cookies) |
| Reverse-proxy trust | n/a | `TRUST_PROXY=1` (one hop: Caddy) |
| Search-engine indexing | default | `NO_INDEX=true` |
| Security headers | n/a | HSTS, nosniff, frame-deny, referrer, permissions-policy |

The split is intentional: the **base** stack optimizes for a frictionless
first run; the **production overlay** flips the risky defaults to safe ones.

---

## How the registration default works

`ALLOW_REGISTRATION` is deliberately **left unset** in `.env.example` so each
path applies its own default:

- Base compose: `ALLOW_REGISTRATION=${ALLOW_REGISTRATION:-true}` -> **open** locally.
- Prod overlay: `ALLOW_REGISTRATION=${ALLOW_REGISTRATION:-false}` -> **closed** in production.

To force a value in both environments, set `ALLOW_REGISTRATION` explicitly in
`.env`. Typical production flow: deploy with registration closed, create your
admin account (briefly set `ALLOW_REGISTRATION=true`, register, set it back to
`false` and `docker compose ... up -d`), or restrict signups to your email
domain via `registration.allowedDomains` in `librechat.yaml`.

LibreChat also ships **brute-force protections that are ON by default** in the
image (no configuration required): account/IP banning on repeated failures
(`BAN_VIOLATIONS`), login rate limiting (`LOGIN_MAX`/`LOGIN_WINDOW`),
registration rate limiting (`REGISTER_MAX`/`REGISTER_WINDOW`), and per-IP
message limits. These work correctly in production because `TRUST_PROXY=1`
lets LibreChat see the real client IP behind Caddy.

---

## Reverse proxy (Caddy)

Caddy is the single public entrypoint and terminates TLS in front of LibreChat
(`deploy/caddy/Caddyfile`). It applies official-pattern security response
headers:

- `Strict-Transport-Security` (HSTS, 1 year, preload)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (anti-clickjacking)
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-XSS-Protection: 0` (disables the legacy/buggy auditor)
- `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), browsing-topics=()`
  — deliberately allows the **same-origin camera/mic** the webcam feature needs
  while denying other powerful features.
- Strips `Server` and `X-Powered-By` so software details aren't advertised.

**Client IPs / trusted proxies.** Caddy is the edge, so by default it ignores
client-supplied `X-Forwarded-For` and forwards the real client IP; LibreChat
trusts that one hop via `TRUST_PROXY=1`. If you put GODMODE behind an
**additional** proxy/CDN (e.g. Cloudflare), declare it with Caddy's
`trusted_proxies` (commented example in the Caddyfile) and raise `TRUST_PROXY`
accordingly, otherwise rate limiting/banning will key off the CDN IP.

**Not configured (operator-owned):** a Content-Security-Policy is intentionally
**not** set — a wrong CSP breaks LibreChat's SPA, streaming, artifacts, and
camera capture. If you need CSP, tune and test it yourself.

---

## MCP posture

GODMODE's MCP configuration (`librechat.yaml`) follows official LibreChat
guidance:

- **`mcpSettings.allowedAddresses`** lists only the **internal** MCP services
  (`openmemory-mcp:8765`, `vision-bridge:8000`). This is an **SSRF exemption**
  for private Docker hostnames — *not* a general allow-list. Do not add public
  hosts here.
- **`mcpSettings.allowedDomains` is intentionally unset.** Setting it switches
  MCP into strict-whitelist mode and would block every public destination not
  explicitly listed.
- Both MCP servers set **`chatMenu: false`** so their tools are available to
  Agents but are not surfaced as a direct chat-menu toggle to every user.

---

## Network exposure

In **production** only Caddy publishes host ports (`80`, `443`). LibreChat and
every datastore stay on the internal `godmode_net` Docker network and are not
reachable from the host or LAN.

| Service | Port (internal) | Published in prod? | Auth |
|---|---|---|---|
| Caddy | 80 / 443 | **Yes (intended public entrypoint)** | TLS |
| LibreChat | 3080 | No | app auth (JWT) |
| MongoDB | 27017 | No | `--noauth` (internal only) |
| Meilisearch | 7700 | No | `MEILI_MASTER_KEY` |
| Qdrant | 6333 | No | none (internal only) |
| RAG API | 8000 | No | internal |
| OpenMemory / Vision Bridge (MCP) | 8765 / 8000 | No | internal |

MongoDB runs with `--noauth` because it is unreachable outside the Docker
network. If your threat model includes other workloads on the same host, or
you want defense-in-depth, **enable MongoDB authentication** (see below).

---

## Production security checklist

Run through this before exposing GODMODE to the internet:

- [ ] **Registration** — leave `ALLOW_REGISTRATION` unset (prod closes it), or
      set `false` after creating your account. Optionally restrict signups by
      email domain via `registration.allowedDomains` in `librechat.yaml`.
- [ ] **TLS / domain** — set `GODMODE_DOMAIN` to your real DNS name and
      `TLS_EMAIL` to a real address; point A/AAAA records at the host; confirm
      Caddy issued a certificate (`docker compose logs caddy`).
- [ ] **Secrets** — generate unique `CREDS_KEY`, `CREDS_IV`, `JWT_SECRET`,
      `JWT_REFRESH_SECRET`, `MEILI_MASTER_KEY` (the bootstrap script does this);
      never commit `.env`; rotate periodically. Note: rotating `CREDS_KEY`/
      `CREDS_IV` invalidates previously stored encrypted credentials.
- [ ] **Database exposure** — keep datastores internal (default). For
      multi-tenant/hostile hosts, enable **MongoDB auth** and a **Qdrant API
      key** (`QDRANT_API_KEY`).
- [ ] **MCP / private-network** — keep `allowedAddresses` limited to internal
      MCP services; keep `allowedDomains` unset unless you intend a strict
      whitelist.
- [ ] **Reverse proxy** — front everything with Caddy (prod overlay); if behind
      a CDN, configure `trusted_proxies` and `TRUST_PROXY`.
- [ ] **Firewall** — at the host level, allow only `80`/`443` (and your SSH
      port) inbound; block direct access to app/database ports.
- [ ] **Updates** — pin `LIBRECHAT_VERSION`; review and bump images
      deliberately (`docker compose pull`).
- [ ] **Backups & monitoring** — set up the backup runbook and (optionally) the
      observability overlay; verify restores.

---

## Enable MongoDB authentication (optional hardening)

Internal-only Mongo is fine for a single-tenant host. To add auth:

1. Set a root user/password via env on the `mongodb` service
   (`MONGO_INITDB_ROOT_USERNAME` / `MONGO_INITDB_ROOT_PASSWORD`) and remove
   `--noauth` from its `command`.
2. Update `MONGO_URI` to include credentials:
   `mongodb://user:pass@mongodb:27017/LibreChat?authSource=admin`.
3. Recreate the stack. (On an existing deployment, create the user first, then
   enable auth, to avoid locking yourself out.)

---

## What GODMODE does **not** do

- No SSO/SAML/OIDC is wired up (LibreChat supports it; configuring an IdP is
  out of scope here).
- No WAF, no DDoS protection, no Content-Security-Policy — front with a CDN/WAF
  if your threat model needs them.
- No automatic secret rotation, no host-level firewall management, no intrusion
  detection — all operator-owned.
