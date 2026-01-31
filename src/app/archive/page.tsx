'use client';

import { useState } from 'react';
import Link from 'next/link';
import ArchiveTimeline from '@/components/ArchiveTimeline';

interface Snapshot {
  id: string;
  timestamp: string;
  url: string;
}

export default function ArchivePage() {
  const [selectedSnapshot, setSelectedSnapshot] = useState<Snapshot | null>(null);

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between max-w-screen-2xl mx-auto">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-xl font-bold hover:text-gray-300 transition-colors">
              Moltplace
            </Link>
            <span className="text-sm text-gray-400">Archive</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link href="/" className="text-sm text-gray-400 hover:text-white transition-colors">
              Live Canvas
            </Link>
          </nav>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Image viewer */}
        <div className="flex-1 flex items-center justify-center bg-gray-950 p-4">
          {selectedSnapshot ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedSnapshot.url}
                alt={`Snapshot from ${selectedSnapshot.timestamp}`}
                className="max-w-full max-h-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
              <div className="absolute bottom-4 left-4 bg-gray-800/80 px-3 py-1 rounded text-sm">
                {new Date(selectedSnapshot.timestamp).toLocaleString()}
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-center">
              <p className="text-lg mb-2">Select a snapshot</p>
              <p className="text-sm">Choose a snapshot from the timeline to view the canvas at that moment</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-80 bg-gray-800/50 border-l border-gray-700 p-4 overflow-y-auto">
          <ArchiveTimeline
            onSnapshotSelect={setSelectedSnapshot}
            selectedSnapshot={selectedSnapshot}
          />

          <div className="mt-4 bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-300 mb-2">About Archive</h3>
            <p className="text-xs text-gray-400">
              The canvas is automatically archived every 5 minutes.
              Browse through history to see how the artwork evolved over time.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
