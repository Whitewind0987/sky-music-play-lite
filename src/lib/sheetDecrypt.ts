const SHEET_DECRYPT_KEY = "TB,R&Q}-ULFXF7={nU7v?fy#Khr9Mhuu";
const SHEET_DECRYPT_SIGNATURE = "ztB_kaFeQe/wa8Kq{r_jz!r=P])hQL(f";

export type SheetDecryptErrorCode =
  | "emptyEncryptedNotes"
  | "invalidEncryptedNoteValue"
  | "decryptedJsonInvalid";

type SheetDecryptErrorDetails = Record<string, string | number>;

export class SheetDecryptError extends Error {
  code: SheetDecryptErrorCode;
  details: SheetDecryptErrorDetails;

  constructor(
    code: SheetDecryptErrorCode,
    details: SheetDecryptErrorDetails = {},
  ) {
    super(code);
    this.name = "SheetDecryptError";
    this.code = code;
    this.details = details;
  }
}

export function decryptEncryptedSongNotes(encryptedNotes: number[]): unknown {
  if (!Array.isArray(encryptedNotes) || encryptedNotes.length === 0) {
    throw new SheetDecryptError("emptyEncryptedNotes");
  }

  const decryptedText = encryptedNotes
    .map((encryptedValue, index) => {
      if (!Number.isFinite(encryptedValue) || !Number.isInteger(encryptedValue)) {
        throw new SheetDecryptError("invalidEncryptedNoteValue", { index });
      }

      const keyCharCode = SHEET_DECRYPT_KEY.charCodeAt(
        index % SHEET_DECRYPT_KEY.length,
      );
      const decryptedCharCode = encryptedValue - keyCharCode + 100;

      return String.fromCharCode(decryptedCharCode);
    })
    .join("");

  const signatureIndex = decryptedText.indexOf(SHEET_DECRYPT_SIGNATURE);
  const jsonText = decryptedText.endsWith(SHEET_DECRYPT_SIGNATURE)
    ? decryptedText.slice(0, -SHEET_DECRYPT_SIGNATURE.length)
    : signatureIndex >= 0
      ? `${decryptedText.slice(0, signatureIndex)}${decryptedText.slice(
          signatureIndex + SHEET_DECRYPT_SIGNATURE.length,
        )}`
      : decryptedText;

  try {
    return JSON.parse(jsonText);
  } catch (error) {
    throw new SheetDecryptError("decryptedJsonInvalid", {
      jsonError: error instanceof Error ? error.message : String(error),
    });
  }
}
