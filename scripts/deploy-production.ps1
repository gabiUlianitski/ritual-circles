# Ship Ritual Circles to production.
#
# A push to main rebuilds the website on Vercel and the API on Render.
# -Migrate applies db/migrations/031 through 034 on the database in backend/.env.
# Those files use IF NOT EXISTS, so running them again is safe.
# The script refuses a localhost database and never prints the connection string.
#
# From the repo root, on main:
#   .\scripts\deploy-production.ps1 -Commit -Push -Migrate
#
# -Commit  saves product source only. Secrets, backups, zip files, and web/dist stay out.
# -Push    sends main to origin. That starts the Vercel and Render deploys.
# -Migrate applies 031-034. backend/.env must point at Supabase.

param(
    [switch]$Commit,
    [string]$Message = "Ship home discovery, invitations, and circle profile fields.",
    [switch]$Push,
    [switch]$Migrate
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not $Commit -and -not $Push -and -not $Migrate) {
    Write-Host "Nothing selected. Run with -Commit, -Push, and/or -Migrate."
    Write-Host "Example: .\scripts\deploy-production.ps1 -Commit -Push -Migrate"
    git status --short
    exit 1
}

$include = @(
    "backend/app",
    "backend/scripts/apply_production_migrations.py",
    "db/schema.sql",
    "db/migrations/031_circle_description.sql",
    "db/migrations/032_user_avatar_url.sql",
    "db/migrations/033_circle_name.sql",
    "db/migrations/034_circle_invitations.sql",
    "db/supabase/full_migration.sql",
    "scripts/deploy-production.ps1",
    "web/src"
)

if ($Commit) {
    git add -- $include
    $staged = @(git diff --cached --name-only)
    $bad = @($staged | Where-Object { $_ -match '(^|/)\.env$|ai_keys\.json$|google_maps_keys\.json$|(^|/)web\.zip$|^backups/|(^|/)web/dist/' })
    if ($bad.Count -gt 0) {
        git reset --quiet
        Write-Host "Refusing to commit secrets, backups, web.zip, or web/dist:"
        $bad | ForEach-Object { Write-Host "  $_" }
        exit 1
    }
    if ($staged.Count -eq 0) {
        Write-Host "No product changes to commit."
    } else {
        Write-Host "Committing:"
        $staged | ForEach-Object { Write-Host "  $_" }
        git commit -m $Message
    }
}

if ($Push) {
    $branch = git rev-parse --abbrev-ref HEAD
    if ($branch -ne "main") {
        throw "Refusing to push '$branch'. Check out main first."
    }
    git push origin HEAD
    Write-Host "Pushed main. Vercel and Render deploy from GitHub."
    Write-Host "The first API request after Render sleeps can take about 30 seconds."
}

if ($Migrate) {
    $python = Join-Path $root "backend\.venv\Scripts\python.exe"
    if (-not (Test-Path $python)) {
        $python = "python"
    }
    & $python (Join-Path $root "backend\scripts\apply_production_migrations.py")
    if ($LASTEXITCODE -ne 0) {
        throw "Production migrations failed."
    }
}
