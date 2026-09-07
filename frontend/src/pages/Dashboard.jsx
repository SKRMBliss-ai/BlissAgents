import React from 'react';
import { Link } from 'react-router-dom';
import { Share2, Video, Sparkles, Users } from 'lucide-react';
import { motion } from 'framer-motion';

function Dashboard() {
  const agents = [
    {
      id: 'fb',
      title: 'Facebook Post Automator',
      description: 'Human-in-the-loop agent that automatically posts your content to multiple Facebook groups.',
      icon: <Share2 className="w-8 h-8 text-blue-500" />,
      path: '/fb-agent',
      color: 'from-blue-500 to-indigo-600',
    },
    {
      id: 'yt',
      title: 'YouTube Metadata Generator',
      description: 'AI-powered agent to generate high-CTR titles, descriptions, and thumbnail ideas from a single topic.',
      icon: <Video className="w-8 h-8 text-red-500" />,
      path: '/yt-agent',
      color: 'from-red-500 to-pink-600',
    },
    {
      id: 'outreach',
      title: 'Business Outreach Agent',
      description: 'Research prospects, draft personalized outreach messages, and track follow-ups — you approve every message before it goes out.',
      icon: <Users className="w-8 h-8 text-emerald-500" />,
      path: '/outreach-agent',
      color: 'from-emerald-500 to-teal-600',
    }
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      <header className="text-center py-12">
        <h1 className="text-5xl font-extrabold bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent mb-4">
          Bliss Agents
        </h1>
        <p className="text-xl text-gray-400">Select an autonomous agent to assist you.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {agents.map((agent, index) => (
          <Link key={agent.id} to={agent.path}>
            <motion.div 
              whileHover={{ scale: 1.02, translateY: -5 }}
              whileTap={{ scale: 0.98 }}
              className="bg-gray-800 rounded-3xl p-8 border border-gray-700 hover:border-gray-500 shadow-xl cursor-pointer transition-all relative overflow-hidden group"
            >
              <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${agent.color} opacity-10 rounded-bl-full group-hover:scale-150 transition-transform duration-500`} />
              
              <div className="bg-gray-900 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-inner border border-gray-800">
                {agent.icon}
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-3 flex items-center">
                {agent.title}
                <Sparkles className="w-5 h-5 ml-2 text-yellow-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h2>
              
              <p className="text-gray-400 leading-relaxed">
                {agent.description}
              </p>
            </motion.div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
