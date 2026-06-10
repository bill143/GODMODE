#!/usr/bin/env bash
###############################################################################
# GODMODE — Backup helper (Linux/macOS)
#
# NON-DESTRUCTIVE: this script only reads data and writes archive files. It
# never deletes or overwrites live data.
#
# Backs up:
#   * MongoDB     — mongodump --archive --gzip (consistent, hot)
#   * Qdrant      — per-collection snapshots via the official snapshot API (hot)
#   * Meilisearch — read-only archive of its data volume
#   * LibreChat   — read-only archive of the uploads volume
#
# Usage:
#   scripts/backup.sh
#   BACKUP_DIR=/mnt/backups scripts/backup.sh        # custom destination
#   COMPOSE_PROJECT_NAME=godmode scripts/backup.sh   # if you renamed the project
#
# See docs/backup-restore.md for the restore procedure and trade-offs.
###############################################################################
set -euo pipefail

PROJECT="${COMPOSE_PROJECT_NAME:-godmode}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$(date +%Y%m%d-%H%M%S)"
DEST="${BACKUP_DIR:-$ROOT_DIR/backups}/$TS"

MONGO_CONTAINER="${MONGO_CONTAINER:-godmode-mongodb}"
QDRANT_CONTAINER="${QDRANT_CONTAINER:-godmode-qdrant}"
CURL_IMAGE="${CURL_IMAGE:-curlimages/curl:8.11.1}"
BUSYBOX_IMAGE="${BUSYBOX_IMAGE:-busybox:1.37}"

log()  { printf '\033[1;36m[backup]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[backup:warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[backup:error]\033[0m %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker not found in PATH"

# Optional Qdrant API key (only if you enabled Qdrant auth).
QDRANT_API_KEY=""
if [ -f "$ROOT_DIR/.env" ]; then
  QDRANT_API_KEY="$(grep -E '^QDRANT_API_KEY=' "$ROOT_DIR/.env" 2>/dev/null | cut -d= -f2- || true)"
fi
QARGS=()
[ -n "$QDRANT_API_KEY" ] && QARGS=(-H "api-key: $QDRANT_API_KEY")

running() { docker ps --format '{{.Names}}' | grep -qx "$1"; }

mkdir -p "$DEST"
log "Writing backup to: $DEST"

# --- 1. MongoDB -----------------------------------------------------------
backup_mongo() {
  running "$MONGO_CONTAINER" || die "container '$MONGO_CONTAINER' is not running"
  docker exec "$MONGO_CONTAINER" sh -c 'command -v mongodump >/dev/null 2>&1' \
    || die "mongodump not present in '$MONGO_CONTAINER' — see docs/backup-restore.md for the cold volume-copy fallback"
  log "MongoDB: running mongodump ..."
  docker exec "$MONGO_CONTAINER" mongodump --archive --gzip > "$DEST/mongodb.archive.gz"
  log "MongoDB: done ($(du -h "$DEST/mongodb.archive.gz" | cut -f1))"
}

# --- 2. Qdrant (official per-collection snapshot API) ---------------------
qcurl() { docker run --rm --network "container:$QDRANT_CONTAINER" "$CURL_IMAGE" -s "${QARGS[@]+"${QARGS[@]}"}" "$@"; }
backup_qdrant() {
  if ! running "$QDRANT_CONTAINER"; then warn "Qdrant container not running — skipping"; return 0; fi
  mkdir -p "$DEST/qdrant"
  local cols
  cols="$(qcurl http://127.0.0.1:6333/collections | grep -oE '"name":"[^"]+"' | sed 's/.*:"//;s/"//' || true)"
  if [ -z "${cols// /}" ]; then log "Qdrant: no collections found — nothing to snapshot"; return 0; fi
  local c snap
  for c in $cols; do
    log "Qdrant: snapshotting collection '$c' ..."
    snap="$(qcurl -X POST "http://127.0.0.1:6333/collections/$c/snapshots" | grep -oE '"name":"[^"]+\.snapshot"' | head -1 | sed 's/.*:"//;s/"//')"
    if [ -z "$snap" ]; then warn "Qdrant: no snapshot name returned for '$c' — skipping"; continue; fi
    docker run --rm --network "container:$QDRANT_CONTAINER" -v "$DEST/qdrant:/out" "$CURL_IMAGE" \
      -sf "${QARGS[@]+"${QARGS[@]}"}" -o "/out/${c}.snapshot" \
      "http://127.0.0.1:6333/collections/$c/snapshots/$snap" \
      && log "Qdrant: saved qdrant/${c}.snapshot" \
      || warn "Qdrant: download failed for '$c'"
  done
}

# --- 3/4. Read-only volume archives --------------------------------------
backup_volume() {
  local vol="$1" out="$2"
  if ! docker volume inspect "$vol" >/dev/null 2>&1; then warn "volume '$vol' not found — skipping"; return 0; fi
  docker run --rm -v "$vol:/data:ro" -v "$DEST:/backup" "$BUSYBOX_IMAGE" \
    tar czf "/backup/$out" -C /data . 2>/dev/null
  log "Archived '$vol' -> $out ($(du -h "$DEST/$out" | cut -f1))"
}

backup_mongo
backup_qdrant
log "Meilisearch: archiving data volume ..."
backup_volume "${PROJECT}_meili_data" "meilisearch_data.tar.gz"
log "LibreChat: archiving uploads volume ..."
backup_volume "${PROJECT}_librechat_uploads" "librechat_uploads.tar.gz"

cat > "$DEST/MANIFEST.txt" <<EOF
GODMODE backup
created : $TS
project : $PROJECT
contents:
  mongodb.archive.gz        mongodump --archive --gzip (whole instance)
  qdrant/*.snapshot         per-collection Qdrant snapshots (official API)
  meilisearch_data.tar.gz   Meilisearch data volume (${PROJECT}_meili_data)
  librechat_uploads.tar.gz  user-uploaded files (${PROJECT}_librechat_uploads)

restore: scripts/restore.sh "$DEST"   (see docs/backup-restore.md)
EOF

log "Backup complete."
ls -lh "$DEST"
