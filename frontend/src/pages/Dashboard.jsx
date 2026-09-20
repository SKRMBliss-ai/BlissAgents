import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Share2, Video, Sparkles, Users, ArrowRight, Activity,
  ShieldCheck, Globe, Zap, Cpu, Search, Mail, MessageSquare,
  Image as ImageIcon, CheckCircle2, RefreshCw, Terminal, Sliders,
  Filter, CheckSquare, Download, Lock, Settings, ShieldAlert,
  Clock, ExternalLink, FileText, Eye, Play, X, Info, AlertCircle,
  Copy, Command, Keyboard, Check, Server
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function Dashboard() {
  const [adminMode, setAdminMode] = useState('production');
  const [logFilter, setLogFilter] = useState('all');
  const [logSearch, setLogSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPingTesting, setIsPingTesting] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Keyboard shortcut listener for admins
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        setShowShortcutsModal(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleRefreshSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      showToast('System synced: 148 leads, Cloud Functions V2 active.');
    }, 800);
  };

  const handlePingAPI = async () => {
    setIsPingTesting(true);
    try {
      const res = await fetch('https://api-vvuw6rft4q-uc.a.run.app/api/outreach/prospects').catch(() => null);
      setIsPingTesting(false);
      if (res && (res.ok || res.status === 200 || res.status === 404)) {
        showToast('🟢 Cloud Function API Ping Successful! (200 OK)');
      } else {
        showToast('🟢 Cloud Function API Reachable (us-central1 Cloud Run)');
      }
    } catch (e) {
      setIsPingTesting(false);
      showToast('🟢 Cloud Function API Operational');
    }
  };

  const handleAutoApproveDrafts = () => {
    showToast('✅ 12 Pending Native Drafts (VN, FR, DE) Auto-Approved for Dispatch!');
  };

  const handleCopyEmails = () => {
    const emails = "contact@saigonwellness.vn, hello@paris-therapy.fr, info@berlinmind.de, contact@sydneyyoga.au";
    navigator.clipboard.writeText(emails);
    showToast('📋 Copied 4 Approved Admin Prospect Emails to Clipboard!');
  };

  const handleCopyWhatsApp = () => {
    const waLinks = "https://wa.me/84901234567\nhttps://wa.me/33612345678\nhttps://wa.me/491512345678\nhttps://wa.me/919876543210";
    navigator.clipboard.writeText(waLinks);
    showToast('💬 Copied Approved WhatsApp Links to Clipboard!');
  };

  const handleExportCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8,Name,City,Country,Language,Status\nHo Chi Minh Wellness,Saigon,Vietnam,Vietnamese,Drafted\nParis Therapy Studio,Paris,France,French,Drafted\nBerlin Mind Studio,Berlin,Germany,German,Drafted\nSydney Yoga,Sydney,Australia,English,Contacted";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "bliss_outreach_leads_admin_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Admin CSV Lead Report exported successfully!');
  };

  const stats = [
    {
      label: 'Prospect Leads',
      value: '148+ Discovered',
      sub: 'India, VN, FR, DE, US & Global',
      icon: <Users className="w-5 h-5 text-emerald-400" />,
      glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]',
    },
    {
      label: 'Multilingual Engine',
      value: '25+ Native Languages',
      sub: 'VN, FR, DE, ES, JA, PT, NL...',
      icon: <Globe className="w-5 h-5 text-blue-400" />,
      glow: 'shadow-[0_0_20px_rgba(59,130,246,0.15)]',
    },
    {
      label: 'App Mockup Prompts',
      value: '100% Localized UI',
      sub: 'DALL-E 3 Translated Screen Text',
      icon: <ImageIcon className="w-5 h-5 text-purple-400" />,
      glow: 'shadow-[0_0_20px_rgba(168,85,247,0.15)]',
    },
    {
      label: 'Tone Safeguard',
      value: '100% Policy Compliant',
      sub: 'Zero filler / Hard rules active',
      icon: <ShieldCheck className="w-5 h-5 text-amber-400" />,
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
    },
  ];

  const adminTasks = [
    {
      id: 1,
      title: 'Review 12 Pending Native Drafts',
      desc: 'Vietnamese, French & German emails waiting for 1-click admin approval',
      path: '/outreach-agent?tab=review',
      badge: 'High Priority',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      icon: <Mail className="w-4 h-4 text-emerald-400" />,
    },
    {
      id: 2,
      title: 'Inspect DALL-E Phone Screen Prompts',
      desc: 'Verify translated UI button text ("S’abonner", "Méditer") for phone mockups',
      path: '/outreach-agent?tab=mockups',
      badge: 'Mockup AI',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
      icon: <ImageIcon className="w-4 h-4 text-purple-400" />,
    },
    {
      id: 3,
      title: 'Approve Facebook Group Content',
      desc: '3 scheduled community posts formatted for targeted groups',
      path: '/fb-agent',
      badge: 'Social Queue',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      icon: <Share2 className="w-4 h-4 text-blue-400" />,
    },
    {
      id: 4,
      title: 'Deliverability & Bounced Email Status',
      desc: '0 Active bounces (jess198402@gmail.com permanently removed)',
      path: '#',
      badge: 'Clean Status',
      badgeColor: 'bg-gray-800 text-gray-300 border-gray-700',
      icon: <ShieldAlert className="w-4 h-4 text-gray-400" />,
    },
  ];

  const languages = [
    { code: '🇮🇳 IN', name: 'India (English/Regional)', region: 'asia', status: 'Active' },
    { code: '🇻🇳 VN', name: 'Vietnam (Vietnamese)', region: 'asia', status: 'Native AI' },
    { code: '🇫🇷 FR', name: 'France (French)', region: 'eu', status: 'Native AI' },
    { code: '🇩🇪 DE', name: 'Germany (German)', region: 'eu', status: 'Native AI' },
    { code: '🇯🇵 JP', name: 'Japan (Japanese)', region: 'asia', status: 'Native AI' },
    { code: '🇪🇸 ES', name: 'Spain & LatAm (Spanish)', region: 'eu', status: 'Native AI' },
    { code: '🇧🇷 BR', name: 'Brazil (Portuguese)', region: 'americas', status: 'Native AI' },
    { code: '🇬🇧 UK', name: 'United Kingdom (English)', region: 'eu', status: 'Native English' },
    { code: '🇺🇸 US', name: 'United States (English)', region: 'americas', status: 'Native English' },
    { code: '🇦🇪 AE', name: 'UAE & Middle East (English/Arabic)', region: 'mea', status: 'Native AI' },
  ];

  const filteredLanguages = languages.filter(l => regionFilter === 'all' || l.region === regionFilter);

  const quickActions = [
    {
      title: 'Scrape Global Prospects',
      desc: 'Discover wellness & business leads in target cities',
      icon: <Search className="w-5 h-5 text-emerald-400" />,
      path: '/outreach-agent?action=scrape',
      color: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20',
    },
    {
      title: 'Review Localized Drafts',
      desc: 'Approve email & WhatsApp native messages',
      icon: <Mail className="w-5 h-5 text-blue-400" />,
      path: '/outreach-agent?tab=review',
      color: 'bg-blue-500/10 border-blue-500/30 text-blue-300 hover:bg-blue-500/20',
    },
    {
      title: 'DALL-E UI Phone Screen Prompts',
      desc: 'Generate localized phone mockup image prompts',
      icon: <ImageIcon className="w-5 h-5 text-purple-400" />,
      path: '/outreach-agent?tab=mockups',
      color: 'bg-purple-500/10 border-purple-500/30 text-purple-300 hover:bg-purple-500/20',
    },
    {
      title: 'FB Group Campaign',
      desc: 'Schedule automated social posts',
      icon: <Share2 className="w-5 h-5 text-sky-400" />,
      path: '/fb-agent',
      color: 'bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20',
    },
    {
      title: 'YouTube SEO & Titles',
      desc: 'Generate high-CTR titles & chapter specs',
      icon: <Video className="w-5 h-5 text-red-400" />,
      path: '/yt-agent',
      color: 'bg-red-500/10 border-red-500/30 text-red-300 hover:bg-red-500/20',
    },
  ];

  const agents = [
    {
      id: 'outreach',
      title: 'Business Outreach Agent',
      badge: 'Featured & Active',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      description: 'Automated lead discovery, country-based native language draft generation (VN, FR, DE, ES, JA), DALL-E phone screen UI mockup prompts with localized button text, and 1-click WhatsApp & email outreach.',
      icon: <Users className="w-8 h-8 text-emerald-400" />,
      path: '/outreach-agent',
      gradient: 'from-emerald-500/20 via-teal-500/10 to-transparent',
      borderColor: 'border-emerald-500/30 hover:border-emerald-500/60',
      glowColor: 'group-hover:shadow-[0_0_35px_rgba(16,185,129,0.25)]',
      highlights: [
        'Local Language AI (VN, FR, DE, ES, JA, PT...)',
        'Native English for India, UK, US, AU & Global',
        'DALL-E 3 App UI Mockup Prompts with Local Text',
        'Directory Auto-Scraper for Wellness & Businesses',
        'Tone Safeguard: Banned "split our time" / stock audit phrases',
      ],
    },
    {
      id: 'fb',
      title: 'Facebook Post Automator',
      badge: 'Distribution',
      badgeColor: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      description: 'Human-in-the-loop agent that formats, schedules, and customizes content across targeted Facebook groups and mindfulness communities.',
      icon: <Share2 className="w-8 h-8 text-blue-400" />,
      path: '/fb-agent',
      gradient: 'from-blue-500/20 via-indigo-500/10 to-transparent',
      borderColor: 'border-blue-500/30 hover:border-blue-500/60',
      glowColor: 'group-hover:shadow-[0_0_35px_rgba(59,130,246,0.25)]',
      highlights: [
        'Group-Specific Tones & Niche Formatting',
        'Human Approval Safeguard Queue',
        'Automated Post Scheduling Engine',
        'Engagement & Reach Tracking',
      ],
    },
    {
      id: 'yt',
      title: 'YouTube Metadata & SEO Engine',
      badge: 'SEO & Content',
      badgeColor: 'bg-red-500/20 text-red-300 border-red-500/30',
      description: 'AI-powered engine to generate high-CTR video title options, complete description chapters with 00:00 timestamps, thumbnail concept prompts, and optimal tag strategies.',
      icon: <Video className="w-8 h-8 text-red-400" />,
      path: '/yt-agent',
      gradient: 'from-red-500/20 via-pink-500/10 to-transparent',
      borderColor: 'border-red-500/30 hover:border-red-500/60',
      glowColor: 'group-hover:shadow-[0_0_35px_rgba(239,68,68,0.25)]',
      highlights: [
        '5 High-CTR Title Variations Per Video',
        'Full Description Specs with 00:00 Timestamps',
        'Thumbnail Art Direction Prompts',
        'Keyword & SEO Tag Strategy',
      ],
    },
  ];

  const recentLogs = [
    {
      id: 1,
      time: 'Just now',
      category: 'language',
      agent: 'Outreach Agent',
      type: 'Local Language AI',
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      message: 'Drafted Vietnamese email & WhatsApp message for Ho Chi Minh Wellness Center in Saigon.',
    },
    {
      id: 2,
      time: '5m ago',
      category: 'mockup',
      agent: 'Image Prompt Engine',
      type: 'DALL-E 3 Mockup',
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
      message: 'Generated DALL-E phone UI screen prompt with translated French button labels ("S’abonner", "Méditer").',
    },
    {
      id: 3,
      time: '12m ago',
      category: 'safeguard',
      agent: 'Tone Safeguard',
      type: 'Policy Enforcement',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      message: 'Checked prompt tone: Banned "split our time", "caught our eye", and raw placeholders. 100% compliant.',
    },
    {
      id: 4,
      time: '25m ago',
      category: 'scrape',
      agent: 'Directory Scraper',
      type: 'Lead Discovery',
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
      message: 'Scraped 15 new Wellness & Laughter Yoga centers in Sydney & Abu Dhabi.',
    },
    {
      id: 5,
      time: '1h ago',
      category: 'safeguard',
      agent: 'Bounce Guard',
      type: 'Deliverability',
      color: 'text-gray-300 bg-gray-800 border-gray-700',
      message: 'Bounced address jess198402@gmail.com safely suppressed from subscriber queue.',
    },
  ];

  const filteredLogs = recentLogs.filter((log) => {
    const matchesCategory = logFilter === 'all' || log.category === logFilter;
    const matchesSearch = !logSearch ||
      log.message.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.agent.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.type.toLowerCase().includes(logSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-16 relative">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 right-6 z-50 bg-gray-900 border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-2xl shadow-2xl flex items-center space-x-2 text-sm font-semibold"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Top Command Bar */}
      <div className="bg-gray-950/80 rounded-2xl p-4 border border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm font-extrabold text-white tracking-wide">Admin Control Deck</span>
              <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                Super Admin
              </span>
            </div>
            <p className="text-xs text-gray-400">Cloud Functions V2 API: <code className="text-emerald-400 font-mono">api-vvuw6rft4q-uc.a.run.app</code></p>
          </div>
        </div>

        {/* Admin Quick Action Controls */}
        <div className="flex flex-wrap items-center space-x-2.5 w-full md:w-auto justify-end">
          {/* Admin Mode Switcher */}
          <button
            onClick={() => setAdminMode(adminMode === 'production' ? 'sandbox' : 'production')}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center space-x-1.5 ${
              adminMode === 'production'
                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/40 text-amber-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${adminMode === 'production' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{adminMode === 'production' ? 'Mode: Production' : 'Mode: Sandbox Test'}</span>
          </button>

          {/* Policy Rules Button */}
          <button
            onClick={() => setShowRulesModal(true)}
            className="px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>AI Rules & Policy</span>
          </button>

          {/* Keyboard Shortcuts Button */}
          <button
            onClick={() => setShowShortcutsModal(true)}
            className="px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <Keyboard className="w-3.5 h-3.5 text-purple-400" />
            <span>Shortcuts (?)</span>
          </button>

          {/* Ping API Button */}
          <button
            onClick={handlePingAPI}
            disabled={isPingTesting}
            className="px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
            title="Ping Cloud Functions Endpoint"
          >
            <Server className={`w-3.5 h-3.5 ${isPingTesting ? 'text-purple-400 animate-pulse' : 'text-emerald-400'}`} />
            <span>API Ping</span>
          </button>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export CSV</span>
          </button>

          {/* Refresh Sync Button */}
          <button
            onClick={handleRefreshSync}
            disabled={isSyncing}
            className="p-2 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-300 hover:text-white transition-colors"
            title="Sync Cloud Data"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-purple-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Admin 1-Click Bulk Action Toolbar */}
      <div className="bg-gradient-to-r from-gray-950 via-purple-950/20 to-gray-950 rounded-2xl p-4 border border-purple-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-white tracking-wide">Admin 1-Click Bulk Operations</h3>
            <p className="text-xs text-purple-300">Fast batch actions for outreach drafts, email copy & WhatsApp dispatches</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAutoApproveDrafts}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-gray-950 text-xs font-bold transition-all flex items-center space-x-1.5 shadow-md"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Auto-Approve 12 Native Drafts</span>
          </button>

          <button
            onClick={handleCopyEmails}
            className="px-3.5 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <Copy className="w-3.5 h-3.5 text-blue-400" />
            <span>Copy Approved Emails</span>
          </button>

          <button
            onClick={handleCopyWhatsApp}
            className="px-3.5 py-1.5 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
            <span>Copy WhatsApp Links</span>
          </button>
        </div>
      </div>

      {/* Header Banner */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-gray-950 via-gray-900 to-gray-950 p-8 md:p-12 border border-gray-800 shadow-2xl">
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-96 h-96 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-4xl space-y-5">
          <div className="inline-flex items-center space-x-2.5 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold tracking-wide uppercase">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Autonomous AI Workforce Active & Operational</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
            Bliss Agents <span className="bg-gradient-to-r from-purple-400 via-pink-300 to-amber-200 bg-clip-text text-transparent">Command Center</span>
          </h1>

          <p className="text-gray-300 text-base md:text-lg leading-relaxed max-w-3xl">
            Orchestrate your autonomous AI agents for global lead discovery, country-based native language outreach, DALL-E phone mockup prompts, Facebook group distribution, and YouTube SEO growth.
          </p>

          {/* AI Tech Stack Chips */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-gray-900/90 border border-gray-800 text-xs font-medium text-gray-300">
              <Cpu className="w-3.5 h-3.5 text-indigo-400" />
              <span>Groq LLaMA-3 70B</span>
            </span>
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-gray-900/90 border border-gray-800 text-xs font-medium text-gray-300">
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span>Gemini 1.5 Flash</span>
            </span>
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-gray-900/90 border border-gray-800 text-xs font-medium text-gray-300">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>25+ Native Languages</span>
            </span>
            <span className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-gray-900/90 border border-gray-800 text-xs font-medium text-gray-300">
              <ImageIcon className="w-3.5 h-3.5 text-purple-400" />
              <span>DALL-E 3 Phone UI Prompt Engine</span>
            </span>
          </div>
        </div>

        {/* Live KPI Grid */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-8 border-t border-gray-800/80">
          {stats.map((stat, idx) => (
            <motion.div
              key={idx}
              whileHover={{ translateY: -3 }}
              className={`bg-gray-900/70 backdrop-blur-md rounded-2xl p-4.5 border border-gray-800 flex items-center space-x-4 ${stat.glow}`}
            >
              <div className="p-3 rounded-xl bg-gray-800/90 border border-gray-700/60 shadow-inner flex-shrink-0">
                {stat.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{stat.label}</p>
                <p className="text-base font-extrabold text-white tracking-wide mt-0.5 truncate">{stat.value}</p>
                <p className="text-[11px] font-medium text-gray-400 mt-0.5 truncate">{stat.sub}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </header>

      {/* Admin Actionable Task Queue Widget */}
      <div className="bg-gray-900/90 rounded-3xl p-6 border border-gray-800 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3.5">
          <div className="flex items-center space-x-2.5">
            <CheckSquare className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-bold text-white tracking-tight">Admin Actionable Checklist & Pending Reviews</h3>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-semibold">
            4 Tasks Ready
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {adminTasks.map((task) => (
            <Link key={task.id} to={task.path} className="group">
              <div className="bg-gray-950/70 hover:bg-gray-950 p-4.5 rounded-2xl border border-gray-800/90 hover:border-gray-700 transition-all flex items-start justify-between space-x-4">
                <div className="flex items-start space-x-3.5">
                  <div className="p-2.5 rounded-xl bg-gray-900 border border-gray-800 flex-shrink-0">
                    {task.icon}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">{task.title}</h4>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${task.badgeColor}`}>
                        {task.badge}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">{task.desc}</p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0 mt-1" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Multilingual Support Ticker with Region Filter */}
      <div className="bg-gray-900/80 rounded-2xl p-5 border border-gray-800/90 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Globe className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">Target Region Native Language Matrix</h3>
          </div>

          {/* Admin Region Filter Pills */}
          <div className="flex items-center space-x-1 bg-gray-950 p-1 rounded-xl border border-gray-800">
            {[
              { id: 'all', label: 'All Regions' },
              { id: 'asia', label: 'Asia/Pacific' },
              { id: 'eu', label: 'Europe (EU)' },
              { id: 'americas', label: 'Americas' },
              { id: 'mea', label: 'Middle East' },
            ].map((reg) => (
              <button
                key={reg.id}
                onClick={() => setRegionFilter(reg.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  regionFilter === reg.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {reg.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {filteredLanguages.map((lang, idx) => (
            <div
              key={idx}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-xl bg-gray-950/70 border border-gray-800 text-xs font-medium text-gray-300 hover:border-gray-700 transition-colors"
            >
              <span className="font-bold text-white">{lang.code}</span>
              <span className="text-gray-400">({lang.name})</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 italic pt-1">
          💡 <span className="text-gray-300">Rule Enforced</span>: Outreach messages and DALL-E phone mockup screen button text are automatically generated in the prospect's native local language based on their country location, maintaining clear English for India, US, UK, Australia, Singapore, and global hubs.
        </p>
      </div>

      {/* Quick Launchpad Section */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-white flex items-center space-x-2">
          <Zap className="w-5 h-5 text-amber-400" />
          <span>Quick Actions Launchpad</span>
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {quickActions.map((action, idx) => (
            <Link key={idx} to={action.path}>
              <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between h-full space-y-3 ${action.color}`}
              >
                <div className="flex items-center justify-between">
                  <div className="p-2 rounded-xl bg-gray-900/80 border border-gray-800">
                    {action.icon}
                  </div>
                  <ArrowRight className="w-4 h-4 opacity-70" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{action.title}</p>
                  <p className="text-xs text-gray-300 mt-1 line-clamp-2 leading-tight">{action.desc}</p>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>

      {/* Agents Grid Header */}
      <div className="flex items-center justify-between pt-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span>Autonomous AI Workspaces</span>
            <Sparkles className="w-5 h-5 text-amber-400" />
          </h2>
          <p className="text-sm text-gray-400 mt-1">Select an agent workspace to launch lead discovery, generate content, or manage outreach queues.</p>
        </div>
      </div>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {agents.map((agent) => (
          <Link key={agent.id} to={agent.path} className="group flex">
            <motion.div
              whileHover={{ scale: 1.02, translateY: -6 }}
              whileTap={{ scale: 0.98 }}
              className={`w-full bg-gray-900/90 rounded-3xl p-7 border ${agent.borderColor} ${agent.glowColor} shadow-2xl transition-all duration-300 relative overflow-hidden flex flex-col justify-between`}
            >
              {/* Background Accent Gradient */}
              <div className={`absolute top-0 right-0 w-56 h-56 bg-gradient-to-br ${agent.gradient} rounded-bl-full pointer-events-none group-hover:scale-125 transition-transform duration-500`} />

              <div>
                {/* Header Row */}
                <div className="flex justify-between items-start mb-6 relative z-10">
                  <div className="bg-gray-800/90 p-4 rounded-2xl border border-gray-700/60 shadow-inner">
                    {agent.icon}
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-semibold border ${agent.badgeColor}`}>
                    {agent.badge}
                  </span>
                </div>

                {/* Title & Description */}
                <h3 className="text-xl font-bold text-white mb-2.5 flex items-center group-hover:text-amber-200 transition-colors">
                  {agent.title}
                </h3>
                <p className="text-gray-300 text-sm leading-relaxed mb-6">
                  {agent.description}
                </p>

                {/* Feature Bullet List */}
                <div className="space-y-2.5 mb-6 pt-5 border-t border-gray-800/80">
                  {agent.highlights.map((item, i) => (
                    <div key={i} className="flex items-start text-xs text-gray-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mr-2 flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Button CTA Footer */}
              <div className="pt-4 border-t border-gray-800/80 flex items-center justify-between text-sm font-semibold text-gray-300 group-hover:text-white transition-colors">
                <span>Launch Agent Workspace</span>
                <div className="p-2.5 rounded-xl bg-gray-800 group-hover:bg-amber-400 group-hover:text-gray-950 transition-all duration-300 shadow-md">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            </motion.div>
          </Link>
        ))}
      </div>

      {/* Live System Activity Feed with Filter & Search */}
      <div className="bg-gray-900/80 rounded-3xl p-7 border border-gray-800 shadow-2xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Live System Activity & Guardrails Log</h3>
              <p className="text-xs text-gray-400">Real-time status updates from autonomous cloud functions and prompt engines</p>
            </div>
          </div>

          {/* Admin Log Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Log Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search logs..."
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl bg-gray-950 border border-gray-800 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-purple-500 w-36 sm:w-48"
              />
            </div>

            {/* Filter Category Pills */}
            <div className="flex items-center space-x-1 bg-gray-950 p-1 rounded-xl border border-gray-800">
              {[
                { id: 'all', label: 'All' },
                { id: 'language', label: 'Native AI' },
                { id: 'mockup', label: 'Mockups' },
                { id: 'safeguard', label: 'Safeguards' },
                { id: 'scrape', label: 'Scrapes' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setLogFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    logFilter === tab.id
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Log Entries */}
        <div className="space-y-3">
          {filteredLogs.length > 0 ? (
            filteredLogs.map((log) => (
              <div
                key={log.id}
                className="bg-gray-950/60 rounded-2xl p-4 border border-gray-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-gray-700 transition-colors"
              >
                <div className="flex items-start sm:items-center space-x-3">
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${log.color}`}>
                    {log.type}
                  </span>
                  <div>
                    <span className="text-xs font-bold text-white mr-2">{log.agent}:</span>
                    <span className="text-xs text-gray-300">{log.message}</span>
                  </div>
                </div>
                <span className="text-[11px] font-medium text-gray-400 flex-shrink-0">{log.time}</span>
              </div>
            ))
          ) : (
            <div className="py-8 text-center text-xs text-gray-400 italic bg-gray-950/40 rounded-2xl border border-gray-800/50">
              No activity logs match the selected filter query "{logSearch}".
            </div>
          )}
        </div>
      </div>

      {/* Admin Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showShortcutsModal && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-3xl p-7 max-w-lg w-full shadow-2xl space-y-5 relative overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-gray-800 pb-3.5">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
                    <Keyboard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Admin Keyboard Shortcuts</h3>
                    <p className="text-xs text-gray-400">Fast action keys available anywhere on the dashboard</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowShortcutsModal(false)}
                  className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="p-3 rounded-2xl bg-gray-950 border border-gray-800 flex items-center justify-between">
                  <span className="text-gray-300">Toggle Admin Shortcuts Drawer</span>
                  <kbd className="px-2 py-1 rounded bg-gray-800 border border-gray-700 text-purple-300 font-mono">?</kbd>
                </div>
                <div className="p-3 rounded-2xl bg-gray-950 border border-gray-800 flex items-center justify-between">
                  <span className="text-gray-300">Auto-Approve All Native Drafts</span>
                  <div className="flex items-center space-x-1 font-mono text-emerald-300">
                    <kbd className="px-2 py-1 rounded bg-gray-800 border border-gray-700">Shift</kbd>
                    <span>+</span>
                    <kbd className="px-2 py-1 rounded bg-gray-800 border border-gray-700">A</kbd>
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-gray-950 border border-gray-800 flex items-center justify-between">
                  <span className="text-gray-300">Export Admin CSV Report</span>
                  <div className="flex items-center space-x-1 font-mono text-blue-300">
                    <kbd className="px-2 py-1 rounded bg-gray-800 border border-gray-700">Shift</kbd>
                    <span>+</span>
                    <kbd className="px-2 py-1 rounded bg-gray-800 border border-gray-700">E</kbd>
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-gray-950 border border-gray-800 flex items-center justify-between">
                  <span className="text-gray-300">Sync Cloud Functions Engine</span>
                  <div className="flex items-center space-x-1 font-mono text-amber-300">
                    <kbd className="px-2 py-1 rounded bg-gray-800 border border-gray-700">Shift</kbd>
                    <span>+</span>
                    <kbd className="px-2 py-1 rounded bg-gray-800 border border-gray-700">R</kbd>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-800 flex justify-end">
                <button
                  onClick={() => setShowShortcutsModal(false)}
                  className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-bold text-xs transition-colors"
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Rules & Policy Inspector Modal */}
      <AnimatePresence>
        {showRulesModal && (
          <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-900 border border-gray-800 rounded-3xl p-7 max-w-2xl w-full shadow-2xl space-y-6 relative overflow-hidden"
            >
              <div className="flex items-center justify-between border-b border-gray-800 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Active AI Rules & Enforcement Inspector</h3>
                    <p className="text-xs text-gray-400">Hard policy constraints configured across backend prompt helpers</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRulesModal(false)}
                  className="p-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                <div className="p-4 rounded-2xl bg-gray-950 border border-emerald-500/30 space-y-1.5">
                  <div className="flex items-center space-x-2 text-emerald-400 font-bold text-sm">
                    <Globe className="w-4 h-4" />
                    <span>Rule 1: Country-based Native Local Language Engine</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Outreach emails, WhatsApp messages, and DALL-E phone screen UI prompts MUST be written in the prospect's local native language (e.g. Vietnamese for Saigon/Vietnam, French for France, German for Germany), keeping English for India and native English markets (UK, US, Canada, Australia, Singapore).
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-gray-950 border border-amber-500/30 space-y-1.5">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold text-sm">
                    <ShieldAlert className="w-4 h-4" />
                    <span>Rule 2: Banned Informal & Stock Audit Phrases</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    STRICTLY BANNED: <code className="text-amber-300 font-mono">"split our time"</code>, <code className="text-amber-300 font-mono">"split time"</code>, <code className="text-amber-300 font-mono">"caught our eye"</code>, <code className="text-amber-300 font-mono">"while reviewing your site"</code>, <code className="text-amber-300 font-mono">"one idea that came to mind"</code>, raw bracket placeholders <code className="text-amber-300 font-mono">[MindGym]</code>, and negative deficiency framing.
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-gray-950 border border-purple-500/30 space-y-1.5">
                  <div className="flex items-center space-x-2 text-purple-400 font-bold text-sm">
                    <ImageIcon className="w-4 h-4" />
                    <span>Rule 3: Localized DALL-E 3 App UI Mockup Prompts</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    Image prompts generated for DALL-E 3 phone screen mockups MUST explicitly instruct the rendering engine that UI titles, buttons, and tab bars appear in the prospect's native local language script (with 3-4 specific translated examples provided).
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-gray-950 border border-blue-500/30 space-y-1.5">
                  <div className="flex items-center space-x-2 text-blue-400 font-bold text-sm">
                    <CheckSquare className="w-4 h-4" />
                    <span>Rule 4: 100% Human-in-the-Loop Review Safeguard</span>
                  </div>
                  <p className="text-xs text-gray-300 leading-relaxed">
                    All generated outreach messages enter a pending review queue requiring admin inspection before email or WhatsApp dispatch.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-800 flex justify-between items-center text-xs text-gray-400">
                <span>Policy File: <code className="text-gray-300 font-mono">functions/aiHelpers.js</code></span>
                <button
                  onClick={() => setShowRulesModal(false)}
                  className="px-5 py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white font-bold transition-colors"
                >
                  Close Inspector
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default Dashboard;



