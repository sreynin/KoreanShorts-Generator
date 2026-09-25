import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';

function getAudioDuration(audioPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

async function createTextOverlay(width, height, koreanText, englishText, outputPath) {
  const safeKorean = escapeXml(koreanText);
  const safeEnglish = escapeXml(englishText);

  const svg = `
<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="black" flood-opacity="0.8"/>
    </filter>
  </defs>
  <text
    x="${width / 2}" y="${height / 2 - 40}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Apple SD Gothic Neo, Noto Sans KR, sans-serif"
    font-size="60"
    font-weight="bold"
    fill="white"
    filter="url(#shadow)"
  >${safeKorean}</text>
  <text
    x="${width / 2}" y="${height / 2 + 50}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Helvetica Neue, Arial, sans-serif"
    font-size="36"
    fill="#cccccc"
    filter="url(#shadow)"
  >${safeEnglish}</text>
</svg>`;

  await sharp(Buffer.from(svg))
    .png()
    .toFile(outputPath);
}

async function createBackgroundImage(width, height, hexColor, outputPath) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);

  await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r, g, b },
    },
  })
    .png()
    .toFile(outputPath);
}

async function prepareBackground(width, height, source, outputPath) {
  if (source && fs.existsSync(source)) {
    console.log(`[Render] Using background image: ${source}`);
    await sharp(source)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .png()
      .toFile(outputPath);
  } else {
    const hexColor = source || '#1a1a2e';
    console.log(`[Render] Using solid background: ${hexColor}`);
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    await sharp({
      create: { width, height, channels: 3, background: { r, g, b } },
    }).png().toFile(outputPath);
  }
}

/**
 * @param {object} config
 * @param {string} config.audioPath - Path to the .mp3 voiceover
 * @param {string} config.outputPath - Output .mp4 path
 * @param {string} config.koreanText - Korean text overlay
 * @param {string} config.englishText - English translation overlay
 * @param {string} [config.backgroundImage] - Path to a background image
 * @param {object} [config.style]
 * @param {string} [config.style.bgColor] - Background hex color (fallback)
 */
export async function renderVideo(config) {
  const {
    audioPath,
    outputPath,
    koreanText,
    englishText,
    backgroundImage,
    skipTextOverlay = false,
    style = {},
  } = config;

  const width = parseInt(process.env.VIDEO_WIDTH || '1080', 10);
  const height = parseInt(process.env.VIDEO_HEIGHT || '1920', 10);
  const fps = parseInt(process.env.VIDEO_FPS || '30', 10);
  const bgColor = style.bgColor || process.env.BG_COLOR || '#1a1a2e';

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const duration = await getAudioDuration(audioPath);
  const totalDuration = duration + 1.0;
  console.log(`[Render] Audio duration: ${duration.toFixed(2)}s, video will be ${totalDuration.toFixed(2)}s`);

  const bgImagePath = path.join(dir, '_bg.png');
  const textOverlayPath = path.join(dir, '_text.png');
  const composedFramePath = path.join(dir, '_frame.jpg');

  await prepareBackground(width, height, backgroundImage || bgColor, bgImagePath);

  if (skipTextOverlay) {
    console.log(`[Render] Using image as-is (text already included)`);
    await sharp(bgImagePath).jpeg({ quality: 90 }).toFile(composedFramePath);
  } else {
    console.log(`[Render] Creating text overlay...`);
    await createTextOverlay(width, height, koreanText, englishText, textOverlayPath);

    console.log(`[Render] Composing frame...`);
    await sharp(bgImagePath)
      .composite([{ input: textOverlayPath }])
      .jpeg({ quality: 90 })
      .toFile(composedFramePath);
  }

  const cleanup = () => {
    for (const f of [bgImagePath, textOverlayPath, composedFramePath]) {
      try { fs.unlinkSync(f); } catch {}
    }
  };

  return new Promise((resolve, reject) => {
    console.log(`[Render] Encoding video...`);

    ffmpeg()
      .input(composedFramePath)
      .inputOptions(['-loop', '1'])
      .input(audioPath)
      .outputOptions([
        '-t', String(totalDuration),
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '28',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-r', '24',
        '-pix_fmt', 'yuv420p',
        '-threads', '1',
        '-movflags', '+faststart',
      ])
      .output(outputPath)
      .on('start', () => console.log(`[Render] FFmpeg started`))
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\r[Render] Progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        cleanup();
        console.log(`\n[Render] Video saved: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        cleanup();
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      .run();
  });
}
