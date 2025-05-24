let skipPoints = [];
let isEnabled = false;
let videoElement = null;
let progressBar = null;
let skipOverlay = null;
let lastUrl = location.href;
let isManualSeeking = false;
let loadingOverlay = null;
let isProcessing = false;
let temporarilyDisabledSegments = new Set(); // Track segments that are temporarily disabled
let lastManualSeekTime = 0; // Track when manual seeking occurred
let manualSeekGracePeriod = 3000; // 3 seconds grace period after manual seeking

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
    logger.info('Initializing skipper');

    // Get video element and progress bar
    videoElement = document.querySelector('video');
    progressBar = document.querySelector('.ytp-progress-bar');

    if (!videoElement || !progressBar) {
        logger.warn('Video elements not found, retrying in 1 second');
        setTimeout(initializeSkipper, 1000); // Retry if elements not found
        return;
    }

    logger.info('Video elements found, setting up skipper');

    // Create skip points overlay
    createSkipOverlay();

    // Create skip controls
    createSkipControls();

    // Add video time update listener
    videoElement.addEventListener('timeupdate', handleTimeUpdate);

    // Add seeking listeners
    videoElement.addEventListener('seeking', () => {
        isManualSeeking = true;
        lastManualSeekTime = Date.now();
        logger.info('User is seeking video', { currentTime: videoElement.currentTime.toFixed(1) });
    });

    videoElement.addEventListener('seeked', () => {
        const currentTime = videoElement.currentTime;

        // Check if user seeked into a skip zone
        const targetSkipSegment = skipPoints.find(point =>
            currentTime >= point.start && currentTime < point.end
        );

        if (targetSkipSegment) {
            // User intentionally seeked into a skip zone - temporarily disable that segment
            const segmentId = `${targetSkipSegment.start}-${targetSkipSegment.end}`;
            temporarilyDisabledSegments.add(segmentId);

            logger.info('User seeked into skip zone, temporarily disabling segment', {
                segment: segmentId,
                currentTime: currentTime.toFixed(1)
            });

            statusNotifier.showResumed(`Playing skip segment: ${targetSkipSegment.start.toFixed(1)}s - ${targetSkipSegment.end.toFixed(1)}s`);

            // Re-enable the segment after user moves away from it or after a delay
            setTimeout(() => {
                if (videoElement.currentTime < targetSkipSegment.start || videoElement.currentTime >= targetSkipSegment.end) {
                    temporarilyDisabledSegments.delete(segmentId);
                    logger.info('Re-enabled skip segment', { segment: segmentId });
                }
            }, 5000); // 5 second minimum watch time
        }

        // Reset the flag after a short delay to ensure it's actually a manual seek
        setTimeout(() => {
            isManualSeeking = false;
        }, 500); // Increased from 100ms to 500ms for better detection
    });

    // Add video state monitoring
    addVideoStateMonitoring();

    logger.success('Skipper initialized successfully', {
        skipPoints: skipPoints.length,
        videoDuration: videoElement.duration
    });
}

function addVideoStateMonitoring() {
    if (!videoElement) return;

    // Monitor play/pause events (without notifications)
    videoElement.addEventListener('pause', () => {
        // Video paused - no notification needed
    });

    videoElement.addEventListener('play', () => {
        // Video resumed - no notification needed
    });

    // Monitor ended event (without notification)
    videoElement.addEventListener('ended', () => {
        // Video completed - no notification needed
    });

    // Monitor error events
    videoElement.addEventListener('error', (e) => {
        statusNotifier.showError('Video playback error occurred');
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
    skipPoints.forEach((point, index) => {
        const skipMark = document.createElement('div');
        skipMark.className = 'yt-skip-segment';
        skipMark.style.position = 'absolute';
        skipMark.style.left = `${(point.start / duration) * 100}%`;
        skipMark.style.width = `${((point.end - point.start) / duration) * 100}%`;
        skipMark.style.height = '50%';
        skipMark.style.backgroundColor = 'rgba(255, 235, 59, 0.5)';
        skipMark.style.border = '1px solid rgba(255, 193, 7, 0.2)';
        skipMark.style.borderRadius = '2px';
        skipMark.style.pointerEvents = 'all';
        skipMark.style.cursor = 'pointer';
        skipMark.style.transition = 'all 0.2s ease';
        skipMark.title = `Skip segment ${index + 1}: ${point.start.toFixed(1)}s - ${point.end.toFixed(1)}s (Click to play this segment)`;

        // Add hover effect
        skipMark.addEventListener('mouseenter', () => {
            skipMark.style.backgroundColor = 'rgba(255, 235, 59, 0.9)';
            skipMark.style.transform = 'scaleY(1.2)';
        });

        skipMark.addEventListener('mouseleave', () => {
            skipMark.style.backgroundColor = 'rgba(255, 235, 59, 0.7)';
            skipMark.style.transform = 'scaleY(1)';
        });

        // Add click handler to manually play the skip segment
        skipMark.addEventListener('click', () => {
            const segmentId = `${point.start}-${point.end}`;

            // Temporarily disable auto-skip for this segment
            temporarilyDisabledSegments.add(segmentId);

            isManualSeeking = true;
            lastManualSeekTime = Date.now();
            videoElement.currentTime = point.start;

            logger.info('User clicked skip segment, temporarily disabled auto-skip', {
                segment: segmentId,
                startTime: point.start.toFixed(1)
            });

            statusNotifier.showResumed(`Playing skip segment ${index + 1}: ${point.start.toFixed(1)}s - ${point.end.toFixed(1)}s. Auto-skip disabled.`);

            // Reset manual seeking flag
            setTimeout(() => {
                isManualSeeking = false;
            }, 500);

            // Re-enable auto-skip after user moves away or after 8 seconds
            setTimeout(() => {
                const currentTime = videoElement.currentTime;
                if (currentTime < point.start || currentTime >= point.end) {
                    temporarilyDisabledSegments.delete(segmentId);
                    logger.info('Re-enabled auto-skip for clicked segment', { segment: segmentId });
                } else {
                    // Extend disable period if user is still watching
                    setTimeout(() => {
                        temporarilyDisabledSegments.delete(segmentId);
                        logger.info('Re-enabled auto-skip for clicked segment after extended period', { segment: segmentId });
                    }, 8000);
                }
            }, 8000);
        });

        skipOverlay.appendChild(skipMark);
    });
}

function createSkipControls() {
    // Remove existing controls if any
    const existingControls = document.querySelector('.yt-skip-controls');
    if (existingControls) existingControls.remove();

    // Find YouTube's control bar structure - target the exact middle section
    const chromeControls = document.querySelector('.ytp-chrome-controls');
    const leftControls = document.querySelector('.ytp-left-controls');
    const rightControls = document.querySelector('.ytp-right-controls');

    if (!chromeControls || !leftControls || !rightControls) {
        logger.warn('YouTube control elements not found, retrying in 1 second');
        setTimeout(createSkipControls, 1000);
        return;
    }

    // Create controls container for the middle section
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'yt-skip-controls';
    controlsContainer.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        height: 100%;
        font-family: 'Roboto', 'YouTube Sans', Arial, sans-serif;
        font-size: 12px;
        color: white;
        flex-shrink: 0;
        flex-grow: 0;
        padding: 0 12px;
        box-sizing: border-box;
    `;

    // Compact YouTube-style button
    const buttonBaseStyle = `
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 6px;
        border-radius: 2px;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0.9;
        transition: all 0.2s ease;
        width: 28px;
        height: 28px;
    `;

    // Skip points counter (compact)
    const counter = document.createElement('div');
    counter.className = 'yt-skip-counter';
    counter.style.cssText = `
        background: rgba(255, 255, 255, 0.12);
        padding: 1px 4px;
        border-radius: 2px;
        font-size: 9px;
        font-weight: 500;
        color: #e0e0e0;
        display: flex;
        align-items: center;
        gap: 2px;
        opacity: 0.8;
        white-space: nowrap;
        user-select: none;
        min-width: 18px;
        justify-content: center;
    `;
    counter.innerHTML = `${skipPoints.length}`;
    counter.title = `${skipPoints.length} skip segments found`;

    // Rewind button (compact)
    const rewindBtn = document.createElement('button');
    rewindBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>`;
    rewindBtn.title = 'Rewind to last skip';
    rewindBtn.className = 'ytp-button yt-skip-rewind-btn';
    rewindBtn.style.cssText = buttonBaseStyle;

    rewindBtn.addEventListener('mouseenter', () => {
        rewindBtn.style.opacity = '1';
        rewindBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });

    rewindBtn.addEventListener('mouseleave', () => {
        rewindBtn.style.opacity = '0.9';
        rewindBtn.style.backgroundColor = 'transparent';
    });

    rewindBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        rewindToLastSkip();
    });

    // Toggle skip button (compact)
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'ytp-button yt-skip-toggle-btn';

    const updateToggleBtn = () => {
        toggleBtn.innerHTML = isEnabled ?
            `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/></svg>` :
            `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
        toggleBtn.title = isEnabled ? 'Disable auto-skip' : 'Enable auto-skip';
        toggleBtn.style.color = isEnabled ? '#ff6b6b' : '#4caf50';

        // Update visual states
        counter.style.opacity = isEnabled ? '1' : '0.5';
        counter.style.color = isEnabled ? '#fff' : '#888';
        rewindBtn.style.opacity = isEnabled ? '0.9' : '0.4';
        rewindBtn.disabled = !isEnabled;

        logger.info('Skip toggle updated', { isEnabled });
    };

    toggleBtn.style.cssText = buttonBaseStyle;

    toggleBtn.addEventListener('mouseenter', () => {
        toggleBtn.style.opacity = '1';
        toggleBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    });

    toggleBtn.addEventListener('mouseleave', () => {
        toggleBtn.style.opacity = '0.9';
        toggleBtn.style.backgroundColor = 'transparent';
    });

    toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        isEnabled = !isEnabled;
        logger.info('Skip toggled', { newState: isEnabled });

        updateToggleBtn();

        if (isEnabled) {
            statusNotifier.showResumed('Auto-skipping enabled');
        } else {
            statusNotifier.showPaused('Auto-skipping disabled');
        }
    });

    // Assemble controls in compact order: counter, rewind, toggle
    controlsContainer.appendChild(counter);
    controlsContainer.appendChild(rewindBtn);
    controlsContainer.appendChild(toggleBtn);

    // Insert in the exact middle section between left and right controls
    chromeControls.insertBefore(controlsContainer, rightControls);

    // Initialize the toggle button state
    updateToggleBtn();

    logger.success('Skip controls positioned in middle section of YouTube control bar', {
        isEnabled,
        skipSegments: skipPoints.length
    });
}

let lastSkippedPoint = null;

function handleTimeUpdate() {
    if (!isEnabled || !videoElement || isManualSeeking) {
        // Debug why skipping might not work
        if (!isEnabled) logger.warn('Skipping disabled');
        if (!videoElement) logger.warn('No video element found');
        if (isManualSeeking) logger.warn('Manual seeking in progress');
        return;
    }

    const currentTime = videoElement.currentTime;
    const timeSinceManualSeek = Date.now() - lastManualSeekTime;

    // Debug log every 10 seconds to confirm time updates are working
    if (Math.floor(currentTime) % 10 === 0 && Math.floor(currentTime) !== Math.floor(videoElement.lastLoggedTime || 0)) {
        logger.info('Video time update', {
            currentTime: currentTime.toFixed(1),
            skipPoints: skipPoints.length,
            isEnabled,
            disabledSegments: temporarilyDisabledSegments.size
        });
        videoElement.lastLoggedTime = currentTime;
    }

    // Check if we're in a skip section
    for (const point of skipPoints) {
        if (currentTime >= point.start && currentTime < point.end) {
            const segmentId = `${point.start}-${point.end}`;

            // Check if this segment is temporarily disabled
            if (temporarilyDisabledSegments.has(segmentId)) {
                logger.info('Skip segment temporarily disabled, allowing playback', {
                    segment: segmentId,
                    currentTime: currentTime.toFixed(1)
                });
                continue; // Skip this segment, let it play
            }

            // Give grace period after manual seeking
            if (timeSinceManualSeek < manualSeekGracePeriod) {
                logger.info('Grace period active after manual seek, not skipping', {
                    timeSinceSeek: timeSinceManualSeek,
                    gracePeriod: manualSeekGracePeriod
                });
                continue;
            }

            // Perform the skip
            lastSkippedPoint = point;
            logger.info('Triggering skip', {
                from: point.start.toFixed(1),
                to: point.end.toFixed(1),
                currentTime: currentTime.toFixed(1)
            });

            videoElement.currentTime = point.end;

            logger.info('Skipped segment', {
                from: point.start.toFixed(1),
                to: point.end.toFixed(1),
                duration: (point.end - point.start).toFixed(1)
            });
            statusNotifier.showSkipped(`Skipped segment: ${point.start.toFixed(1)}s - ${point.end.toFixed(1)}s`);
            break;
        }
    }
}

function rewindToLastSkip() {
    if (!lastSkippedPoint) {
        statusNotifier.showError('No recent skip points to rewind to');
        return;
    }

    const segmentId = `${lastSkippedPoint.start}-${lastSkippedPoint.end}`;

    // Temporarily disable auto-skip for this segment
    temporarilyDisabledSegments.add(segmentId);

    // Set manual seeking flag and time
    isManualSeeking = true;
    lastManualSeekTime = Date.now();

    // Seek to the start of the skipped segment
    videoElement.currentTime = lastSkippedPoint.start;

    logger.info('Rewound to skip segment, temporarily disabled auto-skip', {
        segment: segmentId,
        startTime: lastSkippedPoint.start.toFixed(1)
    });

    statusNotifier.showResumed(`Rewound to skip segment: ${lastSkippedPoint.start.toFixed(1)}s - ${lastSkippedPoint.end.toFixed(1)}s. Auto-skip disabled for this segment.`);

    // Reset manual seeking flag
    setTimeout(() => {
        isManualSeeking = false;
    }, 500);

    // Re-enable auto-skip for this segment after user moves away or after 10 seconds minimum
    setTimeout(() => {
        const currentTime = videoElement.currentTime;
        if (currentTime < lastSkippedPoint.start || currentTime >= lastSkippedPoint.end) {
            temporarilyDisabledSegments.delete(segmentId);
            logger.info('Re-enabled auto-skip for rewound segment', { segment: segmentId });
        } else {
            // User is still in the segment, extend the disable period
            setTimeout(() => {
                temporarilyDisabledSegments.delete(segmentId);
                logger.info('Re-enabled auto-skip for rewound segment after extended period', { segment: segmentId });
            }, 10000); // Additional 10 seconds
        }
    }, 10000); // 10 second minimum watch time
}

function cleanup() {
    if (skipOverlay) {
        skipOverlay.remove();
        skipOverlay = null;
    }
    const controls = document.querySelector('.yt-skip-controls');
    if (controls) {
        controls.remove();
    }
    if (videoElement) {
        videoElement.removeEventListener('timeupdate', handleTimeUpdate);
    }

    // Clear temporarily disabled segments
    temporarilyDisabledSegments.clear();
    lastManualSeekTime = 0;

    // Hide rating interface if open
    ratingSystem.hideRatingInterface();
}

// Add new function processVideo
async function processVideo() {
    logger.startPerformanceTimer('video_processing');

    const url = window.location.href;

    // Check if we're on a watch page
    if (!url.includes('/watch')) {
        logger.warn('Not on a watch page', { url });
        statusNotifier.showError('Please navigate to a YouTube video page.');
        return;
    }

    const videoId = new URL(url).searchParams.get('v');
    if (!videoId) {
        logger.error('Could not extract video ID from URL', { url });
        statusNotifier.showError('Could not find video ID in the URL.');
        return;
    }

    logger.info('Processing video', { videoId });

    // Prevent multiple simultaneous processing
    if (isProcessing) {
        logger.warn('Processing already in progress');
        statusNotifier.showError('Video processing is already in progress.');
        return;
    }

    isProcessing = true;

    // Show processing state
    statusNotifier.showProcessing('Analyzing video transcript...');
    createLoadingOverlay();

    try {
        logger.startPerformanceTimer('api_request');

        // Load user preferences
        const userPreferences = await loadUserPreferences();
        logger.info('User preferences loaded', { preferences: userPreferences });

        // Send request to background script with timeout and preferences
        const response = await Promise.race([
            new Promise((resolve, reject) => {
                chrome.runtime.sendMessage(
                    {
                        type: 'processVideo',
                        videoId,
                        userPreferences
                    },
                    response => {
                        if (chrome.runtime.lastError) {
                            reject(new Error(chrome.runtime.lastError.message));
                            return;
                        }
                        resolve(response);
                    }
                );
            }),
            // Timeout after 30 seconds
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Request timeout - processing took too long')), 30000)
            )
        ]);

        logger.endPerformanceTimer('api_request');

        if (response.success) {
            const data = response.data;
            logger.info('Server response received', {
                skipSegments: data?.remove?.length || 0,
                userPreferencesUsed: !!userPreferences
            });

            if (data && data.remove && Array.isArray(data.remove)) {
                // Use skip segments directly from the API
                skipPoints = data.remove;

                if (skipPoints.length > 0) {
                    isEnabled = true;
                    initializeSkipper();
                    logger.success('Skip points loaded', { count: skipPoints.length, isEnabled });

                    const activeCategories = userPreferences?.default_categories?.length || 0;
                    const customTerms = (userPreferences?.custom_keywords?.length || 0) + (userPreferences?.custom_phrases?.length || 0);
                    const preferencesInfo = activeCategories > 0 || customTerms > 0
                        ? ` (${activeCategories} categories, ${customTerms} custom terms)`
                        : '';

                    statusNotifier.showCompleted(`Found ${skipPoints.length} segments to skip${preferencesInfo}. Skipper is now active.`);
                } else {
                    isEnabled = false;
                    logger.info('No skip segments found');
                    statusNotifier.showCompleted('No segments to skip in this video.');
                }
            } else {
                isEnabled = false;
                logger.info('No skip data in response');
                statusNotifier.showCompleted('No skip points found for this video.');
            }
        } else {
            // Handle specific error cases
            const errorMessage = response.error;
            logger.error('Server returned error', { error: errorMessage });

            if (errorMessage.includes('disabled')) {
                statusNotifier.showError('Transcripts are disabled for this video.');
            } else if (errorMessage.includes('transcript found')) {
                statusNotifier.showError('No transcript available for this video.');
            } else if (errorMessage.includes('quota') || errorMessage.includes('rate limit')) {
                statusNotifier.showError('API quota exceeded. Please try again later.');
            } else {
                statusNotifier.showError('Processing failed: ' + errorMessage);
            }
        }
    } catch (error) {
        logger.error('Processing failed', {
            error: error.message,
            stack: error.stack
        });

        // Handle specific error types
        if (error.message.includes('timeout')) {
            statusNotifier.showError('Processing timeout. The video might be too long or server is overloaded.');
        } else if (error.message.includes('Extension context invalidated')) {
            statusNotifier.showError('Extension was reloaded. Please refresh the page and try again.');
        } else if (error.message.includes('network')) {
            statusNotifier.showError('Network error. Please check your internet connection.');
        } else {
            statusNotifier.showError('Failed to connect to server. Make sure the backend is running.');
        }
    } finally {
        removeLoadingOverlay();
        isProcessing = false;
        logger.endPerformanceTimer('video_processing');
    }
}

// Add function to load user preferences
async function loadUserPreferences() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['userPreferences'], (result) => {
            const defaultPreferences = {
                default_categories: [],
                custom_keywords: [],
                custom_phrases: [],
                sensitivity: 'medium',
                enabled: true
            };

            try {
                let preferences = { ...defaultPreferences };

                if (result.userPreferences) {
                    // Merge with stored preferences, ensuring all arrays are valid
                    preferences = {
                        ...defaultPreferences,
                        ...result.userPreferences
                    };

                    // Validate and clean up arrays
                    if (!Array.isArray(preferences.default_categories)) {
                        preferences.default_categories = [];
                    }
                    if (!Array.isArray(preferences.custom_keywords)) {
                        preferences.custom_keywords = [];
                    }
                    if (!Array.isArray(preferences.custom_phrases)) {
                        preferences.custom_phrases = [];
                    }

                    // Filter out empty strings and duplicates
                    preferences.custom_keywords = [...new Set(preferences.custom_keywords.filter(k => k && k.trim()))];
                    preferences.custom_phrases = [...new Set(preferences.custom_phrases.filter(p => p && p.trim()))];
                    preferences.default_categories = [...new Set(preferences.default_categories.filter(c => c && c.trim()))];

                    // Validate sensitivity
                    if (!['low', 'medium', 'high'].includes(preferences.sensitivity)) {
                        preferences.sensitivity = 'medium';
                    }
                }

                logger.info('User preferences loaded and validated', {
                    categories: preferences.default_categories.length,
                    keywords: preferences.custom_keywords.length,
                    phrases: preferences.custom_phrases.length,
                    sensitivity: preferences.sensitivity,
                    enabled: preferences.enabled
                });

                resolve(preferences);
            } catch (error) {
                logger.error('Error processing user preferences, using defaults', { error: error.message });
                resolve(defaultPreferences);
            }
        });
    });
}

function createLoadingOverlay() {
    // Remove existing loading overlay if any
    if (loadingOverlay) loadingOverlay.remove();

    // Create loading overlay
    loadingOverlay = document.createElement('div');
    loadingOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        color: white;
        font-family: Arial, sans-serif;
        font-size: 18px;
    `;

    loadingOverlay.innerHTML = `
        <div style="text-align: center; background: rgba(255, 255, 255, 0.1); padding: 20px; border-radius: 10px;">
            <div style="border: 4px solid #f3f3f3; border-top: 4px solid #ff0000; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 15px;"></div>
            <div>Analyzing video transcript...</div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;

    document.body.appendChild(loadingOverlay);
}

function removeLoadingOverlay() {
    if (loadingOverlay) {
        loadingOverlay.remove();
        loadingOverlay = null;
    }
}

function showStatusNotification(message, type = 'info', duration = 3000) {
    // Remove existing notification
    const existingNotification = document.querySelector('.yt-skip-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification
    const notification = document.createElement('div');
    notification.className = 'yt-skip-notification';

    const bgColor = type === 'success' ? '#4caf50' :
        type === 'error' ? '#f44336' :
            type === 'warning' ? '#ff9800' : '#2196f3';

    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${bgColor};
        color: white;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 10001;
        font-family: Arial, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.3);
        max-width: 300px;
        word-wrap: break-word;
    `;

    notification.textContent = message;
    document.body.appendChild(notification);

    // Auto remove after duration
    setTimeout(() => {
        if (notification && notification.parentNode) {
            notification.remove();
        }
    }, duration);
}

// Automatically process video on page load if toggle is enabled
window.addEventListener('load', function () {
    logger.info('Page loaded, checking if we should process video');

    // Only proceed if we're on a watch page
    if (!window.location.href.includes('/watch')) {
        logger.info('Not on watch page, skipping initialization');
        return;
    }

    // Try to get the setting, but default to enabled if not set
    chrome.storage.local.get(['skipperEnabled'], function (result) {
        const skipperEnabled = result.skipperEnabled !== undefined ? result.skipperEnabled : true;
        logger.info('Skipper enabled status:', { enabled: skipperEnabled });

        if (skipperEnabled) {
            logger.info('Auto-processing video on page load');
            // Add a small delay to ensure YouTube elements are loaded
            setTimeout(() => {
                processVideo().catch(error => {
                    logger.error('Error processing video on page load:', error);
                });
            }, 2000);
        } else {
            logger.info('Skipper disabled, not processing video');
        }
    });
});

// Also add a manual trigger for testing
console.log('YT Skip Extension: Content script loaded. Use processVideo() in console to manually trigger.');
window.processVideo = processVideo;

// Add diagnostic function for debugging
window.ytSkipDiagnostic = function () {
    console.log('=== YT Skip Diagnostic ===');
    console.log('isEnabled:', isEnabled);
    console.log('skipPoints:', skipPoints);
    console.log('videoElement:', videoElement);
    console.log('progressBar:', progressBar);
    console.log('isProcessing:', isProcessing);
    console.log('lastUrl:', lastUrl);
    console.log('temporarilyDisabledSegments:', Array.from(temporarilyDisabledSegments));
    console.log('lastManualSeekTime:', lastManualSeekTime);
    console.log('timeSinceLastSeek:', Date.now() - lastManualSeekTime);
    console.log('Current URL:', location.href);
    console.log('Video ID:', new URL(location.href).searchParams.get('v'));
    console.log('Current Time:', videoElement ? videoElement.currentTime.toFixed(1) : 'N/A');
    console.log('=========================');

    // Also log to extension logger
    logger.info('Diagnostic requested', {
        isEnabled,
        skipPointsCount: skipPoints.length,
        hasVideoElement: !!videoElement,
        hasProgressBar: !!progressBar,
        isProcessing,
        currentUrl: location.href,
        disabledSegments: Array.from(temporarilyDisabledSegments),
        timeSinceLastSeek: Date.now() - lastManualSeekTime
    });

    return {
        isEnabled,
        skipPoints,
        videoElement: !!videoElement,
        progressBar: !!progressBar,
        isProcessing,
        url: location.href,
        temporarilyDisabledSegments: Array.from(temporarilyDisabledSegments),
        currentTime: videoElement ? videoElement.currentTime : null
    };
};

console.log('Use ytSkipDiagnostic() to check extension status.');

// Video Status Notification System
class VideoStatusNotifier {
    constructor() {
        this.currentNotification = null;
        this.videoStates = {
            PROCESSING: 'processing',
            SKIPPED: 'skipped',
            COMPLETED: 'completed',
            ERROR: 'error',
            PAUSED: 'paused',
            RESUMED: 'resumed',
            STOPPED: 'stopped'
        };
    }

    showNotification(state, message, duration = 3000) {
        // Remove existing notification
        if (this.currentNotification) {
            this.currentNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = 'yt-skip-status-notification';

        const config = this.getNotificationConfig(state);

        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${config.bgColor};
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 10001;
            font-family: Arial, sans-serif;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            max-width: 350px;
            word-wrap: break-word;
            border-left: 4px solid ${config.borderColor};
            display: flex;
            align-items: center;
            gap: 10px;
            animation: slideIn 0.3s ease-out;
        `;

        notification.innerHTML = `
            <div style="font-size: 18px;">${config.icon}</div>
            <div>
                <div style="font-weight: bold; margin-bottom: 2px;">${config.title}</div>
                <div style="font-size: 12px; opacity: 0.9;">${message}</div>
            </div>
        `;

        // Add CSS animation
        if (!document.querySelector('#yt-skip-animations')) {
            const style = document.createElement('style');
            style.id = 'yt-skip-animations';
            style.textContent = `
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);
        this.currentNotification = notification;

        // Auto remove after duration
        if (duration > 0) {
            setTimeout(() => {
                if (notification && notification.parentNode) {
                    notification.style.animation = 'slideOut 0.3s ease-in';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.remove();
                        }
                        if (this.currentNotification === notification) {
                            this.currentNotification = null;
                        }
                    }, 300);
                }
            }, duration);
        }
    }

    getNotificationConfig(state) {
        const configs = {
            [this.videoStates.PROCESSING]: {
                icon: '⚙️',
                title: 'Processing Video',
                bgColor: '#2196f3',
                borderColor: '#1976d2'
            },
            [this.videoStates.SKIPPED]: {
                icon: '⏭️',
                title: 'Segment Skipped',
                bgColor: '#ff9800',
                borderColor: '#f57c00'
            },
            [this.videoStates.COMPLETED]: {
                icon: '✅',
                title: 'Processing Complete',
                bgColor: '#4caf50',
                borderColor: '#388e3c'
            },
            [this.videoStates.ERROR]: {
                icon: '❌',
                title: 'Error',
                bgColor: '#f44336',
                borderColor: '#d32f2f'
            },
            [this.videoStates.PAUSED]: {
                icon: '⏸️',
                title: 'Video Paused',
                bgColor: '#9e9e9e',
                borderColor: '#757575'
            },
            [this.videoStates.RESUMED]: {
                icon: '▶️',
                title: 'Video Resumed',
                bgColor: '#4caf50',
                borderColor: '#388e3c'
            },
            [this.videoStates.STOPPED]: {
                icon: '⏹️',
                title: 'Video Stopped',
                bgColor: '#9e9e9e',
                borderColor: '#757575'
            }
        };

        return configs[state] || {
            icon: 'ℹ️',
            title: 'Info',
            bgColor: '#2196f3',
            borderColor: '#1976d2'
        };
    }

    // Convenience methods for each state
    showProcessing(message) {
        this.showNotification(this.videoStates.PROCESSING, message, 0); // No auto-hide for processing
    }

    showSkipped(message) {
        this.showNotification(this.videoStates.SKIPPED, message, 2000);
    }

    showCompleted(message) {
        this.showNotification(this.videoStates.COMPLETED, message, 3000);
    }

    showError(message) {
        this.showNotification(this.videoStates.ERROR, message, 5000);
    }

    showPaused(message) {
        this.showNotification(this.videoStates.PAUSED, message, 2000);
    }

    showResumed(message) {
        this.showNotification(this.videoStates.RESUMED, message, 2000);
    }

    showStopped(message) {
        this.showNotification(this.videoStates.STOPPED, message, 2000);
    }

    hide() {
        if (this.currentNotification) {
            this.currentNotification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                if (this.currentNotification && this.currentNotification.parentNode) {
                    this.currentNotification.remove();
                }
                this.currentNotification = null;
            }, 300);
        }
    }
}

// Initialize the notification system
const statusNotifier = new VideoStatusNotifier();

// Video Rating System
class VideoRatingSystem {
    constructor() {
        this.currentVideoId = null;
        this.ratingOverlay = null;
    }

    async getCurrentVideoId() {
        const url = window.location.href;
        if (!url.includes('/watch')) return null;
        return new URL(url).searchParams.get('v');
    }

    async getRating(videoId) {
        return new Promise((resolve) => {
            chrome.storage.local.get([`rating_${videoId}`], (result) => {
                resolve(result[`rating_${videoId}`] || 0);
            });
        });
    }

    async setRating(videoId, rating) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ [`rating_${videoId}`]: rating }, () => {
                resolve();
            });
        });
    }

    async getAverageRating() {
        return new Promise((resolve) => {
            chrome.storage.local.get(null, (items) => {
                const ratings = Object.keys(items)
                    .filter(key => key.startsWith('rating_'))
                    .map(key => items[key])
                    .filter(rating => rating > 0);

                if (ratings.length === 0) {
                    resolve(0);
                    return;
                }

                const average = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
                resolve(Math.round(average * 10) / 10); // Round to 1 decimal place
            });
        });
    }

    async showRatingInterface() {
        const videoId = await this.getCurrentVideoId();
        if (!videoId) return;

        this.currentVideoId = videoId;
        const currentRating = await this.getRating(videoId);
        const averageRating = await this.getAverageRating();

        // Remove existing rating overlay
        if (this.ratingOverlay) {
            this.ratingOverlay.remove();
        }

        // Create rating overlay
        this.ratingOverlay = document.createElement('div');
        this.ratingOverlay.className = 'yt-skip-rating-overlay';
        this.ratingOverlay.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 30px;
            border-radius: 15px;
            z-index: 10002;
            font-family: Arial, sans-serif;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            min-width: 300px;
        `;

        this.ratingOverlay.innerHTML = `
            <h3 style="margin: 0 0 20px 0; color: #fff;">Rate This Video's Skip Quality</h3>
            <div style="margin-bottom: 20px;">
                <div style="font-size: 14px; color: #ccc; margin-bottom: 10px;">
                    Current Rating: ${currentRating > 0 ? '★'.repeat(currentRating) + '☆'.repeat(5 - currentRating) : 'Not rated'}
                </div>
                <div style="font-size: 14px; color: #ccc;">
                    Average Rating: ${averageRating > 0 ? averageRating + '/5 ★' : 'No ratings yet'}
                </div>
            </div>
            <div class="rating-stars" style="margin-bottom: 20px;">
                ${[1, 2, 3, 4, 5].map(star => `
                    <span class="star" data-rating="${star}" style="
                        font-size: 30px;
                        cursor: pointer;
                        color: ${star <= currentRating ? '#ffd700' : '#666'};
                        margin: 0 5px;
                        transition: color 0.2s;
                    ">★</span>
                `).join('')}
            </div>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button id="rating-save" style="
                    background: #4caf50;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                ">Save Rating</button>
                <button id="rating-cancel" style="
                    background: #f44336;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                ">Cancel</button>
            </div>
        `;

        document.body.appendChild(this.ratingOverlay);

        // Add event listeners
        let selectedRating = currentRating;

        // Star hover and click events
        const stars = this.ratingOverlay.querySelectorAll('.star');
        stars.forEach((star, index) => {
            star.addEventListener('mouseenter', () => {
                stars.forEach((s, i) => {
                    s.style.color = i <= index ? '#ffd700' : '#666';
                });
            });

            star.addEventListener('mouseleave', () => {
                stars.forEach((s, i) => {
                    s.style.color = i < selectedRating ? '#ffd700' : '#666';
                });
            });

            star.addEventListener('click', () => {
                selectedRating = index + 1;
                stars.forEach((s, i) => {
                    s.style.color = i < selectedRating ? '#ffd700' : '#666';
                });
            });
        });

        // Button events
        this.ratingOverlay.querySelector('#rating-save').addEventListener('click', async () => {
            if (selectedRating > 0) {
                await this.setRating(videoId, selectedRating);
                statusNotifier.showCompleted(`Rating saved: ${selectedRating}/5 stars`);
            }
            this.hideRatingInterface();
        });

        this.ratingOverlay.querySelector('#rating-cancel').addEventListener('click', () => {
            this.hideRatingInterface();
        });

        // Close on escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                this.hideRatingInterface();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    }

    hideRatingInterface() {
        if (this.ratingOverlay) {
            this.ratingOverlay.remove();
            this.ratingOverlay = null;
        }
    }

    async addRatingToControls(controlsContainer) {
        const videoId = await this.getCurrentVideoId();
        if (!videoId) return;

        const currentRating = await this.getRating(videoId);

        // Add rating button
        const ratingBtn = document.createElement('button');
        ratingBtn.textContent = currentRating > 0 ? `★ ${currentRating}/5` : '☆ Rate';
        ratingBtn.title = 'Rate skip quality';
        ratingBtn.style.cssText = `
            background: #9c27b0;
            color: white;
            border: none;
            padding: 5px 10px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            transition: background 0.2s ease;
        `;
        ratingBtn.addEventListener('mouseenter', () => {
            ratingBtn.style.background = '#7b1fa2';
        });
        ratingBtn.addEventListener('mouseleave', () => {
            ratingBtn.style.background = '#9c27b0';
        });
        ratingBtn.addEventListener('click', () => {
            this.showRatingInterface();
        });

        controlsContainer.appendChild(ratingBtn);

        // Add preferences button
        const preferencesBtn = document.createElement('button');
        preferencesBtn.innerHTML = '⚙️';
        preferencesBtn.title = 'Open skip preferences';
        preferencesBtn.style.cssText = `
            background: #2196F3;
            color: white;
            border: none;
            padding: 5px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            margin-left: 4px;
            transition: background 0.2s ease;
        `;
        preferencesBtn.addEventListener('mouseenter', () => {
            preferencesBtn.style.background = '#1976D2';
        });
        preferencesBtn.addEventListener('mouseleave', () => {
            preferencesBtn.style.background = '#2196F3';
        });
        preferencesBtn.addEventListener('click', () => {
            this.showPreferencesDialog();
        });

        controlsContainer.appendChild(preferencesBtn);

        // Add debug button for log export
        const debugBtn = document.createElement('button');
        debugBtn.textContent = '🐛';
        debugBtn.title = 'Export debug logs';
        debugBtn.style.cssText = `
            background: #607d8b;
            color: white;
            border: none;
            padding: 5px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            margin-left: 4px;
            transition: background 0.2s ease;
        `;
        debugBtn.addEventListener('mouseenter', () => {
            debugBtn.style.background = '#455a64';
        });
        debugBtn.addEventListener('mouseleave', () => {
            debugBtn.style.background = '#607d8b';
        });
        debugBtn.addEventListener('click', () => {
            logger.exportLogs();
            statusNotifier.showCompleted('Debug logs exported');
        });

        controlsContainer.appendChild(debugBtn);

        return ratingBtn;
    }

    showPreferencesDialog() {
        // Create a dialog that instructs users to use the extension popup
        const dialog = document.createElement('div');
        dialog.className = 'yt-skip-preferences-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 0, 0, 0.9);
            color: white;
            padding: 30px;
            border-radius: 15px;
            z-index: 10002;
            font-family: Arial, sans-serif;
            text-align: center;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
            max-width: 400px;
        `;

        dialog.innerHTML = `
            <h3 style="margin: 0 0 20px 0; color: #fff;">Skip Preferences</h3>
            <p style="margin-bottom: 20px; line-height: 1.5;">
                To customize what content you want to skip, click on the YouTube Skipper extension icon in your browser toolbar.
            </p>
            <div style="margin-bottom: 20px;">
                <strong>Available Categories:</strong><br>
                <span style="font-size: 12px; color: #ccc;">
                    Advertisements • Calls to Action • Political Content • Negative Content<br>
                    Kids Content • Self Promotion • Repetitive Content • Technical Jargon<br>
                    Personal Stories • Filler Speech
                </span>
            </div>
            <div style="margin-bottom: 20px;">
                <strong>Custom Options:</strong><br>
                <span style="font-size: 12px; color: #ccc;">
                    Add your own keywords and phrases to skip<br>
                    Adjust sensitivity levels (Low, Medium, High)
                </span>
            </div>
            <button id="preferences-close" style="
                background: #4caf50;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                font-size: 14px;
            ">Got it!</button>
        `;

        document.body.appendChild(dialog);

        // Add event listeners
        dialog.querySelector('#preferences-close').addEventListener('click', () => {
            dialog.remove();
        });

        // Close on escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                dialog.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);

        // Close when clicking outside
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        });
    }
}

// Initialize the rating system
const ratingSystem = new VideoRatingSystem();

// Logging and Performance Monitoring System
class Logger {
    constructor() {
        this.logs = [];
        this.maxLogs = 100; // Keep only last 100 logs
        this.performanceMetrics = {};
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data,
            url: window.location.href
        };

        this.logs.push(logEntry);

        // Keep only recent logs
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(-this.maxLogs);
        }

        // Console output with styling
        const styles = {
            INFO: 'color: #2196f3',
            WARN: 'color: #ff9800',
            ERROR: 'color: #f44336',
            SUCCESS: 'color: #4caf50'
        };

        console.log(
            `%c[YT_Skip ${level}] ${message}`,
            styles[level] || 'color: #666',
            data || ''
        );

        // Store in chrome storage for debugging
        chrome.storage.local.set({
            'yt_skip_logs': this.logs.slice(-20) // Store only last 20 logs
        });
    }

    info(message, data) {
        this.log('INFO', message, data);
    }

    warn(message, data) {
        this.log('WARN', message, data);
    }

    error(message, data) {
        this.log('ERROR', message, data);
    }

    success(message, data) {
        this.log('SUCCESS', message, data);
    }

    startPerformanceTimer(operation) {
        this.performanceMetrics[operation] = {
            startTime: performance.now(),
            endTime: null,
            duration: null
        };
        this.info(`Started ${operation}`);
    }

    endPerformanceTimer(operation) {
        if (this.performanceMetrics[operation]) {
            const metric = this.performanceMetrics[operation];
            metric.endTime = performance.now();
            metric.duration = metric.endTime - metric.startTime;

            this.info(`Completed ${operation}`, {
                duration: `${metric.duration.toFixed(2)}ms`
            });

            return metric.duration;
        }
        return null;
    }

    getPerformanceReport() {
        return {
            metrics: this.performanceMetrics,
            recentLogs: this.logs.slice(-10),
            memoryUsage: performance.memory ? {
                used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
            } : 'Not available'
        };
    }

    exportLogs() {
        const report = this.getPerformanceReport();
        const blob = new Blob([JSON.stringify(report, null, 2)], {
            type: 'application/json'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `yt_skip_logs_${new Date().toISOString().slice(0, 19)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize the logger
const logger = new Logger(); 