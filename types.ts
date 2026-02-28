
export interface StudentInteraction {
  studentName: string;
  persona: string;
  confusionLevel: number;
  attentionSpan: number;
  lastQuestion?: string;
}

export interface TranscriptionEntry {
  role: 'teacher' | 'ai';
  text: string;
  timestamp: Date;
}

export interface AnalysisFeedback {
  category: string;
  message: string;
  sentiment: 'positive' | 'neutral' | 'improvement';
  timestamp: Date;
  relativeTime: string;
}

export interface StudentQuestionEntry {
  id: string;
  studentName: string;
  question: string;
  timestamp: Date;
}

// Added VitalMetrics for the VitalsPanel component to resolve the module resolution error
export interface VitalMetrics {
  heartRate: number;
  engagementScore: number;
  stressLevel: number;
  postureScore: number;
  speechRate: number;
}
