'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface Statistics {
  monthlyIncidents: Array<{ month: string; count: number }>;
  severityDistribution: Array<{ severity_level: number; count: number }>;
  avgResolutionTime: number | null;
  topKeywords: Array<{ keyword: string; count: number }>;
  statusCounts: Array<{ status: string; count: number }>;
}

export default function Statistics() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      const response = await fetch('/api/statistics');
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">データの取得に失敗しました</div>
      </div>
    );
  }

  const getSeverityLabel = (level: number) => {
    const labels = { 1: '低', 2: '中', 3: '高', 4: '緊急' };
    return labels[level as keyof typeof labels] || '不明';
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      open: 'Open',
      resolved: 'Resolved',
      under_review: 'Under Review'
    };
    return labels[status as keyof typeof labels] || status;
  };

  // グラフ用のデータ準備
  const monthlyData = stats.monthlyIncidents.map(item => ({
    month: format(new Date(item.month + '-01'), 'yyyy年MM月', { locale: ja }),
    count: item.count
  })).reverse();

  const severityData = stats.severityDistribution.map(item => ({
    label: getSeverityLabel(item.severity_level),
    count: item.count
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">統計ダッシュボード</h1>

      {/* 概要カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">平均解決時間</h3>
          <p className="text-3xl font-bold text-indigo-600">
            {stats.avgResolutionTime ? `${stats.avgResolutionTime}分` : 'N/A'}
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">総インシデント数</h3>
          <p className="text-3xl font-bold text-gray-900">
            {stats.statusCounts.reduce((sum, item) => sum + item.count, 0)}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">解決率</h3>
          <p className="text-3xl font-bold text-green-600">
            {(() => {
              const total = stats.statusCounts.reduce((sum, item) => sum + item.count, 0);
              const resolved = stats.statusCounts.find(item => item.status === 'resolved')?.count || 0;
              return total > 0 ? `${Math.round((resolved / total) * 100)}%` : 'N/A';
            })()}
          </p>
        </div>
      </div>

      {/* 月別インシデント数 */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">月別インシデント発生数</h2>
        <div className="overflow-x-auto">
          <div className="flex items-end space-x-2" style={{ minWidth: '600px' }}>
            {monthlyData.map((item, index) => {
              const maxCount = Math.max(...monthlyData.map(d => d.count), 1);
              const height = (item.count / maxCount) * 200;
              
              return (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div className="text-sm font-medium text-gray-900 mb-1">{item.count}</div>
                  <div 
                    className="w-full bg-indigo-500 rounded-t"
                    style={{ height: `${height}px`, minHeight: '4px' }}
                  />
                  <div className="text-xs text-gray-600 mt-2 -rotate-45 origin-top-left whitespace-nowrap">
                    {item.month}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 重要度別分布とステータス別分布 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">重要度別分布</h2>
          <div className="space-y-3">
            {severityData.map((item, index) => (
              <div key={index}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{item.label}</span>
                  <span className="font-medium">{item.count}件</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      index === 0 ? 'bg-gray-500' :
                      index === 1 ? 'bg-yellow-500' :
                      index === 2 ? 'bg-orange-500' :
                      'bg-red-500'
                    }`}
                    style={{ 
                      width: `${severityData.length > 0 ? (item.count / Math.max(...severityData.map(d => d.count))) * 100 : 0}%` 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">ステータス別分布</h2>
          <div className="space-y-3">
            {stats.statusCounts.map((item, index) => (
              <div key={index}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">{getStatusLabel(item.status)}</span>
                  <span className="font-medium">{item.count}件</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${
                      item.status === 'open' ? 'bg-green-500' :
                      item.status === 'resolved' ? 'bg-gray-500' :
                      'bg-blue-500'
                    }`}
                    style={{ 
                      width: `${stats.statusCounts.length > 0 ? (item.count / Math.max(...stats.statusCounts.map(d => d.count))) * 100 : 0}%` 
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 頻出キーワード */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">頻出キーワードTop20</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {stats.topKeywords.slice(0, 20).map((keyword, index) => (
            <div 
              key={index}
              className="bg-gray-100 rounded px-3 py-2 text-sm"
            >
              <span className="font-medium text-gray-900">{keyword.keyword}</span>
              <span className="text-gray-500 ml-2">({keyword.count})</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
} 