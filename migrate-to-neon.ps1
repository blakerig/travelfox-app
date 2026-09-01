# migrate-to-neon.ps1
#
# Dumps the local dev Postgres database (running in Docker) and
# restores it into the hosted Neon database (from server/.env-production).
#
# Run from the project root:
#   .\migrate-to-neon.ps1
#
# This OVERWRITES whatever is currently in the Neon database (via
# --clean --if-exists) and replaces it with a full copy of local data.
# Confirms with you before doing anything destructive.

$ErrorActionPreference = "Stop"

# --- Config: your local Postgres container name --------------------------
$containerName = "travel-app-db"

$scriptDir     = Split-Path -Parent $MyInvocation.MyCommand.Path
$localEnvPath  = Join-Path $scriptDir "server\.env"
$prodEnvPath   = Join-Path $scriptDir "server\.env-production"
$dumpDir       = Join-Path $scriptDir "database"
$timestamp     = Get-Date -Format "yyyy-MM-dd_HHmmss"
$dumpFileName  = "local_to_neon_$timestamp.dump"
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
#     needed - pg_dump runs *inside* the container, talking to Postgres
#     over its own localhost) --------------------------------------------
if ($localUrl -notmatch '^postgres(?:ql)?://(?<user>[^:]+):(?<pass>[^@]*)@[^/]+/(?<db>[^?]+)') {
    Write-Error "Couldn't parse local DATABASE_URL - expected postgresql://user:pass@host:port/dbname"
}
$localUser = $matches['user']
$localDb   = $matches['db']

# --- Confirm before touching Neon -----------------------------------------
Write-Host ""
Write-Host "This will:" -ForegroundColor Yellow
Write-Host "  1. Dump local database '$localDb' from Docker container '$containerName'"
Write-Host "  2. DROP AND REPLACE all matching tables in your Neon database"
Write-Host ""
$confirm = Read-Host "Type 'yes' to continue"
if ($confirm -ne "yes") {
    Write-Host "Cancelled - nothing was done."
    exit
}

if (-not (Test-Path $dumpDir)) {
    New-Item -ItemType Directory -Path $dumpDir | Out-Null
}

# --- Step 1: dump local, inside the container ------------------------------
Write-Host ""
Write-Host "Dumping local database (inside Docker container '$containerName')..." -ForegroundColor Cyan
docker exec -t $containerName pg_dump -U $localUser -d $localDb -F c -f $containerPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump inside the container failed with exit code $LASTEXITCODE"
}

# --- Step 2: copy the dump out onto Windows (kept as a local backup too) ---
Write-Host "Copying dump out of the container..." -ForegroundColor Cyan
docker cp "${containerName}:${containerPath}" $localDumpPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "docker cp failed with exit code $LASTEXITCODE"
}
Write-Host "Local copy saved to: $localDumpPath" -ForegroundColor Green

# --- Step 3: restore into Neon, from inside the same container -------------
Write-Host ""
Write-Host "Restoring into Neon..." -ForegroundColor Cyan
docker exec -i $containerName pg_restore -d $neonUrl --clean --if-exists $containerPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_restore failed with exit code $LASTEXITCODE - check the output above for details."
}

# --- Step 4: clean up the dump file left inside the container --------------
docker exec $containerName rm -f $containerPath

Write-Host ""
Write-Host "Done. Neon now has a copy of your local data." -ForegroundColor Green
Write-Host "A local backup copy is also saved at: $localDumpPath"