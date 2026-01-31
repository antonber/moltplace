import { COLOR_NAMES, CANVAS_WIDTH, CANVAS_HEIGHT } from './colors';

export interface ParsedPixelCommand {
  x: number;
  y: number;
  color: number;
}

// Create color lookup map (lowercase name -> index)
const colorNameToIndex: Record<string, number> = {};
COLOR_NAMES.forEach((name, index) => {
  colorNameToIndex[name.toLowerCase()] = index;
  // Also add without spaces (e.g., "darkred" -> 1)
  colorNameToIndex[name.toLowerCase().replace(/\s+/g, '')] = index;
});

// Add common aliases
const colorAliases: Record<string, number> = {
  'white': 31,
  'black': 27,
  'red': 2,
  'orange': 3,
  'yellow': 4,
  'green': 7,
  'blue': 13,
  'purple': 19,
  'pink': 22,
  'brown': 25,
  'gray': 29,
  'grey': 29,
  'teal': 10,
  'cyan': 14,
  'lightblue': 14,
  'darkblue': 12,
  'darkgreen': 6,
  'lightgreen': 8,
  'lime': 8,
  'indigo': 15,
  'violet': 19,
  'magenta': 21,
  'beige': 26,
  'tan': 26,
  'cream': 5,
  'maroon': 0,
  'burgundy': 0,
  'coral': 2,
  'salmon': 23,
  'gold': 4,
  'navy': 12,
  'aqua': 11,
  'turquoise': 10,
  'lavender': 17,
  'periwinkle': 16,
};

function parseColor(colorStr: string): number | null {
  const normalized = colorStr.toLowerCase().trim().replace(/\s+/g, '');

  // Check if it's a number
  const num = parseInt(normalized, 10);
  if (!isNaN(num) && num >= 0 && num < 32) {
    return num;
  }

  // Check color names
  if (colorNameToIndex[normalized] !== undefined) {
    return colorNameToIndex[normalized];
  }

  // Check aliases
  if (colorAliases[normalized] !== undefined) {
    return colorAliases[normalized];
  }

  return null;
}

function parseCoordinates(text: string): { x: number; y: number } | null {
  // Match various coordinate formats:
  // (100, 200), (100,200), 100,200, 100 200, x:100 y:200, etc.
  const patterns = [
    /\(?\s*(\d+)\s*,\s*(\d+)\s*\)?/,           // (100, 200) or 100,200
    /\(?\s*(\d+)\s+(\d+)\s*\)?/,                // 100 200
    /x\s*[:=]?\s*(\d+)\s*[,\s]\s*y\s*[:=]?\s*(\d+)/i,  // x:100 y:200 or x=100, y=200
    /at\s+(\d+)\s*[,\s]\s*(\d+)/i,              // at 100, 200
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const x = parseInt(match[1], 10);
      const y = parseInt(match[2], 10);
      if (x >= 0 && x < CANVAS_WIDTH && y >= 0 && y < CANVAS_HEIGHT) {
        return { x, y };
      }
    }
  }

  return null;
}

/**
 * Parse a Moltbook post for pixel placement commands.
 *
 * Supported formats:
 * - Structured: #pixel 100,200 red | #pixel x:100 y:200 color:blue
 * - Natural: "place red at (100, 200)" | "placing a blue pixel at 100,200"
 * - Simple: "red 100,200" | "100,200 black"
 */
export function parsePixelCommand(text: string): ParsedPixelCommand | null {
  const lowerText = text.toLowerCase();

  // Skip if it doesn't seem to be about pixels
  const pixelKeywords = ['pixel', 'place', 'placing', 'paint', 'painting', 'draw', 'drawing', '#pixel', '#moltplace'];
  const hasKeyword = pixelKeywords.some(kw => lowerText.includes(kw));

  // Also check if it has coordinates - if it has coords and a color, it might be a command
  const hasCoords = parseCoordinates(text) !== null;

  if (!hasKeyword && !hasCoords) {
    return null;
  }

  // Try structured format first: #pixel 100,200 red
  const structuredMatch = text.match(/#pixel\s+(.+)/i);
  if (structuredMatch) {
    const args = structuredMatch[1];
    const coords = parseCoordinates(args);
    if (coords) {
      // Find color in the remaining text
      const remainingText = args.replace(/[\d,\s()xy:=]+/gi, ' ').trim();
      const words = remainingText.split(/\s+/);
      for (const word of words) {
        const color = parseColor(word);
        if (color !== null) {
          return { ...coords, color };
        }
      }
    }
  }

  // Try natural language patterns
  const coords = parseCoordinates(text);
  if (coords) {
    // Look for color words in the text
    const words = text.split(/[\s,()]+/);
    for (const word of words) {
      const color = parseColor(word);
      if (color !== null) {
        return { ...coords, color };
      }
    }
  }

  return null;
}

/**
 * Extract all pixel commands from a post (title + content)
 */
export function extractPixelCommands(title: string, content: string): ParsedPixelCommand[] {
  const commands: ParsedPixelCommand[] = [];

  // Try title first
  const titleCmd = parsePixelCommand(title);
  if (titleCmd) {
    commands.push(titleCmd);
  }

  // Then try content - could have multiple commands on different lines
  const lines = content.split('\n');
  for (const line of lines) {
    const cmd = parsePixelCommand(line);
    if (cmd) {
      // Avoid duplicates
      const isDupe = commands.some(c => c.x === cmd.x && c.y === cmd.y && c.color === cmd.color);
      if (!isDupe) {
        commands.push(cmd);
      }
    }
  }

  // If no commands found from lines, try the whole content
  if (commands.length === 0) {
    const contentCmd = parsePixelCommand(content);
    if (contentCmd) {
      commands.push(contentCmd);
    }
  }

  return commands;
}
