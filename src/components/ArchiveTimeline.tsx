'use client';

import { useEffect, useState } from 'react';

interface Snapshot {
  id: string;
  timestamp: string;
  url: string;
}

interface ArchiveTimelineProps {
  onSnapshotSelect: (snapshot: Snapshot) => void;
  selectedSnapshot: Snapshot | null;
}

export default function ArchiveTimeline({ onSnapshotSelect, selectedSnapshot }: ArchiveTimelineProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSnapshots = async () => {
      try {
        const response = await fetch('/api/v1/snapshots');
        if (response.ok) {
          const data = await response.json();
          setSnapshots(data.snapshots);
        }
      } catch (error) {
        console.error('Failed to fetch snapshots:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSnapshots();
  }, []);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Archive Timeline</h3>
        <div className="animate-pulse space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-8 bg-gray-700 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-300 mb-3">Archive Timeline</h3>
        <p className="text-sm text-gray-500">No snapshots available yet</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-300 mb-3">Archive Timeline</h3>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {snapshots.map((snapshot) => (
          <button
            key={snapshot.id}
            onClick={() => onSnapshotSelect(snapshot)}
            className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${
              selectedSnapshot?.id === snapshot.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
            }`}
          >
            {formatDate(snapshot.timestamp)}
          </button>
        ))}
      </div>
    </div>
  );
}
