import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Home } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import FBAgent from './pages/FBAgent';
import YTAgent from './pages/YTAgent';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-900 text-white font-sans flex flex-col">
        {/* Global Navigation */}
        <nav className="bg-gray-800 border-b border-gray-700 py-4 px-8 sticky top-0 z-50">
          <div className="max-w-6xl mx-auto flex justify-between items-center">
            <Link to="/" className="flex items-center space-x-2 text-xl font-bold hover:opacity-80 transition-opacity">
              <span className="bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">Bliss Agents</span>
            </Link>
            <div className="flex space-x-6">
              <Link to="/" className="flex items-center space-x-1 text-gray-400 hover:text-white transition-colors text-sm font-medium">
                <Home className="w-4 h-4" />
                <span>Dashboard</span>
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
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
