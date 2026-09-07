import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Play, Square, CheckCircle, Image as ImageIcon, Link as LinkIcon, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const socket = io('http://localhost:3001');

function FBAgent() {
  const [status, setStatus] = useState({ state: 'idle', logs: [] });
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [failedGroups, setFailedGroups] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [groups, setGroups] = useState(`https://www.facebook.com/groups/822502437553383/
https://www.facebook.com/groups/1951603422376327
https://www.facebook.com/groups/1686106071892376
https://www.facebook.com/groups/2716549981951800
https://www.facebook.com/groups/EckhartTolleians
https://www.facebook.com/groups/515589879556944
https://www.facebook.com/groups/113913972042547/
https://www.facebook.com/skrmbliss/
https://www.facebook.com/groups/1434138693933877
https://www.facebook.com/groups/270020646495756/
https://www.facebook.com/groups/477873955911205/
https://www.facebook.com/groups/553265302250277/
https://www.facebook.com/groups/992260288565689/
https://www.facebook.com/groups/1185142974948681/
https://www.facebook.com/groups/815644013693086/
https://www.facebook.com/groups/486881065165897/
https://www.facebook.com/groups/270646983060345/
https://www.facebook.com/groups/493465308588391/
https://www.facebook.com/groups/247838265252370/
https://www.facebook.com/groups/563049964374752/
https://www.facebook.com/groups/137201078115641/
https://www.facebook.com/groups/1189504006665062/
https://www.facebook.com/groups/2446394515620820/
https://www.facebook.com/groups/1692374491713588/
https://www.facebook.com/groups/515051955909934/
https://www.facebook.com/groups/426660259834622/
https://www.facebook.com/groups/453405961660470/
https://www.facebook.com/groups/937378784825967/
https://www.facebook.com/groups/274301147706161/
https://www.facebook.com/groups/manchestermindfulness/
https://www.facebook.com/groups/thealchemisttribe/
https://www.facebook.com/groups/1164487257958293/
https://www.facebook.com/groups/691845166186433/
https://www.facebook.com/groups/906852056665423/
https://www.facebook.com/groups/1673816296316567/
https://www.facebook.com/groups/243784577683/
https://www.facebook.com/groups/245349380830741/
https://www.facebook.com/groups/488494665607567/
https://www.facebook.com/groups/335984007139243/
https://www.facebook.com/groups/629555443733186/
https://www.facebook.com/groups/yogacentre/
https://www.facebook.com/groups/881782805675703/`);
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [mediaType, setMediaType] = useState('image');
  const [screenshot, setScreenshot] = useState(null);
  const logsEndRef = useRef(null);

  useEffect(() => {
    socket.on('status', (data) => setStatus(data));
    socket.on('state', (state) => setStatus(prev => ({ ...prev, state })));
    socket.on('log', (log) => setStatus(prev => ({ ...prev, logs: [...prev.logs, log] })));
    socket.on('screenshot', (filename) => setScreenshot(`http://localhost:3001/screenshots/${filename}`));
    socket.on('failed_group', (url) => setFailedGroups(prev => [...prev, url]));

    return () => {
      socket.off('status');
      socket.off('state');
      socket.off('log');
      socket.off('screenshot');
      socket.off('failed_group');
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
      setMediaType(file.type.startsWith('video/') ? 'video' : 'image');
    }
  };

  const handleStart = async () => {
    const groupList = groups.split('\n').map(g => g.trim()).filter(g => g);
    if (groupList.length === 0) return alert('Please add at least one group URL.');
    if (!text) return alert('Please add some text for the post.');

    setFailedGroups([]); // Clear previous failures

    const formData = new FormData();
    formData.append('text', text);
    formData.append('title', title);
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

  const fetchHistory = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/history');
      const data = await res.json();
      setHistoryData(data);
      setShowHistory(true);
    } catch (err) {
      console.error(err);
      alert('Could not load history.');
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
              <label className="block text-sm font-medium text-gray-400 mb-2">Video Title (Only used for Videos)</label>
              <input 
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                placeholder="Enter a title for the video..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                disabled={status.state !== 'idle'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Hashtags / Video Tags</label>
              <input 
                className="w-full bg-gray-900 border border-gray-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                placeholder="#awesome #product"
                value={hashtags}
                onChange={e => setHashtags(e.target.value)}
                disabled={status.state !== 'idle'}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">Media (Image/Video)</label>
              <div className="border-2 border-dashed border-gray-600 rounded-xl p-6 flex flex-col items-center justify-center hover:border-indigo-400 transition-colors cursor-pointer relative overflow-hidden bg-gray-900">
                <input 
                  type="file" 
                  accept="image/*,video/*" 
                  onChange={handleImageChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={status.state !== 'idle'}
                />
                {imagePreview ? (
                  mediaType === 'video' ? (
                    <video src={imagePreview} controls className="h-32 object-contain relative z-20" />
                  ) : (
                    <img src={imagePreview} alt="Preview" className="h-32 object-contain relative z-20" />
                  )
                ) : (
                  <div className="text-center">
                    <ImageIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <span className="text-gray-400 text-sm">Click or drag image/video to upload</span>
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

            {status.state === 'idle' && failedGroups.length > 0 && (
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => {
                  setGroups(failedGroups.join('\n'));
                  setFailedGroups([]);
                }}
                className="w-full flex items-center justify-center space-x-2 bg-yellow-600 hover:bg-yellow-500 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-yellow-600/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Retry {failedGroups.length} Failed Group{failedGroups.length > 1 ? 's' : ''}</span>
              </motion.button>
            )}

            <button
              onClick={fetchHistory}
              className="w-full flex items-center justify-center space-x-2 bg-gray-800 hover:bg-gray-700 text-gray-300 py-3 rounded-xl font-bold transition-all border border-gray-700 mt-4"
            >
              <span>View History (Last 48 hours)</span>
            </button>
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

      {/* History Modal */}
      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl"
            >
              <div className="flex justify-between items-center p-6 border-b border-gray-800">
                <h2 className="text-2xl font-bold text-white">Bot Run History (Last 48 Hours)</h2>
                <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
              </div>
              <div className="p-6 overflow-y-auto flex-1">
                {historyData.length === 0 ? (
                  <p className="text-gray-400 text-center py-8">No runs found in the last 48 hours.</p>
                ) : (
                  <div className="space-y-4">
                    {historyData.map((run, i) => (
                      <div key={i} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700/50">
                        <div className="flex justify-between items-start mb-2">
                          <div className="text-sm text-gray-400">{new Date(run.timestamp).toLocaleString()}</div>
                          <div className="text-sm font-medium space-x-3">
                            <span className="text-green-400">{run.successfulGroups.length} Success</span>
                            <span className={run.failedGroups.length > 0 ? "text-red-400" : "text-gray-500"}>{run.failedGroups.length} Failed</span>
                          </div>
                        </div>
                        <p className="text-white text-sm mb-3">"{run.text}"</p>
                        {run.failedGroups.length > 0 && (
                          <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-3">
                            <h4 className="text-red-400 text-xs font-bold mb-1 uppercase tracking-wider">Failed Groups:</h4>
                            <ul className="list-disc list-inside text-xs text-red-300/80">
                              {run.failedGroups.map((g, j) => <li key={j} className="truncate">{g}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default FBAgent;
