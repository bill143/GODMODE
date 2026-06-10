#!/usr/bin/env bash
###############################################################################
# GODMODE - Runtime stack verification (Linux/macOS)
#
# Verifies that the Docker Compose stack is configured correctly, reaches a
# minimum HEALTHY state, and that key local health endpoints respond. Prints a
# PASS/FAIL summary and exits non-zero on any failure.
#
# WHAT THIS PROVES:   the stack boots locally and internal health endpoints
#                     answer (infrastructure + app startup verification).
# WHAT IT DOES *NOT*: it does NOT call Anthropic/OpenAI, so it does not prove
#                     real model responses. That requires real keys and is a
#                     separate, manual end-to-end check (see docs/verification.md).
#
# Usage:
#   scripts/verify-stack.sh                 # verify an already-running stack (full)
#   scripts/verify-stack.sh --up --build    # build + start the full stack, then verify
#   scripts/verify-stack.sh --core --up --build   # only the key-independent core
#   scripts/verify-stack.sh --prod          # include docker-compose.prod.yml
#   scripts/verify-stack.sh --down          # tear the stack down afterwards
#
# Flags:
#   --up           start the target services before verifying (uses --wait)
#   --build        build local images (vision-bridge) before starting
#   --core         only verify services that need NO external API keys
#                  (mongodb, meilisearch, qdrant, vision-bridge)
#   --prod         add docker-compose.prod.yml to the compose file set
#   --down         `docker compose down` after verifying (keep volumes)
#   --timeout N    seconds to wait for each service to become healthy (default 240)
#   -h | --help    show this help
###############################################################################
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# --- options --------------------------------------------------------------
COMPOSE_FILES=(-f docker-compose.yml)
DO_UP=0 DO_BUILD=0 DO_DOWN=0 CORE_ONLY=0 TIMEOUT=240
while [ $# -gt 0 ]; do
  case "$1" in
    --up) DO_UP=1 ;;
    --build) DO_BUILD=1 ;;
    --down) DO_DOWN=1 ;;
    --core) CORE_ONLY=1 ;;
    --prod) COMPOSE_FILES+=(-f docker-compose.prod.yml) ;;
    --timeout) shift; TIMEOUT="${1:-240}" ;;
    -h|--help) sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

# --- pretty output --------------------------------------------------------
if [ -t 1 ]; then C_G=$'\033[32m'; C_R=$'\033[31m'; C_Y=$'\033[33m'; C_B=$'\033[36m'; C_0=$'\033[0m'
else C_G= C_R= C_Y= C_B= C_0=; fi
log()  { printf '%s[verify]%s %s\n' "$C_B" "$C_0" "$*"; }
pass() { printf '  %sPASS%s  %s\n' "$C_G" "$C_0" "$*"; }
fail() { printf '  %sFAIL%s  %s\n' "$C_R" "$C_0" "$*"; }
warn() { printf '  %sWARN%s  %s\n' "$C_Y" "$C_0" "$*"; }

dc() { docker compose "${COMPOSE_FILES[@]}" "$@"; }

# --- service sets ---------------------------------------------------------
CORE_SERVICES=(mongodb meilisearch qdrant vision-bridge)
FULL_SERVICES=(mongodb meilisearch qdrant rag_api openmemory-mcp vision-bridge librechat)
if [ "$CORE_ONLY" -eq 1 ]; then TARGETS=("${CORE_SERVICES[@]}"); else TARGETS=("${FULL_SERVICES[@]}"); fi

FAILURES=0
FAILED_SVCS=()
note_fail() { FAILURES=$((FAILURES+1)); FAILED_SVCS+=("$1"); }

command -v docker >/dev/null 2>&1 || { echo "docker not found in PATH" >&2; exit 2; }

# =========================================================================
log "1/4 Validating compose configuration ..."
if dc config -q; then pass "docker compose config"; else fail "docker compose config"; note_fail "compose-config"; fi

# =========================================================================
if [ "$DO_BUILD" -eq 1 ]; then
  log "Building local images (vision-bridge) ..."
  dc build vision-bridge || { fail "build vision-bridge"; note_fail "build"; }
fi

if [ "$DO_UP" -eq 1 ]; then
  log "2/4 Starting services: ${TARGETS[*]}"
  # --wait blocks until healthchecks pass (or the timeout fires).
  if dc up -d --wait --wait-timeout "$TIMEOUT" "${TARGETS[@]}"; then
    pass "compose up --wait (all requested services healthy)"
  else
    warn "compose up --wait reported not-all-healthy; continuing to per-service report"
  fi
else
  log "2/4 Verifying against the already-running stack (no --up given)"
fi

# =========================================================================
# Per-service health status (Docker's own healthcheck = readiness semantics)
log "3/4 Checking compose health status ..."
declare -A CID
health_of() {
  local cid="$1"
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$cid" 2>/dev/null
}
wait_healthy() {
  local svc="$1" cid="$2" deadline=$((SECONDS + TIMEOUT)) st=""
  while [ "$SECONDS" -lt "$deadline" ]; do
    st="$(health_of "$cid")"
    case "$st" in
      healthy) return 0 ;;
      running) [ "$DO_UP" -eq 0 ] && return 0 ;;  # no healthcheck case
      unhealthy) return 1 ;;
    esac
    sleep 3
  done
  echo "$st"; return 1
}
for svc in "${TARGETS[@]}"; do
  cid="$(dc ps -q "$svc" 2>/dev/null)"
  CID[$svc]="$cid"
  if [ -z "$cid" ]; then fail "$svc: not running (no container)"; note_fail "$svc"; continue; fi
  if last="$(wait_healthy "$svc" "$cid")"; then
    pass "$svc: $(health_of "$cid")"
  else
    fail "$svc: not healthy (status: ${last:-$(health_of "$cid")})"
    note_fail "$svc"
  fi
done

# =========================================================================
# Endpoint smoke probes (run inside each container using its own tooling, so
# no host port publishing is required and nothing external is contacted).
log "4/4 Probing local health endpoints ..."
probe() {
  local svc="$1" cid="$2"
  case "$svc" in
    mongodb)        docker exec "$cid" mongosh --quiet --eval "db.runCommand('ping').ok" 2>/dev/null | grep -q 1 ;;
    meilisearch)    docker exec "$cid" wget -qO- http://127.0.0.1:7700/health 2>/dev/null | grep -q available ;;
    qdrant)         docker exec "$cid" bash -lc 'exec 3<>/dev/tcp/127.0.0.1/6333' 2>/dev/null ;;
    rag_api)        docker exec "$cid" python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=5).status==200 else 1)" 2>/dev/null ;;
    openmemory-mcp) docker exec "$cid" python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8765/openapi.json',timeout=5).status==200 else 1)" 2>/dev/null ;;
    vision-bridge)  docker exec "$cid" python -c "import urllib.request,json,sys; d=json.load(urllib.request.urlopen('http://127.0.0.1:8000/health',timeout=5)); sys.exit(0 if d.get('status')=='ok' else 1)" 2>/dev/null ;;
    librechat)      docker exec "$cid" wget -qO- http://127.0.0.1:3080/health >/dev/null 2>&1 ;;
    *) return 0 ;;
  esac
}
declare -A ENDPOINT=(
  [mongodb]="mongosh ping" [meilisearch]="GET :7700/health" [qdrant]="tcp :6333"
  [rag_api]="GET :8000/health" [openmemory-mcp]="GET :8765/openapi.json"
  [vision-bridge]="GET :8000/health" [librechat]="GET :3080/health"
)
for svc in "${TARGETS[@]}"; do
  cid="${CID[$svc]}"
  [ -z "$cid" ] && { fail "$svc endpoint (${ENDPOINT[$svc]}): container not running"; continue; }
  if probe "$svc" "$cid"; then pass "$svc endpoint (${ENDPOINT[$svc]})"
  else fail "$svc endpoint (${ENDPOINT[$svc]})"; note_fail "$svc-endpoint"; fi
done

# =========================================================================
# Failure visibility: surface logs of the services that failed.
if [ "$FAILURES" -gt 0 ]; then
  echo
  log "${C_R}Collecting logs for failed services to aid troubleshooting ...${C_0}"
  dc ps || true
  printf '%s\n' "${FAILED_SVCS[@]}" | sort -u | while read -r s; do
    case "$s" in compose-config|build|*-endpoint) s="${s%-endpoint}" ;; esac
    [ -n "$(dc ps -q "$s" 2>/dev/null)" ] && { echo "----- logs: $s (last 60) -----"; dc logs --no-color --tail=60 "$s" 2>/dev/null || true; }
  done
fi

[ "$DO_DOWN" -eq 1 ] && { log "Tearing down (volumes preserved) ..."; dc down || true; }

# =========================================================================
echo
if [ "$FAILURES" -eq 0 ]; then
  printf '%s========== VERIFY PASS ==========%s\n' "$C_G" "$C_0"
  echo "Verified: stack boots and local health endpoints respond for: ${TARGETS[*]}"
  echo "NOT verified: real Anthropic/OpenAI model responses (needs real keys; see docs/verification.md)."
  exit 0
else
  printf '%s========== VERIFY FAIL (%d) ==========%s\n' "$C_R" "$FAILURES" "$C_0"
  echo "Failed checks: ${FAILED_SVCS[*]}"
  echo "See the per-service logs above, or run: docker compose ${COMPOSE_FILES[*]} logs <service>"
  exit 1
fi
