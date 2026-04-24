// Selection Scope — background script
// Injects the content script on toolbar click. Subsequent clicks toggle the
// widget by messaging the existing instance (no duplicate injection).

browser.browserAction.onClicked.addListener(async (tab) => {
  // Try to toggle an already-running instance first.
  try {
    await browser.tabs.sendMessage(tab.id, { type: "toggle" });
    return;
  } catch (_) {
    // No content script yet — fall through to injection.
  }

  try {
    await browser.tabs.executeScript(tab.id, { file: "content.js" });
    // content.js auto-activates on first load.
  } catch (err) {
    console.error("[Selection Scope] Failed to inject:", err);
  }
});
