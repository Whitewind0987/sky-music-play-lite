export const defaultAccentColor = "#2f80ed";

const accentColorPattern = /^#[0-9a-f]{6}$/i;

export function normalizeAccentColor(value: unknown): string {
  return typeof value === "string" && accentColorPattern.test(value)
    ? value.toLowerCase()
    : defaultAccentColor;
}

export function deriveAccentRgb(accentColor: string): string {
  const normalizedColor = normalizeAccentColor(accentColor);
  const { blue, green, red } = parseAccentColor(normalizedColor);

  return `${red}, ${green}, ${blue}`;
}

export function deriveAccentHoverColor(accentColor: string): string {
  const normalizedColor = normalizeAccentColor(accentColor);
  const { blue, green, red } = parseAccentColor(normalizedColor);

  return formatAccentColor({
    blue: Math.round(blue * 0.88),
    green: Math.round(green * 0.88),
    red: Math.round(red * 0.88),
  });
}

export function deriveAccentContrastColor(accentColor: string): string {
  const normalizedColor = normalizeAccentColor(accentColor);
  const { blue, green, red } = parseAccentColor(normalizedColor);
  const relativeLuminance =
    0.2126 * toLinearChannel(red) +
    0.7152 * toLinearChannel(green) +
    0.0722 * toLinearChannel(blue);

  return relativeLuminance > 0.45 ? "#111827" : "#ffffff";
}

function parseAccentColor(accentColor: string) {
  return {
    red: Number.parseInt(accentColor.slice(1, 3), 16),
    green: Number.parseInt(accentColor.slice(3, 5), 16),
    blue: Number.parseInt(accentColor.slice(5, 7), 16),
  };
}

function formatAccentColor({
  blue,
  green,
  red,
}: {
  blue: number;
  green: number;
  red: number;
}) {
  return `#${[red, green, blue]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function toLinearChannel(channel: number) {
  const normalizedChannel = channel / 255;

  return normalizedChannel <= 0.04045
    ? normalizedChannel / 12.92
    : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
}
