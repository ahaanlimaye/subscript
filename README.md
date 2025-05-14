# SubScript

A Chrome extension for learning Hindi through YouTube videos with real-time translations.

## Features

- Automatically detects when Hindi is being spoken in YouTube videos
- Pauses video after a configurable number of sentences
- Provides both word-by-word literal translations and natural English translations
- Integrates with OpenAI's API for high-quality translations
- Works with YouTube's auto-generated captions

## How It Works

1. Turn on the extension while watching a Hindi YouTube video with captions enabled
2. SubScript watches for new captions and counts sentences
3. After your configured number of sentences, the video automatically pauses
4. A translation panel appears showing:
   - The original Hindi text
   - A word-by-word literal translation (great for learning vocabulary and structure)
   - A natural English translation (for understanding meaning)
5. Click "Continue" to resume the video

## Installation

### From Chrome Web Store (Coming Soon)

1. Visit the Chrome Web Store page for SubScript
2. Click "Add to Chrome"
3. Follow the installation prompts

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

## Future Plans

- Support for additional languages
- Vocabulary saving feature
- Pronunciation guidance
- Custom API integration options
- Mobile version

## Privacy

Your API key is stored locally in your browser and is never sent to any server other than OpenAI for translation purposes.

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.

## License

MIT 