const { app, Tray, Menu, BrowserWindow, nativeImage, Notification, ipcMain } = require('electron');
const path = require('path');

const { captureScreen } = require('../services/screenshot');
const { createAIService } = require('../services/ai');
const { createDatabase } = require('../services/database');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let tray = null;
let monitoringInterval = null;
let isMonitoring = false;
let db = null;
let aiService = null;

let currentTask = '';
let intervalSeconds = 30;
let roastLevel = 'medium';

// Window references
let taskWindow = null;
let historyWindow = null;
let apiKeyWindow = null;
let roastPopupWindow = null;

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

function loadPreferences() {
  currentTask = db.getSetting('task') || '';
  const savedInterval = db.getSetting('interval');
  if (savedInterval) intervalSeconds = Number(savedInterval);
  const savedRoastLevel = db.getSetting('roastLevel');
  if (savedRoastLevel) roastLevel = savedRoastLevel;
}

function getApiKey() {
  return db.getSetting('apiKey') || '';
}

// ---------------------------------------------------------------------------
// Tray icon (16x16 template image)
// ---------------------------------------------------------------------------

function createTrayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4, 0);
  const cx = 8, cy = 8, r = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= r * r) {
        const idx = (y * size + x) * 4;
        buf[idx] = 255;
        buf[idx + 1] = 255;
        buf[idx + 2] = 255;
        buf[idx + 3] = 255;
      }
    }
  }
  const img = nativeImage.createFromBuffer(buf, { width: size, height: size });
  img.setTemplateImage(true);
  return img;
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

function buildContextMenu() {
  const intervalChoices = [30, 60, 180, 300];
  const roastChoices = ['gentle', 'medium', 'brutal', 'unhinged'];

  const intervalLabel = (s) => {
    if (s < 60) return `${s}s`;
    return `${s / 60} min`;
  };

  return Menu.buildFromTemplate([
    {
      label: currentTask ? `Task: ${currentTask.slice(0, 30)}` : 'No task set',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Set Task...',
      click: openTaskWindow,
    },
    {
      label: 'API Key...',
      click: openApiKeyWindow,
    },
    {
      label: 'Roast History',
      click: openHistoryWindow,
    },
    { type: 'separator' },
    {
      label: 'Interval',
      submenu: intervalChoices.map((sec) => ({
        label: intervalLabel(sec),
        type: 'radio',
        checked: intervalSeconds === sec,
        click: () => {
          intervalSeconds = sec;
          db.setSetting('interval', String(sec));
          if (isMonitoring) {
            stopMonitoring();
            startMonitoring();
          }
          rebuildMenu();
        },
      })),
    },
    {
      label: 'Roast Level',
      submenu: roastChoices.map((level) => ({
        label: level.charAt(0).toUpperCase() + level.slice(1),
        type: 'radio',
        checked: roastLevel === level,
        click: () => {
          roastLevel = level;
          db.setSetting('roastLevel', level);
          rebuildMenu();
        },
      })),
    },
    { type: 'separator' },
    {
      label: isMonitoring ? '■ Stop Monitoring' : '▶ Start Monitoring',
      click: () => {
        if (isMonitoring) {
          stopMonitoring();
        } else {
          startMonitoring();
        }
        rebuildMenu();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        stopMonitoring();
        app.quit();
      },
    },
  ]);
}

function rebuildMenu() {
  if (tray) tray.setContextMenu(buildContextMenu());
}

// ---------------------------------------------------------------------------
// Roast popup window
// ---------------------------------------------------------------------------

function showRoastPopup(message, productive) {
  if (roastPopupWindow && !roastPopupWindow.isDestroyed()) {
    roastPopupWindow.close();
  }

  roastPopupWindow = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Position at top-right of screen
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width: screenW } = display.workAreaSize;
  roastPopupWindow.setPosition(screenW - 440, 40);

  const bgColor = productive ? '#0a2e1a' : '#2e0a0a';
  const borderColor = productive ? '#4ecca3' : '#e94560';
  const emoji = productive ? getRandomEncourageEmoji() : getRandomRoastEmoji();
  const title = productive ? 'Nice Work!' : 'CAUGHT SLACKING';
  const escapedMsg = escapeHtml(message);

  const html = `
    <!DOCTYPE html>
    <html>
    <head><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: system-ui, -apple-system, sans-serif;
        background: transparent;
        overflow: hidden;
      }
      .popup {
        background: ${bgColor};
        border: 2px solid ${borderColor};
        border-radius: 16px;
        padding: 24px;
        margin: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        animation: slideIn 0.3s ease-out;
        cursor: pointer;
      }
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      .header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      .emoji { font-size: 28px; }
      .title {
        font-size: 16px;
        font-weight: 800;
        color: ${borderColor};
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      .message {
        font-size: 15px;
        color: #eee;
        line-height: 1.5;
      }
      .dismiss {
        margin-top: 12px;
        font-size: 11px;
        color: #666;
        text-align: center;
      }
    </style></head>
    <body>
      <div class="popup" onclick="window.close()">
        <div class="header">
          <span class="emoji">${emoji}</span>
          <span class="title">${title}</span>
        </div>
        <p class="message">${escapedMsg}</p>
        <p class="dismiss">click to dismiss</p>
      </div>
    </body>
    </html>
  `;

  roastPopupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  // Auto-dismiss after 8 seconds
  setTimeout(() => {
    if (roastPopupWindow && !roastPopupWindow.isDestroyed()) {
      roastPopupWindow.close();
    }
  }, 8000);
}

function getRandomRoastEmoji() {
  const emojis = ['💀', '🤡', '📸', '👀', '🚨', '😭', '🗑️', '🤦'];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

function getRandomEncourageEmoji() {
  const emojis = ['🔥', '💪', '🧠', '⚡', '🏆', '✅', '🎯'];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

async function performCheck() {
  const apiKey = getApiKey();
  if (!apiKey) {
    showNotification('Locked In AI', 'No API key set. Click the tray icon → API Key...');
    return;
  }

  if (!aiService) {
    aiService = createAIService(apiKey);
  }

  try {
    const screenshotBase64 = await captureScreen();
    if (!screenshotBase64) {
      console.error('[LockedInAI] Screenshot failed');
      return;
    }

    const result = await aiService.analyzeScreenshot(screenshotBase64, currentTask, roastLevel);

    db.addHistoryEntry({
      productive: result.productive,
      activity: result.activity,
      message: result.message,
      taskContext: currentTask,
      roastLevel,
    });

    // Show roast popup (for both productive and unproductive)
    showRoastPopup(result.message, result.productive);

    // Also send system notification if unproductive
    if (!result.productive) {
      showNotification('🚨 Locked In AI', result.message);
    }

    // Refresh history window if open
    if (historyWindow && !historyWindow.isDestroyed()) {
      historyWindow.webContents.send('history-updated');
    }
  } catch (err) {
    console.error('[LockedInAI] Check failed:', err.message);
  }
}

function startMonitoring() {
  if (isMonitoring) return;

  const apiKey = getApiKey();
  if (!apiKey) {
    showNotification('Locked In AI', 'Set your API key before starting.');
    return;
  }

  if (!currentTask) {
    showNotification('Locked In AI', 'Set a task first so I know what to roast you about.');
    return;
  }

  // Recreate AI service in case key changed
  aiService = createAIService(apiKey);

  isMonitoring = true;
  performCheck();
  monitoringInterval = setInterval(performCheck, intervalSeconds * 1000);
  showNotification('Locked In AI', `Monitoring every ${intervalSeconds}s. Stay locked in.`);
}

function stopMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }
  isMonitoring = false;
}

function showNotification(title, body) {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function createSmallWindow({ title, width, height, htmlFile }) {
  const win = new BrowserWindow({
    width,
    height,
    title,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', htmlFile));
  win.once('ready-to-show', () => win.show());
  return win;
}

function openTaskWindow() {
  if (taskWindow && !taskWindow.isDestroyed()) { taskWindow.focus(); return; }
  taskWindow = createSmallWindow({ title: 'Set Task', width: 460, height: 200, htmlFile: 'task.html' });
  taskWindow.on('closed', () => { taskWindow = null; });
}

function openHistoryWindow() {
  if (historyWindow && !historyWindow.isDestroyed()) { historyWindow.focus(); return; }
  historyWindow = createSmallWindow({ title: 'Roast History', width: 560, height: 480, htmlFile: 'history.html' });
  historyWindow.on('closed', () => { historyWindow = null; });
}

function openApiKeyWindow() {
  if (apiKeyWindow && !apiKeyWindow.isDestroyed()) { apiKeyWindow.focus(); return; }
  apiKeyWindow = createSmallWindow({ title: 'API Key', width: 480, height: 220, htmlFile: 'apikey.html' });
  apiKeyWindow.on('closed', () => { apiKeyWindow = null; });
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle('get-task', () => currentTask);
  ipcMain.handle('set-task', (_event, task) => {
    currentTask = task;
    db.setSetting('task', task);
    rebuildMenu();
    return { ok: true };
  });

  ipcMain.handle('get-api-key', () => {
    const key = getApiKey();
    if (!key) return '';
    return key.length > 8 ? '...' + key.slice(-4) : key;
  });
  ipcMain.handle('set-api-key', (_event, key) => {
    db.setSetting('apiKey', key);
    aiService = null; // Force recreation on next check
    return { ok: true };
  });

  ipcMain.handle('get-history', () => {
    return db.getHistory(100);
  });
  ipcMain.handle('clear-history', () => {
    db.clearHistory();
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

app.on('second-instance', () => {
  showNotification('Locked In AI', 'Already running in the menu bar.');
});

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();

  // Initialize database
  const dbPath = path.join(app.getPath('userData'), 'lockedinai.db');
  db = createDatabase(dbPath);
  loadPreferences();

  registerIpc();

  tray = new Tray(createTrayIcon());
  tray.setToolTip('Locked In AI');
  tray.setContextMenu(buildContextMenu());
});

app.on('window-all-closed', (e) => {
  // Menu bar app — don't quit on window close
});

app.on('before-quit', () => {
  stopMonitoring();
  if (db && db.db) db.db.close();
});
