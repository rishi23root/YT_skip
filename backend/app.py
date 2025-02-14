import os
import json
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from openai import OpenAI

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://www.youtube.com",
        "https://youtube.com",
        "chrome-extension://*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Initialize OpenAI API key

client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),  # This is the default and can be omitted
)
class TranscriptionResult(BaseModel):
    text: str
    start: float
    duration: float

class ImportantSegments(BaseModel):
    segments: List[float]

class SkipSegment(BaseModel):
    start: float
    end: float

class ProcessResult(BaseModel):
    transcription: List[TranscriptionResult]
    remove: List[SkipSegment]

def create_skip_segments(
    data: List[TranscriptionResult],
    non_important_segments: ImportantSegments,
    buffer_time: float = 1.0
) -> List[SkipSegment]:
    try:
        if not non_important_segments.segments:
            return []

        # Sort transcription data and important segments by start time
        sorted_data = sorted(data, key=lambda x: x.start)
        sorted_starts = sorted(non_important_segments.segments)
        skip_segments = []

        data_index = 0
        start_index = 0

        while data_index < len(sorted_data) and start_index < len(sorted_starts):
            current_segment = sorted_data[data_index]
            target_start = sorted_starts[start_index]

            if current_segment.start + current_segment.duration < target_start:
                data_index += 1
                continue

            segment_end = current_segment.start + current_segment.duration

            # Extend segment if the next important segment is close
            if start_index < len(sorted_starts) - 1:
                next_start = sorted_starts[start_index + 1]
                if next_start - segment_end <= buffer_time * 2:
                    segment_end = next_start

            start_time = max(0, current_segment.start - buffer_time)
            end_time = segment_end + buffer_time

            # Merge overlapping skip segments
            if skip_segments and start_time <= skip_segments[-1].end:
                skip_segments[-1].end = end_time
            else:
                skip_segments.append(SkipSegment(start=start_time, end=end_time))

            start_index += 1

        return skip_segments
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail="Error creating skip segments: " + str(e))

@app.get("/process_video", response_model=ProcessResult)
async def process_video(video_id: str):
    # Extract transcript using YouTubeTranscriptApi
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        transcript = transcript_list.find_transcript(['en'])
        data = transcript.fetch()
        if not data:
            raise NoTranscriptFound
        # Map fetched transcript to TranscriptionResult objects
        transcription_data = [TranscriptionResult(**segment) for segment in data]
    except TranscriptsDisabled:
        raise HTTPException(status_code=400, detail="Transcripts are disabled for this video.")
    except NoTranscriptFound:
        raise HTTPException(status_code=400, detail="No transcript found for this video.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Prepare transcript text for the prompt
    transcript_text = "\n".join(
        [f"{seg.start} - {seg.duration} - {seg.text}".strip().replace("\n", " ") for seg in transcription_data]
    )

    prompt = (
        "You are a highly skilled video editor tasked with optimizing video engagement by identifying sections of the transcript that should be skipped. "
        "Analyze the provided video transcription and return only the start times of segments containing filler, off-topic content, or unnecessary details. "
        "Return your response in valid JSON format with a single 'segments' array containing float numbers representing start times. "
        "Example format: {'segments': [12.5, 45.2, 89.7]}\n\n"
        "Skip the following types of content:\n"
        "- Filler Content: Repeated phrases, excessive pauses, or non-substantive speech\n"
        "- Off-Topic Content: Tangents or unrelated discussions\n"
        "- Unnecessary Detail: Repetitive explanations or obvious information\n"
        "- Advertisements/Sponsorships: Product mentions (unless essential)\n"
        "- Rambling/Blathering: Unfocused speech\n"
        "- Monotonous Segments: Long-winded sections\n\n"
        f"Transcript:\n{transcript_text}"
    )

    # try:
        # Call the OpenAI ChatCompletion API using the updated attribute access
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": "You are a video editing assistant that identifies segments to skip. Please follow the JSON schema provided: " + json.dumps(ImportantSegments.model_json_schema())},
            {"role": "user", "content": prompt}
        ],
        response_format={"type": "json_object"}
    )

    # Access using attribute notation instead of subscript
    response_content = response.choices[0].message.content
    try:
        # Parse the response content as JSON
        response_json = json.loads(response_content)
        segments = response_json['segments']
        non_important_segments = ImportantSegments(segments=segments)
        skip_segments = create_skip_segments(transcription_data, non_important_segments)
    except json.JSONDecodeError as json_error:
        # print(f"Error decoding JSON: {json_error}")
        raise HTTPException(status_code=500, detail="Failed to decode JSON from LLM response")
    except Exception as e:
        # print(f"Error calling LLM: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calling LLM: {str(e)}")

    return ProcessResult(transcription=transcription_data, remove=skip_segments)
