// Handle notifications
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'notification') {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'images/icon.png',
            title: message.title,
            message: message.message
        });
    } else if (message.type === 'processVideo') {
        // Handle video processing request with user preferences
        processVideoRequest(message.videoId, message.userPreferences)
            .then(response => sendResponse({ success: true, data: response }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Will respond asynchronously
    }
});

// Function to process video request with user preferences
async function processVideoRequest(videoId, userPreferences = null) {
    try {
        // Validate and clean user preferences
        let cleanedPreferences = null;
        if (userPreferences && userPreferences.enabled !== false) {
            cleanedPreferences = {
                default_categories: Array.isArray(userPreferences.default_categories)
                    ? userPreferences.default_categories.filter(c => c && c.trim())
                    : [],
                custom_keywords: Array.isArray(userPreferences.custom_keywords)
                    ? userPreferences.custom_keywords.filter(k => k && k.trim())
                    : [],
                custom_phrases: Array.isArray(userPreferences.custom_phrases)
                    ? userPreferences.custom_phrases.filter(p => p && p.trim())
                    : [],
                sensitivity: ['low', 'medium', 'high'].includes(userPreferences.sensitivity)
                    ? userPreferences.sensitivity
                    : 'medium',
                enabled: userPreferences.enabled !== false
            };
        }

        const requestBody = {
            video_id: videoId,
            user_preferences: cleanedPreferences
        };

        console.log('Sending request to backend:', {
            videoId,
            hasUserPreferences: !!cleanedPreferences,
            preferencesEnabled: cleanedPreferences?.enabled,
            categoriesCount: cleanedPreferences?.default_categories?.length || 0,
            customKeywordsCount: cleanedPreferences?.custom_keywords?.length || 0,
            customPhrasesCount: cleanedPreferences?.custom_phrases?.length || 0,
            sensitivity: cleanedPreferences?.sensitivity || 'none'
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch(`http://127.0.0.1:8000/process_video`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                const error = await response.json();
                errorMessage = error.detail || error.message || errorMessage;
            } catch (parseError) {
                console.warn('Could not parse error response:', parseError);
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();

        console.log('Backend response:', {
            skipSegments: result.remove?.length || 0,
            skipPercentage: result.skip_percentage?.toFixed(1) || 0,
            processingTime: result.processing_time?.toFixed(2) || 0,
            userPreferencesApplied: !!cleanedPreferences
        });

        return result;
    } catch (error) {
        console.error('Error in processVideoRequest:', error);

        // Provide more specific error messages
        if (error.name === 'AbortError') {
            throw new Error('Request timeout - processing took too long');
        } else if (error.message.includes('Failed to fetch')) {
            throw new Error('Could not connect to backend server. Make sure it is running on port 8000.');
        } else {
            throw error;
        }
    }
} 