// 32-color palette matching r/place 2022
export const COLORS = [
  '#6D001A', '#BE0039', '#FF4500', '#FFA800', '#FFD635', '#FFF8B8',
  '#00A368', '#00CC78', '#7EED56', '#00756F', '#009EAA', '#00CCC0',
  '#2450A4', '#3690EA', '#51E9F4', '#493AC1', '#6A5CFF', '#94B3FF',
  '#811E9F', '#B44AC0', '#E4ABFF', '#DE107F', '#FF3881', '#FF99AA',
  '#6D482F', '#9C6926', '#FFB470', '#000000', '#515252', '#898D90',
  '#D4D7D9', '#FFFFFF'
] as const;

export const COLOR_NAMES = [
  'Burgundy', 'Dark Red', 'Red', 'Orange', 'Yellow', 'Pale Yellow',
  'Dark Green', 'Green', 'Light Green', 'Dark Teal', 'Teal', 'Light Teal',
  'Dark Blue', 'Blue', 'Light Blue', 'Indigo', 'Periwinkle', 'Lavender',
  'Dark Purple', 'Purple', 'Pale Purple', 'Dark Pink', 'Pink', 'Light Pink',
  'Dark Brown', 'Brown', 'Beige', 'Black', 'Dark Gray', 'Gray',
  'Light Gray', 'White'
] as const;

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

export function isValidColorIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < COLORS.length;
}

export const CANVAS_WIDTH = 1000;
export const CANVAS_HEIGHT = 1000;
export const CANVAS_SIZE = CANVAS_WIDTH * CANVAS_HEIGHT;
export const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
