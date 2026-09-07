// Looks for a contact email on a business's own public website — their own
// site, not a third-party platform, so this carries none of the ToS/ban risk
// that scraping Instagram/LinkedIn/WhatsApp would.

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Known noise: tracking pixels, placeholder/example addresses, image CDNs that
// happen to embed something email-shaped in a filename or asset hash.
const NOISE_DOMAINS = [
  'wixpress.com', 'sentry.io', 'example.com', 'domain.com', 'yourdomain.com',
  'godaddy.com', 'schema.org', 'w3.org', 'gstatic.com', 'googleapis.com',
];

const isNoiseEmail = (email) => {
  const lower = email.toLowerCase();
  if (NOISE_DOMAINS.some(d => lower.endsWith('@' + d) || lower.includes('.' + d))) return true;
  if (/\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i.test(lower)) return true;
  if (/^(info|noreply|no-reply|donotreply)@(wix|squarespace|shopify)/i.test(lower)) return true;
  return false;
};

const extractEmails = (html) => {
  const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)].map(m => m[1]);
  const textMatches = html.match(EMAIL_REGEX) || [];
  const all = [...mailtoMatches, ...textMatches].filter(e => !isNoiseEmail(e));
  return [...new Set(all.map(e => e.toLowerCase()))];
};

const fetchWithTimeout = async (url, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlissAgentsOutreach/1.0)' },
    });
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
};

// Tries the homepage first, then a couple of common contact-page paths if
// nothing turns up — most sites that publish an email put it on one of these.
const scrapeEmailFromWebsite = async (websiteUrl) => {
  if (!websiteUrl) return null;
  let base;
  try {
    base = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
  } catch (e) {
    return null;
  }

  const candidatePaths = ['', '/contact', '/contact-us', '/about', '/about-us'];
  for (const path of candidatePaths) {
    try {
      const url = new URL(path, base).toString();
      const html = await fetchWithTimeout(url);
      const emails = extractEmails(html);
      if (emails.length > 0) return emails[0];
    } catch (e) {
      // Site unreachable, timed out, or path doesn't exist — try the next one.
      continue;
    }
  }
  return null;
};

module.exports = { scrapeEmailFromWebsite, extractEmails };
