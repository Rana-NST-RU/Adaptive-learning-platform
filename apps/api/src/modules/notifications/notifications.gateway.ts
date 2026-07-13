// ─────────────────────────────────────────────────────────────────────────────
// Notifications Gateway
// WebSocket gateway for real-time push events to connected users.
// ─────────────────────────────────────────────────────────────────────────────

import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService } from '../../redis/redis.service';

const SOCKET_MAP_PREFIX = 'ws:user:';

@WebSocketGateway({
  cors: {
    origin: [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:3000'],
    credentials: true,
  },
  namespace: '/notifications',
})
export class NotificationsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redis: RedisService,
  ) {}

  afterInit() {
    this.logger.log('🔌 WebSocket gateway initialised on /notifications');
  }

  async handleConnection(client: Socket) {
    try {
      // Extract JWT from handshake auth or query
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify<{ sub: string }>(token, {
        secret: process.env.JWT_SECRET,
      });

      const userId = payload.sub;
      if (!userId) {
        client.disconnect(true);
        return;
      }

      // Store userId → socketId in Redis (TTL 24h)
      await this.redis.setex(
        `${SOCKET_MAP_PREFIX}${userId}`,
        86400,
        client.id,
      );

      // Store userId on the socket for fast lookup at disconnect
      (client as Socket & { userId?: string }).userId = userId;

      this.logger.log(`✅ User ${userId} connected (socket: ${client.id})`);
    } catch {
      // Invalid token
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = (client as Socket & { userId?: string }).userId;
    if (userId) {
      await this.redis.del(`${SOCKET_MAP_PREFIX}${userId}`);
      this.logger.log(`❌ User ${userId} disconnected`);
    }
  }

  /**
   * Send a real-time event to a specific user.
   * If the user is not connected, silently no-ops.
   */
  async sendToUser(userId: string, event: string, payload: unknown): Promise<void> {
    try {
      const socketId = await this.redis.get(`${SOCKET_MAP_PREFIX}${userId}`);
      if (!socketId) return;
      this.server.to(socketId).emit(event, payload);
    } catch (err) {
      this.logger.warn(`sendToUser failed for ${userId}: ${err}`);
    }
  }

  /**
   * Broadcast an event to all connected clients.
   */
  broadcast(event: string, payload: unknown): void {
    this.server.emit(event, payload);
  }
}
