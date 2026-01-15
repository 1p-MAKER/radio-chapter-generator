/**
 * Gemini API連携
 * 会話内容を分析して話題リストを生成（タイムスタンプ付き）
 */

class GeminiAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
    }

    /**
     * テキストから話題リストを生成（タイムスタンプ付き）
     * @param {string} text - SRTから抽出したテキスト（タイムスタンプ情報付き）
     * @returns {Promise<Array>} 話題の配列 [{time: "00:05:30", topic: "話題名"}, ...]
     */
    async analyzeTopics(text) {
        // 今日の日付を取得 (例: 1月15日)
        const today = new Date();
        const dateStr = `${today.getMonth() + 1}月${today.getDate()}日`;

        const prompt = `以下は2人の話者によるラジオトークの書き起こしです。タイムスタンプ付きで記載されています。
会話の内容を分析して、話題リストとYouTube動画用タイトルを生成してください。

【重要：表現スタイル】
- 週刊誌や東スポの見出しのような、フランクでキャッチーな表現にしてください
- 大げさで面白い言い回しを使ってください
- 「〜か!?」「〜の真相」「衝撃の〜」「まさかの〜」など煽り系の表現OK
- 堅い表現はNG、くだけたノリで

【YouTubeタイトル生成ルール】
- **SEOを意識し、クリックしたくなるような強いパワーワード**を使ってください
- タイトルの末尾には必ず「沖縄ラジオスター ${dateStr}」を含めてください
- タイトル全体の長さが**100文字近く**になるように、検索されそうな関連ワードや煽り文句を盛り込んでください（YouTubeのタイトル上限は100文字）
- 内容を具体的に示唆しつつ、続きが気になるような書き方にしてください

【出力形式】
以下のJSON形式のみを出力してください。Markdownのコードブロックは不要です。
{
  "title": "ここに生成したYouTubeタイトル記述（100文字近く）",
  "topics": [
    { "time": "HH:MM:SS", "topic": "話題の内容（最大24文字）" },
    ...
  ]
}

【会話内容】
${text}`;

        const response = await fetch(`${this.baseUrl}?key=${this.apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.8, // 創造性を上げるために少し高く
                    responseMimeType: "application/json"
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API呼び出しに失敗しました');
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        try {
            return JSON.parse(generatedText);
        } catch (e) {
            console.error("JSON parse error:", e);
            console.log("Raw text:", generatedText);
            // フォールバック（以前のパーサーを使用する場合など）
            return {
                title: `ラジオ書き起こし 沖縄ラジオスター ${dateStr}`,
                topics: this.parseTopicListWithTimestamp(generatedText)
            };
        }
    }

    /**
     * 生成されたテキストからタイムスタンプ付き話題リストを抽出
     */
    parseTopicListWithTimestamp(text) {
        const lines = text.split('\n');
        const topics = [];

        // タイムスタンプパターン: HH:MM:SS または MM:SS
        const timePattern = /^[\s]*(?:[-・●•*]\s*)?(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/;

        for (const line of lines) {
            const match = line.match(timePattern);
            if (match) {
                let time = match[1];
                const topic = match[2].trim();

                // MM:SS形式の場合は00:MM:SSに変換
                if (time.split(':').length === 2) {
                    time = '00:' + time;
                }

                if (topic.length > 0) {
                    topics.push({ time, topic });
                }
            }
        }

        return topics;
    }

    /**
     * 分割されたテキストをそれぞれ分析
     * @param {string} text1 - 前半のテキスト
     * @param {string} text2 - 後半のテキスト
     * @param {number} splitMs - 分割点（ミリ秒）- 後半のタイムスタンプ調整用
     */
    async analyzeSplitTopics(text1, text2, splitMs = 0) {
        const [result1, result2] = await Promise.all([
            this.analyzeTopics(text1),
            this.analyzeTopics(text2)
        ]);

        // 後半のタイムスタンプを調整（分割点を引く）
        let topics2 = [];
        if (result2.topics) {
            topics2 = result2.topics.map(item => {
                const adjustedTime = this.adjustTimestamp(item.time, splitMs);
                return { time: adjustedTime, topic: item.topic };
            });
        } else if (Array.isArray(result2)) {
            // 旧形式の場合のフォールバック
            topics2 = result2.map(item => {
                const adjustedTime = this.adjustTimestamp(item.time, splitMs);
                return { time: adjustedTime, topic: item.topic };
            });
        }

        return {
            part1: { title: result1.title, topics: result1.topics || result1 },
            part2: { title: result2.title, topics: topics2 }
        };
    }

    /**
     * タイムスタンプから分割点を引いて調整
     */
    adjustTimestamp(timeStr, subtractMs) {
        const parts = timeStr.split(':').map(Number);
        let totalMs;

        if (parts.length === 3) {
            totalMs = (parts[0] * 3600000) + (parts[1] * 60000) + (parts[2] * 1000);
        } else {
            totalMs = (parts[0] * 60000) + (parts[1] * 1000);
        }

        // 分割点を引く（マイナスにならないように）
        const adjustedMs = Math.max(0, totalMs - subtractMs);

        const hours = Math.floor(adjustedMs / 3600000);
        const minutes = Math.floor((adjustedMs % 3600000) / 60000);
        const seconds = Math.floor((adjustedMs % 60000) / 1000);

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

// グローバルに公開
window.GeminiAPI = GeminiAPI;
