from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from youtube_transcript_api_sentences import YouTubeTranscriptApi
from pydantic import BaseModel
from typing import List, Optional

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

class Caption(BaseModel):
    text: str
    start: float
    duration: float

@app.get("/api/captions")
async def get_captions(video_id: str) -> List[Caption]:
    if not video_id:
        raise HTTPException(status_code=400, detail="No video ID provided")
    
    try:
        # Try Hindi captions first
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
                    raise HTTPException(status_code=404, detail=f"No captions found: {str(e)}")
        
        return transcript
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5001) 