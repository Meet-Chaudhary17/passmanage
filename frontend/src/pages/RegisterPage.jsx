import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, Mail, AlertCircle, ArrowRight, Check, X } from 'lucide-react';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  // Password requirements evaluation
  const checks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    matches: password.length > 0 && password === confirmPassword,
  };

  const isFormValid = Object.values(checks).every(Boolean) && email.includes('@');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;
    setError('');
    setLoading(true);
    try {
      await register(email, password, confirmPassword);
      // New account starts with zero setup, navigate to onboarding
      navigate('/onboarding');
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please verify input requirements.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#090d16]">
      <div className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        {/* Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 items-center justify-center text-sky-400 mb-2">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Create Master Vault</h1>
          <p className="text-xs text-slate-400">Initialize a new, private, zero-knowledge security vault</p>
        </div>

        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Master Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">Confirm Master Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition"
              />
            </div>
          </div>

          {/* Password Strength Checklist */}
          <div className="p-3 bg-slate-950/60 border border-slate-850 rounded-xl space-y-1.5 text-[11px]">
            <div className="text-slate-400 font-medium">Password Requirements:</div>
            <div className="grid grid-cols-2 gap-1.5 text-slate-400">
              <div className={`flex items-center space-x-1.5 ${checks.length ? 'text-emerald-400' : ''}`}>
                {checks.length ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 text-slate-600" />}
                <span>8+ Characters</span>
              </div>
              <div className={`flex items-center space-x-1.5 ${checks.uppercase ? 'text-emerald-400' : ''}`}>
                {checks.uppercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 text-slate-600" />}
                <span>Uppercase Letter</span>
              </div>
              <div className={`flex items-center space-x-1.5 ${checks.lowercase ? 'text-emerald-400' : ''}`}>
                {checks.lowercase ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 text-slate-600" />}
                <span>Lowercase Letter</span>
              </div>
              <div className={`flex items-center space-x-1.5 ${checks.number ? 'text-emerald-400' : ''}`}>
                {checks.number ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 text-slate-600" />}
                <span>Number (0-9)</span>
              </div>
              <div className={`flex items-center space-x-1.5 ${checks.special ? 'text-emerald-400' : ''}`}>
                {checks.special ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 text-slate-600" />}
                <span>Special Symbol</span>
              </div>
              <div className={`flex items-center space-x-1.5 ${checks.matches ? 'text-emerald-400' : ''}`}>
                {checks.matches ? <Check className="w-3 h-3" /> : <X className="w-3 h-3 text-slate-600" />}
                <span>Passwords Match</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={!isFormValid || loading}
            className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-sky-600/20 disabled:opacity-50 disabled:pointer-events-none"
          >
            <span>{loading ? 'Creating Vault...' : 'Create Master Account'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center pt-2 border-t border-slate-800">
          <p className="text-xs text-slate-400">
            Already have a vault?{' '}
            <Link to="/login" className="text-sky-400 hover:text-sky-300 font-medium transition">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
