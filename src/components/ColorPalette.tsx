'use client';

import { COLORS, COLOR_NAMES } from '@/lib/colors';

interface ColorPaletteProps {
  selectedColor: number;
  onColorSelect: (colorIndex: number) => void;
}

export default function ColorPalette({ selectedColor, onColorSelect }: ColorPaletteProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <h3 className="text-sm font-medium text-gray-300 mb-2">Color Palette</h3>
      <div className="grid grid-cols-8 gap-1">
        {COLORS.map((color, index) => (
          <button
            key={index}
            onClick={() => onColorSelect(index)}
            className={`w-8 h-8 rounded border-2 transition-transform hover:scale-110 ${
              selectedColor === index
                ? 'border-white shadow-lg scale-110'
                : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
            title={COLOR_NAMES[index]}
          />
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        Selected: {COLOR_NAMES[selectedColor]}
      </p>
    </div>
  );
}
