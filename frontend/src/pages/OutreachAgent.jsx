import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Sparkles, MessageSquare, Trash2, X,
  AlertCircle, CheckCircle2, Star, ChevronDown, ChevronUp, Loader2,
  Send, Repeat, Mail, Phone, Compass, ArrowUpDown,
} from 'lucide-react';

const API = import.meta.env.PROD ? '/api/outreach' : 'http://localhost:3001/api/outreach';

const STATUSES = ['New', 'Contacted', 'No Response', 'Interested', 'Meeting Booked', 'Client', 'Not Interested'];
const BUSINESS_TYPES = [
  'Hotel/Homestay', 'Restaurant/Café', 'Coaching Institute', 'Wellness Business',
  'Clinic', 'Small Manufacturer', 'Real Estate', 'Consultant', 'Local Retailer', 'Startup',
  'Laughter Yoga', 'Yoga Studio', 'Counsellor/Therapist', 'Art/Design Studio', 'Other',
];
// Tier 1: highest priority. Tier 2: strong opportunities, less saturated.
// Tier 3: emerging markets worth testing.
const TIER_1_CITIES = ['Abu Dhabi', 'Riyadh', 'Sydney', 'Toronto', 'Singapore', 'Dublin', 'Amsterdam'];
const TIER_2_CITIES = ['Manila', 'Ho Chi Minh City', 'Auckland', 'Vienna', 'Brussels', 'Lisbon', 'Stockholm', 'Copenhagen', 'Oslo', 'Helsinki', 'Zurich'];
const TIER_3_CITIES = ['Mexico City', 'Cairo', 'Nairobi', 'Lagos', 'Warsaw', 'Prague', 'Bucharest', 'Budapest', 'Tallinn'];
const DEFAULT_CITIES = [...TIER_1_CITIES, ...TIER_2_CITIES, ...TIER_3_CITIES];

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysSince = (iso) => {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
};
const addDays = (iso, n) => {
  const d = iso ? new Date(iso) : new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const statusColor = {
  'New': 'bg-gray-700 text-gray-200',
  'Contacted': 'bg-blue-900/50 text-blue-300 border border-blue-800/50',
  'No Response': 'bg-orange-900/50 text-orange-300 border border-orange-800/50',
  'Interested': 'bg-green-900/50 text-green-300 border border-green-800/50',
  'Meeting Booked': 'bg-purple-900/50 text-purple-300 border border-purple-800/50',
  'Client': 'bg-pink-900/50 text-pink-300 border border-pink-800/50',
  'Not Interested': 'bg-gray-800 text-gray-500 border border-gray-700',
};

const emptyForm = {
  businessName: '', businessType: BUSINESS_TYPES[0], website: '', instagram: '',
  contactPerson: '', email: '', whatsapp: '', notes: '',
};

const whatsappLink = (whatsapp, message) => {
  const digits = (whatsapp || '').replace(/[^\d+]/g, '');
  if (!digits) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${digits.replace(/^\+/, '')}${text}`;
};

// Places API only returns a generic "website" field, but many small businesses
// list their Facebook/Instagram/YouTube page there instead of a real site —
// detect that so it's labeled usefully rather than shown as a plain "Website".
const detectLinkType = (url) => {
  if (!url) return null;
  const host = url.toLowerCase();
  if (host.includes('facebook.com') || host.includes('fb.com')) return 'Facebook';
  if (host.includes('instagram.com')) return 'Instagram';
  if (host.includes('twitter.com') || host.includes('x.com')) return 'Twitter/X';
  if (host.includes('youtube.com') || host.includes('youtu.be')) return 'YouTube';
  if (host.includes('linkedin.com')) return 'LinkedIn';
  if (host.includes('behance.net')) return 'Behance';
  return 'Website';
};

// Cheap-builder / free-subdomain platforms are a real signal of a dated or
// never-upgraded site (factual from the URL itself, no need to crawl it).
const DATED_PLATFORM_HINTS = [
  'wixsite.com', 'weebly.com', 'blogspot.com', 'godaddysites.com', 'jimdo.com',
  'sites.google.com', '.wordpress.com', 'webs.com', 'yolasite.com',
];

const OUTREACH_CATEGORIES = {
  no_website: { label: 'No Website', color: 'bg-red-900/40 border-red-600 text-red-300', rank: 0 },
  outdated_website: { label: 'Outdated Website', color: 'bg-orange-900/40 border-orange-600 text-orange-300', rank: 1 },
  established_website: { label: 'Established Website', color: 'bg-gray-800 border-gray-600 text-gray-400', rank: 3 },
  social_only: { label: 'Social Presence Only', color: 'bg-purple-900/40 border-purple-600 text-purple-300', rank: 2 },
  needs_manual_contact: { label: 'Individual (Freelancer)', color: 'bg-indigo-900/40 border-indigo-600 text-indigo-300', rank: 4 },
};

const deriveCategory = (p) => {
  if (p.needsManualContact) return 'needs_manual_contact';
  if (!p.website) return 'no_website';
  const linkType = detectLinkType(p.website);
  if (linkType !== 'Website') return 'social_only';
  const isDated = DATED_PLATFORM_HINTS.some(hint => p.website.toLowerCase().includes(hint)) || p.website.toLowerCase().startsWith('http://');
  return isDated ? 'outdated_website' : 'established_website';
};

const googleSearchLink = (businessName, notes) => {
  const location = (notes || '').split('·')[0]?.trim() || '';
  return `https://www.google.com/search?q=${encodeURIComponent(`${businessName} ${location}`.trim())}`;
};

function OutreachAgent() {
  const [prospects, setProspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [expandedId, setExpandedId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [settings, setSettings] = useState(null);
  const [findingProspects, setFindingProspects] = useState(false);
  const [findError, setFindError] = useState('');
  const [findResultCount, setFindResultCount] = useState(null);
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [freelancerTypes, setFreelancerTypes] = useState([]);
  const [selectedFreelancerTypes, setSelectedFreelancerTypes] = useState([]);
  const [freelancerCities, setFreelancerCities] = useState([]);
  const [findingFreelancers, setFindingFreelancers] = useState(false);
  const [freelancerError, setFreelancerError] = useState('');
  const [freelancerResultCount, setFreelancerResultCount] = useState(null);

  const fetchProspects = async () => {
    const res = await fetch(`${API}/prospects`);
    setProspects(await res.json());
    setLoading(false);
  };

  const fetchSettings = async () => {
    const res = await fetch(`${API}/settings`);
    setSettings(await res.json());
  };

  const fetchFreelancerTypes = async () => {
    try {
      const res = await fetch(`${API}/freelancer-types`);
      const data = await res.json();
      setFreelancerTypes(data.types || []);
    } catch (e) { /* endpoint optional; ignore if unavailable */ }
  };

  useEffect(() => { fetchProspects(); fetchSettings(); fetchFreelancerTypes(); }, []);

  const toggleFreelancerType = (type) => {
    setSelectedFreelancerTypes(prev => prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]);
  };

  const handleFindFreelancers = async () => {
    if (selectedFreelancerTypes.length === 0) return alert('Pick at least one category.');
    setFindingFreelancers(true);
    setFreelancerError('');
    setFreelancerResultCount(null);
    try {
      const res = await fetch(`${API}/find-freelancers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cities: freelancerCities.length ? freelancerCities : undefined, freelancerTypes: selectedFreelancerTypes, countPerType: 5 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFreelancerResultCount(data.found.length);
      await fetchProspects();
    } catch (e) {
      setFreelancerError(e.message);
    } finally {
      setFindingFreelancers(false);
    }
  };

  const saveSettings = async (patch) => {
    const res = await fetch(`${API}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    setSettings(await res.json());
  };

  const handleFindProspects = async () => {
    setFindingProspects(true);
    setFindError('');
    setFindResultCount(null);
    try {
      const res = await fetch(`${API}/find-prospects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setFindResultCount(data.found.length);
      await fetchProspects();
    } catch (e) {
      setFindError(e.message);
    } finally {
      setFindingProspects(false);
    }
  };

  const toggleBusinessType = (type) => {
    const current = settings.businessTypes || [];
    const next = current.includes(type) ? current.filter(t => t !== type) : [...current, type];
    setSettings(s => ({ ...s, businessTypes: next }));
    saveSettings({ businessTypes: next });
  };

  const toggleCity = (city) => {
    const current = settings.cities || [];
    const next = current.includes(city) ? current.filter(c => c !== city) : [...current, city];
    setSettings(s => ({ ...s, cities: next }));
    saveSettings({ cities: next });
  };

  const toggleFreelancerCity = (city) => {
    setFreelancerCities(prev => prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]);
  };

  const updateProspect = async (id, patch) => {
    const res = await fetch(`${API}/prospects/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const updated = await res.json();
    setProspects(prev => prev.map(p => (p.id === id ? updated : p)));
    return updated;
  };

  const addProspect = async () => {
    if (!form.businessName.trim()) return alert('Business name is required.');
    const res = await fetch(`${API}/prospects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const created = await res.json();
    setProspects(prev => [created, ...prev]);
    setForm(emptyForm);
    setShowAddModal(false);
    setExpandedId(created.id);
  };

  const deleteProspect = async (id) => {
    if (!confirm('Delete this prospect?')) return;
    await fetch(`${API}/prospects/${id}`, { method: 'DELETE' });
    setProspects(prev => prev.filter(p => p.id !== id));
  };

  const handleSuggestGaps = async (p) => {
    setBusyId(p.id + '-gaps');
    try {
      const res = await fetch(`${API}/suggest-gaps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: p.businessName, businessType: p.businessType, notes: p.notes }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await updateProspect(p.id, { digitalGaps: data.digitalGaps, recommendedService: data.recommendedService });
    } catch (e) {
      alert('Could not suggest gaps: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDraftMessage = async (p) => {
    setBusyId(p.id + '-msg');
    try {
      const res = await fetch(`${API}/draft-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: p.businessName, businessType: p.businessType, contactPerson: p.contactPerson,
          digitalGaps: p.digitalGaps, recommendedService: p.recommendedService,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await updateProspect(p.id, { draftMessage: data.message });
    } catch (e) {
      alert('Could not draft message: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleDraftEmail = async (p) => {
    setBusyId(p.id + '-email');
    try {
      const res = await fetch(`${API}/draft-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: p.businessName, businessType: p.businessType, contactPerson: p.contactPerson,
          digitalGaps: p.digitalGaps, recommendedService: p.recommendedService, notes: p.notes,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await updateProspect(p.id, { draftEmailSubject: data.subject, draftEmailBody: data.body });
    } catch (e) {
      alert('Could not draft email: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleSendEmail = async (p) => {
    if (!p.email) return alert('This prospect has no email address.');
    if (!confirm(`Send this email to ${p.email} now?`)) return;
    setBusyId(p.id + '-send');
    try {
      const res = await fetch(`${API}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: p.id, subject: p.draftEmailSubject, body: p.draftEmailBody }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProspects(prev => prev.map(x => (x.id === p.id ? data.prospect : x)));
    } catch (e) {
      alert('Could not send email: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveEmail = (p) => updateProspect(p.id, {
    emailApproved: true, approvedAt: new Date().toISOString(),
  });

  const handleUnapproveEmail = (p) => updateProspect(p.id, { emailApproved: false });

  // For when you write/send the email yourself outside the app entirely (e.g.
  // AI drafting is rate-limited, or you just prefer to) — logs it the same way
  // an in-app send would, and stops the daily queue from also sending it.
  const handleMarkEmailSentManually = (p) => updateProspect(p.id, {
    emailSentAt: new Date().toISOString(),
    status: p.status === 'New' ? 'Contacted' : p.status,
    lastContactDate: todayStr(),
    followUpDate: addDays(todayStr(), 3),
  });

  const handleUnmarkEmailSent = (p) => updateProspect(p.id, { emailSentAt: null });

  const handleMarkWhatsAppSent = (p) => updateProspect(p.id, {
    whatsappSentAt: new Date().toISOString(),
    status: p.status === 'New' ? 'Contacted' : p.status,
    lastContactDate: todayStr(),
    followUpDate: addDays(todayStr(), 3),
  });

  const handleUnmarkWhatsAppSent = (p) => updateProspect(p.id, { whatsappSentAt: null });

  const handleMarkWhatsAppInvalid = (p) => updateProspect(p.id, { whatsappInvalid: true });
  const handleUnmarkWhatsAppInvalid = (p) => updateProspect(p.id, { whatsappInvalid: false });

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const eligibleForWhatsAppSend = (p) => p.whatsapp && p.draftMessage && !p.whatsappInvalid;

  const toggleSelectAllVisible = () => {
    const eligible = sortedProspects.filter(eligibleForWhatsAppSend);
    const allSelected = eligible.length > 0 && eligible.every(p => selectedIds.has(p.id));
    setSelectedIds(allSelected ? new Set() : new Set(eligible.map(p => p.id)));
  };

  const [draftingMissing, setDraftingMissing] = useState(false);
  const missingDraftCount = prospects.filter(p => !p.draftEmailBody).length;

  const handleDraftMissing = async () => {
    setDraftingMissing(true);
    try {
      const res = await fetch(`${API}/draft-missing`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchProspects();
    } catch (e) {
      alert('Could not draft missing emails: ' + e.message);
    } finally {
      setDraftingMissing(false);
    }
  };

  const [scrapingEmails, setScrapingEmails] = useState(false);
  const [scrapeResult, setScrapeResult] = useState(null);
  const missingEmailWithWebsiteCount = prospects.filter(p => p.website && !p.email).length;

  const handleScrapeMissingEmails = async () => {
    setScrapingEmails(true);
    setScrapeResult(null);
    try {
      const res = await fetch(`${API}/scrape-missing-emails`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setScrapeResult(data);
      await fetchProspects();
    } catch (e) {
      alert('Could not scrape emails: ' + e.message);
    } finally {
      setScrapingEmails(false);
    }
  };

  const handleScrapeOneEmail = async (p) => {
    setBusyId(p.id + '-scrape');
    try {
      const res = await fetch(`${API}/scrape-email/${p.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (!data.found) alert('No email found on their website.');
      setProspects(prev => prev.map(x => (x.id === p.id ? data.prospect : x)));
    } catch (e) {
      alert('Could not scrape email: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  // Opens each selected prospect's WhatsApp chat with the draft message
  // pre-filled in the compose box — you still click Send yourself in each tab.
  // Never sends anything automatically.
  const handleBulkSendWhatsApp = () => {
    const targets = prospects.filter(p => selectedIds.has(p.id) && eligibleForWhatsAppSend(p));
    if (targets.length === 0) return;
    if (!confirm(`Open WhatsApp for ${targets.length} selected prospect${targets.length === 1 ? '' : 's'}? You'll still need to click Send in each one.`)) return;
    targets.forEach(p => window.open(whatsappLink(p.whatsapp, p.draftMessage), '_blank'));
    setSelectedIds(new Set());
  };

  const markContacted = (p) => updateProspect(p.id, {
    status: 'Contacted', lastContactDate: todayStr(), followUpDate: addDays(todayStr(), 3),
  });

  const setStatus = (p, status) => {
    const patch = { status };
    if (status === 'No Response') patch.followUpDate = addDays(todayStr(), 3);
    if (status === 'Interested' || status === 'Meeting Booked' || status === 'Client' || status === 'Not Interested') patch.followUpDate = null;
    updateProspect(p.id, patch);
  };

  const digest = useMemo(() => {
    const dueFollowUps = prospects.filter(p =>
      p.followUpDate && p.followUpDate <= todayStr() &&
      !['Meeting Booked', 'Client', 'Not Interested'].includes(p.status)
    );
    const interested = prospects.filter(p => p.status === 'Interested');
    const newToday = prospects.filter(p => p.status === 'New' && p.createdAt?.slice(0, 10) === todayStr());
    return { dueFollowUps, interested, newToday };
  }, [prospects]);

  const stats = useMemo(() => {
    const total = prospects.length;
    const reachedOut = prospects.filter(p => p.status !== 'New').length;
    const followedUp = prospects.filter(p =>
      ['No Response', 'Interested', 'Meeting Booked', 'Client', 'Not Interested'].includes(p.status)
    ).length;
    const emailsOpened = prospects.filter(p => p.emailOpenedAt).length;
    const queuedForSend = prospects.filter(p => p.emailApproved && !p.emailSentAt).length;
    return { total, reachedOut, followedUp, emailsOpened, queuedForSend };
  }, [prospects]);

  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const p of prospects) {
      const cat = deriveCategory(p);
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [prospects]);

  const sortedProspects = useMemo(() => {
    const filtered = categoryFilter === 'all' ? prospects : prospects.filter(p => deriveCategory(p) === categoryFilter);
    // Contact tier: 0 = has email (reach out now), 1 = has some other contact
    // path (WhatsApp or website — worth a manual look), 2 = totally unreachable
    // (no email/WhatsApp/website at all) — not worth spending time on, so these
    // sink to the bottom regardless of whatever else is sorted.
    const contactTier = (p) => {
      if (p.email) return 0;
      if ((p.whatsapp && !p.whatsappInvalid) || p.website) return 1;
      return 2;
    };

    const sorted = [...filtered].sort((a, b) => {
      const at = contactTier(a);
      const bt = contactTier(b);
      if (at !== bt) return at - bt;

      if (sortBy === 'category') {
        const ar = OUTREACH_CATEGORIES[deriveCategory(a)].rank;
        const br = OUTREACH_CATEGORIES[deriveCategory(b)].rank;
        return sortDir === 'asc' ? ar - br : br - ar;
      }
      const av = a[sortBy] || '';
      const bv = b[sortBy] || '';
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [prospects, sortBy, sortDir, categoryFilter]);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
            Business Outreach Agent
          </h1>
          <p className="text-gray-400 mt-1">Research → Personalize → You Approve → Track Follow-ups</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 px-5 rounded-xl shadow-lg shadow-emerald-900/50 transition-all active:scale-95"
        >
          <Plus className="w-5 h-5" />
          <span>Add Prospect</span>
        </button>
      </header>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard icon={<Users className="w-5 h-5 text-gray-400" />} value={stats.total} label="Prospects" />
        <StatCard icon={<Send className="w-5 h-5 text-blue-400" />} value={stats.reachedOut} label="Reached Out" />
        <StatCard icon={<Repeat className="w-5 h-5 text-orange-400" />} value={stats.followedUp} label="Followed Up" />
        <StatCard icon={<Mail className="w-5 h-5 text-purple-400" />} value={stats.emailsOpened} label="Emails Opened" />
        <StatCard icon={<CheckCircle2 className="w-5 h-5 text-indigo-400" />} value={stats.queuedForSend} label="Queued to Send" />
      </div>

      {missingDraftCount > 0 && (
        <div className="bg-gray-800 rounded-2xl p-4 shadow-xl border border-gray-700 flex items-center justify-between flex-wrap gap-3">
          <span className="text-sm text-gray-300">{missingDraftCount} prospect{missingDraftCount === 1 ? '' : 's'} added before auto-drafting — still missing an email draft.</span>
          <button
            onClick={handleDraftMissing}
            disabled={draftingMissing}
            className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-all"
          >
            {draftingMissing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            <span>Draft All Missing ({missingDraftCount})</span>
          </button>
        </div>
      )}

      {missingEmailWithWebsiteCount > 0 && (
        <div className="bg-gray-800 rounded-2xl p-4 shadow-xl border border-gray-700 space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <span className="text-sm text-gray-300">
              {missingEmailWithWebsiteCount} prospect{missingEmailWithWebsiteCount === 1 ? '' : 's'} have a website but no email on file — worth checking their site for a contact address.
            </span>
            <button
              onClick={handleScrapeMissingEmails}
              disabled={scrapingEmails}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-all"
            >
              {scrapingEmails ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              <span>Find Emails from Websites ({missingEmailWithWebsiteCount})</span>
            </button>
          </div>
          {scrapeResult && (
            <p className="text-xs text-blue-300">Checked {scrapeResult.scanned} website{scrapeResult.scanned === 1 ? '' : 's'}, found {scrapeResult.found} email{scrapeResult.found === 1 ? '' : 's'}.</p>
          )}
        </div>
      )}

      {/* Email Queue Settings */}
      {settings && (
        <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 space-y-3">
          <h2 className="text-lg font-semibold text-white">Daily Email Queue</h2>
          <p className="text-xs text-gray-500">
            Emails you approve get sent automatically in small paced batches — {settings.emailsPerBatch ?? 2} per hour between {settings.emailSendWindowStartHour ?? 9}:00–{settings.emailSendWindowEndHour ?? 20}:00 IST, up to a daily cap. Keeps sending going even on days you can't check in.
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Daily limit</label>
              <input
                type="number" min={1} max={200}
                className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none w-24"
                value={settings.dailyEmailSendLimit ?? 20}
                onChange={e => setSettings(s => ({ ...s, dailyEmailSendLimit: Number(e.target.value) }))}
                onBlur={() => saveSettings({ dailyEmailSendLimit: settings.dailyEmailSendLimit })}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Per batch (hourly)</label>
              <input
                type="number" min={1} max={20}
                className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none w-24"
                value={settings.emailsPerBatch ?? 2}
                onChange={e => setSettings(s => ({ ...s, emailsPerBatch: Number(e.target.value) }))}
                onBlur={() => saveSettings({ emailsPerBatch: settings.emailsPerBatch })}
              />
            </div>
            <div className="text-xs text-gray-500">
              Sent today: {settings.emailSendDate === new Date().toISOString().slice(0, 10) ? (settings.emailsSentToday || 0) : 0} / {settings.dailyEmailSendLimit ?? 20}
            </div>
          </div>
        </div>
      )}

      {/* Prospect Discovery */}
      {settings && (
        <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center space-x-2">
              <Compass className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">Find Today's Prospects</h2>
            </div>
            <p className="text-xs text-gray-500">
              Auto-runs daily at {settings.dailyRunHour}:00 IST via Cloud Scheduler.
              {settings.lastRunDate && ` Last run: ${settings.lastRunDate}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Per category</label>
              <input
                type="number" min={1} max={10}
                className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none w-20"
                value={settings.countPerType}
                onChange={e => setSettings(s => ({ ...s, countPerType: Number(e.target.value) }))}
                onBlur={() => saveSettings({ countPerType: settings.countPerType })}
              />
            </div>
            <button
              onClick={handleFindProspects}
              disabled={findingProspects}
              className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 px-5 rounded-lg transition-all"
            >
              {findingProspects ? <Loader2 className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
              <span>Find Prospects Now</span>
            </button>
          </div>
          <div className="space-y-3">
            <label className="block text-xs text-gray-400">Cities to search</label>
            {[
              { label: 'Tier 1 — Highest priority', cities: TIER_1_CITIES },
              { label: 'Tier 2 — Strong opportunities', cities: TIER_2_CITIES },
              { label: 'Tier 3 — Emerging markets', cities: TIER_3_CITIES },
            ].map(tier => (
              <div key={tier.label}>
                <div className="text-[10px] uppercase tracking-wider text-gray-600 mb-1">{tier.label}</div>
                <div className="flex flex-wrap gap-2">
                  {tier.cities.map(city => (
                    <button
                      key={city}
                      onClick={() => toggleCity(city)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                        settings.cities?.includes(city)
                          ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300'
                          : 'bg-gray-900 border-gray-700 text-gray-400'
                      }`}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Business types to search</label>
            <div className="flex flex-wrap gap-2">
              {BUSINESS_TYPES.filter(t => t !== 'Other').map(type => (
                <button
                  key={type}
                  onClick={() => toggleBusinessType(type)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    settings.businessTypes?.includes(type)
                      ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300'
                      : 'bg-gray-900 border-gray-700 text-gray-400'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          {findError && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg p-3">{findError}</div>
          )}
          {findResultCount !== null && !findError && (
            <div className="text-sm text-emerald-400 bg-emerald-900/20 border border-emerald-800/50 rounded-lg p-3">
              Added {findResultCount} new prospect{findResultCount === 1 ? '' : 's'}.
            </div>
          )}
        </div>
      )}

      {/* Freelancer Discovery */}
      {freelancerTypes.length > 0 && (
        <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 space-y-4">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-white">Find Freelance Professionals</h2>
          </div>
          <p className="text-xs text-gray-500">
            Searches Google's public index (LinkedIn/Behance profiles) — no phone/email comes back automatically, so these prospects are flagged "Needs contact info" until you look them up and paste it in.
          </p>
          <div className="flex flex-wrap gap-4 items-end">
            <button
              onClick={handleFindFreelancers}
              disabled={findingFreelancers}
              className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 px-5 rounded-lg transition-all"
            >
              {findingFreelancers ? <Loader2 className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
              <span>Find Freelancers Now</span>
            </button>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">
              Cities to search <span className="text-gray-600">(none selected = search globally)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {DEFAULT_CITIES.map(city => (
                <button
                  key={city}
                  onClick={() => toggleFreelancerCity(city)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    freelancerCities.includes(city)
                      ? 'bg-purple-900/40 border-purple-600 text-purple-300'
                      : 'bg-gray-900 border-gray-700 text-gray-400'
                  }`}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Categories to search</label>
            <div className="flex flex-wrap gap-2">
              {freelancerTypes.map(type => (
                <button
                  key={type}
                  onClick={() => toggleFreelancerType(type)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    selectedFreelancerTypes.includes(type)
                      ? 'bg-purple-900/40 border-purple-600 text-purple-300'
                      : 'bg-gray-900 border-gray-700 text-gray-400'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          {freelancerError && (
            <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg p-3">{freelancerError}</div>
          )}
          {freelancerResultCount !== null && !freelancerError && (
            <div className="text-sm text-purple-400 bg-purple-900/20 border border-purple-800/50 rounded-lg p-3">
              Added {freelancerResultCount} new prospect{freelancerResultCount === 1 ? '' : 's'}.
            </div>
          )}
        </div>
      )}

      {/* Daily Digest */}
      <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 space-y-4">
        <h2 className="text-lg font-semibold text-white">
          Today's Outreach — {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DigestCard icon={<AlertCircle className="w-5 h-5 text-red-400" />} label={`${digest.dueFollowUps.length} follow-ups due`} color="border-red-800/50 bg-red-900/10">
            {digest.dueFollowUps.map(p => (
              <div key={p.id} className="text-sm text-gray-300">{p.businessName} — {p.status}, Day {daysSince(p.lastContactDate || p.createdAt)}</div>
            ))}
            {digest.dueFollowUps.length === 0 && <div className="text-sm text-gray-500">Nothing due today.</div>}
          </DigestCard>
          <DigestCard icon={<CheckCircle2 className="w-5 h-5 text-green-400" />} label={`${digest.interested.length} interested`} color="border-green-800/50 bg-green-900/10">
            {digest.interested.map(p => (
              <div key={p.id} className="text-sm text-gray-300">{p.businessName} — {p.recommendedService || 'discuss next steps'}</div>
            ))}
            {digest.interested.length === 0 && <div className="text-sm text-gray-500">No interested leads yet.</div>}
          </DigestCard>
          <DigestCard icon={<Star className="w-5 h-5 text-yellow-400" />} label={`${digest.newToday.length} new prospects today`} color="border-yellow-800/50 bg-yellow-900/10">
            {digest.newToday.map(p => (
              <div key={p.id} className="text-sm text-gray-300">{p.businessName}</div>
            ))}
            {digest.newToday.length === 0 && <div className="text-sm text-gray-500">No new prospects added today.</div>}
          </DigestCard>
        </div>
      </div>

      {/* Prospect List */}
      <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 overflow-hidden">
        <div className="p-6 border-b border-gray-700 space-y-3">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Prospect Pipeline ({sortedProspects.length}{categoryFilter !== 'all' ? ` of ${prospects.length}` : ''})</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${categoryFilter === 'all' ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300' : 'bg-gray-900 border-gray-700 text-gray-400'}`}
            >
              All ({prospects.length})
            </button>
            {Object.entries(OUTREACH_CATEGORIES).sort((a, b) => a[1].rank - b[1].rank).map(([key, cat]) => (
              <button
                key={key}
                onClick={() => setCategoryFilter(key)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all ${categoryFilter === key ? cat.color : 'bg-gray-900 border-gray-700 text-gray-400'}`}
              >
                {cat.label} ({categoryCounts[key] || 0})
              </button>
            ))}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 bg-green-900/20 border border-green-800/50 rounded-lg p-3">
              <span className="text-sm text-green-300">{selectedIds.size} selected</span>
              <button
                onClick={handleBulkSendWhatsApp}
                className="flex items-center space-x-2 bg-green-600 hover:bg-green-500 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-all"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Open WhatsApp for {selectedIds.size} Selected</span>
              </button>
              <button onClick={() => setSelectedIds(new Set())} className="text-xs text-gray-400 hover:text-white">Clear</button>
            </div>
          )}
        </div>
        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading...</div>
        ) : prospects.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No prospects yet. Click "Add Prospect" to start.</div>
        ) : (
          <div>
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col className="w-[4%]" />
                <col className="w-[17%]" />
                <col className="w-[8%]" />
                <col className="w-[10%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[4%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-700 text-left text-gray-400">
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="cursor-pointer"
                      checked={sortedProspects.filter(eligibleForWhatsAppSend).length > 0 && sortedProspects.filter(eligibleForWhatsAppSend).every(p => selectedIds.has(p.id))}
                      onChange={toggleSelectAllVisible}
                      title="Select all with a WhatsApp draft ready"
                    />
                  </th>
                  <SortableTh field="businessName" label="Business" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh field="businessType" label="Type" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh field="category" label="Category" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh field="status" label="Status" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">WhatsApp</th>
                  <SortableTh field="lastContactDate" label="Last Contact" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <SortableTh field="followUpDate" label="Next Follow-up" sortBy={sortBy} sortDir={sortDir} onSort={toggleSort} />
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {sortedProspects.map(p => (
                  <ProspectRow
                    key={p.id}
                    p={p}
                    selected={selectedIds.has(p.id)}
                    onToggleSelect={() => toggleSelect(p.id)}
                    selectable={eligibleForWhatsAppSend(p)}
                    expanded={expandedId === p.id}
                    onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    busyId={busyId}
                    onSuggestGaps={() => handleSuggestGaps(p)}
                    onDraftMessage={() => handleDraftMessage(p)}
                    onDraftEmail={() => handleDraftEmail(p)}
                    onSendEmail={() => handleSendEmail(p)}
                    onApproveEmail={() => handleApproveEmail(p)}
                    onUnapproveEmail={() => handleUnapproveEmail(p)}
                    onMarkEmailSentManually={() => handleMarkEmailSentManually(p)}
                    onUnmarkEmailSent={() => handleUnmarkEmailSent(p)}
                    onMarkWhatsAppSent={() => handleMarkWhatsAppSent(p)}
                    onUnmarkWhatsAppSent={() => handleUnmarkWhatsAppSent(p)}
                    onMarkWhatsAppInvalid={() => handleMarkWhatsAppInvalid(p)}
                    onUnmarkWhatsAppInvalid={() => handleUnmarkWhatsAppInvalid(p)}
                    onScrapeEmail={() => handleScrapeOneEmail(p)}
                    onMarkContacted={() => markContacted(p)}
                    onSetStatus={(s) => setStatus(p, s)}
                    onDelete={() => deleteProspect(p.id)}
                    onFieldChange={(field, value) => updateProspect(p.id, { [field]: value })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Prospect Modal */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-gray-800 rounded-2xl p-6 border border-gray-700 shadow-2xl max-w-lg w-full space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white">Add Prospect</h3>
                <button onClick={() => setShowAddModal(false)}><X className="w-5 h-5 text-gray-400 hover:text-white" /></button>
              </div>
              <Field label="Business Name *" value={form.businessName} onChange={v => setForm(f => ({ ...f, businessName: v }))} />
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Business Type</label>
                <select
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
                  value={form.businessType}
                  onChange={e => setForm(f => ({ ...f, businessType: e.target.value }))}
                >
                  {BUSINESS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <Field label="Website" value={form.website} onChange={v => setForm(f => ({ ...f, website: v }))} />
              <Field label="Instagram" value={form.instagram} onChange={v => setForm(f => ({ ...f, instagram: v }))} />
              <Field label="Contact Person" value={form.contactPerson} onChange={v => setForm(f => ({ ...f, contactPerson: v }))} />
              <Field label="Email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
              <Field label="WhatsApp" value={form.whatsapp} onChange={v => setForm(f => ({ ...f, whatsapp: v }))} />
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">Notes (anything you already noticed)</label>
                <textarea
                  className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none resize-none"
                  rows={3}
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <button
                onClick={addProspect}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-3 rounded-xl transition-all active:scale-95"
              >
                Add Prospect
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon, value, label }) {
  return (
    <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700 flex items-center space-x-4">
      <div className="bg-gray-900 w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-xs text-gray-500 truncate">{label}</div>
      </div>
    </div>
  );
}

function SortableTh({ field, label, sortBy, sortDir, onSort }) {
  const active = sortBy === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`px-4 py-3 font-medium cursor-pointer select-none hover:text-white transition-colors ${active ? 'text-white' : ''}`}
    >
      <span className="flex items-center space-x-1">
        <span>{label}</span>
        <ArrowUpDown className={`w-3 h-3 ${active ? 'opacity-100' : 'opacity-30'}`} />
        {active && <span className="text-[10px]">{sortDir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}

function DigestCard({ icon, label, color, children }) {
  return (
    <div className={`rounded-xl border p-4 space-y-2 ${color}`}>
      <div className="flex items-center space-x-2 font-semibold text-white">{icon}<span>{label}</span></div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-400 mb-1">{label}</label>
      <input
        className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white outline-none"
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    </div>
  );
}

function ProspectRow({ p, selected, onToggleSelect, selectable, expanded, onToggle, busyId, onSuggestGaps, onDraftMessage, onDraftEmail, onSendEmail, onApproveEmail, onUnapproveEmail, onMarkEmailSentManually, onUnmarkEmailSent, onMarkWhatsAppSent, onUnmarkWhatsAppSent, onMarkWhatsAppInvalid, onUnmarkWhatsAppInvalid, onScrapeEmail, onMarkContacted, onSetStatus, onDelete, onFieldChange }) {
  return (
    <>
      <tr className="border-b border-gray-700 hover:bg-gray-700/30 cursor-pointer" onClick={onToggle}>
        <td className="px-4 py-3 align-top" onClick={e => e.stopPropagation()}>
          {selectable && (
            <input type="checkbox" className="cursor-pointer" checked={selected} onChange={onToggleSelect} />
          )}
        </td>
        <td className="px-4 py-3 align-top">
          <div className="flex items-start space-x-2 min-w-0">
            {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />}
            <span className="font-medium text-white break-words">{p.businessName}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-gray-400 break-words align-top">{p.businessType}</td>
        <td className="px-4 py-3 align-top">
          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${OUTREACH_CATEGORIES[deriveCategory(p)].color}`}>
            {OUTREACH_CATEGORIES[deriveCategory(p)].label}
          </span>
        </td>
        <td className="px-4 py-3 align-top">
          <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold ${statusColor[p.status] || 'bg-gray-700 text-gray-300'}`}>{p.status}</span>
        </td>
        <td className="px-4 py-3 text-gray-400 break-words align-top">{p.contactPerson || '—'}</td>
        <td className="px-4 py-3 text-gray-400 break-all align-top">
          {p.email ? p.email : p.needsManualContact ? (
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-900/40 border border-orange-700/50 text-orange-300">
              Needs contact info
            </span>
          ) : '—'}
        </td>
        <td className="px-4 py-3 align-top">
          {p.whatsapp ? (
            <span className="inline-flex items-start gap-1.5">
              {p.whatsappSentAt && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />}
              <a
                href={whatsappLink(p.whatsapp, p.draftMessage)}
                target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="text-green-400 hover:text-green-300 underline break-words"
              >
                {p.whatsapp}
              </a>
            </span>
          ) : <span className="text-gray-500">—</span>}
        </td>
        <td className="px-4 py-3 text-gray-400 break-words align-top">{p.lastContactDate || '—'}</td>
        <td className="px-4 py-3 text-gray-400 break-words align-top">{p.followUpDate || '—'}</td>
        <td className="px-4 py-3 align-top">
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-gray-500 hover:text-red-400">
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      </tr>
      <AnimatePresence>
        {expanded && (
          <tr>
            <td colSpan={11} className="p-0 border-b border-gray-700">
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-5 space-y-4 bg-gray-900/40">
                  {p.needsManualContact && !p.email && !p.whatsapp && (
                    <div className="text-xs text-orange-300 bg-orange-900/20 border border-orange-800/50 rounded-lg p-3">
                      Sourced from web search — no phone/email available automatically. Look up their contact info (their profile/website) and paste it in below.
                    </div>
                  )}
                  {!p.email && !p.whatsapp && !p.website && (
                    <div
                      className="text-xs text-blue-300 bg-blue-900/20 border border-blue-800/50 rounded-lg p-3 flex items-center justify-between gap-3"
                      onClick={e => e.stopPropagation()}
                    >
                      <span>No contact info or website on file — search for their social media presence (Facebook/Instagram/X/YouTube) or website.</span>
                      <a
                        href={googleSearchLink(p.businessName, p.notes)}
                        target="_blank" rel="noopener noreferrer"
                        className="flex-shrink-0 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all whitespace-nowrap"
                      >
                        Search Online
                      </a>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div onClick={e => e.stopPropagation()}>
                      <span className="text-gray-500">{detectLinkType(p.website) || 'Website'}: </span>
                      {p.website ? (
                        <a href={p.website} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline break-all">
                          {p.website}
                        </a>
                      ) : <span className="text-gray-300">—</span>}
                    </div>
                    <InfoLine label="Instagram" value={p.instagram} />
                    <div onClick={e => e.stopPropagation()}>
                      <label className="block text-xs text-gray-500 mb-1">Email</label>
                      <div className="flex gap-2">
                        <input
                          className="flex-1 min-w-0 bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none"
                          value={p.email || ''}
                          placeholder="paste email here"
                          onChange={e => onFieldChange('email', e.target.value)}
                        />
                        {p.website && !p.email && (
                          <button
                            onClick={onScrapeEmail}
                            disabled={busyId === p.id + '-scrape'}
                            className="flex-shrink-0 bg-blue-900/40 hover:bg-blue-900/60 border border-blue-700/50 disabled:opacity-50 text-blue-300 text-xs font-medium px-3 rounded-lg transition-all"
                            title="Check their website for a contact email"
                          >
                            {busyId === p.id + '-scrape' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Find from site'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div onClick={e => e.stopPropagation()}>
                      <label className="block text-xs text-gray-500 mb-1">WhatsApp</label>
                      <input
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none"
                        value={p.whatsapp || ''}
                        placeholder="paste phone number here"
                        onChange={e => onFieldChange('whatsapp', e.target.value)}
                      />
                    </div>
                    <InfoLine label="Email Opened" value={p.emailOpenedAt ? new Date(p.emailOpenedAt).toLocaleString() : null} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={onSuggestGaps}
                      disabled={busyId === p.id + '-gaps'}
                      className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-all"
                    >
                      {busyId === p.id + '-gaps' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      <span>Suggest Digital Gaps</span>
                    </button>
                    <button
                      onClick={onDraftMessage}
                      disabled={busyId === p.id + '-msg'}
                      className="flex items-center space-x-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-all"
                    >
                      {busyId === p.id + '-msg' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                      <span>Draft WhatsApp Message</span>
                    </button>
                    <button
                      onClick={onDraftEmail}
                      disabled={busyId === p.id + '-email'}
                      className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-all"
                    >
                      {busyId === p.id + '-email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      <span>Draft Email</span>
                    </button>
                    {p.email && (
                      p.emailSentAt ? (
                        <button
                          onClick={onUnmarkEmailSent}
                          className="flex items-center space-x-2 bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-300 text-sm font-medium py-2 px-4 rounded-lg transition-all"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Email Sent {new Date(p.emailSentAt).toLocaleDateString()}</span>
                        </button>
                      ) : (
                        <button
                          onClick={onMarkEmailSentManually}
                          className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium py-2 px-3 rounded-lg transition-all"
                          title="Use this if you wrote and sent the email yourself outside the app"
                        >
                          <span>Mark Email Sent Manually</span>
                        </button>
                      )
                    )}
                    {p.whatsapp && p.draftMessage && (
                      <a
                        href={whatsappLink(p.whatsapp, p.draftMessage)}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center space-x-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium py-2 px-4 rounded-lg transition-all"
                      >
                        <Phone className="w-4 h-4" />
                        <span>Open in WhatsApp</span>
                      </a>
                    )}
                    {p.whatsapp && (
                      p.whatsappSentAt ? (
                        <button
                          onClick={onUnmarkWhatsAppSent}
                          className="flex items-center space-x-2 bg-green-900/40 hover:bg-green-900/60 border border-green-700/50 text-green-300 text-sm font-medium py-2 px-4 rounded-lg transition-all"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>WhatsApp Sent {new Date(p.whatsappSentAt).toLocaleDateString()}</span>
                        </button>
                      ) : (
                        <button
                          onClick={onMarkWhatsAppSent}
                          className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-4 rounded-lg transition-all"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Mark WhatsApp Sent</span>
                        </button>
                      )
                    )}
                    {p.whatsapp && (
                      p.whatsappInvalid ? (
                        <button
                          onClick={onUnmarkWhatsAppInvalid}
                          className="flex items-center space-x-2 bg-red-900/40 hover:bg-red-900/60 border border-red-700/50 text-red-300 text-sm font-medium py-2 px-4 rounded-lg transition-all"
                        >
                          <X className="w-4 h-4" />
                          <span>Not on WhatsApp</span>
                        </button>
                      ) : (
                        <button
                          onClick={onMarkWhatsAppInvalid}
                          className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium py-2 px-3 rounded-lg transition-all"
                          title="Click if you tried opening WhatsApp and got 'number isn't on WhatsApp'"
                        >
                          <span>Mark Not on WhatsApp</span>
                        </button>
                      )
                    )}
                    {p.status === 'New' && (
                      <button onClick={onMarkContacted} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 px-4 rounded-lg transition-all">
                        Mark Contacted
                      </button>
                    )}
                    <select
                      className="bg-gray-800 border border-gray-700 rounded-lg text-sm text-white py-2 px-3 outline-none"
                      value={p.status}
                      onChange={e => onSetStatus(e.target.value)}
                    >
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>

                  {p.digitalGaps?.length > 0 && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Possible Opportunities</div>
                      <ul className="list-disc list-inside text-sm text-gray-300 space-y-0.5">
                        {p.digitalGaps.map((g, i) => <li key={i}>{g}</li>)}
                      </ul>
                      {p.recommendedService && (
                        <div className="text-sm text-emerald-400 mt-2">Recommended: {p.recommendedService}</div>
                      )}
                    </div>
                  )}

                  {p.draftMessage !== undefined && p.draftMessage !== '' && (
                    <div>
                      <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Draft WhatsApp Message (edit before sending)</div>
                      <textarea
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white text-sm outline-none resize-none"
                        rows={4}
                        value={p.draftMessage}
                        onChange={e => onFieldChange('draftMessage', e.target.value)}
                      />
                      <p className="text-xs text-gray-500 mt-1">Copy this into WhatsApp yourself, then click "Mark Contacted".</p>
                    </div>
                  )}

                  {p.draftEmailBody !== undefined && p.draftEmailBody !== '' && (
                    <div className="space-y-2">
                      <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Draft Email (edit before sending)</div>
                      <input
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white text-sm outline-none"
                        value={p.draftEmailSubject || ''}
                        onChange={e => onFieldChange('draftEmailSubject', e.target.value)}
                        placeholder="Subject"
                      />
                      <textarea
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white text-sm outline-none resize-none font-mono"
                        rows={8}
                        value={p.draftEmailBody}
                        onChange={e => onFieldChange('draftEmailBody', e.target.value)}
                      />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={onSendEmail}
                          disabled={!p.email || busyId === p.id + '-send'}
                          className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-all"
                        >
                          {busyId === p.id + '-send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          <span>Send Now{p.email ? ` to ${p.email}` : ' (no email on file)'}</span>
                        </button>
                        {p.emailSentAt ? (
                          <span className="text-xs text-gray-500">Sent {new Date(p.emailSentAt).toLocaleString()}</span>
                        ) : p.emailApproved ? (
                          <button
                            onClick={onUnapproveEmail}
                            className="flex items-center space-x-2 bg-orange-900/40 hover:bg-orange-900/60 border border-orange-700/50 text-orange-300 text-sm font-medium py-2 px-4 rounded-lg transition-all"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Queued — click to unqueue</span>
                          </button>
                        ) : (
                          <button
                            onClick={onApproveEmail}
                            disabled={!p.email}
                            className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-all"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Approve for Daily Queue</span>
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        "Send Now" sends immediately. "Approve for Daily Queue" sends it automatically in a small paced batch over the coming days (settings below) — for when you can't check in daily.
                      </p>
                    </div>
                  )}

                  <div>
                    <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Notes</div>
                    <textarea
                      className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white text-sm outline-none resize-none"
                      rows={2}
                      value={p.notes || ''}
                      onChange={e => onFieldChange('notes', e.target.value)}
                    />
                  </div>
                </div>
              </motion.div>
            </td>
          </tr>
        )}
      </AnimatePresence>
    </>
  );
}

function InfoLine({ label, value }) {
  return (
    <div>
      <span className="text-gray-500">{label}: </span>
      <span className="text-gray-300">{value || '—'}</span>
    </div>
  );
}

export default OutreachAgent;
