const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// .envファイルを読み込む
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        backgroundColor: '#1a1a2e',
        titleBarStyle: 'hiddenInset'
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ファイル選択ダイアログ
ipcMain.handle('select-srt-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'SRT Files', extensions: ['srt'] }]
    });

    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }

    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    return { path: filePath, content };
});

// ファイル保存ダイアログ
ipcMain.handle('save-srt-file', async (event, { content, defaultName }) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [{ name: 'SRT Files', extensions: ['srt'] }]
    });

    if (result.canceled) {
        return false;
    }

    fs.writeFileSync(result.filePath, content, 'utf-8');
    return true;
});

// Gemini APIキーを取得
ipcMain.handle('get-api-key', () => {
    return process.env.GEMINI_API_KEY || '';
});

// Gemini APIキーを保存
ipcMain.handle('save-api-key', (event, apiKey) => {
    process.env.GEMINI_API_KEY = apiKey;
    fs.writeFileSync(envPath, `GEMINI_API_KEY=${apiKey}\n`, 'utf-8');
    return true;
});
