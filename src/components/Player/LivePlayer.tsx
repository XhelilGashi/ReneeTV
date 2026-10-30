/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  Maximize,
  Minimize,
  RotateCcw,
  PictureInPicture2,
  Radio,
  Sliders,
  Info,
  ChevronRight,
  ChevronLeft,
  SkipBack,
  SkipForward,
  Tv,
} from 'lucide-react';
import { Channel, PlayerStats, RecoveryLogEntry, StreamQualityLevel } from '../../types/tv';
import { StreamDiagnosticsModal } from '../Diagnostics/StreamDiagnosticsModal';

interface LivePlayerProps {
  channel: Channel | null;
  onNextChannel?: () => void;
  onPrevChannel?: () => void;
  onStreamFailed?: (channelId: string, errorReason: string) => void;
  onPlaybackSuccess?: (channelId: string) => void;
  isRecoveryMode?: boolean;
  allChannelsFailed?: boolean;
  onRetryAll?: () => void;
  isAdminAuthenticated?: boolean;
  recoveryLog?: RecoveryLogEntry[];
  theaterMode?: boolean;
  onToggleTheaterMode?: () => void;
  currentChannelIndex?: number;
  totalChannels?: number;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

interface ChannelHudState {
  direction?: 'next' | 'prev' | 'select';
  channelName: string;
  category: string;
  logoUrl?: string;
  channelIndex?: number;
  totalChannels?: number;
}

export const LivePlayer: React.FC<LivePlayerProps> = ({
  channel,
  onNextChannel,
  onPrevChannel,
  onStreamFailed,
  onPlaybackSuccess,
  isRecoveryMode,
  allChannelsFailed,
  onRetryAll,
  isAdminAuthenticated,
  recoveryLog,
  theaterMode,
  onToggleTheaterMode,
  currentChannelIndex,
  totalChannels,
  onFullscreenChange,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Watchdog Timers for automatic failure detection and recovery
  const startupWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  const stallWatchdogRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedPlayingRef = useRef<boolean>(false);
  const isManuallyPausedRef = useRef<boolean>(false);

  // Touch gesture tracking references
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const touchMovedRef = useRef<boolean>(false);
  const isInteractingWithControlsRef = useRef<boolean>(false);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAutoplayMuted, setIsAutoplayMuted] = useState(false);
  const [isNativeFs, setIsNativeFs] = useState(false);
  const [isPseudoFs, setIsPseudoFs] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'fill' | '16:9'>('contain');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [qualityLevels, setQualityLevels] = useState<StreamQualityLevel[]>([]);
  const [currentLevelIndex, setCurrentLevelIndex] = useState<number>(-1); // -1 = auto
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [channelHud, setChannelHud] = useState<ChannelHudState | null>(null);

  const [stats, setStats] = useState<PlayerStats>({
    isHlsSupported: Hls.isSupported(),
    usingNativeHls: false,
    droppedFrames: 0,
  });

  // Effective Fullscreen: native fullscreen or CSS pseudo-fullscreen or mobile automatic landscape mode
  const isEffectivelyFullscreen = isNativeFs || isPseudoFs || (isLandscape && isMobileDevice);

  // Notify parent component of fullscreen change
  useEffect(() => {
    onFullscreenChange?.(isEffectivelyFullscreen);
  }, [isEffectivelyFullscreen, onFullscreenChange]);

  // Mobile Device Detection
  useEffect(() => {
    const checkMobile = () => {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmall = window.innerWidth <= 1024;
      setIsMobileDevice(isTouch && isSmall);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Screen Orientation Detection & Automatic Landscape Handling
  useEffect(() => {
    const handleOrientation = () => {
      const orientationType = window.screen?.orientation?.type || '';
      const mql = window.matchMedia('(orientation: landscape)');
      const isLandscapeView =
        orientationType.includes('landscape') || (mql.matches && window.innerHeight < 600);
      setIsLandscape(isLandscapeView);
    };

    handleOrientation();
    window.addEventListener('resize', handleOrientation);
    window.addEventListener('orientationchange', handleOrientation);
    if (window.screen?.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientation);
    }

    return () => {
      window.removeEventListener('resize', handleOrientation);
      window.removeEventListener('orientationchange', handleOrientation);
      if (window.screen?.orientation) {
        window.screen.orientation.removeEventListener('change', handleOrientation);
      }
    };
  }, []);

  // Display Brief HUD Overlay when Channel changes
  const triggerChannelHud = useCallback(
    (direction: 'next' | 'prev' | 'select' = 'select') => {
      if (!channel) return;
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);

      setChannelHud({
        direction,
        channelName: channel.name,
        category: channel.category,
        logoUrl: channel.logoUrl,
        channelIndex: currentChannelIndex,
        totalChannels,
      });

      hudTimeoutRef.current = setTimeout(() => {
        setChannelHud(null);
      }, 1900);
    },
    [channel, currentChannelIndex, totalChannels]
  );

  // Trigger HUD on channel change
  useEffect(() => {
    triggerChannelHud('select');
  }, [channel?.id, triggerChannelHud]);

  // Trigger stream failure to initiate safe automatic channel recovery
  const triggerStreamFailure = useCallback(
    (reason: string) => {
      // Do not trigger auto-recovery if user manually paused or is not active
      if (isManuallyPausedRef.current) return;

      if (startupWatchdogRef.current) {
        clearTimeout(startupWatchdogRef.current);
        startupWatchdogRef.current = null;
      }
      if (stallWatchdogRef.current) {
        clearTimeout(stallWatchdogRef.current);
        stallWatchdogRef.current = null;
      }

      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      if (channel) {
        onStreamFailed?.(channel.id, reason);
      }
    },
    [channel, onStreamFailed]
  );

  // Handle stream initialization & teardown
  const initializeStream = useCallback(() => {
    if (!channel || !videoRef.current) return;

    const video = videoRef.current;
    setIsLoading(true);
    setQualityLevels([]);
    setCurrentLevelIndex(-1);
    hasStartedPlayingRef.current = false;
    isManuallyPausedRef.current = false;

    // Clear previous watchdog timers
    if (startupWatchdogRef.current) {
      clearTimeout(startupWatchdogRef.current);
      startupWatchdogRef.current = null;
    }
    if (stallWatchdogRef.current) {
      clearTimeout(stallWatchdogRef.current);
      stallWatchdogRef.current = null;
    }

    // Clean up previous HLS instance to prevent memory leaks
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // 8.5-second startup watchdog timer: If stream does not play within 8.5s, auto-switch
    startupWatchdogRef.current = setTimeout(() => {
      if (!hasStartedPlayingRef.current && !isManuallyPausedRef.current) {
        console.warn(`[Auto-Recovery] Startup timeout (>8.5s) on channel: ${channel.name}`);
        triggerStreamFailure('Timeout: Stream manifest or chunks took >8.5s to respond');
      }
    }, 8500);

    const streamUrl = channel.streamUrl.trim();
    const backupUrl = channel.backupStreamUrl?.trim();

    // Route external/HTTP streams through backend proxy
    let playableUrl = streamUrl;
    const isHttpOnHttps = window.location.protocol === 'https:' && streamUrl.startsWith('http://');
    const isXtreamHost = streamUrl.includes('trxdnscloud') || streamUrl.includes(':80/');

    if (isHttpOnHttps || isXtreamHost || streamUrl.startsWith('http://')) {
      playableUrl = `/api/proxy/stream.m3u8?url=${encodeURIComponent(streamUrl)}${
        backupUrl ? `&backup=${encodeURIComponent(backupUrl)}` : ''
      }`;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startLevel: -1, // Auto
      });

      hlsRef.current = hls;

      hls.attachMedia(video);

      hls.on(Hls.Events.MEDIA_ATTACHED, () => {
        hls.loadSource(playableUrl);
      });

      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        const levels: StreamQualityLevel[] = data.levels.map((lvl, index) => ({
          id: index,
          height: lvl.height,
          width: lvl.width,
          bitrate: lvl.bitrate,
          name: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
        }));
        setQualityLevels(levels);

        setStats((prev) => ({
          ...prev,
          usingNativeHls: false,
          resolution: video.videoWidth ? `${video.videoWidth}x${video.videoHeight}` : undefined,
        }));

        video.volume = 1.0;
        video.play().catch((playErr) => {
          console.warn('Autoplay prevented, muting audio temporarily:', playErr);
          video.muted = true;
          setIsAutoplayMuted(true);
          video.play().catch(() => {
            setIsPlaying(false);
          });
        });
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
        const lvl = hls.levels[data.level];
        if (lvl) {
          setStats((prev) => ({
            ...prev,
            resolution: `${lvl.width}x${lvl.height}`,
            bitrate: lvl.bitrate,
          }));
        }
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        console.warn('HLS.js event error:', data);

        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('Fatal media error encountered, trying recovery...');
              hls.recoverMediaError();
              break;
            case Hls.ErrorTypes.NETWORK_ERROR:
            default:
              // Automatic Recovery: Do NOT show technical error screen to viewer
              hls.destroy();
              hlsRef.current = null;
              triggerStreamFailure(`${data.type}: ${data.details || 'Fatal network or manifest error'}`);
              break;
          }
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native Apple Safari / iOS HLS
      video.src = playableUrl;
      setStats((prev) => ({ ...prev, usingNativeHls: true }));

      video.addEventListener('loadedmetadata', () => {
        video.volume = 1.0;
        video.play().catch(() => {
          video.muted = true;
          setIsAutoplayMuted(true);
          video.play().catch(() => setIsPlaying(false));
        });
      });

      video.addEventListener('error', () => {
        triggerStreamFailure('Native HTML5 video playback error');
      });
    } else {
      triggerStreamFailure('Unsupported browser HLS format');
    }
  }, [channel, triggerStreamFailure]);

  // Re-run whenever channel changes
  useEffect(() => {
    initializeStream();

    return () => {
      if (startupWatchdogRef.current) {
        clearTimeout(startupWatchdogRef.current);
        startupWatchdogRef.current = null;
      }
      if (stallWatchdogRef.current) {
        clearTimeout(stallWatchdogRef.current);
        stallWatchdogRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [initializeStream]);

  // Video event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      setIsPlaying(true);
      isManuallyPausedRef.current = false;
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handlePlaying = () => {
      hasStartedPlayingRef.current = true;
      setIsLoading(false);

      if (startupWatchdogRef.current) {
        clearTimeout(startupWatchdogRef.current);
        startupWatchdogRef.current = null;
      }
      if (stallWatchdogRef.current) {
        clearTimeout(stallWatchdogRef.current);
        stallWatchdogRef.current = null;
      }

      if (channel) {
        onPlaybackSuccess?.(channel.id);
      }
    };

    const handleWaiting = () => {
      if (!isManuallyPausedRef.current) {
        setIsLoading(true);
      }
    };

    // Stall watchdog: If playing stream stalls continuously for >9 seconds, auto-switch
    const handleStalled = () => {
      if (!isManuallyPausedRef.current && hasStartedPlayingRef.current) {
        if (!stallWatchdogRef.current) {
          stallWatchdogRef.current = setTimeout(() => {
            console.warn('[Auto-Recovery] Stream stalled for >9s, triggering recovery');
            triggerStreamFailure('Stream stalled continuously (>9s)');
          }, 9000);
        }
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('stalled', handleStalled);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('stalled', handleStalled);
    };
  }, [channel, onPlaybackSuccess, triggerStreamFailure]);

  // Automatically enable full device sound on any interaction (PC, TV, phone)
  useEffect(() => {
    const enableDeviceSound = () => {
      if (videoRef.current) {
        videoRef.current.muted = false;
        videoRef.current.volume = 1.0;
      }
      setIsAutoplayMuted(false);
    };

    window.addEventListener('click', enableDeviceSound);
    window.addEventListener('touchstart', enableDeviceSound);
    window.addEventListener('pointerdown', enableDeviceSound);
    window.addEventListener('keydown', enableDeviceSound);

    return () => {
      window.removeEventListener('click', enableDeviceSound);
      window.removeEventListener('touchstart', enableDeviceSound);
      window.removeEventListener('pointerdown', enableDeviceSound);
      window.removeEventListener('keydown', enableDeviceSound);
    };
  }, []);

  // Listen to native fullscreen changes
  useEffect(() => {
    const handleFsChange = () => {
      const isNative = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsNativeFs(isNative);
      if (!isNative && !isPseudoFs) {
        document.body.style.overflow = '';
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
    };
  }, [isPseudoFs]);

  // Hardware/Browser Back Button Navigation to exit Fullscreen gracefully
  useEffect(() => {
    const handlePopState = () => {
      if (isPseudoFs) {
        setIsPseudoFs(false);
        document.body.style.overflow = '';
      }
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen().catch(() => {});
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isPseudoFs]);

  // Auto-hide controls after 3 seconds of inactivity
  const scheduleControlsHide = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (!isInteractingWithControlsRef.current && isPlaying) {
        setShowControls(false);
        setShowQualityMenu(false);
      }
    }, 3000);
  }, [isPlaying]);

  const keepControlsVisible = useCallback(() => {
    setShowControls(true);
    scheduleControlsHide();
  }, [scheduleControlsHide]);

  // Toggle Play / Pause
  const handleTogglePlay = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current) return;
    if (isPlaying) {
      isManuallyPausedRef.current = true;
      videoRef.current.pause();
      if (startupWatchdogRef.current) clearTimeout(startupWatchdogRef.current);
      if (stallWatchdogRef.current) clearTimeout(stallWatchdogRef.current);
    } else {
      isManuallyPausedRef.current = false;
      videoRef.current.play().catch(console.error);
    }
    keepControlsVisible();
  };

  // Enter / Exit Fullscreen (Dual-mode: Native API + CSS pseudo-fullscreen fallback)
  const enterFullscreen = async () => {
    const el = containerRef.current;
    if (!el) return;

    let nativeSuccess = false;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen();
        nativeSuccess = true;
      } else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen();
        nativeSuccess = true;
      }
    } catch (err) {
      console.warn('Native fullscreen not permitted, activating responsive pseudo-fullscreen:', err);
    }

    if (!nativeSuccess) {
      setIsPseudoFs(true);
      document.body.style.overflow = 'hidden';
    }

    if (screen.orientation && 'lock' in screen.orientation) {
      try {
        await (screen.orientation as any).lock('landscape');
      } catch {}
    }

    try {
      window.history.pushState({ reneeTvFullscreen: true }, '');
    } catch {}

    keepControlsVisible();
  };

  const exitFullscreen = async () => {
    if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        }
      } catch (err) {
        console.warn('Native exit fullscreen error:', err);
      }
    }

    if (isPseudoFs) {
      setIsPseudoFs(false);
      document.body.style.overflow = '';
    }

    if (screen.orientation && 'unlock' in screen.orientation) {
      try {
        (screen.orientation as any).unlock();
      } catch {}
    }

    if (window.history.state?.reneeTvFullscreen) {
      window.history.back();
    }

    keepControlsVisible();
  };

  const handleToggleFullscreen = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (isNativeFs || isPseudoFs || (isLandscape && isMobileDevice)) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  };

  // Picture in picture
  const handleTogglePiP = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP not supported or rejected:', err);
    }
    keepControlsVisible();
  };

  // Switch quality level
  const handleSelectQuality = (index: number) => {
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
      setCurrentLevelIndex(index);
      setShowQualityMenu(false);
    }
    keepControlsVisible();
  };

  // Retry action (resets stream)
  const handleRetry = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    initializeStream();
    keepControlsVisible();
  };

  // Next and Previous Handlers with HUD trigger
  const handleTriggerNext = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (onNextChannel) {
      onNextChannel();
      triggerChannelHud('next');
    }
    keepControlsVisible();
  };

  const handleTriggerPrev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (onPrevChannel) {
      onPrevChannel();
      triggerChannelHud('prev');
    }
    keepControlsVisible();
  };

  // -------------------------------------------------------------
  // Touch Gestures: Left / Right Swipe for Channel Navigation
  // Tap to show/hide controls (with 3-second auto-hide)
  // -------------------------------------------------------------
  const handleTouchStart = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, a, [role="button"], .no-gesture')) {
      touchStartRef.current = null;
      isInteractingWithControlsRef.current = true;
      return;
    }

    isInteractingWithControlsRef.current = false;
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
    touchMovedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      touchMovedRef.current = true;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    const isHorizontalSwipe = absX >= 60 && absX > absY * 1.5 && elapsed < 750;

    if (isHorizontalSwipe) {
      if (deltaX < 0) {
        handleTriggerNext();
      } else {
        handleTriggerPrev();
      }
      return;
    }

    // Tap Detection: < 15px displacement, < 350ms duration
    if (absX < 15 && absY < 15 && elapsed < 350) {
      if (showControls) {
        setShowControls(false);
        setShowQualityMenu(false);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      } else {
        setShowControls(true);
        scheduleControlsHide();
      }
    }
  };

  const handleTouchCancel = () => {
    touchStartRef.current = null;
    touchMovedRef.current = false;
  };

  return (
    <div className="w-full">
      {/* Player Container */}
      <div
        ref={containerRef}
        onMouseMove={keepControlsVisible}
        onMouseLeave={() => isPlaying && setShowControls(false)}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        className={`relative w-full bg-black select-none group transition-all duration-300 overflow-hidden ${
          isEffectivelyFullscreen
            ? 'fixed inset-0 z-50 w-screen h-screen rounded-none border-none'
            : theaterMode
            ? 'aspect-[21/9] max-h-[78vh] rounded-xl sm:rounded-2xl border border-white/[0.08] shadow-2xl'
            : 'aspect-video max-h-[680px] rounded-xl sm:rounded-2xl border border-white/[0.08] shadow-2xl'
        }`}
      >
        {/* Main Video Element */}
        <video
          ref={videoRef}
          playsInline
          webkit-playsinline="true"
          x5-playsinline="true"
          className={`w-full h-full bg-black transition-all duration-200 pointer-events-none ${
            aspectRatio === 'fill'
              ? 'object-cover'
              : aspectRatio === '16:9'
              ? 'aspect-video object-contain'
              : 'object-contain'
          }`}
        />

        {/* Channel HUD Overlay on Swipe / Channel Switch */}
        {channelHud && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 transition-all duration-300 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3.5 px-5 py-3.5 rounded-2xl bg-black/90 backdrop-blur-md border border-white/20 shadow-2xl shadow-black/80">
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 p-1 flex items-center justify-center shrink-0">
                {channelHud.logoUrl ? (
                  <img
                    src={channelHud.logoUrl}
                    alt={channelHud.channelName}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <img src="/reneetv-logo.png" alt="ReneeTV" className="w-full h-full object-contain" />
                )}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  {channelHud.direction === 'prev' ? (
                    <span className="text-[10px] uppercase font-mono text-rose-400 font-bold flex items-center gap-1">
                      <ChevronLeft className="w-3 h-3" /> PREVIOUS CHANNEL
                    </span>
                  ) : channelHud.direction === 'next' ? (
                    <span className="text-[10px] uppercase font-mono text-rose-400 font-bold flex items-center gap-1">
                      NEXT CHANNEL <ChevronRight className="w-3 h-3" />
                    </span>
                  ) : (
                    <span className="text-[10px] uppercase font-mono text-rose-400 font-bold">
                      NOW PLAYING
                    </span>
                  )}

                  {channelHud.channelIndex !== undefined && channelHud.totalChannels !== undefined && (
                    <span className="text-[10px] font-mono text-slate-400">
                      #{channelHud.channelIndex + 1}/{channelHud.totalChannels}
                    </span>
                  )}
                </div>

                <div className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {channelHud.channelName}
                </div>

                <div className="text-xs text-slate-400">
                  {channelHud.category}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Large Touch Navigation Arrows (Left & Right Flanks) */}
        <div
          className={`absolute inset-y-0 left-0 flex items-center pl-2 sm:pl-4 transition-opacity duration-300 pointer-events-none z-20 ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {onPrevChannel && (
            <button
              onClick={handleTriggerPrev}
              title="Previous Channel"
              aria-label="Previous Channel"
              className="pointer-events-auto min-w-[44px] min-h-[44px] p-2.5 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 border border-white/10 text-white/80 hover:text-white backdrop-blur-md transition-all shadow-lg cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
        </div>

        <div
          className={`absolute inset-y-0 right-0 flex items-center pr-2 sm:pr-4 transition-opacity duration-300 pointer-events-none z-20 ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {onNextChannel && (
            <button
              onClick={handleTriggerNext}
              title="Next Channel"
              aria-label="Next Channel"
              className="pointer-events-auto min-w-[44px] min-h-[44px] p-2.5 rounded-full bg-black/60 hover:bg-black/80 active:scale-95 border border-white/10 text-white/80 hover:text-white backdrop-blur-md transition-all shadow-lg cursor-pointer"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* Top Floating Channel Info Scrim (Safe Area Responsive) */}
        <div
          className={`absolute top-0 left-0 right-0 p-3 sm:p-5 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] bg-gradient-to-b from-black/90 via-black/40 to-transparent flex items-center justify-between transition-opacity duration-300 z-20 ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
            {channel?.logoUrl ? (
              <img
                src={channel.logoUrl}
                alt={channel.name}
                referrerPolicy="no-referrer"
                className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg bg-black/60 p-1 object-contain border border-white/10 shrink-0"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-8 h-8 sm:w-11 sm:h-11 rounded-lg bg-rose-950/80 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-xs sm:text-sm shrink-0">
                {channel?.name?.substring(0, 2).toUpperCase() || 'TV'}
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-lg font-bold text-white tracking-tight drop-shadow-md truncate">
                  {channel?.name || 'Select a Channel'}
                </h1>
                {channel?.isDemo && (
                  <span className="hidden sm:inline-block text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0">
                    Demo
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs text-slate-300">
                <span className="text-rose-400 font-medium">{channel?.category || 'Live TV'}</span>
                {channel?.resolution && (
                  <>
                    <span aria-hidden="true" className="text-slate-500">·</span>
                    <span className="font-mono text-slate-400">{channel.resolution}</span>
                  </>
                )}
                {channel?.currentProgram && (
                  <>
                    <span aria-hidden="true" className="text-slate-500 hidden sm:inline">·</span>
                    <span className="truncate max-w-[140px] sm:max-w-md text-slate-300 hidden sm:inline">
                      {channel.currentProgram}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Live Indicator, Diagnostics (Admin Only), Fullscreen Toggle */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-600/90 text-white font-mono text-[11px] sm:text-xs font-bold tracking-wider uppercase shadow-lg shadow-rose-900/50">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              <span>LIVE</span>
            </div>

            {/* Diagnostics only visible to authorized administrators */}
            {isAdminAuthenticated && (
              <button
                onClick={() => setShowDiagnostics(true)}
                title="Admin Diagnostics"
                aria-label="Admin Diagnostics"
                className="min-w-[36px] min-h-[36px] p-2 rounded-lg bg-black/50 hover:bg-black/75 text-slate-300 hover:text-white border border-white/10 transition-colors cursor-pointer flex items-center justify-center"
              >
                <Info className="w-4 h-4" />
              </button>
            )}

            {isEffectivelyFullscreen && (
              <button
                onClick={handleToggleFullscreen}
                title="Exit Fullscreen"
                aria-label="Exit Fullscreen"
                className="min-w-[36px] min-h-[36px] p-2 rounded-lg bg-black/50 hover:bg-black/75 text-white border border-white/10 transition-colors cursor-pointer flex items-center justify-center"
              >
                <Minimize className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Unmute Device Audio Banner (Only if browser restricted unmuted autoplay before first tap) */}
        {isAutoplayMuted && !isLoading && !allChannelsFailed && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (videoRef.current) {
                videoRef.current.muted = false;
                videoRef.current.volume = 1.0;
              }
              setIsAutoplayMuted(false);
            }}
            className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-30 cursor-pointer animate-pulse"
          >
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-rose-600/95 hover:bg-rose-500 text-white text-xs font-semibold shadow-2xl shadow-rose-950/80 border border-white/20 active:scale-95 transition-all">
              <Volume2 className="w-4 h-4" />
              <span>Kliko këtu për të hapur zërin</span>
            </div>
          </div>
        )}

        {/* Clean, Non-Technical Loading & Auto-Recovery Indicator */}
        {isLoading && !allChannelsFailed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs pointer-events-none z-10 transition-opacity">
            <div className="w-11 h-11 border-3 border-rose-500/20 border-t-rose-500 rounded-full animate-spin mb-3 shadow-lg" />
            <span className="text-xs font-mono text-slate-200 tracking-wider">
              DUKE KËRKUAR TRANSMETIM...
            </span>
            {isRecoveryMode && (
              <span className="text-[11px] text-slate-400 mt-1 font-sans">
                Po lidhemi me kanalin vijues...
              </span>
            )}
          </div>
        )}

        {/* Friendly Screen When All Channels Fail (Never Technical Errors) */}
        {allChannelsFailed && (
          <div className="absolute inset-0 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center z-30 animate-in fade-in">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-rose-500 mb-4 shadow-xl">
              <Tv className="w-7 h-7" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white mb-2">
              Transmetimi nuk është aktualisht i disponueshëm
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-sm mb-6 leading-relaxed">
              Ju lutemi provoni përsëri pas pak ose zgjidhni një kanal tjetër nga lista.
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onRetryAll}
                className="flex items-center gap-2 min-h-[42px] px-5 py-2.5 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-lg shadow-rose-950/40 transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Provo Përsëri</span>
              </button>
            </div>
          </div>
        )}

        {/* Big Center Play Button when paused */}
        {!isPlaying && !isLoading && !allChannelsFailed && (
          <div
            onClick={handleTogglePlay}
            className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer transition-opacity z-10"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-rose-600/95 text-white flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-transform">
              <Play className="w-8 h-8 sm:w-10 sm:h-10 ml-1 fill-white" />
            </div>
          </div>
        )}

        {/* Bottom Custom Controls Bar (Mobile-Optimized & Safe-Area Aware) */}
        <div
          className={`absolute bottom-0 left-0 right-0 p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] bg-gradient-to-t from-black/95 via-black/60 to-transparent flex items-center justify-between gap-2 sm:gap-4 transition-opacity duration-300 z-20 ${
            showControls || !isPlaying ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Left Controls: Prev Channel, Play/Pause, Next Channel, Reconnect */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {onPrevChannel && (
              <button
                onClick={handleTriggerPrev}
                title="Previous Channel"
                aria-label="Previous Channel"
                className="min-w-[40px] min-h-[40px] p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
              >
                <SkipBack className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              </button>
            )}

            <button
              onClick={handleTogglePlay}
              className="min-w-[40px] min-h-[40px] p-2 text-white hover:text-rose-400 rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </button>

            {onNextChannel && (
              <button
                onClick={handleTriggerNext}
                title="Next Channel"
                aria-label="Next Channel"
                className="min-w-[40px] min-h-[40px] p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
              >
                <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 fill-current" />
              </button>
            )}

            <button
              onClick={handleRetry}
              title="Reconnect Stream"
              aria-label="Reconnect Stream"
              className="min-w-[40px] min-h-[40px] p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 active:scale-95 transition-all cursor-pointer flex items-center justify-center"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* Live Broadcast Indicator */}
            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono ml-1 sm:ml-2">
              <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
              <span className="hidden sm:inline">LIVE</span>
            </div>
          </div>

          {/* Right Controls: Quality, Aspect, PiP, Theater, Fullscreen */}
          <div className="flex items-center gap-1 sm:gap-2 relative">
            {/* Quality Selector */}
            {qualityLevels.length > 0 && (
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQualityMenu(!showQualityMenu);
                    keepControlsVisible();
                  }}
                  title="Stream Quality"
                  className="min-w-[38px] min-h-[38px] flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-mono font-medium transition-colors cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5 text-rose-400" />
                  <span className="hidden sm:inline">
                    {currentLevelIndex === -1
                      ? 'Auto'
                      : qualityLevels[currentLevelIndex]?.name || 'Auto'}
                  </span>
                </button>

                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-2 w-36 bg-[#161926] border border-white/10 rounded-lg shadow-2xl py-1 text-xs font-mono z-30">
                    <button
                      onClick={() => handleSelectQuality(-1)}
                      className={`w-full text-left px-3 py-1.5 hover:bg-white/10 transition-colors cursor-pointer ${
                        currentLevelIndex === -1 ? 'text-rose-400 font-bold' : 'text-slate-300'
                      }`}
                    >
                      Auto (Adaptive)
                    </button>
                    {qualityLevels.map((lvl) => (
                      <button
                        key={lvl.id}
                        onClick={() => handleSelectQuality(lvl.id)}
                        className={`w-full text-left px-3 py-1.5 hover:bg-white/10 transition-colors cursor-pointer ${
                          currentLevelIndex === lvl.id ? 'text-rose-400 font-bold' : 'text-slate-300'
                        }`}
                      >
                        {lvl.name} ({(lvl.bitrate / 1000).toFixed(0)}k)
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Aspect Ratio Switcher */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setAspectRatio((prev) =>
                  prev === 'contain' ? 'fill' : prev === 'fill' ? '16:9' : 'contain'
                );
                keepControlsVisible();
              }}
              title="Toggle Aspect Fit / Fill"
              aria-label="Toggle Aspect Ratio"
              className="min-w-[38px] min-h-[38px] px-2 py-1 text-[11px] font-mono text-slate-300 hover:text-white rounded-lg bg-white/10 hover:bg-white/20 transition-colors cursor-pointer flex items-center justify-center uppercase"
            >
              {aspectRatio === 'contain' ? 'Fit' : aspectRatio === 'fill' ? 'Fill' : '16:9'}
            </button>

            {/* Picture in Picture */}
            <button
              onClick={handleTogglePiP}
              title="Picture in Picture"
              aria-label="Picture in Picture"
              className="min-w-[38px] min-h-[38px] p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center"
            >
              <PictureInPicture2 className="w-4 h-4" />
            </button>

            {/* Theater Mode (desktop only) */}
            {onToggleTheaterMode && !isEffectivelyFullscreen && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleTheaterMode();
                }}
                title="Theater Mode"
                aria-label="Theater Mode"
                className="hidden md:flex min-w-[38px] min-h-[38px] p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer items-center justify-center"
              >
                {theaterMode ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
              </button>
            )}

            {/* Fullscreen Button */}
            <button
              onClick={handleToggleFullscreen}
              title={isEffectivelyFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              aria-label={isEffectivelyFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              className="min-w-[40px] min-h-[40px] p-2 text-white hover:text-rose-400 rounded-lg hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center"
            >
              {isEffectivelyFullscreen ? (
                <Minimize className="w-5 h-5 text-rose-400" />
              ) : (
                <Maximize className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Diagnostics Modal (Available only to authenticated administrator) */}
      {channel && isAdminAuthenticated && (
        <StreamDiagnosticsModal
          channel={channel}
          stats={stats}
          qualityLevels={qualityLevels}
          currentLevelIndex={currentLevelIndex}
          isOpen={showDiagnostics}
          onClose={() => setShowDiagnostics(false)}
          recoveryLog={recoveryLog}
        />
      )}
    </div>
  );
};
