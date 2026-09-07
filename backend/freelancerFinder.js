const SEARCH_URL = 'https://www.googleapis.com/customsearch/v1';

// Query templates per freelancer category. Each searches Google's public index
// (not the platform directly) for LinkedIn profiles and, where useful, a second
// platform-specific pass (Behance for design, personal blogs for writers).
const QUERY_TEMPLATES = {
  'Artist/Illustrator': (city) => [`"freelance illustrator" OR "freelance artist" ${city} site:linkedin.com/in`],
  'Graphic Designer': (city) => [
    `"freelance graphic designer" ${city} site:linkedin.com/in`,
    `"graphic designer" ${city} site:behance.net`,
  ],
  'Writer/Copywriter': (city) => [`"freelance writer" OR "freelance copywriter" ${city} site:linkedin.com/in`],
  'Home-based Physiotherapist': (city) => [`"home visit physiotherapist" OR "mobile physiotherapist" ${city} site:linkedin.com/in`],
  'Mobile Dentist': (city) => [`"home visit dentist" OR "mobile dentist" ${city} site:linkedin.com/in`],
};

const FREELANCER_TYPES = Object.keys(QUERY_TEMPLATES);

const cleanTitle = (title) => title.replace(/\s*[-|]\s*LinkedIn.*$/i, '').trim();

const searchOnce = async ({ apiKey, cx, query, count }) => {
  const url = `${SEARCH_URL}?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${Math.min(count, 10)}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    throw new Error(`Google Custom Search error: ${data.error.status || ''} ${data.error.message || ''}`.trim());
  }

  return data.items || [];
};

// Returns prospects sourced from web search rather than Places — these have no
// phone/website field filled in from structured data, so `needsManualContact`
// is set to flag that the user still has to find/paste an email themselves.
const findFreelancers = async ({ apiKey, cx, city, freelancerType, count }) => {
  const queries = (QUERY_TEMPLATES[freelancerType] || [])(city);
  const seen = new Set();
  const results = [];

  for (const query of queries) {
    if (results.length >= count) break;
    const items = await searchOnce({ apiKey, cx, query, count: count - results.length });
    for (const item of items) {
      if (seen.has(item.link)) continue;
      seen.add(item.link);
      results.push({
        businessName: cleanTitle(item.title),
        businessType: freelancerType,
        website: item.link,
        instagram: '',
        contactPerson: '',
        email: '',
        whatsapp: '',
        notes: item.snippet || '',
        needsManualContact: true,
        sourceUrl: item.link,
      });
      if (results.length >= count) break;
    }
  }

  return results;
};

// Note: each additional city multiplies Custom Search queries used (100/day free
// tier), so this defaults to a single broad "India" search rather than looping
// every metro like prospectFinder does — freelancers usually work remotely
// anyway, so a narrow city filter is less meaningful for this source.
const runFreelancerDiscovery = async ({ apiKey, cx, existingProspects, cities, freelancerTypes, countPerType }) => {
  if (!apiKey || !cx) throw new Error('GOOGLE_CUSTOM_SEARCH_API_KEY / GOOGLE_CUSTOM_SEARCH_CX secrets are not set');

  const existingUrls = new Set(existingProspects.map(p => p.sourceUrl).filter(Boolean));
  const found = [];
  const cityList = cities?.length ? cities : ['Dubai'];

  for (const city of cityList) {
    for (const freelancerType of freelancerTypes) {
      const batch = await findFreelancers({ apiKey, cx, city, freelancerType, count: countPerType });
      for (const p of batch) {
        if (existingUrls.has(p.sourceUrl)) continue;
        found.push(p);
        existingUrls.add(p.sourceUrl);
      }
    }
  }

  return found;
};

module.exports = { findFreelancers, runFreelancerDiscovery, FREELANCER_TYPES };
