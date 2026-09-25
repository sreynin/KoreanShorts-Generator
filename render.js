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

function wrapText(text, maxCharsPerLine) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) { lines.push(''); continue; }
    let current = '';
    for (const word of paragraph.split(/\s+/)) {
      if (!current) {
        current = word;
      } else if (current.length + 1 + word.length <= maxCharsPerLine) {
        current += ' ' + word;
      } else {
        lines.push(current);
        current = word;
      }
      while (current.length > maxCharsPerLine) {
        lines.push(current.slice(0, maxCharsPerLine));
        current = current.slice(maxCharsPerLine);
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function makePageSvg(pageLines, width, height, fontSize, lineHeight) {
  const totalTextHeight = pageLines.length * lineHeight;
  const startY = (height - totalTextHeight) / 2 + fontSize;

  const textEls = pageLines.map((line, i) => {
    if (!line.trim()) return '';
    const y = startY + i * lineHeight;
    return `<text x="${width / 2}" y="${y}" text-anchor="middle"
      font-family="NanumGothic, Noto Sans KR, Apple SD Gothic Neo, sans-serif"
      font-size="${fontSize}" font-weight="bold" fill="white"
      filter="url(#shadow)">${escapeXml(line)}</text>`;
  }).join('\n');

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="black" flood-opacity="0.9"/>
    </filter>
  </defs>
  ${textEls}
</svg>`;
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
    font-family="NanumGothic, Noto Sans KR, Apple SD Gothic Neo, sans-serif"
    font-size="${Math.round(width * 0.055)}"
    font-weight="bold"
    fill="white"
    filter="url(#shadow)"
  >${safeKorean}</text>
  <text
    x="${width / 2}" y="${height / 2 + 50}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Helvetica Neue, Arial, sans-serif"
    font-size="${Math.round(width * 0.033)}"
    fill="#cccccc"
    filter="url(#shadow)"
  >${safeEnglish}</text>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

async function prepareBackground(width, height, source, outputPath) {
  if (source && fs.existsSync(source)) {
    console.log(`[Render] Using background image: ${source}`);
    await sharp(source)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85 })
      .toFile(outputPath);
  } else {
    const hexColor = source || '#1a1a2e';
    console.log(`[Render] Using solid background: ${hexColor}`);
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    await sharp({
      create: { width, height, channels: 3, background: { r, g, b } },
    }).jpeg({ quality: 85 }).toFile(outputPath);
  }
}

function runFfmpeg(cmd, cleanupFn, outputPath, timeoutMs = 180_000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    cmd
      .output(outputPath)
      .on('start', (cmdline) => console.log(`[Render] FFmpeg started`))
      .on('end', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanupFn();
        console.log(`\n[Render] Video saved: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        cleanupFn();
        reject(new Error(`FFmpeg error: ${err.message}`));
      });

    cmd.run();

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.log(`\n[Render] FFmpeg timeout — killing process`);
      cmd.kill('SIGKILL');
      cleanupFn();
      reject(new Error(`FFmpeg timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });
}

export async function renderVideo(config) {
  const {
    audioPath,
    outputPath,
    koreanText,
    englishText,
    backgroundImage,
    skipTextOverlay = false,
    animate = 'none',
    style = {},
  } = config;

  const width = parseInt(process.env.VIDEO_WIDTH || '1080', 10);
  const height = parseInt(process.env.VIDEO_HEIGHT || '1920', 10);
  const fps = parseInt(process.env.VIDEO_FPS || '30', 10);
  const bgColor = style.bgColor || process.env.BG_COLOR || '#1a1a2e';

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const duration = await getAudioDuration(audioPath);
  const totalDuration = duration + 1.0;
  console.log(`[Render] Audio duration: ${duration.toFixed(2)}s, video will be ${totalDuration.toFixed(2)}s`);

  const bgImagePath = path.join(dir, '_bg.jpg');
  await prepareBackground(width, height, backgroundImage || bgColor, bgImagePath);

  if (animate === 'scroll' && koreanText) {
    return renderPageByPage(dir, bgImagePath, koreanText, audioPath, outputPath, width, height, fps, totalDuration);
  }

  const textOverlayPath = path.join(dir, '_text.png');
  const composedFramePath = path.join(dir, '_frame.jpg');

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

  console.log(`[Render] Encoding static video (${width}x${height} @ ${fps}fps, ${totalDuration.toFixed(1)}s)...`);

  const cmd = ffmpeg()
    .input(composedFramePath)
    .inputOptions(['-loop', '1', '-framerate', '2'])
    .input(audioPath)
    .outputOptions([
      '-t', String(totalDuration),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-crf', '32',
      '-c:a', 'aac', '-b:a', '96k',
      '-r', String(fps), '-pix_fmt', 'yuv420p',
      '-threads', '1', '-movflags', '+faststart',
    ]);

  return runFfmpeg(cmd, cleanup, outputPath);
}

async function renderPageByPage(dir, bgImagePath, text, audioPath, outputPath, width, height, fps, totalDuration) {
  const fontSize = Math.max(16, Math.round(width * 0.055));
  const lineHeight = Math.round(fontSize * 1.8);
  const padding = Math.round(width * 0.08);
  const maxChars = Math.max(8, Math.floor((width - padding * 2) / (fontSize * 0.85)));
  const maxLinesPerPage = Math.max(2, Math.floor((height * 0.45) / lineHeight));

  const allLines = wrapText(text, maxChars);
  console.log(`[Render] Text: ${allLines.length} lines, ${maxChars} chars/line, ${maxLinesPerPage} lines/page`);

  const pages = [];
  for (let i = 0; i < allLines.length; i += maxLinesPerPage) {
    pages.push(allLines.slice(i, i + maxLinesPerPage));
  }

  const pageDuration = totalDuration / pages.length;
  console.log(`[Render] ${pages.length} pages, ${pageDuration.toFixed(2)}s each`);

  const frameFiles = [];
  for (let p = 0; p < pages.length; p++) {
    const framePath = path.join(dir, `_page_${p}.jpg`);
    const svg = makePageSvg(pages[p], width, height, fontSize, lineHeight);
    const overlayBuf = await sharp(Buffer.from(svg)).png().toBuffer();
    await sharp(bgImagePath)
      .composite([{ input: overlayBuf }])
      .jpeg({ quality: 90 })
      .toFile(framePath);
    frameFiles.push(framePath);
  }

  const concatPath = path.join(dir, '_concat.txt');
  let concatContent = '';
  for (let i = 0; i < frameFiles.length; i++) {
    concatContent += `file '${frameFiles[i]}'\n`;
    concatContent += `duration ${pageDuration.toFixed(4)}\n`;
  }
  concatContent += `file '${frameFiles[frameFiles.length - 1]}'\n`;
  fs.writeFileSync(concatPath, concatContent);

  const cleanup = () => {
    for (const f of [...frameFiles, concatPath, bgImagePath]) {
      try { fs.unlinkSync(f); } catch {}
    }
  };

  console.log(`[Render] Encoding page-by-page video (${width}x${height} @ ${fps}fps, ${totalDuration.toFixed(1)}s)...`);

  const cmd = ffmpeg()
    .input(concatPath)
    .inputOptions(['-f', 'concat', '-safe', '0'])
    .input(audioPath)
    .outputOptions([
      '-t', String(totalDuration),
      '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'stillimage', '-crf', '28',
      '-c:a', 'aac', '-b:a', '96k',
      '-r', String(fps), '-pix_fmt', 'yuv420p',
      '-threads', '1', '-movflags', '+faststart',
    ]);

  return runFfmpeg(cmd, cleanup, outputPath);
}
