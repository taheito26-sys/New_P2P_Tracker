<#
.SYNOPSIS
Minimal example script to test, promote, verify, and conditionally rollback changes from a Dev repo to a Prod repo.

.DESCRIPTION
Executes pre-deployment tests, verifies the build, performs a full secure backup of production, syncs the source code, rebuilds the production application, and validates the health of the app via an HTTP request.
#>

$ErrorActionPreference = "Stop"

# Configuration
$DevRepo    = "C:\p2p-connect-hub"
$ProdRepo   = "C:\New_P2P_Tracker"
$BackupDir  = "C:\P2P_Backup_$(Get-Date -f 'yyyyMMdd_HHmmss')"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "         P2P TRACKER - DEPLOYMENT        " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Helper function to run native commands and check exit codes
function Invoke-NativeCommand {
    param(
        [Parameter(Mandatory=$true)]
        [scriptblock]$Command,
        [Parameter(Mandatory=$false)]
        [string]$ErrorMessage = "Command failed"
    )
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$ErrorMessage (Exit Code: $LASTEXITCODE)"
    }
}

# Helper function to trigger rollback
function Invoke-Rollback {
    Write-Host "`n=========================================" -ForegroundColor Red
    Write-Host "       INITIATING EMERGENCY ROLLBACK     " -ForegroundColor Red
    Write-Host "=========================================" -ForegroundColor Red

    try {
        # Bring back our backup overlaying the faulty files
        # /MIR will ensure new broken files get wiped, old deleted files return
        & robocopy $BackupDir $ProdRepo /MIR /XD node_modules .git dist /XF .env /MT:8 | Out-Null
        
        Write-Host "-> Prod directory has been safely reverted to the $BackupDir state." -ForegroundColor Yellow
        Write-Host "-> Re-running npm install just in case." -ForegroundColor Yellow
        Set-Location $ProdRepo
        & npm install
        
        Write-Host "`n[READY] The environment has been successfully rolled back to its initial state." -ForegroundColor Yellow
        exit 1
    } catch {
        Write-Host "`n[CATASTROPHE] The rollback mechanism failed entirely. Manual intervention required. Backup Path: $BackupDir" -ForegroundColor Red
        exit 1
    }
}

# ---------------------------------------------------------
# STEP 1: PRE-DEPLOYMENT CHECKS & VERIFICATION
# ---------------------------------------------------------
Write-Host "`n[1/5] Running Dev Verification (Linting, Tests, Build Verify)..." -ForegroundColor Yellow
Set-Location $DevRepo

try {
    Write-Host "  -> Running Linter"
    Invoke-NativeCommand { npm run lint } "Linting failed"

    Write-Host "  -> Running Unit Tests"
    Invoke-NativeCommand { npm run test } "Tests failed"

    Write-Host "  -> Trial Build Generation"
    Invoke-NativeCommand { npm run build } "Dev Build failed"
} catch {
    Write-Host "`n[FATAL] Pre-deployment checks failed: $_`nAborting deployment. Prod remains untouched." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------
# STEP 2: BACKUP PRODUCTION
# ---------------------------------------------------------
Write-Host "`n[2/5] Creating Fast Backup of Production Environment..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# Use robocopy to mirror exactly, excluding heavy non-source directories
& robocopy $ProdRepo $BackupDir /MIR /XD node_modules .git dist logs /XF .env /MT:8 | Out-Null

if ($LASTEXITCODE -ge 8) {
    Write-Host "[FATAL] Backup failed (Robocopy Exit Code: $LASTEXITCODE). Aborting deployment." -ForegroundColor Red
    exit 1
}
Write-Host "  -> Backup saved securely at $BackupDir" -ForegroundColor Green

# ---------------------------------------------------------
# STEP 3: SYNC FROM DEV TO PROD
# ---------------------------------------------------------
Write-Host "`n[3/5] Migrating Source Content to Prod..." -ForegroundColor Yellow

try {
    # 3a. Directories
    $FoldersToMigrate = @("src", "public")
    foreach ($folder in $FoldersToMigrate) {
        & robocopy "$DevRepo\$folder" "$ProdRepo\$folder" /MIR /XD node_modules /NFL /NDL /NJH /NJS | Out-Null
    }

    # 3b. High Level Configs
    $FilesToMigrate = @("package.json", "tailwind.config.ts", "vite.config.ts", "components.json", "index.html")
    foreach ($file in $FilesToMigrate) {
        if (Test-Path "$DevRepo\$file") {
            Copy-Item -Path "$DevRepo\$file" -Destination "$ProdRepo\$file" -Force
        }
    }
} catch {
    Write-Host "[FATAL] Could not sync files: $_`nProceeding to Rollback." -ForegroundColor Red
    Invoke-Rollback
}

# ---------------------------------------------------------
# STEP 4: PROD RESOLUTION & BUILD
# ---------------------------------------------------------
Write-Host "`n[4/5] Building the App in Production Context..." -ForegroundColor Yellow
Set-Location $ProdRepo

try {
    Write-Host "  -> Updating Prod Dependencies (npm install)..."
    Invoke-NativeCommand { npm install } "npm install failed in Prod"

    Write-Host "  -> Bundling Prod Application (npm run build)..."
    Invoke-NativeCommand { npm run build } "npm run build failed in Prod"
} catch {
    Write-Host "[FATAL] Failed to build application in Prod: $_`nInitiating Rollback." -ForegroundColor Red
    Invoke-Rollback
}

# ---------------------------------------------------------
# STEP 5: SMOKE TESTING & VERIFICATION
# ---------------------------------------------------------
Write-Host "`n[5/5] Executing basic smoke verification..." -ForegroundColor Yellow
Set-Location $ProdRepo

# Start preview server without blocking the script
$PreviewProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run preview" -PassThru -NoNewWindow
Write-Host "  -> Waiting 10 seconds for Preview Server to attach to PORT 4173..."
Start-Sleep -Seconds 10

try {
    # Attempt requesting the localhost
    $Response = Invoke-WebRequest -Uri "http://localhost:4173" -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop

    if ($Response.StatusCode -eq 200) {
        Write-Host "`n[SUCCESS] Smoke test passed (HTTP 200 OK)." -ForegroundColor Green
    } else {
        throw "Received non-200 code: $($Response.StatusCode)"
    }
    
    # Cleanup Server
    Stop-Process -Id $PreviewProcess.Id -Force
    Write-Host "`n=== DEPLOYMENT COMPLETED SUCCESSFULLY ===" -ForegroundColor Green
    exit 0

} catch {
    Write-Host "[FATAL] Smoke verification failed: $($_.Exception.Message)" -ForegroundColor Red
    Stop-Process -Id $PreviewProcess.Id -Force -ErrorAction SilentlyContinue
    # Flow into rollback
    Invoke-Rollback
}
