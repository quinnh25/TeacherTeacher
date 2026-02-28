
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Database Setup
const db = new sqlite3.Database('./teacher_training.db', (err) => {
  if (err) console.error('Database connection error:', err.message);
  else console.log('Connected to the SQLite database.');
});

// Create tables
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT DEFAULT (datetime('now','localtime')),
      engagement_score INTEGER,
      feedbacks TEXT,
      transcriptions TEXT,
      video_path TEXT
    )
  `);
});

// Multer Storage Configuration for Videos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const sessionId = req.params.id;
    cb(null, `session_${sessionId}_${Date.now()}.webm`);
  }
});

const upload = multer({ storage });

/**
 * API ENDPOINTS
 */

// 1. Create a new session (Metadata only)
app.post('/api/sessions', (req, res) => {
  const { engagementScore, feedbacks, transcriptions } = req.body;
  
  const query = `INSERT INTO sessions (engagement_score, feedbacks, transcriptions) VALUES (?, ?, ?)`;
  const params = [
    engagementScore, 
    JSON.stringify(feedbacks), 
    JSON.stringify(transcriptions)
  ];

  db.run(query, params, function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID });
  });
});

// 2. Upload video for an existing session
app.post('/api/sessions/:id/video', upload.single('video'), (req, res) => {
  const sessionId = req.params.id;
  const videoPath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!videoPath) {
    return res.status(400).json({ error: 'No video file provided.' });
  }

  const query = `UPDATE sessions SET video_path = ? WHERE id = ?`;
  db.run(query, [videoPath, sessionId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ success: true, videoPath });
  });
});

// 3. Get all sessions
app.get('/api/sessions', (req, res) => {
  db.all(`SELECT id, date, engagement_score, video_path FROM sessions ORDER BY date DESC`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

// 4. Get specific session details
app.get('/api/sessions/:id', (req, res) => {
  db.get(`SELECT * FROM sessions WHERE id = ?`, [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Parse JSON strings back to objects
    res.json({
      ...row,
      feedbacks: JSON.parse(row.feedbacks || '[]'),
      transcriptions: JSON.parse(row.transcriptions || '[]')
    });
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running at http://localhost:${PORT}`);
});
