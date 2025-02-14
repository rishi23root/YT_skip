/*
  This script is responsible for the functionality of the YouTube Transcript Skipper Chrome extension's popup.
  When the "Process This Video" button is clicked, it extracts the video ID from the active YouTube video URL,
  sends a request to the FastAPI backend to process the transcript, and handles the response.
  On success, it displays a status message and then hides the popup.
*/

// Listen for DOM content loaded to initialize toggle switch

document.addEventListener('DOMContentLoaded', function () {
  const toggleSwitch = document.getElementById('skipperToggle');
  const statusText = document.getElementById('status');

  // Check stored state and update UI
  chrome.storage.local.get(['skipperEnabled'], function (result) {
    toggleSwitch.checked = result.skipperEnabled || false;
    updateStatus(result.skipperEnabled || false);
  });

  toggleSwitch.addEventListener('change', function () {
    const isEnabled = toggleSwitch.checked;
    // Store the new state
    chrome.storage.local.set({ skipperEnabled: isEnabled });
    updateStatus(isEnabled);

    // Query the active tab and send appropriate message
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0].url.includes('youtube.com/watch')) {
        if (isEnabled) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'processVideo' });
        } else {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'disable' });
        }
      }
    });
  });
});

function updateStatus(enabled) {
  const statusText = document.getElementById('status');
  statusText.textContent = enabled ? 'Skipper is active' : 'Skipper is disabled';
}
