import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { useMultiSelect } from "./useMultiSelect";

it("keeps selection in the same scope, clears it on navigation, and ignores an old deletion result", () => {
  const snapshots: Array<[boolean, string[]]> = [];
  const scopes = ["local-imports", "local-imports", "local-imports", "playlists:first", "playlists:first", "playlists:second", "playlists:first"];
  let finishOldDeletion!: () => void;

  function Harness() {
    const [step, setStep] = useState(0);
    const selection = useMultiSelect(scopes[step]);
    snapshots[step] = [selection.enabled, [...selection.selected]];

    if (step === 0) {
      selection.setEnabled(true);
      selection.selectAll(["deleted", "failed"]);
      finishOldDeletion = () => selection.deselect(["failed"]);
    }
    if (step === 1) selection.deselect(["deleted"]);
    if (step === 3) selection.selectAll(["failed"]);
    if (step === 4) finishOldDeletion();
    if (step < scopes.length - 1) setStep(step + 1);
    return null;
  }

  renderToStaticMarkup(createElement(Harness));
  expect(snapshots).toEqual([
    [false, []],
    [true, ["deleted", "failed"]],
    [true, ["failed"]],
    [true, []],
    [true, ["failed"]],
    [true, []],
    [true, []],
  ]);
});
