import 'dotenv/config';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { generateAudio } from './tts.js';
import { renderVideo } from './render.js';
import { fetchBackground } from './pexels.js';

function checkFFmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
    console.log('[Setup] FFmpeg found');
  } catch {
    console.error('[Setup] FFmpeg is not installed. Please install it:');
    console.error('  macOS:   brew install ffmpeg');
    console.error('  Ubuntu:  sudo apt install ffmpeg');
    console.error('  Windows: choco install ffmpeg');
    process.exit(1);
  }
}

const SAMPLE_PHRASES = [
  {
    ttsText: '잡채. 잡채는 고구마 전분으로 만든 쫄깃하고 투명한 당면을 주재료로 다채로운 채소와 고기를 볶아 섞어 만든 요리입니다. 시금치, 당근, 양파, 버섯, 소고기 등 여러 재료를 각각 따로 볶은 후 마지막에 간장과 참기름으로 함께 버무리는 정성이 들어갑니다. 고소한 참기름 향과 달콤 짭짤한 간장 양념이 재료들에 골고루 스며들어 입맛을 돋웁니다. 손이 많이 가고 화려해 보이는 탓에 명절, 생일파티, 잔칫날 등 특별한 행사 식탁에 절대 빠지지 않는 음식입니다. 따뜻할 때 먹어도 맛있지만, 시간이 지나서 차갑게 먹거나 다음 날 밥 위에 얹어 잡채밥으로 볶아 먹어도 별미입니다.',
    korean: '잡채 (Japchae)',
    english: 'Stir-fried Glass Noodles with Vegetables',
    searchQuery: 'korean noodles food',
    localImage: '/Users/sreinin/Downloads/잡채 (Japchae).jpeg',
  },
];

async function main() {
  console.log('=== Korean Shorts Generator ===\n');

  checkFFmpeg();

  const phrase = SAMPLE_PHRASES[0];
  const timestamp = Date.now();
  const outputDir = path.resolve('output');
  const audioPath = path.join(outputDir, `audio_${timestamp}.mp3`);
  let bgImagePath = path.join(outputDir, `bg_${timestamp}.jpg`);
  const videoPath = path.join(outputDir, `short_${timestamp}.mp4`);

  const localImage = phrase.localImage;

  if (!localImage) {
    console.log(`\n[1/3] Fetching background image...`);
    const bgResult = await fetchBackground(
      phrase.searchQuery || phrase.korean,
      bgImagePath,
      { orientation: 'portrait' },
    );
    bgImagePath = bgResult.path;
    console.log(`\nPhoto by: ${bgResult.photographer} (Pexels)`);
  } else {
    console.log(`\n[1/3] Using local image: ${localImage}`);
    bgImagePath = localImage;
  }

  console.log(`\n[2/3] Generating Korean voiceover...`);
  await generateAudio(phrase.ttsText || phrase.korean, audioPath);

  console.log(`\n[3/3] Rendering video...`);
  await renderVideo({
    audioPath,
    outputPath: videoPath,
    koreanText: phrase.korean,
    englishText: phrase.english,
    backgroundImage: bgImagePath,
    skipTextOverlay: !!localImage,
  });

  console.log(`\n=== Done! ===`);
  console.log(`Output: ${videoPath}`);
}

main().catch((err) => {
  console.error('\n[Error]', err.message);
  process.exit(1);
});
