// Only handle enableSubScript and pauseInterval

document.addEventListener('DOMContentLoaded', () => {
  const enableSubScript = document.getElementById('enableSubScript');
  const pauseInterval = document.getElementById('pauseInterval');
  const openaiApiKey = document.getElementById('openaiApiKey');
  const apiKeyStatus = document.getElementById('apiKeyStatus');
  const saveSettings = document.getElementById('saveSettings');
  const themeToggle = document.getElementById('themeToggle');

  // Load settings
  chrome.storage.sync.get({
    enabled: false,
    pauseInterval: 3,
    openaiApiKey: '',
    theme: 'light'
  }, (settings) => {
    console.log("SubScript popup: Loading settings", settings);
    enableSubScript.checked = settings.enabled;
    pauseInterval.value = settings.pauseInterval;
    openaiApiKey.value = settings.openaiApiKey;
    updateApiKeyStatus(settings.openaiApiKey);
    themeToggle.value = settings.theme || 'light';
  });

  // Validate API key format
  openaiApiKey.addEventListener('input', () => {
    updateApiKeyStatus(openaiApiKey.value);
  });

  function updateApiKeyStatus(key) {
    if (!key) {
      apiKeyStatus.textContent = 'API key is required';
      apiKeyStatus.className = 'api-key-status invalid';
      return;
    }
    
    if (!key.startsWith('sk-')) {
      apiKeyStatus.textContent = 'Invalid API key format';
      apiKeyStatus.className = 'api-key-status invalid';
      return;
    }
    
    apiKeyStatus.textContent = 'API key format is valid';
    apiKeyStatus.className = 'api-key-status valid';
  }

  saveSettings.addEventListener('click', () => {
    const newSettings = {
      enabled: enableSubScript.checked,
      pauseInterval: parseInt(pauseInterval.value, 10),
      openaiApiKey: openaiApiKey.value,
      theme: themeToggle.value
    };
    
    console.log("SubScript popup: Saving settings", newSettings);
    
    chrome.storage.sync.set(newSettings, () => {
      // Send message to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].id) {
          console.log("SubScript popup: Sending settings to tab", tabs[0].id);
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'settingsUpdated',
            settings: newSettings
          });
        }
      });
      
      // Close popup
      window.close();
    });
  });
}); 