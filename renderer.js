/**
 * レンダラープロセス - UIロジック
 */

// 状態管理
let currentFile = null;
let srtEntries = [];
let generatedTopics = null;
let generatedSrt = '';
let currentSplitMs = 0; // 分割点を保持

// DOM要素
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const apiStatus = document.getElementById('apiStatus');
const selectFileBtn = document.getElementById('selectFileBtn');
const fileInfo = document.getElementById('fileInfo');
const fileName = document.getElementById('fileName');
const fileMeta = document.getElementById('fileMeta');
const splitTimeInput = document.getElementById('splitTime');
const generateBtn = document.getElementById('generateBtn');
const loading = document.getElementById('loading');
const resultSection = document.getElementById('resultSection');
const resultContent = document.getElementById('resultContent');
const saveBtn = document.getElementById('saveBtn');
const saveTxtBtn = document.getElementById('saveTxtBtn');
const copyBtn = document.getElementById('copyBtn');
const splitModeRadios = document.querySelectorAll('input[name="splitMode"]');

// 初期化
async function init() {
    // APIキーを読み込み
    const apiKey = await window.electronAPI.getApiKey();
    if (apiKey && apiKey !== 'your_api_key_here') {
        apiKeyInput.value = apiKey;
        apiStatus.textContent = '✓ APIキー設定済み';
        apiStatus.classList.add('success');
    }

    // イベントリスナー設定
    setupEventListeners();
}

function setupEventListeners() {
    // APIキー保存
    saveApiKeyBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            apiStatus.textContent = 'APIキーを入力してください';
            return;
        }

        await window.electronAPI.saveApiKey(apiKey);
        apiStatus.textContent = '✓ APIキーを保存しました';
        apiStatus.classList.add('success');
        updateGenerateButton();
    });

    // ファイル選択
    selectFileBtn.addEventListener('click', async () => {
        const result = await window.electronAPI.selectSrtFile();
        if (result) {
            currentFile = result;
            srtEntries = SrtParser.parse(result.content);

            // ファイル情報を表示
            const pathParts = result.path.split('/');
            fileName.textContent = pathParts[pathParts.length - 1];

            const totalDuration = srtEntries.length > 0
                ? srtEntries[srtEntries.length - 1].endMs
                : 0;
            const durationStr = formatDuration(totalDuration);
            fileMeta.textContent = `${srtEntries.length}件のエントリ / 約${durationStr}`;

            fileInfo.classList.remove('hidden');
            updateGenerateButton();
        }
    });

    // 分割モード切り替え
    splitModeRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            splitTimeInput.disabled = e.target.value !== 'time';
        });
    });

    // チャプター生成
    generateBtn.addEventListener('click', generateChapters);

    // SRT保存
    saveBtn.addEventListener('click', async () => {
        if (!generatedSrt) return;

        const defaultName = currentFile
            ? currentFile.path.replace('.srt', '_chapters.srt')
            : 'chapters.srt';

        const pathParts = defaultName.split('/');
        const savedName = pathParts[pathParts.length - 1];

        const success = await window.electronAPI.saveSrtFile(generatedSrt, savedName);
        if (success) {
            alert('SRTファイルを保存しました！');
        }
    });

    // テキスト保存
    saveTxtBtn.addEventListener('click', async () => {
        if (!generatedTopics) return;

        const textContent = generateTextContent();
        const defaultName = currentFile
            ? currentFile.path.replace('.srt', '_chapters.txt')
            : 'chapters.txt';

        const pathParts = defaultName.split('/');
        const savedName = pathParts[pathParts.length - 1];

        const success = await window.electronAPI.saveTxtFile(textContent, savedName);
        if (success) {
            alert('テキストファイルを保存しました！');
        }
    });

    // コピー
    copyBtn.addEventListener('click', () => {
        if (!generatedTopics) return;

        const textToCopy = generateTextContent();

        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '✓ コピーしました';
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);
        });
    });
}

function updateGenerateButton() {
    const hasApiKey = apiKeyInput.value.trim() && apiKeyInput.value !== 'your_api_key_here';
    const hasFile = currentFile !== null;
    generateBtn.disabled = !(hasApiKey && hasFile);
}

async function generateChapters() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey || !currentFile) return;

    // 分割モード取得
    const splitMode = document.querySelector('input[name="splitMode"]:checked').value;

    // UI更新
    generateBtn.disabled = true;
    loading.classList.remove('hidden');
    resultSection.classList.add('hidden');

    try {
        const gemini = new GeminiAPI(apiKey);

        if (splitMode === 'none') {
            // 分割なし
            const text = SrtParser.extractTextWithTimestamp(srtEntries);
            const result = await gemini.analyzeTopics(text);
            generatedTopics = result; // { title: "...", topics: [...] }
            generatedSrt = SrtParser.generateChapterSrt(result.topics || result);

            displayResults(result);
        } else {
            // 分割あり
            let splitResult;

            if (splitMode === 'half') {
                splitResult = SrtParser.splitInHalf(srtEntries);
            } else {
                const splitMs = SrtParser.parseTimeInput(splitTimeInput.value);
                splitResult = SrtParser.splitByTime(srtEntries, splitMs);
            }

            currentSplitMs = splitResult.splitMs;

            const text1 = SrtParser.extractTextWithTimestamp(splitResult.part1);
            const text2 = SrtParser.extractTextWithTimestamp(splitResult.part2);

            // 後半のタイムスタンプを調整するために分割点を渡す
            const result = await gemini.analyzeSplitTopics(text1, text2, currentSplitMs);
            generatedTopics = result; // { part1: {title, topics}, part2: {title, topics} }
            generatedSrt = SrtParser.generateSplitChapterSrt(result.part1, result.part2);

            displaySplitResults(result.part1, result.part2);
        }

        resultSection.classList.remove('hidden');
    } catch (error) {
        alert(`エラー: ${error.message}`);
        console.error(error);
    } finally {
        generateBtn.disabled = false;
        loading.classList.add('hidden');
    }
}

function displayResults(data) {
    const topics = data.topics || data;
    const title = data.title || '（タイトルなし）';

    resultContent.innerHTML = `
    <div class="video-title-section">
      <div class="part-title">📺 動画タイトル</div>
      <div class="video-title">${escapeHtml(title)}</div>
    </div>
    
    <div class="part-title">【今回の話題】</div>
    ${topics.map(t => {
        const text = typeof t === 'string' ? `・${t}` : `${t.time} ${escapeHtml(t.topic)}`;
        return `<div class="topic-item">${text}</div>`;
    }).join('')}
  `;
}

function displaySplitResults(part1, part2) {
    const p1Topics = part1.topics || part1;
    const p1Title = part1.title || '（タイトルなし）';
    const p2Topics = part2.topics || part2;
    const p2Title = part2.title || '（タイトルなし）';

    resultContent.innerHTML = `
    <div class="video-title-section">
      <div class="part-title">📺 前半動画タイトル</div>
      <div class="video-title">${escapeHtml(p1Title)}</div>
    </div>
    <div class="part-title">【前半の話題】</div>
    ${p1Topics.map(t => {
        const text = typeof t === 'string' ? `・${t}` : `${t.time} ${escapeHtml(t.topic)}`;
        return `<div class="topic-item">${text}</div>`;
    }).join('')}
    
    <hr class="divider">
    
    <div class="video-title-section">
      <div class="part-title">📺 後半動画タイトル</div>
      <div class="video-title">${escapeHtml(p2Title)}</div>
    </div>
    <div class="part-title">【後半の話題】</div>
    ${p2Topics.map(t => {
        const text = typeof t === 'string' ? `・${t}` : `${t.time} ${escapeHtml(t.topic)}`;
        return `<div class="topic-item">${text}</div>`;
    }).join('')}
  `;
}

// テキスト内容を生成（コピーとテキスト保存で共通）
function generateTextContent() {
    let text = '';

    // 分割ありの場合の構造チェック
    if (generatedTopics.part1 && generatedTopics.part2) {
        const p1 = generatedTopics.part1;
        const p2 = generatedTopics.part2;
        const p1Topics = p1.topics || p1;
        const p1Title = p1.title || '';
        const p2Topics = p2.topics || p2;
        const p2Title = p2.title || '';

        text = `【前半タイトル】\n${p1Title}\n\n`;
        text += '【前半の話題】\n';
        text += p1Topics.map(t =>
            typeof t === 'string' ? `・${t}` : `${t.time} ${t.topic}`
        ).join('\n');

        text += '\n\n-------------------\n\n';

        text += `【後半タイトル】\n${p2Title}\n\n`;
        text += '【後半の話題】\n';
        text += p2Topics.map(t =>
            typeof t === 'string' ? `・${t}` : `${t.time} ${t.topic}`
        ).join('\n');
    }
    // 分割なしの場合
    else {
        const topics = generatedTopics.topics || generatedTopics;
        const title = generatedTopics.title || '';

        text = `【動画タイトル】\n${title}\n\n`;
        text += '【今回の話題】\n';
        text += topics.map(t =>
            typeof t === 'string' ? `・${t}` : `${t.time} ${t.topic}`
        ).join('\n');
    }
    return text;
}

function formatDuration(ms) {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);

    if (hours > 0) {
        return `${hours}時間${minutes}分`;
    }
    return `${minutes}分`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 初期化実行
init();
