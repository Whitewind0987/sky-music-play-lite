import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ArrowDownUp, Check, ChevronDown } from "lucide-react";
import type { UiText } from "../i18n/uiText";
import { librarySortModes, type LibrarySortingControls } from "../types/librarySorting";

export function LibrarySortingControl({ sorting, disabled, text }: {
  sorting: LibrarySortingControls;
  disabled: boolean;
  text: UiText["library"]["sorting"];
}) {
  return (
    <>
    {sorting.mode === "custom" ? (
      <button className="library-sort-edit-button" type="button"
        disabled={disabled || !sorting.canEdit}
        aria-pressed={sorting.isEditing}
        title={!disabled && !sorting.canEdit ? text.searchDisabled : undefined}
        onClick={sorting.onToggleEditing}>
        {sorting.isEditing ? text.done : text.editOrder}
      </button>
    ) : null}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="library-sort-trigger" type="button" disabled={disabled}
          aria-label={`${text.label}: ${text.modes[sorting.mode]}`}>
          <ArrowDownUp aria-hidden="true" />
          <span>{text.modes[sorting.mode]}</span>
          <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="library-sort-menu" align="end" sideOffset={6} collisionPadding={8}>
          {!sorting.supportsAdded && <DropdownMenu.Label className="library-sort-note">
            {text.noAddedTime}
          </DropdownMenu.Label>}
          <DropdownMenu.RadioGroup value={sorting.mode} onValueChange={value => {
            const mode = librarySortModes.find(candidate => candidate === value);
            if (mode) sorting.onModeChange(mode);
          }}>
            {librarySortModes.map(mode => (
              <DropdownMenu.RadioItem key={mode} asChild value={mode}
                disabled={mode.startsWith("added-") && !sorting.supportsAdded}>
                <button type="button" disabled={mode.startsWith("added-") && !sorting.supportsAdded}>
                  <span className="library-sort-check"><DropdownMenu.ItemIndicator><Check aria-hidden="true" /></DropdownMenu.ItemIndicator></span>
                  {text.modes[mode]}
                </button>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
    </>
  );
}
