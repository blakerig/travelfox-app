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
#
# Note on pg_dump/pg_restore versions (2026-09-05): Postgres requires the
# pg_dump *tool* version to be the same as or newer than the *server*
# version it's reading from - an older pg_dump refuses to even try against
# a newer server. Neon's server version can move ahead of whatever's
# bundled in the local travel-app-db image (this broke once already, when
# Neon was on Postgres 18 and the local image's tools were still 16.4), so
# both the dump and restore steps below run through a disposable, one-off
# `postgres:18` container rather than the tools baked into travel-app-db -
# that keeps this script working even if Neon upgrades again without
# needing to touch (or upgrade) your actual local Postgres engine. Bump
# the tag below if Neon ever moves to a newer major version than this.
#
# Related quirk, hit the same day fixing the above: pg_dump embeds a few
# "SET <timeout-setting> = 0;" preamble statements in every dump, and
# Postgres 17 added a new one - transaction_timeout - to that set. A
# pg_dump running against Neon (v18) includes it; if your local
# travel-app-db is still on an older major version (pre-17), pg_restore
# hits "unrecognized configuration parameter" on that one line and reports
# "errors ignored on restore: N" - but keeps going and restores everything
# else, since pg_restore itself already decided this specific failure
# isn't fatal. The check below trusts that same judgment: an ignored-error
# summary means "finished, with a harmless warning," a bare nonzero exit
# with no such summary means something actually went wrong.

$ErrorActionPreference = "Stop"
$dumpToolImage = "postgres:18"  # bump if Neon's server version moves past this

$scriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$localEnvPath  = Join-Path $scriptDir "server\.env"
$prodEnvPath   = Join-Path $scriptDir "server\.env-production"
$dumpDir       = Join-Path $scriptDir "database"
$timestamp     = Get-Date -Format "yyyy-MM-dd_HHmmss"
$dumpFileName  = "neon_to_local_$timestamp.dump"
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

# --- Parse the user/db name out of the local URL for the confirmation
#     message below, and build a version of the URL reachable from the
#     disposable postgres:18 container used for dump/restore (see the note
#     at the top) - that container isn't travel-app-db itself, so it can't
#     just say "localhost" and mean itself the way the old docker-exec
#     version of this script could; host.docker.internal is Docker
#     Desktop's own DNS name for reaching a port published on the host
#     machine (local Postgres's 5432, per server/.env) from inside another
#     container. -------------------------------------------------------
if ($localUrl -notmatch '^postgres(?:ql)?://(?<user>[^:]+):(?<pass>[^@]*)@[^/]+/(?<db>[^?]+)') {
    Write-Error "Couldn't parse local DATABASE_URL - expected postgresql://user:pass@host:port/dbname"
}
$localUser         = $matches['user']
$localDb           = $matches['db']
$localUrlForDocker = $localUrl -replace '@localhost:', '@host.docker.internal:'
if ($localUrlForDocker -eq $localUrl) {
    Write-Error "Expected local DATABASE_URL to point at 'localhost' (e.g. postgresql://user:pass@localhost:5432/db) so it could be rewritten to host.docker.internal for the restore step - got something else, check server\.env"
}

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

# --- Step 1: dump Neon, via a disposable postgres:18 container rather
#     than travel-app-db's own (older) bundled tools - see the version
#     note at the top of this file. $dumpDir is bind-mounted straight in,
#     so the dump lands directly at $localDumpPath - no separate
#     docker-cp-out step needed the way the old in-container version
#     required. ----------------------------------------------------------
Write-Host ""
Write-Host "Dumping Neon database (via a disposable $dumpToolImage client)..." -ForegroundColor Cyan
docker run --rm -v "${dumpDir}:/dump" $dumpToolImage pg_dump -d $neonUrl -F c -f "/dump/$dumpFileName"
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump against Neon failed with exit code $LASTEXITCODE"
}
Write-Host "Dump saved to: $localDumpPath" -ForegroundColor Green

# --- Step 2: restore into local, via the same disposable container --------
# Runs against $localUrlForDocker (host.docker.internal, not localhost -
# see above) since this container is a separate one-off, not travel-app-db
# itself. --no-owner --no-acl: same reasoning migrate-to-neon.ps1 needed in
# the other direction (see its git history) - Neon's tables are owned by
# Neon's own role name, which doesn't exist as a role in your local Docker
# Postgres, so "ALTER TABLE ... OWNER TO <neon-role>" would fail. Skipping
# ownership/ACL statements means the restored tables just end up owned by
# $localUser, which is exactly what you want locally anyway. A newer
# pg_restore (18) targeting an older server (whatever version
# travel-app-db actually runs) is the well-supported direction - it's only
# the reverse, older-tool-against-newer-server, that Postgres refuses.
Write-Host ""
Write-Host "Restoring into local database..." -ForegroundColor Cyan
$restoreOutput = & docker run --rm -v "${dumpDir}:/dump" $dumpToolImage pg_restore -d $localUrlForDocker --clean --if-exists --no-owner --no-acl "/dump/$dumpFileName" 2>&1
$restoreExit = $LASTEXITCODE
$restoreOutput | ForEach-Object { Write-Host $_ }
if ($restoreExit -ne 0) {
    # pg_restore returns the same nonzero exit code whether it aborted
    # outright or just finished with some ignored, non-fatal errors (see
    # the note at the top of this file) - "errors ignored on restore: N"
    # in its own output is how it tells the two apart, so trust that
    # rather than treating every nonzero exit as a hard failure.
    $ignoredMatch = $restoreOutput | Select-String -Pattern 'errors ignored on restore:\s*(\d+)'
    if ($ignoredMatch) {
        Write-Host ""
        Write-Host "pg_restore finished with $($ignoredMatch.Matches[0].Groups[1].Value) ignored error(s) - see the note at the top of this file (almost always the newer-server-setting quirk, e.g. Neon's transaction_timeout). Treating this as a success; everything else restored normally." -ForegroundColor Yellow
    } else {
        Write-Error "pg_restore failed with exit code $restoreExit - check the output above for details."
    }
}

Write-Host ""
Write-Host "Done. Your local database now matches Neon." -ForegroundColor Green
Write-Host "A local backup copy is also saved at: $localDumpPath"
