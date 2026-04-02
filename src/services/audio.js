const { BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const SOUNDS_DIR = path.join(__dirname, '..', '..', 'assets', 'sounds');
const SUPPORTED_EXTENSIONS = ['.mp3', '.wav', '.aiff', '.ogg', '.m4a'];

function createAudioService() {
  function getRandomSound() {
    const files = fs.readdirSync(SOUNDS_DIR).filter((file) => {
      const ext = path.extname(file).toLowerCase();
      return SUPPORTED_EXTENSIONS.includes(ext);
    });

    if (files.length === 0) {
      console.warn('[AudioService] No sound files found in', SOUNDS_DIR);
      return null;
    }

    const pick = files[Math.floor(Math.random() * files.length)];
    return path.join(SOUNDS_DIR, pick);
  }

  function playRoastSound() {
    const soundPath = getRandomSound();
    if (!soundPath) return;

    const audioPlayerPath = path.join(
      __dirname,
      '..',
      'renderer',
      'audio-player.html'
    );

    const encodedPath = encodeURIComponent(soundPath);
    const url = `file://${audioPlayerPath}?sound=${encodedPath}`;

    const win = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    win.loadURL(url);

    // Auto-close after 15 seconds as a safety net
    const timeout = setTimeout(() => {
      if (!win.isDestroyed()) {
        win.close();
      }
    }, 15000);

    win.webContents.on('console-message', (_event, _level, message) => {
      if (message === 'audio-ended' || message === 'audio-error') {
        clearTimeout(timeout);
        if (!win.isDestroyed()) {
          win.close();
        }
      }
    });

    win.on('closed', () => {
      clearTimeout(timeout);
    });

    console.log('[AudioService] Playing:', path.basename(soundPath));
  }

  return { playRoastSound };
}

module.exports = { createAudioService };
