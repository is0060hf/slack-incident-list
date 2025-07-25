'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';

interface Incident {
  id: string;
  slack_thread_ts: string;
  channel_id: string;
  title: string;
  description: string | null;
  severity_level: number;
  status: 'open' | 'resolved' | 'under_review';
  confidence_score: number;
  detected_at: string;
  resolved_at: string | null;
}

interface Stats {
  total: number;
  open: number;
  resolved: number;
  highSeverity: number;
}

export default function Home() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [severityFilter, setSeverityFilter] = useState<string>('');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('0.7');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

  useEffect(() => {
    fetchIncidents();
  }, [statusFilter, severityFilter, confidenceFilter, dateFrom, dateTo]);

  const fetchIncidents = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (severityFilter) params.append('severity_level', severityFilter);
      if (confidenceFilter) params.append('confidence_min', confidenceFilter);
      if (dateFrom) params.append('from', dateFrom);
      if (dateTo) params.append('to', dateTo);

      const response = await fetch(`/api/incidents?${params}`);
      const data = await response.json();
      
      setIncidents(data.incidents);
      setStats(data.stats);
    } catch (error) {
      console.error('Failed to fetch incidents:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityBadge = (level: number) => {
    const badges = {
      1: { color: 'bg-gray-100 text-gray-800', label: '低' },
      2: { color: 'bg-yellow-100 text-yellow-800', label: '中' },
      3: { color: 'bg-orange-100 text-orange-800', label: '高' },
      4: { color: 'bg-red-100 text-red-800', label: '緊急' }
    };
    return badges[level as keyof typeof badges] || badges[1];
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      open: { color: 'bg-green-100 text-green-800', label: 'Open' },
      resolved: { color: 'bg-gray-100 text-gray-800', label: 'Resolved' },
      under_review: { color: 'bg-blue-100 text-blue-800', label: 'Under Review' }
    };
    return badges[status as keyof typeof badges] || badges.open;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-500">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* 統計カード */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">総インシデント</div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{stats.total}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">未解決</div>
            <div className="mt-2 text-3xl font-bold text-green-600">{stats.open}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">解決済み</div>
            <div className="mt-2 text-3xl font-bold text-gray-600">{stats.resolved}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm font-medium text-gray-500">高重要度</div>
            <div className="mt-2 text-3xl font-bold text-red-600">{stats.highSeverity}</div>
          </div>
        </div>
      )}

      {/* フィルター */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ステータス
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">すべて</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
              <option value="under_review">Under Review</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              重要度
            </label>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">すべて</option>
              <option value="1">低</option>
              <option value="2">中</option>
              <option value="3">高</option>
              <option value="4">緊急</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              最小信頼度
            </label>
            <select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            >
              <option value="">すべて</option>
              <option value="0.5">50%以上</option>
              <option value="0.7">70%以上（要レビュー）</option>
              <option value="0.9">90%以上</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              開始日
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              終了日
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2"
            />
          </div>
        </div>
        {(dateFrom || dateTo) && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                setDateFrom('');
                setDateTo('');
              }}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              期間指定をクリア
            </button>
          </div>
        )}
      </div>

      {/* インシデント一覧 */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                タイトル
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ステータス
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                重要度
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                信頼度
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                検出日時
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                アクション
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {incidents.map((incident) => {
              const severityBadge = getSeverityBadge(incident.severity_level);
              const statusBadge = getStatusBadge(incident.status);
              const needsReview = incident.confidence_score < 0.7;
              
              return (
                <tr key={incident.id} className={needsReview ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {incident.title}
                      </div>
                      {incident.description && (
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {incident.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge.color}`}>
                      {statusBadge.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${severityBadge.color}`}>
                      {severityBadge.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {(incident.confidence_score * 100).toFixed(0)}%
                      {needsReview && (
                        <span className="ml-1 text-xs text-yellow-600">要レビュー</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(incident.detected_at), 'yyyy/MM/dd HH:mm', { locale: ja })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <a
                      href={`/incidents/${incident.id}`}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      詳細
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {incidents.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            インシデントが見つかりません
          </div>
        )}
      </div>
    </div>
  );
}
