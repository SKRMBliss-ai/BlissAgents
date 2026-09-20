import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import FBAgent from './pages/FBAgent';
import YTAgent from './pages/YTAgent';
import OutreachAgent from './pages/OutreachAgent';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col">
        {/* Global Navigation */}
        <nav className="bg-gray-900/90 backdrop-blur-md border-b border-gray-800 py-3.5 px-6 sticky top-0 z-50 shadow-lg">
          <div className="max-w-7xl mx-auto flex justify-between items-center">
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-amber-400 flex items-center justify-center font-black text-gray-950 text-lg shadow-md group-hover:scale-105 transition-transform">
                B
              </div>
              <div>
                <span className="bg-gradient-to-r from-purple-400 via-pink-300 to-amber-200 bg-clip-text text-transparent font-extrabold text-xl tracking-tight">Bliss Agents</span>
                <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300">v2.5 AI</span>
              </div>
            </Link>
            <div className="flex items-center space-x-1 sm:space-x-4">
              <Link to="/" className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-gray-800/60 transition-all text-xs sm:text-sm font-medium">
                <Home className="w-4 h-4 text-purple-400" />
                <span>Dashboard</span>
              </Link>
              <Link to="/outreach-agent" className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-gray-300 hover:text-emerald-300 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20 transition-all text-xs sm:text-sm font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Outreach Agent</span>
              </Link>
              <Link to="/fb-agent" className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-gray-300 hover:text-blue-300 hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20 transition-all text-xs sm:text-sm font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                <span>Facebook Agent</span>
              </Link>
              <Link to="/yt-agent" className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-gray-300 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all text-xs sm:text-sm font-medium">
                <span className="w-2 h-2 rounded-full bg-red-400" />
                <span>YouTube Agent</span>
              </Link>
            </div>
          </div>
        </nav>

        {/* Page Content */}
        <main className="flex-1 p-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/fb-agent" element={<FBAgent />} />
            <Route path="/yt-agent" element={<YTAgent />} />
            <Route path="/outreach-agent" element={<OutreachAgent />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
