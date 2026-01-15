/**
 * レンダラープロセス - UIロジック
 */

// 状態管理
let currentFile = null;
let srtEntries = [];
let generatedTopics = null;
let generatedSrt = '';

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

    // 保存
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

    // コピー
    copyBtn.addEventListener('click', () => {
        if (!generatedTopics) return;

        let textToCopy = '';
        if (generatedTopics.part1 && generatedTopics.part2) {
            textToCopy = '【前半の話題】\n';
            textToCopy += generatedTopics.part1.map(t => `・${t}`).join('\n');
            textToCopy += '\n\n【後半の話題】\n';
            textToCopy += generatedTopics.part2.map(t => `・${t}`).join('\n');
        } else {
            textToCopy = '【今回の話題】\n';
            textToCopy += generatedTopics.map(t => `・${t}`).join('\n');
        }

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
            const text = SrtParser.extractText(srtEntries);
            generatedTopics = await gemini.analyzeTopics(text);
            generatedSrt = SrtParser.generateChapterSrt(generatedTopics);

            displayResults(generatedTopics);
        } else {
            // 分割あり
            let part1, part2;

            if (splitMode === 'half') {
                const split = SrtParser.splitInHalf(srtEntries);
                part1 = split.part1;
                part2 = split.part2;
            } else {
                const splitMs = SrtParser.parseTimeInput(splitTimeInput.value);
                const split = SrtParser.splitByTime(srtEntries, splitMs);
                part1 = split.part1;
                part2 = split.part2;
            }

            const text1 = SrtParser.extractText(part1);
            const text2 = SrtParser.extractText(part2);

            const result = await gemini.analyzeSplitTopics(text1, text2);
            generatedTopics = result;
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

function displayResults(topics) {
    resultContent.innerHTML = `
    <div class="part-title">【今回の話題】</div>
    ${topics.map(t => `<div class="topic-item">・${escapeHtml(t)}</div>`).join('')}
  `;
}

function displaySplitResults(part1, part2) {
    resultContent.innerHTML = `
    <div class="part-title">【前半の話題】</div>
    ${part1.map(t => `<div class="topic-item">・${escapeHtml(t)}</div>`).join('')}
    <div class="part-title" style="margin-top: 20px;">【後半の話題】</div>
    ${part2.map(t => `<div class="topic-item">・${escapeHtml(t)}</div>`).join('')}
  `;
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
