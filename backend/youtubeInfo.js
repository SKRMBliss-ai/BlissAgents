// Pulls title + full description off a public YouTube watch page without
// needing the YouTube Data API (no API key / quota to manage) — just parses
// the JSON embedded in the page itself, which is public for any video anyone
// can already open in a browser.
const extractYoutubeId = (url) => {
  const patterns = [
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtube\.com\/shorts\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
};

const fetchVideoInfo = async (youtubeUrl) => {
  const videoId = extractYoutubeId(youtubeUrl);
  if (!videoId) throw new Error('Could not find a YouTube video ID in that URL');

  const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en-US' },
  });
  if (!res.ok) throw new Error(`Failed to fetch video page: ${res.status}`);
  const html = await res.text();

  const titleMatch = html.match(/"title":"((?:[^"\\]|\\.)*)"/);
  const descMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (!titleMatch) throw new Error('Could not find video title — the page format may have changed or the video is private/unavailable');

  const unescape = (s) => s
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\u0026/g, '&');

  return {
    videoId,
    title: unescape(titleMatch[1]),
    description: descMatch ? unescape(descMatch[1]) : '',
    url: `https://youtu.be/${videoId}`,
  };
};

module.exports = { fetchVideoInfo, extractYoutubeId };
