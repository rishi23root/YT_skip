# YT_Skip - Ultra-Fast YouTube Video Optimizer

## Description
YT_Skip is an AI-powered tool that automatically identifies and skips unnecessary parts of YouTube videos using cutting-edge language models. Powered by **Groq's ultra-fast inference** and **Meta's Llama 4 Scout** model, it delivers lightning-speed analysis to enhance your viewing experience by removing filler content, advertisements, and redundant explanations.

## 🚀 New Features (v2.0)
- **⚡ Ultra-Fast Processing**: Powered by Groq's high-speed inference infrastructure
- **🧠 Advanced AI**: Uses Meta's Llama 4 Scout 17B model with 128K context window
- **🎯 Precision Skipping**: Enhanced confidence scoring for more accurate skip detection
- **📊 Smart Analysis**: Adaptive prompting based on video characteristics
- **🔍 Detailed Categorization**: Skip segments are classified by reason (ads, filler, etc.)
- **💾 Intelligent Caching**: Reduces processing time for repeat requests
- **🎨 User Preferences**: Customizable skip categories and sensitivity levels
- **🛡️ Robust Error Handling**: Comprehensive error responses and edge case management

## Features
- **Automatic Detection**: AI-powered identification of non-essential video segments
- **Smart Categorization**: Classifies skips as advertisements, filler speech, repetitive content, etc.
- **User Preferences**: 10+ predefined categories plus custom keywords/phrases
- **Confidence Scoring**: Each skip segment includes a confidence score
- **Real-time Processing**: Ultra-fast response times with Groq infrastructure
- **Caching System**: Efficient caching to minimize API calls
- **RESTful API**: Easy integration with Chrome extensions and other tools
- **Health Monitoring**: Built-in health checks and usage statistics

## 🏗️ Architecture
- **Backend**: FastAPI with Python 3.10
- **AI Provider**: Groq Cloud (ultra-fast inference)
- **Model**: Meta Llama 4 Scout 17B 16E Instruct
- **Transcript Source**: YouTube Transcript API
- **Containerization**: Docker with Docker Compose

## Installation

### Prerequisites
- Docker and Docker Compose
- Groq API Key ([Get one free here](https://console.groq.com/))

### Quick Start
1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd YouTube-Transcript-Summarizer
   ```

2. Set your Groq API key in `docker-compose.yml`:
   ```yaml
   environment:
     - GROQ_API_KEY=your_groq_api_key
   ```

3. Run with Docker Compose:
   ```bash
   docker-compose up --build
   ```

4. Test the integration:
   ```bash
   export GROQ_API_KEY=your_api_key
   python test_groq.py
   ```

### Development Setup
```bash
pip install -r requirements.txt
export GROQ_API_KEY=your_groq_api_key
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

## 🔧 API Documentation

### Base URL
```
http://localhost:8000
```

### Authentication
All endpoints require the `GROQ_API_KEY` to be set in the environment. No additional authentication is needed for individual requests.

---

### 📺 Process Video (GET)

**Endpoint:** `GET /process_video`

**Description:** Process a YouTube video to identify skip segments with optional user preferences.

**Parameters:**
- `video_id` (string, required): YouTube video ID (11 characters)
- `user_preferences` (UserPreferences, optional): Skip preferences object

**Example Request:**
```bash
curl -X GET "http://localhost:8000/process_video?video_id=dQw4w9WgXcQ"
```

**Example Response:**
```json
{
  "transcription": [
    {
      "text": "Welcome back to my channel",
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

### 📺 Process Video (POST)

**Endpoint:** `POST /process_video`

**Description:** Process a YouTube video with detailed user preferences via POST body.

**Request Body:**
```json
{
  "video_id": "dQw4w9WgXcQ",
  "user_preferences": {
    "default_categories": ["advertisements", "calls_to_action"],
    "custom_keywords": ["crypto", "NFT"],
    "custom_phrases": ["my personal opinion"],
    "sensitivity": "medium",
    "enabled": true
  }
}
```

**Example Request:**
```bash
curl -X POST "http://localhost:8000/process_video" \
  -H "Content-Type: application/json" \
  -d '{
    "video_id": "dQw4w9WgXcQ",
    "user_preferences": {
      "default_categories": ["advertisements"],
      "custom_keywords": ["sponsor"],
      "sensitivity": "high",
      "enabled": true
    }
  }'
```

**Response:** Same as GET endpoint

---

### 🏥 Health Check

**Endpoint:** `GET /health`

**Description:** Check service health and cache status.

**Example Request:**
```bash
curl -X GET "http://localhost:8000/health"
```

**Example Response:**
```json
{
  "status": "healthy",
  "cache_size": 42,
  "model": "meta-llama/llama-4-scout-17b-16e-instruct",
  "provider": "Groq"
}
```

---

### 📊 API Statistics

**Endpoint:** `GET /api/stats`

**Description:** Get detailed API usage statistics and model information.

**Example Request:**
```bash
curl -X GET "http://localhost:8000/api/stats"
```

**Example Response:**
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

### 🗑️ Clear Cache

**Endpoint:** `DELETE /cache/{video_id}`

**Description:** Clear cache entries for a specific video.

**Parameters:**
- `video_id` (string, required): YouTube video ID

**Example Request:**
```bash
curl -X DELETE "http://localhost:8000/cache/dQw4w9WgXcQ"
```

**Example Response:**
```json
{
  "message": "Cleared 3 cache entries for video dQw4w9WgXcQ"
}
```

---

### 📋 Get Skip Categories

**Endpoint:** `GET /preferences/categories`

**Description:** Get all available default skip categories with descriptions.

**Example Request:**
```bash
curl -X GET "http://localhost:8000/preferences/categories"
```

**Example Response:**
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

### 📋 Get Category Details

**Endpoint:** `GET /preferences/category/{category_name}`

**Description:** Get detailed information about a specific skip category.

**Parameters:**
- `category_name` (string, required): Category name (e.g., "advertisements")

**Example Request:**
```bash
curl -X GET "http://localhost:8000/preferences/category/advertisements"
```

**Example Response:**
```json
{
  "name": "Advertisements",
  "keywords": ["sponsor", "sponsored", "ad", "advertisement"],
  "phrases": ["this video is sponsored by", "today's sponsor"],
  "total_terms": 14
}
```

---

## 🔍 Data Models

### UserPreferences
```json
{
  "default_categories": ["string"],  // Available: advertisements, calls_to_action, etc.
  "custom_keywords": ["string"],     // Custom words to skip
  "custom_phrases": ["string"],      // Custom phrases to skip
  "sensitivity": "string",           // "low" | "medium" | "high"
  "enabled": true                    // Enable/disable preferences
}
```

### SkipSegment
```json
{
  "start": 15.2,           // Start time in seconds
  "end": 18.7,             // End time in seconds
  "confidence": 0.85,      // Confidence score (0.0-1.0)
  "reason": "Advertisement" // Classification reason
}
```

### TranscriptionResult
```json
{
  "text": "Hello everyone",  // Transcript text
  "start": 0.0,           // Start time in seconds
  "duration": 2.5         // Duration in seconds
}
```

---

## ⚠️ Error Handling & Edge Cases

### Common Error Responses

#### 400 Bad Request - Transcripts Disabled
```json
{
  "detail": "Transcripts are disabled for this video."
}
```

#### 400 Bad Request - No Transcript Found
```json
{
  "detail": "No transcript found for this video."
}
```

#### 404 Not Found - Invalid Category
```json
{
  "detail": "Category not found"
}
```

#### 500 Internal Server Error - Processing Failed
```json
{
  "detail": "Error processing with Groq: API rate limit exceeded"
}
```

### Edge Cases & Solutions

#### 1. **Very Long Videos (>3 hours)**
- **Issue**: Transcript exceeds token limits
- **Handling**: Smart chunking preserves beginning, middle samples, and end
- **Result**: Maintains quality while fitting context window

#### 2. **Videos Without Transcripts**
- **Issue**: Auto-generated transcripts disabled or unavailable
- **Handling**: Returns 400 error with clear message
- **Solution**: Check video has captions before processing

#### 3. **Very Short Videos (<30 seconds)**
- **Issue**: Minimal content to analyze
- **Handling**: Reduced sensitivity, preserves most content
- **Result**: Conservative skipping to maintain value

#### 4. **Non-English Content**
- **Issue**: AI model optimized for English
- **Handling**: Attempts processing but may have reduced accuracy
- **Solution**: Works best with English transcripts

#### 5. **Rate Limiting**
- **Issue**: Groq API rate limits exceeded
- **Handling**: Returns 500 error with specific message
- **Solution**: Implement backoff strategy or upgrade plan

#### 6. **Cache Invalidation**
- **Issue**: Stale cache entries
- **Handling**: 24-hour automatic expiry
- **Manual**: Use DELETE /cache/{video_id} endpoint

#### 7. **Invalid Video IDs**
- **Issue**: Malformed or non-existent video IDs
- **Handling**: YouTube API validation before processing
- **Result**: Clear error message for invalid IDs

#### 8. **Memory Constraints**
- **Issue**: Large video processing
- **Handling**: Streaming processing and garbage collection
- **Result**: Efficient memory usage

### Best Practices for Error Handling

```javascript
// Example error handling in client code
async function processVideo(videoId, preferences) {
  try {
    const response = await fetch('/process_video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_id: videoId, user_preferences: preferences })
    });
    
    if (!response.ok) {
      const error = await response.json();
      
      // Handle specific error cases
      switch (response.status) {
        case 400:
          if (error.detail.includes('transcript')) {
            showMessage('This video has no available transcript');
            return null;
          }
          break;
        case 500:
          if (error.detail.includes('rate limit')) {
            showMessage('Service temporarily busy, please try again');
            return null;
          }
          break;
      }
      
      throw new Error(error.detail);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Processing failed:', error);
    throw error;
  }
}
```

---

## 🔧 Configuration

### Environment Variables
```bash
GROQ_API_KEY=your_groq_api_key        # Required: Groq API key
DEV_MODE=true                         # Optional: Enable development mode
```

### Model Parameters
- **Model**: `meta-llama/llama-4-scout-17b-16e-instruct`
- **Temperature**: 0.1 (for consistency)
- **Max Tokens**: 2048
- **Context Window**: 128K tokens

### Cache Configuration
```python
CACHE_EXPIRY_HOURS = 24  # Cache entries expire after 24 hours
```

### Skip Categories Available
- `advertisements` - Sponsored content, promotions
- `calls_to_action` - Subscribe, like, share prompts
- `political_content` - Political discussions
- `negative_content` - Drama, controversies
- `kids_content` - Children-focused content
- `self_promotion` - Personal products, courses
- `repetitive_content` - Repeated explanations
- `filler_speech` - Um, uh, like, basically
- `technical_jargon` - Complex technical details
- `personal_stories` - Personal anecdotes

---

## 📊 Performance Metrics

| Metric | Before (OpenAI) | After (Groq) | Improvement |
|--------|-----------------|--------------|-------------|
| Average Response Time | ~3-8 seconds | ~0.5-2 seconds | **75% faster** |
| Context Window | 128K tokens | 128K tokens | Same capacity |
| Model Quality | GPT-4o-mini | Llama 4 Scout | Enhanced accuracy |
| Cost per 1M tokens | $0.15/$0.60 | $0.11/$0.34 | **43% cheaper** |

### Response Time Expectations
- **Short videos (<5 min)**: 0.5-1 seconds
- **Medium videos (5-30 min)**: 1-2 seconds
- **Long videos (30+ min)**: 2-4 seconds
- **Cache hits**: <0.1 seconds

---

## 🧪 Testing

### Test the API
```bash
# Test basic functionality
python test_groq.py

# Test specific video
curl -X GET "http://localhost:8000/process_video?video_id=dQw4w9WgXcQ"

# Test with preferences
curl -X POST "http://localhost:8000/process_video" \
  -H "Content-Type: application/json" \
  -d '{"video_id": "dQw4w9WgXcQ", "user_preferences": {"sensitivity": "high"}}'
```

### Health Check
```bash
curl -X GET "http://localhost:8000/health"
```

---

## 📈 Monitoring & Troubleshooting

### Monitoring Endpoints
- `/health` - Service health and cache status
- `/api/stats` - Detailed usage statistics
- Cache management with automatic expiry

### Common Issues & Solutions

#### **API Key Issues**
```bash
# Symptom: 401/403 errors
# Solution: Check GROQ_API_KEY environment variable
docker exec app env | grep GROQ_API_KEY
```

#### **Container Not Starting**
```bash
# Check logs
docker-compose logs app

# Common issues:
# - Missing API key
# - Port 8000 already in use
# - Docker daemon not running
```

#### **Slow Response Times**
```bash
# Check model status
curl -X GET "http://localhost:8000/api/stats"

# Possible causes:
# - Groq API rate limiting
# - Large video processing
# - Cold start after inactivity
```

#### **Cache Issues**
```bash
# Clear specific video cache
curl -X DELETE "http://localhost:8000/cache/VIDEO_ID"

# Check cache size
curl -X GET "http://localhost:8000/health"
```

---

## 🚀 Deployment

### Production Deployment
```bash
# Set production environment
export DEV_MODE=false
export GROQ_API_KEY=your_production_key

# Deploy
docker-compose up -d --build
```

### Performance Tuning
- Adjust cache expiry in `app.py` (default: 24 hours)
- Modify confidence thresholds for skip detection
- Customize prompts for specific content types

### Load Balancing
For high-traffic deployments:
```yaml
# docker-compose.yml
services:
  app:
    deploy:
      replicas: 3
    # ... rest of config
```

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with `python test_groq.py`
5. Submit a pull request

## License
This project is licensed under the MIT License - see the `LICENSE` file for details.

## Contact
For questions or support, please open an issue on GitHub.

---

#### Powered by AI
This project leverages **Groq's ultra-fast inference** and **Meta's Llama 4 Scout** model to deliver cutting-edge video content analysis. The AI components provide accurate identification and categorization of non-essential video segments for an optimized viewing experience.
