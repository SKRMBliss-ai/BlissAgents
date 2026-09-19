const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const Busboy = require('busboy');
const { OpenAI } = require('openai');

if (!admin.apps.length) admin.initializeApp();

const store = require('./outreachStore');
const prospectFinder = require('./prospectFinder');
const freelancerFinder = require('./freelancerFinder');
const directoryImporter = require('./directoryImporter');
const aiHelpers = require('./aiHelpers');
const emailSender = require('./emailSender');
const emailScraper = require('./emailScraper');

const API_SECRETS = [
  'GEMINI_API_KEY', 'GOOGLE_PLACES_API_KEY', 'EMAIL_USER', 'EMAIL_PASS',
  'BLISS_AGENT_CUSTOM_SEARCH_ENG', 'GOOGLE_CUSTOM_SEARCH_CX', 'GROQ_API_KEY',
];
const DISCOVERY_SECRETS = ['GOOGLE_PLACES_API_KEY', 'GEMINI_API_KEY', 'GROQ_API_KEY'];
const HAS_AI_KEY = process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY;

// Groq's free tier (Llama models) has much higher rate limits than Gemini's
// free tier, so it's preferred when a GROQ_API_KEY secret is set — same
// OpenAI-compatible client, just a different base URL/key. Falls back to
// Gemini if no Groq key is configured.
const getOpenAI = () => process.env.GROQ_API_KEY
  ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' })
  : new OpenAI({ apiKey: process.env.GEMINI_API_KEY || 'not-set', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' });

// Auto-drafts gap-suggestion + a full email for a freshly-found prospect, so it's
// ready to review the moment it lands in the pipeline — no manual "Suggest Gaps"
// / "Draft Email" clicks needed for the common case. Never sends anything; this
// only prepares a draft, which is still reviewed/approved/sent by the user.
const enrichProspect = async (openai, prospect) => {
  try {
    const research = prospect.website
      ? await aiHelpers.researchProspect(openai, { website: prospect.website, businessType: prospect.businessType })
      : await aiHelpers.researchProspect(openai, { businessType: prospect.businessType });
    const gaps = await aiHelpers.suggestGaps(openai, {
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
      aiHelpers.draftEmail(openai, draftArgs),
      aiHelpers.draftMessage(openai, draftArgs),
    ]);
    return {
      digitalGaps: gaps.digitalGaps, recommendedService: gaps.recommendedService,
      draftEmailSubject: email.subject, draftEmailBody: email.body,
      draftMessage: whatsappMessage,
      research: research?.summary || null,
      researchConfidence: research?.confidence || null,
      researchedAt: research ? new Date().toISOString() : null,
      mindGymAppPotential: gaps.mindGymAppPotential ?? null,
      mindGymAppProduct: gaps.mindGymAppProduct || null,
      feelingsCourseAffiliateFit: gaps.feelingsCourseAffiliateFit ?? null,
      feelingsCourseAffiliateReason: gaps.feelingsCourseAffiliateReason || null,
      mindGymAppReason: gaps.mindGymAppReason || null,
    };
  } catch (error) {
    console.error(`[auto-enrich] Failed for "${prospect.businessName}":`, error.message);
    return {};
  }
};

// Enriches a batch with limited concurrency so a big discovery run (dozens of
// prospects) doesn't serialize into minutes of sequential AI calls.
const enrichProspectsConcurrently = async (openai, prospects, concurrency = 5) => {
  const results = new Array(prospects.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, prospects.length) }, async () => {
    while (next < prospects.length) {
      const i = next++;
      results[i] = await enrichProspect(openai, prospects[i]);
    }
  });
  await Promise.all(workers);
  return prospects.map((p, i) => ({ ...p, ...results[i] }));
};

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/api/outreach/prospects', async (req, res) => {
  res.json(await store.loadProspects());
});

app.post('/api/outreach/prospects', async (req, res) => {
  let prospect = await store.createProspect(req.body);
  if (HAS_AI_KEY) {
    const enrichment = await enrichProspect(getOpenAI(), prospect);
    if (Object.keys(enrichment).length) prospect = await store.updateProspect(prospect.id, enrichment);
  }
  res.status(201).json(prospect);
});

app.put('/api/outreach/prospects/:id', async (req, res) => {
  const updated = await store.updateProspect(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Prospect not found' });
  res.json(updated);
});

app.delete('/api/outreach/prospects/:id', async (req, res) => {
  await store.deleteProspect(req.params.id);
  res.json({ message: 'Deleted' });
});

app.post('/api/outreach/prospects/:id/research', async (req, res) => {
  if (!HAS_AI_KEY) return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY secret)' });
  const prospects = await store.loadProspects();
  const prospect = prospects.find(p => p.id === req.params.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
  try {
    const openai = getOpenAI();
    const research = await aiHelpers.researchProspect(openai, { website: prospect.website, businessType: prospect.businessType });
    if (!research) return res.status(422).json({ error: 'Could not research this prospect' });

    const gaps = await aiHelpers.suggestGaps(openai, {
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
      aiHelpers.draftEmail(openai, draftArgs),
      aiHelpers.draftMessage(openai, draftArgs),
    ]);

    const updated = await store.updateProspect(prospect.id, {
      research: research.summary,
      researchConfidence: research.confidence,
      researchedAt: new Date().toISOString(),
      digitalGaps: gaps.digitalGaps,
      recommendedService: gaps.recommendedService,
      draftEmailSubject: email.subject,
      draftEmailBody: email.body,
      draftMessage: whatsappMessage,
      mindGymAppPotential: gaps.mindGymAppPotential ?? null,
      mindGymAppProduct: gaps.mindGymAppProduct || null,
      mindGymAppReason: gaps.mindGymAppReason || null,
      feelingsCourseAffiliateFit: gaps.feelingsCourseAffiliateFit ?? null,
      feelingsCourseAffiliateReason: gaps.feelingsCourseAffiliateReason || null,
    });
    res.json(updated);
  } catch (error) {
    console.error('research error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/suggest-gaps', async (req, res) => {
  if (!HAS_AI_KEY) return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY secret)' });
  try {
    res.json(await aiHelpers.suggestGaps(getOpenAI(), req.body));
  } catch (error) {
    console.error('suggest-gaps error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/draft-message', async (req, res) => {
  if (!HAS_AI_KEY) return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY secret)' });
  try {
    const message = await aiHelpers.draftMessage(getOpenAI(), req.body);
    res.json({ message });
  } catch (error) {
    console.error('draft-message error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/draft-email', async (req, res) => {
  if (!HAS_AI_KEY) return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY secret)' });
  try {
    const email = await aiHelpers.draftEmail(getOpenAI(), req.body);
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
    const followUp = await aiHelpers.draftFollowUpEmail(getOpenAI(), {
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
    const promo = await aiHelpers.draftPromoEmail(getOpenAI(), {
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
    return res.status(500).json({ error: 'EMAIL_USER / EMAIL_PASS secrets are not set' });
  }
  const { prospectId, subject, body } = req.body;
  try {
    const prospect = await store.getProspect(prospectId);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    if (!prospect.email) return res.status(400).json({ error: 'Prospect has no email address' });

    const trackingUrl = `https://bliss-agents-outreach.web.app/api/outreach/track-open/${prospectId}`;
    await emailSender.sendEmail({ to: prospect.email, subject, body, fromName: 'Shruti | SKRM Bliss AI', trackingUrl, prototypeImageUrl: prospect.prototypeImageUrl });

    const today = new Date().toISOString().slice(0, 10);
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 3);
    let updated = await store.updateProspect(prospectId, {
      status: prospect.status === 'New' ? 'Contacted' : prospect.status,
      lastContactDate: today,
      followUpDate: followUpDate.toISOString().slice(0, 10),
      draftEmailSubject: subject,
      draftEmailBody: body,
      emailSentAt: new Date().toISOString(),
    });
    const followUpDraft = await draftFollowUpForSentProspect(updated);
    if (Object.keys(followUpDraft).length) updated = await store.updateProspect(prospectId, followUpDraft);
    const promoDraft = await draftPromoForSentProspect(updated);
    if (Object.keys(promoDraft).length) updated = await store.updateProspect(prospectId, promoDraft);
    res.json({ message: 'Email sent', prospect: updated });
  } catch (error) {
    console.error('send-email error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/outreach/prospects/:id/image-prompt', async (req, res) => {
  if (!HAS_AI_KEY) return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY secret)' });
  try {
    const prospect = await store.getProspect(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    const prompt = await aiHelpers.generateImagePrompt(getOpenAI(), {
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


// A visual mockup of the idea being pitched (e.g. a phone mockup of a
// "[Business] Mind Gym" app screen), generated externally and attached here
// before the draft is approved/sent — not every prospect gets one, so this
// is a manual, opt-in step rather than something the AI draft flow triggers.
//
// multer's usual req.pipe(busboy) approach doesn't work here: the Functions
// Framework already drains the request into req.rawBody before Express
// middleware runs, so by the time multer's busboy tries to read the live
// stream there's nothing left ("Unexpected end of form"). Feeding req.rawBody
// into busboy directly sidesteps that.
const parseSingleFileUpload = (req) => new Promise((resolve, reject) => {
  const busboy = Busboy({ headers: req.headers, limits: { fileSize: 8 * 1024 * 1024 } });
  let result = null;
  busboy.on('file', (fieldname, stream, info) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => { result = { buffer: Buffer.concat(chunks), mimetype: info.mimeType, originalname: info.filename }; });
  });
  busboy.on('finish', () => resolve(result));
  busboy.on('error', reject);
  busboy.end(req.rawBody);
});

app.post('/api/outreach/prospects/:id/prototype-image', async (req, res) => {
  try {
    const file = await parseSingleFileUpload(req);
    if (!file) return res.status(400).json({ error: 'No image file provided' });
    if (!file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'File must be an image' });

    const prospect = await store.getProspect(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

    const ext = (file.originalname.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
    const filePath = `prototype-images/${req.params.id}-${Date.now()}.${ext}`;
    const bucket = admin.storage().bucket('bliss-agents-outreach.firebasestorage.app');
    const bucketFile = bucket.file(filePath);
    const token = crypto.randomUUID();
    await bucketFile.save(file.buffer, {
      metadata: { contentType: file.mimetype, metadata: { firebaseStorageDownloadTokens: token } },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
    const updated = await store.updateProspect(req.params.id, { prototypeImageUrl: url });
    res.json(updated);
  } catch (error) {
    console.error('prototype-image upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/outreach/prospects/:id/prototype-image', async (req, res) => {
  try {
    const updated = await store.updateProspect(req.params.id, { prototypeImageUrl: admin.firestore.FieldValue.delete() });
    res.json(updated);
  } catch (error) {
    console.error('prototype-image delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Shared, non-prospect-specific email assets (e.g. the signature banner
// image) — not exposed in the UI, just a way to push a replacement asset
// without a full redeploy.
app.post('/api/outreach/assets/:name', async (req, res) => {
  try {
    const file = await parseSingleFileUpload(req);
    if (!file) return res.status(400).json({ error: 'No file provided' });
    const safeName = req.params.name.replace(/[^a-zA-Z0-9_.-]/g, '');
    const filePath = `email-assets/${safeName}`;
    const bucket = admin.storage().bucket('bliss-agents-outreach.firebasestorage.app');
    const bucketFile = bucket.file(filePath);
    const token = crypto.randomUUID();
    await bucketFile.save(file.buffer, {
      metadata: { contentType: file.mimetype, metadata: { firebaseStorageDownloadTokens: token } },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;
    res.json({ url });
  } catch (error) {
    console.error('asset upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/outreach/track-open/:id', async (req, res) => {
  try {
    const prospect = await store.getProspect(req.params.id);
    if (prospect && !prospect.emailOpenedAt) {
      await store.updateProspect(req.params.id, { emailOpenedAt: new Date().toISOString() });
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
  if (!HAS_AI_KEY) return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY secret)' });
  try {
    const prospects = await store.loadProspects();
    const missing = prospects.filter(p => !p.draftEmailBody);
    const enriched = await enrichProspectsConcurrently(getOpenAI(), missing);
    for (const p of enriched) {
      const { id, ...patch } = p;
      await store.updateProspect(id, patch);
    }
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
  if (!HAS_AI_KEY) return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY secret)' });
  try {
    const prospects = await store.loadProspects();
    const pending = prospects.filter(p => p.draftEmailBody && !p.emailSentAt && !p.emailApproved);
    const openai = getOpenAI();
    // Deliberately low concurrency + counting real successes (not attempts) —
    // enrichProspect silently falls back to {} on failure (e.g. Gemini 429),
    // which previously made this report "updated: N" even when nothing changed.
    let updatedCount = 0;
    let index = 0;
    const workers = Array.from({ length: Math.min(2, pending.length) }, async () => {
      while (index < pending.length) {
        const prospect = pending[index++];
        const enrichment = await enrichProspect(openai, prospect);
        if (Object.keys(enrichment).length) {
          await store.updateProspect(prospect.id, enrichment);
          updatedCount += 1;
        }
      }
    });
    await Promise.all(workers);
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
  if (!HAS_AI_KEY) return res.status(500).json({ error: 'No AI API key configured (set GEMINI_API_KEY or GROQ_API_KEY secret)' });
  try {
    const prospects = await store.loadProspects();
    const missing = prospects.filter(p => p.emailSentAt && !p.promoEmailBody);
    let updatedCount = 0;
    let index = 0;
    const workers = Array.from({ length: Math.min(2, missing.length) }, async () => {
      while (index < missing.length) {
        const prospect = missing[index++];
        const promoDraft = await draftPromoForSentProspect(prospect);
        if (Object.keys(promoDraft).length) {
          await store.updateProspect(prospect.id, promoDraft);
          updatedCount += 1;
        }
      }
    });
    await Promise.all(workers);
    res.json({ updated: updatedCount, attempted: missing.length });
  } catch (error) {
    console.error('draft-missing-promos error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/scrape-email/:id', async (req, res) => {
  try {
    const prospect = await store.getProspect(req.params.id);
    if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
    if (!prospect.website) return res.status(400).json({ error: 'Prospect has no website to scrape' });
    const email = await emailScraper.scrapeEmailFromWebsite(prospect.website);
    if (!email) return res.json({ found: false, prospect });
    const updated = await store.updateProspect(req.params.id, { email });
    res.json({ found: true, prospect: updated });
  } catch (error) {
    console.error('scrape-email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// TEMPORARY diagnostic — tests the exact Custom Search key/cx server-side
// without ever exposing the raw value, to isolate whether the problem is the
// key itself, the cx, or the API's enablement state. Remove after debugging.
app.get('/api/outreach/debug-custom-search', async (req, res) => {
  const key = (process.env.BLISS_AGENT_CUSTOM_SEARCH_ENG || '').trim();
  const cx = (process.env.GOOGLE_CUSTOM_SEARCH_CX || '').trim();
  const result = {
    keyPresent: !!key, keyLength: key.length, keyLast4: key.slice(-4),
    cxPresent: !!cx, cxValue: cx,
  };

  // Test 1: does this exact key work against Places API (New) — a different
  // API we KNOW is enabled on this project. Proves the key itself is valid
  // and bound to the right project, independent of Custom Search's own state.
  try {
    const placesRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id',
      },
      body: JSON.stringify({ textQuery: 'test' }),
    });
    const placesData = await placesRes.json();
    result.placesApiTest = placesData.error
      ? { ok: false, status: placesData.error.status, message: placesData.error.message }
      : { ok: true, resultCount: (placesData.places || []).length };
  } catch (e) {
    result.placesApiTest = { ok: false, exception: e.message };
  }

  // Test 2: the actual Custom Search call, with the full raw error preserved.
  try {
    const csRes = await fetch(`https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}&q=test`);
    const csData = await csRes.json();
    result.customSearchTest = csData.error
      ? { ok: false, code: csData.error.code, status: csData.error.status, message: csData.error.message, errors: csData.error.errors }
      : { ok: true, resultCount: (csData.items || []).length };
  } catch (e) {
    result.customSearchTest = { ok: false, exception: e.message };
  }

  res.json(result);
});

app.post('/api/outreach/scrape-missing-emails', async (req, res) => {
  try {
    const prospects = await store.loadProspects();
    const targets = prospects.filter(p => p.website && !p.email);
    let foundCount = 0;
    let next = 0;
    const workers = Array.from({ length: Math.min(5, targets.length) }, async () => {
      while (next < targets.length) {
        const p = targets[next++];
        try {
          const email = await emailScraper.scrapeEmailFromWebsite(p.website);
          if (email) {
            await store.updateProspect(p.id, { email });
            foundCount += 1;
          }
        } catch (e) {
          console.error(`[scrape-missing-emails] Failed for "${p.businessName}":`, e.message);
        }
      }
    });
    await Promise.all(workers);
    res.json({ scanned: targets.length, found: foundCount });
  } catch (error) {
    console.error('scrape-missing-emails error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/outreach/settings', async (req, res) => {
  res.json(await store.loadSettings());
});

app.put('/api/outreach/settings', async (req, res) => {
  res.json(await store.saveSettings({ ...(await store.loadSettings()), ...req.body }));
});

const runDiscoveryAndSave = async () => {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const settings = await store.loadSettings();
  const existingProspects = await store.loadProspects();
  const excludedIdentifiers = await store.loadExcludedIdentifiers();

  const found = await prospectFinder.runDailyDiscovery({ apiKey, existingProspects, settings, excludedIdentifiers });
  if (found.length > 0) {
    const enriched = HAS_AI_KEY ? await enrichProspectsConcurrently(getOpenAI(), found) : found;
    await store.bulkAddProspects(enriched);
  }

  await store.saveSettings({ ...settings, lastRunDate: new Date().toISOString().slice(0, 10) });
  return found;
};

app.post('/api/outreach/find-prospects', async (req, res) => {
  if (!process.env.GOOGLE_PLACES_API_KEY) return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY secret is not set' });
  try {
    const { cities, businessTypes, countPerType } = req.body;
    if (cities || businessTypes || countPerType) {
      await store.saveSettings({
        ...(await store.loadSettings()),
        ...(cities && { cities }),
        ...(businessTypes && { businessTypes }),
        ...(countPerType && { countPerType }),
      });
    }
    const found = await runDiscoveryAndSave();
    res.json({ found });
  } catch (error) {
    console.error('find-prospects error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/import-therapy-directory', async (req, res) => {
  try {
    const { count } = req.body || {};
    const existingProspects = await store.loadProspects();
    const excludedIdentifiers = await store.loadExcludedIdentifiers();
    const found = await directoryImporter.importTherapyInLondon({ existingProspects, excludedIdentifiers, count: count || 20 });
    if (found.length > 0) {
      const enriched = HAS_AI_KEY ? await enrichProspectsConcurrently(getOpenAI(), found) : found;
      await store.bulkAddProspects(enriched);
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
    const existingProspects = await store.loadProspects();
    const excludedIdentifiers = await store.loadExcludedIdentifiers();
    const found = await directoryImporter.importCounsellingDirectory({ existingProspects, excludedIdentifiers, count: count || 30 });
    if (found.length > 0) {
      await store.bulkAddProspects(found);
    }
    res.json({ imported: found.length, found });
  } catch (error) {
    console.error('import-counselling-directory error:', error);
    res.status(500).json({ error: error.message });
  }
});


app.get('/api/outreach/freelancer-types', (req, res) => {
  res.json({ types: freelancerFinder.FREELANCER_TYPES });
});

app.post('/api/outreach/find-freelancers', async (req, res) => {
  if (!process.env.BLISS_AGENT_CUSTOM_SEARCH_ENG || !process.env.GOOGLE_CUSTOM_SEARCH_CX) {
    return res.status(500).json({ error: 'BLISS_AGENT_CUSTOM_SEARCH_ENG / GOOGLE_CUSTOM_SEARCH_CX secrets are not set' });
  }
  try {
    const { cities, freelancerTypes, countPerType } = req.body;
    if (!freelancerTypes?.length) {
      return res.status(400).json({ error: 'freelancerTypes is required' });
    }
    const existingProspects = await store.loadProspects();
    const excludedIdentifiers = await store.loadExcludedIdentifiers();
    const found = await freelancerFinder.runFreelancerDiscovery({
      apiKey: (process.env.BLISS_AGENT_CUSTOM_SEARCH_ENG || '').trim(),
      cx: (process.env.GOOGLE_CUSTOM_SEARCH_CX || '').trim(),
      existingProspects, cities, freelancerTypes, countPerType: countPerType || 5, excludedIdentifiers,
    });
    if (found.length > 0) {
      const enriched = HAS_AI_KEY ? await enrichProspectsConcurrently(getOpenAI(), found) : found;
      await store.bulkAddProspects(enriched);
    }
    res.json({ found });
  } catch (error) {
    console.error('find-freelancers error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 256MiB (the default) was getting OOM-killed on the /research endpoint —
// fetching a few pages of a prospect's site plus the rest of the app's normal
// footprint (express, openai, firebase-admin) pushed past it.
exports.api = onRequest({ secrets: API_SECRETS, cors: true, timeoutSeconds: 300, memory: '512MiB' }, app);

exports.dailyProspectDiscovery = onSchedule(
  { schedule: 'every day 08:00', timeZone: 'Asia/Kolkata', secrets: DISCOVERY_SECRETS, timeoutSeconds: 540 },
  async () => {
    try {
      const found = await runDiscoveryAndSave();
      console.log(`[daily discovery] Added ${found.length} new prospects.`);
    } catch (error) {
      console.error('[daily discovery] Failed:', error.message);
    }
  }
);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Sends a small batch of already-approved emails, paced to look human (a few per
// hour, capped per day) rather than firing the whole daily quota at once. Never
// sends anything the user hasn't explicitly approved first.
const sendApprovedBatch = async () => {
  const settings = await store.loadSettings();
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
  const prospects = await store.loadProspects();
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
      // The prototype image, if attached, only makes sense on the first
      // email — a follow-up/promo re-sending it would be a repeat, not new
      // information.
      const prototypeImageUrl = kind === 'initial' ? prospect.prototypeImageUrl : undefined;
      await emailSender.sendEmail({ to: prospect.email, subject, body, fromName: 'Shruti | SKRM Bliss AI', trackingUrl, prototypeImageUrl });

      if (kind === 'initial') {
        const followUpDate = new Date();
        followUpDate.setDate(followUpDate.getDate() + 3);
        let updated = await store.updateProspect(prospect.id, {
          emailSentAt: now.toISOString(),
          status: prospect.status === 'New' ? 'Contacted' : prospect.status,
          lastContactDate: todayIST,
          followUpDate: followUpDate.toISOString().slice(0, 10),
        });
        const followUpDraft = await draftFollowUpForSentProspect(updated);
        if (Object.keys(followUpDraft).length) updated = await store.updateProspect(prospect.id, followUpDraft);
        const promoDraft = await draftPromoForSentProspect(updated);
        if (Object.keys(promoDraft).length) await store.updateProspect(prospect.id, promoDraft);
      } else if (kind === 'followup') {
        await store.updateProspect(prospect.id, { followUpSentAt: now.toISOString(), lastContactDate: todayIST });
      } else {
        const nextEligible = new Date();
        nextEligible.setDate(nextEligible.getDate() + 15);
        await store.updateProspect(prospect.id, {
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

  await store.saveSettings({ ...settings, emailsSentToday: emailsSentToday + sentCount, emailSendDate: todayIST });
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

exports.sendApprovedEmailBatch = onSchedule(
  { schedule: 'every 1 hours', secrets: ['EMAIL_USER', 'EMAIL_PASS'] },
  async () => {
    try {
      const result = await sendApprovedBatch();
      console.log(`[email queue] Sent ${result.sent} email(s).`, result.reason || '');
    } catch (error) {
      console.error('[email queue] Failed:', error.message);
    }
  }
);
