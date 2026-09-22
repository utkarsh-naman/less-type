importScripts(
    "../shared/constants.js",
    "../storage/defaults.js",
    "../storage/storage.js"
);


chrome.runtime.onInstalled.addListener(async () => {
    await initializeExtensionState();
});
