export class InFlightByKey<T> {
  private readonly pending = new Map<string, Promise<T>>();

  getOrStart(key: string, load: () => Promise<T>) {
    const existing = this.pending.get(key);

    if (existing) {
      return { isNew: false, promise: existing };
    }

    const promise = Promise.resolve().then(load);
    void promise.then(
      () => {
        if (this.pending.get(key) === promise) {
          this.pending.delete(key);
        }
      },
      () => {
        if (this.pending.get(key) === promise) {
          this.pending.delete(key);
        }
      },
    );
    this.pending.set(key, promise);

    return { isNew: true, promise };
  }
}
