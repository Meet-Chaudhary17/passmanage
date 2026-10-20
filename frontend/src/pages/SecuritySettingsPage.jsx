import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Shield, Camera, Key, Puzzle, Trash2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export default function SecuritySettingsPage({ onOpenExtensionModal }) {
  const { user } = useAuth();
  const [pairings, setPairings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [faceStatus, setFaceStatus] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [pairRes, healthRes] = await Promise.all([
        api.get('/extension/pairings'),
        api.get('/health'),
      ]);
      setPairings(pairRes.data.pairings || []);
      setFaceStatus(healthRes.data.faceMicroservice);
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const revokePairing = async (id, name) => {
    if (!window.confirm(`Revoke companion extension access for "${name}"?`)) return;
    try {
      await api.delete(`/extension/pairings/${id}`);
      fetchSettings();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to revoke pairing.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">Security & Factor Management</h1>
        <p className="text-xs text-slate-400 mt-1">
          Manage your enrolled biometric template, registered hardware passkeys, and linked companion extensions.
        </p>
      </div>

      <div className="space-y-6">
        {/* Biometrics Card */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                <Camera className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-sm">Facial Biometrics (ArcFace)</h3>
                <p className="text-xs text-slate-400">
                  512-dimensional vector embedding encrypted at rest with AES-256-GCM.
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Enrolled & Active</span>
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 p-3.5 bg-slate-950/60 border border-slate-850 rounded-xl text-xs">
            <div>
              <div className="text-slate-500 text-[10px] font-medium uppercase">Model</div>
              <div className="text-slate-200 font-mono mt-0.5">{faceStatus?.modelName || 'ArcFace'}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px] font-medium uppercase">Distance Metric</div>
              <div className="text-slate-200 font-mono mt-0.5">{faceStatus?.distanceMetric || 'cosine'}</div>
            </div>
            <div>
              <div className="text-slate-500 text-[10px] font-medium uppercase">Prototype Threshold</div>
              <div className="text-slate-200 font-mono mt-0.5">≤ {faceStatus?.prototypeThreshold || '0.68'}</div>
            </div>
          </div>
        </div>

        {/* Passkey Card */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-center">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-sm">FIDO2 / WebAuthn Hardware Passkeys</h3>
                <p className="text-xs text-slate-400">
                  Cryptographic public key assertions with replay prevention signature counters.
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 flex items-center space-x-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Platform Active</span>
            </span>
          </div>
        </div>

        {/* Extension Pairings */}
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-6 space-y-4 shadow-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center">
                <Puzzle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-100 text-sm">Paired Browser Extensions</h3>
                <p className="text-xs text-slate-400">
                  Manage active Manifest V3 companion extensions linked to this vault.
                </p>
              </div>
            </div>

            <button
              onClick={onOpenExtensionModal}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold rounded-xl border border-slate-700 transition"
            >
              Pair New Extension
            </button>
          </div>

          {pairings.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/40 border border-dashed border-slate-800 rounded-xl">
              No companion extensions paired yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60">
              {pairings.map((p) => (
                <div key={p.id} className="p-3.5 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <div className="font-medium text-slate-200 flex items-center space-x-2">
                      <span>{p.device_name}</span>
                      <span className={`w-2 h-2 rounded-full ${p.is_active ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Paired on {new Date(p.created_at).toLocaleDateString()} • Last accessed {new Date(p.last_accessed_at).toLocaleTimeString()}
                    </div>
                  </div>

                  {p.is_active && (
                    <button
                      onClick={() => revokePairing(p.id, p.device_name)}
                      className="text-xs text-rose-400 hover:text-rose-300 font-medium px-2.5 py-1 rounded bg-rose-950/30 border border-rose-900/50 transition"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
