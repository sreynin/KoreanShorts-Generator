import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const API_BASE = 'https://api.pexels.com/v1';

/**
 * Search for a photo on Pexels and download it.
 * @param {string} query - Search term (e.g., "japchae korean food")
 * @param {string} outputPath - Where to save the downloaded image
 * @param {object} [options]
 * @param {string} [options.orientation] - "portrait" | "landscape" | "square"
 * @param {string} [options.size] - "large" | "medium" | "small"
 */
export async function fetchBackground(query, outputPath, options = {}) {
  const apiKey = process.env.PEXELS_API_KEY;
  if (!apiKey) {
    throw new Error('PEXELS_API_KEY is not set in .env');
  }

  const { orientation = 'portrait', size = 'original' } = options;

  const params = new URLSearchParams({
    query,
    orientation,
    per_page: '15',
  });

  console.log(`[Pexels] Searching: "${query}" (${orientation})...`);

  const searchRes = await fetch(`${API_BASE}/search?${params}`, {
    headers: { Authorization: apiKey },
  });

  if (!searchRes.ok) {
    throw new Error(`Pexels API error: ${searchRes.status} ${searchRes.statusText}`);
  }

  const data = await searchRes.json();

  if (!data.photos || data.photos.length === 0) {
    throw new Error(`No photos found for "${query}"`);
  }

  const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
  const imageUrl = photo.src[size] || photo.src.large;
  const photographer = photo.photographer;

  console.log(`[Pexels] Found: "${photo.alt || query}" by ${photographer}`);
  console.log(`[Pexels] Downloading...`);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`Failed to download image: ${imgRes.status}`);
  }

  const fileStream = fs.createWriteStream(outputPath);
  await pipeline(Readable.fromWeb(imgRes.body), fileStream);

  const stats = fs.statSync(outputPath);
  console.log(`[Pexels] Saved: ${outputPath} (${(stats.size / 1024).toFixed(0)} KB)`);

  return {
    path: outputPath,
    photographer,
    url: photo.url,
  };
}
