/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseM3UPlaylist } from '../src/utils/m3uParser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rtfPath = path.join(__dirname, '../public/assets/aistudio/Albania.m3u8_a595542d.rtf');
const targetFile = path.join(__dirname, '../data/channels.json');

if (!fs.existsSync(rtfPath)) {
  console.error('User RTF playlist not found at:', rtfPath);
  process.exit(1);
}

const rawRtf = fs.readFileSync(rtfPath, 'utf8');
const result = parseM3UPlaylist(rawRtf, undefined, {
  autoDetectCategory: true,
  defaultCategory: 'Albania',
});

console.log(`Parsed ${result.channels.length} valid TV channels.`);
console.log('Categories breakdown:');
const counts: Record<string, number> = {};
for (const ch of result.channels) {
  counts[ch.category] = (counts[ch.category] || 0) + 1;
}
console.log(counts);

// Ensure data dir exists
const dataDir = path.dirname(targetFile);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Write channels to data/channels.json
fs.writeFileSync(targetFile, JSON.stringify(result.channels, null, 2), 'utf8');
console.log(`Successfully saved ${result.channels.length} channels to ${targetFile}`);
