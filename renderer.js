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

// サムネイル用DOM要素
const thumbSection1 = document.getElementById('thumbSection1');
const thumbSection2 = document.getElementById('thumbSection2');
const dropZone1 = document.getElementById('dropZone1');
const dropZone2 = document.getElementById('dropZone2');
const bgInput1 = document.getElementById('bgInput1');
const bgInput2 = document.getElementById('bgInput2');
const thumbCanvas1 = document.getElementById('thumbCanvas1');
const thumbCanvas2 = document.getElementById('thumbCanvas2');
const downloadThumb1 = document.getElementById('downloadThumb1');
const downloadThumb2 = document.getElementById('downloadThumb2');
const textPattern1 = document.getElementById('textPattern1');
const textPattern2 = document.getElementById('textPattern2');
const thumbMain1 = document.getElementById('thumbMain1');
const thumbSub1 = document.getElementById('thumbSub1');
const thumbMain2 = document.getElementById('thumbMain2');
const thumbSub2 = document.getElementById('thumbSub2');

// サムネ画像の状態
let thumbImg1 = null;
let thumbImg2 = null;

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

    // サムネイル関連のリスナー
    setupThumbnailListeners(1);
    setupThumbnailListeners(2);
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

            // サムネUI更新
            thumbSection1.classList.remove('hidden');
            thumbSection2.classList.add('hidden');
            document.getElementById('thumbTitle1').textContent = 'サムネイル画像';
            updateThumbnailInputs(1, result.thumbnails);

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

            // サムネUI更新
            thumbSection1.classList.remove('hidden');
            thumbSection2.classList.remove('hidden');
            document.getElementById('thumbTitle1').textContent = '前半用サムネイル画像';
            updateThumbnailInputs(1, result.part1.thumbnails);
            updateThumbnailInputs(2, result.part2.thumbnails);
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
    const titles = data.titles || (data.title ? [data.title] : ['（タイトルなし）']);

    resultContent.innerHTML = `
    <div class="video-title-section">
      <div class="part-title">📺 動画タイトル案（ABテスト用）</div>
      ${titles.map((t, i) => `<div class="video-title-item"><span class="title-label">案${i + 1}:</span> ${escapeHtml(t)}</div>`).join('')}
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
    const p1Titles = part1.titles || (part1.title ? [part1.title] : ['（タイトルなし）']);
    const p2Topics = part2.topics || part2;
    const p2Titles = part2.titles || (part2.title ? [part2.title] : ['（タイトルなし）']);

    resultContent.innerHTML = `
    <div class="video-title-section">
      <div class="part-title">📺 前半動画タイトル案</div>
      ${p1Titles.map((t, i) => `<div class="video-title-item"><span class="title-label">案${i + 1}:</span> ${escapeHtml(t)}</div>`).join('')}
    </div>
    <div class="part-title">【前半の話題】</div>
    ${p1Topics.map(t => {
        const text = typeof t === 'string' ? `・${t}` : `${t.time} ${escapeHtml(t.topic)}`;
        return `<div class="topic-item">${text}</div>`;
    }).join('')}
    
    <hr class="divider">
    
    <div class="video-title-section">
      <div class="part-title">📺 後半動画タイトル案</div>
      ${p2Titles.map((t, i) => `<div class="video-title-item"><span class="title-label">案${i + 1}:</span> ${escapeHtml(t)}</div>`).join('')}
    </div>
    <div class="part-title">【後半の話題】</div>
    ${p2Topics.map(t => {
        const text = typeof t === 'string' ? `・${t}` : `${t.time} ${escapeHtml(t.topic)}`;
        return `<div class="topic-item">${text}</div>`;
    }).join('')}
  `;
}

// テキスト内容を生成（コピーとテキスト保存で共通）
// テキスト内容を生成（コピーとテキスト保存で共通）
function generateTextContent() {
    let text = '';

    // 分割ありの場合の構造チェック
    if (generatedTopics.part1 && generatedTopics.part2) {
        const p1 = generatedTopics.part1;
        const p2 = generatedTopics.part2;

        const p1Titles = p1.titles || (p1.title ? [p1.title] : ['（タイトルなし）']);
        const p2Titles = p2.titles || (p2.title ? [p2.title] : ['（タイトルなし）']);
        const p1Thumbs = p1.thumbnails || [];
        const p2Thumbs = p2.thumbnails || [];
        const p1Topics = p1.topics || p1;
        const p2Topics = p2.topics || p2;

        text += '【前半タイトル案】\n';
        p1Titles.forEach((t, i) => text += `案${i + 1}: ${t}\n`);
        text += '\n【前半サムネ文言案】\n';
        p1Thumbs.forEach((tm, i) => text += `案${i + 1}: メイン「${tm.main}」 サブ「${tm.sub}」\n`);
        text += '\n【前半の話題】\n';
        text += p1Topics.map(t =>
            typeof t === 'string' ? `・${t}` : `${t.time} ${t.topic}`
        ).join('\n');

        text += '\n\n-------------------\n\n';

        text += '【後半タイトル案】\n';
        p2Titles.forEach((t, i) => text += `案${i + 1}: ${t}\n`);
        text += '\n【後半サムネ文言案】\n';
        p2Thumbs.forEach((tm, i) => text += `案${i + 1}: メイン「${tm.main}」 サブ「${tm.sub}」\n`);
        text += '\n【後半の話題】\n';
        text += p2Topics.map(t =>
            typeof t === 'string' ? `・${t}` : `${t.time} ${t.topic}`
        ).join('\n');
    }
    // 分割なしの場合
    else {
        const topics = generatedTopics.topics || generatedTopics;
        const titles = generatedTopics.titles || (generatedTopics.title ? [generatedTopics.title] : ['（タイトルなし）']);
        const thumbs = generatedTopics.thumbnails || [];

        text = '【動画タイトル案】\n';
        titles.forEach((t, i) => text += `案${i + 1}: ${t}\n`);
        text += '\n【サムネ文言案】\n';
        thumbs.forEach((tm, i) => text += `案${i + 1}: メイン「${tm.main}」 サブ「${tm.sub}」\n`);

        text += '\n【今回の話題】\n';
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

function setupThumbnailListeners(id) {
    const dropZone = id === 1 ? dropZone1 : dropZone2;
    const bgInput = id === 1 ? bgInput1 : bgInput2;
    const mainInput = id === 1 ? thumbMain1 : thumbMain2;
    const subInput = id === 1 ? thumbSub1 : thumbSub2;
    const downloadBtn = id === 1 ? downloadThumb1 : downloadThumb2;
    const canvas = id === 1 ? thumbCanvas1 : thumbCanvas2;
    const patternSelect = id === 1 ? textPattern1 : textPattern2;

    // ドロップゾーンクリックでファイル選択
    dropZone.addEventListener('click', () => bgInput.click());

    // ファイル選択時
    bgInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) loadThumbnailImage(file, id);
    });

    // ドラッグ＆ドロップ
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--accent)';
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border)';
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = 'var(--border)';
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            loadThumbnailImage(file, id);
        }
    });

    // テキスト変更時に再描画
    mainInput.addEventListener('input', () => drawThumbnail(id));
    subInput.addEventListener('input', () => drawThumbnail(id));

    // パターン変更時にテキスト更新
    patternSelect.addEventListener('change', (e) => {
        const index = parseInt(e.target.value);
        let thumbs;

        if (generatedTopics && generatedTopics.part1 && generatedTopics.part2) {
            thumbs = id === 1
                ? (generatedTopics.part1.thumbnails || [])
                : (generatedTopics.part2.thumbnails || []);
        } else if (generatedTopics) {
            thumbs = generatedTopics.thumbnails || [];
        } else {
            thumbs = [];
        }

        if (thumbs[index]) {
            mainInput.value = thumbs[index].main;
            subInput.value = thumbs[index].sub;
            drawThumbnail(id);
        }
    });

    // ダウンロード
    downloadBtn.addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = `thumbnail_part${id}_${getDateStr()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
}

function loadThumbnailImage(file, id) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            if (id === 1) thumbImg1 = img;
            else thumbImg2 = img;
            drawThumbnail(id);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

function drawThumbnail(id) {
    const canvas = id === 1 ? thumbCanvas1 : thumbCanvas2;
    const ctx = canvas.getContext('2d');
    const img = id === 1 ? thumbImg1 : thumbImg2;
    const mainText = id === 1 ? thumbMain1.value : thumbMain2.value;
    const subText = id === 1 ? thumbSub1.value : thumbSub2.value;

    // キャンバスをクリア
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 画像描画
    if (img) {
        // アスペクト比を維持して中央に配置（カバー）
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height);
        const x = (canvas.width - img.width * scale) / 2;
        const y = (canvas.height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
    } else {
        // 画像がない場合はグレー背景
        ctx.fillStyle = '#333';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // ガイドテキスト
        ctx.fillStyle = '#666';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('画像をドロップしてください', canvas.width / 2, canvas.height / 2);
    }

    // テキスト描画（共通設定）
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 4;

    // メインテキスト（中央）
    if (mainText) {
        ctx.font = '900 100px "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif'; // 極太ゴシック

        // 縁取り
        ctx.lineWidth = 20;
        ctx.strokeStyle = 'black';
        ctx.strokeText(mainText, canvas.width / 2, canvas.height / 2 + 30);

        // 中身（グラデーション）
        const gradient = ctx.createLinearGradient(0, canvas.height / 2 - 60, 0, canvas.height / 2 + 60);
        gradient.addColorStop(0, '#FFFFFF');
        gradient.addColorStop(0.5, '#FFFF00'); // 黄色
        gradient.addColorStop(1, '#FFCC00'); // 濃い黄色
        ctx.fillStyle = gradient;
        ctx.fillText(mainText, canvas.width / 2, canvas.height / 2 + 30);
    }

    // サブテキスト（上部）
    if (subText) {
        ctx.font = 'bold 60px "Hiragino Sans", sans-serif';

        // 縁取り
        ctx.lineWidth = 12;
        ctx.strokeStyle = 'black';
        ctx.strokeText(subText, canvas.width / 2, 100);

        // 中身（白）
        ctx.fillStyle = 'white';
        ctx.fillText(subText, canvas.width / 2, 100);
    }
}

function getDateStr() {
    const now = new Date();
    return `${now.getMonth() + 1}${now.getDate()}`;
}

function updateThumbnailInputs(id, thumbnails) {
    const mainInput = id === 1 ? thumbMain1 : thumbMain2;
    const subInput = id === 1 ? thumbSub1 : thumbSub2;
    const patternSelect = id === 1 ? textPattern1 : textPattern2;

    // デフォルトで案1を選択
    patternSelect.value = "0";

    if (thumbnails && thumbnails.length > 0) {
        mainInput.value = thumbnails[0].main || '';
        subInput.value = thumbnails[0].sub || '';
    } else {
        mainInput.value = '';
        subInput.value = '';
    }

    // 描画更新
    drawThumbnail(id);
}
