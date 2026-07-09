import { describe, expect, it } from "vitest";
import {
  shouldBlockLibraryDeleteRequest,
  shouldBlockLocalSongDeletion,
} from "./libraryDeletionBlocking";

describe("shouldBlockLocalSongDeletion", () => {
  it("blocks local-song deletion while imported-score reconciliation is active", () => {
    expect(
      shouldBlockLocalSongDeletion({
        isBackgroundHandoffPending: false,
        isForegroundStartPending: false,
        isImportedScoreReconciliationInProgress: true,
      }),
    ).toBe(true);
  });

  it("allows local-song deletion after imported-score reconciliation completes", () => {
    expect(
      shouldBlockLocalSongDeletion({
        isBackgroundHandoffPending: false,
        isForegroundStartPending: false,
        isImportedScoreReconciliationInProgress: false,
      }),
    ).toBe(false);
  });
});

describe("shouldBlockLibraryDeleteRequest", () => {
  it("applies the startup reconciliation guard to local-song deletion", () => {
    expect(
      shouldBlockLibraryDeleteRequest({
        isLocalSongDeleteBlocked: true,
        requestType: "local-song",
      }),
    ).toBe(true);
  });

  it("does not apply the local-song guard to playlist deletion", () => {
    expect(
      shouldBlockLibraryDeleteRequest({
        isLocalSongDeleteBlocked: true,
        requestType: "playlist",
      }),
    ).toBe(false);
  });
});
