/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tv, ShieldCheck, Maximize2, Minimize2, Radio, Heart } from 'lucide-react';

interface NavbarProps {
  channelCount: number;
  onOpenAdmin: () => void;
  isAdminAuthenticated: boolean;
  theaterMode: boolean;
  onToggleTheaterMode: () => void;
  showOnlyFavorites: boolean;
  onToggleFavorites: () => void;
  favoritesCount: number;
}

export const Navbar: React.FC<NavbarProps> = ({
  channelCount,
  onOpenAdmin,
  isAdminAuthenticated,
  theaterMode,
  onToggleTheaterMode,
  showOnlyFavorites,
  onToggleFavorites,
  favoritesCount,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#0e111a]/90 backdrop-blur-md border-b border-white/[0.08] transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Official Brand Logo */}
        <div className="flex items-center gap-3 shrink-0 py-1">
          <img
            src="/reneetv-logo.png"
            alt="ReneeTV Live"
            className="h-11 sm:h-13 w-auto max-w-[200px] object-contain drop-shadow-[0_4px_16px_rgba(245,158,11,0.25)] hover:scale-105 active:scale-95 transition-transform"
          />
        </div>

        {/* Zone 2: Navigation & Quick Filters */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-300">
          <div className="flex items-center gap-2 text-slate-400">
            <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
            <span className="tabular-nums text-slate-300 font-mono font-medium">{channelCount}</span>
            <span>Channels Available</span>
          </div>

          <button
            onClick={onToggleFavorites}
            className={`flex items-center gap-1.5 transition-colors cursor-pointer py-1 ${
              showOnlyFavorites ? 'text-rose-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${showOnlyFavorites ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span>Favorites</span>
            {favoritesCount > 0 && (
              <span className="font-mono text-[11px] tabular-nums text-slate-400">({favoritesCount})</span>
            )}
          </button>
        </nav>

        {/* Zone 3: Primary Action & Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={onToggleTheaterMode}
            title={theaterMode ? 'Exit Theater Mode' : 'Enter Theater Mode'}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
            aria-label="Toggle theater mode"
          >
            {theaterMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={onOpenAdmin}
            className={`flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              isAdminAuthenticated
                ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                : 'bg-white/[0.07] hover:bg-white/[0.12] text-slate-200 border border-white/[0.08]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-rose-400" />
            <span className="whitespace-nowrap">
              {isAdminAuthenticated ? 'Admin Panel' : 'Administration'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
};
