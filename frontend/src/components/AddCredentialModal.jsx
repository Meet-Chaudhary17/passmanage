import React, { useState } from 'react';
import api from '../services/api';
import { X, KeyRound, Globe, User, Lock, Sparkles, Shield, AlertCircle } from 'lucide-react';

export default function AddCredentialModal({ isOpen, onClose, onCreated }) {
  const [websiteName, setWebsiteName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [category, setCategory] = useState('SHAREABLE');
  const [matchSubdomains, setMatchSubdomains] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    let res = '';
    const array = new Uint8Array(20);
    crypto.getRandomValues(array);
    for (let i = 0; i < 20; i++) {
      res += chars[array[i] % chars.length];
    }
    setPassword(res);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post('/vault', {
        websiteName,
        websiteUrl,
        username,
        password,
        category,
        matchSubdomains,
        notes,
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save credential to vault.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-4">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-sm">Add New Credential</h3>
              <p className="text-xs text-slate-400">Encrypted with AES-256-GCM before storage</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-300 font-medium">Website Name</label>
              <input
                type="text"
                required
                placeholder="e.g. GitHub"
                value={websiteName}
                onChange={(e) => setWebsiteName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium">Website URL</label>
              <div className="relative">
                <Globe className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  placeholder="https://github.com/login"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono text-[11px]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-slate-300 font-medium">Username / Email</label>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                placeholder="account_user or user@example.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-medium">Password</label>
              <button
                type="button"
                onClick={generatePassword}
                className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center space-x-1"
              >
                <Sparkles className="w-3 h-3" />
                <span>Generate Strong</span>
              </button>
            </div>
            <div className="relative">
              <Lock className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                required
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono text-xs"
              />
            </div>
          </div>

          {/* Security Category Radio Selector */}
          <div className="space-y-1.5 pt-1">
            <label className="text-slate-300 font-medium flex items-center space-x-1.5">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>Security Category & Access Policy</span>
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label
                className={`p-2.5 rounded-xl border cursor-pointer transition text-[11px] ${
                  category === 'SHAREABLE'
                    ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value="SHAREABLE"
                  checked={category === 'SHAREABLE'}
                  onChange={() => setCategory('SHAREABLE')}
                  className="hidden"
                />
                <div className="font-semibold text-emerald-400">Shareable</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Session authorization only</div>
              </label>

              <label
                className={`p-2.5 rounded-xl border cursor-pointer transition text-[11px] ${
                  category === 'RESTRICTED'
                    ? 'bg-amber-950/40 border-amber-500 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value="RESTRICTED"
                  checked={category === 'RESTRICTED'}
                  onChange={() => setCategory('RESTRICTED')}
                  className="hidden"
                />
                <div className="font-semibold text-amber-400">Restricted</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Requires Face Biometrics</div>
              </label>

              <label
                className={`p-2.5 rounded-xl border cursor-pointer transition text-[11px] ${
                  category === 'HIGH_SENSITIVITY'
                    ? 'bg-rose-950/40 border-rose-500 text-rose-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value="HIGH_SENSITIVITY"
                  checked={category === 'HIGH_SENSITIVITY'}
                  onChange={() => setCategory('HIGH_SENSITIVITY')}
                  className="hidden"
                />
                <div className="font-semibold text-rose-400">High Sensitivity</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Face + Hardware Passkey</div>
              </label>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-1">
            <input
              type="checkbox"
              id="subdomains"
              checked={matchSubdomains}
              onChange={(e) => setMatchSubdomains(e.target.checked)}
              className="rounded bg-slate-950 border-slate-800 text-sky-500 focus:ring-0"
            />
            <label htmlFor="subdomains" className="text-slate-400 text-[11px] cursor-pointer">
              Allow autofill on subdomains (e.g. *.slack.com)
            </label>
          </div>

          <div className="pt-2 flex justify-end space-x-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Encrypting & Saving...' : 'Save Credential'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
