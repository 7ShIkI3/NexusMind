const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const fs = require('fs')

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

let mainWindow = null
let backendProcess = null

// Start the Python backend
function startBackend() {
  const backendDir = isDev
    ? path.join(__dirname, '../../backend')
    : path.join(process.resourcesPath, 'backend')

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3'
  const uvicornArgs = [
    '-m', 'uvicorn',
    'app.main:app',
    '--host', '127.0.0.1',
    '--port', '8000',
  ]
  if (isDev) {
    uvicornArgs.push('--reload')
  }

  if (!fs.existsSync(backendDir)) {
    console.warn('[Desktop] Backend directory not found:', backendDir)
    return
  }

  backendProcess = spawn(pythonCmd, uvicornArgs, {
    cwd: backendDir,
    env: { ...process.env, PYTHONPATH: backendDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  backendProcess.stdout.on('data', (data) => {
    console.log('[Backend]', data.toString())
  })
  backendProcess.stderr.on('data', (data) => {
    console.error('[Backend Error]', data.toString())
  })
  backendProcess.on('close', (code) => {
    console.log('[Backend] exited with code', code)
  })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    frame: true,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    show: false,
  })

  // Load the frontend
  mainWindow.loadURL(getFrontendUrl())

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  setupMenu()
}

function getFrontendUrl() {
  return isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../../frontend/dist/index.html')}`
}

function setupMenu() {
  const template = [
    {
      label: 'NexusMind',
      submenu: [
        { label: 'About NexusMind', role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences…',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.loadURL(getFrontendUrl() + '/settings'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' }, { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'NexusMind Documentation',
          click: () => shell.openExternal('https://github.com/7ShIkI3/NexusMind'),
        },
        {
          label: 'Open Backend API Docs',
          click: () => shell.openExternal('http://localhost:8000/docs'),
        },
      ],
    },
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// IPC handlers
ipcMain.handle('app:get-version', () => app.getVersion())
ipcMain.handle('app:get-path', (_, name) => app.getPath(name))
ipcMain.handle('dialog:open-file', async (_, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options)
  return result
})
ipcMain.handle('dialog:save-file', async (_, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options)
  return result
})

app.whenReady().then(() => {
  startBackend()
  // Wait a moment for backend to start
  setTimeout(createWindow, 1500)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (backendProcess) backendProcess.kill()
    app.quit()
  }
})

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill()
})
