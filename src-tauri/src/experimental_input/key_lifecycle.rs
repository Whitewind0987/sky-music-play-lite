use super::playback_engine::PlaybackOutput;
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq)]
struct ScheduledKeyUp {
    deadline_at: Instant,
    generation: u64,
    key: String,
}

pub(crate) struct KeyLifecycle {
    active_generations: HashMap<String, u64>,
    next_generation: u64,
    scheduled_key_ups: Vec<ScheduledKeyUp>,
}

impl KeyLifecycle {
    pub(crate) fn new() -> Self {
        Self {
            active_generations: HashMap::new(),
            next_generation: 1,
            scheduled_key_ups: Vec::new(),
        }
    }

    pub(crate) fn trigger_group<AfterKeyDown>(
        &mut self,
        keys: &[(String, f64)],
        output: &PlaybackOutput,
        after_key_down: AfterKeyDown,
    ) -> Result<(), String>
    where
        AfterKeyDown: FnOnce(),
    {
        self.trigger_group_with(
            keys,
            |keys| output.send_key_up_group(keys),
            |keys| output.send_key_down_group(keys),
            after_key_down,
            Instant::now,
        )
    }

    pub(crate) fn release_due_key_ups(
        &mut self,
        now: Instant,
        output: &PlaybackOutput,
    ) -> Result<(), String> {
        self.release_due_key_ups_with(now, |keys| output.send_key_up_group(keys))
    }

    pub(crate) fn release_all_active_keys(&mut self, output: &PlaybackOutput) {
        self.release_all_active_keys_with(|keys| output.send_key_up_group(keys));
    }

    pub(crate) fn next_live_key_up_deadline(&self, now: Instant) -> Option<Instant> {
        self.scheduled_key_ups
            .iter()
            .filter(|key_up| self.is_live_scheduled_key_up(key_up) && key_up.deadline_at > now)
            .map(|key_up| key_up.deadline_at)
            .min()
    }

    pub(crate) fn has_live_future_key_ups(&self, now: Instant) -> bool {
        self.next_live_key_up_deadline(now).is_some()
    }

    #[cfg(test)]
    fn has_live_active_keys(&self) -> bool {
        !self.active_generations.is_empty()
    }

    #[cfg(test)]
    pub(crate) fn seed_scheduled_key_up_for_test(
        &mut self,
        key: &str,
        active_generation: u64,
        scheduled_generation: u64,
        deadline_at: Instant,
    ) {
        self.active_generations
            .insert(key.to_string(), active_generation);
        self.scheduled_key_ups.push(ScheduledKeyUp {
            deadline_at,
            generation: scheduled_generation,
            key: key.to_string(),
        });
    }

    fn trigger_group_with<SendKeyUp, SendKeyDown, AfterKeyDown, Now>(
        &mut self,
        keys: &[(String, f64)],
        mut send_key_up_group: SendKeyUp,
        mut send_key_down_group: SendKeyDown,
        after_key_down: AfterKeyDown,
        mut now: Now,
    ) -> Result<(), String>
    where
        SendKeyUp: FnMut(&[String]) -> Result<(), String>,
        SendKeyDown: FnMut(&[String]) -> Result<(), String>,
        AfterKeyDown: FnOnce(),
        Now: FnMut() -> Instant,
    {
        let key_names = keys.iter().map(|(key, _)| key.clone()).collect::<Vec<_>>();
        let keys_to_release = key_names
            .iter()
            .filter(|key| self.active_generations.contains_key(*key))
            .cloned()
            .collect::<Vec<_>>();

        if !keys_to_release.is_empty() {
            send_key_up_group(&keys_to_release)?;
            for key in keys_to_release {
                self.active_generations.remove(&key);
            }
        }

        if let Err(error) = send_key_down_group(&key_names) {
            let _ = send_key_up_group(&key_names);
            return Err(error);
        }
        after_key_down();

        for (key, hold_ms) in keys {
            let generation = self.next_generation;
            self.next_generation = self.next_generation.saturating_add(1).max(1);
            self.active_generations.insert(key.clone(), generation);
            self.scheduled_key_ups.push(ScheduledKeyUp {
                deadline_at: key_up_deadline_from_actual_send(now(), *hold_ms)?,
                generation,
                key: key.clone(),
            });
        }

        Ok(())
    }

    fn release_due_key_ups_with<SendKeyUp>(
        &mut self,
        now: Instant,
        mut send_key_up_group: SendKeyUp,
    ) -> Result<(), String>
    where
        SendKeyUp: FnMut(&[String]) -> Result<(), String>,
    {
        let mut due_key_ups = Vec::new();
        let mut pending_key_ups = Vec::new();

        for key_up in self.scheduled_key_ups.drain(..) {
            if key_up.deadline_at <= now {
                due_key_ups.push(key_up);
            } else {
                pending_key_ups.push(key_up);
            }
        }

        self.scheduled_key_ups = pending_key_ups;

        let keys_to_release = due_key_ups
            .iter()
            .filter(|key_up| self.is_live_scheduled_key_up(key_up))
            .map(|key_up| key_up.key.clone())
            .collect::<Vec<_>>();

        if !keys_to_release.is_empty() {
            send_key_up_group(&keys_to_release)?;

            for key in keys_to_release {
                self.active_generations.remove(&key);
            }
        }

        Ok(())
    }

    fn release_all_active_keys_with<SendKeyUp>(&mut self, mut send_key_up_group: SendKeyUp)
    where
        SendKeyUp: FnMut(&[String]) -> Result<(), String>,
    {
        if !self.active_generations.is_empty() {
            let keys = self.active_generations.keys().cloned().collect::<Vec<_>>();
            let _ = send_key_up_group(&keys);
        }

        self.active_generations.clear();
        self.scheduled_key_ups.clear();
    }

    fn is_live_scheduled_key_up(&self, key_up: &ScheduledKeyUp) -> bool {
        self.active_generations
            .get(&key_up.key)
            .is_some_and(|generation| *generation == key_up.generation)
    }
}

fn key_up_deadline_from_actual_send(sent_at: Instant, key_hold_ms: f64) -> Result<Instant, String> {
    if !key_hold_ms.is_finite() || key_hold_ms <= 0.0 {
        return Err("Effective background playback key hold duration is invalid.".to_string());
    }

    let duration = Duration::try_from_secs_f64(key_hold_ms / 1000.0).map_err(|_| {
        "Effective background playback key hold duration is not representable.".to_string()
    })?;

    sent_at.checked_add(duration).ok_or_else(|| {
        "Effective background playback key hold deadline is not representable.".to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn trigger_at(
        lifecycle: &mut KeyLifecycle,
        keys: &[(String, f64)],
        now: Instant,
        events: &RefCell<Vec<String>>,
    ) {
        lifecycle
            .trigger_group_with(
                keys,
                |keys| {
                    events.borrow_mut().push(format!("up:{}", keys.join(",")));
                    Ok(())
                },
                |keys| {
                    events.borrow_mut().push(format!("down:{}", keys.join(",")));
                    Ok(())
                },
                || {},
                || now,
            )
            .unwrap();
    }

    fn release_at(lifecycle: &mut KeyLifecycle, now: Instant, events: &RefCell<Vec<String>>) {
        lifecycle
            .release_due_key_ups_with(now, |keys| {
                events.borrow_mut().push(format!("up:{}", keys.join(",")));
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn normal_lifecycle_tracks_deadline_and_releases_key() {
        let now = Instant::now();
        let events = RefCell::new(Vec::new());
        let mut lifecycle = KeyLifecycle::new();
        trigger_at(&mut lifecycle, &[("A".to_string(), 30.0)], now, &events);

        assert!(lifecycle.has_live_active_keys());
        assert_eq!(
            lifecycle.next_live_key_up_deadline(now),
            Some(now + Duration::from_millis(30))
        );

        release_at(&mut lifecycle, now + Duration::from_millis(30), &events);

        assert!(!lifecycle.has_live_active_keys());
        assert_eq!(events.into_inner(), ["down:A", "up:A"]);
    }

    #[test]
    fn different_hold_durations_release_independently() {
        let now = Instant::now();
        let events = RefCell::new(Vec::new());
        let mut lifecycle = KeyLifecycle::new();
        trigger_at(
            &mut lifecycle,
            &[
                ("A".to_string(), 30.0),
                ("B".to_string(), 500.0),
                ("C".to_string(), 1000.0),
            ],
            now,
            &events,
        );

        release_at(&mut lifecycle, now + Duration::from_millis(30), &events);
        assert_eq!(
            lifecycle.next_live_key_up_deadline(now),
            Some(now + Duration::from_millis(500))
        );
        release_at(&mut lifecycle, now + Duration::from_millis(500), &events);
        release_at(&mut lifecycle, now + Duration::from_millis(1000), &events);

        assert_eq!(events.into_inner(), ["down:A,B,C", "up:A", "up:B", "up:C"]);
        assert!(!lifecycle.has_live_active_keys());
    }

    #[test]
    fn keys_due_together_use_one_grouped_release() {
        let now = Instant::now();
        let events = RefCell::new(Vec::new());
        let mut lifecycle = KeyLifecycle::new();
        trigger_at(
            &mut lifecycle,
            &[("A".to_string(), 30.0), ("B".to_string(), 30.0)],
            now,
            &events,
        );

        release_at(&mut lifecycle, now + Duration::from_millis(30), &events);

        assert_eq!(events.into_inner(), ["down:A,B", "up:A,B"]);
    }

    #[test]
    fn retrigger_releases_old_key_before_new_generation_becomes_active() {
        let started_at = Instant::now();
        let events = RefCell::new(Vec::new());
        let mut lifecycle = KeyLifecycle::new();
        trigger_at(
            &mut lifecycle,
            &[("A".to_string(), 1000.0)],
            started_at,
            &events,
        );
        let old_generation = lifecycle.active_generations["A"];

        trigger_at(
            &mut lifecycle,
            &[("A".to_string(), 2000.0)],
            started_at + Duration::from_millis(500),
            &events,
        );

        assert_eq!(events.borrow().as_slice(), ["down:A", "up:A", "down:A"]);
        assert_ne!(lifecycle.active_generations["A"], old_generation);

        release_at(
            &mut lifecycle,
            started_at + Duration::from_millis(1000),
            &events,
        );
        assert!(lifecycle.has_live_active_keys());
        assert_eq!(events.borrow().as_slice(), ["down:A", "up:A", "down:A"]);

        release_at(
            &mut lifecycle,
            started_at + Duration::from_millis(2500),
            &events,
        );
        assert_eq!(events.into_inner(), ["down:A", "up:A", "down:A", "up:A"]);
    }

    #[test]
    fn failed_key_down_attempts_cleanup_without_marking_keys_active() {
        let now = Instant::now();
        let events = RefCell::new(Vec::new());
        let mut lifecycle = KeyLifecycle::new();
        trigger_at(&mut lifecycle, &[("A".to_string(), 1000.0)], now, &events);

        let result = lifecycle.trigger_group_with(
            &[("A".to_string(), 500.0)],
            |keys| {
                events.borrow_mut().push(format!("up:{}", keys.join(",")));
                Ok(())
            },
            |keys| {
                events
                    .borrow_mut()
                    .push(format!("down-failed:{}", keys.join(",")));
                Err("key-down failed".to_string())
            },
            || {},
            || now + Duration::from_millis(100),
        );

        assert_eq!(result.unwrap_err(), "key-down failed");
        assert!(!lifecycle.has_live_active_keys());
        assert!(!lifecycle.has_live_future_key_ups(now));
        assert_eq!(
            events.into_inner(),
            ["down:A", "up:A", "down-failed:A", "up:A"]
        );
    }

    #[test]
    fn overlapping_different_keys_do_not_interfere() {
        let now = Instant::now();
        let events = RefCell::new(Vec::new());
        let mut lifecycle = KeyLifecycle::new();
        trigger_at(&mut lifecycle, &[("A".to_string(), 1000.0)], now, &events);
        trigger_at(
            &mut lifecycle,
            &[("B".to_string(), 500.0)],
            now + Duration::from_millis(100),
            &events,
        );

        release_at(&mut lifecycle, now + Duration::from_millis(600), &events);
        assert!(lifecycle.active_generations.contains_key("A"));
        assert!(!lifecycle.active_generations.contains_key("B"));
        release_at(&mut lifecycle, now + Duration::from_millis(1000), &events);

        assert_eq!(events.into_inner(), ["down:A", "down:B", "up:B", "up:A"]);
    }

    #[test]
    fn stale_release_does_not_set_next_deadline() {
        let now = Instant::now();
        let lifecycle = KeyLifecycle {
            active_generations: HashMap::from([("A".to_string(), 2)]),
            next_generation: 3,
            scheduled_key_ups: vec![
                ScheduledKeyUp {
                    deadline_at: now + Duration::from_millis(10),
                    generation: 1,
                    key: "A".to_string(),
                },
                ScheduledKeyUp {
                    deadline_at: now + Duration::from_millis(20),
                    generation: 2,
                    key: "A".to_string(),
                },
            ],
        };

        assert_eq!(
            lifecycle.next_live_key_up_deadline(now),
            Some(now + Duration::from_millis(20))
        );
    }

    #[test]
    fn release_all_clears_active_keys_and_scheduled_releases() {
        let now = Instant::now();
        let events = RefCell::new(Vec::new());
        let mut lifecycle = KeyLifecycle::new();
        trigger_at(
            &mut lifecycle,
            &[("A".to_string(), 1000.0), ("B".to_string(), 500.0)],
            now,
            &events,
        );

        lifecycle.release_all_active_keys_with(|keys| {
            events.borrow_mut().push(format!("up:{}", keys.join(",")));
            Ok(())
        });

        assert!(!lifecycle.has_live_active_keys());
        assert!(lifecycle.next_live_key_up_deadline(now).is_none());
        assert_eq!(events.borrow().len(), 2);
        assert!(events.borrow()[1].starts_with("up:"));
    }

    #[test]
    fn invalid_deadline_conversion_fails_without_panicking() {
        assert!(key_up_deadline_from_actual_send(Instant::now(), f64::NAN).is_err());
        assert!(key_up_deadline_from_actual_send(Instant::now(), f64::INFINITY).is_err());
        assert!(key_up_deadline_from_actual_send(Instant::now(), f64::MAX).is_err());
    }

    #[test]
    fn late_key_down_still_gets_full_hold_duration() {
        let actual_sent_at = Instant::now() + Duration::from_millis(75);
        let deadline = key_up_deadline_from_actual_send(actual_sent_at, 30.0).unwrap();

        assert_eq!(
            deadline.duration_since(actual_sent_at),
            Duration::from_millis(30)
        );
    }
}
