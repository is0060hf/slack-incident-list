import { NextRequest, NextResponse } from 'next/server';

// Slack Event Subscriptionsのチャレンジ検証用エンドポイント
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // URL verification challenge
    if (body.type === 'url_verification') {
      console.log('Received URL verification challenge');
      return NextResponse.json({ challenge: body.challenge });
    }
    
    // Event callback (実際のイベント処理)
    if (body.type === 'event_callback') {
      console.log('Received event:', body.event);
      
      // 今はログ出力のみ
      // TODO: ここでインシデント検出ロジックを実装
      
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