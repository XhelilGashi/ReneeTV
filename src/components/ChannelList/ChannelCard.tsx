/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Heart, Play } from 'lucide-react';
import { Channel } from '../../types/tv';

interface ChannelCardProps {
  channel: Channel;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: (channel: Channel) => void;
  onToggleFavorite: (channelId: string) => void;
}

export const ChannelCard: React.FC<ChannelCardProps> = ({
  channel,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
}) => {
  const [imageError, setImageError] = useState(false);

  // Category subtle badge colors
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Kosovo':
        return 'text-sky-400';
      case 'Albania':
        return 'text-rose-400';
      case 'Germany':
        return 'text-amber-400';
      case 'News':
        return 'text-blue-400';
      case 'Sports':
        return 'text-emerald-400';
      case 'Movies':
        return 'text-purple-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div
      onClick={() => onSelect(channel)}
      className={`group relative rounded-xl p-3.5 transition-all duration-200 cursor-pointer border ${
        isSelected
          ? 'bg-rose-950/30 border-rose-500/50 shadow-lg shadow-rose-950/20'
          : 'bg-[#121520]/80 hover:bg-[#181c2a] border-white/[0.06] hover:border-white/[0.15]'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Channel Logo / Fallback */}
        <div className="relative w-12 h-12 rounded-lg bg-black/60 border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
          {channel.logoUrl && !imageError ? (
            <img
              src={channel.logoUrl}
              alt={channel.name}
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
              className="w-full h-full object-contain p-1"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900 text-slate-300 font-bold text-xs tracking-wider font-mono">
              {channel.name.substring(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'TV'}
            </div>
          )}

          {/* Active Soundwave / Play indicator */}
          {isSelected ? (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center">
              <div className="flex items-end gap-0.5 h-4">
                <span className="w-1 bg-rose-500 rounded-full animate-[bounce_1s_infinite_100ms] h-4" />
                <span className="w-1 bg-rose-500 rounded-full animate-[bounce_1s_infinite_300ms] h-2.5" />
                <span className="w-1 bg-rose-500 rounded-full animate-[bounce_1s_infinite_200ms] h-3.5" />
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Play className="w-5 h-5 text-white fill-white" />
            </div>
          )}
        </div>

        {/* Channel Details */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-1">
            <h3
              className={`text-sm font-semibold truncate transition-colors ${
                isSelected ? 'text-white' : 'text-slate-200 group-hover:text-white'
              }`}
            >
              {channel.name}
            </h3>

            {/* Favorite Button (Touch Friendly) */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(channel.id);
              }}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              className="min-w-[40px] min-h-[40px] -mr-1.5 -mt-1.5 flex items-center justify-center text-slate-500 hover:text-rose-400 active:scale-95 transition-all shrink-0 cursor-pointer"
            >
              <Heart
                className={`w-4 h-4 ${
                  isFavorite ? 'fill-rose-500 text-rose-500' : 'group-hover:text-slate-300'
                }`}
              />
            </button>
          </div>

          {/* Unboxed Metadata (Zero-Pill Discipline) */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-sans">
            <span className={`font-medium ${getCategoryColor(channel.category)}`}>
              {channel.category}
            </span>
            {channel.resolution && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono text-[11px] text-slate-400">{channel.resolution}</span>
              </>
            )}
            {channel.isDemo && (
              <>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono text-[10px] text-amber-400/90 font-medium">DEMO</span>
              </>
            )}
          </div>

          {/* Program Title / Description */}
          {channel.currentProgram && (
            <p className="mt-1 text-xs text-slate-400 line-clamp-1 group-hover:text-slate-300 transition-colors">
              {channel.currentProgram}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
