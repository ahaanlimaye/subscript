# SubScript

SubScript is a Chrome extension that transforms YouTube into an interactive language learning tool. It provides real-time AI-powered translations, explanations, and chat for any language with captions—right on top of your video.

## Features (MVP)

- **Works on any YouTube video with captions**
- **Pauses video after a configurable number of sentences**
- **AI-powered translation and explanation overlay**
- **Interactive chat:** Ask follow-up questions, get grammar breakdowns, or request examples—just like ChatGPT
- **Conversation caching:** Each video chunk's chat is saved and restored if you revisit it
- **"Refresh Chat" button:** Start a new conversation for any chunk at any time
- **Markdown-formatted, readable AI responses**
- **Draggable, resizable, and persistent overlay**
- **Robust caption fetching with retry and reload logic**
- **Settings and OpenAI API key stored securely in Chrome storage**

## How It Works

1. Enable SubScript and enter your OpenAI API key in the extension popup
2. Play any YouTube video with captions enabled
3. SubScript monitors captions and pauses the video after your chosen number of sentences
4. An overlay appears with:
   - The original text
   - Romanized version (if applicable)
   - English translation
5. Chat with the AI: ask questions, get explanations, or continue the conversation
6. Click "Continue" to resume the video, or "Refresh Chat" to start over for that chunk

## Installation

### Manual Installation (Developer Mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top-right corner
4. Click "Load unpacked" and select the folder containing this extension
5. The SubScript icon should appear in your toolbar

## Setup

1. Click the SubScript icon in the toolbar
2. Enter your OpenAI API key (required for translations)
3. Configure how many sentences to wait before pausing
4. Toggle the extension on/off

## Known Limitations (MVP)

- Requires your own OpenAI API key (not provided)
- Only works on YouTube videos with captions
- Caching is per session and per chunk; clearing browser storage will remove chat history
- Only tested on desktop Chrome
- No vocabulary saving or pronunciation features (yet)

## Privacy & Data

- Your OpenAI API key and settings are stored locally in your browser using Chrome's storage APIs
- No data is sent anywhere except directly to OpenAI for translation/chat
- No tracking or analytics

## Contributing

Contributions, bug reports, and feature requests are welcome! Please open an issue or submit a pull request.

## License

MIT 