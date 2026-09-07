const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');

admin.initializeApp();

const store = require('./outreachStore');
const prospectFinder = require('./prospectFinder');
const freelancerFinder = require('./freelancerFinder');
const aiHelpers = require('./aiHelpers');
const emailSender = require('./emailSender');

const API_SECRETS = [
  'GEMINI_API_KEY', 'GOOGLE_PLACES_API_KEY', 'EMAIL_USER', 'EMAIL_PASS',
  'BlissAgentCustomSearchEng', 'GOOGLE_CUSTOM_SEARCH_CX',
];
const DISCOVERY_SECRETS = ['GOOGLE_PLACES_API_KEY', 'GEMINI_API_KEY'];

const getOpenAI = () => new OpenAI({
  apiKey: process.env.GEMINI_API_KEY || 'not-set',
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

// Auto-drafts gap-suggestion + a full email for a freshly-found prospect, so it's
// ready to review the moment it lands in the pipeline — no manual "Suggest Gaps"
// / "Draft Email" clicks needed for the common case. Never sends anything; this
// only prepares a draft, which is still reviewed/approved/sent by the user.
const enrichProspect = async (openai, prospect) => {
  try {
    const gaps = await aiHelpers.suggestGaps(openai, {
      businessName: prospect.businessName, businessType: prospect.businessType, notes: prospect.notes,
    });
    const email = await aiHelpers.draftEmail(openai, {
      businessName: prospect.businessName, businessType: prospect.businessType, contactPerson: prospect.contactPerson,
      digitalGaps: gaps.digitalGaps, recommendedService: gaps.recommendedService,
    });
    return {
      digitalGaps: gaps.digitalGaps, recommendedService: gaps.recommendedService,
      draftEmailSubject: email.subject, draftEmailBody: email.body,
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
  if (process.env.GEMINI_API_KEY) {
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

app.post('/api/outreach/suggest-gaps', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY secret is not set' });
  try {
    res.json(await aiHelpers.suggestGaps(getOpenAI(), req.body));
  } catch (error) {
    console.error('suggest-gaps error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/draft-message', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY secret is not set' });
  try {
    const message = await aiHelpers.draftMessage(getOpenAI(), req.body);
    res.json({ message });
  } catch (error) {
    console.error('draft-message error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/outreach/draft-email', async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY secret is not set' });
  try {
    const email = await aiHelpers.draftEmail(getOpenAI(), req.body);
    res.json(email);
  } catch (error) {
    console.error('draft-email error:', error);
    res.status(500).json({ error: error.message });
  }
});

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
    await emailSender.sendEmail({ to: prospect.email, subject, body, fromName: 'Shruti | SKRM Bliss AI', trackingUrl });

    const today = new Date().toISOString().slice(0, 10);
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + 3);
    const updated = await store.updateProspect(prospectId, {
      status: prospect.status === 'New' ? 'Contacted' : prospect.status,
      lastContactDate: today,
      followUpDate: followUpDate.toISOString().slice(0, 10),
      draftEmailSubject: subject,
      draftEmailBody: body,
    });
    res.json({ message: 'Email sent', prospect: updated });
  } catch (error) {
    console.error('send-email error:', error);
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

  const found = await prospectFinder.runDailyDiscovery({ apiKey, existingProspects, settings });
  if (found.length > 0) {
    const enriched = process.env.GEMINI_API_KEY ? await enrichProspectsConcurrently(getOpenAI(), found) : found;
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

app.get('/api/outreach/freelancer-types', (req, res) => {
  res.json({ types: freelancerFinder.FREELANCER_TYPES });
});

app.post('/api/outreach/find-freelancers', async (req, res) => {
  if (!process.env.BlissAgentCustomSearchEng || !process.env.GOOGLE_CUSTOM_SEARCH_CX) {
    return res.status(500).json({ error: 'BlissAgentCustomSearchEng / GOOGLE_CUSTOM_SEARCH_CX secrets are not set' });
  }
  try {
    const { cities, freelancerTypes, countPerType } = req.body;
    if (!freelancerTypes?.length) {
      return res.status(400).json({ error: 'freelancerTypes is required' });
    }
    const existingProspects = await store.loadProspects();
    const found = await freelancerFinder.runFreelancerDiscovery({
      apiKey: (process.env.BlissAgentCustomSearchEng || '').trim(),
      cx: (process.env.GOOGLE_CUSTOM_SEARCH_CX || '').trim(),
      existingProspects, cities, freelancerTypes, countPerType: countPerType || 5,
    });
    if (found.length > 0) {
      const enriched = process.env.GEMINI_API_KEY ? await enrichProspectsConcurrently(getOpenAI(), found) : found;
      await store.bulkAddProspects(enriched);
    }
    res.json({ found });
  } catch (error) {
    console.error('find-freelancers error:', error);
    res.status(500).json({ error: error.message });
  }
});

exports.api = onRequest({ secrets: API_SECRETS, cors: true, timeoutSeconds: 300 }, app);

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
  const queue = prospects
    .filter(p => p.emailApproved && !p.emailSentAt && p.email)
    .sort((a, b) => (a.approvedAt || a.createdAt || '').localeCompare(b.approvedAt || b.createdAt || ''))
    .slice(0, batchSize);

  let sentCount = 0;
  for (const prospect of queue) {
    try {
      const trackingUrl = `https://bliss-agents-outreach.web.app/api/outreach/track-open/${prospect.id}`;
      await emailSender.sendEmail({
        to: prospect.email, subject: prospect.draftEmailSubject, body: prospect.draftEmailBody,
        fromName: 'Shruti | SKRM Bliss AI', trackingUrl,
      });
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 3);
      await store.updateProspect(prospect.id, {
        emailSentAt: now.toISOString(),
        status: prospect.status === 'New' ? 'Contacted' : prospect.status,
        lastContactDate: todayIST,
        followUpDate: followUpDate.toISOString().slice(0, 10),
      });
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
