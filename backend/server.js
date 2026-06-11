const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { startBot, stopBot, approvePost } = require('./bot');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all for local dev
  }
});

app.use(cors());
app.use(express.json());

// Setup storage for image uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = './uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

require('dotenv').config();
const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Serve screenshots
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

let currentStatus = { state: 'idle', logs: [] };

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.emit('status', currentStatus);

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const broadcast = (event, data) => {
  if (event === 'log') currentStatus.logs.push(data);
  if (event === 'state') currentStatus.state = data;
  io.emit(event, data);
};

// API Endpoints
app.post('/api/start', upload.single('image'), async (req, res) => {
  if (currentStatus.state !== 'idle') {
    return res.status(400).json({ error: 'Bot is already running' });
  }

  const { text, hashtags, groups } = req.body;
  const imagePath = req.file ? path.join(__dirname, req.file.path) : null;
  const groupList = JSON.parse(groups || '[]');

  if (groupList.length === 0) {
    return res.status(400).json({ error: 'No groups provided' });
  }

  currentStatus = { state: 'running', logs: [] };
  broadcast('state', 'running');
  
  startBot({ text, hashtags, groups: groupList, imagePath, broadcast })
    .then(() => {
      broadcast('state', 'idle');
      currentStatus.state = 'idle';
    })
    .catch(err => {
      console.error(err);
      broadcast('log', { message: 'Error: ' + err.message, type: 'error' });
      broadcast('state', 'idle');
      currentStatus.state = 'idle';
    });

  res.json({ message: 'Bot started' });
});

app.post('/api/approve', (req, res) => {
  approvePost();
  res.json({ message: 'Approved' });
});

app.post('/api/stop', (req, res) => {
  stopBot();
  currentStatus.state = 'idle';
  broadcast('state', 'idle');
  res.json({ message: 'Bot stopped' });
});

const booksDataPath = path.join(__dirname, 'data', 'books.json');
let booksData = {};
try {
  if (fs.existsSync(booksDataPath)) {
    booksData = JSON.parse(fs.readFileSync(booksDataPath, 'utf8'));
  }
} catch (e) {
  console.error("Error loading books.json:", e);
}

// Serve available books and chapters
app.get('/api/books', (req, res) => {
  try {
    const result = {};
    for (const [bookName, bookContent] of Object.entries(booksData)) {
      result[bookName] = {};
      for (const [chapterName, chapterData] of Object.entries(bookContent)) {
        result[bookName][chapterName] = Object.keys(chapterData.questions);
      }
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// YouTube Metadata Generator from Book Endpoint
app.post('/api/yt-generate-from-book', async (req, res) => {
  const { bookName, chapterName, questionNumber } = req.body;
  if (!bookName || !chapterName || !questionNumber) {
    return res.status(400).json({ error: 'Book Name, Chapter Name, and Question Number are required' });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set in backend/.env' });
  }

  const book = booksData[bookName];
  if (!book) return res.status(404).json({ error: 'Book not found' });
  
  const chapter = book[chapterName];
  if (!chapter) return res.status(404).json({ error: 'Chapter not found' });

  const qa = chapter.questions[questionNumber];
  if (!qa) return res.status(404).json({ error: 'Question not found' });

  const prompt = `
You are a YouTube title strategist for a spiritual/mindfulness channel in the lineage of Eckhart Tolle's "The Power of Now", Michael Singer.
The channel teaches presence, mindfulness, stillness, ego dissolution, and freedom from the thinking mind.

TASK: Generate 15 high-CTR YouTube video titles, a highly conversational and human-like description, optimized hashtags, tags, and a creative thumbnail prompt based on the specific Book Question and Answer below.

--- SOURCE TEXT ---
Question: ${qa.q}
Answer: ${qa.a}
-------------------

NON-NEGOTIABLE RULES FOR TITLES:
1. Length: 45–65 characters before the suffix. Mobile truncates at ~60.
2. End every long-form title with the branded suffix: | Power of Now Explanation
   (Skip the suffix only for Shorts-style titles I label "SHORT".)
3. Use ONE psychological hook per title — never stack two.
4. Lead with the primary keyword (or exotic word) in the first 4 words when possible.
5. No emojis. No ALL CAPS except a single emphasized word (e.g., STOP, LIVING, NEVER).
6. Avoid generic words: "amazing," "incredible," "ultimate," "best ever."
7. Don't promise what the video can't deliver.
8. At least 4 of the 15 titles MUST use the Exotic Word Formula (K) from the word bank below.

MIX THESE 11 PROVEN HOOK FORMULAS:
A. Imperative + Transformation -> "Stop [pain]: [Practice] Will Change Your Life"
B. Time-Stamped Trick -> "[Outcome] in 10 Seconds: [Authority] Technique"
C. Named Technique Reveal -> "The '[Name]' Technique: [Authority's] Secret to [Outcome]"
D. Identity Reframe + Proof -> "You Are Not Your [X] (Here's Proof)"
E. Trap / Illusion -> "[Concept] is a Trap: The Illusion Explained"
F. Paradox Hook -> "Why You Still [Negative] Even When Life Is 'Fine'"
G. Listicle -> "3 Ways to [Handle Pain] Without Losing Your Peace"
H. The Hidden Enemy -> "The [Metaphor] That's Quietly [Destroying X]"
I. Mind-Lie Exposure -> "STOP Your Mind From [Lying/Tricking] You (10-Second Trick)"
J. Question + Cure -> "The Only Cure for [Modern Pain] (Eckhart Tolle Explained)"
K. EXOTIC WORD FORMULA -> Lead with an untranslated spiritual word.
   Subformulas:
   K1. "[Word]: The [Tradition] Word for [Modern Pain] | Power of Now Explanation"
   K2. "[Word] Explained: How to [Outcome] Without [Effort/Thought]"
   K3. "You Already Have [Word] (You Just Don't Know It)"
   K4. "Eckhart Tolle Calls It Presence. [Tradition] Calls It [Word]."
   K5. "The '[Word]' Moment: When the Mind Finally [Stops/Dissolves]"
   K6. "What [Tradition] Calls '[Word]' Will End Your [Modern Pain]"

EXOTIC WORD BANK:
TIER 1: Kensho, Mushin, Mu, Wu Wei, Samadhi, Turiya, Sahaja, Rigpa, Fana, Tathata
TIER 2: Sunyata, Anatta, Bodhi, Shoshin, Ataraxia, Hesychia, Kenosis, Apatheia, Bodhicitta, Vairagya
TIER 3: Yugen, Ma, Mono no aware, Anicca, Dukkha, Maya, Lila, Drashta, Nafs, Dhikr, Satori

POWER WORDS: Trap, Illusion, Secret, Truth, Proof, Cure, Trick, Technique, Tormentor, Quiet, Stillness, Surrender, Awaken, Dissolve, Watcher, Pain Body, Samskara, Suffering, Freedom, Peace, Presence, Now, Ego, Thoughts, Identity, Glimpse, Witness

EMOTIONAL TARGETS: Overthinking, Anxiety, Anger, Resentment, Guilt, Shame, Doubt, Fear, Loneliness, Comparison, Self-criticism, Waiting, Regret, Disrespect, People-pleasing, Spiritual stagnation, Boredom, Restlessness, Numbness

OUTPUT FORMAT:
Return ONLY a strictly formatted JSON object with the following keys:
{
  "titles": "A numbered list of 15 titles, each labeled with its formula (A-K). Also pick the 3 strongest titles for thumbnail testing and explain why. Suggest ONE anchor word from Tier 1 for a series.",
  "description": "A highly conversational, human-like YouTube description (3-4 paragraphs) that introduces the topic with empathy, explains the value, and hooks the viewer to keep watching. Sound natural, not AI-generated.",
  "hashtags": "A space-separated list of 10 highly relevant spiritual/mindfulness hashtags.",
  "tags": "A comma-separated list of 15 SEO-optimized tags for the YouTube video.",
  "thumbnail": "2-3 highly visual, engaging prompt ideas for creating a YouTube thumbnail (e.g. text overlay ideas, visual symbolism, contrast)."
}
  `;

  try {
    const completion = await openai.chat.completions.create({
      model: "gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are a professional YouTube strategist and copywriter. You must ONLY return a valid JSON object matching the exact structure requested, with no markdown code blocks wrapping the JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const aiResult = JSON.parse(completion.choices[0].message.content);
    res.json({
      originalQuestion: qa.q,
      originalAnswer: qa.a,
      metadata: aiResult
    });
  } catch (error) {
    console.error("OpenAI Error:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
