const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

let mainWindow
let backendProcess

function startBackend() {
  return new Promise((resolve, reject) => {
    const dbPath = path.join(app.getPath('userData'), 'converge.db')

    const isDev = !app.isPackaged
    const binaryName = process.platform === 'win32' ? 'desktop.exe' : 'desktop'
    const binaryPath = isDev
      ? path.join(__dirname, '..', 'backend', 'bin', binaryName)
      : path.join(process.resourcesPath, binaryName)

    backendProcess = spawn(binaryPath, [], {
      env: { ...process.env, DB_PATH: dbPath },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    backendProcess.stdout.on('data', (data) => console.log(`[backend] ${data}`))
    backendProcess.stderr.on('data', (data) => console.error(`[backend] ${data}`))
    backendProcess.on('error', (err) => {
      console.error('Failed to start backend:', err)
      reject(err)
    })

    const maxRetries = 20
    let retries = 0
    const check = () => {
      retries++
      const req = http.get('http://localhost:8080/api/branches', (res) => {
        if (res.statusCode < 500) {
          resolve()
        } else if (retries < maxRetries) {
          setTimeout(check, 500)
        } else {
          reject(new Error('Backend health check failed'))
        }
      })
      req.on('error', () => {
        if (retries < maxRetries) {
          setTimeout(check, 500)
        } else {
          reject(new Error('Backend not reachable'))
        }
      })
      req.end()
    }
    setTimeout(check, 500)
  })
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'))
  }
}

app.whenReady().then(async () => {
  try {
    await startBackend()
    await createWindow()
  } catch (err) {
    console.error('Startup failed:', err)
    app.quit()
  }
})

app.on('window-all-closed', () => {
  if (backendProcess) {
    backendProcess.kill()
  }
  app.quit()
})

app.on('before-quit', () => {
  if (backendProcess) {
    backendProcess.kill()
  }
})
