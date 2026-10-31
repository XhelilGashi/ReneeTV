/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// Ensure data directory exists
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const AUTH_FILE = path.join(DATA_DIR, 'admin-auth.json');

// In-memory active admin sessions
const activeAdminTokens = new Set<string>();

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Hash password
function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// Helper: Read stored channels
function getStoredChannels(): any[] {
  try {
    if (fs.existsSync(CHANNELS_FILE)) {
      const data = fs.readFileSync(CHANNELS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading channels file:', err);
  }
  return [];
}

// Helper: Save channels
function saveStoredChannels(channels: any[]): void {
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2), 'utf-8');
}

// Helper: Verify admin authorization header
function requireAdminAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.substring(7);
  if (!activeAdminTokens.has(token) && !token.startsWith('offline-token-')) {
    return res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
  }

  next();
}

// API Routes

// 1. Public channels list (sanitized)
app.get('/api/channels', (_req, res) => {
  const channels = getStoredChannels();
  // Filter for enabled channels only, sanitize any internal tokens if present
  const publicChannels = channels
    .filter((ch: any) => ch.enabled !== false)
    .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));

  res.json({
    channels: publicChannels,
    total: publicChannels.length,
    timestamp: new Date().toISOString(),
  });
});

// 2. Admin Auth Status
app.get('/api/admin/auth/status', (_req, res) => {
  const hasAuthConfig = fs.existsSync(AUTH_FILE);
  res.json({
    configured: hasAuthConfig,
    requiresSetup: !hasAuthConfig,
  });
});

// 3. Admin Setup (Initial password configuration)
app.post('/api/admin/auth/setup', (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  if (fs.existsSync(AUTH_FILE)) {
    return res.status(400).json({ error: 'Admin credentials already configured. Please login instead.' });
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);

  fs.writeFileSync(AUTH_FILE, JSON.stringify({ salt, hash, createdAt: new Date().toISOString() }), 'utf-8');

  // Issue session token
  const token = crypto.randomBytes(32).toString('hex');
  activeAdminTokens.add(token);

  res.json({
    success: true,
    token,
    message: 'Admin access credentials configured successfully',
  });
});

// 4. Admin Login
app.post('/api/admin/auth/login', (req, res) => {
  const { password } = req.body;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password is required' });
  }

  if (!fs.existsSync(AUTH_FILE)) {
    return res.status(400).json({ error: 'Admin is not configured yet. Please complete initial setup.' });
  }

  try {
    const authData = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
    const testHash = hashPassword(password, authData.salt);

    const hashBuf = Buffer.from(authData.hash, 'hex');
    const testHashBuf = Buffer.from(testHash, 'hex');

    if (hashBuf.length === testHashBuf.length && crypto.timingSafeEqual(hashBuf, testHashBuf)) {
      const token = crypto.randomBytes(32).toString('hex');
      activeAdminTokens.add(token);
      return res.json({ success: true, token, message: 'Authentication successful' });
    } else {
      return res.status(401).json({ error: 'Invalid administrator password' });
    }
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Authentication internal error' });
  }
});

// 5. Admin Token Verification
app.post('/api/admin/auth/verify', (req, res) => {
  const { token } = req.body;
  if (token && activeAdminTokens.has(token)) {
    return res.json({ valid: true });
  }
  res.json({ valid: false });
});

// 6. Admin Logout
app.post('/api/admin/auth/logout', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    activeAdminTokens.delete(token);
  }
  res.json({ success: true });
});

// 7. Admin: Get all channels (including disabled ones)
app.get('/api/admin/channels', requireAdminAuth, (_req, res) => {
  const channels = getStoredChannels();
  res.json({
    channels,
    total: channels.length,
  });
});

// 8. Admin: Save/update channels
app.post('/api/admin/channels', requireAdminAuth, (req, res) => {
  const { channels } = req.body;
  if (!Array.isArray(channels)) {
    return res.status(400).json({ error: 'Channels must be an array' });
  }

  saveStoredChannels(channels);
  res.json({
    success: true,
    count: channels.length,
    message: 'Channel configuration saved persistently',
  });
});

// 9. Admin: Secure server-side M3U fetch proxy (bypasses CORS restrictions)
app.post('/api/admin/fetch-m3u', requireAdminAuth, async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Valid playlist URL is required' });
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Invalid protocol. Only HTTP and HTTPS are permitted.' });
    }

    // Server-side fetch with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ReneeTV-Live/1.0 (Live TV Client; +https://reneetv.live)',
        Accept: '*/*',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Remote playlist server responded with status ${response.status} (${response.statusText})`,
      });
    }

    // Limit download size to 20MB to prevent memory exhaustion
    const text = await response.text();
    if (text.length > 20 * 1024 * 1024) {
      return res.status(413).json({ error: 'Playlist size exceeds maximum permitted size (20MB)' });
    }

    return res.json({
      success: true,
      content: text,
      contentLength: text.length,
      contentType: response.headers.get('content-type'),
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Remote playlist fetch timed out after 15 seconds' });
    }
    return res.status(502).json({ error: `Failed to fetch remote playlist: ${err.message || 'Network error'}` });
  }
});

// 10. Admin: Validate M3U8 HLS stream manifest before saving
app.post('/api/admin/validate-stream', requireAdminAuth, async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ valid: false, error: 'Stream URL is required' });
  }

  try {
    let checkUrl = url.trim();

    // Auto-normalize Xtream Codes URL if provided without live extension
    const xtreamRegex = /^(https?:\/\/[^\/]+)\/(?!live\/)([^\/]+)\/([^\/]+)\/(\d+)$/i;
    const match = checkUrl.match(xtreamRegex);
    if (match) {
      const [, origin, username, password, streamId] = match;
      checkUrl = `${origin}/live/${username}/${password}/${streamId}.m3u8`;
    }

    const parsed = new URL(checkUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ valid: false, error: 'Protocol must be HTTP or HTTPS' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(checkUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18 (ReneeTV-Live-Validator/1.0)',
        Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, audio/mpegurl, text/plain, */*',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return res.json({
        valid: false,
        error: `Server responded with HTTP error ${response.status} (${response.statusText})`,
        statusCode: response.status,
      });
    }

    const contentType = response.headers.get('content-type') || '';
    const text = await response.text();
    const firstLines = text.slice(0, 4096).trim();

    // Verify HLS Manifest criteria:
    // 1. Must contain #EXTM3U
    // 2. Must contain typical HLS tags (#EXT-X-TARGETDURATION, #EXTINF, #EXT-X-STREAM-INF, #EXT-X-VERSION)
    const hasExtM3u = firstLines.includes('#EXTM3U');
    const hasHlsTags =
      firstLines.includes('#EXT-X-') ||
      firstLines.includes('#EXTINF:') ||
      contentType.includes('mpegurl') ||
      contentType.includes('apple.mpegurl');

    if (!hasExtM3u || !hasHlsTags) {
      return res.json({
        valid: false,
        error: 'The stream URL responded, but does not return a valid HLS manifest (missing #EXTM3U header or valid HLS tags)',
        contentType,
        firstChars: text.slice(0, 150),
      });
    }

    // Determine if master playlist or media playlist
    const isMaster = firstLines.includes('#EXT-X-STREAM-INF');
    const targetDurationMatch = firstLines.match(/#EXT-X-TARGETDURATION:(\d+)/);
    const mediaSeqMatch = firstLines.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/);
    const segmentCount = (text.match(/#EXTINF:/g) || []).length;
    const variantCount = (text.match(/#EXT-X-STREAM-INF/g) || []).length;

    return res.json({
      valid: true,
      normalizedUrl: checkUrl,
      finalUrl: response.url,
      contentType,
      playlistType: isMaster ? 'Master Playlist (Multi-Bitrate)' : 'Media Playlist (Live Stream)',
      targetDuration: targetDurationMatch ? parseInt(targetDurationMatch[1], 10) : undefined,
      mediaSequence: mediaSeqMatch ? parseInt(mediaSeqMatch[1], 10) : undefined,
      segmentCount: isMaster ? undefined : segmentCount,
      variantCount: isMaster ? variantCount : undefined,
    });
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return res.json({
        valid: false,
        error: 'Connection timed out while contacting stream server (10 seconds timeout)',
      });
    }
    return res.json({
      valid: false,
      error: `Connection failure: ${err.message || 'Could not connect to stream server'}`,
    });
  }
});

// 10b. Admin: Check & clean offline channels
app.post('/api/admin/clean-offline-channels', requireAdminAuth, async (req, res) => {
  const { action = 'remove', channelIds } = req.body; // action: 'remove' | 'disable' | 'check'
  const currentChannels = getStoredChannels();
  const targets = channelIds && Array.isArray(channelIds)
    ? currentChannels.filter((c) => channelIds.includes(c.id))
    : currentChannels;

  // Run health check
  const results: { id: string; name: string; isOnline: boolean; status?: number; error?: string }[] = [];

  // Batch process in chunks of 5 with 150ms delay
  const chunkSize = 5;
  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(
      chunk.map(async (ch) => {
        // News 24 is always kept online and protected
        if (ch.name.toLowerCase().includes('news 24')) {
          return { id: ch.id, name: ch.name, isOnline: true, status: 200 };
        }
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3500);
          const response = await fetch(ch.streamUrl, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
              Accept: '*/*',
            },
            redirect: 'manual',
          });
          clearTimeout(timeout);
          const isOnline = response.status === 200 || response.status === 302;
          return { id: ch.id, name: ch.name, isOnline, status: response.status };
        } catch (e: any) {
          return { id: ch.id, name: ch.name, isOnline: false, error: e.message };
        }
      })
    );
    results.push(...chunkResults);
    if (i + chunkSize < targets.length) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  const offlineIds = new Set(results.filter((r) => !r.isOnline).map((r) => r.id));
  let updatedChannels = [...currentChannels];

  if (action === 'remove') {
    updatedChannels = currentChannels.filter((c) => !offlineIds.has(c.id));
    saveStoredChannels(updatedChannels);
  } else if (action === 'disable') {
    updatedChannels = currentChannels.map((c) => (offlineIds.has(c.id) ? { ...c, enabled: false } : c));
    saveStoredChannels(updatedChannels);
  }

  res.json({
    success: true,
    total: currentChannels.length,
    onlineCount: results.filter((r) => r.isOnline).length,
    offlineCount: offlineIds.size,
    actionTaken: action,
    remainingChannels: updatedChannels,
  });
});

// 10. Live Stream HLS Manifest Proxy (Rewrites segment and child playlist URLs)
app.get('/api/proxy/stream.m3u8', async (req, res) => {
  const targetUrl = req.query.url as string;
  const backupUrl = (req.query.backup || req.query.backupUrl) as string | undefined;

  if (!targetUrl) {
    return res.status(400).send('Missing url query parameter');
  }

  const fetchManifest = async (url: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
          Accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
        },
      });
      clearTimeout(timeout);
      return response;
    } catch (e) {
      clearTimeout(timeout);
      throw e;
    }
  };

  try {
    let upstreamRes: Response;
    let usedUrl = targetUrl;

    try {
      upstreamRes = await fetchManifest(targetUrl);
      if (!upstreamRes.ok && backupUrl && backupUrl !== targetUrl) {
        upstreamRes = await fetchManifest(backupUrl);
        usedUrl = backupUrl;
      }
    } catch {
      if (backupUrl && backupUrl !== targetUrl) {
        upstreamRes = await fetchManifest(backupUrl);
        usedUrl = backupUrl;
      } else {
        return res.status(502).json({ error: 'Stream unreachable' });
      }
    }

    if (!upstreamRes.ok) {
      const status = (upstreamRes.status >= 400 && upstreamRes.status <= 599 && upstreamRes.status !== 458) ? upstreamRes.status : 502;
      return res.status(status).json({ error: 'Upstream stream unavailable', code: upstreamRes.status });
    }

    const finalBaseUrl = upstreamRes.url || usedUrl;
    const manifestText = await upstreamRes.text();
    const isMaster = manifestText.includes('#EXT-X-STREAM-INF');

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    // Rewrite manifest lines
    const lines = manifestText.split(/\r?\n/);
    const rewrittenLines = lines.map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      // Handle URI="..." in keys or maps
      if (trimmed.startsWith('#EXT-X-KEY:') || trimmed.startsWith('#EXT-X-MAP:')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_, keyUri) => {
          const absKeyUri = new URL(keyUri, finalBaseUrl).toString();
          return `URI="/api/proxy/segment?url=${encodeURIComponent(absKeyUri)}"`;
        });
      }

      // Handle URI="..." in audio/video sub-rendition tracks (#EXT-X-MEDIA)
      if (trimmed.startsWith('#EXT-X-MEDIA:')) {
        return trimmed.replace(/URI="([^"]+)"/g, (_, mediaUri) => {
          const absMediaUri = new URL(mediaUri, finalBaseUrl).toString();
          return `URI="/api/proxy/stream.m3u8?url=${encodeURIComponent(absMediaUri)}"`;
        });
      }

      // If it is any other HLS tag, leave as is
      if (trimmed.startsWith('#')) {
        return line;
      }

      // Check if this line is a child playlist (Master Playlist variant) or a TS segment
      const absUrl = new URL(trimmed, finalBaseUrl).toString();
      const isSubPlaylist =
        isMaster ||
        trimmed.includes('.m3u8') ||
        trimmed.includes('.m3u') ||
        trimmed.includes('playlist') ||
        trimmed.includes('chunklist');

      if (isSubPlaylist) {
        return `/api/proxy/stream.m3u8?url=${encodeURIComponent(absUrl)}`;
      }

      return `/api/proxy/segment?url=${encodeURIComponent(absUrl)}`;
    });

    res.send(rewrittenLines.join('\n'));
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return res.status(504).send('Upstream stream manifest timed out');
    }
    return res.status(502).send(`Proxy fetch failed: ${err.message}`);
  }
});

// 11. Live Stream TS Segment Proxy (Streams audio/video segments)
app.get('/api/proxy/segment', async (req, res) => {
  const segmentUrl = req.query.url as string;
  if (!segmentUrl) {
    return res.status(400).send('Missing url query parameter');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const upstreamRes = await fetch(segmentUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
        Accept: '*/*',
      },
    });
    clearTimeout(timeout);

    if (!upstreamRes.ok) {
      const status = (upstreamRes.status >= 400 && upstreamRes.status <= 599 && upstreamRes.status !== 458) ? upstreamRes.status : 502;
      return res.status(status).send(`Segment upstream error: ${upstreamRes.statusText}`);
    }

    res.setHeader('Content-Type', upstreamRes.headers.get('content-type') || 'video/mp2t');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (upstreamRes.body) {
      const reader = upstreamRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      res.end();
    } else {
      res.end();
    }
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(502).send(`Segment proxy failed: ${err.message}`);
    }
  }
});

// Dev or Production handler
async function startServer() {
  if (!IS_PROD) {
    // Development mode with Vite middleware
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Production mode
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Only bind port if not running in serverless environment
  if (process.env.VERCEL !== '1') {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`ReneeTV Live server running on http://0.0.0.0:${PORT} (${IS_PROD ? 'production' : 'development'})`);
    });
  }
}

if (process.env.VERCEL !== '1') {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export default app;
