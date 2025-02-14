/*
  This script is responsible for the functionality of the YouTube Transcript Skipper Chrome extension's popup.
  When the "Process This Video" button is clicked, it extracts the video ID from the active YouTube video URL,
  sends a request to the FastAPI backend to process the transcript, and handles the response.
  On success, it displays a status message and then hides the popup.
*/

const btn = document.getElementById("processBtn");

btn.addEventListener("click", function () {
  btn.disabled = true;
  btn.innerHTML = "Working...";

  // Get the active tab's URL
  chrome.tabs.query({ currentWindow: true, active: true }, function (tabs) {
    const url = tabs[0].url;
    // Extract the video ID from the URL (e.g., ?v=VIDEO_ID)
    const videoId = new URL(url).searchParams.get("v");

    if (!videoId) {
      document.getElementById("result").innerHTML =
        "Could not extract video ID from the URL.";
      btn.disabled = false;
      btn.innerHTML = "Process This Video";
      return;
    }

    // Create a new XMLHttpRequest to call the backend API
    const xhr = new XMLHttpRequest();
    xhr.open(
      "GET",
      "http://127.0.0.1:8000/process_video?video_id=" + videoId,
      true
    );

    xhr.onload = function () {
      const resultDiv = document.getElementById("result");

      if (xhr.status === 404) {
        resultDiv.innerHTML = "No subtitles available for this video";
        btn.disabled = false;
        btn.innerHTML = "Process This Video";
      } else if (xhr.status === 200) {
        resultDiv.innerHTML = "Processing complete! Closing popup...";
        // After a short delay, close the popup automatically
        setTimeout(() => {
          window.close();
        }, 1000);
      } else {
        resultDiv.innerHTML = "Error: " + xhr.statusText;
        btn.disabled = false;
        btn.innerHTML = "Process This Video";
      }
    };

    xhr.onerror = function () {
      const resultDiv = document.getElementById("result");
      resultDiv.innerHTML = "Request failed. Please try again.";
      btn.disabled = false;
      btn.innerHTML = "Process This Video";
    };

    xhr.send();
  });
});
