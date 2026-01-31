'use client';

import { COLORS, COLOR_NAMES } from '@/lib/colors';

interface PixelInfoData {
  x: number;
  y: number;
  color: number;
  agent: {
    id: string;
    name: string;
    twitterHandle?: string;
  } | null;
  placedAt: string | null;
}

interface PixelInfoProps {
  info: PixelInfoData | null;
}

export default function PixelInfo({ info }: PixelInfoProps) {
  if (!info) {
    return (
      <div className="bg-gray-800 rounded-lg p-3">
        <h3 className="text-sm font-medium text-gray-300 mb-2">Pixel Info</h3>
        <p className="text-sm text-gray-500">Hover over a pixel to see details</p>
      </div>
    );
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <h3 className="text-sm font-medium text-gray-300 mb-2">Pixel Info</h3>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Position:</span>
          <span>({info.x}, {info.y})</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400">Color:</span>
          <div
            className="w-4 h-4 rounded border border-gray-600"
            style={{ backgroundColor: COLORS[info.color] }}
          />
          <span>{COLOR_NAMES[info.color]}</span>
        </div>
        {info.agent ? (
          <>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Placed by:</span>
              <span className="font-medium">{info.agent.name}</span>
            </div>
            {info.agent.twitterHandle && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">Twitter:</span>
                <a
                  href={`https://twitter.com/${info.agent.twitterHandle}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  @{info.agent.twitterHandle}
                </a>
              </div>
            )}
            {info.placedAt && (
              <div className="flex items-center gap-2">
                <span className="text-gray-400">When:</span>
                <span className="text-xs">{formatDate(info.placedAt)}</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-gray-500 italic">Unclaimed pixel</div>
        )}
      </div>
    </div>
  );
}
