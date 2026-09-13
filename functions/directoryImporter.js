// Imports therapist listings from therapyin.london via their public sitemap —
// NOT the /results?* search-listing endpoint, which their robots.txt explicitly
// disallows. The sitemap and individual /results/profile/ pages are both
// allowed for crawling; this only ever reads from those.
const SITEMAP_URL = 'https://www.therapyin.london/sitemap-profiles.xml';

const parseSitemapUrls = (xml) => {
  const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
  return [...matches].map(m => m[1]);
};

// Profile pages are a client-rendered SPA — only the <title> tag ("Name |
// Therapy in London") is present in the raw HTML without executing JS, so
// that's all we can reliably extract server-side. No contact info is exposed
// this way, so these are added as needsManualContact — the user opens the
// profile link themselves to find a way to reach out.
const extractName = (html) => {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  if (!m) return null;
  return m[1].replace(/\s*\|\s*Therapy in London\s*$/i, '').trim();
};

const importTherapyInLondon = async ({ existingProspects, excludedIdentifiers, count = 20 }) => {
  const sitemapRes = await fetch(SITEMAP_URL);
  if (!sitemapRes.ok) throw new Error(`Failed to fetch sitemap: ${sitemapRes.status}`);
  const xml = await sitemapRes.text();
  const allUrls = parseSitemapUrls(xml);

  const existingUrls = new Set(existingProspects.map(p => p.sourceUrl).filter(Boolean));
  const excluded = excludedIdentifiers || new Set();
  const candidates = allUrls.filter(url => !existingUrls.has(url) && !excluded.has(url));

  const found = [];
  for (const url of candidates) {
    if (found.length >= count) break;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const html = await res.text();
      const name = extractName(html);
      if (!name) continue;
      found.push({
        businessName: name,
        businessType: 'Therapist/Counsellor',
        website: url,
        instagram: '',
        contactPerson: name,
        email: '',
        whatsapp: '',
        notes: 'Sourced from therapyin.london public directory profile.',
        needsManualContact: true,
        sourceUrl: url,
      });
    } catch (e) {
      console.error(`[directoryImporter] Failed to fetch ${url}:`, e.message);
    }
  }

  return found;
};

module.exports = { importTherapyInLondon };
