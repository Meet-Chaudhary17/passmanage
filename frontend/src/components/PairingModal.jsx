import React, { useState } from 'react';
import api from '../services/api';
import { X, Puzzle, Copy, Check, Terminal, ExternalLink, ShieldCheck } from 'lucide-react';

export default function PairingModal({ isOpen, onClose }) {
  const [pairingCode, setPairingCode] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pathCopied, setPathCopied] = useState(false);

  if (!isOpen) return null;

  const extensionPath = 'c:\\24BBS0147\\passmanage\\chrome-extension';

  const generateCode = async () => {
    setLoading(true);
    try {
      const res = await api.post('/extension/challenge');
      setPairingCode(res.data.pairingCode);
      setExpiresAt(new Date(res.data.expiresAt));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate pairing code.');
    } finally {
      setLoading(false);
    }
  };

  const copyCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyPath = () => {
    navigator.clipboard.writeText(extensionPath);
    setPathCopied(true);
    setTimeout(() => setPathCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Puzzle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm">Chrome Browser Extension Setup</h3>
              <p className="text-xs text-slate-400">Manifest V3 Localhost Development Installation</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-xs text-slate-300">
          {/* Step 1: Load unpacked instructions */}
          <div className="space-y-2">
            <div className="font-medium text-slate-200 flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-sky-400 flex items-center justify-center text-xs font-bold">1</span>
              <span>Load the Extension in Google Chrome</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 pl-6 text-slate-400">
              <li>Open Google Chrome and navigate to <code className="text-sky-300 bg-slate-800 px-1 py-0.5 rounded">chrome://extensions</code></li>
              <li>Toggle the <strong className="text-slate-200">"Developer mode"</strong> switch in the top-right corner.</li>
              <li>Click the <strong className="text-slate-200">"Load unpacked"</strong> button.</li>
              <li>Select the project extension directory below:</li>
            </ol>
            <div className="ml-6 flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-[11px] text-slate-300">
              <span className="truncate flex-1">{extensionPath}</span>
              <button
                onClick={copyPath}
                className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded flex items-center space-x-1"
              >
                {pathCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{pathCopied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Step 2: One-time pairing code */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="font-medium text-slate-200 flex items-center space-x-2">
              <span className="w-5 h-5 rounded-full bg-slate-800 text-sky-400 flex items-center justify-center text-xs font-bold">2</span>
              <span>Secure Account Pairing Code</span>
            </div>
            <p className="text-slate-400 ml-6">
              Generate a short-lived, single-use pairing challenge code. Enter this code into your extension popup to link it to your vault without sharing passwords.
            </p>

            <div className="ml-6">
              {!pairingCode ? (
                <button
                  onClick={generateCode}
                  disabled={loading}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-medium transition flex items-center space-x-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{loading ? 'Generating Code...' : 'Generate 5-Minute Pairing Code'}</span>
                </button>
              ) : (
                <div className="bg-slate-950 border border-sky-500/30 rounded-xl p-4 space-y-2">
                  <div className="text-[11px] text-slate-400">One-Time Pairing Challenge Code:</div>
                  <div className="flex items-center space-x-3">
                    <div className="font-mono text-2xl font-bold tracking-wider text-sky-400 bg-sky-950/40 px-3 py-1.5 rounded-lg border border-sky-800/50">
                      {pairingCode}
                    </div>
                    <button
                      onClick={copyCode}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center space-x-1.5 font-sans font-medium"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                    </button>
                  </div>
                  <div className="text-[10px] text-amber-400">
                    Expires in 5 minutes. Single-use only.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
