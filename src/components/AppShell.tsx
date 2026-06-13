import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Eye,
  FolderDown,
  Heart,
  Library,
  ListMusic,
  Plus,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { UiText } from "../i18n/uiText";
import type { UpdateInfo } from "../lib/updateCheck";
import type { UserPlaylist } from "../types/library";

export type LibraryCategoryId = "built-in" | "local-imports" | "playlists" | "liked";

export type AppSection = "Library" | "Playback" | "Logs" | "Settings";

type AppSidebarProps = {
  activeSection: AppSection;
  onCreatePlaylistRequest: () => void;
  onLibraryCategorySelect: (category: LibraryCategoryId) => void;
  onPlaylistSelect: (playlistId: string) => void;
  onSectionChange: (section: AppSection) => void;
  onUpdateClick: () => void;
  playlists: UserPlaylist[];
  selectedLibraryCategory: LibraryCategoryId;
  selectedPlaylistId: string | null;
  text: UiText;
  updateInfo: UpdateInfo | null;
};

const RIPPLE_EXIT_MS = 320;

type RippleState = {
  id: number;
  phase: "enter" | "hold" | "exit";
  size: number;
  x: number;
  y: number;
};

type SidebarNavButtonProps = {
  Icon: LucideIcon;
  isActive: boolean;
  isCompact?: boolean;
  label: string;
  onClick: () => void;
  section: AppSection;
};

type SidebarRippleButtonProps = {
  children: ReactNode;
  className: string;
  onClick: () => void;
};

type SidebarCategoryButtonProps = {
  Icon: LucideIcon;
  isActive: boolean;
  label: string;
  onClick: () => void;
};

function SidebarRippleButton({
  children,
  className,
  onClick,
}: SidebarRippleButtonProps) {
  const [ripple, setRipple] = useState<RippleState | null>(null);
  const [isPressing, setIsPressing] = useState(false);
  const cleanupTimerRef = useRef<number | null>(null);
  const holdFrameRef = useRef<number | null>(null);
  const rippleIdRef = useRef(0);

  useEffect(
    () => () => {
      if (cleanupTimerRef.current !== null) {
        window.clearTimeout(cleanupTimerRef.current);
      }

      if (holdFrameRef.current !== null) {
        window.cancelAnimationFrame(holdFrameRef.current);
      }
    },
    [],
  );

  function clearRippleCleanupTimer() {
    if (cleanupTimerRef.current === null) {
      return;
    }

    window.clearTimeout(cleanupTimerRef.current);
    cleanupTimerRef.current = null;
  }

  function clearRippleHoldFrame() {
    if (holdFrameRef.current === null) {
      return;
    }

    window.cancelAnimationFrame(holdFrameRef.current);
    holdFrameRef.current = null;
  }

  function addRipple(button: HTMLButtonElement, x: number, y: number) {
    const rect = button.getBoundingClientRect();
    const size = Math.hypot(rect.width, rect.height) * 2;
    const id = rippleIdRef.current;

    rippleIdRef.current += 1;
    clearRippleCleanupTimer();
    clearRippleHoldFrame();
    setIsPressing(true);
    setRipple({
      id,
      phase: "enter",
      size,
      x,
      y,
    });

    holdFrameRef.current = window.requestAnimationFrame(() => {
      holdFrameRef.current = null;
      setRipple((currentRipple) =>
        currentRipple?.id === id
          ? {
              ...currentRipple,
              phase: "hold",
            }
          : currentRipple,
      );
    });
  }

  function releaseRipple() {
    setIsPressing(false);
    clearRippleHoldFrame();
    setRipple((currentRipple) =>
      currentRipple
        ? {
            ...currentRipple,
            phase: "exit",
          }
        : currentRipple,
    );

    clearRippleCleanupTimer();
    cleanupTimerRef.current = window.setTimeout(() => {
      setRipple(null);
      cleanupTimerRef.current = null;
    }, RIPPLE_EXIT_MS);
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();

    addRipple(
      event.currentTarget,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.repeat || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();

    addRipple(event.currentTarget, rect.width / 2, rect.height / 2);
  }

  function handleKeyUp(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    releaseRipple();
  }

  return (
    <button
      className={`${className}${isPressing ? " is-pressing" : ""}`}
      type="button"
      onBlur={releaseRipple}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onPointerCancel={releaseRipple}
      onPointerDown={handlePointerDown}
      onPointerLeave={releaseRipple}
      onPointerUp={releaseRipple}
    >
      {children}
      <span className="sidebar-ripple-layer" aria-hidden="true">
        {ripple ? (
          <span
            className={`sidebar-ripple is-${ripple.phase}`}
            key={ripple.id}
            style={
              {
                "--sidebar-ripple-size": `${ripple.size}px`,
                "--sidebar-ripple-x": `${ripple.x}px`,
                "--sidebar-ripple-y": `${ripple.y}px`,
              } as CSSProperties
            }
          />
        ) : null}
      </span>
    </button>
  );
}

function SidebarCategoryButton({
  Icon,
  isActive,
  label,
  onClick,
}: SidebarCategoryButtonProps) {
  return (
    <SidebarRippleButton
      className={`sidebar-category-item${isActive ? " is-active" : ""}`}
      onClick={onClick}
    >
      <span className="sidebar-category-item-content">
        <Icon
          className="sidebar-category-icon"
          aria-hidden="true"
          focusable="false"
        />
        <span className="sidebar-category-label">{label}</span>
      </span>
    </SidebarRippleButton>
  );
}

function SidebarNavButton({
  Icon,
  isActive,
  isCompact = false,
  label,
  onClick,
  section,
}: SidebarNavButtonProps) {
  return (
    <SidebarRippleButton
      className={`sidebar-link${isCompact ? " is-compact" : ""}${
        isActive ? " is-active" : ""
      }`}
      onClick={onClick}
    >
      <span className="sidebar-link-content">
        <Icon
          className={`sidebar-icon sidebar-icon-${section.toLowerCase()}`}
          aria-hidden="true"
          focusable="false"
        />
        <span>{label}</span>
      </span>
    </SidebarRippleButton>
  );
}

export function AppSidebar({
  activeSection,
  onCreatePlaylistRequest,
  onLibraryCategorySelect,
  onPlaylistSelect,
  onSectionChange,
  onUpdateClick,
  playlists,
  selectedLibraryCategory,
  selectedPlaylistId,
  text,
  updateInfo,
}: AppSidebarProps) {
  const [isCreatedPlaylistsOpen, setIsCreatedPlaylistsOpen] = useState(true);
  const [isSidebarScrollable, setIsSidebarScrollable] = useState(false);
  const sidebarScrollAreaRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = sidebarScrollAreaRef.current;

    if (!element) {
      return;
    }
    const scrollElement = element;

    function updateScrollableState() {
      setIsSidebarScrollable(
        scrollElement.scrollHeight > scrollElement.clientHeight + 1,
      );
    }

    const frame = window.requestAnimationFrame(updateScrollableState);
    window.addEventListener("resize", updateScrollableState);

    const resizeObserver =
      "ResizeObserver" in window
        ? new ResizeObserver(updateScrollableState)
        : null;

    resizeObserver?.observe(scrollElement);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateScrollableState);
      resizeObserver?.disconnect();
    };
  }, [activeSection, isCreatedPlaylistsOpen, playlists.length]);

  return (
    <aside className="app-sidebar" aria-label={text.app.navigationAria}>
      <div className="sidebar-brand">
        <span className="brand-mark">S</span>
        <div className="brand-copy">
          <p className="eyebrow">{text.brand.eyebrow}</p>
          <h1 className="brand-title">{text.brand.name}</h1>
          {updateInfo ? (
            <button
              className="update-badge"
              type="button"
              aria-label={`${text.actions.updateAvailable}: ${updateInfo.latestVersion}`}
              title={`${text.actions.updateAvailable} ${updateInfo.latestVersion}`}
              onClick={onUpdateClick}
            >
              {text.actions.updateBadge}
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={sidebarScrollAreaRef}
        className={`sidebar-scroll-area${
          isSidebarScrollable ? " is-scrollable" : ""
        }`}
      >
        <section className="sidebar-section sidebar-my-section">
          <p className="sidebar-section-title">{text.sidebar.mySection}</p>
          <SidebarCategoryButton
            Icon={Library}
            isActive={
              activeSection === "Library" &&
              selectedLibraryCategory === "built-in"
            }
            label={text.sidebar.builtIn}
            onClick={() => onLibraryCategorySelect("built-in")}
          />
          <SidebarCategoryButton
            Icon={FolderDown}
            isActive={
              activeSection === "Library" &&
              selectedLibraryCategory === "local-imports"
            }
            label={text.sidebar.localImports}
            onClick={() => onLibraryCategorySelect("local-imports")}
          />
          <SidebarCategoryButton
            Icon={Heart}
            isActive={
              activeSection === "Library" &&
              selectedLibraryCategory === "liked"
            }
            label={text.sidebar.liked}
            onClick={() => onLibraryCategorySelect("liked")}
          />
        </section>

        <section className="sidebar-created-playlists-section">
          <div className="sidebar-playlist-header">
            <button
              className="sidebar-playlist-toggle"
              type="button"
              aria-expanded={isCreatedPlaylistsOpen}
              aria-label={
                isCreatedPlaylistsOpen
                  ? text.sidebar.collapseCreatedPlaylists
                  : text.sidebar.expandCreatedPlaylists
              }
              onClick={() =>
                setIsCreatedPlaylistsOpen((currentValue) => !currentValue)
              }
            >
              <span className="sidebar-playlist-toggle-label">
                {text.sidebar.createdPlaylists}
              </span>
              <small className="sidebar-playlist-toggle-count">
                {playlists.length}
              </small>
              {isCreatedPlaylistsOpen ? (
                <ChevronDown
                  className="sidebar-playlist-toggle-chevron"
                  aria-hidden="true"
                  focusable="false"
                />
              ) : (
                <ChevronRight
                  className="sidebar-playlist-toggle-chevron"
                  aria-hidden="true"
                  focusable="false"
                />
              )}
            </button>
            <button
              className="sidebar-playlist-create"
              type="button"
              aria-label={text.sidebar.createPlaylist}
              title={text.sidebar.createPlaylist}
              onClick={onCreatePlaylistRequest}
            >
              <Plus aria-hidden="true" focusable="false" />
            </button>
          </div>

          {isCreatedPlaylistsOpen ? (
            playlists.length > 0 ? (
              <div className="sidebar-playlist-list" role="list">
                {playlists.map((playlist) => {
                  const isActive =
                    activeSection === "Library" &&
                    selectedLibraryCategory === "playlists" &&
                    selectedPlaylistId === playlist.id;

                  return (
                    <SidebarRippleButton
                      className={`sidebar-playlist-item${
                        isActive ? " is-active" : ""
                      }`}
                      key={playlist.id}
                      onClick={() => onPlaylistSelect(playlist.id)}
                    >
                      <span className="sidebar-playlist-item-content">
                        <ListMusic
                          className="sidebar-playlist-icon"
                          aria-hidden="true"
                          focusable="false"
                        />
                        <span className="sidebar-playlist-name">
                          {playlist.name}
                        </span>
                      </span>
                    </SidebarRippleButton>
                  );
                })}
              </div>
            ) : (
              <p className="sidebar-playlist-empty">
                {text.sidebar.noCreatedPlaylists}
              </p>
            )
          ) : null}
        </section>

        <nav className="sidebar-nav" aria-label={text.app.mainSectionsAria}>
          <SidebarNavButton
            Icon={Eye}
            isActive={activeSection === "Playback"}
            isCompact
            label={text.sidebar.preview}
            section="Playback"
            onClick={() => onSectionChange("Playback")}
          />
        </nav>
      </div>
    </aside>
  );
}

type WorkspaceHeaderProps = {
  activeSection: AppSection;
  onLogsClick: () => void;
  onSettingsClick: () => void;
  onUserManualClick: () => void;
  text: UiText;
};

export function WorkspaceHeader({
  activeSection,
  onLogsClick,
  onSettingsClick,
  onUserManualClick,
  text,
}: WorkspaceHeaderProps) {
  const header = text.sections[activeSection];

  return (
    <header className="workspace-header">
      <h2>{header.title}</h2>
      <div className="header-actions" aria-label={text.app.placeholderActionsAria}>
        <button
          className="icon-action"
          type="button"
          onClick={onLogsClick}
          title={text.actions.logs}
          aria-label={text.actions.logs}
        >
          <ScrollText aria-hidden="true" focusable="false" />
        </button>
        <button
          className="icon-action"
          type="button"
          onClick={onSettingsClick}
          title={text.actions.settings}
          aria-label={text.actions.settings}
        >
          <Settings aria-hidden="true" focusable="false" />
        </button>
        <button
          className="icon-action"
          type="button"
          onClick={onUserManualClick}
          title={text.actions.userManual}
          aria-label={text.actions.userManual}
        >
          <CircleHelp aria-hidden="true" focusable="false" />
        </button>
      </div>
    </header>
  );
}

type WorkspaceOverviewProps = {
  isPreviewPlaying: boolean;
  logCount: number;
  noteCount: number;
  text: UiText["workspace"];
};

export function WorkspaceOverview({
  isPreviewPlaying,
  logCount,
  noteCount,
  text,
}: WorkspaceOverviewProps) {
  return (
    <section className="overview-grid" aria-label={text.aria}>
      <article className="overview-card">
        <p className="eyebrow">{text.scoreTitle}</p>
        <h3>
          {noteCount} {text.parsedNotes}
        </h3>
        <p>{text.scoreDescription}</p>
      </article>
      <article className="overview-card">
        <p className="eyebrow">{text.playbackTitle}</p>
        <h3>{isPreviewPlaying ? text.previewRunning : text.previewIdle}</h3>
        <p>{text.playbackDescription}</p>
      </article>
      <article className="overview-card">
        <p className="eyebrow">{text.logsTitle}</p>
        <h3>
          {logCount} {text.logEntries}
        </h3>
        <p>{text.logsDescription}</p>
      </article>
    </section>
  );
}
