import {
  CircleHelp,
  Eye,
  Library,
  ScrollText,
  Settings,
  type LucideIcon,
} from "lucide-react";
import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { UiText } from "../i18n/uiText";
import type { UpdateInfo } from "../lib/updateCheck";

export type LibraryCategoryId = "built-in" | "local-imports" | "playlists" | "liked";

const librarySidebarItem = {
  Icon: Library,
  section: "Library",
} as const;

const secondarySidebarItems = [
  { Icon: Eye, section: "Playback" },
  { Icon: ScrollText, section: "Logs" },
  { Icon: Settings, section: "Settings" },
] as const;

export type AppSection =
  | typeof librarySidebarItem.section
  | (typeof secondarySidebarItems)[number]["section"];

type AppSidebarProps = {
  activeSection: AppSection;
  onSectionChange: (section: AppSection) => void;
  onUpdateClick: () => void;
  text: UiText;
  updateInfo: UpdateInfo | null;
};

type RippleState = {
  id: number;
  size: number;
  x: number;
  y: number;
};

type SidebarNavButtonProps = {
  Icon: LucideIcon;
  isActive: boolean;
  label: string;
  onClick: () => void;
  section: AppSection;
};

function SidebarNavButton({
  Icon,
  isActive,
  label,
  onClick,
  section,
}: SidebarNavButtonProps) {
  const [ripples, setRipples] = useState<RippleState[]>([]);
  const rippleIdRef = useRef(0);

  function addRipple(button: HTMLButtonElement, x: number, y: number) {
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const id = rippleIdRef.current;

    rippleIdRef.current += 1;
    setRipples((currentRipples) => [...currentRipples, { id, size, x, y }]);
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

  return (
    <button
      className={`sidebar-link${isActive ? " is-active" : ""}`}
      type="button"
      onClick={onClick}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
    >
      <span className="sidebar-link-content">
        <Icon
          className={`sidebar-icon sidebar-icon-${section.toLowerCase()}`}
          aria-hidden="true"
          focusable="false"
        />
        <span>{label}</span>
      </span>
      <span className="sidebar-ripple-layer" aria-hidden="true">
        {ripples.map((ripple) => (
          <span
            className="sidebar-ripple"
            key={ripple.id}
            style={{
              height: ripple.size,
              left: ripple.x,
              top: ripple.y,
              width: ripple.size,
            }}
            onAnimationEnd={() => {
              setRipples((currentRipples) =>
                currentRipples.filter((item) => item.id !== ripple.id),
              );
            }}
          />
        ))}
      </span>
    </button>
  );
}

export function AppSidebar({
  activeSection,
  onSectionChange,
  onUpdateClick,
  text,
  updateInfo,
}: AppSidebarProps) {
  const renderSidebarItem = (item: {
    Icon: LucideIcon;
    section: AppSection;
  }) => (
    <SidebarNavButton
      Icon={item.Icon}
      isActive={activeSection === item.section}
      key={item.section}
      label={text.navigation[item.section]}
      section={item.section}
      onClick={() => onSectionChange(item.section)}
    />
  );

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

      <nav className="sidebar-nav" aria-label={text.app.mainSectionsAria}>
        {renderSidebarItem(librarySidebarItem)}

        <div className="sidebar-nav-divider" />

        {secondarySidebarItems.map(renderSidebarItem)}
      </nav>
    </aside>
  );
}

type WorkspaceHeaderProps = {
  activeSection: AppSection;
  onSettingsClick: () => void;
  onUserManualClick: () => void;
  text: UiText;
};

export function WorkspaceHeader({
  activeSection,
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
