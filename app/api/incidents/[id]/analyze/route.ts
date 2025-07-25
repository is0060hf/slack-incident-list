import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findIncidentById, saveReport, getIncidentMessages } from '@/lib/repositories/incident';
import { getThreadMessages, getUserInfo } from '@/lib/slack';
import { generateIncidentReport } from '@/lib/llm';

// リクエストボディのスキーマ
const AnalyzeRequestSchema = z.object({
  regenerate: z.boolean().optional()
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    
    // バリデーション
    const { regenerate } = AnalyzeRequestSchema.parse(body);
    
    // インシデントを取得
    const incident = await findIncidentById(id);
    if (!incident) {
      return NextResponse.json(
        { error: 'Incident not found' },
        { status: 404 }
      );
    }
    
    console.log(`Analyzing incident ${id} for channel ${incident.channel_id}, thread ${incident.slack_thread_ts}`);
    
    // Slackからスレッドの全メッセージを取得
    const slackMessages = await getThreadMessages(incident.channel_id, incident.slack_thread_ts);
    
    if (slackMessages.length === 0) {
      return NextResponse.json(
        { error: 'No messages found in thread' },
        { status: 404 }
      );
    }
    
    // ユーザー名を取得して置換
    const messagesWithUserNames = await Promise.all(
      slackMessages.map(async (msg) => {
        const userInfo = await getUserInfo(msg.user);
        return {
          user: userInfo?.real_name || msg.user,
          text: msg.text,
          ts: msg.ts
        };
      })
    );
    
    // LLMで分析レポートを生成
    const analysisReport = await generateIncidentReport(messagesWithUserNames);
    
    // レポートを保存
    const savedReport = await saveReport({
      incident_id: id,
      ...analysisReport,
      generated_by: 'system'
    });
    
    // DBに保存されているメッセージも更新（まだ保存されていないメッセージがある場合）
    const dbMessages = await getIncidentMessages(id);
    const dbMessageTs = new Set(dbMessages.map(m => m.slack_ts));
    
    for (const msg of slackMessages) {
      if (!dbMessageTs.has(msg.ts)) {
        // 新しいメッセージを保存する処理をここに追加できます
        console.log(`New message found: ${msg.ts}`);
      }
    }
    
    return NextResponse.json({
      report: savedReport,
      messageCount: slackMessages.length
    });
    
  } catch (error) {
    console.error('Error analyzing incident:', error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to analyze incident' },
      { status: 500 }
    );
  }
} 