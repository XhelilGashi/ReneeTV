/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  ShieldAlert,
  ArrowRight,
  Keyboard,
  CheckCircle2,
} from 'lucide-react';
import { Category, Channel, RecoveryLogEntry } from './types/tv';
import { ApiService } from './services/api';
import { DEFAULT_DEMO_CHANNELS } from './data/defaultChannels';
import { Navbar } from './components/Navbar/Navbar';
import { LivePlayer } from './components/Player/LivePlayer';
import { ChannelList } from './components/ChannelList/ChannelList';
import { AdminPanel } from './components/Admin/AdminPanel';

export default function App() {
  const [channels, setChannels] = useState<Channel[]>(DEFAULT_DEMO_CHANNELS);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [theaterMode, setTheaterMode] = useState(false);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);

  // Automatic channel recovery state
  const [allChannelsFailed, setAllChannelsFailed] = useState<boolean>(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState<boolean>(false);
  const [recoveryLog, setRecoveryLog] = useState<RecoveryLogEntry[]>([]);

  const failedInCycleRef = useRef<Set<string>>(new Set());
  const manualSelectionTimestampRef = useRef<number>(0);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  // Admin state
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [requiresAdminSetup, setRequiresAdminSetup] = useState(false);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 2800);
  }, []);

  // Initialize channels, favorites, and admin status
  useEffect(() => {
    const initApp = async () => {
      // Load favorites
      setFavorites(ApiService.getFavorites());

      // Load channels
      const loadedChannels = await ApiService.getChannels();
      setChannels(loadedChannels);

      // Select News 24 as the default channel on screen, or fallback to first enabled channel
      const news24 = loadedChannels.find(
        (c) => c.name.toLowerCase().includes('news 24') && c.enabled !== false
      );
      const firstEnabled = loadedChannels.find((c) => c.enabled !== false);
      if (news24) {
        setSelectedChannel(news24);
      } else if (firstEnabled) {
        setSelectedChannel(firstEnabled);
      }

      // Check admin status
      const adminStatus = await ApiService.checkAdminStatus();
      setIsAdminAuthenticated(adminStatus.authenticated);
      setRequiresAdminSetup(adminStatus.requiresSetup);
    };

    initApp();
  }, []);

  // Filter channels according to category, favorites, and search query
  const filteredChannels = useMemo(() => {
    return channels.filter((ch) => {
      if (ch.enabled === false) return false;
      if (showOnlyFavorites && !favorites.includes(ch.id)) return false;
      if (selectedCategory !== 'All' && ch.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return (
          ch.name.toLowerCase().includes(q) ||
          ch.category.toLowerCase().includes(q) ||
          ch.groupTitle?.toLowerCase().includes(q) ||
          ch.currentProgram?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [channels, showOnlyFavorites, favorites, selectedCategory, searchQuery]);

  // Active list for channel navigation (respects current view or all enabled channels)
  const activeChannelsList = useMemo(() => {
    return filteredChannels.length > 0
      ? filteredChannels
      : channels.filter((c) => c.enabled !== false);
  }, [filteredChannels, channels]);

  const currentChannelIndex = useMemo(() => {
    return activeChannelsList.findIndex((c) => c.id === selectedChannel?.id);
  }, [activeChannelsList, selectedChannel]);

  const totalChannels = activeChannelsList.length;

  // Favorite toggle handler
  const handleToggleFavorite = (channelId: string) => {
    const updated = ApiService.toggleFavorite(channelId);
    setFavorites(updated);
    const ch = channels.find((c) => c.id === channelId);
    if (ch) {
      const isFav = updated.includes(channelId);
      showToast(isFav ? `Added "${ch.name}" to favorites` : `Removed "${ch.name}" from favorites`);
    }
  };

  // -------------------------------------------------------------
  // Automatic Channel Recovery System
  // -------------------------------------------------------------
  const handleStreamFailed = useCallback(
    (failedChannelId: string, errorReason: string) => {
      // Prevent stale error callbacks from overriding a newer manual user selection
      if (selectedChannel && selectedChannel.id !== failedChannelId) {
        return;
      }

      const failedChannel = channels.find((c) => c.id === failedChannelId);
      const newEntry: RecoveryLogEntry = {
        channelId: failedChannelId,
        channelName: failedChannel?.name || 'Channel',
        timestamp: new Date().toISOString(),
        reason: errorReason,
        cycleIndex: failedInCycleRef.current.size + 1,
      };

      // Keep log for administrator diagnostics
      setRecoveryLog((prev) => [newEntry, ...prev.slice(0, 49)]);

      failedInCycleRef.current.add(failedChannelId);
      setIsRecoveryMode(true);

      const activeList =
        filteredChannels.length > 0
          ? filteredChannels
          : channels.filter((c) => c.enabled !== false);

      if (activeList.length === 0) {
        setAllChannelsFailed(true);
        setIsRecoveryMode(false);
        return;
      }

      // Check if all channels in current list have failed in this recovery cycle
      const allTried = activeList.every((c) => failedInCycleRef.current.has(c.id));
      if (allTried || failedInCycleRef.current.size >= activeList.length) {
        console.warn('[Auto-Recovery] Every channel failed in current cycle. Halting.');
        setAllChannelsFailed(true);
        setIsRecoveryMode(false);
        return;
      }

      // Find next channel in sequence that has not failed yet in this cycle
      const currentIdx = activeList.findIndex((c) => c.id === failedChannelId);
      let nextChannel: Channel | null = null;

      for (let i = 1; i <= activeList.length; i++) {
        const candidate = activeList[(currentIdx + i) % activeList.length];
        if (candidate && !failedInCycleRef.current.has(candidate.id)) {
          nextChannel = candidate;
          break;
        }
      }

      if (nextChannel) {
        setSelectedChannel(nextChannel);
      } else {
        setAllChannelsFailed(true);
        setIsRecoveryMode(false);
      }
    },
    [channels, filteredChannels, selectedChannel]
  );

  const handlePlaybackSuccess = useCallback((channelId: string) => {
    // Playback started successfully: clear failed cycle and exit recovery mode
    failedInCycleRef.current.clear();
    setIsRecoveryMode(false);
    setAllChannelsFailed(false);
  }, []);

  const handleUserSelectChannel = useCallback(
    (ch: Channel, shouldScroll: boolean = true) => {
      // Manual selection: reset recovery cycle so chosen channel gets a fresh attempt
      manualSelectionTimestampRef.current = Date.now();
      failedInCycleRef.current.clear();
      setIsRecoveryMode(false);
      setAllChannelsFailed(false);
      setSelectedChannel(ch);
      showToast(`Loading ${ch.name}...`);

      // Automatically scroll player into view on mobile/tablet or when player is scrolled away
      if (shouldScroll && !isPlayerFullscreen) {
        requestAnimationFrame(() => {
          if (!playerContainerRef.current) return;
          const rect = playerContainerRef.current.getBoundingClientRect();
          const isMobileOrTablet = window.innerWidth <= 1024 || 'ontouchstart' in window;
          const isScrolledPast = rect.top < 50 || rect.top > window.innerHeight * 0.35;

          if (isMobileOrTablet || isScrolledPast) {
            const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            playerContainerRef.current.scrollIntoView({
              behavior: prefersReducedMotion ? 'auto' : 'smooth',
              block: 'start',
            });
          }
        });
      }
    },
    [showToast, isPlayerFullscreen]
  );

  const handleRetryAll = useCallback(() => {
    failedInCycleRef.current.clear();
    setIsRecoveryMode(false);
    setAllChannelsFailed(false);
    const activeList =
      filteredChannels.length > 0
        ? filteredChannels
        : channels.filter((c) => c.enabled !== false);
    if (activeList.length > 0) {
      setSelectedChannel(activeList[0]);
    }
  }, [filteredChannels, channels]);

  // Next channel handler (Manual)
  const handleNextChannel = useCallback(() => {
    if (!activeChannelsList.length) return;
    const currentIndex = activeChannelsList.findIndex((c) => c.id === selectedChannel?.id);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % activeChannelsList.length;
    const nextChan = activeChannelsList[nextIndex];
    if (nextChan) {
      handleUserSelectChannel(nextChan);
    }
  }, [activeChannelsList, selectedChannel, handleUserSelectChannel]);

  // Previous channel handler (Manual)
  const handlePrevChannel = useCallback(() => {
    if (!activeChannelsList.length) return;
    const currentIndex = activeChannelsList.findIndex((c) => c.id === selectedChannel?.id);
    const prevIndex = currentIndex <= 0 ? activeChannelsList.length - 1 : currentIndex - 1;
    const prevChan = activeChannelsList[prevIndex];
    if (prevChan) {
      handleUserSelectChannel(prevChan);
    }
  }, [activeChannelsList, selectedChannel, handleUserSelectChannel]);

  // Keyboard navigation for channels (Arrow Up / Down)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleNextChannel();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handlePrevChannel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextChannel, handlePrevChannel]);

  return (
    <div className="min-h-screen bg-[#0a0c14] text-slate-100 flex flex-col font-sans selection:bg-rose-600 selection:text-white">
      {/* Top Navigation (Hidden in Fullscreen/Landscape Mode) */}
      {!isPlayerFullscreen && (
        <Navbar
          channelCount={channels.filter((c) => c.enabled !== false).length}
          onOpenAdmin={() => setIsAdminOpen(true)}
          isAdminAuthenticated={isAdminAuthenticated}
          theaterMode={theaterMode}
          onToggleTheaterMode={() => setTheaterMode(!theaterMode)}
          showOnlyFavorites={showOnlyFavorites}
          onToggleFavorites={() => setShowOnlyFavorites(!showOnlyFavorites)}
          favoritesCount={favorites.length}
        />
      )}

      {/* Main Container */}
      <main
        className={`flex-1 transition-all duration-300 ${
          isPlayerFullscreen
            ? 'p-0 m-0 w-full'
            : theaterMode
            ? 'px-2 sm:px-4 py-2 w-full'
            : 'w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-5'
        }`}
      >
        {/* Prominent Live Player with Automatic Recovery */}
        <section
          ref={playerContainerRef}
          className={`scroll-mt-20 sm:scroll-mt-24 transition-all ${isPlayerFullscreen ? '' : 'mb-4 sm:mb-6'}`}
        >
          <LivePlayer
            channel={selectedChannel}
            onNextChannel={handleNextChannel}
            onPrevChannel={handlePrevChannel}
            onStreamFailed={handleStreamFailed}
            onPlaybackSuccess={handlePlaybackSuccess}
            isRecoveryMode={isRecoveryMode}
            allChannelsFailed={allChannelsFailed}
            onRetryAll={handleRetryAll}
            isAdminAuthenticated={isAdminAuthenticated}
            recoveryLog={recoveryLog}
            theaterMode={theaterMode}
            onToggleTheaterMode={() => setTheaterMode(!theaterMode)}
            currentChannelIndex={currentChannelIndex}
            totalChannels={totalChannels}
            onFullscreenChange={setIsPlayerFullscreen}
          />
        </section>

        {/* Normal layout elements only displayed in non-fullscreen */}
        {!isPlayerFullscreen && (
          <>
            {/* Demo Notice Banner (Distinct & Transparent for Authorized Streams) */}
            {selectedChannel?.isDemo && !theaterMode && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 rounded-xl bg-amber-950/25 border border-amber-500/20 text-xs text-amber-200/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-white block">
                      Demonstration Mode Active
                    </span>
                    <span className="text-amber-200/80">
                      Currently streaming authorized open HLS test feeds. As an administrator, you can import private M3U playlists or individual broadcast streams at any time.
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setIsAdminOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer"
                >
                  <span>Import M3U Playlist</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Channel Grid Section (Portrait Mode & Desktop) */}
            <ChannelList
              channels={channels}
              selectedChannel={selectedChannel}
              onSelectChannel={handleUserSelectChannel}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              showOnlyFavorites={showOnlyFavorites}
              onToggleOnlyFavorites={() => setShowOnlyFavorites(!showOnlyFavorites)}
            />
          </>
        )}
      </main>

      {/* Footer (Hidden in Fullscreen) */}
      {!isPlayerFullscreen && (
        <footer className="mt-auto border-t border-white/[0.06] bg-[#08090f] py-4 sm:py-6 text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/reneetv-logo.png"
                alt="ReneeTV Live"
                className="h-8 w-auto object-contain"
              />
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-semibold">ReneeTV Live</span>
                <span className="text-slate-600">·</span>
                <span>Live Television & Broadcast Management</span>
              </div>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1">
                <Keyboard className="w-3.5 h-3.5 text-slate-400" />
                <span>Swipe left/right or use ↑ / ↓ keys to switch channels</span>
              </span>
            </div>
          </div>
        </footer>
      )}

      {/* Admin Panel Modal */}
      <AdminPanel
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        channels={channels}
        onUpdateChannels={(updated) => {
          setChannels(updated);
          // If current channel was removed or disabled, pick another
          if (
            selectedChannel &&
            !updated.some((c) => c.id === selectedChannel.id && c.enabled !== false)
          ) {
            const firstValid = updated.find((c) => c.enabled !== false);
            if (firstValid) setSelectedChannel(firstValid);
          }
        }}
        onSelectChannelForPreview={(ch) => {
          handleUserSelectChannel(ch);
          setIsAdminOpen(false);
          showToast(`Now playing preview: ${ch.name}`);
        }}
        isAuthenticated={isAdminAuthenticated}
        requiresSetup={requiresAdminSetup}
        onAuthSuccess={() => {
          setIsAdminAuthenticated(true);
          setRequiresAdminSetup(false);
          showToast('Administrator authenticated successfully');
        }}
        onLogout={async () => {
          await ApiService.logoutAdmin();
          setIsAdminAuthenticated(false);
          showToast('Logged out from administration');
        }}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-[#141824] border border-white/10 rounded-xl text-xs font-semibold text-white shadow-2xl animate-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
