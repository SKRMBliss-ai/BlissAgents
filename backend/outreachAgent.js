const fs = require('fs');
const path = require('path');
const { researchWebsite } = require('./websiteResearch');

// Matches the model choice made when constructing the OpenAI client in
// server.js — Groq (free tier, high rate limits) when GROQ_API_KEY is set,
// otherwise Gemini.
const AI_MODEL = process.env.GROQ_API_KEY ? 'openai/gpt-oss-120b' : 'gemini-2.5-flash';

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

// When real research text exists (scraped from the prospect's own site), it
// takes priority over generic category-pattern reasoning — ground gaps/ideas
// in what the business actually says about itself wherever possible.
const researchBlock = (research) => research
  ? `\nActual research notes gathered from this business's own website (ground your answer in these specifics wherever relevant, instead of generic patterns for the category):\n${research}\n`
  : '';

// A distinct, larger opportunity from the ready-made-rebrand block above:
// not "we have an app ready", but "we could build a custom, branded
// experience for YOUR audience" — using either of two existing products as
// the methodology/starting point: MindGym (mind-training / emotional
// awareness) or HabitQuest (habit-tracking / goal and discipline building).
// Relevant to any business with an audience (students, clients, employees,
// community) that could plausibly benefit, not just individual wellness
// practitioners. Scored 0-4 so the email writer knows how strongly (if at
// all) to lean on it, and whether it's strong enough to lead the email.
const mindGymAppScoringGuide = `
Also assess "CUSTOM BRANDED APP POTENTIAL" — whether this business has an audience (students, clients, employees, members, community, followers) who could plausibly benefit from a customized, BRANDED digital app built specifically for them rather than sending them to a generic third-party app. Three existing products can be customized/rebranded as the starting point for this, and you should pick whichever is the better fit (or note if none fits):
- MindGym — a structured mind-training / emotional-awareness practice. Fits education, corporate/HR/employee-wellbeing, wellness/yoga/meditation/spiritual, coaches/consultants, children's/parenting organizations, and membership/community businesses generally.
- HabitQuest — a habit-tracking / goal and discipline-building app (https://www.skrmblissai.in/habitquest2026). Fits businesses whose audience is trying to build consistency or discipline: coaches (fitness, life, academic), students/exam-prep organizations, productivity/personal-development businesses, corporate performance/wellness programs, and habit-formation-adjacent communities.
- Simply Piano — a digital keyboard/piano-learning experience for children (https://simplypiano.web.app/). Fits music schools, piano/keyboard teachers, children's music education, after-school/enrichment programs, and educational franchises with a children's-music-adjacent audience.

Score 0-4 for whichever product (if any) fits best:
0 = no meaningful audience/need.
1 = weak — some possible connection but no clear reason.
2 = moderate — relevant audience and a plausible use case.
3 = strong — clear audience + strong relevance + a real digital opportunity.
4 = strategic — large/engaged audience + strong need + a clear opportunity for a branded digital product; this can become the primary outreach angle.

Separately, assess "FEELINGS COURSE AFFILIATE FIT" — not whether the recipient personally needs the Feelings & Emotion Course, but whether they have an actual audience (students, parents, clients, employees, followers, community, subscribers) who could genuinely benefit from it, making the recipient a plausible referral/affiliate partner (they recommend it to their audience; the course remains our product; they'd earn a share of subscriptions referred through them). Relevant categories: education, parenting, wellness, coaching, corporate/HR, and content creators (YouTubers, Instagram, podcasters, newsletter writers) with an engaged, trusting audience.
Score 0-4:
0 = no meaningful audience connection.
1 = weak — some thematic connection but audience fit unclear.
2 = possible — relevant audience but opportunity uncertain.
3 = strong — clear audience + strong relevance; worth considering as a secondary mention.
4 = strategic — highly relevant, trusted, distribution-capable audience.
`;

const suggestGapsPrompt = ({ businessName, businessType, notes, research }) => `
You are a digital-presence auditor helping a freelance consultant (websites, AI chatbots, content, photography, social/video) identify likely opportunities for a prospective client.

Business name: ${businessName}
Business type: ${businessType}
Notes/context provided by the consultant (may be empty): ${notes || 'none'}
${researchBlock(research)}
${research ? 'Prefer gaps grounded in the research notes above. Fall back to typical patterns for this category only where the research is silent.' : 'You have not browsed their actual website — reason from typical patterns for this category.'} Suggest:
1. 3-5 plausible "digitalGaps" (short phrases, e.g. "Website looks dated", "No AI enquiry chatbot", "Inconsistent Instagram posting", "No YouTube presence", "Low-quality product photography")
2. ONE "recommendedService" — the single most relevant service to lead with (e.g. "AI enquiry assistant + website refresh")
${WHITE_LABEL_APP_TYPES.includes(businessType) ? whiteLabelAppsBlock : ''}
${mindGymAppScoringGuide}
Return ONLY a JSON object: { "digitalGaps": ["...", "..."], "recommendedService": "...", "mindGymAppPotential": 0-4, "mindGymAppProduct": "MindGym" | "HabitQuest" | "SimplyPiano" | null, "mindGymAppReason": "...", "feelingsCourseAffiliateFit": 0-4, "feelingsCourseAffiliateReason": "..." }
`;

const LOCAL_LANGUAGE_RULES = `
CRITICAL LOCAL LANGUAGE MANDATE (STRICT COMPLIANCE REQUIRED):
1. Identify the prospect's native local language based on their location, city, country, website domain, or notes/research (e.g., Vietnam / Saigon / Hanoi -> Vietnamese, France / Paris -> French, Germany / Berlin -> German, Spain / Madrid / Barcelona -> Spanish, Japan / Tokyo -> Japanese, Brazil -> Portuguese, Italy -> Italian, Netherlands -> Dutch, Mexico -> Spanish, etc.).
2. EXCEPTION FOR INDIA: If the prospect is located in India or an Indian city (Delhi, Mumbai, Bangalore, Bengaluru, Hyderabad, Chennai, Kolkata, Pune, etc., or notes mentioning India): ALWAYS write the entire email / message in clear, natural ENGLISH (do NOT write in Hindi or regional Indian languages).
3. NATIVE ENGLISH REGIONS: If the prospect is in the UK, US, Canada, Australia, New Zealand, Ireland, or Singapore, write in clear, natural ENGLISH.
4. ALL OTHER INTERNATIONAL COUNTRIES (Vietnam, France, Germany, Spain, Japan, Brazil, etc.):
   ALWAYS WRITE THE ENTIRE DRAFT (Subject Line and Email/Message Body) IN THE PROSPECT'S LOCAL LANGUAGE!
   Translate and naturally adapt all introduction elements ("Shruti & Smriti - twin sisters", technologists, mind training), pitches, observations, and warm closings into fluent, culturally natural local language.
`;

const IDENTITY = `
You are writing on behalf of Shruti & Smriti — twin sisters working at an unusual intersection of technology and spirituality. They are independent digital creators and technologists who personally build digital products, websites, apps, AI solutions and automation, and help businesses and people bring their ideas to life, simplify their operations and grow. Alongside that, Smriti works in spirituality, emotional understanding and mind training — she creates practical, structured programs that help people understand their feelings and emotions, understand how their minds work, respond to emotions more consciously, and build better mental habits. They are not a large corporate agency, not an outsourcing firm, not a sales team — there are two of them, personally involved in the work, and they value honesty, trust, transparency and personal connection. They don't approach a business asking "what can we sell them" — they first want to understand what the business is building, what it needs, and whether there's something genuine to contribute.

This is the whole identity, not just the technology half of it — never compress who they are down to only "independent technologists" or "digital product builders". The unusual combination (technology + human/emotional understanding) is a real, standing part of who they are and belongs, briefly, in every cold email's introduction — not just the specific product links, which stay conditional on genuine fit (see below).

The central thread connecting both halves of their work: they're trying to bring technology and spirituality together in a meaningful way — using their technology skills to help people and businesses, while also helping people understand themselves, their emotions and their minds better, through independent, direct work and meaningful partnerships rather than transactional selling. Never frame outreach around becoming financially independent, building a business, or growing their own client base — that's their personal journey, never the message to a recipient.

The recipient should finish the email feeling: "I know who these two are, what they believe in, what they can build, and why they specifically reached out to me" — never "another technology company wants to sell me something", and never "someone is trying to sell me a spiritual course". Do not state any of this framing literally (e.g. never write "we don't want to extract money from you") — it should come through in the warmth, honesty and non-pushy nature of the writing itself. Keep the spirituality side grounded and factual, never oversold — avoid claims like "we transform lives", "we heal people", or "we revolutionize consciousness".

Write as "we"/"us" throughout — never "I"/"me". They present themselves together, always.

${LOCAL_LANGUAGE_RULES}

Hard rules:
- ONE primary idea per message — not a list, not multiple angles stacked together. Pick the single most relevant one and commit to it.
- Ground everything in what's actually known (business name, type, and any context given below) reasoned honestly from realistic patterns for that kind of business — never invent specifics (claims about their website, customers, revenue, tools, achievements, or problems) that aren't supported by what you were given. Use hedging language for anything inferred: "we wondered whether...", "there may be...", "one thing that came to mind...", "if this is something you're exploring..." — never state an inferred gap as settled fact.
- Never claim the business has a problem, is outdated, or is losing customers unless that's explicitly given as context — reason in terms of opportunity, not deficiency.
- Do not open with a compliment or praise ("I love what you do", "impressive work") — it reads as buttering someone up. State something specific and plain instead, or ask a genuine question.
- Ban these words/phrases — dead giveaways of AI/marketing copy: "leverage", "synergy", "innovative solutions", "cutting-edge", "revolutionary", "transformative", "holistic", "empower", "ecosystem", "digital presence" (as a phrase), "elevate", "unlock", "seamless", "game-changer", "take it to the next level", "stand out", "thrilled", "excited to", "reach out".
- Ban casual, immature, or diary-entry phrases in the introduction — they sound unpolished and undermine professional confidence. Banned examples: "split our time", "split time", "split my time", "who spend our days", "weaving together", "a curiosity about the mind", "on a mission", "rooted in", "driven by a passion", "our hearts are in", "we live at the intersection". The introduction must sound like two confident, mature professionals describing themselves in articulate, warm language — prefer phrasing like "whose work spans both building digital tools and...", "who combine building digital platforms with...", "who work across software design and...". Never use immature expressions like "split our time".
- Never mention price, cost, or any number.
- No exclamation marks unless it's genuinely how a casual, warm sentence would read — default to none.
- No markdown formatting — plain text sentences and paragraph breaks only, nothing bold, no bullet points, no headers.
- Closing: never pushy or salesy ("book a demo", "schedule a call", "let's close a deal"). Prefer something like "would you be open to a short conversation?" or "we'd love to understand what you're building and see whether there might be a way we could help" or "even if there's nothing immediate, we'd simply enjoy connecting." The implicit message throughout should be: if we can genuinely help, we'd love to — if we're not the right fit, that's okay too. Never say that explicitly, just let it come through in the tone.
`;

// Only linked when genuinely relevant — never dumped into every message.
// Relevance is judged not just against the recipient personally but against
// who THEY serve (their clients, students, employees, families, audience) —
// Shruti & Smriti build technology AND work in human/emotional development,
// so the fit can come from either side of that. Still: mention at most one,
// and only when it would be genuinely useful, never to "cover all bases".
const RESOURCE_LINKS = `
- MindGym (structured mind-training practice for personal growth, emotional resilience, self-awareness, daily mental habits): https://www.skrmblissai.in/mindgym — relevant where the recipient or the people they serve would benefit from mind training: coaches, wellness/spiritual practitioners, therapists, leaders, or anyone doing personal-development-adjacent work; also employee/student wellbeing contexts.
- Feelings & Emotion Course (structured course on understanding feelings, emotions, and responding rather than reacting): https://www.skrmblissai.in/feelingsandemotioncourse — relevant for therapists, counsellors, coaches, educators, schools, HR/employee-wellbeing programs, community or women's groups, or any organization whose work is fundamentally about people.
- Tiny Kids Transformations (live 3-day weekend Zoom sessions helping children understand their feelings, emotions, and thoughts): https://www.skrmblissai.in/tiny-kids-transformations — relevant for schools, tuition/coaching centers, parenting communities, children's organizations, family businesses, or anyone whose audience includes children or parents.
- Soulful Intelligence Studio (YouTube — Smriti's free content on feelings, emotions, thoughts, and self-awareness): https://www.youtube.com/@SoulfulIntelligenceStudio?sub_confirmation=1 — a low-commitment, free way for anyone touched by presence/mindfulness/inner-growth themes to get to know Smriti's work; a safe default mention when a specific course doesn't quite fit but the theme still resonates.
`;

// Cross-sell reasoning framework — thought through silently, never included
// verbatim in the output. Shruti & Smriti's work spans technology AND human
// development, and the recipient isn't only a potential buyer of the primary
// tech idea — they can be a partner, referral source, or audience bridge for
// the human-development side too.
const crossSellTest = `
Think through this in three levels before writing (do not print these levels in the output — they're for your own reasoning):

LEVEL 1 — Primary opportunity: what could we do for THEIR business (website, app, AI assistant, automation, digital product, online booking, learning platform, etc.)? This is always the main reason for writing.

LEVEL 2 — Audience opportunity: could one of the resources above genuinely help the people THEY serve — their clients, students, community, employees, parents, or audience — even if not the recipient personally? This is the most common form of a good cross-sell (e.g. a coaching center's students, a wellness practitioner's clients, a school's parents).

LEVEL 3 — Personal interest: failing Level 2, might the recipient themselves personally find Smriti's YouTube channel a low-pressure, free way to get a feel for this side of the work? Only reach for this if Level 2 doesn't apply and there's still a plausible personal fit.

The recipient could also be a partner rather than only a customer — someone who might introduce a resource (like the kids' program or MindGym) to their own community, not just consume it themselves. Consider that framing when it fits naturally (e.g. a school introducing the kids' program to parents, a wellness practitioner recommending MindGym to their clients).

Decision rule: ask "is there a genuine, specific reason this applies to THIS recipient?" — not "which of our four things could I mention?". If no clear reason exists at any level, mention none of them; silence is the correct default, not an oversight. Never combine more than one resource in the same email unless there's an unusually strong reason. Never list multiple resources together like a catalogue ("we also offer X, Y, Z and our YouTube channel") — that reads as a product dump, which is explicitly wrong.

If YouTube is the one that fits, invite it as a genuine, low-pressure way to get a feel for the work — never as a bare subscription request ("please subscribe", "don't forget to subscribe", "subscribe now"). E.g. "if this resonates, Smriti also shares some of this thinking on our YouTube channel — you're welcome to take a look" reads right; a bare call to subscribe does not.

Whatever is chosen, it must come AFTER the primary digital idea and must not overshadow it — the recipient should finish the email clear on why we wrote, what we could help with, and only secondarily (if relevant) what else we do.
`;

const draftMessagePrompt = ({ businessName, businessType, contactPerson, digitalGaps, recommendedService }) => `
${IDENTITY}

Write a short WhatsApp/text-style message (plain text, no subject line, 30-70 words) for:

Business: ${businessName} (${businessType})
Contact person: ${contactPerson || 'the owner'}
Context that MIGHT be relevant (use at most one, only if it fits naturally): ${(digitalGaps || []).join(', ') || 'none'}
A possible angle if it fits naturally: ${recommendedService || 'none'}

Salutation: if a real contact person name was given above (not "the owner"), open with "Hi [FirstName]," using just their first name. Otherwise skip a name-based greeting and open straight into the message — never write a placeholder like "Hi [Owner's Name],".

Return ONLY the message text, nothing else.
`;

const buildSenderPersona = () => IDENTITY;

// Sign-off is appended in code after the AI response rather than generated by
// the model — guarantees consistent formatting every time. No location suffix
// (the new identity is "twin sisters", not geography), and no links appended
// automatically — a relevant link, if any, is chosen by the AI within the body
// itself per the "only link when genuinely relevant" rule above.
const emailFooter = () => `\n\nWarm regards,\nShruti & Smriti`;

// Guidance for the "we could build YOU a custom, branded app" opportunity —
// a strategic capability (audience + our existing product foundation + our
// tech = a new product under THEIR brand), not a generic cross-sell.
// mindGymAppPotential/mindGymAppProduct come from suggestGaps' 0-4 rubric.
const PRODUCT_LINES = {
  HabitQuest: 'HabitQuest — a habit-tracking / goal and discipline-building app (https://www.skrmblissai.in/habitquest2026)',
  SimplyPiano: 'Simply Piano — a digital keyboard/piano-learning experience for children (https://simplypiano.web.app/)',
  MindGym: 'MindGym — a structured mind-training / emotional-awareness practice',
};

const mindGymAppBlock = (potential, reason, product) => {
  if (potential === undefined || potential === null) return '';
  if (potential <= 1 || !product) return `\nCustom branded-app potential was scored ${potential}/4 (${reason || 'weak/no fit'}) — do not mention the branded app idea.`;
  const productLine = PRODUCT_LINES[product] || PRODUCT_LINES.MindGym;
  const strength = potential >= 3
    ? `This is strong enough (${potential}/4: ${reason || ''}) that it can become the PRIMARY angle of the email if it makes for a more compelling story than the generic digital-presence idea — lead with curiosity about their audience/community rather than opening with "we build websites and apps".`
    : `This is a moderate fit (${potential}/4: ${reason || ''}) — mention it only if it comes up naturally, briefly and cautiously, not as a headline idea.`;
  return `
Custom branded-app opportunity: beyond the existing ${productLine}, we can build a CUSTOMIZED, BRANDED version of it for a business's own audience — e.g. "[Business] MindGym", "[Business] Habit Tracker", or a branded kids' keyboard-learning experience, built around their brand rather than sending people to a third-party app. ${strength}
Rules if you use this: never claim it already exists as a ready product for THEM specifically — frame it as "we could potentially build/customize this for you", not "we have a white-label app available". Position the existing product as a working foundation/starting point (faster and lower-risk than starting from scratch) rather than claiming specific development-speed or cost savings. Never promise specific features, pricing, or a fixed scope — the natural next step is a conversation to understand their audience and requirements, not a pitch with a price. Use warm language ("under your own brand", "branded specifically for your community", "customized around your audience") rather than jargon like "white-label SaaS solution". Never make medical/clinical claims about MindGym — it's mind-training/emotional-awareness content, not treatment.
`;
};

// Guidance for the Feelings & Emotion Course referral/affiliate model —
// distinct from a plain cross-sell mention: the recipient becomes a
// distribution partner for our existing paid course, earning a share of
// subscriptions from their own audience, rather than a personal user of it.
const feelingsAffiliateBlock = (fit, reason) => {
  if (fit === undefined || fit === null || fit < 3) return fit === undefined || fit === null ? '' : `\nFeelings Course affiliate fit was scored ${fit}/4 (${reason || 'weak/unclear audience fit'}) — do not mention the affiliate/revenue-share angle.`;
  return `
Feelings & Emotion Course affiliate opportunity (scored ${fit}/4: ${reason || ''}): this recipient may have an audience (students, parents, clients, employees, followers, community) who could genuinely benefit from Smriti's Feelings & Emotion Course (https://www.skrmblissai.in/feelingsandemotioncourse), making them a plausible referral partner rather than a personal user of it.
If you use this, value comes first, partnership second — never lead with the money. First frame the course as something genuinely useful to share with their audience; only then, as a secondary sentence, mention that we also have a simple revenue-sharing arrangement where they'd receive 30% of subscriptions referred through them. Do not invent mechanics beyond the 30% figure (no cookie duration, tracking details, payment schedule, dashboard, contract terms, or exclusivity) — say those specifics can be discussed if it's of interest. This must never be the primary angle of a first email; it's a secondary mention at most, and only when the fit is genuinely strong.
`;
};

const draftEmailPrompt = ({ businessName, businessType, contactPerson, digitalGaps, recommendedService, research, mindGymAppPotential, mindGymAppReason, mindGymAppProduct, feelingsCourseAffiliateFit, feelingsCourseAffiliateReason }) => `
${IDENTITY}

Available resources (mention a link ONLY if there's a genuine, organic connection to this specific recipient — most emails should include none of these; never list more than one):
${RESOURCE_LINKS}
${crossSellTest}
${mindGymAppBlock(mindGymAppPotential, mindGymAppReason, mindGymAppProduct)}
${feelingsAffiliateBlock(feelingsCourseAffiliateFit, feelingsCourseAffiliateReason)}

Across the branded-app opportunity and the affiliate opportunity above, choose AT MOST ONE to actually use as a secondary mention (never both in the same email) — whichever is the stronger, more natural fit. The email should still have exactly one clear primary story; a secondary mention, if any, must not turn the email into a list of everything we offer.

Write an email for:
Business: ${businessName} (${businessType})
Contact person: ${contactPerson || 'the owner'}
Context that MIGHT be relevant (use at most one, only if it fits naturally — do not force it in): ${(digitalGaps || []).join(', ') || 'none'}
A possible angle if it fits naturally: ${recommendedService || 'none'}
${researchBlock(research)}
${research ? 'You have real, specific facts about this business above — the opening and the ONE idea should draw on those specifics rather than generic observations, while still following the hedging rules for anything not explicitly stated.' : ''}

This is a FIRST / COLD outreach email. The recipient has never heard of us, so the email must establish WHO WE ARE before it establishes anything about them or any idea. Research and personalization must never replace the introduction — research tells them "we looked at you"; the introduction tells them "you know who we are". Both are required, in this order.

Required structure (adapt the wording to the recipient each time — never reuse a stock sentence verbatim across emails — but do not skip a part):
1. Salutation: if a real contact person name was given above (not "the owner"), open with "Hi [FirstName]," using just their first name. Otherwise open with "Hi there," — never "Dear Owner of [Business]".
2. Human introduction — 2-4 sentences after the salutation, before anything about the recipient's business (roughly 20-30% of the email's total length). Weave together, rather than list one by one: our names (Shruti and Smriti) and that we're twin sisters; that we're independent, personally involved and direct — not a large agency; that we build technology/digital products, apps, AI and automation by hand ourselves; AND a brief, natural gesture at the unusual intersection of technology and spirituality — that alongside the tech work, Smriti also works with feelings, emotions and training the mind. Not every element needs its own sentence, and never reuse a stock sentence verbatim across emails — but never drop the spirituality/mind-training side entirely; it's what makes this "us" rather than a generic tech-freelancer blurb like "independent technologists" or "digital product builders" alone. Write like two real people describing themselves in conversation, never like a company "About Us" blurb. Vary emphasis to fit the recipient's world (a wellness practitioner can read more on the human/mind side; a technical or business lead can read mostly about the tech, with the spiritual side as one brief aside) — and keep that side grounded, never claiming to "transform" or "heal" anyone.
3. Why this particular business — a clear transition connecting the introduction to why we're writing to THEM specifically (in the spirit of "and that's why your work caught our attention...") — showing we didn't pick them at random.
4. A specific observation about the business — grounded in what was actually given above (research notes and/or business name/type), following the hedging and no-fabrication rules.
5. The ONE idea (per the rules above), framed as something that occurred to us after understanding their business, not as a product pitch. This is the actual reason they'd want to reply. If the MindGym custom-app opportunity above is strong (3-4/4), this idea CAN be the branded-app concept itself rather than a generic website/chatbot idea — in that case steps 2-3 should lead with curiosity about their audience/community rather than opening on "we build websites and apps".
6. If (and only if) the cross-sell reasoning above surfaces a genuine fit — including the MindGym custom-app idea when it's a moderate rather than primary fit — one brief, organic mention of that one resource/idea, phrased as "there's another part of what we do that made us think of..." rather than a feature list. Skip entirely for a business with no natural connection; most emails should skip this.
7. A warm, low-pressure closing line, per the closing rule above. This is the LAST line of your response — do NOT add a sign-off ("Warm regards" etc.) after it; that's added automatically afterward.

Before finalizing, run this checklist against the draft and rewrite the introduction if anything is missing: does it introduce Shruti & Smriti as people, by name? Does it establish they're twin sisters? Does it communicate independent, personal involvement rather than a large agency? Does it communicate real technology expertise? Does it at least briefly acknowledge the technology + spirituality intersection and Smriti's emotional/mind-training work? Does the tone communicate a preference for meaningful partnerships over transactional selling (through warmth, not a stated line)? Does all of it connect naturally to THIS specific lead? And does the introduction stay to roughly 20-30% of the email, leaving 70-80% for why we're writing to them and how we might help?

Length: 150-250 words (up to ~300 only if there's a lot of genuine relevance to cover). Every sentence should earn its place.

Subject line: short, natural, specific, curiosity-driven, non-salesy (e.g. "an idea for [Business]", "something we noticed about [Business]", "a thought about [specific service]") — never generic marketing language ("Unlock Your Potential", "Transform Your Business Today").

Return ONLY a JSON object: { "subject": "...", "body": "..." }.
`;

const draftFollowUpPrompt = ({ businessName, businessType, contactPerson, originalSubject }) => `
${IDENTITY}

Write a short follow-up email to a business that was already emailed once and hasn't replied. This should read like two people casually checking back in — not a marketing nudge, not a repeat of the pitch.

Business: ${businessName} (${businessType})
Contact person: ${contactPerson || 'the owner'}
Original email subject: "${originalSubject}"

- Salutation: "Hi [FirstName]," if a real contact person name was given, otherwise "Hi there,".
- 2-3 short sentences MAX. Shorter than the original. Almost nothing — "hey, did you see this?" energy.
- Reference briefly that we wrote before, in passing — don't summarize or repeat what was said.
- No new pitch, no new angle needed — fine to just say something like "no worries if now isn't the time" or ask one plain question.
- This is the LAST line of your response — do NOT add a sign-off after it; that's added automatically afterward.

Return ONLY a JSON object: { "subject": "...", "body": "..." } — subject should read like a real follow-up (e.g. "re: ${originalSubject}"), not identical to the original.
`;

// A separate track from the outreach above — sharing Smriti's courses/studio
// with the same contact list, on its own timeline (only after a real gap
// since the first email) and repeating every 15 days rather than being a
// one-shot follow-up. The connection to these resources must still feel
// organic to the recipient, per the identity rules — never force it.
const draftPromoPrompt = ({ businessName, businessType, contactPerson }) => `
${IDENTITY}

We emailed this contact a while back about digital/product work. This is a separate, later email — sharing something else we've made, unrelated to that first email: Smriti's work in emotional intelligence and mind training. This should read as a warm, genuine share from someone proud of what they built, never a sales blast, never a repeat of the earlier pitch.

What we've made in this space:
${RESOURCE_LINKS}

Write a short email for:
Business: ${businessName} (${businessType})
Contact person: ${contactPerson || 'the owner'}

Rules:
- Salutation: "Hi [FirstName]," if a real contact person name was given, otherwise "Hi there,".
- Briefly acknowledge we wrote before, in passing, without repeating what that email said.
- Mention ONLY ONE of the resources above — whichever has the most plausible, organic fit for this recipient (e.g. Tiny Kids Transformations for a children's educator or family-facing business; the Feelings & Emotion Course or MindGym for a therapist, coach, or wellness practitioner; Soulful Intelligence Studio for anyone whose work touches presence or inner growth). If none feels like a genuine fit for this business, connect it more broadly — the shared thread between building technology and building human awareness — rather than forcing a specific resource that doesn't fit.
- Include that one resource's link naturally in a sentence, not as a bare pasted URL with no context.
- Warm, low-key, personal tone — like telling a friend about something you're proud of, not marketing copy. No superlatives, no urgency language ("limited time", "don't miss out").
- End warmly and low-pressure. This is the LAST line of your response — do NOT add a sign-off after it; that's added automatically afterward.

Return ONLY a JSON object: { "subject": "...", "body": "..." }.
`;

const extractJson = (text) => {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in AI response');
  return JSON.parse(match[0]);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Gemini's free tier has a low requests-per-minute cap, and this app fires
// several AI calls per prospect across a batch — 429s are the normal, expected
// outcome under load, not an edge case. Without a retry, a rate-limited draft
// silently falls back to whatever was there before (see enrichProspect's catch
// block), which looks like success but isn't. Backs off 2s/4s/8s across up to
// 3 retries before finally giving up.
const withRetry = async (fn, retries = 3) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const is429 = error?.status === 429 || /429/.test(error?.message || '');
      if (!is429 || attempt >= retries) throw error;
      await sleep(2000 * Math.pow(2, attempt));
    }
  }
};

const suggestGaps = async (openai, { businessName, businessType, notes, research }) => {
  const completion = await withRetry(() => openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: 'You are a precise digital-marketing auditor. Return only valid JSON, no markdown fences.' },
      { role: 'user', content: suggestGapsPrompt({ businessName, businessType, notes, research }) },
    ],
    temperature: 0.6,
  }));
  return extractJson(completion.choices[0].message.content);
};

const researchSummaryPrompt = (rawText) => `
You were given raw text scraped from a business's own website. Summarize it into a short, factual research brief for someone about to write a personalized outreach email — only facts actually present in the text, nothing invented or inferred beyond what's written.

Raw scraped text:
${rawText}

Return ONLY a JSON object:
{
  "summary": "5-8 sentences, plain text, covering: what the business actually does/offers, who it's for, anything distinctive mentioned (specialties, values, tone, location detail, notable offerings), and any digital-presence signal (e.g. no online booking mentioned, has a blog, mentions social media, etc). Write 'none evident from the site' for anything not found rather than guessing.",
  "confidence": "High" | "Medium" | "Low"
}
Confidence should be High if the text gives clear, specific detail about the business; Medium if it's thin/generic; Low if the text is mostly boilerplate/navigation with little substance.
`;

// Fetches the prospect's own website and asks the model to reduce it to a
// short, strictly-factual brief — this is the actual "research" step: real
// browsing, not reasoning from business-type patterns. Returns null (not an
// error) when there's no website or nothing could be fetched, so callers can
// fall back to the pattern-based approach.
const generateIndustryResearch = async (openai, businessType) => {
  try {
    const completion = await withRetry(() => openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: 'You describe typical challenges, services, and business practices for an industry. Be concise and practical. Return only valid JSON, no markdown fences.' },
        { role: 'user', content: `For a ${businessType} business, describe: 1) What they typically do, 2) Common challenges they face, 3) Typical client/audience they serve. Return JSON: { "services": "...", "challenges": "...", "audience": "..." }` },
      ],
      temperature: 0.3,
    }));
    const result = extractJson(completion.choices[0].message.content);
    return {
      summary: `${result.services}\n\nTypical challenges: ${result.challenges}\n\nAudience: ${result.audience}`,
      confidence: 'Medium (industry-based)',
      source: 'Industry knowledge',
    };
  } catch (error) {
    console.error('generateIndustryResearch error:', error.message);
    return null;
  }
};

const researchProspect = async (openai, { website, businessType }) => {
  // Try website scraping first if website is provided
  if (website) {
    const scraped = await researchWebsite(website);
    if (scraped) {
      try {
        const completion = await withRetry(() => openai.chat.completions.create({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: 'You summarize raw scraped website text into a strictly factual brief. Return only valid JSON, no markdown fences.' },
            { role: 'user', content: researchSummaryPrompt(scraped.text) },
          ],
          temperature: 0.3,
        }));
        const result = extractJson(completion.choices[0].message.content);
        return { summary: result.summary, confidence: result.confidence || 'High', pagesFetched: scraped.pagesFetched };
      } catch (error) {
        console.error('researchProspect summarize error:', error.message);
        // Fall through to industry research
      }
    }
  }
  // Fallback: generate research based on business type
  return generateIndustryResearch(openai, businessType);
};

const draftMessage = async (openai, { businessName, businessType, contactPerson, digitalGaps, recommendedService }) => {
  const completion = await withRetry(() => openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: 'You write concise, human, non-salesy outreach messages. Return only the message text.' },
      { role: 'user', content: draftMessagePrompt({ businessName, businessType, contactPerson, digitalGaps, recommendedService }) },
    ],
    temperature: 0.8,
  }));
  return completion.choices[0].message.content.trim();
};

const draftEmail = async (openai, { businessName, businessType, contactPerson, digitalGaps, recommendedService, research, mindGymAppPotential, mindGymAppReason, mindGymAppProduct, feelingsCourseAffiliateFit, feelingsCourseAffiliateReason }) => {
  const completion = await withRetry(() => openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: 'You write short, genuinely human cold outreach emails — never templated, never salesy. Return only valid JSON, no markdown fences around the JSON itself; the body field must be plain text, no markdown formatting inside it either.' },
      { role: 'user', content: draftEmailPrompt({ businessName, businessType, contactPerson, digitalGaps, recommendedService, research, mindGymAppPotential, mindGymAppReason, mindGymAppProduct, feelingsCourseAffiliateFit, feelingsCourseAffiliateReason }) },
    ],
    temperature: 0.8,
  }));
  const result = extractJson(completion.choices[0].message.content);
  return { ...result, body: result.body + emailFooter() };
};

const draftFollowUpEmail = async (openai, { businessName, businessType, contactPerson, originalSubject }) => {
  const completion = await withRetry(() => openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: 'You write short, genuinely human follow-up emails — never templated, never salesy. Return only valid JSON, no markdown fences around the JSON itself; the body field must be plain text, no markdown formatting inside it either.' },
      { role: 'user', content: draftFollowUpPrompt({ businessName, businessType, contactPerson, originalSubject }) },
    ],
    temperature: 0.8,
  }));
  const result = extractJson(completion.choices[0].message.content);
  return { ...result, body: result.body + emailFooter() };
};

const draftPromoEmail = async (openai, { businessName, businessType, contactPerson }) => {
  const completion = await withRetry(() => openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: 'You write short, genuinely human emails sharing your own products/courses — never templated, never salesy. Return only valid JSON, no markdown fences around the JSON itself; the body field must be plain text, no markdown formatting inside it either.' },
      { role: 'user', content: draftPromoPrompt({ businessName, businessType, contactPerson }) },
    ],
    temperature: 0.8,
  }));
  const result = extractJson(completion.choices[0].message.content);
  return { ...result, body: result.body + emailFooter() };
};

const imagePromptPrompt = ({ businessName, businessType, recommendedService, mindGymAppProduct, mindGymAppPotential, research, notes }) => `
You are helping create a visual mockup prompt for an AI image generator (ChatGPT / DALL-E / Midjourney).

The mockup is a one-off visual of a digital product idea being pitched to a business via cold email — something like a phone screen showing a branded app, or a website hero section — to help them picture what's being suggested. It will be attached to the email as an optional teaser image.

Business: ${businessName} (${businessType})
Notes / location info: ${notes || 'none'}
Suggested idea / recommended service: ${recommendedService || 'digital product or app'}
${mindGymAppPotential >= 3 && mindGymAppProduct ? `Custom branded app angle: a version of ${mindGymAppProduct} branded for this business` : ''}
${research ? `Research notes (use any relevant details for specificity): ${research}` : ''}

CRITICAL LOCAL LANGUAGE MANDATE FOR THE UI MOCKUP IMAGE PROMPT:
- Determine the prospect's native local language from their location, city, country, website, or research notes (e.g. Vietnamese for Vietnam/Saigon, French for France, German for Germany, Spanish for Spain, Japanese for Japan, Portuguese for Brazil, etc.).
- EXCEPTION: For prospects in India or native English-speaking countries (UK, US, Canada, Australia, NZ, Ireland, Singapore), use ENGLISH for all UI text on the screen.
- FOR ALL OTHER INTERNATIONAL PROSPECTS (e.g. Vietnam, France, Germany, Spain, Japan, etc.): Explicitly instruct the AI image generator that ALL visible text labels, titles, headers, banner headlines, buttons, and bottom navigation tab items ON THE PHONE/DEVICE SCREEN MUST BE WRITTEN IN THE PROSPECT'S LOCAL LANGUAGE!
- In your prompt text, provide 3-4 specific translated text examples in that local language for the device screen UI (for example, for a Vietnamese Saigon therapy app mockup: specify app title "Phòng Tâm Lý Sài Gòn", main headline "Sức Khỏe Tinh Thần Cho Cuộc Sống Tốt Đẹp Hơn", primary action button "Đặt Lịch Khám Ngay", and bottom tabs "Trang Chủ", "Dịch Vụ", "Lịch Hẹn").

Write ONE ready-to-use image generation prompt (2-4 sentences, plain English instructions for DALL-E/Midjourney). The prompt must:
- Describe a clean, professional phone or device mockup showing a UI screen relevant to this business and idea
- Name the business in the UI (e.g. "${businessName}" or local language title)
- Explicitly specify that all screen titles, navigation headers, buttons, and taglines ARE RENDERED IN THE PROSPECT'S LOCAL LANGUAGE (with 3-4 explicit translated text examples)
- Specify a visual style: clean, minimal, warm, modern app UI, soft tones, white or cream background, product photography style
- NOT describe anything photorealistic with people — just the device/screen mockup itself
- Be ready to paste directly into ChatGPT or Midjourney with no editing needed

Return ONLY the prompt text, nothing else.
`;

const generateImagePrompt = async (openai, { businessName, businessType, recommendedService, mindGymAppProduct, mindGymAppPotential, research, notes }) => {
  const completion = await withRetry(() => openai.chat.completions.create({
    model: AI_MODEL,
    messages: [
      { role: 'system', content: 'You write concise, ready-to-use image generation prompts with local language UI text specs. Return only the prompt text.' },
      { role: 'user', content: imagePromptPrompt({ businessName, businessType, recommendedService, mindGymAppProduct, mindGymAppPotential, research, notes }) },
    ],
    temperature: 0.7,
  }));
  return completion.choices[0].message.content.trim();
};

module.exports = {
  loadProspects,
  saveProspects,
  loadExcludedIdentifiers,
  excludeIdentifiers,
  generateIndustryResearch,
  suggestGaps,
  researchProspect,
  draftMessage,
  draftEmail,
  draftFollowUpEmail,
  draftPromoEmail,
  generateImagePrompt,
  withRetry,
  STATUSES,
};
