# SolTransit Local Runbook (PowerShell)

Run all commands from `d:\prac\project_sol`. In PowerShell, chain commands with `;` (not `&&`).

---

## 1. Start Postgres & Redis (Docker)

```powershell
pnpm docker:up
pnpm docker:health
```

> If Docker defaults to another context on Windows:
> ```powershell
> docker --context desktop-linux compose -f infra/docker-compose.yml --env-file infra/.env up -d
> docker --context desktop-linux compose -f infra/docker-compose.yml ps
> ```

---

## 2. Optional: Rebuild or Reset Seed Data

Run this if you pulled new code or want a fresh seeded DB (`2026-11-17` morning bookings):

```powershell
pnpm --filter backend build
pnpm --filter web build
pnpm --filter backend db:reset; pnpm --filter backend db:migrate; pnpm --filter backend db:seed
```

---

## 3. Start Backend (`:3001`) & WebUI (`:3000`)

Open **two separate terminals**:

**Terminal 1 — Backend API & WebSocket (`/ws/transport`)**

```powershell
# Fast prebuilt server (requires backend build first):
pnpm --filter backend start:prod

# Or hot-reload dev mode:
pnpm backend:dev
```

**Terminal 2 — Admin WebUI**

```powershell
# Fast prebuilt server (requires web build first):
pnpm --filter web start

# Or hot-reload dev mode:
pnpm web:dev
```

Verify both are up:
- Admin WebUI: `http://localhost:3000` (Phase 6 Safety Workbench: `http://localhost:3000/safety`)
- Backend Health: `http://127.0.0.1:3001/api/v1/health`
- Swagger API Docs: `http://127.0.0.1:3001/api/docs`

---

## 4. Connect Physical Android Phone

### Option A: USB Cable (`adb reverse` — recommended, no firewall setup needed)

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb reverse tcp:3001 tcp:3001
& $adb reverse --list
```

Then in **Employee App** (`Profile`) or **Driver App** (`History & Sync`) -> **Change Server Endpoint**, choose:

```text
http://127.0.0.1:3001/api/v1
```

*(Whenever you unplug/replug USB or reboot, re-run `& $adb reverse tcp:3001 tcp:3001`.)*

### Option B: Same Wi-Fi Network

1. Find your PC LAN IPv4 address (`ipconfig`), e.g. `192.168.31.210`.
2. Ensure Windows Defender Firewall allows inbound TCP `3001` on your **Private** Wi-Fi profile.
3. Set the in-app **Backend Server Endpoint** to:

```text
http://<YOUR_PC_IP>:3001/api/v1
```

---

## 5. Rebuild / Re-install Phone APKs (Only After Flutter Changes)

```powershell
# Employee APK
Push-Location apps/employee_app
flutter build apk --debug --dart-define=API_BASE_URL=http://127.0.0.1:3001/api/v1
Pop-Location

# Driver APK
Push-Location apps/driver_app
flutter build apk --debug --dart-define=API_BASE_URL=http://127.0.0.1:3001/api/v1
Pop-Location

# Install/update on USB-connected phone (keeps app settings)
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb install -r apps/employee_app/build/app/outputs/flutter-apk/app-debug.apk
& $adb install -r apps/driver_app/build/app/outputs/flutter-apk/app-debug.apk
```

---

## 6. Stop Everything

- Press `Ctrl + C` in the Backend and WebUI terminals.
- Stop Docker containers (optional):

```powershell
pnpm docker:stop
```

