import React, { useState, useEffect } from 'react';
import { Video, Wand2, Copy, CheckCircle2, BookOpen } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function YTAgent() {
  const [booksData, setBooksData] = useState({});
  const [selectedBook, setSelectedBook] = useState('');
  const [selectedChapter, setSelectedChapter] = useState('');
  const [questionNumber, setQuestionNumber] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [originalText, setOriginalText] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    fetch('http://localhost:3001/api/books')
      .then(res => res.json())
      .then(data => {
        setBooksData(data);
        const firstBook = Object.keys(data)[0];
        if (firstBook) {
          setSelectedBook(firstBook);
          const firstChapter = Object.keys(data[firstBook])[0];
          if (firstChapter) {
            setSelectedChapter(firstChapter);
            const firstQuestion = data[firstBook][firstChapter][0];
            if (firstQuestion) {
              setQuestionNumber(firstQuestion);
            }
          }
        }
      })
      .catch(err => console.error("Error loading books:", err));
  }, []);

  const handleGenerate = async () => {
    if (!selectedBook || !selectedChapter || !questionNumber) return alert('Please fill in all fields.');
    
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('http://localhost:3001/api/yt-generate-from-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookName: selectedBook, chapterName: selectedChapter, questionNumber: questionNumber })
      });
      
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      
      setResult(data.metadata);
      setOriginalText(data.source);
    } catch (err) {
      setError('Error generating metadata: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex justify-between items-center bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-400 to-pink-500 bg-clip-text text-transparent flex items-center">
            <Video className="w-8 h-8 mr-3 text-red-500" />
            YouTube Metadata Generator
          </h1>
          <p className="text-gray-400 mt-1">AI-powered optimized titles, descriptions, and thumbnails</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Input Form */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
            <h2 className="text-xl font-semibold text-white mb-4 flex items-center">
              <BookOpen className="w-5 h-5 mr-2 text-indigo-400" />
              Source Material
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Select Book</label>
                <select
                  value={selectedBook}
                  onChange={(e) => {
                    setSelectedBook(e.target.value);
                    const firstChapter = Object.keys(booksData[e.target.value] || {})[0];
                    setSelectedChapter(firstChapter || '');
                  }}
                  className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                >
                  {Object.keys(booksData).map(book => (
                    <option key={book} value={book}>{book}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Select Chapter</label>
                <select
                  value={selectedChapter}
                  onChange={(e) => {
                    setSelectedChapter(e.target.value);
                    const firstQ = booksData[selectedBook]?.[e.target.value]?.[0];
                    setQuestionNumber(firstQ || '');
                  }}
                  className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                >
                  {selectedBook && booksData[selectedBook] && Object.keys(booksData[selectedBook]).map(chapter => (
                    <option key={chapter} value={chapter}>{chapter}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">Select Question</label>
                <select
                  value={questionNumber}
                  onChange={(e) => setQuestionNumber(e.target.value)}
                  className="w-full p-3 bg-gray-900 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-pink-500 focus:border-transparent transition-all"
                >
                  {selectedBook && selectedChapter && booksData[selectedBook]?.[selectedChapter]?.map(q => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className={`w-full py-3 px-4 rounded-lg font-bold text-white shadow-lg transition-all flex items-center justify-center
                  ${loading 
                    ? 'bg-gray-600 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-400 hover:to-pink-500 transform hover:-translate-y-1'
                  }`}
              >
                {loading ? (
                  <div className="flex items-center">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="mr-2"
                    >
                      <Wand2 className="w-5 h-5" />
                    </motion.div>
                    Generating...
                  </div>
                ) : (
                  <>
                    <Wand2 className="w-5 h-5 mr-2" />
                    Generate Metadata
                  </>
                )}
              </button>
            </div>
            
            {error && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-4 p-4 bg-red-900/50 border border-red-500/50 rounded-lg text-red-200 text-sm"
              >
                {error}
              </motion.div>
            )}
          </div>
        </div>

        {/* Right Column: Results */}
        <div className="lg:col-span-2 space-y-6">
          {originalText && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700"
            >
              <h2 className="text-xl font-semibold text-white mb-4 border-b border-gray-700 pb-2">Source Text</h2>
              <div className="space-y-4">
                <div className="bg-gray-900 p-4 rounded-lg border border-gray-600">
                  <h3 className="text-indigo-400 font-medium mb-1 text-sm uppercase tracking-wider">Question</h3>
                  <p className="text-white text-lg">{originalText.q}</p>
                </div>
                <div className="bg-gray-900 p-4 rounded-lg border border-gray-600">
                  <h3 className="text-pink-400 font-medium mb-1 text-sm uppercase tracking-wider">Answer</h3>
                  <p className="text-gray-300 whitespace-pre-wrap">{originalText.a}</p>
                </div>
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                
                {/* Titles Section */}
                <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-white">15 High-CTR Titles</h2>
                    <button onClick={() => copyToClipboard(result.titles, 'titles')} className="text-gray-400 hover:text-white transition-colors">
                      {copied === 'titles' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="bg-gray-900 p-4 rounded-xl border border-gray-600 whitespace-pre-wrap text-gray-300 font-mono text-sm leading-relaxed">
                    {result.titles}
                  </div>
                </div>

                {/* Description Section */}
                <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-white">YouTube Description</h2>
                    <button onClick={() => copyToClipboard(result.description, 'description')} className="text-gray-400 hover:text-white transition-colors">
                      {copied === 'description' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="bg-gray-900 p-4 rounded-xl border border-gray-600 whitespace-pre-wrap text-gray-300 text-md leading-relaxed">
                    {result.description}
                  </div>
                </div>

                {/* Hashtags & Tags Section */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-semibold text-white">Hashtags</h2>
                      <button onClick={() => copyToClipboard(result.hashtags, 'hashtags')} className="text-gray-400 hover:text-white transition-colors">
                        {copied === 'hashtags' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-xl border border-gray-600 text-blue-400 font-medium">
                      {result.hashtags}
                    </div>
                  </div>
                  
                  <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-semibold text-white">Tags</h2>
                      <button onClick={() => copyToClipboard(result.tags, 'tags')} className="text-gray-400 hover:text-white transition-colors">
                        {copied === 'tags' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                      </button>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-xl border border-gray-600 text-yellow-400 font-medium text-sm">
                      {result.tags}
                    </div>
                  </div>
                </div>

                {/* Thumbnails Section */}
                <div className="bg-gray-800 p-6 rounded-2xl shadow-xl border border-gray-700">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-white">Thumbnail Prompts</h2>
                    <button onClick={() => copyToClipboard(result.thumbnail, 'thumbnail')} className="text-gray-400 hover:text-white transition-colors">
                      {copied === 'thumbnail' ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                  <div className="bg-gray-900 p-4 rounded-xl border border-gray-600 whitespace-pre-wrap text-pink-300 font-medium">
                    {result.thumbnail}
                  </div>
                </div>

              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}

export default YTAgent;
