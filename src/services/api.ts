/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Channel, StreamValidationResult } from '../types/tv';
import { DEFAULT_DEMO_CHANNELS } from '../data/defaultChannels';

const STORAGE_CHANNELS_KEY = 'reneatv_channels_v1';
const STORAGE_TOKEN_KEY = 'reneatv_admin_token';
const STORAGE_FAVORITES_KEY = 'reneatv_favorites';

export class ApiService {
  private static adminToken: string | null = localStorage.getItem(STORAGE_TOKEN_KEY);

  static getAdminToken(): string | null {
    return this.adminToken;
  }

  static setAdminToken(token: string | null) {
    this.adminToken = token;
    if (token) {
      localStorage.setItem(STORAGE_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_TOKEN_KEY);
    }
  }

  // Load public channels
  static async getChannels(): Promise<Channel[]> {
    try {
      const res = await fetch('/api/channels');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.channels) && data.channels.length > 0) {
          localStorage.setItem(STORAGE_CHANNELS_KEY, JSON.stringify(data.channels));
          return data.channels;
        }
      }
    } catch (err) {
      console.warn('Backend unavailable, trying local fallback:', err);
    }

    // Fallback to localStorage or default demo channels
    const cached = localStorage.getItem(STORAGE_CHANNELS_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      } catch {
        // ignore
      }
    }

    return DEFAULT_DEMO_CHANNELS;
  }

  // Check admin auth status
  static async checkAdminStatus(): Promise<{ configured: boolean; requiresSetup: boolean; authenticated: boolean }> {
    let configured = true;
    let requiresSetup = false;

    try {
      const res = await fetch('/api/admin/auth/status');
      if (res.ok) {
        const data = await res.json();
        configured = data.configured;
        requiresSetup = data.requiresSetup;
      }
    } catch {
      // offline fallback
      const localSetup = localStorage.getItem('reneatv_admin_passcode');
      configured = !!localSetup;
      requiresSetup = !localSetup;
    }

    // Check token validity if present
    let authenticated = false;
    if (this.adminToken) {
      try {
        const verifyRes = await fetch('/api/admin/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: this.adminToken }),
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          authenticated = !!verifyData.valid;
        }
      } catch {
        // offline check: token exists
        authenticated = true;
      }
    }

    return { configured, requiresSetup, authenticated };
  }

  // Setup initial admin password
  static async setupAdmin(password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/admin/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to setup admin credentials' };
      }
      this.setAdminToken(data.token);
      return { success: true };
    } catch (err: any) {
      // Fallback for standalone preview
      localStorage.setItem('reneatv_admin_passcode', password);
      const fakeToken = 'offline-token-' + Date.now();
      this.setAdminToken(fakeToken);
      return { success: true };
    }
  }

  // Login admin
  static async loginAdmin(password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Invalid credentials' };
      }
      this.setAdminToken(data.token);
      return { success: true };
    } catch (err: any) {
      const localPass = localStorage.getItem('reneatv_admin_passcode');
      if (localPass && localPass === password) {
        const fakeToken = 'offline-token-' + Date.now();
        this.setAdminToken(fakeToken);
        return { success: true };
      }
      return { success: false, error: 'Authentication failed. Please verify passcode.' };
    }
  }

  // Logout admin
  static async logoutAdmin(): Promise<void> {
    if (this.adminToken) {
      try {
        await fetch('/api/admin/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.adminToken}` },
        });
      } catch {
        // ignore
      }
    }
    this.setAdminToken(null);
  }

  // Admin get all channels
  static async getAdminChannels(): Promise<Channel[]> {
    if (!this.adminToken) {
      throw new Error('Not authenticated');
    }

    try {
      const res = await fetch('/api/admin/channels', {
        headers: { Authorization: `Bearer ${this.adminToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        return data.channels;
      }
    } catch {
      // ignore
    }

    return this.getChannels();
  }

  // Admin save channels persistently
  static async saveChannels(channels: Channel[]): Promise<{ success: boolean; error?: string }> {
    // Keep local cache updated immediately
    localStorage.setItem(STORAGE_CHANNELS_KEY, JSON.stringify(channels));

    if (!this.adminToken) {
      return { success: true }; // offline saved
    }

    try {
      const res = await fetch('/api/admin/channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.adminToken}`,
        },
        body: JSON.stringify({ channels }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Failed to persist channels on server' };
      }
      return { success: true };
    } catch (err: any) {
      console.warn('Backend save failed, saved to local cache:', err);
      return { success: true }; // Still successful locally
    }
  }

  // Fetch M3U playlist via server-side proxy
  static async fetchRemoteM3U(url: string): Promise<{ success: boolean; content?: string; error?: string }> {
    if (!this.adminToken) {
      return { success: false, error: 'Admin authentication required to fetch remote playlists' };
    }

    try {
      const res = await fetch('/api/admin/fetch-m3u', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.adminToken}`,
        },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `Server responded with ${res.status}` };
      }

      return { success: true, content: data.content };
    } catch (err: any) {
      // Attempt direct fetch as a fallback if proxy fails or in client-only mode
      try {
        const directRes = await fetch(url);
        if (directRes.ok) {
          const text = await directRes.text();
          return { success: true, content: text };
        }
      } catch {
        // Direct fetch failed
      }
      return {
        success: false,
        error: `Could not load playlist from ${url}. Check CORS or network permissions: ${err.message}`,
      };
    }
  }

  // Validate M3U8 HLS stream manifest
  static async validateStreamUrl(url: string): Promise<StreamValidationResult> {
    if (!url || typeof url !== 'string' || !url.trim()) {
      return { valid: false, error: 'Please enter a stream URL to validate' };
    }

    try {
      const res = await fetch('/api/admin/validate-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.adminToken}`,
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await res.json();
      return data;
    } catch (err: any) {
      // Fallback check
      return {
        valid: false,
        error: `Validation request failed: ${err.message || 'Could not reach server validator'}`,
      };
    }
  }

  // Check and clean offline channels
  static async cleanOfflineChannels(action: 'remove' | 'disable' | 'check' = 'remove'): Promise<{
    success: boolean;
    total?: number;
    onlineCount?: number;
    offlineCount?: number;
    remainingChannels?: Channel[];
    error?: string;
  }> {
    if (!this.adminToken) {
      return { success: false, error: 'Admin authentication required' };
    }

    try {
      const res = await fetch('/api/admin/clean-offline-channels', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.adminToken}`,
        },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Server health check failed' };
      }

      if (data.remainingChannels) {
        localStorage.setItem(STORAGE_CHANNELS_KEY, JSON.stringify(data.remainingChannels));
      }

      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Offline cleanup request failed' };
    }
  }

  // User Favorites management
  static getFavorites(): string[] {
    try {
      const favs = localStorage.getItem(STORAGE_FAVORITES_KEY);
      return favs ? JSON.parse(favs) : [];
    } catch {
      return [];
    }
  }

  static toggleFavorite(channelId: string): string[] {
    const current = this.getFavorites();
    const next = current.includes(channelId)
      ? current.filter((id) => id !== channelId)
      : [...current, channelId];
    localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(next));
    return next;
  }
}
