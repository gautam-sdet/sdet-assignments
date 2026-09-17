export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FrozenClock implements Clock {
  constructor(private readonly current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }
}
