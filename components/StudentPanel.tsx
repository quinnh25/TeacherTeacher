
import React from 'react';
import { StudentQuestionEntry } from '../types';

interface StudentPanelProps {
  questions: StudentQuestionEntry[];
}

export const StudentPanel: React.FC<StudentPanelProps> = ({ questions }) => {
  return (
    <div className="flex flex-col gap-4 h-full overflow-hidden pr-1">
      <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-slate-900">
            <i className="fa-solid fa-comments text-[#10b981]"></i>
            Question Stream
          </h2>
          <span className="text-[10px] bg-[#10b981]/10 text-[#10b981] px-2 py-0.5 rounded border border-[#10b981]/20 font-bold uppercase tracking-wider">Live</span>
      </div>
      
      <div className="flex-1 bg-white border border-slate-200 rounded-3xl flex flex-col min-h-0 shadow-sm overflow-hidden">
         <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Recent Inquiries</span>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-200/50 px-2 py-0.5 rounded-full">{questions.length}</span>
         </div>
         <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {questions.length > 0 ? questions.map((q) => (
              <div key={q.id} className="group bg-white border border-slate-100 p-4 rounded-2xl shadow-sm hover:border-[#10b981]/30 transition-all duration-300 animate-in slide-in-from-bottom-4">
                 <div className="flex items-center gap-2 mb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#10b981]"></div>
                    <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">{q.studentName}</p>
                    <span className="text-[9px] font-medium text-slate-300 ml-auto">
                      {q.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                 </div>
                 <p className="text-sm text-slate-600 font-medium leading-relaxed italic">"{q.question}"</p>
              </div>
            )) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                 <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                    <i className="fa-solid fa-microphone-lines text-2xl text-slate-300"></i>
                 </div>
                 <p className="text-[11px] font-black uppercase tracking-widest text-slate-900 mb-2">Awaiting Instructor Cue</p>
                 <p className="text-[10px] text-slate-400 font-medium max-w-[180px] leading-normal">
                   Ask "Any questions?" or "Does that make sense?" to trigger student interactions.
                 </p>
              </div>
            )}
         </div>
      </div>
      
      <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse"></div>
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Instructor Prompts Enabled</p>
        </div>
      </div>
    </div>
  );
};
