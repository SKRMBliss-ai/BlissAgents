import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Play, Square, CheckCircle, Image as ImageIcon, Link as LinkIcon, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const socket = io('http://localhost:3001');

function FBAgent() {
  const [status, setStatus] = useState({ state: 'idle', logs: [] });
  const [text, setText] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [groups, setGroups] = useState('');
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [screenshot, setScreenshot] = useState(null);
  const logsEndRef = useRef(null);

  useEffect(() => {
    socket.on('status', (data) => setStatus(data));
    socket.on('state', (state) => setStatus(prev => ({ ...prev, state })));
    socket.on('log', (log) => setStatus(prev => ({ ...prev, logs: [...prev.logs, log] })));
    socket.on('screenshot', (filename) => setScreenshot(`http://localhost:3001/screenshots/${filename}`));

    return () => {
      socket.off('status');
      socket.off('state');
      socket.off('log');
      socket.off('screenshot');
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [status.logs]);

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImage(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleStart = async () => {
    const groupList = groups.split('\n').map(g => g.trim()).filter(g => g);
    if (groupList.length === 0) return alert('Please add at least one group URL.');
    if (!text) return alert('Please add some text for the post.');

    const formData = new FormData();
    formData.append('text', text);
    formData.append('hashtags', hashtags);
    formData.append('groups', JSON.stringify(groupList));
    if (image) formData.append('image', image);

    try {
      await fetch('http://localhost:3001/api/start', {
        method: 'POST',
        body: formData,
      });
      setScreenshot(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStop = async () => {
    await fetch('http://localhost:3001/api/stop', { method: 'POST' });
  };

  const handleApprove = async () => {
    await fetch('http://localhost:3001/api/approve', { method: 'POST' });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex justify-between items-center bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
            Facebook Post Automator
          </h1>
          <p className="text-gray-400 mt-1">Human-in-the-loop Facebook Group Posting</p>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-sm font-medium text-gray-400">Status:</span>
          <div className={`px-4 py-1.5 rounded-full text-sm font-bold capitalize flex items-center space-x-2 ${
            status.state === 'idle' ? 'bg-gray-700 text-gray-300' :
            status.state === 'running' ? 'bg-green-900/50 text-green-400 border border-green-800/50' :
            status.state === 'waiting_login' ? 'bg-orange-900/50 text-orange-400 border border-orange-800/50' :
            'bg-blue-900/50 text-blue-400 border border-blue-800/50 shadow-[0_0_15px_rgba(59,130,246,0.5)]'
          }`}>
            {status.state === 'running' && <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>}
            {status.state === 'waiting_approval' && <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>}
            <span>{status.state.replace('_', ' ')}</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Post Creator */}
        <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 space-y-6">
          <h2 className="text-xl font-semibold flex items-center space-x-2 border-b border-gray-700 pb-4">
            <LinkIcon className="w-5 h-5 text-indigo-400" />
            <span>Compose Post</span>
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Group URLs (One per line)</label>
              <textarea 
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                rows="4"
                placeholder="https://facebook.com/groups/example1&#10;https://facebook.com/groups/example2"
                value={groups}
                onChange={e => setGroups(e.target.value)}
                disabled={status.state !== 'idle'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Post Text</label>
              <textarea 
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none"
                rows="5"
                placeholder="What's on your mind?"
                value={text}
                onChange={e => setText(e.target.value)}
                disabled={status.state !== 'idle'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Hashtags</label>
              <input 
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                placeholder="#awesome #product"
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
                disabled={status.state !== 'idle'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Image</label>
              <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 flex flex-col items-center justify-center hover:border-indigo-400 transition-colors cursor-pointer relative overflow-hidden bg-gray-900">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleImageChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={status.state !== 'idle'}
                />
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="h-32 object-contain" />
                ) : (
                  <div className="text-center">
                    <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <span className="text-gray-400 text-sm">Click or drag image to upload</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 flex space-x-4">
              {status.state === 'idle' ? (
                <button 
                  onClick={handleStart}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-4 px-6 rounded-xl shadow-lg shadow-indigo-900/50 flex items-center justify-center space-x-2 transition-all active:scale-95"
                >
                  <Play className="w-5 h-5" />
                  <span>Start Agent</span>
                </button>
              ) : (
                <button 
                  onClick={handleStop}
                  className="flex-1 bg-red-600 hover:bg-red-500 text-white font-semibold py-4 px-6 rounded-xl shadow-lg shadow-red-900/50 flex items-center justify-center space-x-2 transition-all active:scale-95"
                >
                  <Square className="w-5 h-5" />
                  <span>Stop Agent</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Dashboard & Logs */}
        <div className="space-y-8 flex flex-col">
          
          {/* Manual Approval Card */}
          <AnimatePresence>
            {status.state === 'waiting_approval' && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-blue-900/30 border-2 border-blue-500 rounded-2xl p-6 shadow-[0_0_30px_rgba(59,130,246,0.3)] flex flex-col items-center justify-center text-center space-y-6"
              >
                <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mb-2">
                  <CheckCircle className="w-8 h-8 text-blue-400 animate-pulse" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2">Manual Review Required</h3>
                  <p className="text-blue-200">The bot has prepared the post. Please check the browser window.</p>
                </div>
                <button 
                  onClick={handleApprove}
                  className="w-full bg-blue-500 hover:bg-blue-400 text-white font-bold py-4 px-8 rounded-xl shadow-lg shadow-blue-900/50 transition-all transform hover:scale-105 active:scale-95 text-lg"
                >
                  Approve & Post
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Live Screenshot Preview */}
          {screenshot && (
             <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700">
                <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider flex items-center">
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Live Browser View
                </h3>
                <div className="rounded-xl overflow-hidden border border-gray-700 bg-black aspect-video flex items-center justify-center">
                  <img src={screenshot} alt="Bot Browser" className="w-full h-full object-cover opacity-80" />
                </div>
             </div>
          )}

          {/* Live Logs */}
          <div className="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 flex-1 flex flex-col max-h-[500px]">
            <h3 className="text-sm font-semibold text-gray-400 mb-4 uppercase tracking-wider flex items-center">
              <List className="w-4 h-4 mr-2" />
              Live Execution Logs
            </h3>
            <div className="flex-1 bg-gray-900 rounded-xl border border-gray-700 p-4 overflow-y-auto space-y-3 font-mono text-sm">
              {status.logs.length === 0 ? (
                <div className="text-gray-500 text-center mt-10">No logs yet. Start the agent.</div>
              ) : (
                status.logs.map((log, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`p-3 rounded-lg border-l-4 ${
                      log.type === 'error' ? 'bg-red-900/20 border-red-500 text-red-200' :
                      log.type === 'success' ? 'bg-green-900/20 border-green-500 text-green-200' :
                      log.type === 'warning' ? 'bg-orange-900/20 border-orange-500 text-orange-200' :
                      'bg-gray-800 border-indigo-500 text-gray-300'
                    }`}
                  >
                    <span className="opacity-50 mr-2">[{new Date().toLocaleTimeString()}]</span>
                    {log.message}
                  </motion.div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default FBAgent;
