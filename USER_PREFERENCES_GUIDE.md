# 🎯 YouTube Transcript Skipper - User Preferences Guide

## Overview

The YouTube Transcript Skipper now supports **advanced user preferences** allowing you to customize exactly what content you want to skip based on your personal preferences. No more one-size-fits-all skipping - now you control what gets removed!

## 🚀 New Features

### 📋 Pre-defined Skip Categories

Choose from **10 built-in categories** to automatically skip content you don't want to see:

| Category | Description | Example Keywords |
|----------|-------------|------------------|
| **Advertisements** | Sponsored content, ads, promotions | sponsor, ad, promo, affiliate |
| **Calls to Action** | Subscribe, like, share prompts | subscribe, like, notification, bell |
| **Political Content** | Political discussions, opinions | politics, democrat, republican, election |
| **Negative Content** | Drama, controversies, rants | drama, toxic, hate, controversy |
| **Kids Content** | Children-focused content, jokes | kids, cartoon, toy, silly jokes |
| **Self Promotion** | Personal products, merch, courses | merch, course, patreon, website |
| **Repetitive Content** | Repeated explanations | again, repeat, reiterate |
| **Filler Speech** | Um, uh, like, basically... | um, uh, literally, you know |
| **Technical Jargon** | Complex technical details | algorithm, implementation, debugging |
| **Personal Stories** | Personal anecdotes, experiences | personal story, childhood, family |

### 🎨 Custom Keywords & Phrases

Add your own **custom keywords** and **phrases** to skip content specific to your interests:

- **Custom Keywords**: Single words like "crypto", "NFT", "makeup"
- **Custom Phrases**: Multi-word phrases like "my personal opinion", "sponsored segment"

### ⚡ Sensitivity Levels

Control how aggressive the skipping should be:

- **Low Sensitivity** (5-10% reduction): Only skip obvious interruptions
- **Medium Sensitivity** (10-20% reduction): Balanced skipping (default)
- **High Sensitivity** (20-30% reduction): Aggressive skipping

## 🛠️ How to Use

### 1. Access Preferences

**Method 1: Extension Popup**
- Click the YouTube Skipper extension icon in your browser toolbar
- Switch to the "Preferences" tab

**Method 2: YouTube Interface**
- Look for the ⚙️ preferences button in the YouTube player controls
- Click it for quick access instructions

### 2. Configure Categories

1. In the **Skip Categories** section, click on any category to enable/disable it
2. Selected categories will be highlighted in green
3. Categories work immediately - no need to save first

### 3. Add Custom Terms

**Adding Keywords:**
1. Type a keyword in the "Custom Keywords" input field
2. Press Enter or click "Add"
3. The keyword appears as a removable tag

**Adding Phrases:**
1. Type a phrase in the "Custom Phrases" input field
2. Press Enter or click "Add"
3. The phrase appears as a removable tag

**Removing Custom Terms:**
- Click the "×" button on any custom tag to remove it

### 4. Adjust Sensitivity

1. In the **Sensitivity** section, select your preferred level:
   - **Low**: Conservative skipping
   - **Medium**: Balanced approach (recommended)
   - **High**: Aggressive skipping

### 5. Save Your Preferences

1. Click "**Save Preferences**" to apply changes
2. Your preferences are automatically used for all future videos
3. Click "**Reset to Defaults**" to clear all custom settings

## 📊 Real-time Feedback

The **Main** tab shows your current configuration:

- **Active Categories**: Number of enabled skip categories
- **Custom Terms**: Total custom keywords and phrases
- **Quick Stats**: Only visible when you have active preferences

## 🔧 Technical Details

### Backend Integration

The preferences system integrates seamlessly with the backend:

```json
{
  "video_id": "dQw4w9WgXcQ",
  "user_preferences": {
    "default_categories": ["advertisements", "political_content"],
    "custom_keywords": ["drama", "crypto"],
    "custom_phrases": ["my personal opinion"],
    "sensitivity": "medium",
    "enabled": true
  }
}
```

### Smart Matching

The system uses intelligent matching:

1. **Category Keywords**: Matches individual words from selected categories
2. **Category Phrases**: Matches complete phrases from categories
3. **Custom Keywords**: Exact word matching (case-insensitive)
4. **Custom Phrases**: Substring matching (case-insensitive)
5. **Confidence Scoring**: Higher confidence for user-defined terms

### Caching

- Preferences are cached with video processing results
- Different preference combinations create separate cache entries
- Cache automatically invalidates after 24 hours

## 💡 Best Practices

### Getting Started
1. **Start Simple**: Enable 2-3 categories that bother you most
2. **Test Sensitivity**: Begin with "Medium" and adjust based on results
3. **Add Gradually**: Add custom terms as you discover content you want to skip

### Fine-tuning
- **Monitor Results**: Check skip percentages to ensure you're not over-skipping
- **Use Specific Terms**: Prefer specific keywords over broad ones
- **Review Regularly**: Update preferences as your viewing habits change

### Common Use Cases

**Educational Content Viewer:**
- Enable: `advertisements`, `calls_to_action`, `self_promotion`
- Custom: "sponsored", "merch"
- Sensitivity: Low-Medium

**News/Politics Avoider:**
- Enable: `political_content`, `negative_content`
- Custom: "election", "controversy", "drama"
- Sensitivity: Medium-High

**Focus Mode:**
- Enable: `filler_speech`, `repetitive_content`, `personal_stories`
- Custom: "tangent", "side note"
- Sensitivity: High

## 🐛 Troubleshooting

### Preferences Not Working
1. Make sure you clicked "Save Preferences"
2. Refresh the YouTube page
3. Check that the extension toggle is enabled

### Too Much/Little Skipping
1. Adjust sensitivity level
2. Review enabled categories
3. Remove overly broad custom terms

### Extension Not Responding
1. Check browser console for errors
2. Refresh the YouTube page
3. Restart the browser if needed

## 🚀 Example Workflow

Here's a complete example of setting up preferences:

1. **Open Preferences**: Click extension icon → Preferences tab
2. **Select Categories**: Enable "Advertisements" and "Calls to Action"
3. **Add Custom Terms**: 
   - Keywords: "crypto", "NFT"
   - Phrases: "personal opinion"
4. **Set Sensitivity**: Choose "Medium"
5. **Save**: Click "Save Preferences"
6. **Test**: Process a video and review skip segments

## 📈 Advanced Features

### Category Details

Each category contains carefully curated keywords and phrases:

```javascript
"advertisements": {
  "keywords": ["sponsor", "sponsored", "ad", "advertisement", "promo"],
  "phrases": ["this video is sponsored by", "today's sponsor"]
}
```

### API Endpoints

Developers can access category information:

- `GET /preferences/categories` - List all categories
- `GET /preferences/category/{name}` - Get category details

## 🎉 What's Next?

Future enhancements planned:
- **Smart Learning**: AI-powered preference suggestions
- **Community Categories**: Share and discover popular skip categories
- **Advanced Patterns**: Regex support for complex matching
- **Import/Export**: Share preference profiles
- **YouTube Integration**: Native YouTube settings integration

---

**Happy Skipping!** 🎬✨

The YouTube Transcript Skipper now gives you complete control over your viewing experience. Customize it to match your preferences and enjoy distraction-free content consumption! 