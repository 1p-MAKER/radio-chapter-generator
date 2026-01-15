/**
 * Gemini API連携
 * 会話内容を分析して話題リストを生成
 */

class GeminiAPI {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    }

    /**
     * テキストから話題リストを生成
     * @param {string} text - SRTから抽出したテキスト
     * @returns {Promise<Array>} 話題の配列
     */
    async analyzeTopics(text) {
        const prompt = `以下は2人の話者によるラジオトークの書き起こしです。
会話の内容を分析して、話題ごとにまとめてください。

【出力形式】
- 各話題を1行ずつ、簡潔に箇条書きで
- 話題の順番は会話の流れに沿って
- 5〜10個程度の話題にまとめる
- 具体的なエピソードや内容がわかるように
- 「〜の話」「〜について」などの形式で

【会話内容】
${text}

【話題リスト】`;

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
                    temperature: 0.7,
                    maxOutputTokens: 1000
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'API呼び出しに失敗しました');
        }

        const data = await response.json();
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // 箇条書きをパース
        return this.parseTopicList(generatedText);
    }

    /**
     * 生成されたテキストから話題リストを抽出
     */
    parseTopicList(text) {
        const lines = text.split('\n');
        const topics = [];

        for (const line of lines) {
            // 箇条書きマーカーを除去
            const cleaned = line
                .replace(/^[\s]*[-・●•*]\s*/, '')
                .replace(/^\d+\.\s*/, '')
                .trim();

            if (cleaned.length > 0) {
                topics.push(cleaned);
            }
        }

        return topics;
    }

    /**
     * 分割されたテキストをそれぞれ分析
     */
    async analyzeSplitTopics(text1, text2) {
        const [topics1, topics2] = await Promise.all([
            this.analyzeTopics(text1),
            this.analyzeTopics(text2)
        ]);

        return { part1: topics1, part2: topics2 };
    }
}

// グローバルに公開
window.GeminiAPI = GeminiAPI;
