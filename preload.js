const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // SRTファイルを選択
    selectSrtFile: () => ipcRenderer.invoke('select-srt-file'),

    // SRTファイルを保存
    saveSrtFile: (content, defaultName) =>
        ipcRenderer.invoke('save-srt-file', { content, defaultName }),

    // テキストファイルを保存
    saveTxtFile: (content, defaultName) =>
        ipcRenderer.invoke('save-txt-file', { content, defaultName }),

    // APIキー取得
    getApiKey: () => ipcRenderer.invoke('get-api-key'),

    // APIキー保存
    saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey)
});
