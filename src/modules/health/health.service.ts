import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

const CONNECTION_STATES: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export interface HealthStatus {
  status: 'ok';
  uptime: number;
  database: string;
}

@Injectable()
export class HealthService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  check(): HealthStatus {
    return {
      status: 'ok',
      uptime: process.uptime(),
      database: CONNECTION_STATES[this.connection.readyState] ?? 'unknown',
    };
  }
}
