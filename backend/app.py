from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from google import genai
import os

app = FastAPI()

# Set your OpenAI API key (make sure to set this in your environment)
# client = Groq(api_key=os.environ.get("GROQ_API_KEY"))
client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))


class transcriptionResult(BaseModel):
    text: str
    start: float
    duration: float

class ProcessResult(BaseModel):
    transcription: list[transcriptionResult]
    remove: list[float]

class ImportantSegments(BaseModel):
    # A list of segment start times (in seconds)
    segments: list[float]

@app.get("/process_video", response_model=ProcessResult)
async def process_video(video_id: str):
    # Step 1: Extract the transcript
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        transcript = transcript_list.find_transcript(['en'])
        data = transcript.fetch()
        transcript_data = ""
        if data:
            for i in data:
                transcript_data += (f"{i['start']} - {i['duration']} - {i['text']}".strip().replace('\n', ' ')) + '\n'
        else:
            raise NoTranscriptFound

        print(transcript_data)
    except TranscriptsDisabled:
        raise HTTPException(status_code=400, detail="Transcripts are disabled for this video.")
    except NoTranscriptFound:
        raise HTTPException(status_code=400, detail="No transcript found for this video.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # Step 2: Use an LLM (via OpenAI API) to extract important parts and create a script
    prompt = (
        "You are an expert in video content analysis. Your task is to identify and extract only the valuable segments from a provided transcription while skipping filler content, advertisements, and sponsorships. You will be given a transcription formatted as 'start - duration - text.' Your response should include only the start times of segments that are not relevant or meaningful to the viewer and can save their time without making video uninteresting"
        "Transcript:\n" + transcript_data
    )
    
    try:
        response = client.models.generate_content(
            model="gemini-1.5-flash",  # Use the appropriate Gemini model identifier
            contents=[prompt],
            config={
                'response_mime_type': 'application/json',
                'response_schema': ImportantSegments.schema(),
            },
        )
        important_segments = ImportantSegments.parse_raw(response.text)
        important_script = important_segments.segments
        # print(important_script)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error calling LLM: " + str(e))

    return ProcessResult(transcription=data ,remove=important_script)
