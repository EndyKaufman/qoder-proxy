import { connect, StringCodec } from 'nats';
import { handleMathRequest } from './nats-handler';

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';

async function main() {
  const nc = await connect({ servers: NATS_URL });
  console.log(`Math microservice connected to NATS: ${NATS_URL}`);

  const sc = StringCodec();

  // Subscribe to all math operations
  const sub = nc.subscribe('math.request.>');
  console.log('Listening for math requests on math.request.>');

  (async () => {
    for await (const msg of sub) {
      console.log(`Received: ${msg.subject}`);
      handleMathRequest(msg);
    }
  })();

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down microservice...');
    await nc.drain();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Microservice failed:', err);
  process.exit(1);
});
