const screenshot = require("screenshot-desktop");

/**
 * Captures the primary screen and returns it as a base64-encoded PNG string.
 * The image is never written to disk — it stays in memory only.
 */
async function captureScreen() {
  try {
    const buffer = await screenshot({ format: "png" });
    return buffer.toString("base64");
  } catch (err) {
    console.error("[LockedInAI] Screen capture failed:", err.message || err);
    return null;
  }
}

module.exports = { captureScreen };
