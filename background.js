// SubScript Background Script - Handles caption fetching

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'fetchCaptions') {
    fetchCaptions(message.videoId, sender.tab.id);
  }
  return true;
});

// Fetch captions using YouTubeTranscriptApi
async function fetchCaptions(videoId, tabId) {
  try {
    // Make request to our server endpoint that uses YouTubeTranscriptApi
    const response = await fetch(`http://localhost:5000/fetch-captions?video_id=${videoId}`);
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Send captions back to content script
    chrome.tabs.sendMessage(tabId, {
      action: 'captionsFetched',
      success: true,
      captions: data.captions
    });
  } catch (error) {
    console.error('Error fetching captions:', error);
    chrome.tabs.sendMessage(tabId, {
      action: 'captionsFetched',
      success: false,
      error: error.message
    });
  }
}

// Listen for install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Set default settings on install
    chrome.storage.sync.set({
      enabled: false,
      pauseInterval: 3
    });
  }
}); 