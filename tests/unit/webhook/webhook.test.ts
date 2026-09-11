import { WebhookService } from '../../../src/webhook/webhook.service';
import type { WebhookPayload } from '../../../src/webhook/webhook.service';

describe('WebhookService', () => {
  let service: WebhookService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    service = new WebhookService();
    originalFetch = global.fetch;
    // Mock the private sleep method to avoid real delays
    (service as any).sleep = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const makePayload = (): WebhookPayload => ({
    status: 'success',
    model: 'test-model',
    response: 'hello world',
    duration_ms: 1234,
    timestamp: '2026-01-01T00:00:00.000Z',
  });

  it('should send webhook successfully on first attempt', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as any;

    await service.sendWebhook('https://example.com/hook', makePayload());

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.status).toBe('success');
    expect(body.model).toBe('test-model');
  });

  it('should retry on non-OK response', async () => {
    let attempt = 0;
    const mockFetch = jest.fn().mockImplementation(() => {
      attempt++;
      if (attempt <= 2) return Promise.resolve({ ok: false, status: 500 });
      return Promise.resolve({ ok: true });
    });
    global.fetch = mockFetch as any;

    await service.sendWebhook('https://example.com/hook', makePayload());

    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('should retry on network error', async () => {
    let attempt = 0;
    const mockFetch = jest.fn().mockImplementation(() => {
      attempt++;
      if (attempt === 1) return Promise.reject(new Error('ECONNREFUSED'));
      return Promise.resolve({ ok: true });
    });
    global.fetch = mockFetch as any;

    await service.sendWebhook('https://example.com/hook', makePayload());

    // attempt 1 fails, sleep, attempt 2 succeeds
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should give up after max retries', async () => {
    const mockFetch = jest.fn().mockRejectedValue(new Error('fail'));
    global.fetch = mockFetch as any;

    await service.sendWebhook('https://example.com/hook', makePayload());

    // 1 initial + 3 retries = 4 total
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it('should send correct payload format', async () => {
    const mockFetch = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = mockFetch as any;

    const payload: WebhookPayload = {
      status: 'error',
      model: 'auto',
      error: 'something failed',
      duration_ms: 5000,
      timestamp: '2026-09-10T12:00:00.000Z',
    };

    await service.sendWebhook('https://example.com/hook', payload);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual(payload);
  });
});
