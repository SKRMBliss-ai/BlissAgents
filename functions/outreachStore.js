const { getFirestore } = require('firebase-admin/firestore');

const db = () => getFirestore();

const loadProspects = async () => {
  const snap = await db().collection('prospects').orderBy('createdAt', 'desc').get();
  return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

const getProspect = async (id) => {
  const doc = await db().collection('prospects').doc(id).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
};

const createProspect = async (fields) => {
  const now = new Date().toISOString();
  const data = {
    businessName: '', businessType: '', website: '', instagram: '',
    contactPerson: '', email: '', whatsapp: '', digitalGaps: [], recommendedService: '',
    draftMessage: '', notes: '', status: 'New', createdAt: now,
    lastContactDate: null, followUpDate: null,
    ...fields,
  };
  const ref = await db().collection('prospects').add(data);
  return { id: ref.id, ...data };
};

const updateProspect = async (id, patch) => {
  const ref = db().collection('prospects').doc(id);
  await ref.update(patch);
  const doc = await ref.get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
};

const deleteProspect = async (id) => {
  await db().collection('prospects').doc(id).delete();
};

const bulkAddProspects = async (prospectFields) => {
  const batch = db().batch();
  const now = new Date().toISOString();
  const created = [];
  for (const fields of prospectFields) {
    const ref = db().collection('prospects').doc();
    const data = {
      digitalGaps: [], recommendedService: '', draftMessage: '', status: 'New',
      createdAt: now, lastContactDate: null, followUpDate: null,
      ...fields,
    };
    batch.set(ref, data);
    created.push({ id: ref.id, ...data });
  }
  await batch.commit();
  return created;
};

const DEFAULT_SETTINGS = {
  cities: ['Abu Dhabi', 'Riyadh', 'Sydney', 'Toronto', 'Singapore', 'Dublin', 'Amsterdam'],
  businessTypes: ['Hotel/Homestay', 'Restaurant/Café', 'Coaching Institute', 'Wellness Business'],
  countPerType: 3,
  dailyRunHour: 8,
  lastRunDate: null,
  dailyEmailSendLimit: 20,
  emailsPerBatch: 2,
  emailSendWindowStartHour: 9,
  emailSendWindowEndHour: 20,
  emailsSentToday: 0,
  emailSendDate: null,
};

const loadSettings = async () => {
  const doc = await db().collection('settings').doc('outreach').get();
  return doc.exists ? { ...DEFAULT_SETTINGS, ...doc.data() } : DEFAULT_SETTINGS;
};

const saveSettings = async (settings) => {
  await db().collection('settings').doc('outreach').set(settings, { merge: true });
  return loadSettings();
};

module.exports = {
  loadProspects, getProspect, createProspect, updateProspect, deleteProspect,
  bulkAddProspects, loadSettings, saveSettings,
};
