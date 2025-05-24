# 🚀 YT_Skip API Reference

Complete API documentation for the YouTube Transcript Skipper service.

## Base URL
```
http://localhost:8000
```

## Quick Start

### Basic Video Processing
```bash
curl -X GET "http://localhost:8000/process_video?video_id=dQw4w9WgXcQ"
```

### With User Preferences
```bash
curl -X POST "http://localhost:8000/process_video" \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "dQw4w9WgXcQ",
    "user_preferences": {
      "default_categories": ["advertisements", "calls_to_action"],
      "sensitivity": "high",
      "enabled": true
    }
  }'
```

---

## 📚 Endpoints

### 1. Process Video (GET)
**Endpoint:** `GET /process_video`

**Parameters:**
- `video_id` (required): YouTube video ID (11 characters)
- `user_preferences` (optional): JSON object with preferences

**Response:**
```json
{
  "transcription": [
    {
      "text": "Welcome to my channel",
      "start": 0.0,
      "duration": 2.5
    }
  ],
  "remove": [
    {
      "start": 15.2,
      "end": 18.7,
      "confidence": 0.85,
      "reason": "Call to Action"
    }
  ],
  "processing_time": 1.23,
  "total_duration": 180.5,
  "skip_percentage": 12.4
}
```

---

### 2. Process Video (POST)
**Endpoint:** `POST /process_video`

**Request Body:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "user_preferences": {
    "default_categories": ["advertisements", "calls_to_action"],
    "custom_keywords": ["crypto", "sponsor"],
    "custom_phrases": ["my opinion"],
    "sensitivity": "medium",
    "enabled": true
  }
}
```

**Response:** Same as GET endpoint

---

### 3. Health Check
**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "healthy",
  "cache_size": 42,
  "model": "meta-llama/llama-4-scout-17b-16e-instruct",
  "provider": "Groq"
}
```

---

### 4. API Statistics
**Endpoint:** `GET /api/stats`

**Response:**
```json
{
  "total_cached_videos": 42,
  "model_info": {
    "name": "meta-llama/llama-4-scout-17b-16e-instruct",
    "provider": "Groq",
    "context_window": "128K tokens",
    "features": ["ultra-fast inference", "multimodal", "JSON mode"]
  }
}
```

---

### 5. Clear Cache
**Endpoint:** `DELETE /cache/{video_id}`

**Example:**
```bash
curl -X DELETE "http://localhost:8000/cache/dQw4w9WgXcQ"
```

**Response:**
```json
{
  "message": "Cleared 3 cache entries for video dQw4w9WgXcQ"
}
```

---

### 6. Get Skip Categories
**Endpoint:** `GET /preferences/categories`

**Response:**
```json
{
  "categories": {
    "advertisements": {
      "name": "Advertisements",
      "description": "Keywords: sponsor, sponsored, ad...",
      "keyword_count": 9,
      "phrase_count": 5
    }
  },
  "total_categories": 10
}
```

---

### 7. Get Category Details
**Endpoint:** `GET /preferences/category/{category_name}`

**Example:**
```bash
curl -X GET "http://localhost:8000/preferences/category/advertisements"
```

**Response:**
```json
{
  "name": "Advertisements",
  "keywords": ["sponsor", "sponsored", "ad"],
  "phrases": ["sponsored by", "today's sponsor"],
  "total_terms": 14
}
```

---

## 🔍 Data Models

### UserPreferences
```typescript
interface UserPreferences {
  default_categories: string[];    // Available categories
  custom_keywords: string[];       // Custom words to skip
  custom_phrases: string[];        // Custom phrases to skip
  sensitivity: "low" | "medium" | "high";
  enabled: boolean;
}
```

### SkipSegment
```typescript
interface SkipSegment {
  start: number;        // Start time in seconds
  end: number;          // End time in seconds
  confidence: number;   // 0.0 to 1.0
  reason: string;       // Classification
}
```

### TranscriptionResult
```typescript
interface TranscriptionResult {
  text: string;         // Transcript text
  start: number;        // Start time in seconds
  duration: number;     // Duration in seconds
}
```

---

## ⚠️ Error Responses

### 400 Bad Request
```json
{
  "detail": "Transcripts are disabled for this video."
}
```

### 404 Not Found
```json
{
  "detail": "Category not found"
}
```

### 500 Internal Server Error
```json
{
  "detail": "Error processing with Groq: API rate limit exceeded"
}
```

---

## 🎯 Available Skip Categories

| Category | Description | Example Keywords |
|----------|-------------|------------------|
| `advertisements` | Sponsored content | sponsor, ad, promo |
| `calls_to_action` | Subscribe prompts | subscribe, like, bell |
| `political_content` | Political discussions | politics, election |
| `negative_content` | Drama, controversies | drama, toxic, hate |
| `kids_content` | Children-focused | kids, cartoon, toy |
| `self_promotion` | Personal products | merch, course, patreon |
| `repetitive_content` | Repeated info | again, repeat |
| `filler_speech` | Um, uh, like | um, uh, basically |
| `technical_jargon` | Complex tech details | algorithm, debugging |
| `personal_stories` | Personal anecdotes | personal, story |

---

## 🔧 Configuration Examples

### Conservative Skipping
```json
{
  "user_preferences": {
    "default_categories": ["advertisements"],
    "sensitivity": "low",
    "enabled": true
  }
}
```

### Aggressive Skipping
```json
{
  "user_preferences": {
    "default_categories": [
      "advertisements",
      "calls_to_action", 
      "filler_speech",
      "repetitive_content"
    ],
    "custom_keywords": ["sponsor", "merch"],
    "sensitivity": "high",
    "enabled": true
  }
}
```

### Custom Content Filtering
```json
{
  "user_preferences": {
    "custom_keywords": ["crypto", "NFT", "trading"],
    "custom_phrases": ["not financial advice", "my opinion"],
    "sensitivity": "medium",
    "enabled": true
  }
}
```

---

## 🐛 Common Issues & Solutions

### Issue: No Transcript Available
**Error:** `400 Bad Request - "Transcripts are disabled for this video"`

**Solutions:**
- Check if video has captions enabled
- Try videos with auto-generated captions
- Use videos in English for best results

### Issue: Rate Limiting
**Error:** `500 Internal Server Error - "API rate limit exceeded"`

**Solutions:**
- Wait a few seconds and retry
- Check Groq API quotas
- Implement exponential backoff

### Issue: Slow Processing
**Symptoms:** Long response times (>10 seconds)

**Solutions:**
- Check video length (very long videos take more time)
- Verify API key is correct
- Check network connectivity to Groq

### Issue: Invalid Video ID
**Error:** Various errors during processing

**Solutions:**
- Ensure video ID is exactly 11 characters
- Verify video exists and is public
- Extract ID from YouTube URL correctly

---

## 📊 Performance Guidelines

### Response Time Expectations
- **Cache hit**: <0.1 seconds
- **Short video** (<5 min): 0.5-1 second
- **Medium video** (5-30 min): 1-2 seconds
- **Long video** (30+ min): 2-4 seconds

### Optimization Tips
- Use caching for repeated requests
- Process videos during off-peak hours
- Batch process multiple videos with delays

---

## 🧪 Testing Commands

### Health Check
```bash
curl -X GET "http://localhost:8000/health"
```

### Test Basic Processing
```bash
curl -X GET "http://localhost:8000/process_video?video_id=dQw4w9WgXcQ"
```

### Test with Preferences
```bash
curl -X POST "http://localhost:8000/process_video" \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "dQw4w9WgXcQ",
    "user_preferences": {
      "default_categories": ["advertisements"],
      "sensitivity": "high",
      "enabled": true
    }
  }'
```

### Check Statistics
```bash
curl -X GET "http://localhost:8000/api/stats"
```

### List Categories
```bash
curl -X GET "http://localhost:8000/preferences/categories"
```

---

## 🔐 Security & Best Practices

### Environment Variables
```bash
# Required
GROQ_API_KEY=your_groq_api_key

# Optional
DEV_MODE=false  # Set to false in production
```

### Input Validation
- Video IDs are validated for correct format
- User preferences are sanitized
- Request bodies are size-limited

### Rate Limiting
- Groq API has built-in rate limits
- Implement client-side backoff strategies
- Monitor usage via `/api/stats`

---

## 📝 Integration Examples

### JavaScript/TypeScript
```typescript
async function processVideo(videoId: string, preferences?: UserPreferences) {
  const response = await fetch('/process_video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_id: videoId,
      user_preferences: preferences
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail);
  }

  return await response.json();
}
```

### Python
```python
import requests

def process_video(video_id, preferences=None):
    url = "http://localhost:8000/process_video"
    data = {
        "video_id": video_id,
        "user_preferences": preferences
    }
    
    response = requests.post(url, json=data)
    response.raise_for_status()
    return response.json()
```

### Chrome Extension
```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'processVideo') {
    fetch('http://localhost:8000/process_video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request.data)
    })
    .then(response => response.json())
    .then(data => sendResponse(data))
    .catch(error => sendResponse({ error: error.message }));
    
    return true; // Keep channel open for async response
  }
});
```

---

## 📞 Support

For additional help:
- Check the main README for setup instructions
- Open an issue on GitHub for bugs
- Review the USER_PREFERENCES_GUIDE.md for advanced usage

**Base API URL:** `http://localhost:8000`  
**Model:** Meta Llama 4 Scout 17B via Groq  
**Context Window:** 128K tokens  
**Average Response Time:** 0.5-2 seconds 