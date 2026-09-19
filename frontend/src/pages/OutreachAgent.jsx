import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Sparkles, MessageSquare, Trash2, X,
  AlertCircle, CheckCircle2, Star, ChevronDown, ChevronUp, Loader2,
  Send, Repeat, Mail, Phone, Compass, Search, Image as ImageIcon,
  Clock, ChevronLeft, ChevronRight,
} from 'lucide-react';

const API = import.meta.env.PROD ? '/api/outreach' : 'http://localhost:3001/api/outreach';
// Firebase Hosting's rewrite proxy times out well before the Cloud Function's
// own configured limit — fine for normal requests, but redraft-pending can run
// for minutes across many prospects (with AI rate-limit retries). Hitting the
// function's direct Cloud Run URL for that one call bypasses Hosting's shorter
// timeout entirely; CORS is already enabled on the function for this.
const FUNCTIONS_DIRECT_API = import.meta.env.PROD ? 'https://api-vvuw6rft4q-uc.a.run.app/api/outreach' : API;

const STATUSES = ['New', 'Contacted', 'No Response', 'Interested', 'Meeting Booked', 'Client', 'Not Interested'];
// Stored value stays 'New' (everything else in the code checks status === 'New')
// — this only renames the label shown in the dropdown to match the "Not
// contacted" wording used elsewhere in the UI.
const STATUS_LABELS = { New: 'Not contacted' };
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

// Discovery embeds "Prospect fit score: N/8" (no website / right-sized /
// paying capacity) as free text in notes — no structured field exists, so we
// parse it back out for ranking. Manually-added or freelancer prospects won't
// have this and simply sort as unscored (score = null, treated as 0).
const parseFitScore = (notes) => {
  const m = (notes || '').match(/Prospect fit score:\s*(\d+)\/8/i);
  return m ? parseInt(m[1], 10) : null;
};

const isFollowUpDue = (p) => !!p.followUpDate && p.followUpDate <= new Date().toISOString().slice(0, 10);

// True once a prospect has been reached through ANY channel — WhatsApp,
// social, or simply having its pipeline Status moved off "New" (a manual
// signal the user set themselves, e.g. after a phone call or in-person
// contact). An unapproved email draft stops nagging as "Needs Review" once
// this is true, since chasing an already-reached prospect for email review
// isn't urgent the same way a completely untouched lead is.
const alreadyContactedElsewhere = (p) => !!p.whatsappSentAt || !!p.socialSentAt || (!!p.status && p.status !== 'New');

// Places API addresses reliably end with "United Kingdom" as the country; the
// city names are a fallback for manually-added prospects whose notes don't
// follow that formatted-address shape.
const isUK = (p) => {
  const n = (p.notes || '').toLowerCase();
  return n.includes('united kingdom') || n.includes('london') || n.includes('reading') || n.includes('bracknell');
};

// The promo email is recurring (15-day cycle) rather than one-shot, so
// "due" here means "the last cycle finished and it's time to consider it
// again" — true before the very first send too, once the initial 7-day gap
// after the first email has passed.
const isPromoDue = (p) => !!p.promoEligibleDate && p.promoEligibleDate <= new Date().toISOString().slice(0, 10);

// The email send lifecycle, independent of the pipeline `status` field (New/
// Contacted/Interested/etc — a manual sales-stage judgment). This is purely
// mechanical: where is this prospect's email in the send pipeline right now.
// Kind-aware since a prospect can have an initial/follow-up row AND a
// separate promo row, each on its own independent timeline.
const computeSendStage = (p, kind = 'initial') => {
  if (kind === 'promo') {
    if (p.promoApproved) return 'Promo In Queue';
    if (p.promoEmailBody && isPromoDue(p)) return 'Promo Ready';
    if (p.promoSentAt) return 'Promo Sent';
    return null;
  }
  if (kind === 'followup') {
    if (p.followUpSentAt) return '1st Follow-up Sent';
    if (p.followUpApproved) return 'Follow-up In Queue';
    if (p.followUpEmailBody && isFollowUpDue(p)) return 'Follow-up Ready';
    return null;
  }
  if (p.emailSentAt) return 'Sent';
  if (p.emailApproved) return 'In Queue';
  if (p.draftEmailBody) return alreadyContactedElsewhere(p) ? null : 'Needs Review';
  return null;
};

const SEND_STAGE_COLOR = {
  'Needs Review': 'bg-gray-800 border-gray-600 text-gray-400',
  'In Queue': 'bg-indigo-900/40 border-indigo-600 text-indigo-300',
  'Sent': 'bg-blue-900/40 border-blue-600 text-blue-300',
  'Follow-up Ready': 'bg-orange-900/40 border-orange-600 text-orange-300',
  'Follow-up In Queue': 'bg-indigo-900/40 border-indigo-600 text-indigo-300',
  '1st Follow-up Sent': 'bg-green-900/40 border-green-600 text-green-300',
  'Promo Ready': 'bg-purple-900/40 border-purple-600 text-purple-300',
  'Promo In Queue': 'bg-indigo-900/40 border-indigo-600 text-indigo-300',
  'Promo Sent': 'bg-teal-900/40 border-teal-600 text-teal-300',
};

// Contact tier: 0 = no website + has email (best possible lead — clearly
// needs the service AND reachable right now), 1 = has website + has email
// (still reachable, less urgent need), 2 = has some other contact path
// (WhatsApp or website — worth a manual look), 3 = totally unreachable.
const contactTier = (p) => {
  if (p.email) return p.website ? 1 : 0;
  if ((p.whatsapp && !p.whatsappInvalid) || p.website) return 2;
  return 3;
};

// Surfaces the two calls-to-action the user actually cares about triaging
// each morning: brand-new leads reachable right now (by email or WhatsApp)
// worth a first outreach today, and existing contacts whose follow-up date
// has arrived or passed. Everything else gets no badge and just falls back
// to normal contact-tier ordering. Reachable = has email or valid WhatsApp —
// a website alone isn't a contact channel, so tier 2 (website-only) doesn't
// qualify as "Must Contact".
const isReachable = (p) => !!p.email || (!!p.whatsapp && !p.whatsappInvalid);
const priorityInfo = (p) => {
  const tier = contactTier(p);
  if (isReachable(p) && p.status === 'New') return { label: 'Must Contact', rank: 0 };
  if (isFollowUpDue(p) && p.status !== 'Client' && p.status !== 'Not Interested') return { label: 'Must Follow Up', rank: 1 };
  return { label: null, rank: tier + 2 };
};

// One-glance summary of every channel this prospect has actually been
// reached through — the thing that was hardest to see at a glance before,
// buried across a status dropdown, a "Sent" badge, and two small icon
// buttons. Returns null when nothing has gone out yet.
const contactedVia = (p) => {
  const channels = [];
  if (p.emailSentAt) channels.push('Email');
  if (p.whatsappSentAt) channels.push('WhatsApp');
  if (p.socialSentAt) channels.push('Insta/FB');
  if (!channels.length && p.status && p.status !== 'New') channels.push(p.status);
  return channels.length ? channels.join(' + ') : null;
};

const googleSearchLink = (businessName, notes) => {
  const location = (notes || '').split('·')[0]?.trim() || '';
  return `https://www.google.com/search?q=${encodeURIComponent(`${businessName} ${location}`.trim())}`;
};

// Self-contained: fetches its own prompt on demand so it doesn't pollute the
// parent component's state. Shown inside the prototype image section of each
// prospect card — one click, copy, paste into ChatGPT, generate, upload.
function ImagePromptBox({ prospectId }) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/prospects/${prospectId}/image-prompt`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPrompt(data.prompt);
    } catch (e) {
      alert('Could not generate image prompt: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-1.5">
      <button
        onClick={generate}
        disabled={loading}
        className="flex items-center space-x-1.5 bg-indigo-900/40 hover:bg-indigo-900/60 border border-indigo-700/50 disabled:opacity-50 text-indigo-300 text-xs font-medium py-1.5 px-3 rounded-lg transition-all w-fit"
      >
        {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
        <span>{prompt ? 'Regenerate Image Prompt' : 'Get Image Prompt'}</span>
      </button>
      {prompt && (
        <div className="relative bg-gray-800 border border-indigo-800/40 rounded-lg p-2">
          <p className="text-xs text-indigo-100/90 whitespace-pre-wrap pr-16 leading-relaxed">{prompt}</p>
          <button
            onClick={copy}
            className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-1 rounded transition-all ${copied ? 'bg-green-700 text-green-100' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );
}


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
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [emailOnlyFilter, setEmailOnlyFilter] = useState(false);
  const [nonIndianFilter, setNonIndianFilter] = useState(false);
  const [ukOnlyFilter, setUkOnlyFilter] = useState(false);
  const [priorityOnlyFilter, setPriorityOnlyFilter] = useState(false);
  const [expandedQueueIds, setExpandedQueueIds] = useState(new Set());
  const [redrafting, setRedrafting] = useState(false);
  const [redraftResult, setRedraftResult] = useState(null);
  const [draftingPromos, setDraftingPromos] = useState(false);
  const [promoDraftResult, setPromoDraftResult] = useState(null);
  const [discoveryExpanded, setDiscoveryExpanded] = useState(false);
  const [freelancerTypes, setFreelancerTypes] = useState([]);
  const [selectedFreelancerTypes, setSelectedFreelancerTypes] = useState([]);
  const [freelancerCities, setFreelancerCities] = useState([]);
  const [findingFreelancers, setFindingFreelancers] = useState(false);
  const [freelancerError, setFreelancerError] = useState('');
  const [freelancerResultCount, setFreelancerResultCount] = useState(null);
  const [importingDirectory, setImportingDirectory] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [directoryResultCount, setDirectoryResultCount] = useState(null);

  const [importingCounsellingDir, setImportingCounsellingDir] = useState(false);
  const [counsellingDirError, setCounsellingDirError] = useState('');
  const [counsellingDirResultCount, setCounsellingDirResultCount] = useState(null);

  // Layout View Tabs & Pagination State
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'priority' | 'pending' | 'contacted'
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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

  const handleImportTherapyDirectory = async () => {
    setImportingDirectory(true);
    setDirectoryError('');
    setDirectoryResultCount(null);
    try {
      const res = await fetch(`${API}/import-therapy-directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 20 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDirectoryResultCount(data.found.length);
      await fetchProspects();
    } catch (e) {
      setDirectoryError(e.message);
    } finally {
      setImportingDirectory(false);
    }
  };

  const handleImportCounsellingDirectory = async () => {
    setImportingCounsellingDir(true);
    setCounsellingDirError('');
    setCounsellingDirResultCount(null);
    try {
      const res = await fetch(`${API}/import-counselling-directory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: 30 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCounsellingDirResultCount(data.imported);
      await fetchProspects();
    } catch (e) {
      setCounsellingDirError(e.message);
    } finally {
      setImportingCounsellingDir(false);
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

  // Typing into a text field must never wait on the network — awaiting a PUT
  // per keystroke and then replacing state with the server's response caused
  // the textarea value to reset mid-edit, snapping the cursor to the end.
  // Local edits apply instantly; the debounce ref below persists them shortly
  // after typing pauses, without touching the rest of the prospect's state.
  const fieldSyncTimers = useRef({});

  const updateProspectLocal = (id, patch) => {
    setProspects(prev => prev.map(p => (p.id === id ? { ...p, ...patch } : p)));
  };

  const commitFieldDebounced = (id, field, value) => {
    const key = `${id}:${field}`;
    clearTimeout(fieldSyncTimers.current[key]);
    fieldSyncTimers.current[key] = setTimeout(async () => {
      try {
        await fetch(`${API}/prospects/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        });
      } catch (e) {
        console.error('Could not save field:', e);
      }
    }, 600);
  };

  const handleFieldChange = (id, field, value) => {
    updateProspectLocal(id, { [field]: value });
    commitFieldDebounced(id, field, value);
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
        body: JSON.stringify({ businessName: p.businessName, businessType: p.businessType, notes: p.notes, research: p.research }),
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
          digitalGaps: p.digitalGaps, recommendedService: p.recommendedService, notes: p.notes, research: p.research,
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

  // Actually browses the prospect's own website and re-drafts everything
  // grounded in what was found there — separate from handleDraftEmail, which
  // only reasons from businessType patterns.
  const handleResearch = async (p) => {
    if (!p.website) return alert('This prospect has no website to research.');
    setBusyId(p.id + '-research');
    try {
      const res = await fetch(`${FUNCTIONS_DIRECT_API}/prospects/${p.id}/research`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchProspects();
    } catch (e) {
      alert('Could not research this prospect: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  // Attaches a one-off visual mockup (generated externally, e.g. via an
  // image-gen tool) showing the idea being pitched — optional, reviewed
  // alongside the draft before approving/sending, never auto-generated.
  const handleAttachPrototype = async (p, file) => {
    if (!file) return;
    setBusyId(p.id + '-prototype');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch(`${FUNCTIONS_DIRECT_API}/prospects/${p.id}/prototype-image`, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchProspects();
    } catch (e) {
      alert('Could not attach the image: ' + e.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleRemovePrototype = async (p) => {
    setBusyId(p.id + '-prototype');
    try {
      const res = await fetch(`${FUNCTIONS_DIRECT_API}/prospects/${p.id}/prototype-image`, { method: 'DELETE' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await fetchProspects();
    } catch (e) {
      alert('Could not remove the image: ' + e.message);
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

  const handleApproveFollowUp = (p) => updateProspect(p.id, {
    followUpApproved: true, followUpApprovedAt: new Date().toISOString(),
  });

  const handleUnapproveFollowUp = (p) => updateProspect(p.id, { followUpApproved: false });

  const handleApprovePromo = (p) => updateProspect(p.id, {
    promoApproved: true, promoApprovedAt: new Date().toISOString(),
  });

  const handleUnapprovePromo = (p) => updateProspect(p.id, { promoApproved: false });

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

  // For outreach sent as an FB/Instagram DM outside the app (the app can't
  // automate social DMs), so it's still tracked as a real contact touch.
  const handleMarkSocialSent = (p) => updateProspect(p.id, {
    socialSentAt: new Date().toISOString(),
    status: p.status === 'New' ? 'Contacted' : p.status,
    lastContactDate: todayStr(),
    followUpDate: addDays(todayStr(), 3),
  });

  const handleUnmarkSocialSent = (p) => updateProspect(p.id, { socialSentAt: null });

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

  const markContacted = (p) => updateProspect(p.id, {
    status: 'Contacted', lastContactDate: todayStr(), followUpDate: addDays(todayStr(), 3),
  });

  const setStatus = (p, status) => {
    const patch = { status };
    if (status === 'No Response') patch.followUpDate = addDays(todayStr(), 3);
    if (status === 'Interested' || status === 'Meeting Booked' || status === 'Client' || status === 'Not Interested') patch.followUpDate = null;
    updateProspect(p.id, patch);
  };

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

  // The single unified list — replaces the old separate "Approval Queue" +
  // "Prospect Pipeline" table. Every prospect gets exactly one row here,
  // through its whole life: no draft yet → drafted, needs review → approved,
  // in queue → sent → (optionally) follow-up ready → done. Whichever half of
  // a prospect's story is currently actionable (initial email or follow-up)
  // decides what "kind" this row acts on; once contacted via WhatsApp/social
  // an un-approved draft stops needing review since they're already reached.
  const approvalQueue = useMemo(() => {
    const followUpActionable = (p) => p.followUpEmailBody && !p.followUpSentAt
      && (p.followUpApproved || (isFollowUpDue(p) && !alreadyContactedElsewhere(p)));
    // Promo runs on its own 15-day recurring cycle, independent of the
    // initial/follow-up thread — so it shows as its OWN extra row rather than
    // replacing the primary row, since both can be actionable at once.
    const promoActionable = (p) => p.promoEmailBody && (p.promoApproved || isPromoDue(p));

    const rows = prospects.flatMap(p => {
      const primary = { p, kind: followUpActionable(p) ? 'followup' : 'initial' };
      return promoActionable(p) ? [primary, { p, kind: 'promo' }] : [primary];
    });

    // One combined "how urgently does this need my attention" bucket —
    // important/untouched leads first, sent/done rows sink to the bottom,
    // regardless of fit score or anything else. Lower = higher up the list.
    const sortTier = ({ p, kind }) => {
      const stage = computeSendStage(p, kind);
      const priority = priorityInfo(p).label;
      if (stage === 'Needs Review' || stage === 'Follow-up Ready' || stage === 'Promo Ready') {
        return priority === 'Must Contact' ? 0 : priority === 'Must Follow Up' ? 1 : 2;
      }
      if (stage === 'In Queue' || stage === 'Follow-up In Queue' || stage === 'Promo In Queue') return 3;
      if (kind === 'initial' && !p.draftEmailBody && !p.emailSentAt) return 4;
      return 5;
    };

    return rows
      .filter(({ p }) => categoryFilter === 'all' || deriveCategory(p) === categoryFilter)
      .filter(({ p }) => !emailOnlyFilter || !!p.email)
      .filter(({ p }) => !nonIndianFilter || !(p.notes || '').toLowerCase().includes('india'))
      .filter(({ p }) => !ukOnlyFilter || isUK(p))
      .filter(({ p }) => !priorityOnlyFilter || priorityInfo(p).label !== null)
      .sort((a, b) => {
        const at = sortTier(a);
        const bt = sortTier(b);
        if (at !== bt) return at - bt;
        const ae = a.p.email ? 0 : 1;
        const be = b.p.email ? 0 : 1;
        if (ae !== be) return ae - be;
        const as = parseFitScore(a.p.notes) ?? -1;
        const bs = parseFitScore(b.p.notes) ?? -1;
        if (as !== bs) return bs - as;
        return priorityInfo(a.p).rank - priorityInfo(b.p).rank || (a.p.createdAt || '').localeCompare(b.p.createdAt || '');
      });
  }, [prospects, categoryFilter, emailOnlyFilter, nonIndianFilter, ukOnlyFilter, priorityOnlyFilter]);

  const tabCounts = useMemo(() => {
    let priority = 0;
    let pending = 0;
    let contacted = 0;

    approvalQueue.forEach(({ p, kind }) => {
      const pInfo = priorityInfo(p);
      if (pInfo && pInfo.label !== null) priority++;
      const stage = computeSendStage(p, kind);
      if (stage === 'Needs Review' || stage === 'Follow-up Ready' || stage === 'Promo Ready' || stage === 'In Queue') pending++;
      if (contactedVia(p) !== null || (p.status && p.status !== 'New')) contacted++;
    });

    return {
      all: approvalQueue.length,
      priority,
      pending,
      contacted,
    };
  }, [approvalQueue]);

  const filteredApprovalQueue = useMemo(() => {
    let list = approvalQueue;

    if (activeTab === 'priority') {
      list = list.filter(({ p }) => priorityInfo(p).label !== null);
    } else if (activeTab === 'pending') {
      list = list.filter(({ p, kind }) => {
        const stage = computeSendStage(p, kind);
        return stage === 'Needs Review' || stage === 'Follow-up Ready' || stage === 'Promo Ready' || stage === 'In Queue';
      });
    } else if (activeTab === 'contacted') {
      list = list.filter(({ p }) => contactedVia(p) !== null || (p.status && p.status !== 'New'));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(({ p }) =>
        (p.businessName || '').toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.whatsapp || '').toLowerCase().includes(q) ||
        (p.contactPerson || '').toLowerCase().includes(q) ||
        (p.businessType || '').toLowerCase().includes(q) ||
        (p.notes || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [approvalQueue, activeTab, searchQuery]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filteredApprovalQueue.length / pageSize)), [filteredApprovalQueue.length, pageSize]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedQueue = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredApprovalQueue.slice(start, start + pageSize);
  }, [filteredApprovalQueue, currentPage, pageSize]);

  const handleRedraftPending = async () => {
    if (!confirm(`Regenerate all ${approvalQueue.filter(({ kind }) => kind === 'initial').length} pending first-touch drafts with the latest template? Any manual edits to unapproved drafts will be overwritten. This can take a couple of minutes and may hit AI rate limits — any prospect that fails just keeps its current draft, and you can run this again to retry those.`)) return;
    setRedrafting(true);
    setRedraftResult(null);
    try {
      const res = await fetch(`${FUNCTIONS_DIRECT_API}/redraft-pending`, { method: 'POST' });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server returned an unexpected response (status ${res.status}) — try again in a moment.`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRedraftResult(data);
      await fetchProspects();
    } catch (e) {
      alert('Could not redraft pending emails: ' + e.message);
    } finally {
      setRedrafting(false);
    }
  };

  const handleDraftMissingPromos = async () => {
    if (!confirm('Draft the courses/apps promo email for every already-emailed prospect who doesn\'t have one yet? They\'ll become immediately eligible in the queue (their 7-day gap has already passed).')) return;
    setDraftingPromos(true);
    setPromoDraftResult(null);
    try {
      const res = await fetch(`${FUNCTIONS_DIRECT_API}/draft-missing-promos`, { method: 'POST' });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server returned an unexpected response (status ${res.status}) — try again in a moment.`);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPromoDraftResult(data);
      await fetchProspects();
    } catch (e) {
      alert('Could not draft missing promos: ' + e.message);
    } finally {
      setDraftingPromos(false);
    }
  };

  const toggleQueueExpanded = (id) => {
    setExpandedQueueIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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

      {/* Approval Queue — tabbed, searchable, paginated prospect queue */}
      <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 space-y-5">
        {/* Tab Header & Action Buttons */}
        <div className="flex flex-wrap items-center justify-between border-b border-gray-700/80 pb-4 gap-3">
          <div className="flex items-center space-x-2 overflow-x-auto py-1">
            <button
              onClick={() => { setActiveTab('all'); setCurrentPage(1); }}
              className={`flex items-center space-x-2 text-xs font-semibold px-4 py-2.5 rounded-xl border transition-all ${
                activeTab === 'all'
                  ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/30'
                  : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span>All Prospects</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'all' ? 'bg-emerald-700 text-emerald-100' : 'bg-gray-800 text-gray-400'}`}>
                {tabCounts.all}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('priority'); setCurrentPage(1); }}
              className={`flex items-center space-x-2 text-xs font-semibold px-4 py-2.5 rounded-xl border transition-all ${
                activeTab === 'priority'
                  ? 'bg-amber-600 border-amber-500 text-white shadow-lg shadow-amber-900/30'
                  : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span>🔥 Priority Action</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'priority' ? 'bg-amber-700 text-amber-100' : 'bg-gray-800 text-gray-400'}`}>
                {tabCounts.priority}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('pending'); setCurrentPage(1); }}
              className={`flex items-center space-x-2 text-xs font-semibold px-4 py-2.5 rounded-xl border transition-all ${
                activeTab === 'pending'
                  ? 'bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/30'
                  : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span>⏳ Needs Review</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'pending' ? 'bg-purple-700 text-purple-100' : 'bg-gray-800 text-gray-400'}`}>
                {tabCounts.pending}
              </span>
            </button>

            <button
              onClick={() => { setActiveTab('contacted'); setCurrentPage(1); }}
              className={`flex items-center space-x-2 text-xs font-semibold px-4 py-2.5 rounded-xl border transition-all ${
                activeTab === 'contacted'
                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/30'
                  : 'bg-gray-900/60 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <span>✅ Contacted</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeTab === 'contacted' ? 'bg-blue-700 text-blue-100' : 'bg-gray-800 text-gray-400'}`}>
                {tabCounts.contacted}
              </span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleRedraftPending}
              disabled={redrafting}
              title="Regenerates every un-approved, un-sent draft using the current template"
              className="flex items-center space-x-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-xs font-medium py-2 px-3 rounded-lg transition-all"
            >
              {redrafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Repeat className="w-3.5 h-3.5" />}
              <span>Refresh Drafts</span>
            </button>
            <button
              onClick={handleDraftMissingPromos}
              disabled={draftingPromos}
              title="Drafts the courses/apps promo email for every already-emailed prospect"
              className="flex items-center space-x-1.5 bg-purple-900/40 hover:bg-purple-900/60 border border-purple-700/50 disabled:opacity-50 text-purple-300 text-xs font-medium py-2 px-3 rounded-lg transition-all"
            >
              {draftingPromos ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              <span>Draft Promos</span>
            </button>
          </div>
        </div>

        {/* Status messages for bulk operations */}
        {redraftResult && (
          <p className={`text-xs ${redraftResult.updated < redraftResult.attempted ? 'text-orange-400' : 'text-green-400'}`}>
            Updated {redraftResult.updated} of {redraftResult.attempted} drafts.
            {redraftResult.updated < redraftResult.attempted && ' The rest hit an AI rate limit and kept their old draft — click Refresh again to retry them.'}
          </p>
        )}
        {promoDraftResult && (
          <p className={`text-xs ${promoDraftResult.updated < promoDraftResult.attempted ? 'text-orange-400' : 'text-green-400'}`}>
            Drafted promo emails for {promoDraftResult.updated} of {promoDraftResult.attempted} prospects.
            {promoDraftResult.updated < promoDraftResult.attempted && ' The rest hit an AI rate limit — click again to retry them.'}
          </p>
        )}

        {/* Search & Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-900/50 p-3 rounded-xl border border-gray-700/70">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, phone, city, notes..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-9 pr-8 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setCurrentPage(1); }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}
              className="text-xs bg-gray-900 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            >
              <option value="all">All categories</option>
              {Object.entries(OUTREACH_CATEGORIES).sort((a, b) => a[1].rank - b[1].rank).map(([key, cat]) => (
                <option key={key} value={key}>{cat.label}</option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={emailOnlyFilter} onChange={(e) => { setEmailOnlyFilter(e.target.checked); setCurrentPage(1); }} className="rounded border-gray-700 bg-gray-900 text-emerald-600 focus:ring-emerald-600" />
              Has Email
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={nonIndianFilter} onChange={(e) => { setNonIndianFilter(e.target.checked); setCurrentPage(1); }} className="rounded border-gray-700 bg-gray-900 text-emerald-600 focus:ring-emerald-600" />
              Non-Indian
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer">
              <input type="checkbox" checked={ukOnlyFilter} onChange={(e) => { setUkOnlyFilter(e.target.checked); setCurrentPage(1); }} className="rounded border-gray-700 bg-gray-900 text-emerald-600 focus:ring-emerald-600" />
              UK Only
            </label>

            <div className="flex items-center space-x-1.5 border-l border-gray-700 pl-3">
              <span className="text-xs text-gray-400">Rows:</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                className="text-xs bg-gray-900 border border-gray-700 text-gray-200 rounded-lg px-2 py-1.5 focus:outline-none"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Pagination Info Header */}
        <div className="flex items-center justify-between text-xs text-gray-400 px-1 pt-1">
          <div>
            Showing {filteredApprovalQueue.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, filteredApprovalQueue.length)} of {filteredApprovalQueue.length} items
            {filteredApprovalQueue.length !== approvalQueue.length && ` (filtered from ${approvalQueue.length})`}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium text-white px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Prospect List */}
        {filteredApprovalQueue.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500 bg-gray-900/30 rounded-xl border border-gray-800">
            No prospects match the selected tab, search query, or filters.
          </div>
        ) : (
          <div className="space-y-2">
            {paginatedQueue.map(({ p, kind }) => {
              const isOpen = expandedQueueIds.has(p.id + kind);
              const subjectField = kind === 'initial' ? 'draftEmailSubject' : kind === 'followup' ? 'followUpEmailSubject' : 'promoEmailSubject';
              const bodyField = kind === 'initial' ? 'draftEmailBody' : kind === 'followup' ? 'followUpEmailBody' : 'promoEmailBody';
              const subject = p[subjectField];
              const body = p[bodyField];
              const approveHandler = kind === 'initial' ? handleApproveEmail : kind === 'followup' ? handleApproveFollowUp : handleApprovePromo;
              const unapproveHandler = kind === 'initial' ? handleUnapproveEmail : kind === 'followup' ? handleUnapproveFollowUp : handleUnapprovePromo;
              const isApproved = kind === 'initial' ? !!p.emailApproved : kind === 'followup' ? !!p.followUpApproved : !!p.promoApproved;
              const stage = computeSendStage(p, kind);
              const priorityLabel = priorityInfo(p).label;
              return (
                <div key={p.id + kind} className="bg-gray-900/60 border border-gray-700 rounded-xl p-2.5 transition-all hover:border-gray-600">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {priorityLabel && (
                      <span
                        title={priorityLabel === 'Must Follow Up' ? `Follow-up date: ${p.followUpDate}` : 'Reachable and never contacted'}
                        className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold border ${priorityLabel === 'Must Contact' ? 'bg-red-900/40 border-red-600 text-red-300' : 'bg-amber-900/40 border-amber-600 text-amber-300'}`}
                      >
                        {priorityLabel}
                      </span>
                    )}
                    {kind === 'followup' && (
                      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-orange-900/40 border border-orange-600 text-orange-300">Follow-up</span>
                    )}
                    {kind === 'promo' && (
                      <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-purple-900/40 border border-purple-600 text-purple-300">Promo</span>
                    )}
                    {stage && (
                      <span
                        title={
                          stage === 'Sent' && p.emailSentAt ? `Sent ${new Date(p.emailSentAt).toLocaleString()}`
                          : stage === '1st Follow-up Sent' && p.followUpSentAt ? `Sent ${new Date(p.followUpSentAt).toLocaleString()}`
                          : stage === 'Promo Sent' && p.promoSentAt ? `Last sent ${new Date(p.promoSentAt).toLocaleString()} — next eligible ${p.promoEligibleDate || '—'}`
                          : undefined
                        }
                        className={`flex-shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-bold border whitespace-nowrap ${SEND_STAGE_COLOR[stage]}`}
                      >
                        <span>{stage}</span>
                        {stage === 'Sent' && p.emailSentAt && <span className="font-normal opacity-80">{new Date(p.emailSentAt).toLocaleDateString()}</span>}
                        {stage === '1st Follow-up Sent' && p.followUpSentAt && <span className="font-normal opacity-80">{new Date(p.followUpSentAt).toLocaleDateString()}</span>}
                        {stage === 'Promo Sent' && p.promoSentAt && <span className="font-normal opacity-80">{new Date(p.promoSentAt).toLocaleDateString()} · next {p.promoEligibleDate}</span>}
                      </span>
                    )}
                    <span className="flex-shrink-0 flex items-center gap-1.5 flex-nowrap min-w-0">
                      <a
                        href={googleSearchLink(p.businessName, p.notes)}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="flex-shrink-0 flex items-center gap-1.5 font-medium text-blue-400 hover:text-blue-300 underline whitespace-nowrap text-sm max-w-[176px] truncate"
                        title={p.businessName}
                      >
                        <Search className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{p.businessName}</span>
                      </a>
                      {isUK(p) && (
                        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-indigo-900/40 border border-indigo-600 text-indigo-300">UK</span>
                      )}
                      {contactedVia(p) ? (
                        <span className="flex-shrink-0 max-w-[140px] truncate inline-block text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-emerald-900/40 border border-emerald-600 text-emerald-300" title="Already reached via this channel">
                          &#10003; {contactedVia(p)}
                        </span>
                      ) : (
                        <span className="flex-shrink-0 inline-block text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-gray-800 border border-gray-600 text-gray-400">Not contacted</span>
                      )}
                    </span>
                    {!p.email && (
                      <span className="flex-shrink-0 text-[10px] text-gray-500 italic">no email — see Details</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap sm:ml-auto">
                    {p.whatsapp && (
                      <a
                        href={whatsappLink(p.whatsapp, p.draftMessage)}
                        target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        title={p.whatsappSentAt ? `Contacted via WhatsApp ${new Date(p.whatsappSentAt).toLocaleDateString()} — click to open again` : 'Open WhatsApp'}
                        className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg border transition-all ${p.whatsappSentAt ? 'bg-green-900/40 border-green-700/50 text-green-300' : 'bg-gray-700 hover:bg-green-900/60 border-gray-600 hover:border-green-700/50 text-gray-300 hover:text-green-300'}`}
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); p.socialSentAt ? handleUnmarkSocialSent(p) : handleMarkSocialSent(p); }}
                      title={p.socialSentAt ? `Contacted via FB/Instagram ${new Date(p.socialSentAt).toLocaleDateString()} — click to undo` : 'Mark as contacted via Facebook/Instagram outside the app'}
                      className={`flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg border transition-all ${p.socialSentAt ? 'bg-pink-900/40 border-pink-700/50 text-pink-300' : 'bg-gray-700 hover:bg-pink-900/60 border-gray-600 hover:border-pink-700/50 text-gray-300 hover:text-pink-300'}`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => toggleQueueExpanded(p.id + kind)}
                      className="flex-shrink-0 whitespace-nowrap text-xs text-gray-400 hover:text-white underline"
                    >
                      {isOpen ? 'Hide details' : 'Details'}
                    </button>
                    {kind === 'initial' && p.website && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleResearch(p); }}
                        disabled={busyId === p.id + '-research'}
                        title={p.research ? `Researched ${new Date(p.researchedAt).toLocaleDateString()} (${p.researchConfidence || 'Medium'} confidence) — click to re-research and redraft` : "Browse this prospect's website and ground the draft in what's actually there"}
                        className="flex-shrink-0 flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all whitespace-nowrap"
                      >
                        {busyId === p.id + '-research' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                        <span>{p.research ? 'Re-research' : 'Research'}</span>
                      </button>
                    )}
                    {kind === 'initial' && !p.website && (
                      <input
                        className="flex-shrink-0 w-40 bg-gray-900 border border-blue-700/50 rounded-lg px-2 py-1.5 text-white text-xs outline-none placeholder:text-blue-300/60"
                        placeholder="+ Add website for Research"
                        title="Add a website to unlock the Research button"
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
                        onBlur={e => { if (e.target.value.trim()) handleFieldChange(p.id, 'website', e.target.value.trim()); }}
                      />
                    )}
                    {!body ? (
                      <button
                        onClick={() => handleDraftEmail(p)}
                        disabled={busyId === p.id + '-email'}
                        className="flex-shrink-0 flex items-center space-x-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all whitespace-nowrap"
                      >
                        {busyId === p.id + '-email' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>Draft Email</span>
                      </button>
                    ) : isApproved ? (
                      <button
                        onClick={() => unapproveHandler(p)}
                        className="flex-shrink-0 whitespace-nowrap text-xs text-gray-400 hover:text-red-400 underline"
                      >
                        Remove
                      </button>
                    ) : (
                      <button
                        onClick={() => approveHandler(p)}
                        disabled={!p.email}
                        title={!p.email ? 'Add an email address first' : ''}
                        className="flex-shrink-0 flex items-center space-x-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all whitespace-nowrap"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>
                    )}
                    <select
                      value={p.status}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setStatus(p, e.target.value)}
                      className={`flex-shrink-0 rounded-lg text-xs font-semibold py-1.5 px-2 outline-none ${statusColor[p.status] || 'bg-gray-700 text-gray-200'}`}
                    >
                      {STATUSES.map(s => <option key={s} value={s} className="bg-gray-800 text-white font-normal">{STATUS_LABELS[s] || s}</option>)}
                    </select>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteProspect(p.id); }}
                      className="flex-shrink-0 text-gray-500 hover:text-red-400 p-1"
                      title="Delete this prospect"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  </div>
                  {isOpen && (
                    <div className="space-y-1.5 mt-2" onClick={e => e.stopPropagation()}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        <input
                          className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-xs outline-none"
                          placeholder="Email"
                          value={p.email || ''}
                          onChange={e => handleFieldChange(p.id, 'email', e.target.value)}
                        />
                        <input
                          className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-xs outline-none"
                          placeholder="WhatsApp"
                          value={p.whatsapp || ''}
                          onChange={e => handleFieldChange(p.id, 'whatsapp', e.target.value)}
                        />
                        <input
                          className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-xs outline-none"
                          placeholder="Website"
                          value={p.website || ''}
                          onChange={e => handleFieldChange(p.id, 'website', e.target.value)}
                        />
                        <input
                          className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-xs outline-none"
                          placeholder="Instagram"
                          value={p.instagram || ''}
                          onChange={e => handleFieldChange(p.id, 'instagram', e.target.value)}
                        />
                      </div>
                      <textarea
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-xs outline-none resize-y"
                        rows={2}
                        placeholder="Notes"
                        value={p.notes || ''}
                        onChange={e => handleFieldChange(p.id, 'notes', e.target.value)}
                      />
                      {p.research && (
                        <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg p-2 text-xs text-blue-100">
                          <div className="flex items-center space-x-1.5 mb-1 text-blue-300 font-medium">
                            <Search className="w-3 h-3" />
                            <span>Website research ({p.researchConfidence || 'Medium'} confidence{p.researchedAt ? `, ${new Date(p.researchedAt).toLocaleDateString()}` : ''})</span>
                          </div>
                          <p className="whitespace-pre-wrap text-blue-100/90">{p.research}</p>
                        </div>
                      )}
                      {body && (
                        <>
                          <input
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm font-medium outline-none"
                            value={subject || ''}
                            onChange={e => handleFieldChange(p.id, subjectField, e.target.value)}
                          />
                          <textarea
                            className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none resize-y"
                            rows={8}
                            value={body || ''}
                            onChange={e => handleFieldChange(p.id, bodyField, e.target.value)}
                          />
                        </>
                      )}
                      {kind === 'initial' && body && (
                        <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 space-y-2">
                          <div className="text-xs text-gray-400 mb-1.5">Visual prototype (optional — shown in the email if attached)</div>
                          {p.prototypeImageUrl ? (
                            <div className="flex items-start space-x-2">
                              <img src={p.prototypeImageUrl} alt="Prototype mockup" className="w-32 rounded-lg border border-gray-700" />
                              <button
                                onClick={() => handleRemovePrototype(p)}
                                disabled={busyId === p.id + '-prototype'}
                                className="text-xs text-gray-400 hover:text-red-400 underline disabled:opacity-50"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <label className={`flex items-center space-x-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium py-1.5 px-3 rounded-lg transition-all w-fit cursor-pointer ${busyId === p.id + '-prototype' ? 'opacity-50 pointer-events-none' : ''}`}>
                              {busyId === p.id + '-prototype' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                              <span>Attach image</span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => handleAttachPrototype(p, e.target.files[0])}
                              />
                            </label>
                          )}
                          <ImagePromptBox prospectId={p.id} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Controls Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-700/80 pt-4 text-xs text-gray-400">
            <div>
              Showing page {currentPage} of {totalPages} ({filteredApprovalQueue.length} items)
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-gray-700 bg-gray-900 hover:bg-gray-700 text-gray-300 disabled:opacity-30 disabled:pointer-events-none"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Prospect Discovery — collapsed by default; runs automatically every day
          regardless, so this is only for manually kicking off an extra run or
          changing what/where it searches. Most days there's nothing to do here. */}
      <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 overflow-hidden">
        <button
          onClick={() => setDiscoveryExpanded(v => !v)}
          className="w-full flex items-center justify-between gap-3 p-6 text-left hover:bg-gray-700/30 transition-all"
        >
          <div className="flex items-center space-x-2">
            <Compass className="w-5 h-5 text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Find New Prospects</h2>
            <span className="text-xs text-gray-500">(runs automatically every day — open this only to search manually or change settings)</span>
          </div>
          {discoveryExpanded ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
        </button>
        {discoveryExpanded && (
      <div className="px-6 pb-6 space-y-6">
      {settings && (
        <div className="bg-gray-900/40 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="text-base font-semibold text-white">Local Businesses</h2>
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

      {/* Directory Import — counselling-directory.org.uk */}
      <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 space-y-4">
        <div className="flex items-center space-x-2">
          <Compass className="w-5 h-5 text-teal-400" />
          <h2 className="text-lg font-semibold text-white">Import UK Counsellors — counselling-directory.org.uk</h2>
        </div>
        <p className="text-xs text-gray-500">
          Pulls verified UK counsellors & therapists with direct phone numbers (+44...) across major UK cities. Automatically formatted and added to your outreach queue.
        </p>
        <button
          onClick={handleImportCounsellingDirectory}
          disabled={importingCounsellingDir}
          className="flex items-center space-x-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 px-5 rounded-lg transition-all"
        >
          {importingCounsellingDir ? <Loader2 className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
          <span>Import UK Counsellors Now</span>
        </button>
        {counsellingDirError && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg p-3">{counsellingDirError}</div>
        )}
        {counsellingDirResultCount !== null && !counsellingDirError && (
          <div className="text-sm text-teal-400 bg-teal-900/20 border border-teal-800/50 rounded-lg p-3">
            Imported {counsellingDirResultCount} UK counsellor prospect{counsellingDirResultCount === 1 ? '' : 's'}.
          </div>
        )}
      </div>

      {/* Directory Import — therapyin.london */}
      <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 space-y-4">
        <div className="flex items-center space-x-2">
          <Compass className="w-5 h-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-white">Import Therapists — therapyin.london</h2>
        </div>
        <p className="text-xs text-gray-500">
          Pulls therapist names and public profile links from their sitemap (their /results search page is off-limits per robots.txt, so this only reads what's explicitly allowed). No email/phone comes back — each is flagged "Needs contact info" until you open their profile and find a way to reach out.
        </p>
        <button
          onClick={handleImportTherapyDirectory}
          disabled={importingDirectory}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 px-5 rounded-lg transition-all"
        >
          {importingDirectory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
          <span>Import Therapists Now</span>
        </button>
        {directoryError && (
          <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg p-3">{directoryError}</div>
        )}
        {directoryResultCount !== null && !directoryError && (
          <div className="text-sm text-blue-400 bg-blue-900/20 border border-blue-800/50 rounded-lg p-3">
            Added {directoryResultCount} new prospect{directoryResultCount === 1 ? '' : 's'}.
          </div>
        )}
      </div>
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

export default OutreachAgent;
