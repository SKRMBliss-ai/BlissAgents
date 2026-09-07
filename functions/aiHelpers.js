const WHITE_LABEL_APP_TYPES = ['Wellness Business', 'Coaching Institute', 'Consultant'];

const whiteLabelAppsBlock = `
The consultant also has two ready-made apps that can be rebranded (their own name/logo, customized content) for an individual coach/instructor/practitioner at low cost instead of building something from scratch:
- "Laughter Hub" — a community app for daily laughter yoga sessions and group joy practice.
- "Mind Gym" — a daily presence/mindfulness training app (subscription-style, guided daily practice).

If this business is (or is run by) an individual coach, instructor, or practitioner whose work fits either app's theme (laughter yoga, mindfulness/meditation coaching, presence/spiritual coaching, general wellness coaching), consider recommending the matching one BY NAME as the "recommendedService" instead of a generic website/chatbot fix — e.g. "White-label Mind Gym app" or "White-label Laughter Hub app". Only do this if it's a genuine fit; otherwise give the usual generic recommendation.
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
- Sound human, specific, and low-pressure — never generic or ad-like.
- Open by naming the business and something genuinely positive about it.
- Mention 1-2 of the specific gaps naturally, not as a bulleted list.
- End with a soft, low-commitment call to action (e.g. offering to share a few ideas), not a hard pitch.
- Do not invent facts you weren't given (no fake stats, no claims about their traffic, etc).
- Do not mention price, cost, or any number — the consultant hasn't settled on pricing yet, so keep it to "happy to share details" instead.
- If the service to lead with is a named app ("Mind Gym" or "Laughter Hub"), briefly frame it as "your own branded version of an app we've already built" rather than describing generic website work.

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

module.exports = { suggestGaps, draftMessage };
