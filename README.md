# Korean Shorts Generator

Node.js tool that generates 9:16 vertical YouTube Shorts with Korean voiceover and text overlays. Includes a web UI and CLI mode.

## Features

- **Korean TTS** — Microsoft Edge Neural voices (multiple male/female options, adjustable speed)
- **Text Overlays** — Korean + English translation rendered via SVG/Sharp
- **Background Images** — Upload local images, search Pexels, or use a solid color
- **Web UI** — Browser-based interface with live preview and video history
- **CLI Mode** — Script-based generation via `node index.js`

## Prerequisites

- **Node.js** v18+
- **FFmpeg** installed and on PATH
- **Python edge-tts** CLI

```bash
# macOS
brew install ffmpeg
pip3 install edge-tts

# Ubuntu
sudo apt install ffmpeg
pip3 install edge-tts
```

## Setup

```bash
git clone git@github.com:sreynin/KoreanShorts-Generator.git
cd KoreanShorts-Generator
npm install
cp .env.example .env
```

Edit `.env` with your settings:

```env
PEXELS_API_KEY=your_pexels_key_here

TTS_VOICE=ko-KR-SunHiNeural
TTS_RATE=+0%
TTS_VOLUME=+0%

VIDEO_WIDTH=1080
VIDEO_HEIGHT=1920
VIDEO_FPS=30
BG_COLOR=#1a1a2e
```

Get a free Pexels API key at [pexels.com/api](https://www.pexels.com/api/).

## Usage

### Web UI

```bash
npm start
# Open http://localhost:3000
```

1. Enter Korean script text (voiceover) and display text
2. Choose a voice and speed
3. Upload a background image, search Pexels, or use a solid color
4. Click **Generate Video**
5. Preview and download from the browser

### CLI

```bash
npm run cli
```

Edit the `SAMPLE_PHRASES` array in `index.js` to change the content.

## Output

- Format: MP4 (H.264 + AAC)
- Resolution: 1080x1920 (9:16)
- Frame rate: 30 FPS
- Videos saved to `output/`

## Available Voices

| Voice | Gender |
|-------|--------|
| ko-KR-SunHiNeural | Female |
| ko-KR-InJoonNeural | Male |
| ko-KR-HyunsuMultilingualNeural | Male |

## Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com/new](https://render.com/new) and connect your GitHub repo
3. Select **Web Service** and choose **Docker** runtime
4. Add environment variable: `PEXELS_API_KEY` = your key
5. Click **Create Web Service**

Or use the blueprint: click **New** > **Blueprint** and point to this repo — it reads `render.yaml` automatically.

## Project Structure

```
KoreanShorts-Generator/
├── server.js        # Express web server + API
├── index.js         # CLI entry point
├── tts.js           # Audio generation (Edge TTS)
├── render.js        # Video rendering (Sharp + FFmpeg)
├── pexels.js        # Pexels image search/download
├── public/
│   └── index.html   # Web UI frontend
├── .env             # Configuration
└── output/          # Generated videos
```

## License

ISC
