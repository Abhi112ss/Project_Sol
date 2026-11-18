import {
  normalizeLocalitySlug,
  resolveCanonicalLocalityMatch,
  type CanonicalLocalityCandidate,
} from './localities.utils.js';

describe('localities.utils', () => {
  const catalog: CanonicalLocalityCandidate[] = [
    {
      id: 'loc-chinthal',
      canonicalName: 'Chinthal',
      normalizedSlug: 'chinthal',
      aliases: ['Chinthal', 'Chintal', 'Chinthal X Road', 'IDPL Chinthal'],
      centerLatitude: 17.4998,
      centerLongitude: 78.4581,
      proximityRadiusM: 3500,
    },
    {
      id: 'loc-hayathnagar',
      canonicalName: 'Hayathnagar',
      normalizedSlug: 'hayathnagar',
      aliases: ['Hayathnagar', 'Hayatnagar', 'Hayath Nagar'],
      centerLatitude: 17.3266,
      centerLongitude: 78.6062,
      proximityRadiusM: 4500,
    },
  ];

  it('normalizes spelling variants and prefixes into the same canonical locality slug', () => {
    expect(normalizeLocalitySlug('Home - Chintal X Roads')).toBe('chinthal');
    expect(normalizeLocalitySlug('IDPL Chinthal')).toBe('chinthal');
    expect(normalizeLocalitySlug('Hayatnagar')).toBe('hayathnagar');
  });

  it('matches aliases first and falls back to geodesic spatial proximity when name differs', () => {
    const aliasMatch = resolveCanonicalLocalityMatch({
      rawName: 'Chintal',
      latitude: 17.45,
      longitude: 78.4,
      localities: catalog,
    });
    expect(aliasMatch.localityId).toBe('loc-chinthal');
    expect(aliasMatch.matchMethod).toBe('NAME_OR_ALIAS');

    const spatialMatch = resolveCanonicalLocalityMatch({
      rawName: 'Suhas Gate 2',
      latitude: 17.508, // ~1.2 km from Chinthal center
      longitude: 78.462,
      localities: catalog,
    });
    expect(spatialMatch.localityId).toBe('loc-chinthal');
    expect(spatialMatch.matchMethod).toBe('SPATIAL_PROXIMITY');
  });
});
