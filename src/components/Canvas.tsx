'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { COLORS, CANVAS_WIDTH, CANVAS_HEIGHT } from '@/lib/colors';
import { supabase, PIXEL_CHANNEL } from '@/lib/supabase';

interface PixelInfo {
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

interface CanvasProps {
  selectedColor: number;
  onPixelClick: (x: number, y: number) => void;
  onPixelHover: (info: PixelInfo | null) => void;
}

export default function Canvas({ selectedColor: _selectedColor, onPixelClick, onPixelHover }: CanvasProps) {
  // selectedColor is available for future use (e.g., cursor preview)
  void _selectedColor;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasData, setCanvasData] = useState<Uint8Array | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredPixel, setHoveredPixel] = useState<{ x: number; y: number } | null>(null);

  // Fetch canvas data
  const fetchCanvas = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/canvas');
      if (response.ok) {
        const buffer = await response.arrayBuffer();
        setCanvasData(new Uint8Array(buffer));
      }
    } catch (error) {
      console.error('Failed to fetch canvas:', error);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchCanvas();
  }, [fetchCanvas]);

  // Supabase Realtime for pixel updates
  useEffect(() => {
    const channel = supabase.channel(PIXEL_CHANNEL)
      .on('broadcast', { event: 'pixel' }, ({ payload }) => {
        if (payload) {
          setCanvasData(prev => {
            if (!prev) return prev;
            const newData = new Uint8Array(prev);
            const index = payload.y * CANVAS_WIDTH + payload.x;
            newData[index] = payload.color;
            return newData;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Draw canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create image data
    const imageData = ctx.createImageData(CANVAS_WIDTH, CANVAS_HEIGHT);

    for (let i = 0; i < canvasData.length; i++) {
      const colorIndex = canvasData[i];
      const hex = COLORS[colorIndex] || COLORS[31];
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);

      imageData.data[i * 4] = r;
      imageData.data[i * 4 + 1] = g;
      imageData.data[i * 4 + 2] = b;
      imageData.data[i * 4 + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }, [canvasData]);

  // Handle mouse wheel zoom
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newScale = Math.max(0.5, Math.min(20, scale * (1 + delta)));

    // Zoom towards mouse position
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const scaleChange = newScale / scale;
      setOffset({
        x: mouseX - (mouseX - offset.x) * scaleChange,
        y: mouseY - (mouseY - offset.y) * scaleChange,
      });
    }

    setScale(newScale);
  }, [scale, offset]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // Get pixel coordinates from mouse position
  const getPixelCoords = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const x = Math.floor((mouseX - offset.x) / scale);
    const y = Math.floor((mouseY - offset.y) / scale);

    if (x < 0 || x >= CANVAS_WIDTH || y < 0 || y >= CANVAS_HEIGHT) {
      return null;
    }

    return { x, y };
  }, [offset, scale]);

  // Handle mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  }, [offset]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    } else {
      const coords = getPixelCoords(e);
      if (coords) {
        setHoveredPixel(coords);
      } else {
        setHoveredPixel(null);
        onPixelHover(null);
      }
    }
  }, [isDragging, dragStart, getPixelCoords, onPixelHover]);

  // Handle mouse up
  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setIsDragging(false);
      // Check if it was a click (minimal movement)
      const dx = Math.abs(e.clientX - dragStart.x - offset.x);
      const dy = Math.abs(e.clientY - dragStart.y - offset.y);
      if (dx < 5 && dy < 5) {
        const coords = getPixelCoords(e);
        if (coords) {
          onPixelClick(coords.x, coords.y);
        }
      }
    }
  }, [isDragging, dragStart, offset, getPixelCoords, onPixelClick]);

  // Fetch pixel info on hover
  useEffect(() => {
    if (!hoveredPixel) return;

    const fetchPixelInfo = async () => {
      try {
        const response = await fetch(`/api/v1/canvas/pixel?x=${hoveredPixel.x}&y=${hoveredPixel.y}`);
        if (response.ok) {
          const info = await response.json();
          onPixelHover(info);
        }
      } catch {
        // Ignore errors
      }
    };

    const debounce = setTimeout(fetchPixelInfo, 100);
    return () => clearTimeout(debounce);
  }, [hoveredPixel, onPixelHover]);

  return (
    <div
      ref={containerRef}
      className="canvas-container relative w-full h-full overflow-hidden bg-gray-950 cursor-crosshair"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setIsDragging(false);
        setHoveredPixel(null);
        onPixelHover(null);
      }}
    >
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="image-rendering-pixelated"
          style={{ imageRendering: 'pixelated' }}
        />
      </div>
      {/* Hover highlight - positioned outside scaled container */}
      {hoveredPixel && scale >= 2 && (
        <div
          className="absolute border-2 border-white pointer-events-none"
          style={{
            left: offset.x + hoveredPixel.x * scale,
            top: offset.y + hoveredPixel.y * scale,
            width: scale,
            height: scale,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
          }}
        />
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-4 bg-gray-800/80 px-3 py-1 rounded text-sm">
        {Math.round(scale * 100)}%
      </div>

      {/* Coordinates */}
      {hoveredPixel && (
        <div className="absolute bottom-4 right-4 bg-gray-800/80 px-3 py-1 rounded text-sm">
          ({hoveredPixel.x}, {hoveredPixel.y})
        </div>
      )}
    </div>
  );
}
