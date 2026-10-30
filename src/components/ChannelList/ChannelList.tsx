/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from 'react';
import { Search, X, Radio, Heart } from 'lucide-react';
import { Category, Channel } from '../../types/tv';
import { ChannelCard } from './ChannelCard';

interface ChannelListProps {
  channels: Channel[];
  selectedChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  favorites: string[];
  onToggleFavorite: (channelId: string) => void;
  selectedCategory: Category;
  onSelectCategory: (category: Category) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  showOnlyFavorites: boolean;
  onToggleOnlyFavorites: () => void;
}

const CATEGORIES: Category[] = [
  'All',
  'Kosovo',
  'Albania',
  'Germany',
  'News',
  'Sports',
  'Movies',
  'Other',
];

export const ChannelList: React.FC<ChannelListProps> = ({
  channels,
  selectedChannel,
  onSelectChannel,
  favorites,
  onToggleFavorite,
  selectedCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  showOnlyFavorites,
  onToggleOnlyFavorites,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Global '/' keyboard shortcut to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter channels
  const filteredChannels = channels.filter((ch) => {
    // Only enabled channels
    if (ch.enabled === false) return false;

    // Favorites filter
    if (showOnlyFavorites && !favorites.includes(ch.id)) {
      return false;
    }

    // Category filter
    if (selectedCategory !== 'All' && ch.category !== selectedCategory) {
      return false;
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = ch.name.toLowerCase().includes(q);
      const matchCat = ch.category.toLowerCase().includes(q);
      const matchGroup = ch.groupTitle?.toLowerCase().includes(q);
      const matchProgram = ch.currentProgram?.toLowerCase().includes(q);
      return matchName || matchCat || matchGroup || matchProgram;
    }

    return true;
  });

  // Calculate channel counts per category for the current filter set
  const getCategoryCount = (cat: Category) => {
    if (cat === 'All') return channels.filter((c) => c.enabled !== false).length;
    return channels.filter((c) => c.enabled !== false && c.category === cat).length;
  };

  return (
    <section className="space-y-4">
      {/* Search and Filters Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#0e111a]/70 p-3.5 sm:p-4 rounded-xl border border-white/[0.06]">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search channels, broadcasters, programs... (Press '/' to focus)"
            className="w-full pl-10 pr-9 py-2 bg-black/40 border border-white/10 rounded-lg text-xs sm:text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Channel Count & Favorites Quick Filter */}
        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={onToggleOnlyFavorites}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer ${
              showOnlyFavorites
                ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                : 'bg-white/[0.04] border-white/10 text-slate-400 hover:text-white'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${showOnlyFavorites ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span>Favorites</span>
            <span className="font-mono text-[11px] tabular-nums">({favorites.length})</span>
          </button>

          <div className="text-slate-400 hidden sm:flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-rose-500" />
            <span className="font-mono tabular-nums text-white font-medium">
              {filteredChannels.length}
            </span>
            <span>channels</span>
          </div>
        </div>
      </div>

      {/* Category Segmented Tabs (Interactive Filter Controls with Touch-friendly hit target) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 scrollbar-none -mx-1 px-1">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat;
          const count = getCategoryCount(cat);

          return (
            <button
              key={cat}
              onClick={() => onSelectCategory(cat)}
              className={`flex items-center gap-2 min-h-[42px] px-4 py-2 text-xs font-medium rounded-xl whitespace-nowrap shrink-0 transition-all active:scale-95 cursor-pointer ${
                isSelected
                  ? 'bg-rose-600 text-white shadow-md shadow-rose-950/40 font-semibold ring-1 ring-rose-400/30'
                  : 'bg-[#121520]/90 hover:bg-[#181c2a] text-slate-300 hover:text-white border border-white/[0.07]'
              }`}
            >
              <span>{cat}</span>
              <span
                className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded ${
                  isSelected ? 'bg-black/30 text-white' : 'bg-white/[0.06] text-slate-400'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Channel Grid */}
      {filteredChannels.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredChannels.map((channel) => (
            <ChannelCard
              key={channel.id}
              channel={channel}
              isSelected={selectedChannel?.id === channel.id}
              isFavorite={favorites.includes(channel.id)}
              onSelect={onSelectChannel}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="py-16 px-4 text-center rounded-xl bg-[#0e111a]/50 border border-white/[0.06]">
          <div className="w-12 h-12 rounded-full bg-white/[0.04] text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Search className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white mb-1">No channels found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
            No active channels match your current search &quot;{searchQuery}&quot; or category filter.
          </p>
          <div className="flex items-center justify-center gap-3">
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Clear Search
              </button>
            )}
            {selectedCategory !== 'All' && (
              <button
                onClick={() => onSelectCategory('All')}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                View All Categories
              </button>
            )}
            {showOnlyFavorites && (
              <button
                onClick={onToggleOnlyFavorites}
                className="px-3.5 py-1.5 bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Show All Channels
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
