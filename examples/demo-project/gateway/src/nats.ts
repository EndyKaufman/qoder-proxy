import { connect, StringCodec, NatsConnection, Subscription } from 'nats';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';

let connection: NatsConnection | null = null;
let mathSubscription: Subscription | null = null;
const pendingRequests = new Map<string, (result: string) => void>();

export async function connectNats(): Promise<NatsConnection> {
  if (connection) return connection;
  connection = await connect({ servers: NATS_URL });
  console.log(`Connected to NATS: ${NATS_URL}`);

  const sc = StringCodec();
  mathSubscription = connection.subscribe('math.response.>');
  (async () => {
    for await (const msg of mathSubscription) {
      const requestId = msg.subject.split('.').pop()!;
      const resolver = pendingRequests.get(requestId);
      if (resolver) {
        resolver(sc.decode(msg.data));
        pendingRequests.delete(requestId);
      }
    }
  })();

  return connection;
}

export async function publishMathRequest(operation: string, args: number[]): Promise<string> {
  if (!connection) throw new Error('NATS not connected');
  const sc = StringCodec();
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error('Math request timed out'));
    }, 5000);

    pendingRequests.set(requestId, (result) => {
      clearTimeout(timeout);
      resolve(result);
    });

    connection!.publish(
      `math.request.${operation}`,
      sc.encode(JSON.stringify({ requestId, args })),
      { reply: `math.response.${operation}.${requestId}` }
    );
  });
}

export async function closeNats(): Promise<void> {
  if (connection) {
    await connection.drain();
    connection = null;
  }
}
