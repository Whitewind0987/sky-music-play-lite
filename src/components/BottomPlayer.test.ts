import type { ComponentProps, ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { uiText } from "../i18n/uiText";
import { defaultNoteIntervalDelayMs, defaultPlaybackSpeed } from "../types/playbackOptions";
import { BottomPlayer } from "./BottomPlayer";

vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: () => {},
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, vi.fn()],
}));

type PlayerProps = ComponentProps<typeof BottomPlayer>;
type PlayerElement = ReactElement<ComponentProps<"div">>;

function findDiv(node: ReactNode, className: string): PlayerElement | undefined {
  if (Array.isArray(node)) {
    return node.map((child) => findDiv(child, className)).find(Boolean);
  }
  if (typeof node !== "object" || node === null || !("props" in node)) return;
  const element = node as PlayerElement;
  if (element.props.className?.split(" ").includes(className)) return element;
  return findDiv(element.props.children, className);
}

function renderPlayer(isOpen: boolean, canOpen = true, overrides: Partial<PlayerProps> = {}) {
  const onVisualizationOpen = vi.fn();
  const onVisualizationClose = vi.fn();
  const text = uiText["en-US"].bottomPlayer;
  const noop = () => {};
  const props: PlayerProps = {
    canManualStep: false,
    canOpenVisualization: canOpen,
    canPlay: false,
    canSeek: false,
    canStop: false,
    currentSong: null,
    isCurrentSongLoading: false,
    isPianoEnabled: false,
    isRealInputOutput: false,
    isShuffleEnabled: false,
    isVisualizationOpen: isOpen,
    manualState: "idle",
    noteIntervalDelayMs: defaultNoteIntervalDelayMs,
    onManualStep: noop,
    onManualStepHoldBegin: noop,
    onManualStepHoldEnd: noop,
    onNext: noop,
    onNoteIntervalDelayChange: noop,
    onPause: noop,
    onPianoToggle: noop,
    onPlay: noop,
    onPlaybackSpeedChange: noop,
    onPlayQueueItem: noop,
    onQueueClear: noop,
    onQueueClose: noop,
    onQueueItemRemove: noop,
    onQueueToggle: noop,
    onRepeatModeCycle: noop,
    onResume: noop,
    onSeek: noop,
    onShuffleToggle: noop,
    onStop: noop,
    onVisualizationClose,
    onVisualizationOpen,
    outputModeLabel: "Preview",
    playbackMode: "sequence",
    playbackState: "idle",
    playbackSpeed: defaultPlaybackSpeed,
    progress: { currentMs: 0, percent: 0, totalMs: 0 },
    queueItems: [],
    queueOpen: false,
    songs: [],
    text,
    ...overrides,
  };
  const tree = BottomPlayer(props);
  return {
    body: findDiv(tree, "bottom-player-body")!.props,
    trigger: findDiv(tree, "bottom-player-score")!.props,
    onVisualizationOpen,
    onVisualizationClose,
    text,
    tree,
  };
}

it("shows the piano toggle only for preview output and announces its state", () => {
  const onPianoToggle = vi.fn();
  const findToggle = (props: Partial<PlayerProps>) =>
    findDiv(renderPlayer(false, true, props).tree, "bottom-player-piano-button");
  const muted = findToggle({ onPianoToggle });
  expect(muted?.props).toMatchObject({ "aria-label": "Enable piano audio", "aria-pressed": false });
  expect(muted?.props.onClick).toBe(onPianoToggle);
  expect(findToggle({ isPianoEnabled: true })?.props).toMatchObject({
    "aria-label": "Disable piano audio",
    "aria-pressed": true,
  });
  expect(findToggle({ isRealInputOutput: true })).toBeUndefined();
});

describe("bottom player visualization toggle", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([false, true])("toggles from the player body and keeps controls and outside content separate (open=%s)", (isOpen) => {
    class Target {
      constructor(readonly control = false) {}
      closest() { return this.control ? this : null; }
    }
    vi.stubGlobal("Element", Target);
    const player = renderPlayer(isOpen);
    function click(target: Target, inside = true) {
      player.body.onClick!({ target, currentTarget: { contains: () => inside } } as unknown as Parameters<NonNullable<typeof player.body.onClick>>[0]);
    }
    click(new Target(true));
    click(new Target(), false);
    expect(player.onVisualizationOpen).not.toHaveBeenCalled();
    expect(player.onVisualizationClose).not.toHaveBeenCalled();

    click(new Target());
    expect(player.onVisualizationOpen).toHaveBeenCalledTimes(isOpen ? 0 : 1);
    expect(player.onVisualizationClose).toHaveBeenCalledTimes(isOpen ? 1 : 0);
  });

  it.each([false, true])("announces the state and supports keyboard activation (open=%s)", (isOpen) => {
    const player = renderPlayer(isOpen);
    expect(player.trigger["aria-expanded"]).toBe(isOpen);
    expect(player.trigger["aria-label"]).toBe(isOpen ? player.text.collapseVisualization : player.text.expandVisualization);
    expect(player.trigger.tabIndex).toBe(0);
    for (const [key, repeat] of [["Enter", false], [" ", false], ["Enter", true], ["Escape", false]] as const) {
      player.trigger.onKeyDown!({ key, repeat, preventDefault: vi.fn() } as unknown as Parameters<NonNullable<typeof player.trigger.onKeyDown>>[0]);
    }
    expect(player.onVisualizationOpen).toHaveBeenCalledTimes(isOpen ? 0 : 2);
    expect(player.onVisualizationClose).toHaveBeenCalledTimes(isOpen ? 2 : 0);
  });
});
