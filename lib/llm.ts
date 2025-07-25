import OpenAI from 'openai';
import { z } from 'zod';

// OpenAI クライアントの初期化
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// 障害判定結果のスキーマ定義
export const IncidentDetectionResultSchema = z.object({
  is_incident: z.boolean(),
  confidence: z.number().min(0).max(1),
  severity_level: z.number().min(1).max(4),
  title: z.string(),
  description: z.string(),
  keywords: z.array(z.string())
});

export type IncidentDetectionResult = z.infer<typeof IncidentDetectionResultSchema>;

// 障害判定プロンプトテンプレート
const INCIDENT_DETECTION_PROMPT = `
以下のSlackスレッドの会話を分析し、システム障害について議論しているか判定してください。

判定基準：
- エラー、ダウン、障害、不具合などのキーワード
- ユーザーからの問題報告
- システムの異常動作の報告
- パフォーマンス低下の報告

会話内容：
{messages}

以下のJSON形式で回答してください：
{
  "is_incident": boolean,
  "confidence": 0.0-1.0,
  "severity_level": 1-4,
  "title": "簡潔なタイトル",
  "description": "障害の概要",
  "keywords": ["検出されたキーワード"]
}

重要度レベル：
1: 低 - 軽微な問題、単一ユーザーへの影響
2: 中 - 一部機能の問題、複数ユーザーへの影響
3: 高 - 主要機能の問題、多数のユーザーへの影響
4: 緊急 - システム全体の障害、全ユーザーへの影響
`;

// 汎用的なLLM呼び出し関数
export async function callLLM(prompt: string): Promise<string> {
  const client = getOpenAIClient();
  
  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'あなたはシステム運用の専門家です。与えられた情報を正確に分析し、指定された形式で回答してください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // より一貫性のある回答のため低めに設定
      max_tokens: 1000
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('LLM response is empty');
    }

    return content;
  } catch (error) {
    console.error('LLM API call error:', error);
    throw error;
  }
}

// メッセージ配列を整形する関数
function formatMessages(messages: Array<{ user: string; text: string; ts: string }>): string {
  return messages
    .map(msg => `[${msg.ts}] ${msg.user}: ${msg.text}`)
    .join('\n');
}

// 障害判定を行う関数
export async function detectIncident(
  messages: Array<{ user: string; text: string; ts: string }>
): Promise<IncidentDetectionResult> {
  const formattedMessages = formatMessages(messages);
  const prompt = INCIDENT_DETECTION_PROMPT.replace('{messages}', formattedMessages);
  
  try {
    const response = await callLLM(prompt);
    
    // JSONを抽出（マークダウンのコードブロックに囲まれている場合も考慮）
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) || response.match(/({[\s\S]*})/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error('Failed to extract JSON from LLM response');
    }
    
    const jsonStr = jsonMatch[1];
    const parsed = JSON.parse(jsonStr);
    
    // スキーマでバリデーション
    const result = IncidentDetectionResultSchema.parse(parsed);
    
    return result;
  } catch (error) {
    console.error('Incident detection error:', error);
    // エラー時はデフォルトの結果を返す
    return {
      is_incident: false,
      confidence: 0,
      severity_level: 1,
      title: 'Detection Error',
      description: 'Failed to analyze the messages',
      keywords: []
    };
  }
}

// 信頼度スコアの基準に基づいた説明を取得
export function getConfidenceDescription(confidence: number): string {
  if (confidence >= 0.9) {
    return '明確な障害報告（「サーバーダウン」「全面障害」等）';
  } else if (confidence >= 0.7) {
    return '障害の可能性が高い（複数のエラー報告、影響範囲の議論）';
  } else if (confidence >= 0.5) {
    return '障害の可能性あり（断片的なエラー報告）';
  } else {
    return '障害の可能性低い';
  }
}

// LLM接続テスト用の関数
export async function testLLMConnection(): Promise<boolean> {
  try {
    const response = await callLLM('Hello, please respond with "OK" if you can read this.');
    return response.toLowerCase().includes('ok');
  } catch (error) {
    console.error('LLM connection test failed:', error);
    return false;
  }
} 