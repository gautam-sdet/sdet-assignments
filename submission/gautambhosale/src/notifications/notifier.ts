export interface Notifier {
  notify(subscriptionId: string, event: string, payload: Record<string, unknown>): void;
}

export class SilentNotifier implements Notifier {
  notify(): void {
    /* production default: no-op */
  }
}

export class RecordingNotifier implements Notifier {
  readonly events: Array<{
    subscriptionId: string;
    event: string;
    payload: Record<string, unknown>;
  }> = [];

  notify(
    subscriptionId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    this.events.push({ subscriptionId, event, payload });
  }

  count(event: string, subscriptionId?: string): number {
    return this.events.filter(
      (item) =>
        item.event === event &&
        (subscriptionId === undefined || item.subscriptionId === subscriptionId),
    ).length;
  }
}
