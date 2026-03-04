# TeacherTeacher

### 🎓 AI-Powered Real-Time Coaching for Educators

An autonomous mentorship platform that watches, listens, and proactively coaches teachers as they teach — powered by **Gemini Live API** with multimodal audio + vision.

[![Built at SpartaHack](https://img.shields.io/badge/Built%20at-SpartaHack%202026-10b981?style=for-the-badge)](https://spartahack.com)
[![Gemini Live API](https://img.shields.io/badge/Gemini-Live%20API-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-Build-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)

</div>

---

## 💡 What is TeacherTeacher?

TeacherTeacher is an **AI mentor that never waits to be asked**. It observes educators through their webcam and microphone in real-time, analyzing vocal delivery, body language, pacing, and instructional clarity — then delivers **unsolicited, proactive coaching feedback** the moment it spots a teachable moment.

It also **simulates student interactions**, generating realistic student questions and confusion signals so teachers can practice handling a live classroom.

### Key Features

| Feature | Description |
|---|---|
| 🎥 **Live Coaching** | Real-time webcam + audio analysis with instant AI feedback |
| 📁 **Video Upload Analysis** | Upload a recorded lecture for asynchronous mentor review |
| 🗣️ **Live Transcription** | Real-time speech-to-text of the educator's delivery |
| 🤖 **Autonomous Mentorship** | AI proactively identifies coaching moments without being prompted |
| 👩‍🎓 **Simulated Students** | AI-generated student questions & confusion signals for practice |
| 📊 **Session Review** | Post-session summary with timestamped mentorship log and video playback |

---

## 🧠 How It Works

TeacherTeacher connects to the **Gemini 2.5 Flash Native Audio** model via the Live API, streaming both audio and video frames in real-time:

```
┌──────────────┐     Audio PCM + Video Frames      ┌──────────────────┐
│              │ ────────────────────────────────▶│                  │
│   Educator   │                                   │   Gemini Live    │
│   Webcam +   │◀───────────────────────────────- │   API (2.5       │
│   Microphone │   Coaching Feedback + Student     │   Flash)         │
│              │   Simulations via Tool Calls      │                  │
└──────────────┘                                   └──────────────────┘
```

The AI uses two **function-calling tools**:

- **`provide_coaching_feedback`** — Fires autonomously when the AI observes notable vocal, visual, or pedagogical events. Categories include *Pedagogical Scaffolding*, *Content Delivery*, *Vocal Presence*, *Visual Engagement*, and more.
- **`simulate_student_response`** — Triggers when the teacher prompts for questions (e.g., *"Any questions?"*, *"Is that clear?"*), generating realistic student personas with varying confusion levels.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- A [Gemini API Key](https://ai.google.dev/gemini-api/docs/api-key)

### Installation

```bash
# Clone the repository
git clone https://github.com/justinr25/TeacherTeacher.git
cd TeacherTeacher

# Install dependencies
npm install
```

### Configuration

Create a `.env.local` file in the project root (or edit the existing one):

```env
GEMINI_API_KEY=your_api_key_here
```

### Run the Frontend

```bash
npm run dev
```

The app will be available at **http://localhost:3000**.

### Run the Backend (Optional — Session Storage)

In a separate terminal:

```bash
node server.js
```

The Express API server runs at **http://localhost:3001** and provides SQLite-backed session persistence.

---

## 🏗️ Project Structure

```
TeacherTeacher/
├── index.html              # Entry point with importmap & Tailwind
├── index.tsx               # React DOM render entry
├── App.tsx                 # Core application — Gemini Live integration, UI states
├── types.ts                # TypeScript interfaces
├── vite.config.ts          # Vite dev server & env config
├── server.js               # Express + SQLite backend for session storage
├── components/
│   ├── StudentPanel.tsx    # Simulated student questions panel
│   ├── VitalsPanel.tsx     # Engagement vitals display
│   └── AnalysisLog.tsx     # Coaching feedback log component
├── utils/
│   └── audio-helpers.ts    # PCM audio encoding/decoding utilities
├── .env.local              # Gemini API key (not committed)
└── metadata.json           # App metadata & permissions
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **AI / LLM** | Google Gemini 2.5 Flash (Native Audio) via Live API |
| **Frontend** | React 19, TypeScript, Tailwind CSS |
| **Build Tool** | Vite |
| **Backend** | Express.js, SQLite3 |
| **Media** | Web Audio API, MediaRecorder, Canvas frame capture |
| **Icons** | Font Awesome 6 |

---

## 📸 App States

The application flows through four states:

1. **Landing** — Choose between *Live Coaching* or *Analyze File*
2. **Live** — Real-time webcam feed with mentor AI advice panel, live transcript, and student simulation
3. **Analyzing** — Progress view while AI processes an uploaded video
4. **Review** — Post-session dashboard with video playback, mentor log, and student cue summary

---

## 🤝 Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

---

## 📄 License

This project was built at **SpartaHack 2026** 🏛️
