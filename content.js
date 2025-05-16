// SubScript Content Script - Runs on YouTube pages

// Global state
let captionTracker = {
  captionCues: [],
  currentChunkIndex: 0,
  overlayShown: false,
  timeUpdateInterval: null,
  lastPausedChunk: -1,
  nextPauseChunk: 0,
  overlay: null,
  overlayPosition: null, // {left, top}
  overlaySize: null, // {width, height}
  captionsLoaded: false // Track if captions are loaded successfully
};

// Add to global state
let chatContext = [];
let isFirstAIMessage = true;

// Settings
let settings = {
  enabled: false,
  pauseInterval: 3,
  openaiApiKey: '',
  theme: 'light'
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Load settings from storage
  chrome.storage.sync.get({
    enabled: false,
    pauseInterval: 3,
    openaiApiKey: '',
    theme: 'light'
  }, (items) => {
    settings.enabled = items.enabled;
    settings.pauseInterval = items.pauseInterval;
    settings.openaiApiKey = items.openaiApiKey;
    settings.theme = items.theme || 'light';
    
    console.log('SubScript: Settings loaded, API key ' + (settings.openaiApiKey ? 'present' : 'missing'));
    
    if (settings.enabled && settings.openaiApiKey) {
      initializeExtension();
    }
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'settingsUpdated') {
    // Log previous and new API key state for debugging
    const hadApiKey = !!settings.openaiApiKey;
    const hasNewApiKey = !!(message.settings && message.settings.openaiApiKey);
    console.log(`SubScript: Settings updated, API key ${hadApiKey ? 'was present' : 'was missing'} -> ${hasNewApiKey ? 'is present' : 'is missing'}`);
    
    settings = message.settings;
    
    // Force save settings to ensure they persist
    chrome.storage.sync.set(settings, () => {
      console.log('SubScript: Settings explicitly saved to storage');
    });
    
    if (settings.enabled) {
      initializeExtension();
    } else {
      cleanupExtension();
    }
    
    // Send confirmation back to popup
    sendResponse({ success: true });
    return true; // Keep the messaging channel open for the async response
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
  
  // Create and show status indicator
  createCaptionStatusIndicator();
  showCaptionStatus('loading', 'Loading captions...');
  
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

// Fetch and process captions with retry logic
async function fetchAndProcessCaptions(videoId, pauseInterval = 3, retryCount = 0, maxRetries = 3) {
  try {
    console.log(`SubScript: Fetching captions for video ${videoId} (attempt ${retryCount + 1})`);
    showCaptionStatus('loading', `Loading captions (attempt ${retryCount + 1})...`);
    
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
    captionTracker.captionsLoaded = true;
    
    console.log(`SubScript: Created ${chunks.length} caption chunks`);
    
    // Update status
    showCaptionStatus('success', `Loaded ${chunks.length} caption chunks`);
    
    // Start monitoring video
    startMonitoringVideo();
    return true;
  } catch (error) {
    console.error('SubScript: Error fetching captions:', error);
    
    // Retry logic with exponential backoff
    if (retryCount < maxRetries) {
      const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s, etc.
      console.log(`SubScript: Retrying in ${delay/1000} seconds...`);
      showCaptionStatus('warning', `Retrying in ${delay/1000}s...`);
      
      return new Promise(resolve => {
        setTimeout(async () => {
          const result = await fetchAndProcessCaptions(videoId, pauseInterval, retryCount + 1, maxRetries);
          resolve(result);
        }, delay);
      });
    }
    
    // If all retries failed
    showCaptionStatus('error', "Couldn't load captions. Click to retry.");
    return false;
  }
}

// Caption status indicator
function createCaptionStatusIndicator() {
  // Remove existing indicator if any
  const existingIndicator = document.getElementById('subscript-status');
  if (existingIndicator) {
    existingIndicator.remove();
  }
  
  // Create new indicator
  const indicator = document.createElement('div');
  indicator.id = 'subscript-status';
  indicator.className = 'subscript-status';
  indicator.style.position = 'fixed';
  indicator.style.bottom = '20px';
  indicator.style.right = '20px';
  indicator.style.padding = '8px 12px';
  indicator.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  indicator.style.color = 'white';
  indicator.style.borderRadius = '4px';
  indicator.style.fontFamily = 'Arial, sans-serif';
  indicator.style.fontSize = '14px';
  indicator.style.zIndex = '9998';
  indicator.style.opacity = '0.9';
  indicator.style.transition = 'opacity 0.3s';
  indicator.style.cursor = 'pointer';
  
  // Add reload functionality on click
  indicator.addEventListener('click', async () => {
    const videoId = getYouTubeVideoId();
    if (videoId) {
      showCaptionStatus('loading', 'Reloading captions...');
      await fetchAndProcessCaptions(videoId, settings.pauseInterval);
    }
  });
  
  document.body.appendChild(indicator);
  return indicator;
}

function showCaptionStatus(status, message) {
  let indicator = document.getElementById('subscript-status');
  
  if (!indicator) {
    indicator = createCaptionStatusIndicator();
  }
  
  // Set color based on status
  switch (status) {
    case 'success':
      indicator.style.backgroundColor = 'rgba(46, 125, 50, 0.85)';
      indicator.style.display = 'block';
      // Auto-hide success message after 5 seconds
      setTimeout(() => {
        indicator.style.opacity = '0';
        setTimeout(() => {
          if (indicator.style.opacity === '0') {
            indicator.style.display = 'none';
          }
        }, 300);
      }, 5000);
      break;
    case 'loading':
      indicator.style.backgroundColor = 'rgba(30, 100, 190, 0.85)';
      indicator.style.display = 'block';
      indicator.style.opacity = '0.9';
      break;
    case 'warning':
      indicator.style.backgroundColor = 'rgba(245, 124, 0, 0.85)';
      indicator.style.display = 'block';
      indicator.style.opacity = '0.9';
      break;
    case 'error':
      indicator.style.backgroundColor = 'rgba(211, 47, 47, 0.85)';
      indicator.style.display = 'block';
      indicator.style.opacity = '0.9';
      break;
  }
  
  indicator.textContent = message;
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
      showCaptionOverlay(chunk.text, chunk.start, chunk.pauseAt);
      captionTracker.overlayShown = true;
      captionTracker.lastPausedChunk = captionTracker.nextPauseChunk;
      captionTracker.nextPauseChunk += 1;
    }
  }, 100);
}

// Helper to get a unique cache key for a chunk
function getChunkCacheKey(videoId, chunkIndex) {
  return `subscript_chat_${videoId}_${chunkIndex}`;
}

// Show overlay with caption text
async function showCaptionOverlay(text, startTime, endTime) {
  // Check if API key is set
  if (!settings.openaiApiKey) {
    console.error('SubScript: OpenAI API key not set');
    // Double-check storage again
    await new Promise(resolve => {
      chrome.storage.sync.get(['openaiApiKey'], (items) => {
        if (items.openaiApiKey) {
          console.log('SubScript: API key found in storage but not in settings, updating');
          settings.openaiApiKey = items.openaiApiKey;
          resolve(true);
        } else {
          resolve(false);
        }
      });
    });
    
    // If still no API key, show error
    if (!settings.openaiApiKey) {
      captionTracker.overlay = createOverlay();
      captionTracker.overlay.style.display = 'block';
      const chatWindow = captionTracker.overlay.querySelector('.subscript-chat-window');
      chatWindow.innerHTML = `
        <div class="caption-content">
          <div class="original-text">${text}</div>
          <div class="error">Please set your OpenAI API key in the extension settings.</div>
          <button class="continue-btn">Continue</button>
        </div>
      `;
      return;
    }
  }

  // Get videoId and chunkIndex for caching
  const videoId = getYouTubeVideoId();
  let chunkIndex = -1;
  if (captionTracker.captionCues) {
    chunkIndex = captionTracker.captionCues.findIndex(c => c.text === text && c.start === startTime);
  }
  const cacheKey = getChunkCacheKey(videoId, chunkIndex);

  // Try to load cached chat context
  chatContext = [];
  isFirstAIMessage = true;
  let cachedContext = null;
  try {
    cachedContext = await new Promise(resolve => {
      chrome.storage.local.get([cacheKey], (result) => {
        resolve(result[cacheKey] || null);
      });
    });
  } catch (e) { cachedContext = null; }

  // Create overlay if it doesn't exist
  if (!captionTracker.overlay) {
    captionTracker.overlay = createOverlay();
  }
  captionTracker.overlay.style.display = 'block';

  // Get chat window and footer/button
  const chatWindow = captionTracker.overlay.querySelector('.subscript-chat-window');
  const continueBtn = captionTracker.overlay.querySelector('.continue-btn');
  const chatFooter = captionTracker.overlay.querySelector('.subscript-chat-footer');
  const refreshBtn = captionTracker.overlay.querySelector('.subscript-chat-refresh-btn');
  chatWindow.innerHTML = '';

  // Add Refresh button logic
  if (refreshBtn) {
    refreshBtn.onclick = async () => {
      await new Promise(resolve => chrome.storage.local.remove([cacheKey], resolve));
      showCaptionOverlay(text, startTime, endTime); // Restart chat for this chunk
    };
  }

  // If cached context exists, replay the chat
  if (cachedContext && Array.isArray(cachedContext) && cachedContext.length > 0) {
    chatContext = [...cachedContext];
    let lastRole = null;
    for (const msg of chatContext) {
      if (msg.role === 'user') {
        const userBubble = document.createElement('div');
        userBubble.className = 'subscript-chat-bubble user';
        userBubble.textContent = msg.content;
        chatWindow.appendChild(userBubble);
        lastRole = 'user';
      } else if (msg.role === 'assistant') {
        const aiBubble = document.createElement('div');
        aiBubble.className = 'subscript-chat-bubble ai';
        renderAIBubbleContent(aiBubble, msg.content);
        chatWindow.appendChild(aiBubble);
        lastRole = 'assistant';
      }
    }
    scrollToBottom();
    // If last message was from assistant, enable continue button
    continueBtn.disabled = false;
    continueBtn.onclick = () => {
      hideCaptionOverlay();
      const video = document.querySelector('video');
      if (video) video.play();
    };
    // Ensure chat input and send button are present after restoring chat
    addChatInputAndSendButton(chatFooter, continueBtn, chatWindow, scrollToBottom, cacheKey, text, startTime, endTime);
    return;
  }

  // Add user message bubble (initial chunk)
  const userBubble = document.createElement('div');
  userBubble.className = 'subscript-chat-bubble user';
  userBubble.textContent = text;
  chatWindow.appendChild(userBubble);

  // Add AI message bubble (will stream in)
  const aiBubble = document.createElement('div');
  aiBubble.className = 'subscript-chat-bubble ai';
  aiBubble.textContent = 'Translating...';
  chatWindow.appendChild(aiBubble);

  // Add chat input and send button to footer (if not already present)
  addChatInputAndSendButton(chatFooter, continueBtn, chatWindow, scrollToBottom, cacheKey, text, startTime, endTime);

  // Scroll to bottom helper
  function scrollToBottom() {
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
  scrollToBottom();

  // Disable continue button until streaming is done for the initial chunk
  continueBtn.disabled = true;
  continueBtn.onclick = null;

  // For the initial AI message, use the three-line system prompt
  const initialSystemPrompt = {
    role: 'system',
    content: `You are a helpful language assistant. For any text provided, respond with three lines, separated by blank lines:\n1. The original text (in the source language)\n2. The romanized version (if the script is not Latin; otherwise, repeat the original)\n3. The English translation\n\nDo not include any labels or explanations, just the three lines.`
  };
  chatContext.push(initialSystemPrompt);
  chatContext.push({ role: 'user', content: text });
  isFirstAIMessage = true;
  streamAIResponse(chatContext, aiBubble, continueBtn, scrollToBottom, cacheKey);
}

// Move the chat input/send button creation code into a function
function addChatInputAndSendButton(chatFooter, continueBtn, chatWindow, scrollToBottom, cacheKey, text, startTime, endTime) {
  if (!chatFooter.querySelector('.subscript-chat-input')) {
    const inputArea = document.createElement('textarea');
    inputArea.className = 'subscript-chat-input';
    inputArea.rows = 1;
    inputArea.placeholder = 'Ask anything';
    inputArea.style.resize = 'none';
    inputArea.style.width = '70%';
    inputArea.style.marginRight = '8px';
    inputArea.style.fontSize = '15px';
    inputArea.style.borderRadius = '6px';
    inputArea.style.padding = '6px 8px';
    inputArea.style.border = '1px solid #ccc';
    inputArea.style.verticalAlign = 'middle';
    inputArea.style.boxSizing = 'border-box';
    inputArea.style.maxHeight = '80px';
    inputArea.style.overflowY = 'auto';

    const sendBtn = document.createElement('button');
    sendBtn.className = 'subscript-chat-send-btn';
    sendBtn.textContent = 'Send';
    sendBtn.style.marginRight = '8px';
    sendBtn.style.padding = '7px 16px';
    sendBtn.style.background = '#1976d2';
    sendBtn.style.color = '#fff';
    sendBtn.style.border = 'none';
    sendBtn.style.borderRadius = '4px';
    sendBtn.style.cursor = 'pointer';
    sendBtn.style.fontSize = '14px';
    sendBtn.style.verticalAlign = 'middle';

    chatFooter.insertBefore(inputArea, continueBtn);
    chatFooter.insertBefore(sendBtn, continueBtn);

    // Handle Shift+Enter for newline, Enter to send
    inputArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendBtn.click();
      }
    });

    // Send button click handler
    sendBtn.addEventListener('click', () => {
      const userMsg = inputArea.value.trim();
      if (!userMsg) return;
      inputArea.value = '';
      inputArea.rows = 1;
      // Add user bubble
      const userBubble = document.createElement('div');
      userBubble.className = 'subscript-chat-bubble user';
      userBubble.textContent = userMsg;
      chatWindow.appendChild(userBubble);
      scrollToBottom();
      // Add to context
      chatContext.push({ role: 'user', content: userMsg });
      // Add AI bubble
      const aiBubble = document.createElement('div');
      aiBubble.className = 'subscript-chat-bubble ai';
      aiBubble.textContent = 'Thinking...';
      chatWindow.appendChild(aiBubble);
      scrollToBottom();
      // Call OpenAI API with streaming (not first message)
      isFirstAIMessage = false;
      streamAIResponse(chatContext, aiBubble, continueBtn, scrollToBottom, cacheKey);
    });

    // Auto-grow textarea
    inputArea.addEventListener('input', () => {
      inputArea.rows = 1;
      const lines = inputArea.value.split('\n').length;
      inputArea.rows = Math.min(5, lines);
    });
  }
}

// Streaming AI response for chat (now with cache update)
function streamAIResponse(context, aiBubble, continueBtn, scrollToBottom, cacheKey) {
  // For follow-ups, use a general system prompt if not the first AI message
  let messages = context;
  if (!isFirstAIMessage) {
    // Remove any previous system prompt
    messages = context.filter(msg => msg.role !== 'system');
    // Add a general system prompt at the start
    messages = [
      {
        role: 'system',
        content: `You are a helpful language learning assistant. Answer the user's questions in English, unless you are quoting or translating specific words or phrases from the target language. Use double newlines to separate paragraphs or sections. Do not use the target language script (e.g., Devanagari) for general explanations—only use it when directly referencing or translating words or phrases.`
      },
      ...messages
    ];
  }

  fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${settings.openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4.1-nano',
      messages: messages,
      stream: true
    })
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';
    aiBubble.textContent = '';
    function processStream() {
      reader.read().then(({done, value}) => {
        if (done) {
          continueBtn.disabled = false;
          continueBtn.onclick = () => {
            hideCaptionOverlay();
            const video = document.querySelector('video');
            if (video) video.play();
          };
          scrollToBottom();
          // Add AI message to context
          context.push({ role: 'assistant', content: accumulatedText });
          // Cache the updated context
          if (cacheKey) {
            chrome.storage.local.set({ [cacheKey]: context });
          }
          return;
        }
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices[0].delta.content) {
                accumulatedText += parsed.choices[0].delta.content;
                renderAIBubbleContent(aiBubble, accumulatedText);
                scrollToBottom();
              }
            } catch (e) {
              console.error('Error parsing streaming response:', e);
            }
          }
        }
        processStream();
      });
    }
    processStream();
  })
  .catch(error => {
    renderAIBubbleContent(aiBubble, `Error: ${error.message}`);
    continueBtn.disabled = false;
    continueBtn.onclick = () => {
      hideCaptionOverlay();
      const video = document.querySelector('video');
      if (video) video.play();
    };
    scrollToBottom();
  });
  isFirstAIMessage = false;
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
    nextPauseChunk: 0,
    overlay: null,
    overlayPosition: null,
    overlaySize: null,
    captionsLoaded: false
  };
}

// Call initialize on page load for YouTube watch pages
if (window.location.href.includes('youtube.com/watch')) {
  console.log("SubScript: YouTube watch page detected");
  setTimeout(() => {
    chrome.storage.sync.get({
      enabled: false,
      pauseInterval: 3,
      openaiApiKey: '',
      theme: 'light'
    }, (items) => {
      settings.enabled = items.enabled;
      settings.pauseInterval = items.pauseInterval;
      settings.openaiApiKey = items.openaiApiKey;
      settings.theme = items.theme || 'light';
      
      console.log('SubScript: Delayed settings load, API key ' + (settings.openaiApiKey ? 'present' : 'missing'));
      
      if (settings.enabled && settings.openaiApiKey) {
        initializeExtension();
      } else if (settings.enabled && !settings.openaiApiKey) {
        console.warn('SubScript: Extension enabled but API key missing');
        showCaptionStatus('warning', 'OpenAI API key missing. Please set it in the extension popup.');
      }
    });
  }, 1500);  // Wait for YouTube to fully load
}

// Create overlay element as a chat window with theme support
function createOverlay() {
  const overlay = document.createElement('div');
  overlay.id = 'subscript-overlay';
  overlay.className = `subscript-chat-overlay ${settings.theme}-theme`;
  overlay.innerHTML = `
    <div class="subscript-chat-header" style="cursor: move; display: flex; align-items: center; justify-content: space-between;">
      <span>SubScript AI Assistant</span>
      <div>
        <button class="subscript-reload-captions-btn" style="margin-right: 8px; padding: 4px 10px; font-size: 13px; border-radius: 4px; border: none; background: #eee; cursor: pointer;">Reload Captions</button>
        <button class="subscript-chat-refresh-btn" style="padding: 4px 10px; font-size: 13px; border-radius: 4px; border: none; background: #eee; cursor: pointer;">Refresh Chat</button>
      </div>
    </div>
    <div class="subscript-chat-window"></div>
    <div class="subscript-chat-footer">
      <button class="continue-btn" disabled>Continue</button>
    </div>
  `;
  document.body.appendChild(overlay);

  // Apply last position and size if available
  if (captionTracker.overlayPosition) {
    overlay.style.left = captionTracker.overlayPosition.left;
    overlay.style.top = captionTracker.overlayPosition.top;
    overlay.style.transform = 'none';
  }
  if (captionTracker.overlaySize) {
    overlay.style.width = captionTracker.overlaySize.width;
    overlay.style.height = captionTracker.overlaySize.height;
  }

  // Add reload captions button functionality
  const reloadCaptionsBtn = overlay.querySelector('.subscript-reload-captions-btn');
  if (reloadCaptionsBtn) {
    reloadCaptionsBtn.onclick = async () => {
      const videoId = getYouTubeVideoId();
      if (videoId) {
        hideCaptionOverlay();
        showCaptionStatus('loading', 'Reloading captions...');
        await fetchAndProcessCaptions(videoId, settings.pauseInterval);
      }
    };
  }

  // Add styles for chat overlay, themes, and chat bubbles
  const style = document.createElement('style');
  style.textContent = `
    .subscript-chat-overlay {
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: 400px;
      max-width: 90vw;
      height: 70vh;
      max-height: 90vh;
      min-width: 320px;
      min-height: 300px;
      background: #fff;
      color: #222;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      z-index: 9999;
      display: flex !important;
      flex-direction: column !important;
      font-family: 'Segoe UI', 'Arial', sans-serif;
      overflow: hidden;
      min-height: 0;
      resize: both;
      overflow: auto;
    }
    .subscript-chat-overlay.dark-theme {
      background: #23272f;
      color: #f3f3f3;
    }
    .subscript-chat-header {
      padding: 16px;
      font-size: 1.1em;
      font-weight: bold;
      background: #f5f5f7;
      border-bottom: 1px solid #e0e0e0;
    }
    .subscript-chat-overlay.dark-theme .subscript-chat-header {
      background: #23272f;
      border-bottom: 1px solid #333;
      color: #fff;
    }
    .subscript-chat-window {
      flex: 1 1 0% !important;
      min-height: 0 !important;
      overflow-y: auto !important;
      scrollbar-width: thin;
      padding: 18px 12px 12px 12px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      background: inherit;
    }
    .subscript-chat-bubble {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 16px;
      font-size: 15px;
      line-height: 1.5;
      word-break: break-word;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    }
    .subscript-chat-bubble.user {
      align-self: flex-end;
      background: #1976d2;
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .subscript-chat-bubble.ai {
      align-self: flex-start;
      background: #f3f3f3;
      color: #23272f;
      border-bottom-left-radius: 4px;
      /* Markdown styles */
      font-size: 15px;
      line-height: 1.7;
    }
    .subscript-chat-bubble.ai h1,
    .subscript-chat-bubble.ai h2,
    .subscript-chat-bubble.ai h3 {
      font-size: 1.1em;
      font-weight: bold;
      margin: 12px 0 6px 0;
    }
    .subscript-chat-bubble.ai ul,
    .subscript-chat-bubble.ai ol {
      margin: 8px 0 8px 18px;
      padding-left: 18px;
    }
    .subscript-chat-bubble.ai li {
      margin-bottom: 4px;
    }
    .subscript-chat-bubble.ai strong {
      font-weight: bold;
    }
    .subscript-chat-bubble.ai em {
      font-style: italic;
    }
    .subscript-chat-bubble.ai code {
      background: #ececec;
      border-radius: 3px;
      padding: 2px 4px;
      font-size: 14px;
      font-family: 'Fira Mono', 'Consolas', monospace;
    }
    .subscript-chat-bubble.ai pre {
      background: #ececec;
      border-radius: 4px;
      padding: 8px;
      font-size: 14px;
      overflow-x: auto;
      margin: 8px 0;
    }
    .subscript-chat-bubble.ai p {
      margin: 10px 0;
    }
    .subscript-chat-overlay.dark-theme .subscript-chat-bubble.ai {
      background: #31343c;
      color: #f3f3f3;
    }
    .subscript-chat-footer {
      padding: 12px 16px;
      background: #f5f5f7;
      border-top: 1px solid #e0e0e0;
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }
    .subscript-chat-overlay.dark-theme .subscript-chat-footer {
      background: #23272f;
      border-top: 1px solid #333;
    }
    .continue-btn {
      padding: 8px 20px;
      background-color: #1976d2;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background-color 0.2s;
    }
    .continue-btn:hover:not(:disabled) {
      background-color: #1565c0;
    }
    .continue-btn:disabled {
      background-color: #1976d2;
      opacity: 0.7;
      cursor: not-allowed;
    }
    .subscript-chat-window::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    .subscript-chat-window::-webkit-scrollbar-track {
      background: #f1f1f1;
      border-radius: 10px;
    }
    .subscript-chat-window::-webkit-scrollbar-thumb {
      background: #c1c1c1;
      border-radius: 10px;
    }
    .subscript-chat-window::-webkit-scrollbar-thumb:hover {
      background: #a8a8a8;
    }
    .subscript-chat-overlay.dark-theme .subscript-chat-window::-webkit-scrollbar-track {
      background: #2d333b;
    }
    .subscript-chat-overlay.dark-theme .subscript-chat-window::-webkit-scrollbar-thumb {
      background: #444c56;
    }
    .subscript-chat-bubble.ai .ai-bubble-line {
      margin-bottom: 14px;
      font-size: 15px;
      line-height: 1.7;
      word-break: break-word;
    }
    .subscript-chat-bubble.ai .ai-bubble-line:last-child {
      margin-bottom: 0;
    }
  `;
  document.head.appendChild(style);

  // Drag logic
  const header = overlay.querySelector('.subscript-chat-header');
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  header.addEventListener('mousedown', (e) => {
    isDragging = true;
    const rect = overlay.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      overlay.style.left = `${e.clientX - dragOffsetX}px`;
      overlay.style.top = `${e.clientY - dragOffsetY}px`;
      overlay.style.transform = 'none';
      // Save position
      captionTracker.overlayPosition = {
        left: overlay.style.left,
        top: overlay.style.top
      };
    }
  });
  document.addEventListener('mouseup', () => {
    isDragging = false;
    document.body.style.userSelect = '';
  });

  // Resize observer to save size
  const resizeObserver = new ResizeObserver(() => {
    captionTracker.overlaySize = {
      width: overlay.style.width,
      height: overlay.style.height
    };
  });
  resizeObserver.observe(overlay);

  return overlay;
}

// Hide caption overlay
function hideCaptionOverlay() {
  if (captionTracker.overlay) {
    // Reset scroll position
    const chatWindow = captionTracker.overlay.querySelector('.subscript-chat-window');
    if (chatWindow) {
      chatWindow.scrollTop = 0;
    }
    captionTracker.overlay.remove(); // Remove from DOM
    captionTracker.overlay = null;
    captionTracker.overlayShown = false;
  }
}

function renderAIBubbleContent(aiBubble, content) {
  // Pre-process: convert single newlines to double newlines, except in lists/code/blockquote
  let processed = content.trim();
  if (!/^\s*([-*]|\d+\.) /m.test(processed) && !/^\s*```/m.test(processed)) {
    processed = processed.replace(/([^\n])\n([^\n])/g, '$1\n\n$2');
  }
  const md = window.markdownit();
  aiBubble.innerHTML = md.render(processed);
} 