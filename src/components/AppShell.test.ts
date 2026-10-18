import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { uiText, type LanguageCode } from "../i18n/uiText";
import {
  getAlwaysOnTopActionText,
  getWorkspaceHeaderTitle,
  WorkspaceHeader,
  type AppSection,
  type LibraryCategoryId,
} from "./AppShell";

function renderHeader({
  isAlwaysOnTop = false,
  isAlwaysOnTopReady = true,
  isAlwaysOnTopUpdating = false,
  language = "en-US",
}: {
  isAlwaysOnTop?: boolean;
  isAlwaysOnTopReady?: boolean;
  isAlwaysOnTopUpdating?: boolean;
  language?: LanguageCode;
} = {}) {
  return renderToStaticMarkup(
    createElement(WorkspaceHeader, {
      activeSection: "Library",
      isAlwaysOnTop,
      isAlwaysOnTopReady,
      isAlwaysOnTopUpdating,
      onAlwaysOnTopToggle: vi.fn(),
      onLogsClick: vi.fn(),
      onSettingsClick: vi.fn(),
      onUserManualClick: vi.fn(),
      text: uiText[language],
    }),
  );
}

describe("WorkspaceHeader actions", () => {
  it("renders Pin immediately before Logs, Settings, and User Manual", () => {
    const markup = renderHeader();
    const pinIndex = markup.indexOf('aria-label="Always on top"');
    const logsIndex = markup.indexOf('aria-label="Logs"');
    const settingsIndex = markup.indexOf('aria-label="Settings"');
    const manualIndex = markup.indexOf('aria-label="User Manual"');

    expect(pinIndex).toBeGreaterThan(-1);
    expect(pinIndex).toBeLessThan(logsIndex);
    expect(logsIndex).toBeLessThan(settingsIndex);
    expect(settingsIndex).toBeLessThan(manualIndex);
  });

  it("renders the inactive pin as enabled with localized accessibility text", () => {
    const markup = renderHeader();

    expect(markup).toContain(
      'class="icon-action always-on-top-action"',
    );
    expect(markup).toContain('aria-label="Always on top"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).toContain('title="Always on top"');
    expect(markup).not.toContain(
      'class="icon-action always-on-top-action" disabled=""',
    );
  });

  it("renders the active pin with its active class and active text", () => {
    const markup = renderHeader({ isAlwaysOnTop: true });

    expect(markup).toContain(
      'class="icon-action always-on-top-action is-active"',
    );
    expect(markup).toContain('aria-label="Disable always on top"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('title="Disable always on top"');
  });

  it.each([
    ["not ready", { isAlwaysOnTopReady: false }],
    ["updating", { isAlwaysOnTopUpdating: true }],
  ] as const)("disables the pin while %s", (_, state) => {
    const markup = renderHeader(state);
    const pinButton = markup.slice(
      markup.indexOf("always-on-top-action"),
      markup.indexOf("</button>"),
    );

    expect(pinButton).toContain('disabled=""');
  });

  it("renders the exact Chinese labels and keeps the icon decorative", () => {
    const inactiveMarkup = renderHeader({ language: "zh-CN" });
    const activeMarkup = renderHeader({
      isAlwaysOnTop: true,
      language: "zh-CN",
    });

    expect(inactiveMarkup).toContain('aria-label="始终置顶"');
    expect(inactiveMarkup).toContain('title="始终置顶"');
    expect(activeMarkup).toContain('aria-label="取消置顶"');
    expect(activeMarkup).toContain('title="取消置顶"');
    expect(inactiveMarkup).toMatch(
      /lucide-pin[^>]*aria-hidden="true"[^>]*focusable="false"/,
    );
  });

  it("selects labels only from localized action text", () => {
    expect(
      getAlwaysOnTopActionText(false, uiText["zh-CN"].actions),
    ).toBe("始终置顶");
    expect(
      getAlwaysOnTopActionText(true, uiText["zh-CN"].actions),
    ).toBe("取消置顶");
    expect(
      getAlwaysOnTopActionText(false, uiText["en-US"].actions),
    ).toBe("Always on top");
    expect(
      getAlwaysOnTopActionText(true, uiText["en-US"].actions),
    ).toBe("Disable always on top");
  });
});

describe("workspace contextual title", () => {
  it.each(["zh-CN", "en-US"] as const)("uses stable category titles (%s)", (language) => {
    const text = uiText[language];
    const expected: Array<[LibraryCategoryId, string]> = [
      ["built-in", text.library.categoryBuiltIn],
      ["local-imports", text.library.categoryLocalImports],
      ["liked", text.library.categoryLiked],
      ["playlists", text.sidebar.createdPlaylists],
    ];
    for (const [libraryCategory, title] of expected) {
      expect(getWorkspaceHeaderTitle({
        activeSection: "Library",
        libraryCategory,
        selectedPlaylist: null,
        text,
      })).toBe(title);
    }
  });

  it("uses the selected user playlist name only in the playlist category", () => {
    const selectedPlaylist = {
      id: "playlist",
      name: "夜间练习 / Evening practice",
      songIds: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const context = {
      activeSection: "Library" as const,
      selectedPlaylist,
      text: uiText["zh-CN"],
    };
    expect(getWorkspaceHeaderTitle({ ...context, libraryCategory: "playlists" }))
      .toBe(selectedPlaylist.name);
    expect(getWorkspaceHeaderTitle({ ...context, libraryCategory: "built-in" }))
      .toBe(context.text.library.categoryBuiltIn);
  });

  it.each(["Recording", "Playback", "Logs", "Settings"] as AppSection[])("keeps %s unchanged", (activeSection) => {
    const text = uiText["zh-CN"];
    expect(getWorkspaceHeaderTitle({
      activeSection,
      libraryCategory: "local-imports",
      text,
    })).toBe(text.sections[activeSection].title);
  });
});
