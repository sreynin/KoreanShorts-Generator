import { execFile, execSync } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import fs from 'node:fs';

const execFileAsync = promisify(execFile);

function findEdgeTts() {
  try {
    return execSync('which edge-tts', { encoding: 'utf-8' }).trim();
  } catch {
    const fallback = '/Users/sreinin/Library/Python/3.9/bin/edge-tts';
    if (fs.existsSync(fallback)) return fallback;
    throw new Error('edge-tts not found. Install with: pip3 install edge-tts');
  }
}

const EDGE_TTS_BIN = findEdgeTts();

/**
 * @param {string} text - Korean text to synthesize
 * @param {string} outputPath - Output .mp3 file path
 * @param {object} [options]
 * @param {string} [options.voice] - Edge TTS voice name
 * @param {string} [options.rate] - Speech rate (e.g., "+0%", "-20%")
 * @param {string} [options.volume] - Volume (e.g., "+0%", "+50%")
 */
export async function generateAudio(text, outputPath, options = {}) {
  const {
    voice = process.env.TTS_VOICE || 'ko-KR-SunHiNeural',
    rate = process.env.TTS_RATE || '+0%',
    volume = process.env.TTS_VOLUME || '+0%',
  } = options;

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`[TTS] Generating audio with voice: ${voice}`);
  console.log(`[TTS] Text: "${text}"`);

  const textFile = outputPath.replace(/\.mp3$/, '_input.txt');
  fs.writeFileSync(textFile, text, 'utf-8');

  const args = [
    `--voice=${voice}`,
    `--rate=${rate}`,
    `--volume=${volume}`,
    '-f', textFile,
    '--write-media', outputPath,
  ];

  try {
    await execFileAsync(EDGE_TTS_BIN, args, { timeout: 120000 });
  } finally {
    try { fs.unlinkSync(textFile); } catch {}
  }

  const stats = fs.statSync(outputPath);
  if (stats.size === 0) {
    throw new Error('TTS produced an empty audio file');
  }

  console.log(`[TTS] Audio saved: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);
  return outputPath;
}
