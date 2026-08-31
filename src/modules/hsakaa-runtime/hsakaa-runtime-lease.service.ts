import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  HsakaaRuntimeLease,
  HsakaaRuntimeLeaseDocument,
} from './schemas/hsakaa-runtime-lease.schema';

export type RuntimeLeaseHandle = {
  key: string;
  ownerToken: string;
  acquiredAt: Date;
  expiresAt: Date;
};

@Injectable()
export class HsakaaRuntimeLeaseService {
  constructor(
    @InjectModel(HsakaaRuntimeLease.name)
    private readonly leaseModel: Model<HsakaaRuntimeLeaseDocument>,
  ) {}

  async acquire(
    key: string,
    ttlMs: number,
    metadata: Record<string, unknown> = {},
  ): Promise<RuntimeLeaseHandle | null> {
    const now = new Date();
    const ownerToken = randomUUID();
    const expiresAt = new Date(now.getTime() + Math.max(ttlMs, 10_000));

    try {
      const lease = await this.leaseModel
        .findOneAndUpdate(
          {
            key,
            $or: [{ expiresAt: { $lte: now } }, { ownerToken }],
          },
          {
            $set: {
              key,
              ownerToken,
              acquiredAt: now,
              expiresAt,
              metadata,
            },
          },
          {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
          },
        )
        .lean()
        .exec();

      if (!lease || lease.ownerToken !== ownerToken) return null;
      return {
        key: lease.key,
        ownerToken: lease.ownerToken,
        acquiredAt: lease.acquiredAt,
        expiresAt: lease.expiresAt,
      };
    } catch (error) {
      if (this.isDuplicateKey(error)) return null;
      throw error;
    }
  }

  async release(handle: RuntimeLeaseHandle): Promise<void> {
    try {
      await this.leaseModel
        .deleteOne({ key: handle.key, ownerToken: handle.ownerToken })
        .exec();
    } catch {
      // The TTL index is the crash-safe fallback if lease cleanup cannot complete.
    }
  }

  async getActiveLeases() {
    const now = new Date();
    return this.leaseModel
      .find({ expiresAt: { $gt: now } })
      .sort({ expiresAt: 1 })
      .lean()
      .exec();
  }

  private isDuplicateKey(error: unknown): boolean {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      Number((error as { code?: unknown }).code) === 11000,
    );
  }
}
