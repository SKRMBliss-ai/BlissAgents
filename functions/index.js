const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai');

admin.initializeApp();

const store = require('./outreachStore');
const prospectFinder = require('./prospectFinder');
const aiHelpers = require('./aiHelpers');
const emailSender = require('./emailSender');

const API_SECRETS = ['GEMINI_API_KEY', 'GOOGLE_PLACES_API_KEY', 'EMAIL_USER', 'EMAIL_PASS'];
const DISCOVERY_SECRETS = ['GOOGLE_PLACES_API_KEY'];

const getOpenAI = () => new OpenAI({
  apiKey: process.env.GEMINI_API_KEY || 'not-set',
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
});

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

app.get('/api/outreach/prospects', async (req, res) => {
  res.json(await store.loadProspects());
});

app.post('/api/outreach/prospects', async (req, res) => {
  const prospect = await store.createProspect(req.body);
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

    await emailSender.sendEmail({ to: prospect.email, subject, body, fromName: 'Shruti | SKRM Bliss AI' });

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
  if (found.length > 0) await store.bulkAddProspects(found);

  await store.saveSettings({ ...settings, lastRunDate: new Date().toISOString().slice(0, 10) });
  return found;
};

app.post('/api/outreach/find-prospects', async (req, res) => {
  if (!process.env.GOOGLE_PLACES_API_KEY) return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY secret is not set' });
  try {
    const { city, businessTypes, countPerType } = req.body;
    if (city || businessTypes || countPerType) {
      await store.saveSettings({
        ...(await store.loadSettings()),
        ...(city && { city }),
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

exports.api = onRequest({ secrets: API_SECRETS, cors: true }, app);

exports.dailyProspectDiscovery = onSchedule(
  { schedule: 'every day 08:00', timeZone: 'Asia/Kolkata', secrets: DISCOVERY_SECRETS },
  async () => {
    try {
      const found = await runDiscoveryAndSave();
      console.log(`[daily discovery] Added ${found.length} new prospects.`);
    } catch (error) {
      console.error('[daily discovery] Failed:', error.message);
    }
  }
);
