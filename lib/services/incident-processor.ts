import { SlackMessage, CreateIncidentData } from '../models/incident';
import { detectIncident, getConfidenceDescription } from '../llm';
import { getThreadMessages, getUserInfo, postMessage } from '../slack';
import {
  findIncidentByThreadTs,
  createIncidentWithMessages,
  saveMessage,
  isMessageSaved
} from '../repositories/incident';

// 環境変数から設定を取得
const MIN_CONFIDENCE_FOR_AUTO_CREATE = parseFloat(
  process.env.MIN_CONFIDENCE_FOR_AUTO_CREATE || '0.5'
);

// 監視対象チャンネルのリスト（カンマ区切り）
const MONITOR_CHANNELS = process.env.MONITOR_CHANNELS 
  ? process.env.MONITOR_CHANNELS.split(',').map(ch => ch.trim())
  : [];

// メッセージイベントを処理
export async function processMessageEvent(message: SlackMessage): Promise<void> {
  const logPrefix = `[processMessageEvent ${message.ts}]`;
  
  try {
    console.log(`${logPrefix} 開始 - Channel: ${message.channel}, User: ${message.user}, Thread: ${message.thread_ts || 'なし'}`);
    console.log(`${logPrefix} メッセージ内容: ${message.text?.substring(0, 100)}...`);
    
    // 監視対象チャンネルの確認
    if (MONITOR_CHANNELS.length > 0 && !MONITOR_CHANNELS.includes(message.channel)) {
      console.log(`${logPrefix} Channel ${message.channel} is not in monitor list, skipping`);
      return;
    }
    
    // スレッドのルートメッセージのタイムスタンプを取得
    const threadTs = message.thread_ts || message.ts;
    console.log(`${logPrefix} スレッドTS: ${threadTs}, メッセージTS: ${message.ts}`);
    
    // 既存のインシデントを確認
    console.log(`${logPrefix} 既存インシデントを検索中...`);
    const existingIncident = await findIncidentByThreadTs(threadTs);
    
    if (existingIncident) {
      // 既存インシデントがある場合、メッセージを追加
      console.log(`${logPrefix} 既存インシデント発見: ${existingIncident.id}`);
      await addMessageToIncident(existingIncident.id, message);
      console.log(`${logPrefix} メッセージを既存インシデントに追加完了`);
      return;
    }
    
    console.log(`${logPrefix} 新規スレッドまたは既存インシデントなし`);
    
    // 新規スレッドまたは既存インシデントがない場合
    if (!message.thread_ts || message.thread_ts === message.ts) {
      // スレッドの最初のメッセージの場合、少し待ってから処理
      // （後続のメッセージを含めて分析するため）
      console.log(`${logPrefix} 新規スレッドのため、5秒後に分析を開始`);
      setTimeout(() => {
        console.log(`${logPrefix} 遅延実行: analyzeThread開始`);
        analyzeThread(message.channel, threadTs);
      }, 5000);
    } else {
      console.log(`${logPrefix} スレッドの返信メッセージですが、インシデントが見つかりません`);
    }
  } catch (error) {
    console.error(`${logPrefix} エラー発生:`, error);
    console.error(`${logPrefix} スタックトレース:`, error instanceof Error ? error.stack : 'N/A');
  }
}

// スレッドを分析してインシデントを検出
async function analyzeThread(channel: string, threadTs: string): Promise<void> {
  const logPrefix = `[analyzeThread ${threadTs}]`;
  
  try {
    console.log(`${logPrefix} 分析開始 - Channel: ${channel}`);
    
    // 既存のインシデントを再確認（タイミングの問題で重複を防ぐ）
    const existingIncident = await findIncidentByThreadTs(threadTs);
    if (existingIncident) {
      console.log(`${logPrefix} 既にインシデントが存在します: ${existingIncident.id}`);
      return;
    }
    
    // スレッドの全メッセージを取得
    console.log(`${logPrefix} Slackからスレッドメッセージを取得中...`);
    const messages = await getThreadMessages(channel, threadTs);
    console.log(`${logPrefix} 取得したメッセージ数: ${messages.length}`);
    
    if (messages.length === 0) {
      console.log(`${logPrefix} スレッドにメッセージが見つかりません`);
      return;
    }
    
    // ユーザー名を取得して置換
    console.log(`${logPrefix} ユーザー情報を取得中...`);
    const messagesWithUserNames = await Promise.all(
      messages.map(async (msg) => {
        const userInfo = await getUserInfo(msg.user);
        return {
          user: userInfo?.real_name || msg.user,
          text: msg.text,
          ts: msg.ts
        };
      })
    );
    console.log(`${logPrefix} ユーザー情報取得完了`);
    
    // LLMで障害判定
    console.log(`${logPrefix} LLMで障害判定中...`);
    const detectionResult = await detectIncident(messagesWithUserNames);
    
    console.log(`${logPrefix} 判定結果:`, {
      is_incident: detectionResult.is_incident,
      confidence: detectionResult.confidence,
      severity_level: detectionResult.severity_level,
      title: detectionResult.title
    });
    
    // 信頼度が閾値以上の場合、インシデントを作成
    if (detectionResult.is_incident && detectionResult.confidence >= MIN_CONFIDENCE_FOR_AUTO_CREATE) {
      console.log(`${logPrefix} インシデント作成中... (信頼度: ${detectionResult.confidence} >= ${MIN_CONFIDENCE_FOR_AUTO_CREATE})`);
      await createIncidentFromDetection(
        channel,
        threadTs,
        messages,
        detectionResult
      );
      console.log(`${logPrefix} インシデント作成完了`);
    } else {
      console.log(
        `${logPrefix} インシデントを作成しません。理由: is_incident=${detectionResult.is_incident}, 信頼度=${detectionResult.confidence} < ${MIN_CONFIDENCE_FOR_AUTO_CREATE}`
      );
    }
  } catch (error) {
    console.error(`${logPrefix} エラー発生:`, error);
    console.error(`${logPrefix} スタックトレース:`, error instanceof Error ? error.stack : 'N/A');
  }
}

// 検出結果からインシデントを作成
async function createIncidentFromDetection(
  channel: string,
  threadTs: string,
  messages: SlackMessage[],
  detectionResult: any
): Promise<void> {
  const logPrefix = `[createIncidentFromDetection ${threadTs}]`;
  
  try {
    console.log(`${logPrefix} インシデント作成処理開始`);
    
    // インシデントデータを準備
    const incidentData: CreateIncidentData = {
      slack_thread_ts: threadTs,
      channel_id: channel,
      title: detectionResult.title,
      description: detectionResult.description,
      severity_level: detectionResult.severity_level,
      confidence_score: detectionResult.confidence,
      llm_analysis: detectionResult
    };
    
    console.log(`${logPrefix} インシデントデータ:`, {
      title: incidentData.title,
      severity_level: incidentData.severity_level,
      confidence_score: incidentData.confidence_score
    });
    
    // メッセージデータを準備
    const messageData = messages.map(msg => ({
      slack_ts: msg.ts,
      user_id: msg.user,
      message: msg.text
    }));
    
    console.log(`${logPrefix} 保存するメッセージ数: ${messageData.length}`);
    
    // インシデントとメッセージを作成
    console.log(`${logPrefix} DBに保存中...`);
    const { incident } = await createIncidentWithMessages(incidentData, messageData);
    
    console.log(`${logPrefix} インシデントが正常に作成されました: ${incident.id}`);
    
    // 通知設定の確認と高重要度の場合は通知
    const notificationEnabled = process.env.NOTIFICATION_ENABLED !== 'false';
    const severityThreshold = parseInt(process.env.HIGH_SEVERITY_THRESHOLD || '3');
    
    if (notificationEnabled && incident.severity_level >= severityThreshold) {
      await notifyHighSeverityIncident(incident, channel);
    }
  } catch (error) {
    console.error(`${logPrefix} エラー発生:`, error);
    console.error(`${logPrefix} スタックトレース:`, error instanceof Error ? error.stack : 'N/A');
  }
}

// 既存インシデントにメッセージを追加
async function addMessageToIncident(
  incidentId: string,
  message: SlackMessage
): Promise<void> {
  const logPrefix = `[addMessageToIncident ${message.ts}]`;
  
  try {
    console.log(`${logPrefix} メッセージ追加処理開始 - インシデントID: ${incidentId}`);
    
    // メッセージが既に保存されているか確認
    console.log(`${logPrefix} 既存メッセージの確認中...`);
    const isSaved = await isMessageSaved(message.ts);
    if (isSaved) {
      console.log(`${logPrefix} メッセージは既に保存済みです`);
      return;
    }
    
    // メッセージを保存
    console.log(`${logPrefix} 新規メッセージを保存中...`);
    await saveMessage(incidentId, message.ts, message.user, message.text);
    console.log(`${logPrefix} メッセージの保存が完了しました`);
  } catch (error) {
    console.error(`${logPrefix} エラー発生:`, error);
    console.error(`${logPrefix} スタックトレース:`, error instanceof Error ? error.stack : 'N/A');
  }
}

// 高重要度インシデントの通知
async function notifyHighSeverityIncident(
  incident: any,
  sourceChannel: string
): Promise<void> {
  try {
    const notificationChannel = process.env.NOTIFICATION_CHANNEL_ID || sourceChannel;
    const confidenceDesc = getConfidenceDescription(incident.confidence_score);
    
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🚨 *高重要度インシデントが検出されました*`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*タイトル:*\n${incident.title}`
          },
          {
            type: 'mrkdwn',
            text: `*重要度:*\nレベル ${incident.severity_level}`
          },
          {
            type: 'mrkdwn',
            text: `*説明:*\n${incident.description}`
          },
          {
            type: 'mrkdwn',
            text: `*信頼度:*\n${(incident.confidence_score * 100).toFixed(0)}% - ${confidenceDesc}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<#${sourceChannel}> で検出されました`
        }
      }
    ];
    
    await postMessage(
      notificationChannel,
      `高重要度インシデント: ${incident.title}`,
      blocks
    );
  } catch (error) {
    console.error('Error sending notification:', error);
  }
} 