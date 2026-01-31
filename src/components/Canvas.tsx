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
  navigateTarget?: { x: number; y: number; zoom: number } | null;
  onNavigateComplete?: () => void;
}

export default function Canvas({ selectedColor: _selectedColor, onPixelClick, onPixelHover, navigateTarget, onNavigateComplete }: CanvasProps) {
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

  // Touch state for pinch zoom
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Ruler sizes
  const RULER_TOP = 24; // h-6 = 24px
  const RULER_LEFT = 32; // w-8 = 32px

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

    // Zoom towards mouse position (adjusted for ruler)
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left - RULER_LEFT;
      const mouseY = e.clientY - rect.top - RULER_TOP;

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

    // Adjust for ruler offset
    const mouseX = e.clientX - rect.left - RULER_LEFT;
    const mouseY = e.clientY - rect.top - RULER_TOP;

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
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left - RULER_LEFT;
      const mouseY = e.clientY - rect.top - RULER_TOP;
      setIsDragging(true);
      setDragStart({ x: mouseX - offset.x, y: mouseY - offset.y });
    }
  }, [offset]);

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left - RULER_LEFT;
    const mouseY = e.clientY - rect.top - RULER_TOP;

    if (isDragging) {
      setOffset({
        x: mouseX - dragStart.x,
        y: mouseY - dragStart.y,
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
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mouseX = e.clientX - rect.left - RULER_LEFT;
      const mouseY = e.clientY - rect.top - RULER_TOP;
      // Check if it was a click (minimal movement)
      const dx = Math.abs(mouseX - dragStart.x - offset.x);
      const dy = Math.abs(mouseY - dragStart.y - offset.y);
      if (dx < 5 && dy < 5) {
        const coords = getPixelCoords(e);
        if (coords) {
          onPixelClick(coords.x, coords.y);
        }
      }
    }
  }, [isDragging, dragStart, offset, getPixelCoords, onPixelClick]);

  // Touch event handlers for mobile
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (e.touches.length === 1) {
      // Single touch - prepare for pan or tap
      const touch = e.touches[0];
      const touchX = touch.clientX - rect.left - RULER_LEFT;
      const touchY = touch.clientY - rect.top - RULER_TOP;
      lastTouchRef.current = { x: touchX, y: touchY };
      touchStartPosRef.current = { x: touchX, y: touchY };
      setDragStart({ x: touchX - offset.x, y: touchY - offset.y });
    } else if (e.touches.length === 2) {
      // Two fingers - prepare for pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, [offset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (e.touches.length === 1 && lastTouchRef.current) {
      // Single finger pan
      const touch = e.touches[0];
      const touchX = touch.clientX - rect.left - RULER_LEFT;
      const touchY = touch.clientY - rect.top - RULER_TOP;
      setOffset({
        x: touchX - dragStart.x,
        y: touchY - dragStart.y,
      });
      lastTouchRef.current = { x: touchX, y: touchY };
    } else if (e.touches.length === 2 && lastPinchDistRef.current !== null) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const scaleFactor = dist / lastPinchDistRef.current;
      const newScale = Math.max(0.5, Math.min(20, scale * scaleFactor));

      // Zoom towards center of pinch
      const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const pinchX = centerX - rect.left - RULER_LEFT;
      const pinchY = centerY - rect.top - RULER_TOP;
      const scaleChange = newScale / scale;

      setOffset({
        x: pinchX - (pinchX - offset.x) * scaleChange,
        y: pinchY - (pinchY - offset.y) * scaleChange,
      });

      setScale(newScale);
      lastPinchDistRef.current = dist;
    }
  }, [dragStart, scale, offset]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();

    // Check if it was a tap (minimal movement)
    if (touchStartPosRef.current && lastTouchRef.current && e.changedTouches.length === 1 && rect) {
      const touch = e.changedTouches[0];
      const touchX = touch.clientX - rect.left - RULER_LEFT;
      const touchY = touch.clientY - rect.top - RULER_TOP;
      const dx = Math.abs(touchX - touchStartPosRef.current.x);
      const dy = Math.abs(touchY - touchStartPosRef.current.y);

      if (dx < 10 && dy < 10) {
        // It was a tap - get pixel coords and trigger click
        const x = Math.floor((touchX - offset.x) / scale);
        const y = Math.floor((touchY - offset.y) / scale);

        if (x >= 0 && x < CANVAS_WIDTH && y >= 0 && y < CANVAS_HEIGHT) {
          onPixelClick(x, y);
        }
      }
    }

    lastTouchRef.current = null;
    lastPinchDistRef.current = null;
    touchStartPosRef.current = null;
  }, [offset, scale, onPixelClick]);

  // Handle navigation to target pixel
  useEffect(() => {
    if (!navigateTarget || !containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();

    // Set the new scale
    const newScale = navigateTarget.zoom;
    setScale(newScale);

    // Center the target pixel in the viewport
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Calculate offset to center the pixel
    const newOffsetX = centerX - (navigateTarget.x + 0.5) * newScale;
    const newOffsetY = centerY - (navigateTarget.y + 0.5) * newScale;

    setOffset({ x: newOffsetX, y: newOffsetY });

    // Notify that navigation is complete
    onNavigateComplete?.();
  }, [navigateTarget, onNavigateComplete]);

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

  // Calculate visible range for rulers
  const getVisibleRange = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { startX: 0, endX: CANVAS_WIDTH, startY: 0, endY: CANVAS_HEIGHT };

    const startX = Math.max(0, Math.floor(-offset.x / scale));
    const endX = Math.min(CANVAS_WIDTH, Math.ceil((rect.width - offset.x) / scale));
    const startY = Math.max(0, Math.floor(-offset.y / scale));
    const endY = Math.min(CANVAS_HEIGHT, Math.ceil((rect.height - offset.y) / scale));

    return { startX, endX, startY, endY };
  }, [offset, scale]);

  const visibleRange = getVisibleRange();

  // Generate ruler ticks
  const getRulerTicks = (start: number, end: number) => {
    const ticks: number[] = [];
    // Adjust tick interval based on zoom
    let interval = 100;
    if (scale >= 4) interval = 50;
    if (scale >= 8) interval = 10;
    if (scale < 1) interval = 200;

    const firstTick = Math.ceil(start / interval) * interval;
    for (let i = firstTick; i <= end; i += interval) {
      ticks.push(i);
    }
    return ticks;
  };

  const xTicks = getRulerTicks(visibleRange.startX, visibleRange.endX);
  const yTicks = getRulerTicks(visibleRange.startY, visibleRange.endY);

  return (
    <div
      ref={containerRef}
      className="canvas-container relative w-full h-full overflow-hidden bg-gray-950 cursor-crosshair touch-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setIsDragging(false);
        setHoveredPixel(null);
        onPixelHover(null);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Horizontal ruler (top) */}
      <div className="absolute top-0 left-0 right-0 h-6 bg-gray-900/90 border-b border-gray-700 z-10 overflow-hidden pointer-events-none">
        {xTicks.map(tick => (
          <div
            key={`x-${tick}`}
            className="absolute top-0 h-full flex flex-col items-center justify-end"
            style={{ left: offset.x + tick * scale }}
          >
            <span className="text-[10px] text-gray-400 mb-0.5">{tick}</span>
            <div className="w-px h-2 bg-gray-500" />
          </div>
        ))}
      </div>

      {/* Vertical ruler (left) */}
      <div className="absolute top-6 left-0 bottom-0 w-8 bg-gray-900/90 border-r border-gray-700 z-10 overflow-hidden pointer-events-none">
        {yTicks.map(tick => (
          <div
            key={`y-${tick}`}
            className="absolute left-0 w-full flex items-center justify-end pr-1"
            style={{ top: offset.y + tick * scale - 6 }}
          >
            <span className="text-[10px] text-gray-400">{tick}</span>
          </div>
        ))}
      </div>

      {/* Corner block */}
      <div className="absolute top-0 left-0 w-8 h-6 bg-gray-900 border-b border-r border-gray-700 z-20" />

      {/* Canvas container - offset by ruler size */}
      <div className="absolute top-6 left-8 right-0 bottom-0 overflow-hidden">
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
      </div>

      {/* Zoom indicator */}
      <div className="absolute bottom-4 left-12 bg-gray-800/80 px-3 py-1 rounded text-sm z-20">
        {Math.round(scale * 100)}%
      </div>

      {/* Coordinates */}
      {hoveredPixel && (
        <div className="absolute bottom-4 right-4 bg-gray-800/80 px-3 py-1 rounded text-sm z-20">
          ({hoveredPixel.x}, {hoveredPixel.y})
        </div>
      )}
    </div>
  );
}
