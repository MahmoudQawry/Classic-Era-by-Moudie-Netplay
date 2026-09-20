declare module "cloudflare:workers" {
  export class DurableObject<Env = unknown> {
    protected readonly ctx: DurableObjectState;
    protected readonly env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}

interface DurableObjectState {
  storage: { sql: SqlStorage };
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
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
  exec(query: string, ...bindings: any[]): {
    one(): any;
    toArray(): any[];
  };
}

interface WebSocket {
  serializeAttachment?(value: unknown): void;
  deserializeAttachment?(): unknown;
}

interface ResponseInit {
  webSocket?: WebSocket;
}

interface WebSocketPair { readonly 0: WebSocket; readonly 1: WebSocket; }
declare const WebSocketPair: { new (): WebSocketPair };

interface ExportedHandler<Env = unknown> {
  fetch(request: Request, env: Env, ctx?: unknown): Promise<Response> | Response;
}