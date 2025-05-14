// Only handle enableSubScript and pauseInterval

document.addEventListener('DOMContentLoaded', () => {
  const enableSubScript = document.getElementById('enableSubScript');
  const pauseInterval = document.getElementById('pauseInterval');
  const saveSettings = document.getElementById('saveSettings');

  // Load settings
  chrome.storage.sync.get({
    enabled: false,
    pauseInterval: 3
  }, (settings) => {
    console.log("SubScript popup: Loading settings", settings);
    enableSubScript.checked = settings.enabled;
    pauseInterval.value = settings.pauseInterval;
  });

  saveSettings.addEventListener('click', () => {
    const newSettings = {
      enabled: enableSubScript.checked,
      pauseInterval: parseInt(pauseInterval.value, 10)
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