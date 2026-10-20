import React from 'react';
import { Puzzle } from 'lucide-react';

export default function FloatingExtensionButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 flex items-center space-x-2.5 px-4 py-2.5 rounded-full bg-slate-900 border border-slate-700 shadow-xl shadow-black/50 text-slate-200 hover:text-white hover:border-sky-500/50 hover:bg-slate-850 transition group"
    >
      <div className="w-6 h-6 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center">
        <Puzzle className="w-3.5 h-3.5" />
      </div>
      <span className="text-xs font-semibold">Add Extension</span>
      <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
    </button>
  );
}
