
import React from 'react';
import { LineChart, Line, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { VitalMetrics } from '../types';

interface VitalsPanelProps {
  vitals: VitalMetrics;
  history: VitalMetrics[];
}

const VitalCard: React.FC<{ 
  label: string; 
  value: number; 
  unit: string; 
  icon: string; 
  color: string; 
  accent: string;
}> = ({ label, value, unit, icon, color, accent }) => (
  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center gap-4 transition-all hover:bg-white hover:border-slate-200 hover:shadow-sm">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color} bg-opacity-10 border ${accent.replace('500', '100')}`}>
      <i className={`fa-solid ${icon} ${color.replace('bg-', 'text-')}`}></i>
    </div>
    <div>
      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">{label}</p>
      <p className="text-2xl font-bold tracking-tight text-slate-900">
        {value.toFixed(0)}<span className="text-xs font-normal text-slate-400 ml-1 uppercase">{unit}</span>
      </p>
    </div>
  </div>
);

export const VitalsPanel: React.FC<VitalsPanelProps> = ({ vitals, history }) => {
  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pr-1">
      <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-[#10b981]">
            <i className="fa-solid fa-chart-line"></i>
            Educator Vitals
          </h2>
          <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-bold uppercase">Ready</span>
      </div>
      
      <div className="grid grid-cols-1 gap-2.5">
        <VitalCard label="Heart Rate" value={vitals.heartRate} unit="BPM" icon="fa-heart-pulse" color="bg-rose-500" accent="border-rose-500/20" />
        <VitalCard label="Engagement" value={vitals.engagementScore} unit="%" icon="fa-graduation-cap" color="bg-[#10b981]" accent="border-[#10b981]/20" />
        <VitalCard label="Stress" value={vitals.stressLevel} unit="/10" icon="fa-brain" color="bg-emerald-600" accent="border-emerald-500/20" />
        <VitalCard label="Posture" value={vitals.postureScore} unit="%" icon="fa-user-check" color="bg-blue-500" accent="border-blue-500/20" />
        <VitalCard label="Speech Speed" value={vitals.speechRate} unit="WPM" icon="fa-bolt" color="bg-slate-500" accent="border-slate-500/20" />
      </div>

      <div className="mt-4 bg-slate-50 border border-slate-100 rounded-xl p-4 flex-1 min-h-[180px]">
        <div className="flex justify-between items-center mb-4">
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Performance Flow</p>
        </div>
        <div className="h-full w-full pb-6">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history}>
              <Line 
                type="monotone" 
                dataKey="engagementScore" 
                stroke="#10b981" 
                strokeWidth={3} 
                dot={false}
                isAnimationActive={false}
              />
              <YAxis domain={[0, 100]} hide />
              <Tooltip 
                contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                labelStyle={{ display: 'none' }}
                itemStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#1e293b' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
