/**
 * Builds the zero-cost external Google Maps turn-by-turn navigation URL
 * from authoritative WGS84 coordinates (never relying on shared URLs alone).
 */
export function buildGoogleMapsNavigationUrl(latitude: number, longitude: number): string {
  const lat = Number(latitude.toFixed(6));
  const lng = Number(longitude.toFixed(6));
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`;
}

/**
 * Pure Haversine spherical distance fallback in meters for unit tests or
 * degraded validation when PostGIS is outside call scope.
 */
export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusM = 6_371_000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

