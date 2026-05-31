import type { UiText } from "../i18n/uiText";

export type LibraryCategoryId = "built-in" | "local-imports" | "playlists" | "liked";

const librarySidebarItem = {
  iconClass: "icon-Homehomepagemenu",
  section: "Library",
} as const;

const secondarySidebarItems = [
  { iconClass: "icon-yulan", section: "Playback" },
  { iconClass: "icon-rizhi", section: "Logs" },
  { iconClass: "icon-shezhi", section: "Settings" },
] as const;

export type AppSection =
  | typeof librarySidebarItem.section
  | (typeof secondarySidebarItems)[number]["section"];

type AppSidebarProps = {
  activeSection: AppSection;
  localImportCount: number;
  onLibraryCategoryChange: (category: LibraryCategoryId) => void;
  onSectionChange: (section: AppSection) => void;
  selectedLibraryCategory: LibraryCategoryId;
  text: UiText;
};

export function AppSidebar({
  activeSection,
  localImportCount,
  onLibraryCategoryChange,
  onSectionChange,
  selectedLibraryCategory,
  text,
}: AppSidebarProps) {
  const libraryCategories: Array<{
    count?: number;
    id: LibraryCategoryId;
    label: string;
  }> = [
    { id: "built-in", label: text.library.categoryBuiltIn },
    {
      count: localImportCount,
      id: "local-imports",
      label: text.library.categoryLocalImports,
    },
    { id: "playlists", label: text.library.categoryPlaylists },
    { id: "liked", label: text.library.categoryLiked },
  ];
  const renderSidebarItem = (item: {
    iconClass: string;
    section: AppSection;
  }) => (
    <button
      className={`sidebar-link${
        activeSection === item.section ? " is-active" : ""
      }`}
      key={item.section}
      type="button"
      onClick={() => onSectionChange(item.section)}
    >
      <span
        className={`sidebar-icon sidebar-icon-${item.section.toLowerCase()} iconfont ${item.iconClass}`}
        aria-hidden="true"
      />
      <span>{text.navigation[item.section]}</span>
    </button>
  );

  return (
    <aside className="app-sidebar" aria-label={text.app.navigationAria}>
      <div className="sidebar-brand">
        <span className="brand-mark">S</span>
        <div>
          <p className="eyebrow">{text.brand.eyebrow}</p>
          <h1>{text.brand.name}</h1>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label={text.app.mainSectionsAria}>
        {renderSidebarItem(librarySidebarItem)}

        <div className="sidebar-library" aria-label={text.library.categoriesTitle}>
          <p className="sidebar-subnav-heading">{text.library.categoriesTitle}</p>
          <div className="sidebar-subnav">
            {libraryCategories.map((category) => (
              <button
                className={`sidebar-subnav-link${
                  selectedLibraryCategory === category.id ? " is-active" : ""
                }`}
                key={category.id}
                type="button"
                onClick={() => {
                  onLibraryCategoryChange(category.id);
                  onSectionChange("Library");
                }}
              >
                <span>{category.label}</span>
                {typeof category.count === "number" ? (
                  <span className="sidebar-subnav-count">{category.count}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-nav-divider" />

        {secondarySidebarItems.map(renderSidebarItem)}
      </nav>
    </aside>
  );
}

type WorkspaceHeaderProps = {
  activeSection: AppSection;
  onSettingsClick: () => void;
  text: UiText;
};

export function WorkspaceHeader({
  activeSection,
  onSettingsClick,
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
          <span className="iconfont icon-shezhi" aria-hidden="true" />
        </button>
        <button
          className="icon-action"
          type="button"
          disabled
          title={text.actions.userManual}
          aria-label={text.actions.userManual}
        >
          <span className="iconfont icon-wenhao" aria-hidden="true" />
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
