
import React, { useEffect, useRef } from 'react';
import { TranscriptionEntry, AnalysisFeedback } from '../types';

interface AnalysisLogProps {
  transcriptions: TranscriptionEntry[];
  feedbacks: AnalysisFeedback[];
}

export const AnalysisLog: React.FC<AnalysisLogProps> = ({ transcriptions, feedbacks }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcriptions]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl flex flex-col h-full overflow-hidden shadow-sm">
      <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Voice Transcription Archive</span>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 font-sans text-sm leading-relaxed">
        {transcriptions.length > 0 ? transcriptions.map((t, i) => (
          <div key={i} className="text-slate-600 border-l-2 border-[#10b981]/10 pl-4 py-1 hover:bg-slate-50 transition-colors">
            <span className="text-[9px] text-[#10b981] font-black block mb-1 uppercase">
              {t.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <p className="font-medium text-slate-700">{t.text}</p>
          </div>
        )) : (
          <div className="h-full flex items-center justify-center opacity-30 italic text-slate-400">
            No transcription data available
          </div>
        )}
      </div>
    </div>
  );
};
