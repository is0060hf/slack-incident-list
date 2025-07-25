import { WebClient } from '@slack/web-api';
import { SlackMessage } from './models/incident';

// Slack Web APIクライアントの初期化
let slackClient: WebClient | null = null;

function getSlackClient(): WebClient {
  if (!slackClient) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (!token) {
      throw new Error('SLACK_BOT_TOKEN is not set in environment variables');
    }
    slackClient = new WebClient(token);
  }
  return slackClient;
}

// スレッドの全メッセージを取得
export async function getThreadMessages(
  channel: string,
  threadTs: string
): Promise<SlackMessage[]> {
  const client = getSlackClient();
  const messages: SlackMessage[] = [];
  
  try {
    // スレッドの返信を取得
    const result = await client.conversations.replies({
      channel,
      ts: threadTs,
      inclusive: true, // 親メッセージも含む
      limit: 100 // 最大100件まで取得
    });
    
    if (result.messages) {
      for (const msg of result.messages) {
        if (msg.type === 'message' && msg.text && msg.ts && msg.user) {
          messages.push({
            channel,
            user: msg.user,
            text: msg.text,
            ts: msg.ts,
            thread_ts: msg.thread_ts,
            type: msg.type,
            subtype: (msg as any).subtype
          });
        }
      }
    }
    
    return messages;
  } catch (error) {
    console.error('Error fetching thread messages:', error);
    throw error;
  }
}

// ユーザー情報を取得
export async function getUserInfo(userId: string): Promise<{ name: string; real_name: string } | null> {
  const client = getSlackClient();
  
  try {
    const result = await client.users.info({ user: userId });
    
    if (result.user) {
      return {
        name: result.user.name || userId,
        real_name: result.user.real_name || result.user.name || userId
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching user info:', error);
    return null;
  }
}

// チャンネル情報を取得
export async function getChannelInfo(channelId: string): Promise<{ name: string } | null> {
  const client = getSlackClient();
  
  try {
    const result = await client.conversations.info({ channel: channelId });
    
    if (result.channel && 'name' in result.channel) {
      return {
        name: result.channel.name || channelId
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching channel info:', error);
    return null;
  }
}

// メッセージを投稿（通知用）
export async function postMessage(
  channel: string,
  text: string,
  blocks?: any[]
): Promise<boolean> {
  const client = getSlackClient();
  
  try {
    await client.chat.postMessage({
      channel,
      text,
      blocks
    });
    
    return true;
  } catch (error) {
    console.error('Error posting message:', error);
    return false;
  }
} 