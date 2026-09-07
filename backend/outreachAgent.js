const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'data', 'prospects.json');
const EXCLUDED_PATH = path.join(__dirname, 'data', 'excludedIdentifiers.json');

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

// When a prospect is deleted, its placeId/sourceUrl goes into a permanent
// exclusion list so future discovery runs never re-add the same business —
// deleting is meant to mean "don't show me this again".
const loadExcludedIdentifiers = () => {
  try {
    if (!fs.existsSync(EXCLUDED_PATH)) return new Set();
    return new Set(JSON.parse(fs.readFileSync(EXCLUDED_PATH, 'utf8')));
  } catch (e) {
    console.error('Error loading excludedIdentifiers.json:', e);
    return new Set();
  }
};

const excludeIdentifiers = (...values) => {
  const excluded = loadExcludedIdentifiers();
  for (const v of values) if (v) excluded.add(v);
  fs.writeFileSync(EXCLUDED_PATH, JSON.stringify([...excluded], null, 2));
};

const STATUSES = ['New', 'Contacted', 'No Response', 'Interested', 'Meeting Booked', 'Client', 'Not Interested'];

const WHITE_LABEL_APP_TYPES = ['Wellness Business', 'Coaching Institute', 'Consultant', 'Laughter Yoga', 'Yoga Studio', 'Counsellor/Therapist'];

const whiteLabelAppsBlock = `
The consultant also has two ready-made apps that can be rebranded (their own name/logo, customized content) for an individual coach/instructor/practitioner at low cost instead of building something from scratch:
- "Laughter Hub" — a community app for daily laughter yoga sessions and group joy practice. ONLY recommend this if the business is specifically a laughter yoga instructor, laughter club, or laughter therapy practice (name/notes explicitly mention laughter yoga/laughter club/laughter therapy) — not general wellness or fitness.
- "Mind Gym" — a daily presence/mindfulness training app (subscription-style, guided daily practice). Recommend this for meditation/mindfulness coaches, presence/spiritual coaches, or general wellness/life coaches — NOT for laughter yoga specifically.

If this business is (or is run by) an individual coach, instructor, or practitioner whose work genuinely fits one of these two narrow categories, recommend the matching one BY NAME as the "recommendedService" instead of a generic website/chatbot fix — e.g. "White-label Mind Gym app" or "White-label Laughter Hub app". Do not recommend Laughter Hub just because the business is broadly "wellness" — it must be laughter-yoga-specific. If neither is a genuine fit, give the usual generic recommendation instead.
`;

const suggestGapsPrompt = ({ businessName, businessType, notes }) => `
You are a digital-presence auditor helping a freelance consultant (websites, AI chatbots, content, photography, social/video) identify likely opportunities for a prospective client.

Business name: ${businessName}
Business type: ${businessType}
Notes/context provided by the consultant (may be empty): ${notes || 'none'}

Based on common, realistic digital-presence gaps for this TYPE of business (you have not browsed their actual website — reason from typical patterns for this category), suggest:
1. 3-5 plausible "digitalGaps" (short phrases, e.g. "Website looks dated", "No AI enquiry chatbot", "Inconsistent Instagram posting", "No YouTube presence", "Low-quality product photography")
2. ONE "recommendedService" — the single most relevant service to lead with (e.g. "AI enquiry assistant + website refresh")
${WHITE_LABEL_APP_TYPES.includes(businessType) ? whiteLabelAppsBlock : ''}
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
- Salutation: if a real contact person name was given above (not "the owner"), open with "Hi [FirstName]," using just their first name. Otherwise skip a name-based greeting entirely and open straight with the business name/positive observation — never write a placeholder like "Hi [Owner's Name]," or "Hi [Name],", and never address a generic "Hi there," followed immediately by naming them again.
- Sound human, specific, and low-pressure — never generic or ad-like.
- Open by naming the business and something genuinely positive about it.
- Mention 1-2 of the specific gaps naturally, not as a bulleted list.
- End with a soft, low-commitment call to action (e.g. offering to share a few ideas), not a hard pitch.
- Do not invent facts you weren't given (no fake stats, no claims about their traffic, etc).
- Do not mention price, cost, or any number — the consultant hasn't settled on pricing yet, so keep it to "happy to share details" instead.
- If the service to lead with is a named app ("Mind Gym" or "Laughter Hub"), briefly frame it as "your own branded version of an app we've already built" rather than describing generic website work.

Return ONLY the message text, nothing else.
`;

// International clients read "Shruti from Bangalore" as oddly hyper-local — for
// them the sender says "India" instead. Indian clients still get "Bangalore"
// since it reads as a normal local reference. Heuristic: the prospect's
// address/notes field (from Places, or freeform for manual entries) mentioning
// "India" is the only signal we actually have — default to the international
// framing when we don't know either way, since misfiring the other direction
// ("Bangalore" to a Dublin client) is the concrete mistake we're fixing.
const computeSenderLocation = (notes) => (notes || '').toLowerCase().includes('india') ? 'Bangalore' : 'India';

const buildSenderPersona = (location) => `
Sender: Shruti, based in ${location}, 20+ years of experience in software, digital products and technology. Recently started an independent digital services business helping small businesses and individual practitioners with:
- Website & web app development
- AI chatbots & AI enhancements
- Professional photos, videos & social media content
- YouTube & digital content
- E-books, brochures & creative materials
- Customized songs/content for a brand
`;

// Sign-off + portfolio links are appended in code after the AI response rather
// than generated by the model — guarantees consistent, correct formatting and
// the right links every time instead of hoping the model reproduces them.
const emailFooter = (location) =>
  `\n\nWarm regards,\n**Shruti | ${location}**\n\nMy work:\nSKRMBliss.ai: https://www.skrmblissai.in\nhttps://www.skrmblissai.in/twinsouls`;

const draftEmailPrompt = ({ businessName, businessType, contactPerson, digitalGaps, recommendedService, location }) => `
You write personalized cold outreach emails on behalf of the sender described below, to small businesses and individual practitioners about digital services.

${buildSenderPersona(location)}

Write an email for:
Business: ${businessName} (${businessType})
Contact person: ${contactPerson || 'the owner'}
Likely digital gaps noticed: ${(digitalGaps || []).join(', ') || 'general online presence'}
Service to lead with: ${recommendedService || 'digital presence improvements'}

Follow this exact structure and tone (based on a real template the sender uses):
0. Salutation: if a real contact person name was given above (not "the owner"), open with "Hi [FirstName]," using just their first name. Otherwise open with "Hi there," — never "Dear Owner of [Business]" or any other mail-merge-sounding salutation.
1. Open by naming the business and something genuinely positive/specific about it (infer something plausible from the business type — do not invent fake stats or claims).
2. A short "I'm Shruti from ${location}, with 20+ years of experience..." intro paragraph, adapted naturally to this recipient.
3. A bullet list of the sender's services (from the persona above) — trim it to 3-5 bullets most relevant to this business's gaps, don't always list all six.
4. A one-line statement of the goal in bold, e.g. "**help you showcase your property better, attract more relevant guests, improve enquiries and build a stronger online presence.**" — adapt the specifics to this business, not always "property/guests".
5. A soft, low-pressure line offering to share a few specific ideas for THIS business by name — no pressure, just a conversation. This is the LAST line of your response — do NOT add a sign-off, "Warm regards", or any portfolio/work links after it; those are added automatically afterward.
- If the service to lead with is a named app ("Mind Gym" or "Laughter Hub"), fold that into the pitch naturally as "your own branded version of an app we've already built" instead of generic website language.
- Do not mention price, cost, or any number.
- Keep it warm and human, not corporate. One emoji max (e.g. 😊), only if it fits naturally.
- Use markdown: **bold** for emphasis only. Do not use [text](url) links — there are none to include in your part of the email.

Return ONLY a JSON object: { "subject": "...", "body": "..." } where body is the email UP TO AND INCLUDING step 5 only, in markdown as described above (no need to repeat the subject inside the body).
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

const draftEmail = async (openai, { businessName, businessType, contactPerson, digitalGaps, recommendedService, notes }) => {
  const location = computeSenderLocation(notes);
  const completion = await openai.chat.completions.create({
    model: 'gemini-2.5-flash',
    messages: [
      { role: 'system', content: 'You write warm, personalized cold outreach emails. Return only valid JSON, no markdown fences around the JSON itself (markdown IS allowed inside the body field).' },
      { role: 'user', content: draftEmailPrompt({ businessName, businessType, contactPerson, digitalGaps, recommendedService, location }) },
    ],
    temperature: 0.8,
  });
  const result = extractJson(completion.choices[0].message.content);
  return { ...result, body: result.body + emailFooter(location) };
};

module.exports = {
  loadProspects,
  saveProspects,
  loadExcludedIdentifiers,
  excludeIdentifiers,
  suggestGaps,
  draftMessage,
  draftEmail,
  STATUSES,
};
