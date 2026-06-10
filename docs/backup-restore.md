# GODMODE — Backup & Restore

Operator runbook for backing up and restoring GODMODE's critical data. Helper
scripts are provided for Linux/macOS (`*.sh`) and Windows (`*.ps1`); every step
also has a documented manual equivalent so you are never locked into the
scripts.

> **Golden rules**
> - `backup.*` is **non-destructive** — it only reads data and writes archives.
> - `restore.*` is **destructive** and runs as a **dry run by default**. It only
>   changes data when you pass `--confirm` (bash) / `-Confirm` (PowerShell).
> - No real secrets live in this repo. These scripts do **not** back up your
>   `.env` — keep that secret elsewhere (see [Operator-owned](#operator-owned--out-of-scope)).

---

## What is covered

| Data | Store | Backup method | Consistency |
|---|---|---|---|
| Conversations, users, accounts | MongoDB | `mongodump --archive --gzip` | hot, consistent |
| Vector memory / RAG vectors | Qdrant | per-collection **snapshot API** | hot, consistent |
| Full-text search index | Meilisearch | data-volume archive | crash-consistent |
| Uploaded files / images | `librechat_uploads` volume | volume archive | crash-consistent |

Not backed up by these scripts (by design): `.env` secrets, Caddy certs
(`caddy_data` — re-issued automatically by Let's Encrypt), LibreChat logs, and
the observability volumes. See [Operator-owned](#operator-owned--out-of-scope).

---

## Prerequisites

- The stack is running (`docker compose ps` shows the services `Up`).
- Docker can pull two tiny helper images on first run: `curlimages/curl` and
  `busybox`.
- Disk space for the archive (roughly the size of your Mongo + uploads data).

---

## Back up

### Linux / macOS

```bash
./scripts/backup.sh                      # writes ./backups/<timestamp>/
BACKUP_DIR=/mnt/nas/godmode ./scripts/backup.sh   # custom destination
```

### Windows (PowerShell)

```powershell
./scripts/backup.ps1
./scripts/backup.ps1 -BackupDir D:\backups
```

Each run creates a timestamped folder containing:

```
mongodb.archive.gz          # mongodump (whole instance)
qdrant/<collection>.snapshot # one official snapshot per Qdrant collection
meilisearch_data.tar.gz     # Meilisearch data volume
librechat_uploads.tar.gz    # uploaded files
MANIFEST.txt                # what's inside + the restore command
```

### Manual equivalents

If you prefer not to use the scripts:

```bash
# MongoDB (runs --noauth in this stack, so no credentials needed)
docker exec godmode-mongodb mongodump --archive --gzip > mongodb.archive.gz

# Qdrant — create + download a snapshot for a collection (official API)
docker run --rm --network container:godmode-qdrant curlimages/curl \
  -s -X POST http://127.0.0.1:6333/collections/godmode_memory/snapshots
docker run --rm --network container:godmode-qdrant -v "$PWD:/out" curlimages/curl \
  -s -o /out/godmode_memory.snapshot \
  http://127.0.0.1:6333/collections/godmode_memory/snapshots/<snapshot-name>

# Any named volume -> tar.gz (read-only)
docker run --rm -v godmode_meili_data:/data:ro -v "$PWD:/backup" busybox \
  tar czf /backup/meilisearch_data.tar.gz -C /data .
```

---

## Schedule it (optional)

**Linux cron** — nightly at 02:30, keep 14 days:

```cron
30 2 * * * cd /opt/godmode && BACKUP_DIR=/mnt/nas/godmode ./scripts/backup.sh \
  && find /mnt/nas/godmode -maxdepth 1 -type d -mtime +14 -exec rm -rf {} \;
```

**Windows Task Scheduler** — daily:

```powershell
$action  = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument '-NoProfile -File C:\godmode\scripts\backup.ps1 -BackupDir D:\backups'
$trigger = New-ScheduledTaskTrigger -Daily -At 2:30AM
Register-ScheduledTask -TaskName 'GODMODE Backup' -Action $action -Trigger $trigger
```

---

## Restore

Restore **always dry-runs first**. Review the printed actions, then re-run with
the confirm flag.

### Linux / macOS

```bash
./scripts/restore.sh ./backups/20260610-023000             # dry run (prints plan)
./scripts/restore.sh ./backups/20260610-023000 --confirm   # actually restore
```

### Windows (PowerShell)

```powershell
./scripts/restore.ps1 -Source .\backups\20260610-023000              # dry run
./scripts/restore.ps1 -Source .\backups\20260610-023000 -Confirm     # restore
```

What `--confirm` does, per artifact present in the backup:

| Artifact | Action (destructive) |
|---|---|
| `mongodb.archive.gz` | `mongorestore --drop` (replaces DB contents) |
| `qdrant/*.snapshot` | snapshot **upload + recover** per collection (`priority=snapshot`) |
| `meilisearch_data.tar.gz` | stop Meilisearch → replace volume → start |
| `librechat_uploads.tar.gz` | replace the uploads volume contents |

> Restoring Meilisearch briefly **stops** the `godmode-meilisearch` container so
> the index can be replaced safely. Mongo and Qdrant restore live via their APIs.

### Cold / fallback restore

If `mongodump` is unavailable in your image, or you took a cold volume copy
instead, restore the volume directly (stop the consumer first):

```bash
docker compose stop mongodb
docker run --rm -v godmode_mongo_data:/data -v "$PWD:/backup:ro" busybox \
  sh -c 'rm -rf /data/* && tar xzf /backup/mongo_data.tar.gz -C /data'
docker compose start mongodb
```

The same volume-replace pattern works for `qdrant_data` if you ever take a cold
Qdrant copy instead of API snapshots.

---

## Verify after a restore

```bash
docker compose ps                              # all services Up/healthy
docker compose logs --tail=50 librechat        # no startup errors
```

Then in the app: sign in, confirm conversations are present, run a search
(Meilisearch), and ask an Agent something that hits memory (Qdrant).

---

## Operator-owned / out of scope

These scripts deliberately stop at "consistent local archives." You own:

- **Off-site / off-host copies** — push `./backups` to S3, a NAS, or another
  machine. A local backup on the same disk is not disaster recovery.
- **Encryption at rest** — encrypt the archives if they leave the host.
- **Retention** — prune old backup folders (see the cron example above).
- **Secrets** — `.env` (API keys, `CREDS_KEY`, JWT secrets) is **not** in these
  backups. Store it in a password manager / secret store. Restoring data without
  the original `CREDS_KEY`/`CREDS_IV` means stored credentials cannot be decrypted.
- **Caddy TLS** — `caddy_data` is not backed up; certificates are re-issued
  automatically by Let's Encrypt on next start.
