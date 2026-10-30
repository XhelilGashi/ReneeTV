/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Activity, Wifi, Film, ShieldAlert, CheckCircle2, Copy, Check } from 'lucide-react';
import { Channel, PlayerStats, RecoveryLogEntry, StreamQualityLevel } from '../../types/tv';

interface StreamDiagnosticsModalProps {
  channel: Channel;
  stats: PlayerStats;
  qualityLevels: StreamQualityLevel[];
  currentLevelIndex: number;
  isOpen: boolean;
  onClose: () => void;
  recoveryLog?: RecoveryLogEntry[];
}

export const StreamDiagnosticsModal: React.FC<StreamDiagnosticsModalProps> = ({
  channel,
  stats,
  qualityLevels,
  currentLevelIndex,
  isOpen,
  onClose,
  recoveryLog,
}) => {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen) return null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(channel.streamUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#121520] border border-white/10 rounded-xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="w-5 h-5 text-rose-500" />
            <h3 className="text-base font-bold text-white">Stream Technical Diagnostics</h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs font-mono">
          {/* Channel Info */}
          <div className="p-3 bg-white/[0.03] rounded-lg border border-white/5 space-y-2">
            <div className="flex justify-between items-center text-slate-400">
              <span>Channel Name:</span>
              <span className="text-white font-sans font-semibold">{channel.name}</span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Category:</span>
              <span className="text-rose-400">{channel.category}</span>
            </div>
            {channel.groupTitle && (
              <div className="flex justify-between items-center text-slate-400">
                <span>M3U Group:</span>
                <span className="text-slate-300">{channel.groupTitle}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-slate-400">
              <span>Classification:</span>
              <span className={channel.isDemo ? 'text-amber-400 font-semibold' : 'text-emerald-400'}>
                {channel.isDemo ? 'Authorized Demo Stream' : 'Custom Imported Stream'}
              </span>
            </div>
          </div>

          {/* Stream URL */}
          <div className="p-3 bg-white/[0.03] rounded-lg border border-white/5 space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <span>Stream Manifest URL:</span>
              <button
                onClick={handleCopyUrl}
                className="flex items-center gap-1 text-[11px] text-slate-300 hover:text-white cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-300 break-all select-all bg-black/40 p-2 rounded border border-white/5">
              {channel.streamUrl}
            </p>
          </div>

          {/* Telemetry Metrics */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="p-3 bg-white/[0.03] rounded-lg border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[11px]">HLS Engine</span>
              <span className="text-sm font-semibold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                {stats.usingNativeHls ? 'Native Safari HLS' : 'HLS.js v1.x'}
              </span>
            </div>

            <div className="p-3 bg-white/[0.03] rounded-lg border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[11px]">Resolution</span>
              <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Film className="w-4 h-4 text-rose-400" />
                {stats.resolution || 'Auto / Negotiating'}
              </span>
            </div>

            <div className="p-3 bg-white/[0.03] rounded-lg border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[11px]">Estimated Bandwidth</span>
              <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Wifi className="w-4 h-4 text-cyan-400" />
                {stats.bandwidthEstimate
                  ? `${(stats.bandwidthEstimate / 1_000_000).toFixed(2)} Mbps`
                  : 'Measuring...'}
              </span>
            </div>

            <div className="p-3 bg-white/[0.03] rounded-lg border border-white/5 space-y-1">
              <span className="text-slate-400 block text-[11px]">Dropped Frames</span>
              <span className="text-sm font-semibold text-slate-300">
                {stats.droppedFrames ?? 0} frames
              </span>
            </div>
          </div>

          {/* Available Quality Profiles */}
          {qualityLevels.length > 0 && (
            <div className="p-3 bg-white/[0.03] rounded-lg border border-white/5 space-y-2">
              <span className="text-slate-400 block text-[11px]">Detected Multi-Bitrate Profiles</span>
              <div className="space-y-1">
                {qualityLevels.map((lvl) => (
                  <div
                    key={lvl.id}
                    className={`flex justify-between items-center px-2 py-1 rounded text-[11px] ${
                      currentLevelIndex === lvl.id
                        ? 'bg-rose-950/50 text-rose-300 border border-rose-500/30'
                        : 'text-slate-300'
                    }`}
                  >
                    <span>{lvl.name}</span>
                    <span>{(lvl.bitrate / 1000).toFixed(0)} kbps</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Automatic Channel Recovery History (Admin Protected) */}
          {recoveryLog && recoveryLog.length > 0 && (
            <div className="p-3 bg-white/[0.03] rounded-lg border border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-semibold text-[11px] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-rose-400" />
                  <span>Automatic Channel Recovery Log ({recoveryLog.length})</span>
                </span>
                <span className="text-[10px] text-slate-500">Latest 50 events</span>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {recoveryLog.map((entry, idx) => (
                  <div
                    key={`${entry.channelId}-${idx}`}
                    className="p-2 bg-black/40 rounded border border-white/5 text-[11px] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-rose-400 font-semibold">{entry.channelName}</span>
                      <span className="text-slate-500 text-[10px]">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[10px] break-words">{entry.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Security & Playback Notes */}
          <div className="p-3 bg-amber-950/20 rounded-lg border border-amber-500/20 text-amber-300/90 text-[11px] space-y-1 font-sans">
            <div className="flex items-center gap-1.5 font-semibold text-amber-200">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>Browser Security & Compatibility Guidance</span>
            </div>
            <p className="leading-relaxed">
              Streams require CORS headers (`Access-Control-Allow-Origin: *`) enabled by the broadcaster.
              Geographically restricted streams or streams with DRM/token parameters must be viewed in supported regions or with authorized credentials.
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-white/10 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
