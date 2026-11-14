import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AudioLines, Check, ChevronDown, Copy, FileAudio, FolderOpen, Play, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { customInstrumentText } from "../i18n/customInstrumentText";
import { skyKeyNames } from "../types/keyMapping";
import {
  customAudioExtension, customMaxFile, customMaxTotal, customSamplePitches,
  hasCustomAudioSignature, mapCustomSamples, resolveCustomSamples,
  customInstrumentNamingPrompt,
  createCustomInstrumentSearchPrompt,
  type CustomArticulation, type CustomInstrument,
} from "../lib/customInstruments";
import { chooseCustomInstrumentFolder, deleteCustomInstrument, importCustomInstrument, renameCustomInstrument, setCustomInstrumentDisabled } from "../lib/tauriApi";
import { ConfirmDialog } from "./ConfirmDialog";

async function droppedSamples(transfer: DataTransfer) {
  const files = Array.from(transfer.files);
  const folders = Array.from(transfer.items)
    .map(item => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemDirectoryEntry => !!entry?.isDirectory);
  const samples = files.filter(file => customAudioExtension.test(file.name));
  for (const folder of folders) {
    const reader = folder.createReader();
    for (;;) {
      const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!entries.length) break;
      for (const entry of entries) {
        if (!entry.isFile || !customAudioExtension.test(entry.name)) continue;
        samples.push(await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject)));
        if (samples.length > 60) return samples;
      }
    }
  }
  return samples;
}

function InstrumentChoice({ id, label, value, options, disabled, onChange }: {
  id?: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const selectedLabel = options.find(option => option.value === value)?.label;
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button id={id} className="library-sort-trigger custom-instrument-choice"
          type="button" disabled={disabled} aria-label={`${label}: ${selectedLabel}`}>
          <span title={selectedLabel}>{selectedLabel}</span>
          <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="library-sort-menu custom-instrument-choice-menu"
          align="start" sideOffset={6} collisionPadding={8}>
          <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
            {options.map(option => (
              <DropdownMenu.RadioItem key={option.value} value={option.value} textValue={option.label} asChild>
                <button type="button">
                  <span className="library-sort-check">
                    <DropdownMenu.ItemIndicator><Check aria-hidden="true" /></DropdownMenu.ItemIndicator>
                  </span>
                  <span className="custom-instrument-menu-name" title={option.label}>{option.label}</span>
                </button>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

type Props = {
  language: keyof typeof customInstrumentText;
  instruments: CustomInstrument[];
  catalogError: string | null;
  onChange: (items: CustomInstrument[]) => void;
  onClose: () => void;
  audition: (file: File) => Promise<void>;
  stopAudition: () => void;
  audible: boolean;
};

export function CustomInstrumentDialog({
  language, instruments, catalogError, onChange, onClose,
  audition, stopAudition, audible,
}: Props) {
  const text = customInstrumentText[language];
  const [name, setName] = useState("");
  const [articulation, setArticulation] = useState<CustomArticulation>("naturalDecay");
  const [files, setFiles] = useState<File[]>([]);
  const [valid, setValid] = useState<boolean[]>([]);
  const [assignments, setAssignments] = useState<(number | null)[]>([]);
  const [conflicts, setConflicts] = useState<boolean[]>([]);
  const [editing, setEditing] = useState<CustomInstrument | null>(null);
  const [rename, setRename] = useState("");
  const [deleting, setDeleting] = useState<CustomInstrument | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [copiedPrompt, setCopiedPrompt] = useState<"naming" | "search" | null>(null);
  const busyRef = useRef(false);
  const stopRef = useRef(stopAudition);
  stopRef.current = stopAudition;
  useEffect(() => () => stopRef.current(), []);
  const mapped = resolveCustomSamples(files, assignments);
  const canSave = !!mapped && assignments.every(index => index !== null && valid[index]) &&
    mapped.reduce((total, file) => total + file.size, 0) <= customMaxTotal && !!name.trim();

  async function run(operation: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try { await operation(); }
    catch (reason) { setError(String(reason)); }
    finally { busyRef.current = false; setBusy(false); }
  }

  function autoMap(nextFiles: File[]) {
    const result = mapCustomSamples(nextFiles);
    setAssignments(result.assignments);
    setConflicts(result.conflicts);
  }

  async function loadSamples(chosen: File[]) {
    stopAudition();
    const samples = chosen.filter(file => customAudioExtension.test(file.name));
    if (!samples.length) throw new Error(text.noFiles);
    if (samples.length > 60 || samples.reduce((sum, file) => sum + file.size, 0) > customMaxTotal) {
      throw new Error(text.limits);
    }
    setStatus(text.loading);
    const audio = new AudioContext();
    const results: boolean[] = [];
    try {
      for (const file of samples) {
        try {
          if (!file.size || file.size > customMaxFile) { results.push(false); continue; }
          const data = await file.arrayBuffer();
          if (!hasCustomAudioSignature(file.name, data)) { results.push(false); continue; }
          const decoded = await audio.decodeAudioData(data);
          results.push(decoded.length > 0 && decoded.duration <= 60 && decoded.numberOfChannels <= 2);
        } catch { results.push(false); }
      }
    } finally { await audio.close().catch(() => {}); }
    setFiles(samples);
    setValid(results);
    autoMap(samples);
    setStatus("");
  }

  function save() {
    if (!mapped || !canSave) return;
    void run(async () => {
      stopAudition();
      const result = await importCustomInstrument(name.trim(), articulation, mapped);
      onChange([...instruments, result]);
      setName("");
      setFiles([]);
      setAssignments([]);
      setConflicts([]);
      setValid([]);
      setStatus(text.imported);
    });
  }

  return (
    <>
      <Dialog.Root open onOpenChange={open => { if (!open && !busyRef.current) onClose(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="library-dialog-backdrop">
            <Dialog.Content className="library-create-playlist-dialog custom-instrument-dialog" aria-describedby={undefined}>
              <div className="library-collect-dialog-header custom-instrument-header">
                <Dialog.Title asChild><h3>{text.manage}</h3></Dialog.Title>
                <Dialog.Close asChild>
                  <button className="update-dialog-close" type="button" disabled={busy} aria-label={text.close}>
                    <X aria-hidden="true" focusable="false" />
                  </button>
                </Dialog.Close>
              </div>
              <div className="custom-instrument-body">
              {!isTauri() ? <p>{text.unavailable}</p> : <>
                {catalogError && <p role="alert">{text.unavailableList} {catalogError}</p>}
                {instruments.length > 0 && <ul className="custom-instrument-list">
                  {instruments.map(item => <li key={item.id}>
                    {editing?.id === item.id ? <form onSubmit={event => {
                      event.preventDefault();
                      void run(async () => {
                        const updated = await renameCustomInstrument(item.id, rename.trim());
                        onChange(instruments.map(entry => entry.id === updated.id ? updated : entry));
                        setEditing(null);
                      });
                    }}>
                      <label className="library-create-playlist-field">
                        <span className="visually-hidden">{text.name}</span>
                        <input value={rename} maxLength={80} onChange={event => setRename(event.target.value)} />
                      </label>
                      <button className="confirm-dialog-primary" disabled={busy || !rename.trim()}>{text.save}</button>
                      <button className="confirm-dialog-secondary" type="button" onClick={() => setEditing(null)}>{text.cancel}</button>
                    </form> : <>
                      <span title={item.name}><strong>{item.name}</strong><small>{text[item.articulation]}</small></span>
                      <button className="language-option" type="button" disabled={busy} onClick={() => void run(async () => {
                        const updated = await setCustomInstrumentDisabled(item.id, !item.disabled);
                        onChange(instruments.map(entry => entry.id === updated.id ? updated : entry));
                      })}>{item.disabled ? text.enable : text.disable}</button>
                      <button className="language-option" type="button" disabled={busy} onClick={() => { setEditing(item); setRename(item.name); }}>{text.rename}</button>
                      <button className="language-option" type="button" disabled={busy} onClick={() => setDeleting(item)}>{text.delete}</button>
                    </>}
                  </li>)}
                </ul>}
                <form className="custom-instrument-form" onSubmit={event => { event.preventDefault(); save(); }}>
                  <h4><AudioLines size={17} aria-hidden="true" />{text.import}</h4>
                  <label className="library-create-playlist-field">
                    <span>{text.name}</span>
                    <input value={name} maxLength={80} required onChange={event => setName(event.target.value)} />
                  </label>
                  <label className="library-create-playlist-field">
                    <span>{text.articulation}</span>
                    <InstrumentChoice label={text.articulation} value={articulation} disabled={busy}
                      options={[
                        { value: "naturalDecay", label: text.naturalDecay },
                        { value: "sustained", label: text.sustained },
                      ]}
                      onChange={value => setArticulation(value === "sustained" ? "sustained" : "naturalDecay")} />
                  </label>
                  <div className="custom-instrument-drop"
                    onDragOver={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = busy ? "none" : "copy";
                    }}
                    onDrop={event => {
                      event.preventDefault();
                      event.stopPropagation();
                      const transfer = event.dataTransfer;
                      void run(async () => loadSamples(await droppedSamples(transfer)));
                    }}>
                    <div className="custom-instrument-pickers">
                      <button type="button" className="library-import-button" disabled={busy}
                        onClick={() => void run(async () => {
                          const samples = await chooseCustomInstrumentFolder(text.folder);
                          if (samples) await loadSamples(samples);
                        })}>
                        <FolderOpen size={16} aria-hidden="true" />{text.folder}
                      </button>
                      <label className={`library-import-button${busy ? " is-disabled" : ""}`}>
                        <FileAudio size={16} aria-hidden="true" />{text.files}
                        <input aria-label={text.files} type="file" multiple accept=".mp3,.wav" disabled={busy} onChange={event => {
                          const files = Array.from(event.currentTarget.files ?? []);
                          event.currentTarget.value = "";
                          if (files.length) void run(() => loadSamples(files));
                        }} />
                      </label>
                      <button className="language-option" type="button" disabled={busy || !files.length} onClick={() => autoMap(files)}>{text.auto}</button>
                      {([
                        ["naming", customInstrumentNamingPrompt, text.copyPrompt, text.promptCopied],
                        ["search", createCustomInstrumentSearchPrompt(name), text.copySearchPrompt, text.searchPromptCopied],
                      ] as const).map(([kind, prompt, label, feedback]) => {
                        const Icon = copiedPrompt === kind ? Check : Copy;
                        return <button key={kind} type="button" className="library-import-button custom-instrument-copy-prompt" disabled={busy}
                          onClick={() => void run(async () => {
                            setCopiedPrompt(null);
                            await navigator.clipboard.writeText(prompt);
                            setCopiedPrompt(kind);
                          })}>
                          <Icon size={16} aria-hidden="true" />
                          {label}
                          <span className="visually-hidden" role="status">{copiedPrompt === kind ? feedback : ""}</span>
                        </button>;
                      })}
                    </div>
                    <p className="experimental-setting-description">{text.drop}</p>
                  </div>
                  <p className="experimental-setting-description">{text.folderHint} {text.format} {text.limits}</p>
                  {files.length > 0 && <div className="custom-instrument-mapping">
                    {skyKeyNames.map((key, index) => {
                      const assignment = assignments[index];
                      const assigned = assignment != null && valid[assignment];
                      const label = key + " · " + customSamplePitches[index];
                      const state = assignment != null ? (assigned ? text.mapped : text.invalid)
                        : conflicts[index] ? text.conflict : text.missing;
                      return <div className="custom-instrument-row" key={key}>
                        <label htmlFor={"custom-sample-" + key}>{label}</label>
                        <InstrumentChoice id={"custom-sample-" + key} label={label}
                          disabled={busy} value={assignment == null ? "" : String(assignment)}
                          options={[
                            { value: "", label: conflicts[index] ? text.conflict : text.missing },
                            ...files.map((file, i) => ({
                              value: String(i),
                              label: (file.webkitRelativePath || file.name) + (valid[i] ? "" : " · " + text.invalid),
                            })),
                          ]}
                          onChange={value => {
                            setAssignments(skyKeyNames.map((_, i) => i === index ? (value === "" ? null : Number(value)) : assignments[i] ?? null));
                            setConflicts(skyKeyNames.map((_, i) => i !== index && !!conflicts[i]));
                          }} />
                        <span className="custom-instrument-status" data-mapped={assigned}>{state}</span>
                        <button className="player-icon-button player-icon-button-secondary" type="button" disabled={busy || !assigned || !audible} aria-label={text.play + " " + label}
                          title={audible ? text.play : text.muted} onClick={() => {
                            if (assignment != null) void audition(files[assignment]).catch(reason => setError(String(reason)));
                          }}><Play size={15} aria-hidden="true" /></button>
                      </div>;
                    })}
                  </div>}
                  {files.length > 0 && <p className="experimental-setting-description">{text.complete} {!audible && text.muted}</p>}
                  {error && <p className="parse-error" role="alert">{text.failed}: {error}</p>}
                  {status && <p className="experimental-setting-description" role="status">{status}</p>}
                  <div className="confirm-dialog-actions">
                    <Dialog.Close asChild><button className="confirm-dialog-secondary" type="button" disabled={busy}>{text.cancel}</button></Dialog.Close>
                    <button className="confirm-dialog-primary" disabled={busy || !canSave}>{text.save}</button>
                  </div>
                </form>
              </>}
              </div>
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Portal>
      </Dialog.Root>
      <ConfirmDialog open={deleting !== null} title={text.delete} description={text.deleteConfirm}
        confirmLabel={text.delete} cancelLabel={text.cancel} variant="danger" isConfirming={busy}
        onCancel={() => setDeleting(null)} onConfirm={() => {
          if (!deleting) return;
          void run(async () => {
            try {
              await deleteCustomInstrument(deleting.id);
              onChange(instruments.filter(item => item.id !== deleting.id));
            } finally { setDeleting(null); }
          });
        }} />
    </>
  );
}
