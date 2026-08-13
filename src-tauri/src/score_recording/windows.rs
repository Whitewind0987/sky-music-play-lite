use super::{
    NativeScoreRecordingEventPayload, ScoreRecordingEventType, ScoreRecordingStartRequest,
    SCORE_RECORDING_EVENT,
};
use std::collections::{HashMap, HashSet};
use std::ptr::null_mut;
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::GetCurrentThreadId;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    VkKeyScanW, VK_LSHIFT, VK_RSHIFT, VK_SHIFT, VK_SPACE,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetForegroundWindow, GetMessageW, PeekMessageW,
    PostThreadMessageW, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, KBDLLHOOKSTRUCT,
    LLKHF_EXTENDED, LLKHF_INJECTED, MSG, PM_NOREMOVE, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP,
    WM_QUIT, WM_SYSKEYDOWN, WM_SYSKEYUP,
};

const WORKER_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
enum ShiftRequirement {
    Any,
    Exact(bool),
}

#[derive(Clone, Debug)]
struct NativeBinding {
    configured_key: String,
    virtual_key: u16,
    shift: ShiftRequirement,
}

#[derive(Clone, Debug, Default)]
struct BindingSet {
    by_trigger: HashMap<(u16, ShiftRequirement), String>,
}

impl BindingSet {
    fn resolve(&self, virtual_key: u16, shift_pressed: bool) -> Option<&str> {
        self.by_trigger
            .get(&(virtual_key, ShiftRequirement::Exact(shift_pressed)))
            .or_else(|| self.by_trigger.get(&(virtual_key, ShiftRequirement::Any)))
            .map(String::as_str)
    }

    fn insert(&mut self, binding: NativeBinding) -> Result<(), String> {
        let conflicts = match binding.shift {
            ShiftRequirement::Any => [
                ShiftRequirement::Any,
                ShiftRequirement::Exact(false),
                ShiftRequirement::Exact(true),
            ]
            .as_slice(),
            ShiftRequirement::Exact(value) => {
                if value {
                    [ShiftRequirement::Any, ShiftRequirement::Exact(true)].as_slice()
                } else {
                    [ShiftRequirement::Any, ShiftRequirement::Exact(false)].as_slice()
                }
            }
        };

        if let Some(existing) = conflicts.iter().find_map(|shift| {
            self.by_trigger
                .get(&(binding.virtual_key, *shift))
                .filter(|existing| *existing != &binding.configured_key)
        }) {
            return Err(format!(
                "Recording keys are natively ambiguous: {:?} and {:?} resolve to the same trigger.",
                existing, binding.configured_key
            ));
        }

        self.by_trigger
            .insert((binding.virtual_key, binding.shift), binding.configured_key);
        Ok(())
    }
}

fn normalize_binding_key(key: &str) -> &str {
    if key == " " {
        key
    } else {
        key.trim()
    }
}

fn resolve_native_bindings(keys: &[String]) -> Result<BindingSet, String> {
    resolve_native_bindings_with(keys, |character| {
        if (character as u32) > u16::MAX as u32 {
            return None;
        }
        let result = unsafe { VkKeyScanW(character as u16) };
        (result != -1).then_some(((result as u16) & 0xff, ((result as u16) >> 8) as u8))
    })
}

fn resolve_native_bindings_with<F>(
    keys: &[String],
    mut resolve_character: F,
) -> Result<BindingSet, String>
where
    F: FnMut(char) -> Option<(u16, u8)>,
{
    let mut seen_configured_keys = HashSet::new();
    let mut bindings = BindingSet::default();

    for configured_key in keys {
        if !seen_configured_keys.insert(configured_key.clone()) {
            continue;
        }

        let normalized = normalize_binding_key(configured_key);
        if normalized.is_empty() {
            return Err(format!(
                "Unsupported score-recording key mapping: {:?}.",
                configured_key
            ));
        }

        let binding = if normalized == " " {
            NativeBinding {
                configured_key: configured_key.clone(),
                virtual_key: VK_SPACE,
                shift: ShiftRequirement::Any,
            }
        } else if normalized.len() == 1 {
            let character = normalized.chars().next().expect("one-character key");
            if character.is_ascii_alphabetic() {
                NativeBinding {
                    configured_key: configured_key.clone(),
                    virtual_key: character.to_ascii_uppercase() as u16,
                    shift: ShiftRequirement::Any,
                }
            } else {
                let (virtual_key, modifiers) = resolve_character(character).ok_or_else(|| {
                    format!(
                        "Unsupported score-recording key mapping: {:?}.",
                        configured_key
                    )
                })?;
                if modifiers & !1 != 0 {
                    return Err(format!(
                        "Score-recording key mapping {:?} requires Ctrl, Alt, or unsupported modifiers.",
                        configured_key
                    ));
                }
                NativeBinding {
                    configured_key: configured_key.clone(),
                    virtual_key,
                    shift: ShiftRequirement::Exact(modifiers & 1 != 0),
                }
            }
        } else {
            let virtual_key = crate::experimental_input::mapped_key_to_virtual_key(normalized)
                .ok_or_else(|| {
                    format!(
                        "Unsupported score-recording key mapping: {:?}.",
                        configured_key
                    )
                })?;
            NativeBinding {
                configured_key: configured_key.clone(),
                virtual_key,
                shift: ShiftRequirement::Any,
            }
        };

        bindings.insert(binding)?;
    }

    if bindings.by_trigger.is_empty() {
        return Err("At least one supported score-recording key is required.".to_string());
    }

    Ok(bindings)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
struct PhysicalKey {
    virtual_key: u16,
    scan_code: u32,
    extended: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PhysicalKeyAction {
    Keydown,
    Keyup,
}

#[derive(Clone, Copy, Debug)]
struct HookInput {
    action: PhysicalKeyAction,
    injected: bool,
    physical_key: PhysicalKey,
}

#[derive(Debug, Default)]
struct HookDecisionState {
    accepting: bool,
    pressed_shift_keys: HashSet<PhysicalKey>,
    active_presses: HashMap<PhysicalKey, String>,
}

impl HookDecisionState {
    fn new() -> Self {
        Self {
            accepting: true,
            ..Self::default()
        }
    }

    fn stop_accepting(&mut self) {
        self.accepting = false;
    }

    fn handle<F>(
        &mut self,
        input: HookInput,
        bindings: &BindingSet,
        is_target_foreground: F,
    ) -> Option<(ScoreRecordingEventType, String)>
    where
        F: FnOnce() -> bool,
    {
        if !self.accepting || input.injected {
            return None;
        }

        if is_shift_key(input.physical_key.virtual_key) {
            match input.action {
                PhysicalKeyAction::Keydown => {
                    self.pressed_shift_keys.insert(input.physical_key);
                }
                PhysicalKeyAction::Keyup => {
                    self.pressed_shift_keys.remove(&input.physical_key);
                }
            }
            return None;
        }

        if input.action == PhysicalKeyAction::Keyup {
            return self
                .active_presses
                .remove(&input.physical_key)
                .map(|key| (ScoreRecordingEventType::Keyup, key));
        }

        if self.active_presses.contains_key(&input.physical_key) {
            return None;
        }

        let configured_key = bindings.resolve(
            input.physical_key.virtual_key,
            !self.pressed_shift_keys.is_empty(),
        )?;
        if !is_target_foreground() {
            return None;
        }

        self.active_presses
            .insert(input.physical_key, configured_key.to_string());
        Some((ScoreRecordingEventType::Keydown, configured_key.to_string()))
    }
}

fn is_shift_key(virtual_key: u16) -> bool {
    [VK_SHIFT, VK_LSHIFT, VK_RSHIFT].contains(&virtual_key)
}

struct HookContext {
    session_id: u64,
    target_hwnd: usize,
    started_at: Instant,
    bindings: BindingSet,
    decision_state: Mutex<HookDecisionState>,
    events: mpsc::Sender<NativeScoreRecordingEventPayload>,
}

impl HookContext {
    fn stop_accepting(&self) {
        if let Ok(mut state) = self.decision_state.lock() {
            state.stop_accepting();
        }
    }
}

static HOOK_CONTEXT: OnceLock<Mutex<Option<Arc<HookContext>>>> = OnceLock::new();

fn hook_context_slot() -> &'static Mutex<Option<Arc<HookContext>>> {
    HOOK_CONTEXT.get_or_init(|| Mutex::new(None))
}

unsafe extern "system" fn low_level_keyboard_hook(
    code: i32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    if code < 0 {
        return unsafe { CallNextHookEx(null_mut(), code, wparam, lparam) };
    }

    let action = match wparam as u32 {
        WM_KEYDOWN | WM_SYSKEYDOWN => Some(PhysicalKeyAction::Keydown),
        WM_KEYUP | WM_SYSKEYUP => Some(PhysicalKeyAction::Keyup),
        _ => None,
    };

    if let Some(action) = action {
        if lparam != 0 {
            let native = unsafe { &*(lparam as *const KBDLLHOOKSTRUCT) };
            let context = hook_context_slot()
                .lock()
                .ok()
                .and_then(|slot| slot.clone());

            if let Some(context) = context {
                let input = HookInput {
                    action,
                    injected: native.flags & LLKHF_INJECTED != 0,
                    physical_key: PhysicalKey {
                        virtual_key: native.vkCode as u16,
                        scan_code: native.scanCode,
                        extended: native.flags & LLKHF_EXTENDED != 0,
                    },
                };
                let decision = context.decision_state.lock().ok().and_then(|mut state| {
                    state.handle(input, &context.bindings, || {
                        (unsafe { GetForegroundWindow() as usize }) == context.target_hwnd
                    })
                });

                if let Some((event_type, key)) = decision {
                    let _ = context.events.send(NativeScoreRecordingEventPayload {
                        session_id: context.session_id,
                        event_type,
                        key,
                        time_ms: context.started_at.elapsed().as_millis() as u64,
                    });
                }
            }
        }
    }

    unsafe { CallNextHookEx(null_mut(), code, wparam, lparam) }
}

struct Worker {
    done: mpsc::Receiver<Result<(), String>>,
    join: Option<JoinHandle<()>>,
}

impl Worker {
    fn wait(&mut self, name: &str) -> Result<(), String> {
        let result = self
            .done
            .recv_timeout(WORKER_SHUTDOWN_TIMEOUT)
            .map_err(|_| {
                format!("Timed out waiting for the score-recording {name} worker to stop.")
            })?;
        let join = self
            .join
            .take()
            .ok_or_else(|| format!("Score-recording {name} worker was already joined."))?;
        join.join()
            .map_err(|_| format!("Score-recording {name} worker panicked during shutdown."))?;
        result
    }
}

struct Runtime {
    session_id: u64,
    hook_thread_id: u32,
    context: Option<Arc<HookContext>>,
    hook_worker: Option<Worker>,
    emitter_worker: Option<Worker>,
}

impl Runtime {
    fn shutdown(&mut self) -> Result<(), String> {
        if let Some(context) = self.context.as_ref() {
            context.stop_accepting();
        }

        let post_error = (self.hook_worker.is_some()
            && unsafe { PostThreadMessageW(self.hook_thread_id, WM_QUIT, 0, 0) } == 0)
            .then(|| {
                format!(
                    "Failed to wake score-recording hook thread: {}",
                    std::io::Error::last_os_error()
                )
            });

        let mut errors = Vec::new();
        if let Some(worker) = self.hook_worker.as_mut() {
            match worker.wait("hook") {
                Ok(()) => self.hook_worker = None,
                Err(error) => {
                    errors.push(error);
                    if worker.join.is_some() {
                        return Err(errors.join(" "));
                    }
                    self.hook_worker = None;
                }
            }
        }

        self.context.take();

        if let Some(worker) = self.emitter_worker.as_mut() {
            match worker.wait("emitter") {
                Ok(()) => self.emitter_worker = None,
                Err(error) => {
                    errors.push(error);
                    if worker.join.is_some() {
                        return Err(errors.join(" "));
                    }
                    self.emitter_worker = None;
                }
            }
        }

        if let Some(error) = post_error {
            errors.push(error);
        }

        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.join(" "))
        }
    }

    fn is_clean(&self) -> bool {
        self.context.is_none() && self.hook_worker.is_none() && self.emitter_worker.is_none()
    }
}

static RUNTIME: OnceLock<Mutex<Option<Runtime>>> = OnceLock::new();

fn runtime_slot() -> &'static Mutex<Option<Runtime>> {
    RUNTIME.get_or_init(|| Mutex::new(None))
}

pub fn start_score_recording(
    app: AppHandle,
    request: ScoreRecordingStartRequest,
) -> Result<(), String> {
    let target_hwnd =
        crate::experimental_input::validate_monitored_sky_target(&request.target_hwnd)?;
    let bindings = resolve_native_bindings(&request.keys)?;
    let mut slot = runtime_slot()
        .lock()
        .map_err(|_| "Score-recording runtime lock is poisoned.".to_string())?;
    if slot.is_some() {
        return Err("A native score-recording session is already active.".to_string());
    }

    let (event_sender, event_receiver) = mpsc::channel();
    let emitter_worker = spawn_emitter_worker(app, event_receiver)?;
    let context = Arc::new(HookContext {
        session_id: request.session_id,
        target_hwnd,
        started_at: Instant::now(),
        bindings,
        decision_state: Mutex::new(HookDecisionState::new()),
        events: event_sender,
    });

    let (startup_sender, startup_receiver) = mpsc::channel();
    let (done_sender, done) = mpsc::channel();
    let hook_context = context.clone();
    let hook_join = match thread::Builder::new()
        .name("score-recording-hook".into())
        .spawn(move || {
            let result = run_hook_thread(hook_context, startup_sender);
            let _ = done_sender.send(result);
        }) {
        Ok(join) => join,
        Err(error) => {
            drop(context);
            let mut emitter_worker = emitter_worker;
            let _ = emitter_worker.wait("emitter");
            return Err(format!(
                "Failed to spawn score-recording hook thread: {error}"
            ));
        }
    };
    let mut hook_worker = Worker {
        done,
        join: Some(hook_join),
    };

    let hook_thread_id = match startup_receiver.recv() {
        Ok(Ok(thread_id)) => thread_id,
        Ok(Err(error)) => {
            let _ = hook_worker.wait("hook");
            drop(context);
            let mut emitter_worker = emitter_worker;
            let _ = emitter_worker.wait("emitter");
            return Err(error);
        }
        Err(_) => {
            let _ = hook_worker.wait("hook");
            drop(context);
            let mut emitter_worker = emitter_worker;
            let _ = emitter_worker.wait("emitter");
            return Err("Score-recording hook startup handshake failed.".to_string());
        }
    };

    *slot = Some(Runtime {
        session_id: request.session_id,
        hook_thread_id,
        context: Some(context),
        hook_worker: Some(hook_worker),
        emitter_worker: Some(emitter_worker),
    });
    Ok(())
}

pub fn stop_score_recording(session_id: u64) -> Result<(), String> {
    stop_matching_session(session_id)
}

pub fn cancel_score_recording(session_id: u64) -> Result<(), String> {
    stop_matching_session(session_id)
}

fn stop_matching_session(session_id: u64) -> Result<(), String> {
    let mut slot = runtime_slot()
        .lock()
        .map_err(|_| "Score-recording runtime lock is poisoned.".to_string())?;
    let runtime = slot
        .as_mut()
        .ok_or_else(|| "No native score-recording session is active.".to_string())?;
    ensure_session_matches(runtime.session_id, session_id)?;
    let result = runtime.shutdown();
    if runtime.is_clean() {
        *slot = None;
    }
    result
}

fn ensure_session_matches(active_session_id: u64, requested_session_id: u64) -> Result<(), String> {
    if active_session_id == requested_session_id {
        Ok(())
    } else {
        Err(format!(
            "Score-recording session mismatch: active session is {active_session_id}, requested session is {requested_session_id}."
        ))
    }
}

pub fn stop_score_recording_for_shutdown() -> Result<(), String> {
    let mut slot = runtime_slot()
        .lock()
        .map_err(|_| "Score-recording runtime lock is poisoned.".to_string())?;
    let Some(runtime) = slot.as_mut() else {
        return Ok(());
    };
    let result = runtime.shutdown();
    if runtime.is_clean() {
        *slot = None;
    }
    result
}

fn spawn_emitter_worker(
    app: AppHandle,
    receiver: mpsc::Receiver<NativeScoreRecordingEventPayload>,
) -> Result<Worker, String> {
    let (done_sender, done) = mpsc::channel();
    let join = thread::Builder::new()
        .name("score-recording-emitter".into())
        .spawn(move || {
            let mut first_error = None;
            while let Ok(event) = receiver.recv() {
                if let Err(error) = app.emit(SCORE_RECORDING_EVENT, event) {
                    if first_error.is_none() {
                        first_error =
                            Some(format!("Failed to emit score-recording event: {error}"));
                    }
                }
            }
            let _ = done_sender.send(first_error.map_or(Ok(()), Err));
        })
        .map_err(|error| format!("Failed to spawn score-recording emitter: {error}"))?;
    Ok(Worker {
        done,
        join: Some(join),
    })
}

fn run_hook_thread(
    context: Arc<HookContext>,
    startup: mpsc::Sender<Result<u32, String>>,
) -> Result<(), String> {
    let thread_id = unsafe { GetCurrentThreadId() };
    let mut message: MSG = unsafe { std::mem::zeroed() };
    unsafe {
        PeekMessageW(&mut message, null_mut(), 0, 0, PM_NOREMOVE);
    }

    {
        let mut slot = hook_context_slot()
            .lock()
            .map_err(|_| "Score-recording hook context lock is poisoned.".to_string())?;
        if slot.is_some() {
            let error = "A score-recording hook context is already installed.".to_string();
            let _ = startup.send(Err(error.clone()));
            return Err(error);
        }
        *slot = Some(context.clone());
    }

    let module = unsafe { GetModuleHandleW(std::ptr::null()) };
    if module.is_null() {
        clear_hook_context(&context);
        let error = format!(
            "Failed to resolve the application module for score recording: {}",
            std::io::Error::last_os_error()
        );
        let _ = startup.send(Err(error.clone()));
        return Err(error);
    }

    let hook =
        unsafe { SetWindowsHookExW(WH_KEYBOARD_LL, Some(low_level_keyboard_hook), module, 0) };
    if hook.is_null() {
        clear_hook_context(&context);
        let error = format!(
            "Failed to install the low-level score-recording keyboard hook: {}",
            std::io::Error::last_os_error()
        );
        let _ = startup.send(Err(error.clone()));
        return Err(error);
    }

    if startup.send(Ok(thread_id)).is_err() {
        let _ = unsafe { UnhookWindowsHookEx(hook) };
        clear_hook_context(&context);
        return Err("Score-recording startup receiver was dropped.".to_string());
    }

    let loop_result = loop {
        let result = unsafe { GetMessageW(&mut message, null_mut(), 0, 0) };
        if result == -1 {
            break Err(format!(
                "Score-recording message loop failed: {}",
                std::io::Error::last_os_error()
            ));
        }
        if result == 0 {
            break Ok(());
        }
        unsafe {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
    };

    context.stop_accepting();
    let unhook_result = (unsafe { UnhookWindowsHookEx(hook) } != 0)
        .then_some(())
        .ok_or_else(|| {
            format!(
                "Failed to uninstall the score-recording keyboard hook: {}",
                std::io::Error::last_os_error()
            )
        });
    clear_hook_context(&context);
    loop_result.and(unhook_result)
}

fn clear_hook_context(context: &Arc<HookContext>) {
    if let Ok(mut slot) = hook_context_slot().lock() {
        if slot
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, context))
        {
            *slot = None;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(virtual_key: u16, scan_code: u32) -> PhysicalKey {
        PhysicalKey {
            virtual_key,
            scan_code,
            extended: false,
        }
    }

    fn input(action: PhysicalKeyAction, physical_key: PhysicalKey) -> HookInput {
        HookInput {
            action,
            injected: false,
            physical_key,
        }
    }

    fn test_resolver(character: char) -> Option<(u16, u8)> {
        match character {
            ';' => Some((0xBA, 0)),
            ':' => Some((0xBA, 1)),
            '1' => Some((0x31, 0)),
            '!' => Some((0x31, 1)),
            '@' => Some((0x32, 2)),
            _ => None,
        }
    }

    fn bindings(keys: &[&str]) -> BindingSet {
        resolve_native_bindings_with(
            &keys.iter().map(|key| key.to_string()).collect::<Vec<_>>(),
            test_resolver,
        )
        .unwrap()
    }

    #[test]
    fn score_recording_ascii_letters_are_shift_independent() {
        let bindings = bindings(&["a"]);
        assert_eq!(bindings.resolve(b'A' as u16, false), Some("a"));
        assert_eq!(bindings.resolve(b'A' as u16, true), Some("a"));
    }

    #[test]
    fn score_recording_literal_space_resolves() {
        assert_eq!(bindings(&[" "]).resolve(VK_SPACE, false), Some(" "));
    }

    #[test]
    fn score_recording_shift_sensitive_punctuation_stays_distinct() {
        let bindings = bindings(&[";", ":"]);
        assert_eq!(bindings.resolve(0xBA, false), Some(";"));
        assert_eq!(bindings.resolve(0xBA, true), Some(":"));
    }

    #[test]
    fn score_recording_named_key_uses_existing_mapping_knowledge() {
        let bindings = bindings(&["ArrowLeft"]);
        assert_eq!(
            bindings.resolve(
                crate::experimental_input::mapped_key_to_virtual_key("ArrowLeft").unwrap(),
                false
            ),
            Some("ArrowLeft")
        );
    }

    #[test]
    fn score_recording_unsupported_and_ctrl_modified_keys_are_rejected() {
        assert!(resolve_native_bindings_with(&["Unknown".into()], test_resolver).is_err());
        assert!(resolve_native_bindings_with(&["@".into()], test_resolver).is_err());
    }

    #[test]
    fn score_recording_native_ambiguity_is_rejected_but_exact_duplicates_are_deduped() {
        assert!(resolve_native_bindings_with(&["a".into(), "A".into()], test_resolver).is_err());
        assert!(resolve_native_bindings_with(&["a".into(), "a".into()], test_resolver).is_ok());
    }

    #[test]
    fn score_recording_injected_input_is_rejected_without_state_changes() {
        let bindings = bindings(&["a"]);
        let mut state = HookDecisionState::new();
        let mut injected = input(PhysicalKeyAction::Keydown, key(b'A' as u16, 30));
        injected.injected = true;
        assert_eq!(state.handle(injected, &bindings, || true), None);
        assert!(state.active_presses.is_empty());
    }

    #[test]
    fn score_recording_keydown_requires_target_foreground() {
        let bindings = bindings(&["a"]);
        let mut state = HookDecisionState::new();
        assert_eq!(
            state.handle(
                input(PhysicalKeyAction::Keydown, key(b'A' as u16, 30)),
                &bindings,
                || false
            ),
            None
        );
        assert!(state.active_presses.is_empty());
    }

    #[test]
    fn score_recording_accepted_press_repeats_once_and_releases_outside_sky() {
        let bindings = bindings(&["a"]);
        let physical = key(b'A' as u16, 30);
        let mut state = HookDecisionState::new();
        assert_eq!(
            state.handle(
                input(PhysicalKeyAction::Keydown, physical),
                &bindings,
                || true
            ),
            Some((ScoreRecordingEventType::Keydown, "a".into()))
        );
        assert!(state.active_presses.contains_key(&physical));
        assert_eq!(
            state.handle(
                input(PhysicalKeyAction::Keydown, physical),
                &bindings,
                || panic!("repeat must not recheck foreground")
            ),
            None
        );
        assert_eq!(
            state.handle(
                input(PhysicalKeyAction::Keyup, physical),
                &bindings,
                || panic!("keyup must not check foreground")
            ),
            Some((ScoreRecordingEventType::Keyup, "a".into()))
        );
    }

    #[test]
    fn score_recording_unrelated_keyup_is_ignored() {
        let bindings = bindings(&["a"]);
        let mut state = HookDecisionState::new();
        assert_eq!(
            state.handle(
                input(PhysicalKeyAction::Keyup, key(b'A' as u16, 30)),
                &bindings,
                || true
            ),
            None
        );
    }

    #[test]
    fn score_recording_shift_release_preserves_punctuation_keyup_identity() {
        let bindings = bindings(&[":"]);
        let shift = key(VK_LSHIFT, 42);
        let punctuation = key(0xBA, 39);
        let mut state = HookDecisionState::new();
        state.handle(input(PhysicalKeyAction::Keydown, shift), &bindings, || true);
        assert_eq!(
            state.handle(
                input(PhysicalKeyAction::Keydown, punctuation),
                &bindings,
                || true
            ),
            Some((ScoreRecordingEventType::Keydown, ":".into()))
        );
        state.handle(input(PhysicalKeyAction::Keyup, shift), &bindings, || false);
        assert_eq!(
            state.handle(
                input(PhysicalKeyAction::Keyup, punctuation),
                &bindings,
                || false
            ),
            Some((ScoreRecordingEventType::Keyup, ":".into()))
        );
    }

    #[test]
    fn score_recording_wrong_session_does_not_match_active_session() {
        assert!(ensure_session_matches(2, 1).is_err());
        assert!(ensure_session_matches(2, 2).is_ok());
    }

    #[test]
    fn score_recording_stopped_state_prevents_later_delivery() {
        let bindings = bindings(&["a"]);
        let mut state = HookDecisionState::new();
        state.stop_accepting();
        assert_eq!(
            state.handle(
                input(PhysicalKeyAction::Keydown, key(b'A' as u16, 30)),
                &bindings,
                || true
            ),
            None
        );
    }

    #[test]
    fn score_recording_decisions_preserve_input_order() {
        let bindings = bindings(&["a", "1"]);
        let mut state = HookDecisionState::new();
        let events = [
            input(PhysicalKeyAction::Keydown, key(b'A' as u16, 30)),
            input(PhysicalKeyAction::Keydown, key(b'1' as u16, 2)),
            input(PhysicalKeyAction::Keyup, key(b'A' as u16, 30)),
        ]
        .into_iter()
        .filter_map(|event| state.handle(event, &bindings, || true))
        .collect::<Vec<_>>();
        assert_eq!(
            events,
            vec![
                (ScoreRecordingEventType::Keydown, "a".into()),
                (ScoreRecordingEventType::Keydown, "1".into()),
                (ScoreRecordingEventType::Keyup, "a".into()),
            ]
        );
    }
}
