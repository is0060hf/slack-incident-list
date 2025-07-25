import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Slack署名を検証する関数
async function verifySlackSignature(
  request: NextRequest,
  body: string
): Promise<boolean> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error('SLACK_SIGNING_SECRET is not set');
    return false;
  }

  const signature = request.headers.get('x-slack-signature');
  const timestamp = request.headers.get('x-slack-request-timestamp');
  
  if (!signature || !timestamp) {
    return false;
  }

  // タイムスタンプが5分以内であることを確認
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 60 * 5) {
    return false;
  }

  // 署名を計算
  const sigBasestring = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring)
    .digest('hex');

  // 署名を比較（タイミング攻撃を防ぐため、crypto.timingSafeEqualを使用）
  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}

// Slack Event Subscriptionsのエンドポイント
export async function POST(request: NextRequest) {
  try {
    // リクエストボディを文字列として取得
    const bodyText = await request.text();
    
    // Slack署名を検証（URL verification時はスキップ）
    const body = JSON.parse(bodyText);
    
    // URL verification challengeの場合は署名検証をスキップ
    if (body.type !== 'url_verification') {
      const isValid = await verifySlackSignature(request, bodyText);
      if (!isValid) {
        console.error('Invalid Slack signature');
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }
    
    // URL verification challenge
    if (body.type === 'url_verification') {
      console.log('Received URL verification challenge');
      return NextResponse.json({ challenge: body.challenge });
    }
    
    // Event callback (実際のイベント処理)
    if (body.type === 'event_callback') {
      const event = body.event;
      const logPrefix = `[SlackEvent ${event?.ts || 'unknown'}]`;
      
      console.log(`${logPrefix} Slackイベント受信:`, {
        type: event?.type,
        channel: event?.channel,
        user: event?.user,
        ts: event?.ts,
        thread_ts: event?.thread_ts,
        subtype: event?.subtype,
        text_preview: event?.text?.substring(0, 50) + '...'
      });
      
      // メッセージイベントの処理
      if (event.type === 'message' && !event.subtype) {
        console.log(`${logPrefix} メッセージイベントを処理対象として受理`);
        
        // ボットのメッセージや編集・削除などのsubtypeがあるメッセージは除外
        const { processMessageEvent } = await import('@/lib/services/incident-processor');
        
        // 非同期で処理（レスポンスを早く返すため）
        processMessageEvent({
          channel: event.channel,
          user: event.user,
          text: event.text,
          ts: event.ts,
          thread_ts: event.thread_ts,
          type: event.type,
          subtype: event.subtype
        }).catch(error => {
          console.error(`${logPrefix} バックグラウンド処理でエラー:`, error);
        });
      } else {
        console.log(`${logPrefix} メッセージイベントをスキップ - type: ${event?.type}, subtype: ${event?.subtype}`);
      }
      
      return NextResponse.json({ ok: true });
    }
    
    // その他のリクエストタイプ
    return NextResponse.json({ ok: true });
    
  } catch (error) {
    console.error('Error processing Slack event:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 