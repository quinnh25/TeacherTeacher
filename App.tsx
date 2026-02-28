
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type, FunctionDeclaration } from '@google/genai';
import { TranscriptionEntry, AnalysisFeedback, StudentQuestionEntry } from './types';
import { StudentPanel } from './components/StudentPanel';
import { decode, decodeAudioData, createPcmBlob } from './utils/audio-helpers';

// Constant settings
const SAMPLE_RATE = 24000;
const INPUT_SAMPLE_RATE = 16000;
const FRAME_RATE = 2.0; 
const AUDIO_BUFFER_SIZE = 4096; 
const RECONNECT_DELAY = 3000;
const SILENCE_THRESHOLD_MS = 600; 

const App: React.FC = () => {
  const [appState, setAppState] = useState<'landing' | 'live' | 'analyzing' | 'review'>('landing');
  const [isConnecting, setIsConnecting] = useState(false);
  const [showQuestions, setShowQuestions] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [sessionMode, setSessionMode] = useState<'live' | 'upload'>('live');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  
  const [questions, setQuestions] = useState<StudentQuestionEntry[]>([]);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [currentUtterance, setCurrentUtterance] = useState<string>('');
  const [feedbacks, setFeedbacks] = useState<AnalysisFeedback[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inputVolume, setInputVolume] = useState<number>(0);
  const [reviewVideoUrl, setReviewVideoUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outAudioContextRef = useRef<AudioContext | null>(null);
  const outAnalyserRef = useRef<AnalyserNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const frameIntervalRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const sessionRef = useRef<any>(null);
  const sessionStartTimeRef = useRef<number>(0);
  const isMutedRef = useRef(isMuted);
  const isManualStopRef = useRef(false);

  const utteranceAccumulatorRef = useRef<string>('');
  const silenceTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    if (appState === 'live' && videoRef.current && streamRef.current && sessionMode === 'live') {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => console.error("Video play failed", e));
    }
  }, [appState, sessionMode]);

  const formatRelativeTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const commitTranscription = useCallback((text: string, role: 'teacher' | 'ai' = 'teacher') => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 2) return;
    setTranscriptions(prev => {
      if (prev.length > 0 && prev[prev.length - 1].text === trimmed) return prev;
      return [...prev, { role, text: trimmed, timestamp: new Date() }];
    });
  }, []);

  const addFeedback = (feedback: AnalysisFeedback) => {
    setFeedbacks(prev => [feedback, ...prev]);
  };

  const calculateRMS = (analyser: AnalyserNode) => {
    const dataArray = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / dataArray.length);
  };

  const updateVolumeMeters = useCallback(() => {
    if (inputAnalyserRef.current) setInputVolume(Math.min(100, calculateRMS(inputAnalyserRef.current) * 600));
    animationFrameRef.current = requestAnimationFrame(updateVolumeMeters);
  }, []);

  const studentTool: FunctionDeclaration = {
    name: 'simulate_student_response',
    parameters: {
      type: Type.OBJECT,
      description: 'Trigger a student interaction based on cues in the lesson.',
      properties: {
        studentName: { type: Type.STRING },
        persona: { type: Type.STRING },
        question: { type: Type.STRING },
        confusionLevel: { type: Type.NUMBER },
        attentionSpan: { type: Type.NUMBER }
      },
      required: ['studentName', 'question', 'confusionLevel']
    }
  };

  const coachingTool: FunctionDeclaration = {
    name: 'provide_coaching_feedback',
    parameters: {
      type: Type.OBJECT,
      description: 'Provide pedagogical coaching feedback autonomously.',
      properties: {
        suggestion: { type: Type.STRING },
        category: { type: Type.STRING, enum: ['Pedagogical Scaffolding', 'Content Delivery', 'Vocal Presence', 'Visual Engagement', 'Check for Understanding', 'Instructional Clarity', 'Verbal Economy'] },
        urgency: { type: Type.STRING, enum: ['positive', 'neutral', 'improvement'] }
      },
      required: ['suggestion', 'category', 'urgency']
    }
  };

  const stopSession = () => {
    isManualStopRef.current = true;
    if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
    if (frameIntervalRef.current) window.clearInterval(frameIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }

    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        if (sessionMode === 'live') {
          setReviewVideoUrl(URL.createObjectURL(blob));
        }
      };
      mediaRecorderRef.current.stop();
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      if (audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(e => console.error("Error closing input audio context", e));
      }
      audioContextRef.current = null;
    }

    if (outAudioContextRef.current) {
      if (outAudioContextRef.current.state !== 'closed') {
        outAudioContextRef.current.close().catch(e => console.error("Error closing output audio context", e));
      }
      outAudioContextRef.current = null;
    }

    setAppState('review');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSessionMode('upload');
      startSession(file);
    }
  };

  const startSession = async (file?: File) => {
    try {
      setError(null);
      setIsConnecting(true);
      isManualStopRef.current = false;
      setAnalysisProgress(0);

      if (reviewVideoUrl && !file) {
        URL.revokeObjectURL(reviewVideoUrl);
        setReviewVideoUrl(null);
      }

      setQuestions([]);
      setTranscriptions([]);
      setCurrentUtterance('');
      setFeedbacks([]);
      recordedChunksRef.current = [];
      utteranceAccumulatorRef.current = '';

      let stream: MediaStream;
      let internalVideo: HTMLVideoElement | null = null;
      if (file) {
        setSessionMode('upload');
        const fileUrl = URL.createObjectURL(file);
        setReviewVideoUrl(fileUrl);
        setAppState('analyzing');
        setIsConnecting(false);

        internalVideo = document.createElement('video');
        internalVideo.src = fileUrl;
        internalVideo.muted = true;
        internalVideo.playsInline = true;
        
        await new Promise((resolve, reject) => {
          if (!internalVideo) return reject();
          internalVideo.onloadedmetadata = () => {
            internalVideo!.play().then(resolve).catch(reject);
          };
          internalVideo.onerror = () => reject(new Error("Failed to load video file"));
        });
        
        internalVideo.ontimeupdate = () => {
           if (internalVideo?.duration) {
             setAnalysisProgress((internalVideo.currentTime / internalVideo.duration) * 100);
           }
        };

        internalVideo.onended = () => {
          stopSession();
        };

        stream = (internalVideo as any).captureStream ? (internalVideo as any).captureStream() : (internalVideo as any).mozCaptureStream();
      } else {
        setSessionMode('live');
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: INPUT_SAMPLE_RATE }, 
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } 
        });
      }

      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.start();
      mediaRecorderRef.current = recorder;
      sessionStartTimeRef.current = Date.now();

      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
      outAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: SAMPLE_RATE });
      outAnalyserRef.current = outAudioContextRef.current.createAnalyser();
      inputAnalyserRef.current = audioContextRef.current.createAnalyser();
      updateVolumeMeters();

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: `You are the TeacherTeacher Pedagogical Support Partner.

MISSION: You are an autonomous observer and real-time mentor for educators. Your goal is to provide constant, unsolicited advice to help the teacher improve their delivery, engagement, and presence.

AUTONOMOUS COACHING (UNSOLICITED): 
- DO NOT wait for the instructor to pause or ask for a cue. 
- You MUST call 'provide_coaching_feedback' proactively the moment you observe any noteworthy event.
- Monitor the teacher's vocal energy, eye contact with the camera, hand gestures, filler words (um, uh, like), and instructional clarity.
- If you notice a drop in pacing or a "low energy" visual moment, suggest a Micro-Fix immediately.
- If you notice a strong instructional choice, provide a Micro-Win immediately.
- Be proactive. Be the mentor that doesn't wait to be asked.

STUDENT TRIGGER:
- Additionally, you MUST call 'simulate_student_response' whenever you detect a question prompt like "any questions?" or "is that clear?".`,
          tools: [{ functionDeclarations: [studentTool, coachingTool] }],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: async () => {
            if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();
            if (outAudioContextRef.current?.state === 'suspended') await outAudioContextRef.current.resume();
            if (!file) {
              setAppState('live');
              setIsConnecting(false);
            }
            const source = audioContextRef.current!.createMediaStreamSource(stream);
            source.connect(inputAnalyserRef.current!);
            const scriptProcessor = audioContextRef.current!.createScriptProcessor(AUDIO_BUFFER_SIZE, 1, 1);
            sessionPromise.then(session => {
              scriptProcessor.onaudioprocess = (e) => {
                if (streamRef.current?.active) session.sendRealtimeInput({ media: createPcmBlob(e.inputBuffer.getChannelData(0)) });
              };
              frameIntervalRef.current = window.setInterval(() => {
                const sourceElement = file ? internalVideo : videoRef.current;
                if (sourceElement && canvasRef.current && streamRef.current?.active) {
                  const ctx = canvasRef.current.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(sourceElement, 0, 0, 480, 360); 
                    canvasRef.current.toBlob(async (blob) => {
                      if (blob) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          const base64 = (reader.result as string).split(',')[1];
                          session.sendRealtimeInput({ media: { data: base64, mimeType: 'image/jpeg' } });
                        };
                        reader.readAsDataURL(blob);
                      }
                    }, 'image/jpeg', 0.6);
                  }
                }
              }, 1000 / FRAME_RATE);
            });
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioContextRef.current!.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
            if (msg.serverContent?.inputTranscription) {
              const text = msg.serverContent.inputTranscription.text;
              utteranceAccumulatorRef.current += text;
              setCurrentUtterance(utteranceAccumulatorRef.current);
              if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = window.setTimeout(() => {
                if (utteranceAccumulatorRef.current.trim()) {
                  commitTranscription(utteranceAccumulatorRef.current, 'teacher');
                  utteranceAccumulatorRef.current = '';
                  setCurrentUtterance('');
                }
              }, SILENCE_THRESHOLD_MS);
            }
            
            const hasStudentCall = msg.toolCall?.functionCalls.some(fc => fc.name === 'simulate_student_response');
            const audioPart = msg.serverContent?.modelTurn?.parts?.find(p => p.inlineData);
            const audioData = audioPart?.inlineData?.data;
            
            if (audioData && hasStudentCall && outAudioContextRef.current && !isMutedRef.current && appState !== 'analyzing') {
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outAudioContextRef.current.currentTime);
              const buffer = await decodeAudioData(decode(audioData!), outAudioContextRef.current, SAMPLE_RATE, 1);
              const source = outAudioContextRef.current.createBufferSource();
              source.buffer = buffer;
              source.connect(outAnalyserRef.current!);
              source.connect(outAudioContextRef.current.destination);
              source.onended = () => sourcesRef.current.delete(source);
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              // Fix: Added .current to sourcesRef to correctly access the Set instance
              sourcesRef.current.add(source);
            }

            if (msg.toolCall) {
              for (const fc of msg.toolCall.functionCalls) {
                if (fc.name === 'simulate_student_response') {
                  const args = fc.args as any;
                  setQuestions(prev => [{ id: Math.random().toString(36), studentName: args.studentName, question: args.question, timestamp: new Date() }, ...prev]);
                  sessionRef.current?.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { status: 'acknowledged' } } });
                } else if (fc.name === 'provide_coaching_feedback') {
                  const args = fc.args as any;
                  addFeedback({ 
                    category: args.category, 
                    message: args.suggestion, 
                    sentiment: args.urgency, 
                    timestamp: new Date(), 
                    relativeTime: formatRelativeTime(Date.now() - sessionStartTimeRef.current) 
                  });
                  sessionRef.current?.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { status: 'logged' } } });
                }
              }
            }
          },
          onerror: (e) => { if (!isManualStopRef.current) { setError('Reconnecting...'); setTimeout(() => startSession(file), RECONNECT_DELAY); } },
          onclose: () => setIsConnecting(false)
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) { 
      setError(err.message || 'Error occurred.'); 
      setAppState('landing');
      setIsConnecting(false);
    }
  };

  const renderLanding = () => (
    <div className="flex flex-col h-screen w-screen items-center justify-center bg-white p-8 overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="video/mp4,video/webm" className="hidden" />
      <div className="relative flex flex-col items-center gap-12 max-w-4xl w-full">
        <div className="absolute -inset-40 bg-[#10b981]/5 blur-[120px] rounded-full pointer-events-none"></div>
        <div className="flex flex-col items-center gap-6">
          <div className="relative h-32 w-32 flex items-center justify-center bg-white rounded-[2rem] border border-slate-100 shadow-2xl p-6">
             <i className="fa-solid fa-graduation-cap text-5xl text-[#10b981]"></i>
          </div>
          <div className="text-center">
            <div className="font-black text-6xl tracking-tighter leading-none mb-2 text-slate-900">TeacherTeacher</div>
            <p className="text-slate-400 text-sm font-bold uppercase tracking-[0.4em]">AI Trainer For Educators</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-2xl">
          <button onClick={() => startSession()} disabled={isConnecting} className="group flex flex-col items-center justify-center gap-4 p-8 rounded-[2.5rem] bg-slate-900 text-white transition-all hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-slate-900/20 disabled:opacity-50">
            <div className="w-16 h-16 rounded-2xl bg-[#10b981] flex items-center justify-center group-hover:rotate-12 transition-transform">
              <i className="fa-solid fa-video text-2xl"></i>
            </div>
            <div className="text-center">
              <div className="font-black uppercase tracking-widest text-xl mb-1">Live Coaching</div>
              <div className="text-xs text-slate-400 font-bold uppercase tracking-widest opacity-60">Real-time Unsolicited Advice</div>
            </div>
          </button>
          <button onClick={() => fileInputRef.current?.click()} disabled={isConnecting} className="group flex flex-col items-center justify-center gap-4 p-8 rounded-[2.5rem] bg-white border-2 border-slate-100 transition-all hover:scale-[1.02] active:scale-[0.98] hover:border-[#10b981]/30 shadow-xl disabled:opacity-50">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center group-hover:-rotate-12 transition-transform text-[#10b981]">
              <i className="fa-solid fa-file-arrow-up text-2xl"></i>
            </div>
            <div className="text-center text-slate-900">
              <div className="font-black uppercase tracking-widest text-xl mb-1">Analyze File</div>
              <div className="text-xs text-slate-400 font-bold uppercase tracking-widest opacity-60">Upload For Mentor Feedback</div>
            </div>
          </button>
        </div>
        {isConnecting && <p className="text-xs font-black text-[#10b981] uppercase animate-pulse tracking-widest">Waking Mentor AI...</p>}
        {error && <p className="text-xs font-bold text-rose-500 uppercase bg-rose-50 px-4 py-2 rounded-full border border-rose-100">{error}</p>}
      </div>
    </div>
  );

  const renderAnalyzing = () => (
    <div className="flex flex-col h-screen w-screen items-center justify-center bg-slate-50 p-8">
       <div className="max-w-lg w-full bg-white border border-slate-200 rounded-[3rem] p-12 shadow-2xl flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-500">
          <div className="relative w-24 h-24">
             <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
             <div className="absolute inset-0 rounded-full border-4 border-[#10b981] border-t-transparent animate-spin"></div>
             <div className="absolute inset-0 flex items-center justify-center text-[#10b981]">
                <i className="fa-solid fa-bolt-lightning text-3xl"></i>
             </div>
          </div>
          <div className="text-center">
             <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight mb-2">Mentor AI Observing</h2>
             <p className="text-slate-500 text-sm font-medium leading-relaxed">The AI is proactively identifying coaching moments in your recording. This process happens in real-time as the video plays internally.</p>
          </div>
          <div className="w-full space-y-4">
             <div className="flex justify-between items-end">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#10b981]">Mentor Progress</span>
                <span className="text-xl font-black text-slate-900">{Math.round(analysisProgress)}%</span>
             </div>
             <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#10b981] transition-all duration-300 shadow-[0_0_10px_rgba(16,185,129,0.3)]" style={{ width: `${analysisProgress}%` }}></div>
             </div>
          </div>
          <div className="flex flex-col items-center gap-4 w-full">
             <div className="px-6 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Proactive Insights: {feedbacks.length}</p>
             </div>
             <button onClick={stopSession} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-rose-500 transition-colors">Finish Analysis Now</button>
          </div>
       </div>
    </div>
  );

  const renderReview = () => (
    <div className="flex flex-col h-screen w-screen bg-[#f8fafc] p-4 md:p-8 animate-in fade-in duration-500 overflow-hidden">
      <div className="max-w-7xl mx-auto w-full flex flex-col h-full gap-6">
        <div className="flex justify-between items-center shrink-0">
           <div className="flex items-center gap-4">
              <div className="font-black text-3xl tracking-tighter leading-none text-slate-900 uppercase">TeacherTeacher</div>
              <div className="h-8 w-px bg-slate-200" />
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Mentor Summary</p>
           </div>
           <button onClick={() => { stopSession(); setAppState('landing'); }} className="bg-[#10b981] hover:bg-[#059669] text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest transition-all shadow-lg">New Session</button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
          <div className="lg:col-span-2 bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-2xl relative border border-slate-200">
            {reviewVideoUrl ? <video src={reviewVideoUrl} controls className="w-full h-full object-contain" /> : <div className="w-full h-full flex items-center justify-center text-slate-500"><i className="fa-solid fa-film text-4xl opacity-20"></i></div>}
          </div>
          <div className="lg:col-span-1 flex flex-col gap-4 overflow-hidden">
             <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm flex items-center justify-between">
                <div><h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Total Mentorship</h3><div className="text-4xl font-black text-slate-900">{feedbacks.length}</div></div>
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#10b981] flex items-center justify-center"><i className="fa-solid fa-bolt-lightning"></i></div>
             </div>
             <div className="flex-1 bg-white border border-slate-200 rounded-[2rem] p-6 overflow-y-auto shadow-sm">
                <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-6 border-b border-slate-50 pb-2">Mentorship Log</h3>
                <div className="space-y-6">
                  {feedbacks.length > 0 ? feedbacks.slice().reverse().map((f, i) => (
                    <div key={i} className="relative pl-6 before:absolute before:left-0 before:top-1 before:bottom-0 before:w-px before:bg-slate-100">
                      <div className="absolute left-[-2px] top-1 w-1.5 h-1.5 rounded-full bg-slate-200" />
                      <div className="flex justify-between items-baseline mb-1"><p className={`text-[9px] font-black uppercase tracking-widest ${f.sentiment === 'positive' ? 'text-emerald-500' : 'text-slate-500'}`}>{f.category}</p><span className="text-[8px] font-bold text-slate-300">{f.relativeTime}</span></div>
                      <p className="text-sm text-slate-600 font-medium italic leading-relaxed">"{f.message}"</p>
                    </div>
                  )) : <p className="text-xs text-slate-300 italic text-center py-10">No proactive advice was needed.</p>}
                </div>
             </div>
          </div>
          <div className="lg:col-span-1 flex flex-col gap-4 overflow-hidden">
             <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm flex items-center justify-between">
                <div><h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">Student Cues</h3><div className="text-4xl font-black text-[#10b981]">{questions.length}</div></div>
                <div className="w-12 h-12 rounded-2xl bg-[#10b981]/10 text-[#10b981] flex items-center justify-center"><i className="fa-solid fa-users"></i></div>
             </div>
             <div className="flex-1 bg-white border border-slate-200 rounded-[2rem] p-6 overflow-y-auto shadow-sm">
                <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-6 border-b border-slate-50 pb-2">Interactive Moments</h3>
                <div className="space-y-6">
                  {questions.length > 0 ? questions.slice().reverse().map((q) => (
                    <div key={q.id} className="group">
                      <div className="flex items-center gap-2 mb-2"><div className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></div><p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{q.studentName}</p></div>
                      <p className="text-sm text-slate-600 font-medium italic leading-relaxed pl-3.5 border-l-2 border-slate-50 group-hover:border-[#10b981]/30 transition-colors">"{q.question}"</p>
                    </div>
                  )) : <div className="flex flex-col items-center justify-center h-full opacity-30 text-center"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">No student cues recorded</p></div>}
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLive = () => (
    <div className="flex flex-col h-screen p-4 bg-[#f8fafc] gap-4 animate-in fade-in duration-500 overflow-hidden">
      <header className="flex items-center justify-between bg-white p-3 pr-4 rounded-2xl border border-slate-200 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-10 px-4 flex items-center gap-2 bg-slate-50 rounded-xl border border-slate-200 shadow-inner">
            <div className="font-black text-lg tracking-tighter leading-none text-slate-900 uppercase">TeacherTeacher</div>
          </div>
          <div className="px-3 py-1 rounded-full bg-slate-100 border border-slate-200 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"></div>
            <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Autonomous Mentorship</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowQuestions(!showQuestions)} className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border bg-slate-100 text-slate-600 border-slate-200 shadow-inner">
            {showQuestions ? 'Hide Students' : 'Show Students'}
          </button>
          <button onClick={stopSession} className="px-6 py-2.5 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-lg transition-all active:scale-95">End Session</button>
        </div>
      </header>
      <main className="flex-1 grid grid-cols-12 gap-4 min-h-0">
        <div className={`${showQuestions ? 'col-span-12 lg:col-span-9' : 'col-span-12'} flex flex-col gap-4 min-h-0`}>
          <div className="flex-1 bg-white rounded-[2.5rem] overflow-hidden border border-slate-200 relative shadow-xl flex">
            <div className="flex-1 h-full relative bg-slate-50">
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
              <div className="absolute bottom-8 left-8 flex items-center gap-4 w-72">
                <div className="w-10 h-10 rounded-xl bg-black/40 backdrop-blur-md flex items-center justify-center text-white text-xs"><i className="fa-solid fa-microphone"></i></div>
                <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden border border-white/10"><div className="h-full bg-[#10b981] transition-all duration-100" style={{ width: `${inputVolume}%` }}></div></div>
              </div>
              <div className="absolute top-8 left-8">
                <div className="bg-black/40 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
                  <i className="fa-solid fa-eye text-[#10b981] text-xs"></i>
                  <span className="text-[10px] font-black text-white uppercase tracking-widest">Mentor Watching</span>
                </div>
              </div>
            </div>
            <div className="w-80 h-full bg-slate-50 border-l border-slate-200 flex flex-col overflow-hidden">
              <div className="p-6 border-b border-slate-200 shrink-0 flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">Mentor AI Advice</span>
                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                  <i className="fa-solid fa-bolt-lightning text-emerald-600 text-[10px]"></i>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {feedbacks.length > 0 ? feedbacks.slice(0, 30).map((f, i) => (
                    <div key={i} className={`p-5 rounded-[1.5rem] border bg-white shadow-sm animate-in slide-in-from-right-4 duration-300 ${f.sentiment === 'positive' ? 'border-emerald-100' : 'border-slate-100'}`}>
                      <p className="text-[8px] font-black uppercase tracking-widest opacity-40 mb-1">{f.category}</p>
                      <p className="text-sm font-semibold italic text-slate-800 leading-snug">"{f.message}"</p>
                    </div>
                  )) : <div className="h-full flex flex-col items-center justify-center p-8 opacity-20 text-center"><i className="fa-solid fa-robot text-3xl mb-3"></i><p className="text-[11px] font-black uppercase tracking-widest text-slate-900 leading-tight">Proactively observing for coaching moments...</p></div>}
              </div>
            </div>
          </div>
          <div className="h-44 shrink-0 bg-white border border-slate-200 rounded-[2rem] p-5 overflow-y-auto shadow-sm">
             <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
               Live Educator Transcript
             </div>
             <div className="space-y-4">
                {currentUtterance && <p className="text-sm font-medium text-slate-400 italic">"{currentUtterance}..."</p>}
                {transcriptions.slice().reverse().map((t, i) => <p key={i} className="text-sm font-medium text-slate-800">{t.text}</p>)}
                {transcriptions.length === 0 && !currentUtterance && <p className="text-xs text-slate-300 italic">AI is waiting for you to speak to begin transcription.</p>}
             </div>
          </div>
        </div>
        {showQuestions && <div className="col-span-12 lg:col-span-3 min-h-0 bg-white border border-slate-200 rounded-[2.5rem] p-4 flex flex-col shadow-lg"><StudentPanel questions={questions} /></div>}
      </main>
    </div>
  );

  return (
    <>
      <canvas ref={canvasRef} width="480" height="360" className="hidden" />
      {appState === 'landing' && renderLanding()}
      {appState === 'analyzing' && renderAnalyzing()}
      {appState === 'review' && renderReview()}
      {appState === 'live' && renderLive()}
    </>
  );
};

export default App;
