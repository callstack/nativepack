import type { IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import type { FastifyInstance } from 'fastify';
import {
  type ServerOptions,
  type WebSocket,
  WebSocketServer as WebSocketServerImpl,
} from 'ws';
import type { WebSocketServerInterface } from './types.js';

/**
 * Abstract class for providing common logic (eg routing) for all WebSocket servers.
 *
 * @category Development server
 */
export abstract class WebSocketServer implements WebSocketServerInterface {
  /** An instance of the underlying WebSocket server. */
  protected server: WebSocketServerImpl;

  /** Fastify instance from which {@link server} will receive upgrade connections. */
  protected fastify: FastifyInstance;

  protected paths: string[];

  /**
   * Create a new instance of the WebSocketServer.
   * Any logging information, will be passed through standard `fastify.log` API.
   *
   * @param fastify Fastify instance to which the WebSocket will be attached to.
   * @param path Path on which this WebSocketServer will be accepting connections.
   * @param wssOptions WebSocket Server options.
   */
  constructor(
    fastify: FastifyInstance,
    path: string | string[],
    wssOptions: Omit<
      ServerOptions,
      'noServer' | 'server' | 'host' | 'port' | 'path'
    > = {}
  ) {
    this.fastify = fastify;
    this.server = new WebSocketServerImpl({ noServer: true, ...wssOptions });
    this.server.on('connection', this.onConnection.bind(this));
    this.paths = Array.isArray(path) ? path : [path];
  }

  shouldUpgrade(pathname: string) {
    return this.paths.includes(pathname);
  }

  upgrade(request: IncomingMessage, socket: Socket, head: Buffer) {
    this.server.handleUpgrade(request, socket, head, (webSocket) => {
      this.server.emit('connection', webSocket, request);
    });
  }

  /**
   * Process incoming WebSocket connection.
   *
   * @param socket Incoming WebSocket connection.
   * @param request Upgrade request for the connection.
   */
  abstract onConnection(socket: WebSocket, request: IncomingMessage): void;
}
