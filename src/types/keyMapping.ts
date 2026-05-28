export const skyKeyNames = [
  "Key0",
  "Key1",
  "Key2",
  "Key3",
  "Key4",
  "Key5",
  "Key6",
  "Key7",
  "Key8",
  "Key9",
  "Key10",
  "Key11",
  "Key12",
  "Key13",
  "Key14",
] as const;

export type SkyKeyName = (typeof skyKeyNames)[number];

export type KeyMapping = Record<SkyKeyName, string>;

export const defaultKeyMapping: KeyMapping = {
  Key0: "y",
  Key1: "u",
  Key2: "i",
  Key3: "o",
  Key4: "p",
  Key5: "h",
  Key6: "j",
  Key7: "k",
  Key8: "l",
  Key9: ";",
  Key10: "n",
  Key11: "m",
  Key12: ",",
  Key13: ".",
  Key14: "/",
};

export function getPreviewKeyName(scoreKey: string): string {
  return scoreKey.match(/Key\d+$/)?.[0] ?? scoreKey;
}
