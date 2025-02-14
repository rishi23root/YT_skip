let skipPoints = [];
let isEnabled = false;
let videoElement = null;
let progressBar = null;
let skipOverlay = null;
let lastUrl = location.href;
let isManualSeeking = false;

// Add URL change detection at the top of the file after variable declarations
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        if (isEnabled) {
            cleanup();
            processVideo().catch(error => {
                console.error('Error processing video after URL change:', error);
            });
        }
    }
}).observe(document, { subtree: true, childList: true });

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'disable') {
        isEnabled = false;
        cleanup();
    } else if (message.action === 'processVideo') {
        processVideo().catch(error => {
            console.error('Error processing video from popup message:', error);
        });
    }
});

function initializeSkipper() {
    // Get video element and progress bar
    videoElement = document.querySelector('video');
    progressBar = document.querySelector('.ytp-progress-bar');

    if (!videoElement || !progressBar) {
        setTimeout(initializeSkipper, 1000); // Retry if elements not found
        return;
    }

    // Create skip points overlay
    createSkipOverlay();

    // Add video time update listener
    videoElement.addEventListener('timeupdate', handleTimeUpdate);

    // Add seeking listeners
    videoElement.addEventListener('seeking', () => {
        isManualSeeking = true;
    });

    videoElement.addEventListener('seeked', () => {
        // Reset the flag after a short delay to ensure it's actually a manual seek
        setTimeout(() => {
            isManualSeeking = false;
        }, 100);
    });
}

function createSkipOverlay() {
    // Remove existing overlay if any
    if (skipOverlay) skipOverlay.remove();

    // Create new overlay
    skipOverlay = document.createElement('div');
    skipOverlay.style.position = 'absolute';
    skipOverlay.style.top = '0';
    skipOverlay.style.height = '100%';
    skipOverlay.style.width = '100%';
    skipOverlay.style.pointerEvents = 'none';
    progressBar.appendChild(skipOverlay);

    // Add skip point indicators
    const duration = videoElement.duration;
    skipPoints.forEach(point => {
        const skipMark = document.createElement('div');
        skipMark.style.position = 'absolute';
        skipMark.style.left = `${(point.start / duration) * 100}%`;
        skipMark.style.width = `${((point.end - point.start) / duration) * 100}%`;
        skipMark.style.height = '100%';
        skipMark.style.backgroundColor = 'rgba(255, 255, 0, 0.5)';
        skipOverlay.appendChild(skipMark);
    });
}

function handleTimeUpdate() {
    if (!isEnabled || !videoElement || isManualSeeking) return;

    const currentTime = videoElement.currentTime;

    // Check if we're in a skip section
    for (const point of skipPoints) {
        if (currentTime >= point.start && currentTime < point.end) {
            videoElement.currentTime = point.end;
            break;
        }
    }
}

function cleanup() {
    if (skipOverlay) {
        skipOverlay.remove();
        skipOverlay = null;
    }
    if (videoElement) {
        videoElement.removeEventListener('timeupdate', handleTimeUpdate);
    }
}

// Add new function processVideo
async function processVideo() {
    const url = window.location.href;

    // Check if we're on a watch page
    if (!url.includes('/watch')) {
        return;
    }

    const videoId = new URL(url).searchParams.get('v');
    if (!videoId) {
        return;
    }

    // Show loading state
    showNotification('Processing', 'Analyzing video transcript...');

    try {
        // Send request to background script
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { type: 'processVideo', videoId },
                response => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    resolve(response);
                }
            );
        });

        if (response.success) {
            const data = response.data;
            console.log('Server response:', data); // Debug log

            if (data && data.remove && Array.isArray(data.remove)) {
                // Use skip segments directly from the API
                skipPoints = data.remove;

                if (skipPoints.length > 0) {
                    isEnabled = true;
                    initializeSkipper();
                    showNotification('Success', `Found ${skipPoints.length} segments to skip. Skipper is now active.`);
                } else {
                    showNotification('Notice', 'No segments to skip in this video.');
                }
            } else {
                showNotification('Notice', 'No skip points found for this video.');
            }
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        showNotification('Error', error.message || 'Failed to connect to server. Make sure the backend is running.');
        console.error('Error processing video:', error);
    }
}

// Add notification helper function
function showNotification(title, message) {
    chrome.runtime.sendMessage({
        type: 'notification',
        title: title,
        message: message
    });
    console.log(`${title}: ${message}`);
}

// Automatically process video on page load if toggle is enabled
window.addEventListener('load', function () {
    // Only proceed if we're on a watch page
    if (!window.location.href.includes('/watch')) {
        return;
    }

    chrome.storage.local.get(['skipperEnabled'], function (result) {
        if (result.skipperEnabled) {
            processVideo().catch(error => {
                console.error('Error processing video on page load:', error);
            });
        }
    });
}); 