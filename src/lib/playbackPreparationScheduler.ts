export type PlaybackPreparationPriority = "direct" | "warm";

export class PreparationCancelledError extends Error {
  constructor() {
    super("Warm playback preparation was discarded before it started.");
    this.name = "PreparationCancelledError";
  }
}

type ScheduledTask<T> = {
  key: string;
  priority: PlaybackPreparationPriority;
  promise: Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
  run: () => Promise<T>;
};

export class PlaybackPreparationScheduler {
  private activeCount = 0;
  private readonly concurrency: number;
  private readonly maxQueuedWarmTasks: number;
  private readonly pending = new Map<string, ScheduledTask<unknown>>();
  private readonly directQueue: string[] = [];
  private readonly warmQueue: string[] = [];

  constructor({
    concurrency = 2,
    maxQueuedWarmTasks = 8,
  }: {
    concurrency?: number;
    maxQueuedWarmTasks?: number;
  } = {}) {
    this.concurrency = Math.max(1, concurrency);
    this.maxQueuedWarmTasks = Math.max(1, maxQueuedWarmTasks);
  }

  schedule<T>(
    key: string,
    priority: PlaybackPreparationPriority,
    run: () => Promise<T>,
  ): Promise<T> {
    const existing = this.pending.get(key);

    if (existing) {
      if (priority === "direct" && existing.priority === "warm") {
        if (removeQueuedKey(this.warmQueue, key)) {
          existing.priority = "direct";
          this.directQueue.push(key);
        }
      }

      return existing.promise as Promise<T>;
    }

    let resolveTask: (value: T) => void = () => {};
    let rejectTask: (error: unknown) => void = () => {};
    const promise = new Promise<T>((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    const task: ScheduledTask<T> = {
      key,
      priority,
      promise,
      reject: rejectTask,
      resolve: resolveTask,
      run,
    };

    this.pending.set(key, task as ScheduledTask<unknown>);

    if (priority === "warm") {
      this.discardOldestQueuedWarmTaskIfNeeded();
      this.warmQueue.push(key);
    } else {
      this.directQueue.push(key);
    }

    this.drain();
    return promise;
  }

  private discardOldestQueuedWarmTaskIfNeeded() {
    while (this.warmQueue.length >= this.maxQueuedWarmTasks) {
      const discardedKey = this.warmQueue.shift();

      if (!discardedKey) {
        return;
      }

      const discardedTask = this.pending.get(discardedKey);

      if (!discardedTask || discardedTask.priority !== "warm") {
        continue;
      }

      this.pending.delete(discardedKey);
      discardedTask.reject(new PreparationCancelledError());
      return;
    }
  }

  private drain() {
    while (this.activeCount < this.concurrency) {
      const key = this.directQueue.shift() ?? this.warmQueue.shift();

      if (!key) {
        return;
      }

      const task = this.pending.get(key);

      if (!task) {
        continue;
      }

      this.activeCount += 1;
      void task
        .run()
        .then((value) => task.resolve(value))
        .catch((error) => task.reject(error))
        .finally(() => {
          this.activeCount -= 1;
          this.pending.delete(key);
          this.drain();
        });
    }
  }
}

function removeQueuedKey(queue: string[], key: string) {
  const index = queue.indexOf(key);

  if (index < 0) {
    return false;
  }

  queue.splice(index, 1);
  return true;
}
