import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { and, eq } from 'drizzle-orm';
import type { Server, Socket } from 'socket.io';
import { DatabaseService } from '../database/database.service.js';
import { trips } from '../database/schema/index.js';

export const WS_ROOMS = {
  orgOps: (orgId: string) => `org:${orgId}:ops`,
  trip: (tripId: string) => `trip:${tripId}`,
  driver: (driverId: string) => `driver:${driverId}`,
  employee: (employeeId: string) => `employee:${employeeId}`,
} as const;

export interface IncomingDriverLocationMessage {
  tripId: string;
  clientPingId?: string;
  latitude: number;
  longitude: number;
  accuracyM?: number | null;
  speedMps?: number | null;
  headingDeg?: number | null;
  altitudeM?: number | null;
  sequenceNo?: number | null;
  recordedAt?: string;
}

export type IncomingLocationHandler = (
  identity: { organizationId: string; userId: string; role: string },
  message: IncomingDriverLocationMessage,
) => Promise<void>;

function readHandshakeField(client: Socket, headerKey: string, authKey: string): string | null {
  const headerVal = client.handshake.headers[headerKey];
  if (typeof headerVal === 'string' && headerVal.trim().length > 0) return headerVal.trim();
  const authRecord = client.handshake.auth as Record<string, unknown> | undefined;
  const authVal = authRecord?.[authKey];
  if (typeof authVal === 'string' && authVal.trim().length > 0) return authVal.trim();
  const queryVal = client.handshake.query[authKey];
  if (typeof queryVal === 'string' && queryVal.trim().length > 0) return queryVal.trim();
  return null;
}

@WebSocketGateway({
  namespace: '/ws/transport',
  cors: { origin: true, credentials: true },
})
export class TransportGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TransportGateway.name);
  private locationHandler: IncomingLocationHandler | null = null;

  constructor(private readonly dbService: DatabaseService) {}

  @WebSocketServer()
  server!: Server;

  registerLocationHandler(handler: IncomingLocationHandler): void {
    this.locationHandler = handler;
  }

  handleConnection(client: Socket): void {
    const orgId = readHandshakeField(client, 'x-dev-org-id', 'organizationId');
    const userId = readHandshakeField(client, 'x-dev-user-id', 'userId');
    const role = readHandshakeField(client, 'x-dev-role', 'role') ?? 'AUDITOR';

    if (orgId) {
      client.data.organizationId = orgId;
      client.data.userId = userId;
      client.data.role = role;
      if (role !== 'EMPLOYEE' && role !== 'DRIVER') {
        void client.join(WS_ROOMS.orgOps(orgId));
      }
    }
    this.logger.debug(`WS connected: ${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.debug(`WS disconnected: ${client.id}`);
  }

  private async resolveAllowedRoom(client: Socket, room: string): Promise<string | null> {
    const clientOrgId = (client.data.organizationId as string | undefined) ?? null;
    if (room.startsWith('org:') && room.endsWith(':ops')) {
      const targetOrg = room.slice(4, -4);
      const role = (client.data.role as string | undefined) ?? 'AUDITOR';
      if (clientOrgId && clientOrgId !== targetOrg) return null;
      if (role === 'EMPLOYEE' || role === 'DRIVER') return null;
      return room;
    }
    if (room.startsWith('trip:')) {
      const tripId = room.slice(5);
      if (!clientOrgId) return null;
      const [row] = await this.dbService.db
        .select({ id: trips.id })
        .from(trips)
        .where(and(eq(trips.id, tripId), eq(trips.organizationId, clientOrgId)))
        .limit(1);
      return row ? room : null;
    }
    if (room.startsWith('driver:') || room.startsWith('employee:')) {
      return clientOrgId ? room : null;
    }
    return null;
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      organizationId?: string;
      tripId?: string;
      driverId?: string;
      employeeId?: string;
    },
  ): Promise<{ joined: string[] }> {
    const clientOrgId =
      (client.data.organizationId as string | undefined) ??
      (typeof payload?.organizationId === 'string' ? payload.organizationId : undefined);
    if (!clientOrgId) {
      return { joined: [] };
    }
    if (!client.data.organizationId) {
      client.data.organizationId = clientOrgId;
    }

    const joined: string[] = [];
    const role = (client.data.role as string | undefined) ?? 'AUDITOR';
    if (role !== 'EMPLOYEE' && role !== 'DRIVER' && !payload?.employeeId && !payload?.driverId) {
      const opsRoom = await this.resolveAllowedRoom(client, WS_ROOMS.orgOps(clientOrgId));
      if (opsRoom) {
        await client.join(opsRoom);
        joined.push(opsRoom);
      }
    }
    if (typeof payload?.driverId === 'string' && payload.driverId.length > 0) {
      const driverRoom = await this.resolveAllowedRoom(client, WS_ROOMS.driver(payload.driverId));
      if (driverRoom) {
        await client.join(driverRoom);
        joined.push(driverRoom);
      }
    }
    if (typeof payload?.employeeId === 'string' && payload.employeeId.length > 0) {
      const empRoom = await this.resolveAllowedRoom(client, WS_ROOMS.employee(payload.employeeId));
      if (empRoom) {
        await client.join(empRoom);
        joined.push(empRoom);
      }
    }
    if (typeof payload?.tripId === 'string' && payload.tripId.length > 0) {
      const tripRoom = await this.resolveAllowedRoom(client, WS_ROOMS.trip(payload.tripId));
      if (tripRoom) {
        await client.join(tripRoom);
        joined.push(tripRoom);
      }
    }

    return { joined };
  }

  @SubscribeMessage('room.subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room?: string },
  ): Promise<{ joined: string | null }> {
    if (!payload?.room || typeof payload.room !== 'string') {
      return { joined: null };
    }
    const allowed = await this.resolveAllowedRoom(client, payload.room);
    if (!allowed) {
      return { joined: null };
    }
    await client.join(allowed);
    return { joined: allowed };
  }

  @SubscribeMessage('driver.location.update')
  async handleDriverLocationUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: IncomingDriverLocationMessage,
  ): Promise<{ accepted: boolean; reason?: string }> {
    const organizationId = client.data.organizationId as string | undefined;
    const userId = client.data.userId as string | undefined;
    const role = (client.data.role as string | undefined) ?? 'DRIVER';
    if (!organizationId || !userId || !this.locationHandler) {
      return { accepted: false, reason: 'UNAUTHENTICATED_SOCKET' };
    }
    try {
      await this.locationHandler({ organizationId, userId, role }, payload);
      return { accepted: true };
    } catch (error) {
      return {
        accepted: false,
        reason: error instanceof Error ? error.message : 'LOCATION_REJECTED',
      };
    }
  }

  emitToRoom(room: string, event: string, payload: Record<string, unknown>): void {
    this.server?.to(room).emit(event, payload);
  }
}

