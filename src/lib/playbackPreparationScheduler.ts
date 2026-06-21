export type PlaybackPreparationPriority = "direct" | "warm";

type ScheduledTask<T> = {
  key: string;
  priority: PlaybackPreparationPriority;
  run: () => Promise<T>;
  reject: (error: unknown) => void;
  resolve: (value: T) => void;
};

export class PlaybackPreparationScheduler {
  private activeCount = 0;
  private readonly concurrency: number;
  private readonly pending = new Map<string, ScheduledTask<unknown>>();
  private readonly directQueue: string[] = [];
  private readonly warmQueue: string[] = [];

  constructor({ concurrency = 2 }: { concurrency?: number } = {}) {
    this.concurrency = Math.max(1, concurrency);
  }

  schedule<T>(
    key: string,
    priority: PlaybackPreparationPriority,
    run: () => Promise<T>,
  ): Promise<T> {
    const existing = this.pending.get(key);

    if (existing) {
      if (priority === "direct" && existing.priority === "warm") {
        existing.priority = "direct";
        removeQueuedKey(this.warmQueue, key);
        this.directQueue.push(key);
      }

      return existingPromise(existing) as Promise<T>;
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
      reject: rejectTask,
      resolve: resolveTask,
      run,
    };

    Object.defineProperty(task, "promise", { value: promise });
    this.pending.set(key, task as ScheduledTask<unknown>);
    (priority === "direct" ? this.directQueue : this.warmQueue).push(key);
    this.drain();

    return promise;
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

function existingPromise(task: ScheduledTask<unknown>) {
  return (task as ScheduledTask<unknown> & { promise: Promise<unknown> }).promise;
}

function removeQueuedKey(queue: string[], key: string) {
  const index = queue.indexOf(key);

  if (index >= 0) {
    queue.splice(index, 1);
  }
}
