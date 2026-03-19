# Deployment Plan: Dev to Prod

**Overview:**
This document details the exact process for syncing changes from the local development repository (`C:\p2p-connect-hub`) to the production repository (`C:\New_P2P_Tracker`). The process ensures compatibility, safety, and operational continuity.

## Prerequisites
- Windows OS (PowerShell 5.1 or newer).
- Both directories (`C:\p2p-connect-hub` and `C:\New_P2P_Tracker`) are accessible with Read/Write permissions.
- Node.js and `npm` installed and available in the system PATH.

## 1. Pre-Deployment Checks
### Code Quality & Dependencies
- **Linting:** Run `npm run lint` in the Dev repository to catch syntax and formatting errors.
- **Tests:** Run `npm run test` (Vitest) in Dev. All tests must pass prior to moving forward.
- **Dependency Compatibility:** Ensure both projects are using compatible Node.js versions. We will sync `package.json` to ensure updated dependencies are correctly migrated.

## 2. Artifact Creation & Build Verification
1. Open a terminal in `C:\p2p-connect-hub`.
2. Execute `npm run build`. This generates the static assets (in the `dist/` directory) and proves that the application successfully compiles without Type or Syntax errors.
3. *Note: We will not directly copy the `dist` directory, but rather the source files, as `New_P2P_Tracker` likely needs its own build process inclusive of its backend/server components.*

## 3. Migration Plan (Data/Config)
- **Database Schema (D1):**
  If there are database migrations, they must be executed manually in the Prod environment:
  ```powershell
  cd C:\New_P2P_Tracker
  npm run db:init # Applies migrations using wrangler local
  ```
- **Configuration (.env / Wrangler):**
  Do not overwrite `.env` or `wrangler.jsonc` during the file copy process. Production secrets must remain intact.

## 4. Deployment Workflow
1. **Full Backup:** Compress or copy `C:\New_P2P_Tracker` to a timestamped backup directory (e.g., `C:\P2P_Backup_YYYYMMDD`). Exclude `node_modules` and `.git` for speed.
2. **Synchronize Code:** Use `robocopy` to mirror the `src/` and `public/` directories from Dev to Prod. 
3. **Copy Root Files:** Overwrite `package.json`, `vite.config.ts`, `tailwind.config.ts`, and `components.json` to ensure Dev tools match. 
4. **Prod Prep:** Navigate to `C:\New_P2P_Tracker` and run `npm install` to update and resolve any new packages.
5. **Prod Build:** Finally, run `npm run build` in the Prod directory.

## 5. Post-Deployment Verification
- Run a minimal development server or preview process in the Prod context using `npm run preview`.
- Health Check: Perform an automated `Invoke-WebRequest` to `http://localhost:4173/` (or the respective port) to ensure the server starts without instantly crashing.
- Visual/Manual Verification: Review the UI via browser to ensure there are no glaring runtime errors or console warnings.

## 6. Rollback Strategy
### Conditions for Rollback
- Failed Unit/Lint Tests during Dev checking.
- Failed `npm install` or `npm run build` in Prod.
- Smoke Verify step receives an HTTP 500 error, Connection Refused, or timing out.

### Rollback Steps
If an error condition is met, the deployment script immediately:
1. Stops any newly started Preview servers.
2. Mirrors the files from the Timestamped Backup directory (`C:\P2P_Backup_YYYYMMDD`) back into `C:\New_P2P_Tracker` using `robocopy /MIR`.
3. Discards the failed changes, restoring the exact state prior to the deployment attempt.
4. Exits with a failure code to alert CI/CD or the automation engineer.

---
**See the attached `deploy.ps1` script for an automated implementation of this plan.**
