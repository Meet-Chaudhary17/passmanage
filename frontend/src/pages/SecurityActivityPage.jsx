import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { History, ShieldCheck, ShieldAlert, KeyRound, LogIn, Lock, Puzzle, Globe } from 'lucide-react';

export default function SecurityActivityPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await api.get('/audit/events?limit=100');
      setEvents(res.data.events || []);
    } catch (err) {
      console.error('Failed to load audit events:', err);
    } finally {
      setLoading(false);
    }
  };

  const getEventBadge = (type) => {
    if (type.includes('SUCCESS')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-500/30">
          {type.replace(/_/g, ' ')}
        </span>
      );
    }
    if (type.includes('FAILURE') || type.includes('DENIED')) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/60 text-rose-400 border border-rose-500/30">
          {type.replace(/_/g, ' ')}
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-950/60 text-sky-400 border border-sky-500/30">
        {type.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">Security Audit Activity</h1>
        <p className="text-xs text-slate-400 mt-1">
          Append-only security log recording real authentication, biometric, passkey, and credential release events.
        </p>
      </div>

      {loading ? (
        <div className="py-20 text-center space-y-3 text-slate-400 text-xs">
          <div className="w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p>Loading security audit log...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="py-24 text-center rounded-3xl border border-dashed border-slate-800 bg-[#0c1220]/50 p-8 space-y-3 max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 text-slate-500 mx-auto flex items-center justify-center">
            <History className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-200">No security events recorded</h3>
            <p className="text-xs text-slate-400">
              Audit activity records real authentications, biometric verifications, and credential unlocks.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-[#0f172a] border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold text-[10px]">
                <tr>
                  <th className="py-3 px-4">Event Type</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Origin IP</th>
                  <th className="py-3 px-4">User Agent</th>
                  <th className="py-3 px-4">Context Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-850/50 transition">
                    <td className="py-3 px-4 font-sans">{getEventBadge(e.event_type)}</td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-300">{e.ip_address}</td>
                    <td className="py-3 px-4 text-slate-400 font-sans truncate max-w-[200px]" title={e.user_agent}>
                      {e.user_agent}
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-sans">
                      {e.details && Object.keys(e.details).length > 0 ? (
                        <div className="space-x-2 text-[11px]">
                          {e.details.websiteName && (
                            <span className="text-sky-300 font-medium">{e.details.websiteName}</span>
                          )}
                          {e.details.category && (
                            <span className="text-slate-400">[{e.details.category}]</span>
                          )}
                          {e.details.reason && (
                            <span className="text-rose-400 font-sans">{e.details.reason}</span>
                          )}
                          {e.details.distance !== undefined && (
                            <span className="text-amber-400 font-mono">dist: {e.details.distance}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
