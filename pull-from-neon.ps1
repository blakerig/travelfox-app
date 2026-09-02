# pull-from-neon.ps1
#
# Dumps the hosted Neon database and restores it into the local dev
# Postgres database (running in Docker) - the opposite direction from the
# old migrate-to-neon.ps1, which has been removed (see the note at the
# bottom of this comment).
#
# Use this whenever you want your local database to reflect what's
# actually live - e.g. before a work session, or after content's been
# added straight to the live app (by you or anyone else), so you're
# developing against real, current data instead of a stale local copy.
#
# Run from the project root:
#   .\pull-from-neon.ps1
#
# This OVERWRITES your local database (via --clean --if-exists) with a
# full copy of whatever's currently in Neon. It asks you to confirm, but
# this is low-stakes either way: your local database is just a working
# copy, never anyone else's source of truth, so there's nothing here that
# running this again can't fix.
#
# One thing to know: if you've made a local-only schema change (ran
# `prisma migrate dev` locally but haven't deployed it to Neon yet), this
# pull reverts your local database to Neon's current schema too - the
# migration file is still sitting in server/prisma/migrations, so just
# re-run `npx prisma migrate dev` locally afterward to reapply it.
#
# Note on migrate-to-neon.ps1: that script (local -> Neon, a full
# destructive overwrite of Neon) has been deleted (2026-09-02) now that
# content gets added directly to Neon by more than one person - running it
# would have silently wiped out anything added straight to the live app.
# It's still recoverable from git history
# (`git log --all -- migrate-to-neon.ps1`) for the rare case of a genuine
# disaster-recovery reset, but it's deliberately not sitting in the repo
# where it could be run by accident. See claude/dev-workflow.md.

$ErrorActionPreference = "Stop"

# --- Config: your local Postgres container name --------------------------
$containerName = "travel-app-db"

$scriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$localEnvPath  = Join-Path $scriptDir "server\.env"
$prodEnvPath   = Join-Path $scriptDir "server\.env-production"
$dumpDir       = Join-Path $scriptDir "database"
$timestamp     = Get-Date -Format "yyyy-MM-dd_HHmmss"
$dumpFileName  = "neon_to_local_$timestamp.dump"
$containerPath = "/tmp/$dumpFileName"
$localDumpPath = Join-Path $dumpDir $dumpFileName

function Get-DbUrl($path) {
    if (-not (Test-Path $path)) {
        Write-Error "Couldn't find $path"
    }
    $line = Get-Content $path | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -Last 1
    if (-not $line) {
        Write-Error "No DATABASE_URL found in $path"
    }
    return ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
}

# --- Load both connection strings ---------------------------------------
$localUrl = Get-DbUrl $localEnvPath
$neonUrl  = Get-DbUrl $prodEnvPath

# --- Parse just the user/db name out of the local URL (host/port aren't
#     needed for the restore - pg_restore runs *inside* the container,
#     talking to local Postgres over its own localhost) ------------------
if ($localUrl -notmatch '^postgres(?:ql)?://(?<user>[^:]+):(?<pass>[^@]*)@[^/]+/(?<db>[^?]+)') {
    Write-Error "Couldn't parse local DATABASE_URL - expected postgresql://user:pass@host:port/dbname"
}
$localUser = $matches['user']
$localDb   = $matches['db']

# --- Confirm before touching local ----------------------------------------
Write-Host ""
Write-Host "This will:" -ForegroundColor Yellow
Write-Host "  1. Dump the Neon database (via its connection string)"
Write-Host "  2. DROP AND REPLACE all matching tables in your local database '$localDb'"
Write-Host ""
$confirm = Read-Host "Type 'yes' to continue"
if ($confirm -ne "yes") {
    Write-Host "Cancelled - nothing was done."
    exit
}

if (-not (Test-Path $dumpDir)) {
    New-Item -ItemType Directory -Path $dumpDir | Out-Null
}

# --- Step 1: dump Neon, from inside the container - it already has
#     network access out to Neon (confirmed by the old migrate-to-neon.ps1's
#     restore step working the same way in reverse) ------------------------
Write-Host ""
Write-Host "Dumping Neon database..." -ForegroundColor Cyan
docker exec -t $containerName pg_dump -d $neonUrl -F c -f $containerPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump against Neon failed with exit code $LASTEXITCODE"
}

# --- Step 2: copy the dump out onto Windows (kept as a local backup too) ---
Write-Host "Copying dump out of the container..." -ForegroundColor Cyan
docker cp "${containerName}:${containerPath}" $localDumpPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker cp failed with exit code $LASTEXITCODE"
}
Write-Host "Local copy saved to: $localDumpPath" -ForegroundColor Green

# --- Step 3: restore into local, from inside the same container -----------
# --no-owner --no-acl: same reasoning migrate-to-neon.ps1 needed in the
# other direction (see its git history) - Neon's tables are owned by
# Neon's own role name, which doesn't exist as a role in your local Docker
# Postgres, so "ALTER TABLE ... OWNER TO <neon-role>" would fail. Skipping
# ownership/ACL statements means the restored tables just end up owned by
# $localUser, which is exactly what you want locally anyway.
Write-Host ""
Write-Host "Restoring into local database..." -ForegroundColor Cyan
docker exec -i $containerName pg_restore -U $localUser -d $localDb --clean --if-exists --no-owner --no-acl $containerPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_restore failed with exit code $LASTEXITCODE - check the output above for details."
}

# --- Step 4: clean up the dump file left inside the container --------------
docker exec $containerName rm -f $containerPath

Write-Host ""
Write-Host "Done. Your local database now matches Neon." -ForegroundColor Green
Write-Host "A local backup copy is also saved at: $localDumpPath"
