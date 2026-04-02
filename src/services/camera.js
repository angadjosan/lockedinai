const { BrowserWindow, ipcMain, systemPreferences } = require('electron');
const path = require('path');

/**
 * Creates a camera service that captures webcam frames via a hidden BrowserWindow.
 * The window is created once and reused for all subsequent captures.
 *
 * @returns {{ captureFrame: () => Promise<string|null>, cleanup: () => void, requestPermission: () => Promise<boolean> }}
 */
function createCameraService() {
  let cameraWindow = null;
  let windowReady = false;
  let permissionGranted = false;

  async function requestPermission() {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('camera');
      console.log('[LockedInAI] Camera permission status:', status);

      if (status === 'granted') {
        permissionGranted = true;
        return true;
      }

      if (status === 'not-determined') {
        const granted = await systemPreferences.askForMediaAccess('camera');
        console.log('[LockedInAI] Camera permission granted:', granted);
        permissionGranted = granted;
        return granted;
      }

      // 'denied' or 'restricted'
      console.warn('[LockedInAI] Camera permission denied. Go to System Settings → Privacy & Security → Camera to enable.');
      permissionGranted = false;
      return false;
    }

    permissionGranted = true;
    return true;
  }

  function ensureWindow() {
    if (cameraWindow && !cameraWindow.isDestroyed()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      cameraWindow = new BrowserWindow({
        width: 1,
        height: 1,
        show: false,
        skipTaskbar: true,
        webPreferences: {
          preload: path.join(__dirname, '..', 'renderer', 'camera-preload.js'),
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      cameraWindow.loadFile(
        path.join(__dirname, '..', 'renderer', 'camera-capture.html')
      );

      cameraWindow.webContents.on('did-finish-load', () => {
        windowReady = true;
        resolve();
      });

      cameraWindow.on('closed', () => {
        cameraWindow = null;
        windowReady = false;
      });

      // If the window fails to load within 10 seconds, give up
      setTimeout(() => {
        if (!windowReady) {
          reject(new Error('Camera window failed to load'));
        }
      }, 10000);
    });
  }

  /**
   * Captures a single frame from the webcam and returns it as a base64 PNG string.
   * Returns null if the camera is unavailable or permission was denied.
   */
  async function captureFrame() {
    if (!permissionGranted) {
      const granted = await requestPermission();
      if (!granted) {
        console.warn('[LockedInAI] Skipping camera capture — no permission');
        return null;
      }
    }

    try {
      await ensureWindow();
    } catch (err) {
      console.error('[LockedInAI] Camera window setup failed:', err.message);
      return null;
    }

    if (!cameraWindow || cameraWindow.isDestroyed()) {
      return null;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        ipcMain.removeAllListeners('frame-captured');
        console.error('[LockedInAI] Camera frame capture timed out');
        resolve(null);
      }, 5000);

      ipcMain.once('frame-captured', (_event, base64Data) => {
        clearTimeout(timeout);
        resolve(base64Data || null);
      });

      cameraWindow.webContents.send('capture-frame');
    });
  }

  /**
   * Destroys the hidden camera window and releases resources.
   */
  function cleanup() {
    if (cameraWindow && !cameraWindow.isDestroyed()) {
      cameraWindow.close();
    }
    cameraWindow = null;
    windowReady = false;
  }

  return { captureFrame, cleanup, requestPermission };
}

module.exports = { createCameraService };
