import { fetch } from "@tauri-apps/plugin-http";

export type UpdateManifest = {
  latestVersion: string;
  releaseUrl: string;
  title?: string;
  notes?: string;
};

export type UpdateInfo = UpdateManifest;

type ParsedVersion = {
  core: [number, number, number];
  prerelease: string[] | null;
};

export function compareSemverLike(
  currentVersion: string,
  latestVersion: string,
): number | null {
  const current = parseSemverLike(currentVersion);
  const latest = parseSemverLike(latestVersion);

  if (current === null || latest === null) {
    return null;
  }

  for (let index = 0; index < current.core.length; index += 1) {
    if (current.core[index] < latest.core[index]) {
      return -1;
    }

    if (current.core[index] > latest.core[index]) {
      return 1;
    }
  }

  return comparePrerelease(current.prerelease, latest.prerelease);
}

export async function checkForUpdate(options: {
  currentVersion: string;
  manifestUrl: string;
  allowedReleaseUrlPrefix: string;
}): Promise<UpdateInfo | null> {
  try {
    const response = await fetch(options.manifestUrl, {
      method: "GET",
    });

    if (!response.ok) {
      return null;
    }

    const manifest = validateUpdateManifest(
      await response.json(),
      options.allowedReleaseUrlPrefix,
    );

    if (manifest === null) {
      return null;
    }

    const comparison = compareSemverLike(
      options.currentVersion,
      manifest.latestVersion,
    );

    return comparison === -1 ? manifest : null;
  } catch (error) {
    console.warn("[update-check] failed", error);
    return null;
  }
}

function validateUpdateManifest(
  value: unknown,
  allowedReleaseUrlPrefix: string,
): UpdateManifest | null {
  if (!isRecord(value)) {
    return null;
  }

  const latestVersion = readRequiredString(value.latestVersion);
  const releaseUrl = readRequiredString(value.releaseUrl);

  if (
    latestVersion === null ||
    releaseUrl === null ||
    !releaseUrl.startsWith(allowedReleaseUrlPrefix)
  ) {
    return null;
  }

  const title = readOptionalString(value.title);
  const notes = readOptionalString(value.notes);

  if (title === null || notes === null) {
    return null;
  }

  return {
    latestVersion,
    releaseUrl,
    ...(title === undefined ? {} : { title }),
    ...(notes === undefined ? {} : { notes }),
  };
}

function parseSemverLike(version: string): ParsedVersion | null {
  const match = version
    .trim()
    .match(
      /^[vV]?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/,
    );

  if (match === null) {
    return null;
  }

  const core = [Number(match[1]), Number(match[2]), Number(match[3])] as [
    number,
    number,
    number,
  ];

  if (core.some((part) => !Number.isSafeInteger(part))) {
    return null;
  }

  return {
    core,
    prerelease: match[4]?.split(".") ?? null,
  };
}

function comparePrerelease(
  current: string[] | null,
  latest: string[] | null,
) {
  if (current === null && latest === null) {
    return 0;
  }

  if (current === null) {
    return 1;
  }

  if (latest === null) {
    return -1;
  }

  const length = Math.max(current.length, latest.length);

  for (let index = 0; index < length; index += 1) {
    const currentPart = current[index];
    const latestPart = latest[index];

    if (currentPart === undefined) {
      return -1;
    }

    if (latestPart === undefined) {
      return 1;
    }

    if (currentPart === latestPart) {
      continue;
    }

    const currentNumber = /^\d+$/.test(currentPart)
      ? Number(currentPart)
      : null;
    const latestNumber = /^\d+$/.test(latestPart)
      ? Number(latestPart)
      : null;

    if (currentNumber !== null && latestNumber !== null) {
      return currentNumber < latestNumber ? -1 : 1;
    }

    if (currentNumber !== null) {
      return -1;
    }

    if (latestNumber !== null) {
      return 1;
    }

    return currentPart < latestPart ? -1 : 1;
  }

  return 0;
}

function readRequiredString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readOptionalString(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === "string" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
