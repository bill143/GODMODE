#!/usr/bin/env bash
###############################################################################
# GODMODE — Restore helper (Linux/macOS)
#
# DESTRUCTIVE: restoring overwrites live data. To prevent accidents this
# script runs as a DRY RUN by default and prints what it WOULD do. Pass
# --confirm to actually perform the restore.
#
# Usage:
#   scripts/restore.sh ./backups/20260610-120000            # dry run
#   scripts/restore.sh ./backups/20260610-120000 --confirm  # perform restore
#
# Restores whatever artifacts are present in the backup directory:
#   mongodb.archive.gz        -> mongorestore --drop      (replaces DB content)
#   qdrant/*.snapshot         -> snapshot upload+recover  (replaces collections)
#   meilisearch_data.tar.gz   -> stop, replace volume, start
#   librechat_uploads.tar.gz  -> replace uploads volume
#
# See docs/backup-restore.md for details and the manual/operator-owned steps.
###############################################################################
set -euo pipefail

PROJECT="${COMPOSE_PROJECT_NAME:-godmode}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${1:-}"
CONFIRM="no"
for arg in "$@"; do [ "$arg" = "--confirm" ] && CONFIRM="yes"; done

MONGO_CONTAINER="${MONGO_CONTAINER:-godmode-mongodb}"
QDRANT_CONTAINER="${QDRANT_CONTAINER:-godmode-qdrant}"
MEILI_CONTAINER="${MEILI_CONTAINER:-godmode-meilisearch}"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.11.1}"
BUSYBOX_IMAGE="${BUSYBOX_IMAGE:-busybox:1.37}"

log()  { printf '\033[1;36m[restore]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[restore:warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[restore:error]\033[0m %s\n' "$*" >&2; exit 1; }
run()  { if [ "$CONFIRM" = "yes" ]; then eval "$@"; else printf '\033[0;90m  would run:\033[0m %s\n' "$*"; fi; }

command -v docker >/dev/null 2>&1 || die "docker not found in PATH"
[ -n "$SRC" ] || die "usage: scripts/restore.sh <backup-dir> [--confirm]"
[ -d "$SRC" ] || die "backup directory not found: $SRC"
SRC="$(cd "$SRC" && pwd)"

QDRANT_API_KEY=""
if [ -f "$ROOT_DIR/.env" ]; then
  QDRANT_API_KEY="$(grep -E '^QDRANT_API_KEY=' "$ROOT_DIR/.env" 2>/dev/null | cut -d= -f2- || true)"
fi
QARGS=()
[ -n "$QDRANT_API_KEY" ] && QARGS=(-H "api-key: $QDRANT_API_KEY")

if [ "$CONFIRM" = "yes" ]; then
  warn "CONFIRM mode: this WILL overwrite live data in the GODMODE stack."
else
  log "DRY RUN — no changes will be made. Re-run with --confirm to apply."
fi
log "Restoring from: $SRC"

# --- MongoDB --------------------------------------------------------------
if [ -f "$SRC/mongodb.archive.gz" ]; then
  log "MongoDB: restore mongodb.archive.gz (with --drop)"
  run "docker exec -i '$MONGO_CONTAINER' mongorestore --archive --gzip --drop < '$SRC/mongodb.archive.gz'"
else
  warn "MongoDB: no mongodb.archive.gz in backup — skipping"
fi

# --- Qdrant ---------------------------------------------------------------
if compgen -G "$SRC/qdrant/*.snapshot" >/dev/null 2>&1; then
  for snap in "$SRC"/qdrant/*.snapshot; do
    col="$(basename "$snap" .snapshot)"
    log "Qdrant: recover collection '$col' from $(basename "$snap") (priority=snapshot)"
    run "docker run --rm --network 'container:$QDRANT_CONTAINER' -v '$SRC/qdrant:/in' '$CURL_IMAGE' -sf ${QARGS[@]+\"${QARGS[@]}\"} -X POST -F 'snapshot=@/in/${col}.snapshot' 'http://127.0.0.1:6333/collections/${col}/snapshots/upload?priority=snapshot'"
  done
else
  warn "Qdrant: no qdrant/*.snapshot files in backup — skipping"
fi

# --- Meilisearch (stop, replace volume, start) ----------------------------
if [ -f "$SRC/meilisearch_data.tar.gz" ]; then
  log "Meilisearch: stop, wipe ${PROJECT}_meili_data, extract archive, start"
  run "docker stop '$MEILI_CONTAINER'"
  run "docker run --rm -v '${PROJECT}_meili_data:/data' -v '$SRC:/backup:ro' '$BUSYBOX_IMAGE' sh -c 'rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar xzf /backup/meilisearch_data.tar.gz -C /data'"
  run "docker start '$MEILI_CONTAINER'"
else
  warn "Meilisearch: no meilisearch_data.tar.gz in backup — skipping"
fi

# --- LibreChat uploads ----------------------------------------------------
if [ -f "$SRC/librechat_uploads.tar.gz" ]; then
  log "LibreChat uploads: replace ${PROJECT}_librechat_uploads"
  run "docker run --rm -v '${PROJECT}_librechat_uploads:/data' -v '$SRC:/backup:ro' '$BUSYBOX_IMAGE' sh -c 'rm -rf /data/* /data/..?* /data/.[!.]* 2>/dev/null; tar xzf /backup/librechat_uploads.tar.gz -C /data'"
else
  warn "LibreChat uploads: no librechat_uploads.tar.gz in backup — skipping"
fi

if [ "$CONFIRM" = "yes" ]; then
  log "Restore complete. Verify the stack: docker compose ps && docker compose logs --tail=50 librechat"
else
  log "Dry run complete. Re-run with --confirm to apply the actions above."
fi
