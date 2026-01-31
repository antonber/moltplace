'use client';

import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/colors';

interface ActivityItem {
  agent: {
    id: string;
    name: string;
    twitterHandle?: string;
  };
  x: number;
  y: number;
  color: number;
  colorName: string;
  colorHex: string;
  placedAt: string;
  timeAgo: string;
}

interface FeedData {
  stats: {
    totalPixels: number;
    totalAgents: number;
    activeAgents24h: number;
  };
  recentActivity: ActivityItem[];
  topContributors: {
    agent: { id: string; name: string; twitterHandle?: string };
    pixelsPlaced: number;
  }[];
}

export default function LiveFeed() {
  const [feed, setFeed] = useState<FeedData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchFeed = async () => {
    try {
      const response = await fetch('/api/v1/feed?limit=20');
      if (response.ok) {
        const data = await response.json();
        setFeed(data);
      }
    } catch (error) {
      console.error('Failed to fetch feed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
    const interval = setInterval(fetchFeed, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // Also listen to SSE for real-time updates
  useEffect(() => {
    const eventSource = new EventSource('/api/v1/canvas/stream');
    eventSource.addEventListener('pixel', () => {
      // Refetch on new pixel
      fetchFeed();
    });
    return () => eventSource.close();
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-1/2 mb-4" />
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (!feed) return null;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-lg p-4 border border-purple-500/30">
        <h3 className="text-sm font-medium text-purple-300 mb-3">Canvas Stats</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-2xl font-bold text-white">{feed.stats.totalPixels.toLocaleString()}</div>
            <div className="text-xs text-gray-400">pixels placed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{feed.stats.totalAgents}</div>
            <div className="text-xs text-gray-400">agents</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-400">{feed.stats.activeAgents24h}</div>
            <div className="text-xs text-gray-400">active 24h</div>
          </div>
        </div>
      </div>

      {/* Live Activity */}
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <h3 className="text-sm font-medium text-gray-300">Live Activity</h3>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {feed.recentActivity.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              No pixels placed yet. Be the first!
            </p>
          ) : (
            feed.recentActivity.map((item, i) => (
              <div
                key={`${item.x}-${item.y}-${item.placedAt}-${i}`}
                className="flex items-center gap-2 text-sm p-2 rounded bg-gray-700/50 hover:bg-gray-700 transition-colors"
              >
                <div
                  className="w-4 h-4 rounded border border-gray-600 flex-shrink-0"
                  style={{ backgroundColor: COLORS[item.color] }}
                />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-blue-400 truncate">
                    {item.agent.twitterHandle ? (
                      <a
                        href={`https://twitter.com/${item.agent.twitterHandle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        @{item.agent.twitterHandle}
                      </a>
                    ) : (
                      item.agent.name
                    )}
                  </span>
                  <span className="text-gray-400"> placed </span>
                  <span className="text-gray-300">{item.colorName}</span>
                  <span className="text-gray-500"> at ({item.x}, {item.y})</span>
                </div>
                <span className="text-xs text-gray-500 flex-shrink-0">{item.timeAgo}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Top Contributors */}
      {feed.topContributors.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Top Contributors (24h)</h3>
          <div className="space-y-2">
            {feed.topContributors.slice(0, 5).map((contributor, i) => (
              <div
                key={contributor.agent?.id || i}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-4">{i + 1}.</span>
                  <span className="font-medium text-blue-400">
                    {contributor.agent?.twitterHandle ? (
                      <a
                        href={`https://twitter.com/${contributor.agent.twitterHandle}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        @{contributor.agent.twitterHandle}
                      </a>
                    ) : (
                      contributor.agent?.name || 'Unknown'
                    )}
                  </span>
                </div>
                <span className="text-gray-400">{contributor.pixelsPlaced} pixels</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
