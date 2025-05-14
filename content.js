// SubScript Content Script - Runs on YouTube pages

// Global state
let captionTracker = {
  captionCues: [],
  currentChunkIndex: 0,
  overlayShown: false,
  timeUpdateInterval: null,
  lastPausedChunk: -1,
  nextPauseChunk: 0
};

// Settings
let settings = {
  enabled: false,
  pauseInterval: 3
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Load settings from storage
  chrome.storage.sync.get({
    enabled: false,
    pauseInterval: 3
  }, (items) => {
    settings.enabled = items.enabled;
    settings.pauseInterval = items.pauseInterval;
    
    if (settings.enabled) {
      initializeExtension();
    }
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    settings = message.settings;
    
    if (settings.enabled) {
      initializeExtension();
    } else {
      cleanupExtension();
    }
  }
});

// Get YouTube video ID from URL
function getYouTubeVideoId() {
  const url = window.location.href;
  // Standard YouTube watch URL
  let match = url.match(/[?&]v=([^&#]+)/);
  if (match && match[1]) return match[1];
  // Shortened youtu.be URL
  match = url.match(/youtu\.be\/([\w-]{11})/);
  if (match && match[1]) return match[1];
  // Embedded player
  match = url.match(/embed\/([\w-]{11})/);
  if (match && match[1]) return match[1];
  return null;
}

// Main initialization function
async function initializeExtension() {
  console.log("SubScript: Initializing extension");
  const videoId = getYouTubeVideoId();
  
  if (!videoId) {
    console.error('SubScript: Could not extract video ID from URL');
    return;
  }
  
  console.log("SubScript: Found video ID", videoId);
  await fetchAndProcessCaptions(videoId, settings.pauseInterval);
}

// Helper: chunk captions and compute pause points
function chunkCaptions(captions, chunkSize) {
  const chunks = [];
  for (let i = 0; i < captions.length; i += chunkSize) {
    const chunkCaptions = captions.slice(i, i + chunkSize);
    const text = chunkCaptions.map(c => c.text).join(' ');
    const start = chunkCaptions[0].start;
    // Pause at the start of the next chunk, or at the end of the last caption
    let pauseAt;
    if (i + chunkSize < captions.length) {
      pauseAt = captions[i + chunkSize].start;
    } else {
      // Last chunk: pause at the end of the last caption
      const last = chunkCaptions[chunkCaptions.length - 1];
      pauseAt = last.start + last.duration;
    }
    chunks.push({ text, start, pauseAt });
  }
  return chunks;
}

// Fetch and process captions
async function fetchAndProcessCaptions(videoId, pauseInterval = 3) {
  try {
    console.log(`SubScript: Fetching captions for video ${videoId}`);
    const response = await fetch(`http://localhost:5001/api/captions?video_id=${videoId}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const captions = await response.json();
    
    if (!captions || captions.length === 0) {
      throw new Error('No captions found');
    }
    
    console.log(`SubScript: Retrieved ${captions.length} captions`);
    
    // Use new chunking logic
    const chunks = chunkCaptions(captions, pauseInterval);
    captionTracker.captionCues = chunks;
    captionTracker.currentChunkIndex = 0;
    captionTracker.overlayShown = false;
    
    console.log(`SubScript: Created ${chunks.length} caption chunks`);
    
    // Log the first few chunks for debugging
    console.log("[SubScript] First few caption chunks:");
    captionTracker.captionCues.slice(0, 5).forEach((chunk, idx) => {
      console.log(`[SubScript] chunk ${idx}: start=${chunk.start.toFixed(2)}, pauseAt=${chunk.pauseAt.toFixed(2)}, text="${chunk.text}"`);
    });
    
    // TEST FUNCTION: Force display the first caption immediately
    // This is for testing to see if caption display works at all
    // testForcedCaptionDisplay();
    
    // Start monitoring video
    startMonitoringVideo();
    return true;
  } catch (error) {
    console.error('SubScript: Error fetching captions:', error);
    return false;
  }
}

// Test function to force display a caption
function testForcedCaptionDisplay() {
  console.log("SubScript: Testing forced caption display");
  if (captionTracker.captionCues && captionTracker.captionCues.length > 0) {
    setTimeout(() => {
      const video = document.querySelector('video');
      if (video) {
        console.log("SubScript: FORCING pause and caption display for testing");
        video.pause();
        showCaptionOverlay("TEST CAPTION: " + captionTracker.captionCues[0].text);
        captionTracker.overlayShown = true;
      } else {
        console.error("SubScript: Could not find video element for test");
      }
    }, 3000); // Wait 3 seconds before showing test caption
  }
}

// Start monitoring video time
function startMonitoringVideo() {
  if (captionTracker.timeUpdateInterval) {
    clearInterval(captionTracker.timeUpdateInterval);
  }
  const video = document.querySelector('video');
  if (!video) {
    setTimeout(startMonitoringVideo, 1000);
    return;
  }
  captionTracker.lastPausedChunk = -1;
  captionTracker.nextPauseChunk = 0;

  // Add event listener for seeking to detect when user jumps to a different position
  video.addEventListener('seeking', function() {
    const currentTime = video.currentTime;
    // Find the appropriate chunk based on the new time position
    let newChunkIndex = 0;
    for (let i = 0; i < captionTracker.captionCues.length; i++) {
      if (currentTime < captionTracker.captionCues[i].pauseAt) {
        newChunkIndex = i;
        break;
      }
      // If we're past all chunks, point to the last one
      if (i === captionTracker.captionCues.length - 1) {
        newChunkIndex = captionTracker.captionCues.length;
      }
    }
    console.log(`[SubScript] Video seeked to ${currentTime.toFixed(2)}, setting next chunk to ${newChunkIndex}`);
    captionTracker.nextPauseChunk = newChunkIndex;
  });

  captionTracker.timeUpdateInterval = setInterval(() => {
    if (!settings.enabled || !captionTracker.captionCues || captionTracker.captionCues.length === 0) {
      return;
    }
    const currentTime = video.currentTime;
    
    // Check if we've rewound to before a previous pause point
    if (captionTracker.nextPauseChunk > 0 && 
        currentTime < captionTracker.captionCues[captionTracker.nextPauseChunk - 1].pauseAt - 1) {
      // Find the correct chunk for our current position
      for (let i = 0; i < captionTracker.captionCues.length; i++) {
        if (currentTime < captionTracker.captionCues[i].pauseAt) {
          console.log(`[SubScript] Detected rewind, resetting next chunk from ${captionTracker.nextPauseChunk} to ${i}`);
          captionTracker.nextPauseChunk = i;
          break;
        }
      }
    }
    
    // Only pause if:
    // 1. We're at or past the pause point for the next chunk
    // 2. We've actually watched this chunk (current time is not way past the start time)
    if (
      captionTracker.nextPauseChunk < captionTracker.captionCues.length &&
      currentTime >= captionTracker.captionCues[captionTracker.nextPauseChunk].pauseAt &&
      // Only show caption if we've actually watched at least part of this chunk
      // (within 10 seconds of the start, to allow for slight seeking inaccuracies)
      currentTime <= captionTracker.captionCues[captionTracker.nextPauseChunk].pauseAt + 10
    ) {
      const chunk = captionTracker.captionCues[captionTracker.nextPauseChunk];
      console.log(`[SubScript] Pausing at ${currentTime.toFixed(2)} for chunk ${captionTracker.nextPauseChunk}, displaying text:`, chunk.text);
      video.pause();
      showCaptionOverlay(chunk.text);
      captionTracker.overlayShown = true;
      captionTracker.lastPausedChunk = captionTracker.nextPauseChunk;
      captionTracker.nextPauseChunk += 1;
    }
  }, 100);
}

// Show caption overlay with continue button
function showCaptionOverlay(text) {
  const existingOverlay = document.getElementById('subscript-overlay');
  if (existingOverlay) existingOverlay.remove();
  const overlay = document.createElement('div');
  overlay.id = 'subscript-overlay';
  overlay.style.position = 'fixed';
  overlay.style.bottom = '80px';
  overlay.style.left = '50%';
  overlay.style.transform = 'translateX(-50%)';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  overlay.style.color = 'white';
  overlay.style.padding = '20px';
  overlay.style.borderRadius = '8px';
  overlay.style.zIndex = '9999';
  overlay.style.maxWidth = '80%';
  overlay.style.textAlign = 'center';
  overlay.style.fontSize = '18px';
  overlay.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
  const textDiv = document.createElement('div');
  textDiv.textContent = text;
  textDiv.style.marginBottom = '15px';
  overlay.appendChild(textDiv);
  const button = document.createElement('button');
  button.textContent = 'Continue';
  button.style.padding = '8px 20px';
  button.style.backgroundColor = '#1976d2';
  button.style.color = 'white';
  button.style.border = 'none';
  button.style.borderRadius = '4px';
  button.style.cursor = 'pointer';
  button.style.fontSize = '14px';
  button.addEventListener('click', () => {
    console.log('[SubScript] Continue clicked, removing overlay and resuming video');
    overlay.remove();
    captionTracker.overlayShown = false;
    const video = document.querySelector('video');
    if (video) video.play();
  });
  overlay.appendChild(button);
  document.body.appendChild(overlay);
  console.log('[SubScript] Overlay shown');
}

// Cleanup when extension is disabled
function cleanupExtension() {
  if (captionTracker.timeUpdateInterval) {
    clearInterval(captionTracker.timeUpdateInterval);
    captionTracker.timeUpdateInterval = null;
  }
  
  const overlay = document.getElementById('subscript-overlay');
  if (overlay) {
    overlay.remove();
  }
  
  captionTracker = {
    captionCues: [],
    currentChunkIndex: 0,
    overlayShown: false,
    timeUpdateInterval: null,
    lastPausedChunk: -1,
    nextPauseChunk: 0
  };
}

// Call initialize on page load for YouTube watch pages
if (window.location.href.includes('youtube.com/watch')) {
  console.log("SubScript: YouTube watch page detected");
  setTimeout(() => {
    chrome.storage.sync.get({
      enabled: false,
      pauseInterval: 3
    }, (items) => {
      settings.enabled = items.enabled;
      settings.pauseInterval = items.pauseInterval;
      
      if (settings.enabled) {
        initializeExtension();
      }
    });
  }, 1500);  // Wait for YouTube to fully load
} 