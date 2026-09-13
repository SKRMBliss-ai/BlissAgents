// Fetches a prospect's own public website and reduces it to plain text so the
// AI can ground outreach in what the business actually says about itself,
// instead of reasoning purely from businessType patterns.

const fetchWithTimeout = async (url, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BlissAgentsOutreach/1.0)' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const htmlToText = (html) => {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .join('\n');
};

const MAX_CHARS_TOTAL = 6000;

// Homepage first (always most informative), then about/services pages if
// there's still budget — most small-business sites put the substance there.
const researchWebsite = async (websiteUrl) => {
  if (!websiteUrl) return null;
  let base;
  try {
    base = new URL(websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`);
  } catch (e) {
    return null;
  }

  const candidatePaths = ['', '/about', '/about-us', '/services'];
  const pagesFetched = [];
  let combinedText = '';

  for (const p of candidatePaths) {
    if (combinedText.length >= MAX_CHARS_TOTAL) break;
    let url;
    try {
      url = new URL(p, base).toString();
    } catch (e) {
      continue;
    }
    const html = await fetchWithTimeout(url);
    if (!html) continue;
    const text = htmlToText(html);
    if (text.length < 40) continue;
    combinedText += `\n\n--- ${url} ---\n${text}`;
    pagesFetched.push(url);
  }

  if (!pagesFetched.length) return null;
  return {
    text: combinedText.trim().slice(0, MAX_CHARS_TOTAL),
    pagesFetched,
  };
};

module.exports = { researchWebsite };
