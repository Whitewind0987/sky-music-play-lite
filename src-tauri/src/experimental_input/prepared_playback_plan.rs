use serde::Deserialize;
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex, OnceLock};

const MAX_EXPLICIT_HOLD_MS: f64 = 60000.0;
const MAX_PREPARED_PLAYBACK_PLANS: usize = 32;

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PlannedKey {
    pub(crate) key: String,
    #[serde(default)]
    pub(crate) hold_ms: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct BackgroundPlaybackPlanEvent {
    pub(crate) time_ms: f64,
    pub(crate) keys: Vec<PlannedKey>,
}

#[derive(Debug, Clone)]
pub(super) struct PreparedPlaybackGroup {
    pub(super) source_time_ms: f64,
    pub(super) keys: Arc<[PlannedKey]>,
}

#[derive(Debug)]
pub(super) struct PreparedPlaybackPlan {
    pub(super) groups: Arc<[PreparedPlaybackGroup]>,
    pub(super) unique_keys: Arc<[String]>,
}

struct PreparedPlaybackPlanCache {
    entries: HashMap<u64, Arc<PreparedPlaybackPlan>>,
    next_plan_id: u64,
    order: VecDeque<u64>,
}

static PREPARED_PLAYBACK_PLAN_CACHE: OnceLock<Mutex<PreparedPlaybackPlanCache>> = OnceLock::new();

pub(super) fn build_prepared_plan(
    plan: &[BackgroundPlaybackPlanEvent],
) -> Result<PreparedPlaybackPlan, String> {
    let groups = build_source_groups(plan)?;
    let unique_keys = unique_group_keys(&groups);

    Ok(PreparedPlaybackPlan {
        groups: Arc::from(groups),
        unique_keys: Arc::from(unique_keys),
    })
}

pub(super) fn insert_prepared_plan(plan: PreparedPlaybackPlan) -> u64 {
    let mut cache = prepared_plan_cache()
        .lock()
        .expect("prepared playback plan cache poisoned");
    insert_prepared_plan_into_cache(&mut cache, plan, MAX_PREPARED_PLAYBACK_PLANS)
}

pub(super) fn get_prepared_plan(plan_id: u64) -> Result<Arc<PreparedPlaybackPlan>, String> {
    let mut cache = prepared_plan_cache()
        .lock()
        .expect("prepared playback plan cache poisoned");

    get_prepared_plan_from_cache(&mut cache, plan_id)
}

pub(super) fn build_source_groups(
    plan: &[BackgroundPlaybackPlanEvent],
) -> Result<Vec<PreparedPlaybackGroup>, String> {
    let mut grouped_events = plan.to_vec();
    grouped_events.sort_by(|left, right| left.time_ms.total_cmp(&right.time_ms));

    let mut grouped_keys = Vec::<(f64, Vec<PlannedKey>)>::new();

    for event in grouped_events {
        if !event.time_ms.is_finite() {
            return Err("Background playback event time must be finite.".to_string());
        }

        if event.keys.is_empty() {
            return Err("Background playback event must contain at least one key.".to_string());
        }

        for key in &event.keys {
            if let Some(hold_ms) = key.hold_ms {
                if !hold_ms.is_finite() || hold_ms <= 0.0 || hold_ms > MAX_EXPLICIT_HOLD_MS {
                    return Err(format!(
                        "Background playback key hold duration must be greater than zero and at most {MAX_EXPLICIT_HOLD_MS}ms."
                    ));
                }
            }
        }

        if let Some((last_time_ms, last_keys)) = grouped_keys.last_mut() {
            if *last_time_ms == event.time_ms {
                last_keys.extend(event.keys);
                continue;
            }
        }

        grouped_keys.push((event.time_ms, event.keys));
    }

    Ok(grouped_keys
        .into_iter()
        .map(|(source_time_ms, keys)| PreparedPlaybackGroup {
            source_time_ms,
            keys: Arc::from(dedupe_planned_keys(keys)),
        })
        .collect())
}

fn dedupe_planned_keys(keys: Vec<PlannedKey>) -> Vec<PlannedKey> {
    let mut deduped = Vec::<PlannedKey>::new();

    for key in keys {
        if let Some(existing) = deduped.iter_mut().find(|entry| entry.key == key.key) {
            existing.hold_ms = match (existing.hold_ms, key.hold_ms) {
                (Some(left), Some(right)) => Some(left.max(right)),
                (None, Some(right)) => Some(right),
                (left, None) => left,
            };
        } else {
            deduped.push(key);
        }
    }

    deduped
}

fn unique_group_keys(groups: &[PreparedPlaybackGroup]) -> Vec<String> {
    let mut seen_keys = HashSet::new();
    let mut unique = Vec::new();

    for group in groups {
        for key in group.keys.iter() {
            if seen_keys.insert(key.key.clone()) {
                unique.push(key.key.clone());
            }
        }
    }

    unique
}

fn prepared_plan_cache() -> &'static Mutex<PreparedPlaybackPlanCache> {
    PREPARED_PLAYBACK_PLAN_CACHE.get_or_init(|| {
        Mutex::new(PreparedPlaybackPlanCache {
            entries: HashMap::new(),
            next_plan_id: 1,
            order: VecDeque::new(),
        })
    })
}

fn insert_prepared_plan_into_cache(
    cache: &mut PreparedPlaybackPlanCache,
    plan: PreparedPlaybackPlan,
    max_entries: usize,
) -> u64 {
    let plan_id = cache.next_plan_id;

    cache.next_plan_id = cache.next_plan_id.saturating_add(1).max(1);
    cache.entries.insert(plan_id, Arc::new(plan));
    cache.order.push_back(plan_id);

    while cache.entries.len() > max_entries {
        if let Some(expired_plan_id) = cache.order.pop_front() {
            cache.entries.remove(&expired_plan_id);
        } else {
            break;
        }
    }

    plan_id
}

fn get_prepared_plan_from_cache(
    cache: &mut PreparedPlaybackPlanCache,
    plan_id: u64,
) -> Result<Arc<PreparedPlaybackPlan>, String> {
    let plan = cache.entries.get(&plan_id).cloned().ok_or_else(|| {
        format!("Prepared background playback plan is no longer available. id: {plan_id}")
    })?;

    touch_prepared_plan(cache, plan_id);
    Ok(plan)
}

fn touch_prepared_plan(cache: &mut PreparedPlaybackPlanCache, plan_id: u64) {
    if let Some(position) = cache
        .order
        .iter()
        .position(|current_id| *current_id == plan_id)
    {
        cache.order.remove(position);
    }

    cache.order.push_back(plan_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn planned_key(key: &str) -> PlannedKey {
        PlannedKey {
            key: key.to_string(),
            hold_ms: None,
        }
    }

    fn held_key(key: &str, hold_ms: f64) -> PlannedKey {
        PlannedKey {
            key: key.to_string(),
            hold_ms: Some(hold_ms),
        }
    }

    fn plan() -> Vec<BackgroundPlaybackPlanEvent> {
        vec![
            BackgroundPlaybackPlanEvent {
                time_ms: 1000.0,
                keys: vec![planned_key("Key3")],
            },
            BackgroundPlaybackPlanEvent {
                time_ms: 0.0,
                keys: vec![planned_key("Key0")],
            },
            BackgroundPlaybackPlanEvent {
                time_ms: 500.0,
                keys: vec![planned_key("Key1")],
            },
            BackgroundPlaybackPlanEvent {
                time_ms: 500.0,
                keys: vec![planned_key("Key2")],
            },
        ]
    }

    #[test]
    fn source_groups_sort_merge_and_preserve_chord_order() {
        let groups = build_source_groups(&plan()).unwrap();

        assert_eq!(groups.len(), 3);
        assert_eq!(groups[0].source_time_ms, 0.0);
        assert_eq!(groups[1].source_time_ms, 500.0);
        assert_eq!(groups[2].source_time_ms, 1000.0);
        assert_eq!(
            groups[1].keys.as_ref(),
            [planned_key("Key1"), planned_key("Key2")]
        );
    }

    #[test]
    fn source_groups_dedupe_same_key_keeping_longest_hold() {
        let groups = build_source_groups(&[BackgroundPlaybackPlanEvent {
            time_ms: 0.0,
            keys: vec![
                held_key("y", 500.0),
                planned_key("y"),
                held_key("y", 1500.0),
                planned_key("u"),
            ],
        }])
        .unwrap();

        assert_eq!(groups[0].keys.len(), 2);
        assert_eq!(groups[0].keys[0], held_key("y", 1500.0));
        assert_eq!(groups[0].keys[1], planned_key("u"));
    }

    #[test]
    fn source_groups_reject_invalid_holds() {
        for hold in [0.0, -1.0, f64::NAN, f64::INFINITY] {
            let result = build_source_groups(&[BackgroundPlaybackPlanEvent {
                time_ms: 0.0,
                keys: vec![held_key("y", hold)],
            }]);

            assert!(result.is_err(), "hold {hold} should be rejected");
        }
    }

    #[test]
    fn explicit_hold_limit_is_inclusive() {
        assert!(build_source_groups(&[BackgroundPlaybackPlanEvent {
            time_ms: 0.0,
            keys: vec![held_key("y", MAX_EXPLICIT_HOLD_MS)],
        }])
        .is_ok());
        assert!(build_source_groups(&[BackgroundPlaybackPlanEvent {
            time_ms: 0.0,
            keys: vec![held_key("y", MAX_EXPLICIT_HOLD_MS + 1.0)],
        }])
        .is_err());
    }

    #[test]
    fn prepared_plan_collects_unique_keys_in_source_order() {
        let prepared = build_prepared_plan(&plan()).unwrap();

        assert_eq!(
            prepared.unique_keys.as_ref(),
            ["Key0", "Key1", "Key2", "Key3"]
        );
    }

    #[test]
    fn prepared_plan_cache_refreshes_lru_access_order() {
        let mut cache = PreparedPlaybackPlanCache {
            entries: HashMap::new(),
            next_plan_id: 1,
            order: VecDeque::new(),
        };
        let first =
            insert_prepared_plan_into_cache(&mut cache, build_prepared_plan(&plan()).unwrap(), 2);
        let second =
            insert_prepared_plan_into_cache(&mut cache, build_prepared_plan(&plan()).unwrap(), 2);

        get_prepared_plan_from_cache(&mut cache, first).unwrap();
        let third =
            insert_prepared_plan_into_cache(&mut cache, build_prepared_plan(&plan()).unwrap(), 2);

        assert!(cache.entries.contains_key(&first));
        assert!(!cache.entries.contains_key(&second));
        assert!(cache.entries.contains_key(&third));
        assert_eq!(
            cache.order.into_iter().collect::<Vec<_>>(),
            vec![first, third]
        );
    }
}
