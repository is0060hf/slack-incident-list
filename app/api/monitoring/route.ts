import { NextResponse } from 'next/server';
import { getChannelInfo } from '@/lib/slack';

export async function GET() {
  try {
    // 環境変数から監視対象チャンネルを取得
    const monitorChannelsEnv = process.env.MONITOR_CHANNELS || '';
    const channelIds = monitorChannelsEnv
      ? monitorChannelsEnv.split(',').map(ch => ch.trim()).filter(ch => ch)
      : [];
    
    // 各チャンネルの情報を取得
    const channelsWithInfo = await Promise.all(
      channelIds.map(async (channelId) => {
        const info = await getChannelInfo(channelId);
        return {
          id: channelId,
          name: info?.name || 'Unknown Channel',
          isActive: !!info
        };
      })
    );
    
    // 監視設定の情報を返す
    const monitoringConfig = {
      isLimited: channelIds.length > 0,
      channelCount: channelIds.length,
      channels: channelsWithInfo,
      notificationChannel: process.env.NOTIFICATION_CHANNEL_ID || null,
      notificationEnabled: process.env.NOTIFICATION_ENABLED !== 'false',
      severityThreshold: parseInt(process.env.HIGH_SEVERITY_THRESHOLD || '3'),
      confidenceThreshold: parseFloat(process.env.MIN_CONFIDENCE_FOR_AUTO_CREATE || '0.5')
    };
    
    return NextResponse.json(monitoringConfig);
    
  } catch (error) {
    console.error('Error fetching monitoring config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch monitoring configuration' },
      { status: 500 }
    );
  }
} 