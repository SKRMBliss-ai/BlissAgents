import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Share2, Video, Sparkles, Users, ArrowRight, Activity,
  ShieldCheck, Globe, Zap, Cpu, Search, Mail, MessageSquare,
  Image as ImageIcon, CheckCircle2, RefreshCw, Terminal
} from 'lucide-react';
import { motion } from 'framer-motion';

function Dashboard() {
  const [activeTab, setActiveTab] = useState('all');

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
      value: '100% Compliant',
      sub: 'Zero filler / Professional tone',
      icon: <ShieldCheck className="w-5 h-5 text-amber-400" />,
      glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]',
    },
  ];

  const languages = [
    { code: '🇮🇳 IN', name: 'India (English/Regional)', status: 'Active' },
    { code: '🇻🇳 VN', name: 'Vietnam (Vietnamese)', status: 'Native AI' },
    { code: '🇫🇷 FR', name: 'France (French)', status: 'Native AI' },
    { code: '🇩🇪 DE', name: 'Germany (German)', status: 'Native AI' },
    { code: '🇯🇵 JP', name: 'Japan (Japanese)', status: 'Native AI' },
    { code: '🇪🇸 ES', name: 'Spain & LatAm (Spanish)', status: 'Native AI' },
    { code: '🇧🇷 BR', name: 'Brazil (Portuguese)', status: 'Native AI' },
    { code: '🇬🇧 UK', name: 'United Kingdom (English)', status: 'Native English' },
    { code: '🇺🇸 US', name: 'United States (English)', status: 'Native English' },
    { code: '🇦🇪 AE', name: 'UAE & Middle East (English/Arabic)', status: 'Native AI' },
  ];

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
      agent: 'Outreach Agent',
      type: 'Local Language AI',
      color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
      message: 'Drafted Vietnamese email & WhatsApp message for Ho Chi Minh Wellness Center in Saigon.',
    },
    {
      id: 2,
      time: '5m ago',
      agent: 'Image Prompt Engine',
      type: 'DALL-E 3 Mockup',
      color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
      message: 'Generated DALL-E phone UI screen prompt with translated French button labels ("S’abonner", "Méditer").',
    },
    {
      id: 3,
      time: '12m ago',
      agent: 'Tone Safeguard',
      type: 'Policy Enforcement',
      color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
      message: 'Checked prompt tone: Banned "split our time", "caught our eye", and raw placeholders. 100% compliant.',
    },
    {
      id: 4,
      time: '25m ago',
      agent: 'Directory Scraper',
      type: 'Lead Discovery',
      color: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
      message: 'Scraped 15 new Wellness & Laughter Yoga centers in Sydney & Abu Dhabi.',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in duration-500 pb-16">
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

      {/* Multilingual Support Ticker */}
      <div className="bg-gray-900/80 rounded-2xl p-5 border border-gray-800/90 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Globe className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white tracking-wide">Target Region Native Language Matrix</h3>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-medium">
            Auto-Detects Prospect Country
          </span>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {languages.map((lang, idx) => (
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

      {/* Live System Activity Feed */}
      <div className="bg-gray-900/80 rounded-3xl p-7 border border-gray-800 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-gray-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-400">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Live System Activity & Guardrails Log</h3>
              <p className="text-xs text-gray-400">Real-time status updates from autonomous cloud functions and prompt engines</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Live Stream</span>
          </div>
        </div>

        <div className="space-y-3">
          {recentLogs.map((log) => (
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
          ))}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

