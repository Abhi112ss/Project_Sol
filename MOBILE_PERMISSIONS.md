# Project Sol (SolTransit) — Mobile Permissions & Notifications Policy

**Packages Used:** `permission_handler ^13.0.2`, `geolocator ^14.0.1`, `flutter_local_notifications ^23.0.2`, `firebase_messaging ^17.1.0`, `firebase_core ^5.2.0`  
**Target OS Baseline:** Android (API 33+ granular notification & foreground service compliance), extensible to iOS.

---

## 1. Progressive Just-in-Time Permission Principles

1. **Never bombard at launch:** Do NOT prompt for Location, Notifications, Camera, and Background Location simultaneously on first cold boot.
2. **Pre-Permission Rationale Screen:** Both apps show a calm Harbor Pilot permission onboarding explainer telling the user *what* is requested and *why* before calling the OS dialog.
3. **Graceful Permanent Denial Recovery:** If `PermissionStatus.isPermanentlyDenied` returns true, stop re-prompting automatically; provide a clear `Permissions & Connectivity` settings card with an explicit `Open App Settings` (`openAppSettings()`) action.
4. **Minimal Permission Footprint:** Never request `READ_CONTACTS` or broad external storage (`READ_EXTERNAL_STORAGE` / `MANAGE_EXTERNAL_STORAGE`). Camera/Microphone remain unrequested unless an optional future incident-photo or voice feature explicitly invokes them.

---

## 2. Permission Matrix by App

| Permission | Employee App (`apps/employee_app`) | Driver App (`apps/driver_app`) | Trigger Timing |
| :--- | :--- | :--- | :--- |
| `POST_NOTIFICATIONS` (Android 13+) | Yes — trip dispatch, cab approaching, delay/no-show alerts | Yes — duty assignment, passenger cancel/late alerts, active foreground service notification | Onboarding card (dismissible) |
| `ACCESS_FINE_LOCATION` | Contextual only — verifying pickup pin or attaching SOS coords | **Required** during active trip (`Start Trip` -> `Complete/Abort`) | Employee: on pin verify / SOS; Driver: on first `Start Trip` |
| `ACCESS_BACKGROUND_LOCATION` / `FOREGROUND_SERVICE_LOCATION` | **No** — employee never tracked in background | **Foreground Service Location** (`foregroundServiceType="location"`) active ONLY while a trip is `IN_PROGRESS` (e.g., while Google Maps is foregrounded) | Only after pre-explanation when starting active trip duty |
| Camera / Microphone | Optional future incident evidence only | Optional future inspection photo only | Strictly at feature tap |

---

## 3. Android Manifest & Foreground Tracking Boundaries

- **Driver `AndroidManifest.xml` declarations (Phase 3/5):**
  - `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`
  - `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`
  - `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`
  - `<service android:name="com.baseflow.geolocator..." android:foregroundServiceType="location" />` (verified per `geolocator` Android setup).
- **Hard Privacy Guarantee:** Driver location tracking stops programmatically on `COMPLETED`, `ABORTED`, or explicit log-off. Drivers are NEVER tracked off-duty.

---

## 4. Notification Channel Architecture

- **Local Notifications (`flutter_local_notifications`):** Device-scheduled pre-pickup countdown reminders (`T-15m`), active trip persistent foreground service status notification (Driver), and local connectivity alerts.
- **Remote Push (`firebase_messaging` behind Backend Notification Adapter):** Server-pushed events (`trip.assigned`, `cab.arrived`, `passenger.cancelled`, `passenger.running_late`, `no_show.marked`, `safety.sos`) dispatched reliably via BullMQ `notifications` queue. When FCM credentials are absent in ₹0 local dev, backend falls back cleanly to in-app DB notifications + Socket.IO real-time delivery without crashing.

