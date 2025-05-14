from youtube_transcript_api import YouTubeTranscriptApi
import json
import sys
import os
from pathlib import Path

def get_video_id(url):
    """Extract video ID from YouTube URL."""
    if 'youtube.com/watch?v=' in url:
        return url.split('watch?v=')[1].split('&')[0]
    elif 'youtu.be/' in url:
        return url.split('youtu.be/')[1].split('?')[0]
    return url  # Assume it's already a video ID

def process_video(video_id_or_url):
    """Process captions for a YouTube video."""
    try:
        # Get video ID from URL if needed
        video_id = get_video_id(video_id_or_url)
        print(f"Processing video ID: {video_id}")

        # Try to get Hindi captions first
        try:
            transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['hi'])
            print("Found Hindi captions")
        except:
            try:
                # Try auto-generated Hindi
                transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=['hi-IN'])
                print("Found auto-generated Hindi captions")
            except:
                try:
                    # Try any available captions
                    transcript = YouTubeTranscriptApi.get_transcript(video_id)
                    print("Found captions in another language")
                except Exception as e:
                    print(f"Error: No captions found for this video. {str(e)}")
                    return None

        # Create captions directory in user's home directory
        home_dir = Path.home()
        captions_dir = home_dir / 'subscript_captions'
        captions_dir.mkdir(exist_ok=True)
        
        # Save to file
        output_file = captions_dir / f'captions_{video_id}.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(transcript, f, ensure_ascii=False, indent=2)
        
        print(f"Captions saved to: {output_file}")
        return str(output_file)

    except Exception as e:
        print(f"Error processing video: {str(e)}")
        return None

def main():
    if len(sys.argv) > 1:
        # Get video ID/URL from command line argument
        video_id_or_url = sys.argv[1]
        process_video(video_id_or_url)
    else:
        # Interactive mode
        print("YouTube Caption Processor")
        print("------------------------")
        while True:
            video_id_or_url = input("\nEnter YouTube URL or video ID (or 'q' to quit): ").strip()
            if video_id_or_url.lower() == 'q':
                break
            if video_id_or_url:
                process_video(video_id_or_url)

if __name__ == '__main__':
    main() 