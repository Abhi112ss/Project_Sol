import { buildGoogleMapsNavigationUrl, haversineDistanceMeters } from './maps.util.js';

describe('maps.util', () => {
  it('constructs a valid Google Maps driving navigation URL from coordinates', () => {
    const url = buildGoogleMapsNavigationUrl(17.4849, 78.4138);
    expect(url).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=17.4849,78.4138&travelmode=driving&dir_action=navigate',
    );
  });

  it('computes realistic Hyderabad Kukatpally-to-Gachibowli distance in meters', () => {
    const dist = haversineDistanceMeters(17.4849, 78.4138, 17.4401, 78.3489);
    expect(dist).toBeGreaterThan(7500);
    expect(dist).toBeLessThan(9500);
  });
});

