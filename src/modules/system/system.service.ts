import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

@Injectable()
export class SystemService {
  constructor(
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  getHealth() {
    return {
      status: 'ok',
      service: 'aakash-personal-os-backend',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }

  getReadiness() {
    const databaseState = this.getDatabaseState(this.connection.readyState);

    const ready = this.connection.readyState === 1;

    const response = {
      status: ready ? 'ready' : 'not_ready',
      service: 'aakash-personal-os-backend',
      timestamp: new Date(),
      checks: {
        mongodb: {
          ready,
          state: databaseState,
        },
      },
    };

    if (!ready) {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }

  private getDatabaseState(readyState: number) {
    switch (readyState) {
      case 0:
        return 'disconnected';
      case 1:
        return 'connected';
      case 2:
        return 'connecting';
      case 3:
        return 'disconnecting';
      default:
        return 'unknown';
    }
  }
}
