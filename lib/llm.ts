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

// インシデント分析レポートのスキーマ定義
export const IncidentAnalysisReportSchema = z.object({
  title: z.string(),
  discovery_process: z.string(),
  issue_overview: z.string(),
  root_cause: z.string(),
  actions_taken: z.string(),
  future_considerations: z.string()
});

export type IncidentAnalysisReport = z.infer<typeof IncidentAnalysisReportSchema>;

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

// インシデント分析レポートプロンプトテンプレート
const INCIDENT_ANALYSIS_PROMPT = `
以下のSlackスレッドの会話を詳細に分析し、インシデントの報告書を作成してください。
会話の時系列と内容を精査し、障害の全体像を把握した上で、以下の項目について詳しく記述してください。

会話内容：
{messages}

以下のJSON形式で、インシデント報告書を作成してください：
{
  "title": "インシデントの適切なタイトル（具体的で簡潔に）",
  "discovery_process": "発覚した経緯（誰が、いつ、どのように問題を発見したか）",
  "issue_overview": "トラブルの概要（何が起きたか、影響範囲、影響を受けたシステムやユーザー）",
  "root_cause": "主な原因を文字列として記載（判明している原因と推測される原因を区別して一つの文章で記載）",
  "actions_taken": "対応や改善策（実施された対応、その結果、残っている作業）",
  "future_considerations": "今後検討が必要なこと（再発防止策、改善提案、監視強化ポイント）"
}

重要：すべてのフィールドは文字列（string）として出力してください。オブジェクトや配列は使用しないでください。

注意事項：
- 会話から読み取れる事実を基に記述してください
- 推測と事実を明確に区別してください
- 技術的な詳細も含めて記載してください
- 時系列がわかるように記述してください
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

// インシデント分析レポートを生成
export async function generateIncidentReport(
  messages: Array<{ user: string; text: string; ts: string }>
): Promise<IncidentAnalysisReport> {
  try {
    const client = getOpenAIClient();
    
    // メッセージを整形
    const formattedMessages = messages
      .map(m => `[${new Date(parseFloat(m.ts) * 1000).toLocaleString('ja-JP')}] ${m.user}: ${m.text}`)
      .join('\n');
    
    const prompt = INCIDENT_ANALYSIS_PROMPT.replace('{messages}', formattedMessages);
    
    console.log('Generating incident analysis report...');
    
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'あなたはシステム障害の分析と報告書作成の専門家です。提供された会話ログから、詳細で実用的なインシデント報告書を作成してください。すべてのフィールドは文字列として出力し、オブジェクトや配列は使用しないでください。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });
    
    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('No content in OpenAI response');
    }
    
    const result = JSON.parse(content);
    console.log('Raw analysis result:', result);
    
    // root_causeがオブジェクトの場合は文字列に変換
    if (typeof result.root_cause === 'object' && result.root_cause !== null) {
      const causes = [];
      if (result.root_cause.identified_causes) {
        causes.push(`【判明している原因】${result.root_cause.identified_causes}`);
      }
      if (result.root_cause.speculated_causes) {
        causes.push(`【推測される原因】${result.root_cause.speculated_causes}`);
      }
      result.root_cause = causes.join(' ');
    }
    
    // Zodでバリデーション
    const validatedResult = IncidentAnalysisReportSchema.parse(result);
    
    return validatedResult;
  } catch (error) {
    console.error('Error generating incident report:', error);
    throw error;
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