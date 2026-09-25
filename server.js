import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { generateAudio } from './tts.js';
import { renderVideo } from './render.js';
import { fetchBackground } from './pexels.js';

const app = express();
const PORT = process.env.PORT || 3000;

const outputDir = path.resolve('output');
const uploadsDir = path.resolve('uploads');
for (const dir of [outputDir, uploadsDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const upload = multer({ dest: uploadsDir });

app.use(express.json());
app.use(express.static('public'));
app.use('/output', express.static(outputDir));

try {
  execSync('ffmpeg -version', { stdio: 'pipe' });
} catch {
  console.error('FFmpeg is not installed.');
  process.exit(1);
}

app.get('/api/voices', (_req, res) => {
  res.json([
    { id: 'ko-KR-SunHiNeural', name: 'SunHi (여성)' },
    { id: 'ko-KR-InJoonNeural', name: 'InJoon (남성)' },
    { id: 'ko-KR-BongJinNeural', name: 'BongJin (남성)' },
    { id: 'ko-KR-GookMinNeural', name: 'GookMin (남성)' },
    { id: 'ko-KR-JiMinNeural', name: 'JiMin (여성)' },
    { id: 'ko-KR-SeoHyeonNeural', name: 'SeoHyeon (여성)' },
    { id: 'ko-KR-SoonBokNeural', name: 'SoonBok (여성)' },
    { id: 'ko-KR-YuJinNeural', name: 'YuJin (여성)' },
  ]);
});

app.post('/api/search-image', async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: 'query is required' });

    const timestamp = Date.now();
    const imgPath = path.join(outputDir, `bg_${timestamp}.jpg`);
    const result = await fetchBackground(query, imgPath, { orientation: 'portrait' });

    res.json({
      path: result.path,
      url: `/output/bg_${timestamp}.jpg`,
      photographer: result.photographer,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let currentJob = null;

app.post('/api/generate', upload.single('image'), async (req, res) => {
  if (currentJob) {
    return res.status(409).json({ error: 'A video is already being generated' });
  }

  try {
    const { ttsText, koreanText, englishText, voice, rate, bgSource, pexelsQuery } = req.body;

    if (!ttsText) return res.status(400).json({ error: 'ttsText is required' });

    currentJob = { status: 'starting', progress: 0 };
    res.json({ status: 'started' });

    const timestamp = Date.now();
    const audioPath = path.join(outputDir, `audio_${timestamp}.mp3`);
    const videoPath = path.join(outputDir, `short_${timestamp}.mp4`);

    let bgImagePath = null;
    let skipTextOverlay = false;

    currentJob = { status: 'background', progress: 10 };

    if (bgSource === 'upload' && req.file) {
      bgImagePath = req.file.path;
      skipTextOverlay = true;
    } else if (bgSource === 'pexels' && pexelsQuery) {
      const imgPath = path.join(outputDir, `bg_${timestamp}.jpg`);
      const result = await fetchBackground(pexelsQuery, imgPath, { orientation: 'portrait' });
      bgImagePath = result.path;
    }

    currentJob = { status: 'audio', progress: 30 };
    await generateAudio(ttsText, audioPath, { voice: voice || undefined, rate: rate || undefined });

    currentJob = { status: 'video', progress: 60 };
    await renderVideo({
      audioPath,
      outputPath: videoPath,
      koreanText: koreanText || '',
      englishText: englishText || '',
      backgroundImage: bgImagePath,
      skipTextOverlay,
    });

    currentJob = {
      status: 'done',
      progress: 100,
      videoUrl: `/output/short_${timestamp}.mp4`,
      videoPath,
    };
  } catch (err) {
    console.error('[Generate Error]', err);
    currentJob = { status: 'error', error: err.message };
  }
});

app.get('/api/status', (_req, res) => {
  res.json(currentJob || { status: 'idle' });
});

app.post('/api/reset', (_req, res) => {
  currentJob = null;
  res.json({ status: 'idle' });
});

app.get('/api/videos', (_req, res) => {
  const files = fs.readdirSync(outputDir)
    .filter((f) => f.startsWith('short_') && f.endsWith('.mp4'))
    .map((f) => {
      const stats = fs.statSync(path.join(outputDir, f));
      return {
        name: f,
        url: `/output/${f}`,
        size: (stats.size / (1024 * 1024)).toFixed(1) + ' MB',
        created: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.created) - new Date(a.created));

  res.json(files);
});

app.listen(PORT, () => {
  console.log(`\n  Korean Shorts Generator`);
  console.log(`  http://localhost:${PORT}\n`);
});
