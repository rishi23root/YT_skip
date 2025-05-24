import os
import json
import hashlib
import time
import logging
from typing import List, Optional, Dict, Union
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from groq import Groq
import asyncio

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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

# Initialize Groq client for ultra-fast inference
client = Groq(
    api_key=os.environ.get("GROQ_API_KEY"),
)

# Simple in-memory cache (in production, use Redis or similar)
video_cache = {}
CACHE_EXPIRY_HOURS = 24

class TranscriptionResult(BaseModel):
    text: str
    start: float
    duration: float

class ImportantSegments(BaseModel):
    segments: List[float]

class SkipSegment(BaseModel):
    start: float
    end: float
    confidence: Optional[float] = None
    reason: Optional[str] = None

class UserPreferences(BaseModel):
    default_categories: List[str] = []
    custom_keywords: List[str] = []
    custom_phrases: List[str] = []
    sensitivity: str = "medium"  # low, medium, high
    enabled: bool = True

    model_config = ConfigDict(frozen=True)

class ProcessVideoRequest(BaseModel):
    video_id: str
    user_preferences: Optional[UserPreferences] = None

class ProcessResult(BaseModel):
    transcription: List[TranscriptionResult]
    remove: List[SkipSegment]
    processing_time: float
    total_duration: float
    skip_percentage: float

class VideoMetadata(BaseModel):
    video_id: str
    duration: float
    word_count: int
    processing_time: float

# Default skip categories
DEFAULT_SKIP_CATEGORIES = {
    "advertisements": {
        "keywords": ["sponsor", "sponsored", "ad", "advertisement", "promo", "promotion", "affiliate", "discount code", "coupon"],
        "phrases": ["this video is sponsored by", "today's sponsor", "check out the link", "use my discount code", "affiliate link"]
    },
    "calls_to_action": {
        "keywords": ["subscribe", "like", "notification", "bell", "share", "comment", "follow", "patreon"],
        "phrases": ["like and subscribe", "hit the notification bell", "don't forget to subscribe", "smash that like button", "ring the bell"]
    },
    "political_content": {
        "keywords": ["politics", "political", "democrat", "republican", "liberal", "conservative", "election", "vote", "politician", "government policy"],
        "phrases": ["political views", "my political opinion", "politically speaking", "left wing", "right wing"]
    },
    "negative_content": {
        "keywords": ["drama", "controversy", "hate", "toxic", "negative", "complain", "rant", "angry", "furious", "outrage"],
        "phrases": ["negative things", "bad news", "controversial topic", "hate to say", "really bothers me"]
    },
    "kids_content": {
        "keywords": ["kid", "children", "cartoon", "toy", "playground", "kindergarten", "childish", "baby"],
        "phrases": ["for kids", "children's content", "kid jokes", "silly jokes", "kidding around"]
    },
    "self_promotion": {
        "keywords": ["merch", "merchandise", "course", "book", "product", "website", "channel", "patreon", "onlyfans"],
        "phrases": ["check out my", "buy my", "my new course", "link in description", "visit my website"]
    },
    "repetitive_content": {
        "keywords": ["again", "repeat", "basically", "essentially", "fundamentally", "obviously", "clearly"],
        "phrases": ["as I said before", "like I mentioned", "to reiterate", "once again", "let me repeat"]
    },
    "filler_speech": {
        "keywords": ["um", "uh", "er", "like", "literally", "actually", "basically", "you know", "sort of", "kind of"],
        "phrases": ["you know what I mean", "if you will", "so to speak", "how do I put this"]
    },
    "technical_jargon": {
        "keywords": ["algorithm", "optimization", "parameter", "configuration", "implementation", "debugging", "refactoring"],
        "phrases": ["technical details", "under the hood", "implementation details", "advanced concepts"]
    },
    "personal_stories": {
        "keywords": ["personal", "story", "experience", "happened", "remember", "childhood", "family"],
        "phrases": ["personal story", "back in my day", "when I was", "my experience", "let me tell you"]
    }
}

def get_cache_key(video_id: str, transcript_hash: str, preferences_hash: str = "") -> str:
    """Generate cache key for video processing results including preferences"""
    return f"{video_id}_{transcript_hash[:16]}_{preferences_hash[:8]}"

def get_preferences_hash(preferences: Optional[UserPreferences]) -> str:
    """Generate hash for user preferences to include in cache key"""
    if not preferences:
        return "default"
    
    prefs_str = json.dumps({
        "categories": sorted(preferences.default_categories),
        "keywords": sorted(preferences.custom_keywords),
        "phrases": sorted(preferences.custom_phrases),
        "sensitivity": preferences.sensitivity
    }, sort_keys=True)
    return hashlib.md5(prefs_str.encode()).hexdigest()

def is_cache_valid(cache_entry: dict) -> bool:
    """Check if cache entry is still valid"""
    if not cache_entry:
        return False
    cache_time = cache_entry.get('timestamp', 0)
    return (time.time() - cache_time) < (CACHE_EXPIRY_HOURS * 3600)

def calculate_transcript_hash(transcription_data: List[TranscriptionResult]) -> str:
    """Calculate hash of transcript for cache validation"""
    transcript_text = "".join([seg.text for seg in transcription_data])
    return hashlib.md5(transcript_text.encode()).hexdigest()

def optimize_transcript_for_llm(transcription_data: List[TranscriptionResult], max_tokens: int = 120000) -> str:
    """Optimize transcript for LLM processing - Llama 4 Scout has 128K context window"""
    
    # Calculate approximate token count (rough estimate: 1 token ≈ 4 characters)
    full_text = "\n".join([f"{seg.start:.1f}s: {seg.text}" for seg in transcription_data])
    estimated_tokens = len(full_text) // 4
    
    # Llama 4 Scout has much larger context window, so we can be less aggressive
    if estimated_tokens <= max_tokens:
        return full_text
    
    # If too long, use strategic chunking but keep more content
    total_duration = transcription_data[-1].start + transcription_data[-1].duration
    
    important_segments = []
    
    # Include beginning (first 40%)
    cutoff_40 = total_duration * 0.4
    for seg in transcription_data:
        if seg.start <= cutoff_40:
            important_segments.append(f"{seg.start:.1f}s: {seg.text}")
    
    # Sample middle sections (every 3rd segment instead of 5th)
    middle_start = total_duration * 0.4
    middle_end = total_duration * 0.75
    middle_segments = [seg for seg in transcription_data if middle_start < seg.start < middle_end]
    for i, seg in enumerate(middle_segments):
        if i % 3 == 0:  # Every 3rd segment for more context
            important_segments.append(f"{seg.start:.1f}s: {seg.text}")
    
    # Include end (last 25%)
    cutoff_75 = total_duration * 0.75
    for seg in transcription_data:
        if seg.start >= cutoff_75:
            important_segments.append(f"{seg.start:.1f}s: {seg.text}")
    
    return "\n".join(important_segments)

def get_optimized_prompt_with_preferences(
    video_duration: float, 
    word_count: int, 
    preferences: Optional[UserPreferences] = None
) -> str:
    """Generate optimized prompt for Llama 4 Scout model with user preferences"""
    
    base_prompt = """You are an expert video editor with advanced pattern recognition. Analyze the transcript and identify precise start times of segments that should be skipped based on user preferences.

CRITICAL: Return ONLY a JSON object with start times: {"segments": [12.5, 45.2, 89.7]}

ALWAYS SKIP THESE SEGMENTS:
🎯 HIGH PRIORITY:
- Filler speech: "um", "uh", "er", "like", "you know", "basically"
- Long pauses or dead air (>3 seconds)"""

    # Add user-specific skip preferences
    if preferences and preferences.enabled:
        if preferences.default_categories:
            base_prompt += "\n\n🎯 USER SELECTED CATEGORIES TO SKIP:"
            for category in preferences.default_categories:
                if category in DEFAULT_SKIP_CATEGORIES:
                    cat_data = DEFAULT_SKIP_CATEGORIES[category]
                    base_prompt += f"\n- {category.replace('_', ' ').title()}: {', '.join(cat_data['keywords'][:5])}"
        
        if preferences.custom_keywords:
            base_prompt += f"\n\n🎯 CUSTOM KEYWORDS TO SKIP: {', '.join(preferences.custom_keywords)}"
        
        if preferences.custom_phrases:
            base_prompt += f"\n\n🎯 CUSTOM PHRASES TO SKIP: {', '.join(preferences.custom_phrases)}"
        
        # Adjust sensitivity
        if preferences.sensitivity == "high":
            base_prompt += "\n\n⚡ HIGH SENSITIVITY: Be aggressive in identifying skip segments. Target 20-30% reduction."
        elif preferences.sensitivity == "low":
            base_prompt += "\n\n🎯 LOW SENSITIVITY: Only skip obvious and disruptive content. Target 5-10% reduction."
        else:
            base_prompt += "\n\n⚖️ MEDIUM SENSITIVITY: Balance between content preservation and skip effectiveness. Target 10-20% reduction."
    
    base_prompt += """

🎯 ALWAYS PRESERVE:
- Core educational/entertainment content
- Key examples and demonstrations
- Important transitions between topics
- Critical explanations and insights

ANALYSIS GUIDELINES:
- Focus on segments that interrupt content flow or match user preferences
- Prioritize skips that save time without losing meaning
- Consider pacing - don't over-skip fast-paced content
- Preserve context needed for understanding"""

    # Adjust criteria based on video characteristics
    if video_duration > 1800:  # 30+ minutes
        base_prompt += "\n\n📹 LONG VIDEO: Be more aggressive with repetitive content and lengthy explanations."
    elif video_duration < 300:  # Under 5 minutes
        base_prompt += "\n\n📹 SHORT VIDEO: Only skip obvious filler and user-specified content."
    else:
        base_prompt += "\n\n📹 MEDIUM VIDEO: Balance engagement with user preferences."
    
    if word_count > 3000:
        base_prompt += "\n💬 HIGH DENSITY: Look for verbose explanations that can be condensed."
    
    return base_prompt

def matches_user_preferences(segment: TranscriptionResult, preferences: Optional[UserPreferences]) -> tuple[bool, str, float]:
    """Check if segment matches user skip preferences"""
    if not preferences or not preferences.enabled:
        return False, "", 0.0
    
    text = segment.text.lower()
    
    # Check default categories
    for category in preferences.default_categories:
        if category in DEFAULT_SKIP_CATEGORIES:
            cat_data = DEFAULT_SKIP_CATEGORIES[category]
            
            # Check keywords
            for keyword in cat_data["keywords"]:
                if keyword.lower() in text:
                    confidence = 0.8 if preferences.sensitivity == "high" else 0.6
                    return True, f"User preference: {category.replace('_', ' ').title()}", confidence
            
            # Check phrases
            for phrase in cat_data["phrases"]:
                if phrase.lower() in text:
                    confidence = 0.9 if preferences.sensitivity == "high" else 0.7
                    return True, f"User preference: {category.replace('_', ' ').title()}", confidence
    
    # Check custom keywords
    for keyword in preferences.custom_keywords:
        if keyword.lower() in text:
            confidence = 0.9 if preferences.sensitivity == "high" else 0.7
            return True, f"Custom keyword: {keyword}", confidence
    
    # Check custom phrases
    for phrase in preferences.custom_phrases:
        if phrase.lower() in text:
            confidence = 0.95 if preferences.sensitivity == "high" else 0.8
            return True, f"Custom phrase: {phrase}", confidence
    
    return False, "", 0.0

def create_enhanced_skip_segments(
    data: List[TranscriptionResult],
    non_important_segments: ImportantSegments,
    preferences: Optional[UserPreferences] = None,
    buffer_time: float = 0.5
) -> List[SkipSegment]:
    """Enhanced skip segment creation with user preferences and confidence scoring"""
    
    if not non_important_segments.segments:
        return []

    sorted_data = sorted(data, key=lambda x: x.start)
    sorted_starts = sorted(non_important_segments.segments)
    skip_segments = []
    
    total_duration = sorted_data[-1].start + sorted_data[-1].duration if sorted_data else 0
    
    # First, check all segments for user preference matches
    for segment in sorted_data:
        matches, reason, confidence = matches_user_preferences(segment, preferences)
        if matches:
            segment_start = max(0, segment.start - buffer_time)
            segment_end = min(total_duration, segment.start + segment.duration + buffer_time)
            
            # Merge with previous segment if they overlap
            if skip_segments and segment_start <= skip_segments[-1].end + 1.0:
                skip_segments[-1].end = segment_end
                skip_segments[-1].confidence = max(skip_segments[-1].confidence or 0, confidence)
                if skip_segments[-1].reason != reason:
                    skip_segments[-1].reason = f"{skip_segments[-1].reason}, {reason}"
            else:
                skip_segments.append(SkipSegment(
                    start=segment_start,
                    end=segment_end,
                    confidence=confidence,
                    reason=reason
                ))
    
    # Then, process LLM-identified segments
    for start_time in sorted_starts:
        # Find the segment that contains this start time
        matching_segment = None
        for seg in sorted_data:
            if seg.start <= start_time <= seg.start + seg.duration:
                matching_segment = seg
                break
        
        if not matching_segment:
            continue
        
        # Check if already covered by user preferences
        already_covered = any(
            skip_seg.start <= matching_segment.start <= skip_seg.end 
            for skip_seg in skip_segments
        )
        
        if already_covered:
            continue
        
        # Calculate confidence based on segment characteristics
        confidence = calculate_skip_confidence(matching_segment, sorted_data)
        
        # Adjust confidence threshold based on user sensitivity
        min_confidence = 0.3 if preferences and preferences.sensitivity == "high" else 0.4
        if confidence < min_confidence:
            continue
            
        segment_start = max(0, matching_segment.start - buffer_time)
        segment_end = min(total_duration, matching_segment.start + matching_segment.duration + buffer_time)
        
        # Determine skip reason
        reason = classify_skip_reason(matching_segment)
        
        # Merge with previous segment if they overlap
        if skip_segments and segment_start <= skip_segments[-1].end + 1.0:
            skip_segments[-1].end = segment_end
            skip_segments[-1].confidence = max(skip_segments[-1].confidence or 0, confidence)
            if skip_segments[-1].reason != reason:
                skip_segments[-1].reason = f"{skip_segments[-1].reason}, {reason}"
        else:
            skip_segments.append(SkipSegment(
                start=segment_start,
                end=segment_end,
                confidence=confidence,
                reason=reason
            ))
    
    # Filter out very short segments (less than 1.5 seconds)
    skip_segments = [seg for seg in skip_segments if seg.end - seg.start >= 1.5]
    
    # Sort by start time
    skip_segments.sort(key=lambda x: x.start)
    
    return skip_segments

def calculate_skip_confidence(segment: TranscriptionResult, all_segments: List[TranscriptionResult]) -> float:
    """Calculate confidence score for skipping a segment"""
    text = segment.text.lower()
    confidence = 0.4  # Lower base confidence for more precise filtering
    
    # Increase confidence for filler words
    filler_words = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'so', 'yeah', 'right']
    filler_count = sum(text.count(word) for word in filler_words)
    confidence += min(filler_count * 0.15, 0.4)
    
    # Increase confidence for repetitive content
    if len(set(text.split())) < len(text.split()) * 0.6:  # High repetition
        confidence += 0.3
    
    # Increase confidence for very short segments with little content
    duration = segment.duration
    if duration < 2.0 and len(text.split()) < 5:
        confidence += 0.2
    
    # Decrease confidence for segments with numbers (might be important data)
    if any(char.isdigit() for char in text):
        confidence -= 0.15
    
    # Increase confidence for promotional language
    promo_words = ['sponsor', 'subscribe', 'like and subscribe', 'check out', 'link in description', 'patreon', 'merch']
    if any(word in text for word in promo_words):
        confidence += 0.35
    
    # Increase confidence for intros/outros
    intro_outro_words = ['welcome back', 'thanks for watching', 'see you next time', 'don\'t forget to']
    if any(phrase in text for phrase in intro_outro_words):
        confidence += 0.25
    
    # Decrease confidence for technical terms or specific keywords
    technical_indicators = ['algorithm', 'function', 'variable', 'method', 'process', 'system']
    if any(word in text for word in technical_indicators):
        confidence -= 0.1
    
    return min(max(confidence, 0.0), 1.0)

def classify_skip_reason(segment: TranscriptionResult) -> str:
    """Classify the reason for skipping a segment"""
    text = segment.text.lower()
    
    if any(word in text for word in ['sponsor', 'ad', 'advertisement', 'promo']):
        return "Advertisement"
    elif any(word in text for word in ['subscribe', 'like and subscribe', 'bell icon', 'notification']):
        return "Call to Action"
    elif any(word in text for word in ['um', 'uh', 'er']) and len(text.split()) < 10:
        return "Filler Speech"
    elif segment.duration > 10 and len(set(text.split())) < len(text.split()) * 0.6:
        return "Repetitive Content"
    elif any(phrase in text for phrase in ['welcome back', 'thanks for watching']):
        return "Intro/Outro"
    else:
        return "Non-Essential Content"

@app.get("/process_video", response_model=ProcessResult)
async def process_video(video_id: str, user_preferences: Optional[UserPreferences] = None):
    start_time = time.time()
    
    # Extract transcript
    try:
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        transcript = transcript_list.find_transcript(['en'])
        data = transcript.fetch()
        
        if not data:
            raise NoTranscriptFound
            
        transcription_data = [TranscriptionResult(**segment) for segment in data]
        
    except TranscriptsDisabled:
        raise HTTPException(status_code=400, detail="Transcripts are disabled for this video.")
    except NoTranscriptFound:
        raise HTTPException(status_code=400, detail="No transcript found for this video.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching transcript: {str(e)}")

    # Calculate metadata
    total_duration = transcription_data[-1].start + transcription_data[-1].duration if transcription_data else 0
    word_count = sum(len(seg.text.split()) for seg in transcription_data)
    transcript_hash = calculate_transcript_hash(transcription_data)
    preferences_hash = get_preferences_hash(user_preferences)
    cache_key = get_cache_key(video_id, transcript_hash, preferences_hash)
    
    # Check cache
    if cache_key in video_cache and is_cache_valid(video_cache[cache_key]):
        cached_result = video_cache[cache_key]
        return ProcessResult(
            transcription=transcription_data,
            remove=cached_result['skip_segments'],
            processing_time=time.time() - start_time,
            total_duration=total_duration,
            skip_percentage=cached_result['skip_percentage']
        )
    
    # Optimize transcript for LLM processing
    optimized_transcript = optimize_transcript_for_llm(transcription_data)
    
    # Get optimized prompt
    prompt = get_optimized_prompt_with_preferences(total_duration, word_count, user_preferences)
    full_prompt = f"{prompt}\n\nTranscript:\n{optimized_transcript}"
    
    # Log the prompt being used
    # logger.info(f"Processing video {video_id} with user preferences: {user_preferences}")
    logger.info(f"Generated prompt for video {video_id}:\n{prompt}")
    # logger.info(f"Full prompt length: {len(full_prompt)} characters")
    
    try:
        # Call Groq with Llama 4 Scout for ultra-fast inference
        response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "system", 
                    "content": "You are a precision video editing AI. Analyze patterns and return only JSON with skip timestamps. Focus on segments that truly diminish viewer experience."
                },
                {
                    "role": "user", 
                    "content": full_prompt
                }
            ],
            response_format={"type": "json_object"},
            temperature=0.1,  # Very low temperature for consistency
            max_completion_tokens=2048  # Increased for detailed analysis
        )
        
        response_content = response.choices[0].message.content
        response_json = json.loads(response_content)
        segments = response_json.get('segments', [])
        
        # Log the LLM response
        # logger.info(f"LLM response for video {video_id}: {response_content}")
        # logger.info(f"Extracted {len(segments)} skip segments: {segments}")
        
        non_important_segments = ImportantSegments(segments=segments)
        skip_segments = create_enhanced_skip_segments(transcription_data, non_important_segments, user_preferences)
        
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse LLM response")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing with Groq: {str(e)}")
    
    # Calculate skip percentage
    total_skip_time = sum(seg.end - seg.start for seg in skip_segments)
    skip_percentage = (total_skip_time / total_duration * 100) if total_duration > 0 else 0
    
    # Cache the result
    video_cache[cache_key] = {
        'skip_segments': skip_segments,
        'skip_percentage': skip_percentage,
        'timestamp': time.time()
    }
    
    processing_time = time.time() - start_time
    
    return ProcessResult(
        transcription=transcription_data,
        remove=skip_segments,
        processing_time=processing_time,
        total_duration=total_duration,
        skip_percentage=skip_percentage
    )

@app.post("/process_video", response_model=ProcessResult)
async def process_video_post(request: ProcessVideoRequest):
    """Process video with user preferences via POST request"""
    return await process_video(request.video_id, request.user_preferences)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy", 
        "cache_size": len(video_cache),
        "model": "meta-llama/llama-4-scout-17b-16e-instruct",
        "provider": "Groq"
    }

@app.delete("/cache/{video_id}")
async def clear_video_cache(video_id: str):
    """Clear cache for specific video"""
    removed_keys = [key for key in video_cache.keys() if key.startswith(video_id)]
    for key in removed_keys:
        del video_cache[key]
    return {"message": f"Cleared {len(removed_keys)} cache entries for video {video_id}"}

@app.get("/api/stats")
async def get_api_stats():
    """Get API usage statistics"""
    return {
        "total_cached_videos": len(video_cache),
        "model_info": {
            "name": "meta-llama/llama-4-scout-17b-16e-instruct",
            "provider": "Groq",
            "context_window": "128K tokens",
            "features": ["ultra-fast inference", "multimodal", "JSON mode"]
        }
    }

@app.get("/preferences/categories")
async def get_default_categories():
    """Get available default skip categories"""
    categories = {}
    for category, data in DEFAULT_SKIP_CATEGORIES.items():
        categories[category] = {
            "name": category.replace('_', ' ').title(),
            "description": f"Keywords: {', '.join(data['keywords'][:3])}...",
            "keyword_count": len(data['keywords']),
            "phrase_count": len(data['phrases'])
        }
    return {
        "categories": categories,
        "total_categories": len(categories)
    }

@app.get("/preferences/category/{category_name}")
async def get_category_details(category_name: str):
    """Get detailed information about a specific category"""
    if category_name not in DEFAULT_SKIP_CATEGORIES:
        raise HTTPException(status_code=404, detail="Category not found")
    
    category_data = DEFAULT_SKIP_CATEGORIES[category_name]
    return {
        "name": category_name.replace('_', ' ').title(),
        "keywords": category_data["keywords"],
        "phrases": category_data["phrases"],
        "total_terms": len(category_data["keywords"]) + len(category_data["phrases"])
    }
