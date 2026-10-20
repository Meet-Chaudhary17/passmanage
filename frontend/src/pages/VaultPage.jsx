import React, { useState, useEffect } from 'react';
import api from '../services/api';
import AddCredentialModal from '../components/AddCredentialModal';
import VerificationModal from '../components/VerificationModal';
import { KeyRound, Plus, Search, Shield, Globe, Trash2, ExternalLink, Unlock, ShieldAlert, ShieldCheck } from 'lucide-react';

export default function VaultPage() {
  const [credentials, setCredentials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // Modals
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [selectedCred, setSelectedCred] = useState(null);
  const [isVerifyOpen, setIsVerifyOpen] = useState(false);

  const fetchCredentials = async () => {
    setLoading(true);
    try {
      const res = await api.get('/vault');
      setCredentials(res.data.credentials || []);
    } catch (err) {
      console.error('Failed to load vault credentials:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to permanently delete the credential for "${name}"?`)) return;
    try {
      await api.delete(`/vault/${id}`);
      fetchCredentials();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete credential.');
    }
  };

  const handleAccessClick = (cred) => {
    setSelectedCred(cred);
    setIsVerifyOpen(true);
  };

  // Filter credentials
  const filtered = credentials.filter((c) => {
    const matchesSearch =
      c.website_name.toLowerCase().includes(search.toLowerCase()) ||
      c.target_hostname.toLowerCase().includes(search.toLowerCase()) ||
      c.website_url.toLowerCase().includes(search.toLowerCase());
    const matchesCat = categoryFilter === 'ALL' || c.category === categoryFilter;
    return matchesSearch && matchesCat;
  });

  const getCategoryBadge = (cat) => {
    switch (cat) {
      case 'SHAREABLE':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
            <ShieldCheck className="w-3 h-3" />
            <span>Shareable</span>
          </span>
        );
      case 'RESTRICTED':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/60 text-amber-400 border border-amber-500/30 flex items-center space-x-1">
            <Shield className="w-3 h-3" />
            <span>Restricted</span>
          </span>
        );
      case 'HIGH_SENSITIVITY':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/60 text-rose-400 border border-rose-500/30 flex items-center space-x-1">
            <ShieldAlert className="w-3 h-3" />
            <span>High Sensitivity</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100">Password Vault</h1>
          <p className="text-xs text-slate-400 mt-1">
            Encrypted with AES-256-GCM. Passwords remain ciphertext until progressive policy authorization.
          </p>
        </div>

        <button
          onClick={() => setIsAddOpen(true)}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-sky-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>Add Credential</span>
        </button>
      </div>

      {/* Filter / Search Bar (only show if vault has items or searching) */}
      {(credentials.length > 0 || search) && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-[#0f172a] border border-slate-800 p-3 rounded-2xl">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-2.5" />
            <input
              type="text"
              placeholder="Search by website or hostname..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="flex items-center space-x-1 w-full sm:w-auto overflow-x-auto">
            {['ALL', 'SHAREABLE', 'RESTRICTED', 'HIGH_SENSITIVITY'].map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition whitespace-nowrap ${
                  categoryFilter === cat
                    ? 'bg-slate-800 text-sky-400 border border-slate-700'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                }`}
              >
                {cat === 'ALL' ? 'All Credentials' : cat.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Vault Body */}
      {loading ? (
        <div className="py-20 text-center space-y-3 text-slate-400 text-xs">
          <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p>Decrypting vault index...</p>
        </div>
      ) : credentials.length === 0 ? (
        /* STRICT ZERO DUMMY DATA EMPTY STATE */
        <div className="py-24 text-center rounded-3xl border border-dashed border-slate-800 bg-[#0c1220]/50 p-8 space-y-4 max-w-lg mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-400 mx-auto flex items-center justify-center">
            <KeyRound className="w-8 h-8 text-slate-500" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-200">Your vault is empty</h3>
            <p className="text-xs text-slate-400">
              Add your first credential to get started. No sample passwords or demo accounts are ever pre-populated.
            </p>
          </div>
          <div>
            <button
              onClick={() => setIsAddOpen(true)}
              className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl transition inline-flex items-center space-x-2 shadow-lg shadow-sky-600/20"
            >
              <Plus className="w-4 h-4" />
              <span>Add Credential</span>
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-xs text-slate-400">
          No credentials match your search criteria.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((cred) => (
            <div
              key={cred.id}
              className="bg-[#0f172a] border border-slate-800 hover:border-slate-700 rounded-2xl p-5 space-y-4 shadow-lg transition flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-0.5">
                    <h3 className="font-semibold text-slate-100 text-sm">{cred.website_name}</h3>
                    <div className="flex items-center space-x-1.5 text-[11px] text-slate-400 font-mono">
                      <Globe className="w-3 h-3 text-slate-500" />
                      <span className="truncate max-w-[180px]">{cred.target_hostname}</span>
                    </div>
                  </div>
                  {getCategoryBadge(cred.category)}
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-850 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-500 font-mono">Password:</span>
                  <span className="font-mono text-slate-500 select-none tracking-widest">••••••••••••</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                <button
                  onClick={() => handleAccessClick(cred)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-sky-600 hover:text-white text-slate-300 font-medium transition flex items-center space-x-1.5 text-[11px]"
                >
                  <Unlock className="w-3.5 h-3.5 text-sky-400 group-hover:text-white" />
                  <span>Access / Reveal</span>
                </button>

                <button
                  onClick={() => handleDelete(cred.id, cred.website_name)}
                  title="Delete Credential"
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <AddCredentialModal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onCreated={fetchCredentials}
      />

      <VerificationModal
        credential={selectedCred}
        isOpen={isVerifyOpen}
        onClose={() => setIsVerifyOpen(false)}
      />
    </div>
  );
}
