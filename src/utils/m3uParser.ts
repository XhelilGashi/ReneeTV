/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Category, Channel, M3UImportOptions } from '../types/tv';

/**
 * Strips rich text format (RTF) wrappers if the input is an RTF export
 */
export function stripRtf(rawContent: string): string {
  if (!rawContent.trim().startsWith('{\\rtf')) {
    return rawContent;
  }
  let text = rawContent;

  // Replace RTF unicode sequences like \uc0\u7487 or \u7487
  text = text.replace(/\\uc0\\u(\d+)\s*/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  text = text.replace(/\\u(\d+)\s*/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

  // Replace hexadecimal escaped characters like \'cb
  text = text.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
    try {
      const code = parseInt(hex, 16);
      return String.fromCharCode(code);
    } catch {
      return '';
    }
  });

  // Discard header before first #EXTINF
  const extInfIndex = text.indexOf('#EXTINF');
  if (extInfIndex !== -1) {
    text = text.substring(extInfIndex);
  }

  // Handle line breaks
  text = text.replace(/\\\r?\n/g, '\n');
  text = text.replace(/\\par/g, '\n');
  text = text.replace(/\\line/g, '\n');

  // Strip remaining backslashes
  text = text.replace(/\\/g, '');

  // Strip trailing brace
  text = text.replace(/\}$/, '');

  return text;
}

/**
 * Normalizes Xtream-Codes URLs to HLS .m3u8 URLs
 * Example: http://line.trxdnscloud.ru:80/316995360c/e96a15e420f0/116369
 * -> http://line.trxdnscloud.ru:80/live/316995360c/e96a15e420f0/116369.m3u8
 */
export function normalizeXtreamStreamUrl(url: string): string {
  const trimmed = url.trim();

  // If already an .m3u8, leave as is
  if (trimmed.includes('.m3u8')) {
    return trimmed;
  }

  // Match pattern: http(s)://domain:port/username/password/streamid
  const xtreamRegex = /^(https?:\/\/[^\/]+)\/(?!live\/)([^\/]+)\/([^\/]+)\/(\d+)$/i;
  const match = trimmed.match(xtreamRegex);
  if (match) {
    const [, origin, username, password, streamId] = match;
    return `${origin}/live/${username}/${password}/${streamId}.m3u8`;
  }

  return trimmed;
}

/**
 * Intelligent categorization based on group-title, tvg-name, or channel name
 */
export function detectCategory(groupTitle?: string, channelName?: string): Category {
  const g = (groupTitle || '').toLowerCase();
  const n = (channelName || '').toLowerCase();
  const text = `${g} ${n}`;

  // 1. Sports check (highest priority so sports channels don't get lumped into general countries)
  if (
    g.includes('sport') ||
    n.includes('sport') ||
    n.includes('football') ||
    n.includes('futboll') ||
    n.includes('arena sport') ||
    n.includes('supersport') ||
    n.includes('super sport') ||
    n.includes('k sport') ||
    n.includes('art sport') ||
    n.includes('sport klub') ||
    n.includes('eurosport') ||
    n.includes('dazn') ||
    n.includes('fight box') ||
    n.includes('sk fight')
  ) {
    return 'Sports';
  }

  // 2. Movies & Series check
  if (
    g.includes('movie') ||
    g.includes('film') ||
    g.includes('24/7') ||
    n.includes('netflix') ||
    n.includes('playme') ||
    n.includes('digi movie') ||
    n.includes('filmbox') ||
    n.includes('kino') ||
    n.includes('cinema') ||
    n.includes('film ') ||
    n.includes('filma') ||
    n.includes('dark ') ||
    n.includes('tring super') ||
    n.includes('tring action') ||
    n.includes('tring comedy') ||
    n.includes('tring fantasy') ||
    n.includes('tring series') ||
    n.includes('tring novelas') ||
    n.includes('star movies') ||
    n.includes('tele one') ||
    n.includes('q action') ||
    n.includes('q drama') ||
    n.includes('q komedi') ||
    n.includes('q thriller')
  ) {
    return 'Movies';
  }

  // 3. News check
  if (
    g.includes('news') ||
    n.includes('news') ||
    n.includes('lajme') ||
    n.includes('nachricht') ||
    n.includes('euronews') ||
    n.includes('a2 cnn') ||
    n.includes('klan news') ||
    n.includes('top news') ||
    n.includes('news 24') ||
    n.includes('fax news') ||
    n.includes('abc news') ||
    n.includes('report tv') ||
    n.includes('syri tv') ||
    n.includes('syri televizion') ||
    n.includes('arta news') ||
    n.includes('scan tv') ||
    n.includes('newsbiz')
  ) {
    return 'News';
  }

  // 4. Kosovo Regional / National check
  if (
    g.includes('ko|') ||
    g.includes('kosovo') ||
    n.includes('kosov') ||
    n.includes('rtk') ||
    n.includes('klan kosova') ||
    n.includes('rtv 21') ||
    n.includes('rtv21') ||
    n.includes('ktv') ||
    n.includes('kohavision') ||
    n.includes('dukagjin') ||
    n.includes('atv') ||
    n.includes('t7') ||
    n.includes('kanal 10') ||
    n.includes('prizren') ||
    n.includes('mitrovic') ||
    n.includes('prishtin') ||
    n.includes('alsat m') ||
    n.includes('drenica')
  ) {
    return 'Kosovo';
  }

  // 5. Germany check
  if (
    g.includes('germany') ||
    g.includes('deutsch') ||
    g.includes('de|') ||
    n.includes('ard') ||
    n.includes('zdf') ||
    n.includes('rtl') ||
    n.includes('prosieben') ||
    n.includes('sat.1') ||
    n.includes('wdr') ||
    n.includes('ndr')
  ) {
    return 'Germany';
  }

  // 6. Albania National / Regional check
  if (
    g.includes('al|') ||
    g.includes('albania') ||
    n.includes('alban') ||
    n.includes('shqip') ||
    n.includes('top channel') ||
    n.includes('tv klan') ||
    n.includes('klan plus') ||
    n.includes('vizion plus') ||
    n.includes('rtsh') ||
    n.includes('tirana') ||
    n.includes('ora news') ||
    n.includes('mcn tv')
  ) {
    return 'Albania';
  }

  return 'Other';
}

/**
 * Checks if a channel entry is a separator / section title header rather than a stream
 */
function isCategoryHeader(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed.includes('#####') ||
    trimmed.includes('#######') ||
    /^#+\s*.+\s*#+$/.test(trimmed) ||
    trimmed.startsWith('==')
  );
}

/**
 * Clean up channel name display
 */
function cleanChannelName(rawName: string): string {
  let name = rawName.trim();
  // Clean up prefix like "ALB| " or "ALB | "
  name = name.replace(/^ALB\|\s*/i, '');
  // Clean up special superscript unicode artifacts like \u7487 \u7468 \u7490 (ᴴᴰ)
  name = name.replace(/[\u7487\u7468\u7490]/g, '');
  return name.trim();
}

/**
 * Parses raw M3U / M3U8 playlist content (or RTF containing M3U) into structured Channel objects
 */
export function parseM3UPlaylist(
  rawInput: string,
  baseUrl?: string,
  options: Partial<M3UImportOptions> = {}
): {
  channels: Channel[];
  totalParsed: number;
  groupsFound: string[];
  invalidCount: number;
} {
  const cleanInput = stripRtf(rawInput);
  const lines = cleanInput.split(/\r?\n/);
  const channels: Channel[] = [];
  const groupsSet = new Set<string>();
  let invalidCount = 0;

  let currentExtInf: {
    tvgId?: string;
    tvgName?: string;
    tvgLogo?: string;
    groupTitle?: string;
    channelName?: string;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (!line || line.startsWith('#EXTM3U')) {
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      const infoPart = line.substring(8);
      const commaIndex = infoPart.lastIndexOf(',');
      const metadataPart = commaIndex !== -1 ? infoPart.substring(0, commaIndex) : infoPart;
      const channelName = commaIndex !== -1 ? infoPart.substring(commaIndex + 1).trim() : 'Unnamed Channel';

      const tvgIdMatch = metadataPart.match(/tvg-id="([^"]*)"/i) || metadataPart.match(/tvg-id=([^\s,]+)/i);
      const tvgNameMatch = metadataPart.match(/tvg-name="([^"]*)"/i) || metadataPart.match(/tvg-name=([^\s,]+)/i);
      const tvgLogoMatch =
        metadataPart.match(/tvg-logo="([^"]*)"/i) ||
        metadataPart.match(/logo="([^"]*)"/i) ||
        metadataPart.match(/tvg-logo=([^\s,]+)/i);
      const groupTitleMatch =
        metadataPart.match(/group-title="([^"]*)"/i) ||
        metadataPart.match(/group="([^"]*)"/i) ||
        metadataPart.match(/group-title=([^\s,]+)/i);

      const groupTitle = groupTitleMatch ? groupTitleMatch[1].trim() : undefined;
      if (groupTitle) {
        groupsSet.add(groupTitle);
      }

      currentExtInf = {
        tvgId: tvgIdMatch ? tvgIdMatch[1].trim() : undefined,
        tvgName: tvgNameMatch ? tvgNameMatch[1].trim() : undefined,
        tvgLogo: tvgLogoMatch ? tvgLogoMatch[1].trim() : undefined,
        groupTitle,
        channelName: channelName || tvgNameMatch?.[1]?.trim() || 'Channel',
      };
      continue;
    }

    // Ignore other # comments
    if (line.startsWith('#')) {
      continue;
    }

    // This is the stream URL line
    let streamUrl = line;

    // Resolve relative URLs if base URL is provided
    if (baseUrl && !streamUrl.startsWith('http://') && !streamUrl.startsWith('https://')) {
      try {
        streamUrl = new URL(streamUrl, baseUrl).toString();
      } catch {
        // Fallback keep as is
      }
    }

    // Validate URL basic format
    const isValidUrl = streamUrl.startsWith('http://') || streamUrl.startsWith('https://');
    if (!isValidUrl && options.onlyValidUrls) {
      invalidCount++;
      currentExtInf = null;
      continue;
    }

    const rawName = currentExtInf?.channelName || currentExtInf?.tvgName || `Channel ${channels.length + 1}`;

    // Skip section separator headers (e.g. ##### ALB GENERAL #####)
    if (isCategoryHeader(rawName)) {
      currentExtInf = null;
      continue;
    }

    // Normalize Xtream Codes URL to live HLS .m3u8 format
    const originalUrl = streamUrl;
    const normalizedHlsUrl = normalizeXtreamStreamUrl(streamUrl);

    const groupTitle = currentExtInf?.groupTitle;
    const displayName = cleanChannelName(rawName);

    // Determine category
    let category: Category = options.defaultCategory && options.defaultCategory !== 'All'
      ? options.defaultCategory
      : 'Other';

    if (options.autoDetectCategory !== false) {
      category = detectCategory(groupTitle, rawName);
    }

    // Extract resolution hint
    let resolution = '1080p';
    if (rawName.includes('4K')) resolution = '4K';
    else if (rawName.includes('FHD')) resolution = '1080p FHD';
    else if (rawName.includes('HD')) resolution = '720p HD';
    else if (rawName.includes('HEVC')) resolution = '1080p HEVC';

    const channelId = `ch-${Date.now()}-${channels.length + 1}-${Math.random().toString(36).substring(2, 7)}`;

    channels.push({
      id: channelId,
      name: displayName,
      streamUrl: normalizedHlsUrl,
      backupStreamUrl: originalUrl !== normalizedHlsUrl ? originalUrl : undefined,
      logoUrl: currentExtInf?.tvgLogo,
      category,
      groupTitle,
      tvgId: currentExtInf?.tvgId,
      enabled: true,
      isDemo: false,
      resolution,
      currentProgram: 'Live Television Broadcast',
      order: channels.length + 1,
      addedAt: new Date().toISOString(),
    });

    currentExtInf = null;
  }

  return {
    channels,
    totalParsed: channels.length,
    groupsFound: Array.from(groupsSet),
    invalidCount,
  };
}

/**
 * Exports Channel list to M3U playlist format string
 */
export function exportToM3U(channels: Channel[], playlistName = 'ReneeTV Live Playlist'): string {
  let output = `#EXTM3U name="${playlistName}"\n\n`;

  for (const ch of channels) {
    if (!ch.enabled) continue;

    const tvgIdAttr = ch.tvgId ? ` tvg-id="${ch.tvgId}"` : '';
    const tvgNameAttr = ` tvg-name="${ch.name}"`;
    const tvgLogoAttr = ch.logoUrl ? ` tvg-logo="${ch.logoUrl}"` : '';
    const groupAttr = ` group-title="${ch.groupTitle || ch.category}"`;

    output += `#EXTINF:-1${tvgIdAttr}${tvgNameAttr}${tvgLogoAttr}${groupAttr},${ch.name}\n`;
    output += `${ch.streamUrl}\n\n`;
  }

  return output;
}
