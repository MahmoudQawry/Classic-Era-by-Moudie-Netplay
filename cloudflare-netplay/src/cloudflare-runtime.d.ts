declare module "cloudflare:workers" {
  export class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}

interface WorkerSocket extends WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
interface DurableObjectState {
  storage: { sql: SqlStorage };
  acceptWebSocket(socket: WorkerSocket): void;
  getWebSockets(): WorkerSocket[];
}
interface DurableObjectNamespace<T = unknown> {
  getByName(name: string): T & {
    create(...args: any[]): Promise<any>;
    join(...args: any[]): Promise<any>;
    snapshot(...args: any[]): Promise<any>;
    ready(...args: any[]): Promise<any>;
    socket(...args: any[]): Promise<Response>;
  };
}
interface SqlStorage {
  exec(query: string, ...bindings: any[]): { one(): any; toArray(): any[]; };
}
interface ResponseInit { webSocket?: WebSocket; }
interface WebSocketPair { readonly 0: WorkerSocket; readonly 1: WorkerSocket; }
declare const WebSocketPair: { new (): WebSocketPair };
interface ExportedHandler<Env = unknown> { fetch(request: Request, env: Env, ctx?: unknown): Promise<Response> | Response; }
