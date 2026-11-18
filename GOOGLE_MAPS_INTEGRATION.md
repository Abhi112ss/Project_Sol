# Project Sol (SolTransit) — Google Maps & Zero-Budget Mapping Strategy

**Policy Authority:** `master-prompt.md` §§12, 18, 24  
**Budget:** ₹0 (Zero Google Maps Directions API / Distance Matrix API / paid Places billing)

---

## 1. Coordinate-First Source of Truth (`saved_locations` / `employee_locations`)

We NEVER treat raw Google Maps share links (`maps.app.goo.gl/...`) as the primary system reference because shortlinks break, lack geofence centers, and cannot power PostGIS spatial queries.

Every pickup point and campus office stores:
- `latitude` (`DOUBLE PRECISION`) & `longitude` (`DOUBLE PRECISION`)
- `location` (`GEOGRAPHY(Point, 4326)`) indexed via GiST in PostgreSQL/PostGIS
- `geofence_radius_m` (`INTEGER`, default `150`m pickups / `250`m offices)
- `google_place_id` (nullable optional metadata)
- `original_maps_url` (nullable convenience preservation)
- `verified` (`BOOLEAN`)

---

## 2. One-Tap External Turn-by-Turn Navigation (Driver App)

Turn-by-turn routing is delegated completely to the installed **Google Maps** app using universal Google Maps URLs constructed dynamically from stored stop coordinates via `url_launcher`:

```text
https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving&dir_action=navigate
```

- **Launch Mode:** `LaunchMode.externalApplication`
- **Fallback Behavior:** If `canLaunchUrl` / external app launch fails (e.g., Google Maps uninstalled on a test emulator), fallback to `geo:{lat},{lng}?q={lat},{lng}({label})` or browser universal URL (`LaunchMode.platformDefault`) + copyable coordinates banner so the driver is never stuck.

---

## 3. In-App Map Rendering & OpenStreetMap Tile Guardrails

- **Mobile In-App Maps (`flutter_map ^8.3.2` + `latlong2`):** Used selectively for pickup pin confirmation and employee live vehicle preview.
- **Web Live Fleet Map (`react-leaflet ^5.0.0` + `leaflet`):** Displays active fleet markers, vehicle registration tags, pickup stops, and staleness indicators.
- **OSM Public Tile Policy Compliance:**
  - Public `tile.openstreetmap.org` servers are NOT unlimited free commercial CDNs.
  - Configure `OSM_TILE_URL` via environment variable (`https://tile.openstreetmap.org/{z}/{x}/{y}.png` for local dev only) with an explicit `User-Agent` / `Referer` header, conservative zoom bounds, and optional self-hosted PMTiles/Protomaps or Vector tile server path documented for production scale.
- **No Fake Routing / Travel-Time APIs:** MVP uses administrator-approved stop sequences and straight-line/last-ping velocity indications (honestly labeled as estimated) without invoking billable Google Directions APIs. Phase 7 evaluates self-hosted OSRM/Valhalla + Google OR-Tools VRPTW on OSM extracts at ₹0 API cost.

