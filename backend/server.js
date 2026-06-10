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

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
