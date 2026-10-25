# Ship Ritual Circles to production in a safe, explicit order.
#
# A push to main rebuilds the website on Vercel and the API on Render, so the
# production database must have the new schema BEFORE the push.
#
# Steps always run in this order, and only the ones you select:
#   -Prepare      Run tests, TypeScript, build, locale checks, git diff --check,
#                 migration inventory, and a release-manifest dry run.
#                 Never stages or commits anything.
#   -CheckConfig  Report production config names as configured/missing/unsafe.
#                 Values are never printed. Use -EnvFile for a production env file.
#   -Commit       Stage the release paths, show them, and commit locally after
#                 you type COMMIT. Refuses if anything was already staged.
#   -Migrate      Apply db/migrations/031-046 to the database in backend/.env
#                 after you confirm a backup, then run the read-only schema check.
#   -CheckSchema  Run only the read-only schema check.
#   -Push         Re-run the schema check, then push main after you type PUSH.
#                 With -ApiUrl, waits until <ApiUrl>/health reports ok.
#
# Release flow (see DEPLOYMENT.md, "Activities release"):
#   1. .\scripts\deploy-production.ps1 -Prepare
#   2. Review the manifest. .\scripts\deploy-production.ps1 -Commit
#   3. Back up production in Supabase (this script cannot verify a backup).
#   4. Point backend/.env at production. .\scripts\deploy-production.ps1 -Migrate
#   5. .\scripts\deploy-production.ps1 -Push -ApiUrl https://<render-api-host>
#   6. Let Vercel finish. Run -Migrate again (idempotent) to pick up late joiners.
#   7. Run the signed-in smoke checklist.
#
# The migration runner refuses localhost and never prints the connection string.

param(
    [switch]$Prepare,
    [switch]$CheckConfig,
    [string]$EnvFile,
    [switch]$Commit,
    [string]$Message = "Activities: participation, recurring dates, notifications, attendance outcomes, legacy runtime retirement, auth hardening.",
    [switch]$Migrate,
    [switch]$CheckSchema,
    [switch]$Push,
    [string]$ApiUrl
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$python = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    $python = "python"
}

$migrations = @(
    "031_circle_description.sql",
    "032_user_avatar_url.sql",
    "033_circle_name.sql",
    "034_circle_invitations.sql",
    "035_hoby_daily_insight.sql",
    "036_hobby_insights.sql",
    "037_discovery_description_for_you.sql",
    "038_circle_members.sql",
    "039_activities.sql",
    "040_activity_participants.sql",
    "041_activity_lifecycle.sql",
    "042_activity_occurrence_participants.sql",
    "043_activity_suggestions.sql",
    "044_activity_occurrence_slots.sql",
    "045_activity_notifications.sql",
    "046_activity_attendance_outcomes.sql"
)

$include = @(
    "backend/app",
    "backend/tests",
    "backend/scripts/apply_production_migrations.py",
    "backend/scripts/check_production_schema.py",
    "backend/scripts/check_release_config.py",
    "backend/scripts/test_create_circle.py",
    "backend/scripts/repro_create_http.py",
    "backend/scripts/diag_supabase_create.py",
    "backend/.env.example",
    "backend/README.md",
    "db/schema.sql",
    "db/supabase/full_migration.sql",
    "docs/data-model-map.md",
    "scripts/deploy-production.ps1",
    "render.yaml",
    "DEPLOYMENT.md",
    "AGENTS.md",
    ".gitignore",
    "android/README.md",
    "ios/RitualCircles/README.md",
    "web/.env.example",
    "web/src"
) + ($migrations | ForEach-Object { "db/migrations/$_" })

$forbidden = '(^|/)\.env$|ai_keys\.json$|google_maps_keys\.json$|(^|/)web\.zip$|^backups/|(^|/)dist/|__pycache__/|\.pyc$|(^|/)\.venv/|node_modules/|^_audit|reset_account_for_onboarding\.sql$|^h origin main$|seed_demo_data\.py$'

function Invoke-Step([string]$Name, [scriptblock]$Body) {
    Write-Host ""
    Write-Host "== $Name"
    & $Body
    if ($LASTEXITCODE -ne 0) {
        throw "$Name failed (exit $LASTEXITCODE)."
    }
}

function Get-ReleaseManifest {
    # git add --dry-run lists additions, modifications and deletions without touching the index.
    $lines = @(git add --dry-run -- $include)
    if ($LASTEXITCODE -ne 0) { throw "git add --dry-run failed." }
    $lines | ForEach-Object {
        if ($_ -match "^(add|remove) '(.+)'$") {
            [pscustomobject]@{ Action = $Matches[1]; Path = $Matches[2] }
        }
    }
}

function Assert-NoForbidden($paths) {
    $bad = @($paths | Where-Object { $_ -match $forbidden })
    if ($bad.Count -gt 0) {
        Write-Host "Refusing: the release would include secrets or local artifacts:"
        $bad | ForEach-Object { Write-Host "  $_" }
        exit 1
    }
}

function Invoke-SchemaCheck {
    Invoke-Step "Read-only production schema check" {
        & $python (Join-Path $root "backend\scripts\check_production_schema.py")
    }
}

if (-not ($Prepare -or $CheckConfig -or $Commit -or $Migrate -or $CheckSchema -or $Push)) {
    Write-Host "Nothing selected. Start with: .\scripts\deploy-production.ps1 -Prepare"
    Write-Host "Steps run in order: -Prepare, -CheckConfig, -Commit, -Migrate, -CheckSchema, -Push."
    exit 1
}

if ($Prepare) {
    Invoke-Step "Backend tests" {
        Push-Location (Join-Path $root "backend")
        try { & $python -m unittest discover -s tests } finally { Pop-Location }
    }
    Invoke-Step "TypeScript" {
        Push-Location (Join-Path $root "web")
        try { npx tsc --noEmit } finally { Pop-Location }
    }
    Invoke-Step "Web build" {
        Push-Location (Join-Path $root "web")
        try { npm run build } finally { Pop-Location }
    }
    Invoke-Step "Locale JSON" {
        & $python -c "import json,pathlib;[json.loads(pathlib.Path(p).read_text(encoding='utf-8')) for p in ('web/src/locales/en.json','web/src/locales/he.json')];print('en.json and he.json parse')"
    }
    Invoke-Step "git diff --check" {
        git diff --check -- $include
    }
    Invoke-Step "Migration inventory" {
        $missing = @($migrations | Where-Object { -not (Test-Path (Join-Path $root "db\migrations\$_")) })
        if ($missing.Count -gt 0) {
            Write-Host "Missing migration files:"
            $missing | ForEach-Object { Write-Host "  $_" }
            $global:LASTEXITCODE = 1
        } else {
            Write-Host "All $($migrations.Count) migration files (031-046) are present."
            $global:LASTEXITCODE = 0
        }
    }

    Write-Host ""
    Write-Host "== Release manifest (dry run; the git index is not changed)"
    $manifest = @(Get-ReleaseManifest)
    $manifest | ForEach-Object { Write-Host ("  {0,-6} {1}" -f $_.Action, $_.Path) }
    $removed = @($manifest | Where-Object { $_.Action -eq "remove" }).Count
    Write-Host "  $($manifest.Count) paths: $($manifest.Count - $removed) added or changed, $removed deleted."
    Assert-NoForbidden ($manifest | ForEach-Object { $_.Path })
    Write-Host "  No secrets or local artifacts in the manifest."

    Write-Host ""
    Write-Host "== Changes left out of the release (review these)"
    $inRelease = @{}
    $manifest | ForEach-Object { $inRelease[$_.Path] = $true }
    git status --porcelain --untracked-files=normal | ForEach-Object {
        $path = $_.Substring(3).Trim('"')
        if (-not $inRelease.ContainsKey($path)) { Write-Host "  $_" }
    }
}

if ($CheckConfig) {
    Invoke-Step "Production configuration names" {
        if ($EnvFile) {
            & $python (Join-Path $root "backend\scripts\check_release_config.py") --env-file $EnvFile
        } else {
            & $python (Join-Path $root "backend\scripts\check_release_config.py")
        }
    }
}

if ($Commit) {
    $already = @(git diff --cached --name-only)
    if ($already.Count -gt 0) {
        Write-Host "Refusing: the git index already has staged changes. Review or unstage them first:"
        $already | ForEach-Object { Write-Host "  $_" }
        exit 1
    }
    git add -- $include
    $staged = @(git diff --cached --name-status)
    $stagedPaths = @(git diff --cached --name-only)
    if (@($stagedPaths | Where-Object { $_ -match $forbidden }).Count -gt 0) {
        git reset --quiet
    }
    Assert-NoForbidden $stagedPaths
    if ($stagedPaths.Count -eq 0) {
        Write-Host "No product changes to commit."
    } else {
        Write-Host "Staged for commit:"
        $staged | ForEach-Object { Write-Host "  $_" }
        $answer = Read-Host "Type COMMIT to create a local commit (anything else unstages and stops)"
        if ($answer -ne "COMMIT") {
            git reset --quiet
            Write-Host "Stopped. Nothing was committed; the index was reset."
            exit 1
        }
        git commit -m $Message
        if ($LASTEXITCODE -ne 0) { throw "git commit failed." }
        Write-Host "Committed locally. Nothing was pushed."
    }
}

if ($Migrate) {
    Write-Host ""
    Write-Host "This script cannot verify a backup. Take a Supabase backup first."
    $answer = Read-Host "Type BACKUP-TAKEN to apply migrations 031-046 to the database in backend/.env"
    if ($answer -ne "BACKUP-TAKEN") {
        Write-Host "Stopped. No migration was applied."
        exit 1
    }
    Invoke-Step "Apply migrations 031-046 (statement by statement; stops at the first failure)" {
        & $python (Join-Path $root "backend\scripts\apply_production_migrations.py")
    }
    Invoke-SchemaCheck
}

if ($CheckSchema -and -not $Migrate) {
    Invoke-SchemaCheck
}

if ($Push) {
    $branch = git rev-parse --abbrev-ref HEAD
    if ($branch -ne "main") {
        throw "Refusing to push '$branch'. Check out main first."
    }
    $pendingRelease = @(git status --porcelain -- $include)
    if ($pendingRelease.Count -gt 0) {
        Write-Host "Refusing: release paths have uncommitted changes that would not be deployed:"
        $pendingRelease | ForEach-Object { Write-Host "  $_" }
        exit 1
    }
    Invoke-SchemaCheck
    Write-Host ""
    git log --oneline -1
    $answer = Read-Host "Type PUSH to push this commit to origin/main (starts Render and Vercel deploys)"
    if ($answer -ne "PUSH") {
        Write-Host "Stopped. Nothing was pushed."
        exit 1
    }
    git push origin HEAD
    if ($LASTEXITCODE -ne 0) { throw "git push failed." }
    Write-Host "Pushed main. Render and Vercel deploy from GitHub."

    if ($ApiUrl) {
        $healthUrl = $ApiUrl.TrimEnd("/") + "/health"
        Write-Host "Waiting for $healthUrl (Render free tier can take several minutes)..."
        $deadline = (Get-Date).AddMinutes(15)
        $healthy = $false
        while ((Get-Date) -lt $deadline) {
            try {
                $response = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 30
                if ($response.status -eq "ok" -and $response.database -eq "ok") { $healthy = $true; break }
            } catch {
                Write-Host "  not healthy yet"
            }
            Start-Sleep -Seconds 20
        }
        if (-not $healthy) {
            throw "API health did not report ok within 15 minutes. Check Render logs before continuing."
        }
        Write-Host "API healthy: the database answers. (/health is new in this release, so the old build returns 404.)"
    }
    Write-Host "Next: let Vercel finish, run -Migrate again (idempotent), then the smoke checklist."
}
