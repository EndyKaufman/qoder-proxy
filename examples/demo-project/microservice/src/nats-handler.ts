import { Msg, StringCodec } from 'nats';
import { add, multiply, divide, subtract } from './math';

const sc = StringCodec();

interface MathRequest {
  requestId: string;
  args: number[];
}

const operations: Record<string, (...args: number[]) => number> = {
  add,
  multiply,
  divide,
  subtract,
};

export function handleMathRequest(msg: Msg): void {
  const subject = msg.subject;
  // Subject format: math.request.<operation>
  const parts = subject.split('.');
  const operation = parts[parts.length - 1];

  const handler = operations[operation];
  if (!handler) {
    if (msg.reply) {
      msg.respond(sc.encode(JSON.stringify({ error: `Unknown operation: ${operation}` })));
    }
    return;
  }

  try {
    const request: MathRequest = JSON.parse(sc.decode(msg.data));
    const result = handler(...request.args);

    if (msg.reply) {
      msg.respond(sc.encode(JSON.stringify(result)));
    }
  } catch (err: any) {
    if (msg.reply) {
      msg.respond(sc.encode(JSON.stringify({ error: err.message })));
    }
  }
}
