import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Sparkles, MessageSquare, Trash2, X,
  AlertCircle, CheckCircle2, Star, ChevronDown, ChevronUp, Loader2,
  Send, Repeat, Mail, Phone, Compass,
} from 'lucide-react';

const API = 'http://localhost:3001/api/outreach';

const STATUSES = ['New', 'Contacted', 'No Response', 'Interested', 'Meeting Booked', 'Client', 'Not Interested'];
const BUSINESS_TYPES = [
  'Hotel/Homestay', 'Restaurant/Café', 'Coaching Institute', 'Wellness Business',
  'Clinic', 'Small Manufacturer', 'Real Estate', 'Consultant', 'Local Retailer', 'Startup', 'Other',
];

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

  const fetchProspects = async () => {
    const res = await fetch(`${API}/prospects`);
    setProspects(await res.json());
    setLoading(false);
  };

  const fetchSettings = async () => {
    const res = await fetch(`${API}/settings`);
    setSettings(await res.json());
  };

  useEffect(() => { fetchProspects(); fetchSettings(); }, []);

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
    return { total, reachedOut, followedUp };
  }, [prospects]);

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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Users className="w-5 h-5 text-gray-400" />} value={stats.total} label="Prospects" />
        <StatCard icon={<Send className="w-5 h-5 text-blue-400" />} value={stats.reachedOut} label="Reached Out" />
        <StatCard icon={<Repeat className="w-5 h-5 text-orange-400" />} value={stats.followedUp} label="Followed Up" />
        <StatCard icon={<Mail className="w-5 h-5 text-gray-500" />} value="—" label="Emails Opened (not tracked yet)" />
      </div>

      {/* Prospect Discovery */}
      {settings && (
        <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center space-x-2">
              <Compass className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-semibold text-white">Find Today's Prospects</h2>
            </div>
            <p className="text-xs text-gray-500">
              Auto-runs daily at {settings.dailyRunHour}:00 while the backend server is running.
              {settings.lastRunDate && ` Last run: ${settings.lastRunDate}.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label className="block text-xs text-gray-400 mb-1">City</label>
              <input
                className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-white text-sm outline-none w-40"
                value={settings.city}
                onChange={e => setSettings(s => ({ ...s, city: e.target.value }))}
                onBlur={() => saveSettings({ city: settings.city })}
              />
            </div>
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
        <div className="p-6 border-b border-gray-700 flex items-center space-x-2">
          <Users className="w-5 h-5 text-emerald-400" />
          <h2 className="text-lg font-semibold text-white">Prospect Pipeline ({prospects.length})</h2>
        </div>
        {loading ? (
          <div className="p-10 text-center text-gray-500">Loading...</div>
        ) : prospects.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No prospects yet. Click "Add Prospect" to start.</div>
        ) : (
          <div className="divide-y divide-gray-700">
            {prospects.map(p => (
              <ProspectRow
                key={p.id}
                p={p}
                expanded={expandedId === p.id}
                onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                busyId={busyId}
                onSuggestGaps={() => handleSuggestGaps(p)}
                onDraftMessage={() => handleDraftMessage(p)}
                onMarkContacted={() => markContacted(p)}
                onSetStatus={(s) => setStatus(p, s)}
                onDelete={() => deleteProspect(p.id)}
                onFieldChange={(field, value) => updateProspect(p.id, { [field]: value })}
              />
            ))}
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

function ProspectRow({ p, expanded, onToggle, busyId, onSuggestGaps, onDraftMessage, onMarkContacted, onSetStatus, onDelete, onFieldChange }) {
  const day = daysSince(p.lastContactDate || p.createdAt);
  return (
    <div>
      <div className="flex items-center justify-between p-5 hover:bg-gray-700/30 cursor-pointer" onClick={onToggle}>
        <div className="flex items-center space-x-4 flex-1 min-w-0">
          <button className="text-gray-400">{expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</button>
          <div className="min-w-0">
            <div className="font-semibold text-white truncate">{p.businessName}</div>
            <div className="text-xs text-gray-500">{p.businessType} · Day {day}</div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColor[p.status] || 'bg-gray-700 text-gray-300'}`}>{p.status}</span>
          {p.followUpDate && (
            <span className="text-xs text-gray-500 hidden sm:inline">Next: {p.followUpDate}</span>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-gray-500 hover:text-red-400">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-5 pt-0 space-y-4 bg-gray-900/40">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <InfoLine label="Website" value={p.website} />
                <InfoLine label="Instagram" value={p.instagram} />
                <InfoLine label="Contact" value={p.contactPerson} />
                <InfoLine label="Email" value={p.email} />
                <div>
                  <span className="text-gray-500">WhatsApp: </span>
                  {p.whatsapp ? (
                    <a
                      href={whatsappLink(p.whatsapp, p.draftMessage)}
                      target="_blank" rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="text-green-400 hover:text-green-300 underline"
                    >
                      {p.whatsapp}
                    </a>
                  ) : <span className="text-gray-300">—</span>}
                </div>
                <InfoLine label="Last Contact" value={p.lastContactDate} />
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
                  <span>Draft Message</span>
                </button>
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
                  <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">Draft Message (edit before sending)</div>
                  <textarea
                    className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-white text-sm outline-none resize-none"
                    rows={4}
                    value={p.draftMessage}
                    onChange={e => onFieldChange('draftMessage', e.target.value)}
                  />
                  <p className="text-xs text-gray-500 mt-1">Copy this into WhatsApp/email yourself, then click "Mark Contacted".</p>
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
        )}
      </AnimatePresence>
    </div>
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
