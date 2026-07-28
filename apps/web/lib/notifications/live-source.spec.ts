import { InMemoryLiveSource, PollingLiveSource, type LiveNotificationEvent } from './live-source';

describe('InMemoryLiveSource', () => {
  const event: LiveNotificationEvent = { unreadCount: 3, latestId: 'n-1' };

  it('subscribing then pushing calls the callback with the right event', () => {
    const source = new InMemoryLiveSource();
    const onUpdate = jest.fn();
    source.subscribe(onUpdate);
    source.push(event);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(event);
  });

  it('unsubscribing stops further calls', () => {
    const source = new InMemoryLiveSource();
    const onUpdate = jest.fn();
    const unsubscribe = source.subscribe(onUpdate);
    unsubscribe();
    source.push(event);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('multiple subscribers all receive pushes independently', () => {
    const source = new InMemoryLiveSource();
    const a = jest.fn();
    const b = jest.fn();
    source.subscribe(a);
    source.subscribe(b);
    source.push(event);
    expect(a).toHaveBeenCalledWith(event);
    expect(b).toHaveBeenCalledWith(event);
  });
});

describe('PollingLiveSource', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('calls the fetcher immediately on subscribe and again after intervalMs', async () => {
    const event: LiveNotificationEvent = { unreadCount: 1, latestId: 'n-2' };
    const fetchUnread = jest.fn(async () => event);
    const onUpdate = jest.fn();
    const source = new PollingLiveSource(fetchUnread, 30_000);

    source.subscribe(onUpdate);

    await Promise.resolve();
    expect(fetchUnread).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(event);

    await jest.advanceTimersByTimeAsync(30_000);
    expect(fetchUnread).toHaveBeenCalledTimes(2);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('calling unsubscribe stops further polling', async () => {
    const fetchUnread = jest.fn(async () => ({ unreadCount: 0, latestId: null }));
    const source = new PollingLiveSource(fetchUnread, 10_000);
    const unsubscribe = source.subscribe(jest.fn());

    await Promise.resolve();
    expect(fetchUnread).toHaveBeenCalledTimes(1);

    unsubscribe();
    await jest.advanceTimersByTimeAsync(50_000);
    expect(fetchUnread).toHaveBeenCalledTimes(1);
  });
});
