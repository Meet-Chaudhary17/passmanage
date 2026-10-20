import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, KeyRound, History, Settings, LogOut, Puzzle } from 'lucide-react';

export default function Navbar({ onOpenExtensionModal }) {
  const { user, logout } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const navItems = [
    { label: 'Vault', path: '/', icon: KeyRound },
    { label: 'Security Activity', path: '/activity', icon: History },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <header className="border-b border-slate-800 bg-[#0c1220]/80 backdrop-blur sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-8">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg text-slate-100 tracking-tight">PassManage</span>
              <span className="text-[10px] uppercase font-mono ml-2 px-1.5 py-0.5 rounded bg-sky-950 border border-sky-800 text-sky-400">
                Vault
              </span>
            </div>
          </Link>

          {/* Nav links */}
          <nav className="hidden md:flex space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center space-x-2 ${
                    isActive
                      ? 'bg-slate-800 text-sky-400'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right Actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onOpenExtensionModal}
            className="hidden sm:flex items-center space-x-2 text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
          >
            <Puzzle className="w-3.5 h-3.5 text-sky-400" />
            <span>Extension</span>
          </button>

          <div className="text-right hidden sm:block">
            <div className="text-xs text-slate-400 truncate max-w-[180px]">{user.email}</div>
            <div className="text-[10px] text-emerald-400 flex items-center justify-end space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Authenticated</span>
            </div>
          </div>

          <button
            onClick={logout}
            title="Log out"
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
