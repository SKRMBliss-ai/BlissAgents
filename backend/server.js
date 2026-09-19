const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { startBot, stopBot, approvePost } = require('./bot');
const { fetchVideoInfo } = require('./youtubeInfo');
const outreachAgent = require('./outreachAgent');
const prospectFinder = require('./prospectFinder');
const freelancerFinder = require('./freelancerFinder');
const directoryImporter = require('./directoryImporter');
const emailSender = require('./emailSender');
const emailScraper = require('./emailScraper');
const cron = require('node-cron');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all for local dev
  }
});

app.use(cors());
app.use(express.json());

// Setup storage for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

require('dotenv').config();
const { OpenAI } = require('openai');

// Groq's free tier (Llama models) has much higher rate limits than Gemini's
// free tier, so it's preferred when a GROQ_API_KEY is set — same OpenAI-
// compatible client, just a different base URL/key/model. Falls back to
// Gemini if no Groq key is configured.
const USE_GROQ = !!process.env.GROQ_API_KEY;
const AI_MODEL = USE_GROQ ? 'openai/gpt-oss-120b' : 'gemini-2.5-flash';
const HAS_AI_KEY = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY;

const openai = new OpenAI(USE_GROQ ? {
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
} : {
  apiKey: process.env.GEMINI_API_KEY || 'not-set',
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Serve screenshots
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

let currentStatus = { state: 'idle', logs: [] };

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.emit('status', currentStatus);

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const broadcast = (event, data) => {
  if (event === 'log') currentStatus.logs.push(data);
  if (event === 'state') currentStatus.state = data;
  io.emit(event, data);
};

// Pulls a video's title/description off YouTube and asks Gemini to write a
// short, human-sounding Facebook post about it (not a summary, not an ad —
// the way an actual person shares a video they found meaningful) plus
// hashtags, for the FB group-posting agent below.
app.post('/api/fb/draft-from-youtube', async (req, res) => {
  if (!HAS_AI_KEY) {
    return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY in backend/.env)' });
  }
  const { youtubeUrl, manualTitle, manualDescription } = req.body;
  if (!youtubeUrl) return res.status(400).json({ error: 'youtubeUrl is required' });

  try {
    // Premieres/unlisted-until-live videos don't expose a scrapeable page yet,
    // so this falls back to whatever title/description the user pastes in
    // manually instead of fetching from YouTube.
    const video = (manualTitle || manualDescription)
      ? { title: manualTitle || '', description: manualDescription || '', url: youtubeUrl }
      : await fetchVideoInfo(youtubeUrl);

    const prompt = `
You are sharing a YouTube video with Facebook groups about presence, mindfulness, and inner peace (in the lineage of Eckhart Tolle's "The Power of Now" and Michael Singer). Write a short Facebook post to accompany a link to this video.

Video title: ${video.title}
Video description (from YouTube, may be long/promotional — pull only genuine substance from it, ignore boilerplate like subscribe links or timestamps): ${video.description.slice(0, 2000) || 'none provided'}

Write like a real person sharing something that moved them with a community that cares about this topic — not a marketer, not an AI, not a channel promoting itself. Rules:
- 2-4 short sentences. Conversational, warm, a little personal — as if you watched this and wanted to share one real thought about it, not "check out this video".
- No superlatives ("amazing", "incredible", "life-changing", "must-watch"). No exclamation marks unless it's genuinely how you'd write it — default to none.
- Reference ONE specific idea or moment from the video (inferred from the title/description) rather than describing it generically.
- Do not mention "AI", the channel name as a brand, or any sales/promotional language. This should read like a genuine share, not content marketing.
- Do not include the video link itself in the text — that's added separately.

Also generate 8-10 relevant hashtags (space-separated, e.g. "#Presence #InnerPeace #EckhartTolle") drawing from mindfulness/presence/spirituality themes relevant to this specific video.

Return ONLY a JSON object: { "post": "...", "hashtags": "..." }
`;

    const completion = await outreachAgent.withRetry(() => openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: 'system', content: 'You write short, genuinely human social posts — never templated, never salesy. Return only valid JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
    }));
    const match = completion.choices[0].message.content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('No JSON object found in AI response');
    const result = JSON.parse(match[0]);

    res.json({ text: result.post, hashtags: result.hashtags, title: video.title, videoUrl: video.url });
  } catch (error) {
    console.error('draft-from-youtube error:', error);
    res.status(500).json({ error: error.message });
  }
});

// API Endpoints
app.post('/api/start', upload.single('image'), async (req, res) => {
  if (currentStatus.state !== 'idle') {
    return res.status(400).json({ error: 'Bot is already running' });
  }

  const { text, title, hashtags, groups } = req.body;
  const imagePath = req.file ? path.join(__dirname, req.file.path) : null;
  const groupList = JSON.parse(groups || '[]');

  if (groupList.length === 0) {
    return res.status(400).json({ error: 'No groups provided' });
  }

  currentStatus = { state: 'running', logs: [] };
  broadcast('state', 'running');
  
  startBot({ text, title, hashtags, groups: groupList, imagePath, broadcast })
    .then(() => {
      broadcast('state', 'idle');
      currentStatus.state = 'idle';
    })
    .catch(err => {
      console.error(err);
      broadcast('log', { message: 'Error: ' + err.message, type: 'error' });
      broadcast('state', 'idle');
      currentStatus.state = 'idle';
    });

  res.json({ message: 'Bot started' });
});

app.post('/api/approve', (req, res) => {
  approvePost();
  res.json({ message: 'Approved' });
});

app.get('/api/history', (req, res) => {
  const LOG_FILE = path.join(__dirname, 'post_history.json');
  if (fs.existsSync(LOG_FILE)) {
      res.json(JSON.parse(fs.readFileSync(LOG_FILE, 'utf8')));
  } else {
      res.json([]);
  }
});

app.post('/api/stop', (req, res) => {
  stopBot();
  currentStatus.state = 'idle';
  broadcast('state', 'idle');
  res.json({ message: 'Bot stopped' });
});

const booksDataPath = path.join(__dirname, 'data', 'books.json');
let booksData = {};
try {
  if (fs.existsSync(booksDataPath)) {
    booksData = JSON.parse(fs.readFileSync(booksDataPath, 'utf8'));
  }
} catch (e) {
  console.error("Error loading books.json:", e);
}

// Serve available books and chapters
app.get('/api/books', (req, res) => {
  try {
    const result = {};
    for (const [bookName, bookContent] of Object.entries(booksData)) {
      result[bookName] = {};
      for (const [chapterName, chapterData] of Object.entries(bookContent)) {
        result[bookName][chapterName] = Object.keys(chapterData.questions);
      }
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// YouTube Metadata Generator from Book Endpoint
app.post('/api/yt-generate-from-book', async (req, res) => {
  const { bookName, chapterName, questionNumber } = req.body;
  if (!bookName || !chapterName || !questionNumber) {
    return res.status(400).json({ error: 'Book Name, Chapter Name, and Question Number are required' });
  }

  if (!HAS_AI_KEY) {
    return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY in backend/.env)' });
  }

  const book = booksData[bookName];
  if (!book) return res.status(404).json({ error: 'Book not found' });
  
  const chapter = book[chapterName];
  if (!chapter) return res.status(404).json({ error: 'Chapter not found' });

  const qa = chapter.questions[questionNumber];
  if (!qa) return res.status(404).json({ error: 'Question not found' });

  const prompt = `
You are a YouTube title strategist for a spiritual/mindfulness channel in the lineage of Eckhart Tolle's "The Power of Now", Michael Singer.
The channel teaches presence, mindfulness, stillness, ego dissolution, and freedom from the thinking mind.

TASK: Generate 15 high-CTR YouTube video titles, a highly conversational and human-like description, optimized hashtags, tags, and a creative thumbnail prompt based on the specific Book Question and Answer below.

--- SOURCE TEXT ---
Question: ${qa.q}
Answer: ${qa.a}
-------------------

NON-NEGOTIABLE RULES FOR TITLES:
1. Length: 45–65 characters before the suffix. Mobile truncates at ~60.
2. End every long-form title with the branded suffix: | Power of Now Explanation
   (Skip the suffix only for Shorts-style titles I label "SHORT".)
3. Use ONE psychological hook per title — never stack two.
4. Lead with the primary keyword (or exotic word) in the first 4 words when possible.
5. No emojis. No ALL CAPS except a single emphasized word (e.g., STOP, LIVING, NEVER).
6. Avoid generic words: "amazing," "incredible," "ultimate," "best ever."
7. Don't promise what the video can't deliver.
8. At least 4 of the 15 titles MUST use the Exotic Word Formula (K) from the word bank below.

MIX THESE 11 PROVEN HOOK FORMULAS:
A. Imperative + Transformation -> "Stop [pain]: [Practice] Will Change Your Life"
B. Time-Stamped Trick -> "[Outcome] in 10 Seconds: [Authority] Technique"
C. Named Technique Reveal -> "The '[Name]' Technique: [Authority's] Secret to [Outcome]"
D. Identity Reframe + Proof -> "You Are Not Your [X] (Here's Proof)"
E. Trap / Illusion -> "[Concept] is a Trap: The Illusion Explained"
F. Paradox Hook -> "Why You Still [Negative] Even When Life Is 'Fine'"
G. Listicle -> "3 Ways to [Handle Pain] Without Losing Your Peace"
H. The Hidden Enemy -> "The [Metaphor] That's Quietly [Destroying X]"
I. Mind-Lie Exposure -> "STOP Your Mind From [Lying/Tricking] You (10-Second Trick)"
J. Question + Cure -> "The Only Cure for [Modern Pain] (Eckhart Tolle Explained)"
K. EXOTIC WORD FORMULA -> Lead with an untranslated spiritual word.
   Subformulas:
   K1. "[Word]: The [Tradition] Word for [Modern Pain] | Power of Now Explanation"
   K2. "[Word] Explained: How to [Outcome] Without [Effort/Thought]"
   K3. "You Already Have [Word] (You Just Don't Know It)"
   K4. "Eckhart Tolle Calls It Presence. [Tradition] Calls It [Word]."
   K5. "The '[Word]' Moment: When the Mind Finally [Stops/Dissolves]"
   K6. "What [Tradition] Calls '[Word]' Will End Your [Modern Pain]"

EXOTIC WORD BANK:
TIER 1: Kensho, Mushin, Mu, Wu Wei, Samadhi, Turiya, Sahaja, Rigpa, Fana, Tathata
TIER 2: Sunyata, Anatta, Bodhi, Shoshin, Ataraxia, Hesychia, Kenosis, Apatheia, Bodhicitta, Vairagya
TIER 3: Yugen, Ma, Mono no aware, Anicca, Dukkha, Maya, Lila, Drashta, Nafs, Dhikr, Satori

POWER WORDS: Trap, Illusion, Secret, Truth, Proof, Cure, Trick, Technique, Tormentor, Quiet, Stillness, Surrender, Awaken, Dissolve, Watcher, Pain Body, Samskara, Suffering, Freedom, Peace, Presence, Now, Ego, Thoughts, Identity, Glimpse, Witness

EMOTIONAL TARGETS: Overthinking, Anxiety, Anger, Resentment, Guilt, Shame, Doubt, Fear, Loneliness, Comparison, Self-criticism, Waiting, Regret, Disrespect, People-pleasing, Spiritual stagnation, Boredom, Restlessness, Numbness

OUTPUT FORMAT:
Return ONLY a strictly formatted JSON object with the following keys:
{
  "titles": "A numbered list of 15 titles, each labeled with its formula (A-K). Also pick the 3 strongest titles for thumbnail testing and explain why. Suggest ONE anchor word from Tier 1 for a series.",
  "description": "Follow this EXACT format:\nLine 1-3: A pipe-separated (|) list of keywords. Keep these main keywords: The Stillness Beneath Thought | Presence Meditation | witness consciousness | Michael Singer | Eckhart Tolle | Wisdom Untethered | Power of Now | presence | inner peace | stop overthinking | anxiety relief | mindfulness | Spiritual evolution | Overcoming guilt. Add a few extra relevant ones based on the topic.\nNext: A short paragraph summarizing the video.\nNext: A short paragraph describing the experience (e.g., designed to help you step out of compulsive thinking).\nNext: A 'Perfect for:' section with a bulleted list of 5-8 points highlighting who will benefit.",
  "hashtags": "A space-separated list of 10 highly relevant spiritual/mindfulness hashtags.",
  "tags": "A comma-separated list of 15 SEO-optimized tags for the YouTube video.",
  "thumbnail": "2-3 highly visual, engaging prompt ideas for creating a YouTube thumbnail (e.g. text overlay ideas, visual symbolism, contrast)."
}
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: AI_MODEL,
      messages: [
        { role: "system", content: "You are a professional YouTube strategist and copywriter. You must ONLY return a valid JSON object matching the exact structure requested, with no markdown code blocks wrapping the JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const aiResult = JSON.parse(completion.choices[0].message.content);
    res.json({
      originalQuestion: qa.q,
      originalAnswer: qa.a,
      metadata: aiResult
    });
  } catch (error) {
    console.error("OpenAI Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- Outreach Agent Endpoints ---

app.get('/api/outreach/prospects', (req, res) => {
  res.json(outreachAgent.loadProspects());
});

// Auto-drafts gap-suggestion + a full email for a freshly-found prospect, so it's
// ready to review the moment it lands in the pipeline — no manual "Suggest Gaps"
// / "Draft Email" clicks needed for the common case. Never sends anything; this
// only prepares a draft, which is still reviewed/approved/sent by the user.
const enrichProspect = async (prospect) => {
  try {
    const research = prospect.website
      ? await outreachAgent.researchProspect(openai, { website: prospect.website, businessType: prospect.businessType })
      : await outreachAgent.researchProspect(openai, { businessType: prospect.businessType });
    const gaps = await outreachAgent.suggestGaps(openai, {
      businessName: prospect.businessName, businessType: prospect.businessType, notes: prospect.notes,
      research: research?.summary,
    });
    const draftArgs = {
      businessName: prospect.businessName, businessType: prospect.businessType, contactPerson: prospect.contactPerson,
      digitalGaps: gaps.digitalGaps, recommendedService: gaps.recommendedService, notes: prospect.notes,
      research: research?.summary,
      mindGymAppPotential: gaps.mindGymAppPotential, mindGymAppReason: gaps.mindGymAppReason, mindGymAppProduct: gaps.mindGymAppProduct, feelingsCourseAffiliateFit: gaps.feelingsCourseAffiliateFit, feelingsCourseAffiliateReason: gaps.feelingsCourseAffiliateReason,
    };
    const [email, whatsappMessage] = await Promise.all([
      outreachAgent.draftEmail(openai, draftArgs),
      outreachAgent.draftMessage(openai, draftArgs),
    ]);
    return {
      digitalGaps: gaps.digitalGaps, recommendedService: gaps.recommendedService,
      draftEmailSubject: email.subject, draftEmailBody: email.body,
      draftMessage: whatsappMessage,
      research: research?.summary || null,
      researchConfidence: research?.confidence || null,
      researchedAt: research ? new Date().toISOString() : null,
      mindGymAppPotential: gaps.mindGymAppPotential ?? null, mindGymAppProduct: gaps.mindGymAppProduct || null, feelingsCourseAffiliateFit: gaps.feelingsCourseAffiliateFit ?? null, feelingsCourseAffiliateReason: gaps.feelingsCourseAffiliateReason || null,
      mindGymAppReason: gaps.mindGymAppReason || null,
    };
  } catch (error) {
    console.error(`[auto-enrich] Failed for "${prospect.businessName}":`, error.message);
    return {};
  }
};

const enrichProspectsConcurrently = async (prospects, concurrency = 5) => {
  const results = new Array(prospects.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, prospects.length) }, async () => {
    while (next < prospects.length) {
      const i = next++;
      results[i] = await enrichProspect(prospects[i]);
    }
  });
  await Promise.all(workers);
  return prospects.map((p, i) => ({ ...p, ...results[i] }));
};

app.post('/api/outreach/prospects', async (req, res) => {
  const prospects = outreachAgent.loadProspects();
  const now = new Date().toISOString();
  let prospect = {
    id: Date.now().toString(),
    businessName: '',
    businessType: '',
    website: '',
    instagram: '',
    contactPerson: '',
    email: '',
    whatsapp: '',
    digitalGaps: [],
    recommendedService: '',
    draftMessage: '',
    notes: '',
    status: 'New',
    createdAt: now,
    lastContactDate: null,
    followUpDate: null,
    ...req.body,
  };
  if (HAS_AI_KEY) {
    const enrichment = await enrichProspect(prospect);
    prospect = { ...prospect, ...enrichment };
  }
  prospects.push(prospect);
  outreachAgent.saveProspects(prospects);
  res.status(201).json(prospect);
});

app.put('/api/outreach/prospects/:id', (req, res) => {
  const prospects = outreachAgent.loadProspects();
  const idx = prospects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Prospect not found' });
  prospects[idx] = { ...prospects[idx], ...req.body, id: prospects[idx].id };
  outreachAgent.saveProspects(prospects);
  res.json(prospects[idx]);
});

app.delete('/api/outreach/prospects/:id', (req, res) => {
  const prospects = outreachAgent.loadProspects();
  const deleted = prospects.find(p => p.id === req.params.id);
  if (deleted) outreachAgent.excludeIdentifiers(deleted.placeId, deleted.sourceUrl);
  const filtered = prospects.filter(p => p.id !== req.params.id);
  outreachAgent.saveProspects(filtered);
  res.json({ message: 'Deleted' });
});

// Researches a single prospect's actual website (real browsing, not pattern
// reasoning) and re-drafts its email/message grounded in what was found.
// Meant for prospects added before this feature existed, or to refresh a
// stale/unsent draft with real research.
app.post('/api/outreach/prospects/:id/research', async (req, res) => {
  if (!HAS_AI_KEY) {
    return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY in backend/.env)' });
  }
  const prospects = outreachAgent.loadProspects();
  const idx = prospects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Prospect not found' });
  const prospect = prospects[idx];
  try {
    const research = await outreachAgent.researchProspect(openai, { website: prospect.website, businessType: prospect.businessType });
    if (!research) return res.status(422).json({ error: 'Could not research this prospect' });

    const gaps = await outreachAgent.suggestGaps(openai, {
      businessName: prospect.businessName, businessType: prospect.businessType, notes: prospect.notes,
      research: research.summary,
    });
    const draftArgs = {
      businessName: prospect.businessName, businessType: prospect.businessType, contactPerson: prospect.contactPerson,
      digitalGaps: gaps.digitalGaps, recommendedService: gaps.recommendedService, notes: prospect.notes,
      research: research.summary,
      mindGymAppPotential: gaps.mindGymAppPotential, mindGymAppReason: gaps.mindGymAppReason, mindGymAppProduct: gaps.mindGymAppProduct, feelingsCourseAffiliateFit: gaps.feelingsCourseAffiliateFit, feelingsCourseAffiliateReason: gaps.feelingsCourseAffiliateReason,
    };
    const [email, whatsappMessage] = await Promise.all([
      outreachAgent.draftEmail(openai, draftArgs),
      outreachAgent.draftMessage(openai, draftArgs),
    ]);

    prospects[idx] = {
      ...prospect,
      research: research.summary,
      researchConfidence: research.confidence,
      researchedAt: new Date().toISOString(),
      digitalGaps: gaps.digitalGaps,
      recommendedService: gaps.recommendedService,
      draftEmailSubject: email.subject,
      draftEmailBody: email.body,
      draftMessage: whatsappMessage,
      mindGymAppPotential: gaps.mindGymAppPotential ?? null, mindGymAppProduct: gaps.mindGymAppProduct || null, feelingsCourseAffiliateFit: gaps.feelingsCourseAffiliateFit ?? null, feelingsCourseAffiliateReason: gaps.feelingsCourseAffiliateReason || null,
      mindGymAppReason: gaps.mindGymAppReason || null,
    };
    outreachAgent.saveProspects(prospects);
    res.json(prospects[idx]);
  } catch (error) {
    console.error('research error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/suggest-gaps', async (req, res) => {
  if (!HAS_AI_KEY) {
    return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY in backend/.env)' });
  }
  try {
    const result = await outreachAgent.suggestGaps(openai, req.body);
    res.json(result);
  } catch (error) {
    console.error('suggest-gaps error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/draft-message', async (req, res) => {
  if (!HAS_AI_KEY) {
    return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY in backend/.env)' });
  }
  try {
    const message = await outreachAgent.draftMessage(openai, req.body);
    res.json({ message });
  } catch (error) {
    console.error('draft-message error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/draft-email', async (req, res) => {
  if (!HAS_AI_KEY) {
    return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY in backend/.env)' });
  }
  try {
    const email = await outreachAgent.draftEmail(openai, req.body);
    res.json(email);
  } catch (error) {
    console.error('draft-email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Drafts the "nudge" follow-up right after the first email goes out, so it's
// sitting ready for review by the time followUpDate arrives — the user never
// has to remember to ask for it. Never auto-approved; still a human decision.
const draftFollowUpForSentProspect = async (prospect) => {
  if (!HAS_AI_KEY) return {};
  try {
    const followUp = await outreachAgent.draftFollowUpEmail(openai, {
      businessName: prospect.businessName, businessType: prospect.businessType, contactPerson: prospect.contactPerson,
      originalSubject: prospect.draftEmailSubject, notes: prospect.notes,
    });
    return { followUpEmailSubject: followUp.subject, followUpEmailBody: followUp.body };
  } catch (error) {
    console.error(`[follow-up draft] Failed for "${prospect.businessName}":`, error.message);
    return {};
  }
};

// Drafts the courses/apps promo email the first time a prospect's initial
// email goes out, so it's ready and waiting — but it stays invisible in the
// queue until promoEligibleDate (a real gap after the first email, so this
// never lands right on top of the digital-services pitch).
const draftPromoForSentProspect = async (prospect) => {
  if (!HAS_AI_KEY) return {};
  try {
    const promo = await outreachAgent.draftPromoEmail(openai, {
      businessName: prospect.businessName, businessType: prospect.businessType, contactPerson: prospect.contactPerson, notes: prospect.notes,
    });
    // Based on the actual send date, not "now" — so backfilling promo drafts
    // for prospects emailed long ago makes them immediately eligible (their
    // 7-day gap already passed) instead of pushing eligibility 7 days out.
    const eligible = new Date(prospect.emailSentAt || Date.now());
    eligible.setDate(eligible.getDate() + 7);
    return { promoEmailSubject: promo.subject, promoEmailBody: promo.body, promoEligibleDate: eligible.toISOString().slice(0, 10) };
  } catch (error) {
    console.error(`[promo draft] Failed for "${prospect.businessName}":`, error.message);
    return {};
  }
};

app.post('/api/outreach/send-email', async (req, res) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    return res.status(500).json({ error: 'EMAIL_USER / EMAIL_PASS is not set in backend/.env' });
  }
  const { prospectId, subject, body } = req.body;
  try {
    const prospects = outreachAgent.loadProspects();
    const prospect = prospects.find(p => p.id === prospectId);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    if (!prospect.email) return res.status(400).json({ error: 'Prospect has no email address' });

    // Points at the deployed function even for locally-sent emails, since a
    // recipient's mail client can't reach localhost to load the pixel.
    const trackingUrl = `https://bliss-agents-outreach.web.app/api/outreach/track-open/${prospectId}`;
    await emailSender.sendEmail({ to: prospect.email, subject, body, fromName: 'Shruti | SKRM Bliss AI', trackingUrl, prototypeImageUrl: prospect.prototypeImageUrl });

    const today = new Date().toISOString().slice(0, 10);
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 3);
    Object.assign(prospect, {
      status: prospect.status === 'New' ? 'Contacted' : prospect.status,
      lastContactDate: today,
      followUpDate: followUpDate.toISOString().slice(0, 10),
      draftEmailSubject: subject,
      draftEmailBody: body,
      emailSentAt: new Date().toISOString(),
    });
    const followUpDraft = await draftFollowUpForSentProspect(prospect);
    Object.assign(prospect, followUpDraft);
    const promoDraft = await draftPromoForSentProspect(prospect);
    Object.assign(prospect, promoDraft);
    outreachAgent.saveProspects(prospects);
    res.json({ message: 'Email sent', prospect });
  } catch (error) {
    console.error('send-email error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/outreach/prospects/:id/image-prompt', async (req, res) => {
  if (!HAS_AI_KEY) {
    return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY in backend/.env)' });
  }
  try {
    const prospects = outreachAgent.loadProspects();
    const prospect = prospects.find(p => p.id === req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    const prompt = await outreachAgent.generateImagePrompt(openai, {
      businessName: prospect.businessName,
      businessType: prospect.businessType,
      recommendedService: prospect.recommendedService,
      mindGymAppProduct: prospect.mindGymAppProduct,
      mindGymAppPotential: prospect.mindGymAppPotential,
      research: prospect.research,
      notes: prospect.notes,
    });
    res.json({ prompt });
  } catch (error) {
    console.error('image-prompt error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/outreach/track-open/:id', (req, res) => {
  try {
    const prospects = outreachAgent.loadProspects();
    const prospect = prospects.find(p => p.id === req.params.id);
    if (prospect && !prospect.emailOpenedAt) {
      prospect.emailOpenedAt = new Date().toISOString();
      outreachAgent.saveProspects(prospects);
    }
  } catch (error) {
    console.error('track-open error:', error.message);
  }
  res.set('Content-Type', 'image/gif');
  res.send(emailSender.TRACKING_PIXEL_GIF);
});

// Catches up any prospect added before auto-drafting existed (or where it
// failed) — drafts gaps + email for everyone currently missing a draft.
app.post('/api/outreach/draft-missing', async (req, res) => {
  if (!HAS_AI_KEY) {
    return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY in backend/.env)' });
  }
  try {
    const prospects = outreachAgent.loadProspects();
    const missing = prospects.filter(p => !p.draftEmailBody);
    const enriched = await enrichProspectsConcurrently(missing);
    const byId = new Map(enriched.map(p => [p.id, p]));
    const updated = prospects.map(p => byId.get(p.id) || p);
    outreachAgent.saveProspects(updated);
    res.json({ updated: enriched.length });
  } catch (error) {
    console.error('draft-missing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Re-generates drafts for anything still sitting in the approval queue
// (drafted but never approved or sent) — safe to overwrite since nothing has
// gone out yet. Used after a prompt/persona/signature change so old drafts
// written under a stale template don't linger unreviewed.
app.post('/api/outreach/redraft-pending', async (req, res) => {
  if (!HAS_AI_KEY) {
    return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY in backend/.env)' });
  }
  try {
    const prospects = outreachAgent.loadProspects();
    const pending = prospects.filter(p => p.draftEmailBody && !p.emailSentAt && !p.emailApproved);
    // Deliberately low concurrency + counting real successes (not attempts) —
    // enrichProspect silently falls back to {} on failure (e.g. Gemini 429),
    // which previously made this report "updated: N" even when nothing changed.
    let updatedCount = 0;
    let index = 0;
    const workers = Array.from({ length: Math.min(2, pending.length) }, async () => {
      while (index < pending.length) {
        const prospect = pending[index++];
        const enrichment = await enrichProspect(prospect);
        if (Object.keys(enrichment).length) {
          Object.assign(prospect, enrichment);
          updatedCount += 1;
        }
      }
    });
    await Promise.all(workers);
    outreachAgent.saveProspects(prospects);
    res.json({ updated: updatedCount, attempted: pending.length });
  } catch (error) {
    console.error('redraft-pending error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Backfills the promo campaign for prospects who were emailed before this
// feature existed — their promoEligibleDate lands in the past (7 days after
// their actual send date), so they become immediately actionable in the queue.
app.post('/api/outreach/draft-missing-promos', async (req, res) => {
  if (!HAS_AI_KEY) {
    return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY in backend/.env)' });
  }
  try {
    const prospects = outreachAgent.loadProspects();
    const missing = prospects.filter(p => p.emailSentAt && !p.promoEmailBody);
    let updatedCount = 0;
    let index = 0;
    const workers = Array.from({ length: Math.min(2, missing.length) }, async () => {
      while (index < missing.length) {
        const prospect = missing[index++];
        const promoDraft = await draftPromoForSentProspect(prospect);
        if (Object.keys(promoDraft).length) {
          Object.assign(prospect, promoDraft);
          updatedCount += 1;
        }
      }
    });
    await Promise.all(workers);
    outreachAgent.saveProspects(prospects);
    res.json({ updated: updatedCount, attempted: missing.length });
  } catch (error) {
    console.error('draft-missing-promos error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/scrape-email/:id', async (req, res) => {
  try {
    const prospects = outreachAgent.loadProspects();
    const prospect = prospects.find(p => p.id === req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    if (!prospect.website) return res.status(400).json({ error: 'Prospect has no website to scrape' });
    const email = await emailScraper.scrapeEmailFromWebsite(prospect.website);
    if (!email) return res.json({ found: false, prospect });
    prospect.email = email;
    outreachAgent.saveProspects(prospects);
    res.json({ found: true, prospect });
  } catch (error) {
    console.error('scrape-email error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/scrape-missing-emails', async (req, res) => {
  try {
    const prospects = outreachAgent.loadProspects();
    const targets = prospects.filter(p => p.website && !p.email);
    let foundCount = 0;
    let next = 0;
    const workers = Array.from({ length: Math.min(5, targets.length) }, async () => {
      while (next < targets.length) {
        const p = targets[next++];
        try {
          const email = await emailScraper.scrapeEmailFromWebsite(p.website);
          if (email) { p.email = email; foundCount += 1; }
        } catch (e) {
          console.error(`[scrape-missing-emails] Failed for "${p.businessName}":`, e.message);
        }
      }
    });
    await Promise.all(workers);
    outreachAgent.saveProspects(prospects);
    res.json({ scanned: targets.length, found: foundCount });
  } catch (error) {
    console.error('scrape-missing-emails error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/outreach/settings', (req, res) => {
  res.json(prospectFinder.loadSettings());
});

app.put('/api/outreach/settings', (req, res) => {
  const settings = { ...prospectFinder.loadSettings(), ...req.body };
  prospectFinder.saveSettings(settings);
  res.json(settings);
});

const runDiscoveryAndSave = async () => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const settings = prospectFinder.loadSettings();
  const existingProspects = outreachAgent.loadProspects();
  const excludedIdentifiers = outreachAgent.loadExcludedIdentifiers();

  const found = await prospectFinder.runDailyDiscovery({ apiKey, existingProspects, settings, excludedIdentifiers });

  if (found.length > 0) {
    const now = new Date().toISOString();
    const withDefaults = found.map((p, i) => ({
      id: (Date.now() + i).toString(),
      digitalGaps: [],
      recommendedService: '',
      draftMessage: '',
      status: 'New',
      createdAt: now,
      lastContactDate: null,
      followUpDate: null,
      ...p,
    }));
    const enriched = HAS_AI_KEY ? await enrichProspectsConcurrently(withDefaults) : withDefaults;
    outreachAgent.saveProspects([...enriched, ...existingProspects]);
  }

  prospectFinder.saveSettings({ ...settings, lastRunDate: new Date().toISOString().slice(0, 10) });
  return found;
};

app.post('/api/outreach/find-prospects', async (req, res) => {
  if (!process.env.GOOGLE_PLACES_API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY is not set in backend/.env' });
  }
  try {
    const { cities, businessTypes, countPerType } = req.body;
    const settings = { ...prospectFinder.loadSettings(), ...(cities && { cities }), ...(businessTypes && { businessTypes }), ...(countPerType && { countPerType }) };
    prospectFinder.saveSettings(settings);
    const found = await runDiscoveryAndSave();
    res.json({ found });
  } catch (error) {
    console.error('find-prospects error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/outreach/freelancer-types', (req, res) => {
  res.json({ types: freelancerFinder.FREELANCER_TYPES });
});

app.post('/api/outreach/import-therapy-directory', async (req, res) => {
  try {
    const { count } = req.body || {};
    const existingProspects = outreachAgent.loadProspects();
    const excludedIdentifiers = outreachAgent.loadExcludedIdentifiers();
    const found = await directoryImporter.importTherapyInLondon({ existingProspects, excludedIdentifiers, count: count || 20 });
    if (found.length > 0) {
      const now = new Date().toISOString();
      const withDefaults = found.map((p, i) => ({
        id: (Date.now() + i).toString(),
        digitalGaps: [], recommendedService: '', draftMessage: '', status: 'New',
        createdAt: now, lastContactDate: null, followUpDate: null,
        ...p,
      }));
      const enriched = HAS_AI_KEY ? await enrichProspectsConcurrently(withDefaults) : withDefaults;
      outreachAgent.saveProspects([...enriched, ...existingProspects]);
    }
    res.json({ found });
  } catch (error) {
    console.error('import-therapy-directory error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/import-counselling-directory', async (req, res) => {
  try {
    const { count } = req.body || {};
    const existingProspects = outreachAgent.loadProspects();
    const excludedIdentifiers = outreachAgent.loadExcludedIdentifiers();
    const found = await directoryImporter.importCounsellingDirectory({ existingProspects, excludedIdentifiers, count: count || 30 });
    if (found.length > 0) {
      outreachAgent.saveProspects([...found, ...existingProspects]);
    }
    res.json({ imported: found.length, found });
  } catch (error) {
    console.error('import-counselling-directory error:', error);
    res.status(500).json({ error: error.message });
  }
});


app.post('/api/outreach/find-freelancers', async (req, res) => {
  if (!process.env.BLISS_AGENT_CUSTOM_SEARCH_ENG || !process.env.GOOGLE_CUSTOM_SEARCH_CX) {
    return res.status(500).json({ error: 'BLISS_AGENT_CUSTOM_SEARCH_ENG / GOOGLE_CUSTOM_SEARCH_CX is not set in backend/.env' });
  }
  try {
    const { cities, freelancerTypes, countPerType } = req.body;
    if (!freelancerTypes?.length) {
      return res.status(400).json({ error: 'freelancerTypes is required' });
    }
    const existingProspects = outreachAgent.loadProspects();
    const excludedIdentifiers = outreachAgent.loadExcludedIdentifiers();
    const found = await freelancerFinder.runFreelancerDiscovery({
      apiKey: (process.env.BLISS_AGENT_CUSTOM_SEARCH_ENG || '').trim(),
      cx: (process.env.GOOGLE_CUSTOM_SEARCH_CX || '').trim(),
      existingProspects, cities, freelancerTypes, countPerType: countPerType || 5, excludedIdentifiers,
    });
    if (found.length > 0) {
      const now = new Date().toISOString();
      const withDefaults = found.map((p, i) => ({
        id: (Date.now() + i).toString(),
        digitalGaps: [], recommendedService: '', draftMessage: '', status: 'New',
        createdAt: now, lastContactDate: null, followUpDate: null,
        ...p,
      }));
      const enriched = HAS_AI_KEY ? await enrichProspectsConcurrently(withDefaults) : withDefaults;
      outreachAgent.saveProspects([...enriched, ...existingProspects]);
    }
    res.json({ found });
  } catch (error) {
    console.error('find-freelancers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Auto-run once a day at the configured hour, but only while this server process is running.
cron.schedule('0 * * * *', async () => {
  const settings = prospectFinder.loadSettings();
  const today = new Date().toISOString().slice(0, 10);
  const currentHour = new Date().getHours();
  if (settings.lastRunDate === today || currentHour !== settings.dailyRunHour) return;
  if (!process.env.GOOGLE_PLACES_API_KEY) return;

  try {
    const found = await runDiscoveryAndSave();
    console.log(`[daily discovery] Added ${found.length} new prospects.`);
  } catch (error) {
    console.error('[daily discovery] Failed:', error.message);
  }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Sends a small batch of already-approved emails, paced to look human (a few per
// hour, capped per day) rather than firing the whole daily quota at once. Never
// sends anything the user hasn't explicitly approved first.
const sendApprovedBatch = async () => {
  const settings = prospectFinder.loadSettings();
  const now = new Date();
  const hourIST = Number(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
  const todayIST = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  if (hourIST < (settings.emailSendWindowStartHour ?? 9) || hourIST >= (settings.emailSendWindowEndHour ?? 20)) {
    return { sent: 0, reason: 'outside sending window' };
  }

  const emailsSentToday = settings.emailSendDate === todayIST ? (settings.emailsSentToday || 0) : 0;
  const remaining = (settings.dailyEmailSendLimit ?? 20) - emailsSentToday;
  if (remaining <= 0) return { sent: 0, reason: 'daily limit reached' };

  const batchSize = Math.min(settings.emailsPerBatch ?? 2, remaining);
  const prospects = outreachAgent.loadProspects();
  // Unified queue: first-time approved emails and approved follow-up nudges
  // compete for the same paced batch slots, ordered by whichever was approved
  // first — a follow-up doesn't jump the line ahead of a fresh lead.
  const initialItems = prospects
    .filter(p => p.emailApproved && !p.emailSentAt && p.email)
    .map(p => ({ prospect: p, kind: 'initial', queuedAt: p.approvedAt || p.createdAt || '' }));
  const followUpItems = prospects
    .filter(p => p.followUpApproved && !p.followUpSentAt && p.email)
    .map(p => ({ prospect: p, kind: 'followup', queuedAt: p.followUpApprovedAt || '' }));
  // Promo is recurring, not one-time — promoApproved gets reset to false after
  // each send, so it naturally re-enters this same filter once the next
  // 15-day cycle arrives and the user approves it again.
  const promoItems = prospects
    .filter(p => p.promoApproved && p.email)
    .map(p => ({ prospect: p, kind: 'promo', queuedAt: p.promoApprovedAt || '' }));
  const queue = [...initialItems, ...followUpItems, ...promoItems]
    .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
    .slice(0, batchSize);

  let sentCount = 0;
  for (const { prospect, kind } of queue) {
    try {
      const trackingUrl = `https://bliss-agents-outreach.web.app/api/outreach/track-open/${prospect.id}`;
      const subject = kind === 'initial' ? prospect.draftEmailSubject : kind === 'followup' ? prospect.followUpEmailSubject : prospect.promoEmailSubject;
      const body = kind === 'initial' ? prospect.draftEmailBody : kind === 'followup' ? prospect.followUpEmailBody : prospect.promoEmailBody;
      const prototypeImageUrl = kind === 'initial' ? prospect.prototypeImageUrl : undefined;
      await emailSender.sendEmail({ to: prospect.email, subject, body, fromName: 'Shruti | SKRM Bliss AI', trackingUrl, prototypeImageUrl });

      if (kind === 'initial') {
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + 3);
        Object.assign(prospect, {
          emailSentAt: now.toISOString(),
          status: prospect.status === 'New' ? 'Contacted' : prospect.status,
          lastContactDate: todayIST,
          followUpDate: followUpDate.toISOString().slice(0, 10),
        });
        const followUpDraft = await draftFollowUpForSentProspect(prospect);
        Object.assign(prospect, followUpDraft);
        const promoDraft = await draftPromoForSentProspect(prospect);
        Object.assign(prospect, promoDraft);
      } else if (kind === 'followup') {
        Object.assign(prospect, { followUpSentAt: now.toISOString(), lastContactDate: todayIST });
      } else {
        const nextEligible = new Date();
        nextEligible.setDate(nextEligible.getDate() + 15);
        Object.assign(prospect, {
          promoSentAt: now.toISOString(),
          promoApproved: false,
          promoEligibleDate: nextEligible.toISOString().slice(0, 10),
          lastContactDate: todayIST,
        });
      }
      sentCount += 1;
      await sleep(3000);
    } catch (error) {
      console.error(`[email queue] Failed to send to ${prospect.email}:`, error.message);
    }
  }
  outreachAgent.saveProspects(prospects);
  prospectFinder.saveSettings({ ...settings, emailsSentToday: emailsSentToday + sentCount, emailSendDate: todayIST });
  return { sent: sentCount, queueSize: queue.length };
};

app.post('/api/outreach/send-approved-batch', async (req, res) => {
  try {
    res.json(await sendApprovedBatch());
  } catch (error) {
    console.error('send-approved-batch error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Runs hourly, only while this server process is running (unlike the deployed
// Cloud Scheduler version which runs regardless).
cron.schedule('0 * * * *', async () => {
  try {
    const result = await sendApprovedBatch();
    console.log(`[email queue] Sent ${result.sent} email(s).`, result.reason || '');
  } catch (error) {
    console.error('[email queue] Failed:', error.message);
  }
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
