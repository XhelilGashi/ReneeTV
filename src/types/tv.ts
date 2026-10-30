/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Category =
  | 'All'
  | 'Kosovo'
  | 'Albania'
  | 'Germany'
  | 'News'
  | 'Sports'
  | 'Movies'
  | 'Other';

export interface Channel {
  id: string;
  name: string;
  streamUrl: string;
  backupStreamUrl?: string;
  logoUrl?: string;
  category: Category;
  groupTitle?: string;
  tvgId?: string;
  enabled: boolean;
  isDemo?: boolean;
  resolution?: string;
  currentProgram?: string;
  description?: string;
  order: number;
  addedAt?: string;
}

export interface StreamQualityLevel {
  id: number;
  height: number;
  width: number;
  bitrate: number;
  name: string;
}

export interface PlayerStats {
  resolution?: string;
  bitrate?: number;
  bufferedEnd?: number;
  currentTime?: number;
  droppedFrames?: number;
  bandwidthEstimate?: number;
  audioTrackCount?: number;
  isHlsSupported: boolean;
  usingNativeHls: boolean;
}

export type StreamErrorType =
  | 'NETWORK_ERROR'
  | 'MEDIA_ERROR'
  | 'CORS_ERROR'
  | 'UNSUPPORTED_FORMAT'
  | 'PLAYBACK_ERROR'
  | 'UNKNOWN';

export interface StreamErrorInfo {
  type: StreamErrorType;
  message: string;
  details?: string;
  fatal: boolean;
}

export interface AdminAuthResponse {
  authenticated: boolean;
  requiresSetup: boolean;
  token?: string;
  message?: string;
}

export interface M3UImportOptions {
  mode: 'replace' | 'append';
  defaultCategory?: Category;
  autoDetectCategory: boolean;
  onlyValidUrls: boolean;
}

export interface StreamValidationResult {
  valid: boolean;
  error?: string;
  statusCode?: number;
  contentType?: string;
  normalizedUrl?: string;
  finalUrl?: string;
  playlistType?: string;
  targetDuration?: number;
  mediaSequence?: number;
  segmentCount?: number;
  variantCount?: number;
}

export interface RecoveryLogEntry {
  channelId: string;
  channelName: string;
  timestamp: string;
  reason: string;
  cycleIndex?: number;
}

