const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data', 'prospects.json');

const loadProspects = () => {
  try {
    if (!fs.existsSync(DATA_PATH)) return [];
    return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  } catch (e) {
    console.error('Error loading prospects.json:', e);
    return [];
  }
};

const saveProspects = (prospects) => {
  fs.writeFileSync(DATA_PATH, JSON.stringify(prospects, null, 2));
};

const STATUSES = ['New', 'Contacted', 'No Response', 'Interested', 'Meeting Booked', 'Client', 'Not Interested'];

const suggestGapsPrompt = ({ businessName, businessType, notes }) => `
You are a digital-presence auditor helping a freelance consultant (websites, AI chatbots, content, photography, social/video) identify likely opportunities for a prospective client.

Business name: ${businessName}
Business type: ${businessType}
Notes/context provided by the consultant (may be empty): ${notes || 'none'}

Based on common, realistic digital-presence gaps for this TYPE of business (you have not browsed their actual website — reason from typical patterns for this category), suggest:
1. 3-5 plausible "digitalGaps" (short phrases, e.g. "Website looks dated", "No AI enquiry chatbot", "Inconsistent Instagram posting", "No YouTube presence", "Low-quality product photography")
2. ONE "recommendedService" — the single most relevant service to lead with (e.g. "AI enquiry assistant + website refresh")

Return ONLY a JSON object: { "digitalGaps": ["...", "..."], "recommendedService": "..." }
`;

const draftMessagePrompt = ({ businessName, businessType, contactPerson, digitalGaps, recommendedService }) => `
You write short, warm, non-salesy outreach messages for a freelance digital consultant who helps small businesses with websites, AI chatbots, content, photography, and social/video.

Write a personalized outreach message (WhatsApp/email style, 60-100 words, plain text, no markdown, no subject line) for:

Business: ${businessName} (${businessType})
Contact person: ${contactPerson || 'the owner'}
Likely digital gaps noticed: ${(digitalGaps || []).join(', ') || 'general online presence'}
Service to softly lead with: ${recommendedService || 'digital presence improvements'}

Rules:
- Sound human, specific, and low-pressure — never generic or ad-like.
- Open by naming the business and something genuinely positive about it.
- Mention 1-2 of the specific gaps naturally, not as a bulleted list.
- End with a soft, low-commitment call to action (e.g. offering to share a few ideas), not a hard pitch.
- Do not invent facts you weren't given (no fake stats, no claims about their traffic, etc).

Return ONLY the message text, nothing else.
`;

const extractJson = (text) => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in AI response');
  return JSON.parse(match[0]);
};

const suggestGaps = async (openai, { businessName, businessType, notes }) => {
  const completion = await openai.chat.completions.create({
    model: 'gemini-2.5-flash',
    messages: [
      { role: 'system', content: 'You are a precise digital-marketing auditor. Return only valid JSON, no markdown fences.' },
      { role: 'user', content: suggestGapsPrompt({ businessName, businessType, notes }) },
    ],
    temperature: 0.6,
  });
  return extractJson(completion.choices[0].message.content);
};

const draftMessage = async (openai, { businessName, businessType, contactPerson, digitalGaps, recommendedService }) => {
  const completion = await openai.chat.completions.create({
    model: 'gemini-2.5-flash',
    messages: [
      { role: 'system', content: 'You write concise, human, non-salesy outreach messages. Return only the message text.' },
      { role: 'user', content: draftMessagePrompt({ businessName, businessType, contactPerson, digitalGaps, recommendedService }) },
    ],
    temperature: 0.8,
  });
  return completion.choices[0].message.content.trim();
};

module.exports = {
  loadProspects,
  saveProspects,
  suggestGaps,
  draftMessage,
  STATUSES,
};
