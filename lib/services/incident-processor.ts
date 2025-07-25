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
  try {
    // 監視対象チャンネルの確認
    if (MONITOR_CHANNELS.length > 0 && !MONITOR_CHANNELS.includes(message.channel)) {
      console.log(`Channel ${message.channel} is not in monitor list, skipping`);
      return;
    }
    
    // スレッドのルートメッセージのタイムスタンプを取得
    const threadTs = message.thread_ts || message.ts;
    
    // 既存のインシデントを確認
    const existingIncident = await findIncidentByThreadTs(threadTs);
    
    if (existingIncident) {
      // 既存インシデントがある場合、メッセージを追加
      await addMessageToIncident(existingIncident.id, message);
      console.log(`Added message to existing incident: ${existingIncident.id}`);
      return;
    }
    
    // 新規スレッドまたは既存インシデントがない場合
    if (!message.thread_ts || message.thread_ts === message.ts) {
      // スレッドの最初のメッセージの場合、少し待ってから処理
      // （後続のメッセージを含めて分析するため）
      setTimeout(() => analyzeThread(message.channel, threadTs), 5000);
    }
  } catch (error) {
    console.error('Error processing message event:', error);
  }
}

// スレッドを分析してインシデントを検出
async function analyzeThread(channel: string, threadTs: string): Promise<void> {
  try {
    console.log(`Analyzing thread: ${channel} - ${threadTs}`);
    
    // スレッドの全メッセージを取得
    const messages = await getThreadMessages(channel, threadTs);
    
    if (messages.length === 0) {
      console.log('No messages found in thread');
      return;
    }
    
    // ユーザー名を取得して置換
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
    
    // LLMで障害判定
    const detectionResult = await detectIncident(messagesWithUserNames);
    
    console.log('Detection result:', detectionResult);
    
    // 信頼度が閾値以上の場合、インシデントを作成
    if (detectionResult.is_incident && detectionResult.confidence >= MIN_CONFIDENCE_FOR_AUTO_CREATE) {
      await createIncidentFromDetection(
        channel,
        threadTs,
        messages,
        detectionResult
      );
    } else {
      console.log(
        `Not creating incident. Confidence: ${detectionResult.confidence} (threshold: ${MIN_CONFIDENCE_FOR_AUTO_CREATE})`
      );
    }
  } catch (error) {
    console.error('Error analyzing thread:', error);
  }
}

// 検出結果からインシデントを作成
async function createIncidentFromDetection(
  channel: string,
  threadTs: string,
  messages: SlackMessage[],
  detectionResult: any
): Promise<void> {
  try {
    // インシデントデータを準備
    const incidentData: CreateIncidentData = {
      slack_thread_ts: threadTs,
      channel_id: channel,
      title: detectionResult.title,
      description: detectionResult.description,
      severity_level: detectionResult.severity_level,
      confidence_score: detectionResult.confidence,
      detected_at: new Date(),
      llm_analysis: detectionResult
    };
    
    // メッセージデータを準備
    const messageData = messages.map(msg => ({
      slack_ts: msg.ts,
      user_id: msg.user,
      message: msg.text
    }));
    
    // インシデントとメッセージを作成
    const { incident } = await createIncidentWithMessages(incidentData, messageData);
    
    console.log(`Created incident: ${incident.id}`);
    
    // 通知設定の確認と高重要度の場合は通知
    const notificationEnabled = process.env.NOTIFICATION_ENABLED !== 'false';
    const severityThreshold = parseInt(process.env.HIGH_SEVERITY_THRESHOLD || '3');
    
    if (notificationEnabled && incident.severity_level >= severityThreshold) {
      await notifyHighSeverityIncident(incident, channel);
    }
  } catch (error) {
    console.error('Error creating incident:', error);
  }
}

// 既存インシデントにメッセージを追加
async function addMessageToIncident(
  incidentId: string,
  message: SlackMessage
): Promise<void> {
  try {
    // メッセージが既に保存されているか確認
    const isSaved = await isMessageSaved(message.ts);
    if (isSaved) {
      console.log(`Message already saved: ${message.ts}`);
      return;
    }
    
    // メッセージを保存
    await saveMessage(incidentId, message.ts, message.user, message.text);
  } catch (error) {
    console.error('Error adding message to incident:', error);
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