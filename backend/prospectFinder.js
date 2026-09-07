const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, 'data', 'outreachSettings.json');
const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.websiteUri',
  'places.internationalPhoneNumber',
  'places.priceLevel',
  'places.userRatingCount',
  'places.rating',
].join(',');

// Tier 1: highest priority (high paying capacity, less saturated digital services market).
// Tier 2: strong opportunities, less saturated. Tier 3: emerging markets worth testing.
const DEFAULT_CITIES = [
  'Abu Dhabi', 'Riyadh', 'Sydney', 'Toronto', 'Singapore', 'Dublin', 'Amsterdam',
  'Manila', 'Ho Chi Minh City', 'Auckland', 'Vienna', 'Brussels', 'Lisbon',
  'Stockholm', 'Copenhagen', 'Oslo', 'Helsinki', 'Zurich',
  'Mexico City', 'Cairo', 'Nairobi', 'Lagos', 'Warsaw', 'Prague', 'Bucharest', 'Budapest', 'Tallinn',
];
const TIER_1_CITIES = ['Abu Dhabi', 'Riyadh', 'Sydney', 'Toronto', 'Singapore', 'Dublin', 'Amsterdam'];

const loadSettings = () => {
  try {
    const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    // Migrate old single-city settings to the cities array.
    if (settings.city && !settings.cities) {
      settings.cities = [settings.city];
      delete settings.city;
    }
    return settings;
  } catch (e) {
    return { cities: DEFAULT_CITIES, businessTypes: [], countPerType: 3, dailyRunHour: 8, lastRunDate: null };
  }
};

const saveSettings = (settings) => {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
};

// Scores a place for "good prospect" fit: no website (likely needs digital help),
// a moderate review count (established enough to have money, not yet a saturated
// giant that already has marketing sorted), and a decent price level (paying capacity).
// Higher score = better prospect. Businesses with a website already lose points but
// aren't excluded outright (they might still need a chatbot, content, or a refresh).
const scoreProspect = (place) => {
  let score = 0;
  if (!place.websiteUri) score += 3;
  const ratingCount = place.userRatingCount || 0;
  if (ratingCount >= 5 && ratingCount <= 150) score += 2;
  else if (ratingCount > 150 && ratingCount <= 400) score += 1;
  if (typeof place.priceLevel === 'string') {
    const level = { PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2, PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 3 }[place.priceLevel] || 0;
    score += level;
  }
  return score;
};

const findBusinesses = async ({ apiKey, city, businessType, count }) => {
  const res = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({ textQuery: `${businessType} in ${city}` }),
  });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Google Places error: ${data.error.status || ''} ${data.error.message || ''}`.trim());
  }

  const places = data.places || [];
  const ranked = places
    .map(place => ({ place, score: scoreProspect(place) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);

  return ranked.map(({ place, score }) => ({
    businessName: place.displayName?.text || 'Unknown',
    businessType,
    website: place.websiteUri || '',
    instagram: '',
    contactPerson: '',
    email: '',
    whatsapp: place.internationalPhoneNumber || '',
    notes: [
      place.formattedAddress,
      place.rating ? `Rating: ${place.rating} (${place.userRatingCount || 0} reviews)` : null,
      `Prospect fit score: ${score}/8 (higher = no website / right-sized / better paying capacity)`,
    ].filter(Boolean).join(' · '),
    placeId: place.id,
  }));
};

// Runs discovery across all configured business types for the configured city.
// Skips any place_id already present among existing prospects (dedupe).
const runDailyDiscovery = async ({ apiKey, existingProspects, settings, excludedIdentifiers }) => {
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not set in backend/.env');

  const existingPlaceIds = new Set(existingProspects.map(p => p.placeId).filter(Boolean));
  const excluded = excludedIdentifiers || new Set();
  const found = [];
  const cities = settings.cities?.length ? settings.cities : DEFAULT_CITIES;

  for (const city of cities) {
    for (const businessType of settings.businessTypes) {
      const batch = await findBusinesses({
        apiKey, city, businessType, count: settings.countPerType,
      });
      for (const p of batch) {
        if (p.placeId && (existingPlaceIds.has(p.placeId) || excluded.has(p.placeId))) continue;
        found.push(p);
        if (p.placeId) existingPlaceIds.add(p.placeId);
      }
    }
  }

  return found;
};

module.exports = { loadSettings, saveSettings, findBusinesses, runDailyDiscovery, scoreProspect };
