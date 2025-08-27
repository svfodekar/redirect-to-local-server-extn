// Listen for messages from the website
window.addEventListener('message', (event) => {
    // Ensure the message is from a trusted source
    if (event.source === window && event.data.action) {
      // Forward the message to the background script
      chrome.runtime.sendMessage(event.data, (response) => {
        // Send the response back to the website
        window.postMessage({ ...response, action: event.data.action }, '*');
      });
    }
  });