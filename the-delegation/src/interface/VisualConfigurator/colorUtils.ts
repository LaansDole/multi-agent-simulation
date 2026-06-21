export const MAX_BRIGHTNESS = 200;
export const TARGET_BRIGHTNESS = 190;

/**
 * Calculates the perceived brightness of a hex color.
 * Returns a value between 0 and 255.
 */
export const getBrightness = (hex: string): number => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
};

/**
 * Returns a version of the color that is dark enough for white text,
 * but as clear and saturated as possible within that constraint.
 */
export const getDarkenedColor = (hex: string): string => {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h /= 6;
  }

  // Force maximum saturation as requested
  s = 1.0;

  // Max brightness allowed is defined by MAX_BRIGHTNESS.
  // We want the HIGHEST lightness (l) that keeps brightness BELOW this limit.
  // We use a small binary search to find the optimal L.
  let low = 0, high = 1.0;
  for (let i = 0; i < 10; i++) {
    const mid = (low + high) / 2;
    const { r: tr, g: tg, b: tb } = hslToRgbValues(h, s, mid);
    const brightness = (tr * 299 + tg * 587 + tb * 114) / 1000;
    
    if (brightness > TARGET_BRIGHTNESS) { // Safety margin: don't exceed target
      high = mid;
    } else {
      low = mid;
    }
  }
  
  const finalRgb = hslToRgbValues(h, s, low);
  const toHex = (x: number) => {
    const val = Math.max(0, Math.min(255, Math.round(x)));
    return val.toString(16).padStart(2, '0');
  };
  
  return `#${toHex(finalRgb.r)}${toHex(finalRgb.g)}${toHex(finalRgb.b)}`;
};

/**
 * Helper to convert HSL to RGB values (0-255).
 */
const hslToRgbValues = (h: number, s: number, l: number) => {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
      t = (t < 0 ? t + 1 : (t > 1 ? t - 1 : t));
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = f(h + 1 / 3);
    g = f(h);
    b = f(h - 1 / 3);
  }
  return { r: r * 255, g: g * 255, b: b * 255 };
};
