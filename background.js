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
        // Handle video processing request
        processVideoRequest(message.videoId)
            .then(response => sendResponse({ success: true, data: response }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Will respond asynchronously
    }
});

// Function to process video request
async function processVideoRequest(videoId) {
    const response = await fetch(`http://127.0.0.1:8000/process_video?video_id=${videoId}`, {
        method: 'GET',
        headers: {
            'Accept': 'application/json'
        }
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `HTTP error! status: ${response.status}`);
    }

    return response.json();
} 