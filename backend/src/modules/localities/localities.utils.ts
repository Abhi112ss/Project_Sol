import { haversineDistanceMeters } from '../../infrastructure/shared/maps.util.js';

export interface CanonicalLocalityCandidate {
  id: string;
  canonicalName: string;
  normalizedSlug: string;
  aliases: string[];
  centerLatitude: number;
  centerLongitude: number;
  proximityRadiusM: number;
}

const KNOWN_VARIANT_CANONICALS: Record<string, string> = {
  chintal: 'chinthal',
  chintalapally: 'chinthal',
  idplchinthal: 'chinthal',
  hayatnagar: 'hayathnagar',
  hayath: 'hayathnagar',
  kphb: 'kukatpally',
  kphbcolony: 'kukatpally',
  miyapurex: 'miyapur',
  srnagar: 'ameerpet',
};

/**
 * Produces a deterministic locality slug normalizing spelling variations,
 * case, diacritics, and generic transit/landmark suffixes.
 */
export function normalizeLocalitySlug(raw: string | null | undefined): string {
  if (!raw) return '';
  const stripped = raw
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replaceAll(/^(home|pickup|drop|office)\s*[-–:]\s*/gi, '')
    .replaceAll(
      /\b(x\s*roads?|cross\s*roads?|metro|gate(\s+[a-z0-9]+)?|phase\s*\d+|colony|nagar\s*extn|extn|pillar\s*\d+)\b/gi,
      ' ',
    )
    .replaceAll(/[^a-z0-9]+/g, ' ')
    .trim();

  if (!stripped) return '';
  const compact = stripped.replaceAll(/\s+/g, '');
  if (KNOWN_VARIANT_CANONICALS[compact]) {
    return KNOWN_VARIANT_CANONICALS[compact];
  }
  const tokens = stripped.split(/\s+/).filter(Boolean);
  const lastOrFirst = KNOWN_VARIANT_CANONICALS[tokens[0]] ?? tokens.join('-');
  return lastOrFirst;
}

/**
 * Resolves the canonical locality for a set of coordinates & optional text label:
 * 1) Explicit localityId match
 * 2) Exact normalized name / alias match (handles spelling variants like Chintal vs Chinthal)
 * 3) Spatial nearest canonical locality within configured proximityRadiusM
 */
export function resolveCanonicalLocalityMatch(input: {
  localityId?: string | null;
  rawName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  localities: CanonicalLocalityCandidate[];
}): {
  localityId: string | null;
  canonicalName: string | null;
  normalizedSlug: string | null;
  matchMethod: 'EXPLICIT_ID' | 'NAME_OR_ALIAS' | 'SPATIAL_PROXIMITY' | 'DERIVED_SLUG' | 'UNRESOLVED';
} {
  if (input.localityId) {
    const byId = input.localities.find((l) => l.id === input.localityId);
    if (byId) {
      return {
        localityId: byId.id,
        canonicalName: byId.canonicalName,
        normalizedSlug: byId.normalizedSlug,
        matchMethod: 'EXPLICIT_ID',
      };
    }
  }

  const candidateSlug = normalizeLocalitySlug(input.rawName);
  if (candidateSlug) {
    for (const loc of input.localities) {
      if (loc.normalizedSlug === candidateSlug) {
        return {
          localityId: loc.id,
          canonicalName: loc.canonicalName,
          normalizedSlug: loc.normalizedSlug,
          matchMethod: 'NAME_OR_ALIAS',
        };
      }
      const aliasSlugs = [
        normalizeLocalitySlug(loc.canonicalName),
        ...loc.aliases.map((a) => normalizeLocalitySlug(a)),
      ].filter(Boolean);
      if (aliasSlugs.includes(candidateSlug)) {
        return {
          localityId: loc.id,
          canonicalName: loc.canonicalName,
          normalizedSlug: loc.normalizedSlug,
          matchMethod: 'NAME_OR_ALIAS',
        };
      }
    }
  }

  if (
    typeof input.latitude === 'number' &&
    typeof input.longitude === 'number' &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude)
  ) {
    let best: { loc: CanonicalLocalityCandidate; distM: number } | null = null;
    for (const loc of input.localities) {
      const distM = haversineDistanceMeters(
        input.latitude,
        input.longitude,
        loc.centerLatitude,
        loc.centerLongitude,
      );
      if (distM <= loc.proximityRadiusM && (!best || distM < best.distM)) {
        best = { loc, distM };
      }
    }
    if (best) {
      return {
        localityId: best.loc.id,
        canonicalName: best.loc.canonicalName,
        normalizedSlug: best.loc.normalizedSlug,
        matchMethod: 'SPATIAL_PROXIMITY',
      };
    }
  }

  if (candidateSlug) {
    const prettyName = input.rawName?.trim() || candidateSlug;
    return {
      localityId: null,
      canonicalName: prettyName.slice(0, 120),
      normalizedSlug: candidateSlug,
      matchMethod: 'DERIVED_SLUG',
    };
  }

  return {
    localityId: null,
    canonicalName: null,
    normalizedSlug: null,
    matchMethod: 'UNRESOLVED',
  };
}
