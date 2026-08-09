import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import {
  ConfigService,
} from '@nestjs/config';

import {
  InjectModel,
} from '@nestjs/mongoose';

import {
  Model,
} from 'mongoose';

import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

import {
  Integration,
  IntegrationDocument,
  IntegrationProvider,
  IntegrationStatus,
} from '../schemas/integration.schema';

import {
  WhoopHealthService,
} from '../../health/integrations/whoop-health.service';

interface WhoopTokenResponse {
  access_token: string;

  refresh_token?: string;

  expires_in: number;

  token_type: string;

  scope?: string;
}

interface WhoopProfile {
  user_id: number;

  email?: string;

  first_name?: string;

  last_name?: string;
}

export interface WhoopWorkout {
  id: string;

  user_id?: number;

  created_at?: string;

  updated_at?: string;

  start?: string;

  end?: string;

  timezone_offset?: string;

  sport_id?: number;

  sport_name?: string;

  score_state?: string;

  score?: {
    strain?: number;

    average_heart_rate?: number;

    max_heart_rate?: number;

    kilojoule?: number;

    percent_recorded?: number;

    distance_meter?: number;

    altitude_gain_meter?: number;

    altitude_change_meter?: number;

    zone_duration?: {
      zone_zero_milli?: number;

      zone_one_milli?: number;

      zone_two_milli?: number;

      zone_three_milli?: number;

      zone_four_milli?: number;

      zone_five_milli?: number;
    };
  };
}

export interface WhoopSleep {
  id: string;

  user_id?: number;

  created_at?: string;

  updated_at?: string;

  start?: string;

  end?: string;

  timezone_offset?: string;

  nap?: boolean;

  score_state?: string;

  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number;

      total_awake_time_milli?: number;

      total_no_data_time_milli?: number;

      total_light_sleep_time_milli?: number;

      total_slow_wave_sleep_time_milli?: number;

      total_rem_sleep_time_milli?: number;

      sleep_cycle_count?: number;

      disturbance_count?: number;
    };

    sleep_needed?: {
      baseline_milli?: number;

      need_from_sleep_debt_milli?: number;

      need_from_recent_strain_milli?: number;

      need_from_recent_nap_milli?: number;
    };

    respiratory_rate?: number;

    sleep_performance_percentage?: number;

    sleep_consistency_percentage?: number;

    sleep_efficiency_percentage?: number;
  };
}

@Injectable()
export class WhoopService {
  private readonly authUrl =
    'https://api.prod.whoop.com/oauth/oauth2/auth';

  private readonly tokenUrl =
    'https://api.prod.whoop.com/oauth/oauth2/token';

  private readonly apiUrl =
    'https://api.prod.whoop.com/developer/v2';

  constructor(
    @InjectModel(
      Integration.name,
    )
    private readonly integrationModel:
      Model<IntegrationDocument>,

    private readonly configService:
      ConfigService,

    private readonly whoopHealthService:
      WhoopHealthService,
  ) {}

  getAuthorizationUrl() {
    const clientId =
      this.getConfig(
        'WHOOP_CLIENT_ID',
      );

    const redirectUri =
      this.getConfig(
        'WHOOP_REDIRECT_URI',
      );

    const state =
      this.createState();

    const scopes = [
      'offline',
      'read:profile',
      'read:body_measurement',
      'read:cycles',
      'read:recovery',
      'read:sleep',
      'read:workout',
    ];

    const params =
      new URLSearchParams({
        client_id:
          clientId,

        redirect_uri:
          redirectUri,

        response_type:
          'code',

        scope:
          scopes.join(
            ' ',
          ),

        state,
      });

    return {
      authorizationUrl:
        `${this.authUrl}?${params.toString()}`,
    };
  }

  async handleCallback(
    code?: string,
    state?: string,
    error?: string,
    errorDescription?: string,
  ) {
    if (error) {
      throw new BadRequestException(
        errorDescription ||
          `WHOOP authorization failed: ${error}`,
      );
    }

    if (!code) {
      throw new BadRequestException(
        'WHOOP authorization code is missing.',
      );
    }

    if (!state) {
      throw new BadRequestException(
        'WHOOP OAuth state is missing.',
      );
    }

    this.verifyState(
      state,
    );

    const token =
      await this.exchangeCode(
        code,
      );

    const profile =
      await this.fetchProfile(
        token.access_token,
      );

    const expiresAt =
      new Date(
        Date.now() +
          token.expires_in *
            1000,
      );

    const scopes =
      token.scope
        ?.split(' ')
        .filter(Boolean) ??
      [];

    const updateData:
      Record<
        string,
        unknown
      > = {
      status:
        IntegrationStatus.CONNECTED,

      accessToken:
        token.access_token,

      accessTokenExpiresAt:
        expiresAt,

      scopes,

      externalUserId:
        String(
          profile.user_id,
        ),

      connectedAt:
        new Date(),

      lastRefreshedAt:
        new Date(),

      lastSyncError:
        null,

      metadata: {
        email:
          profile.email,

        firstName:
          profile.first_name,

        lastName:
          profile.last_name,
      },

      isActive:
        true,
    };

    if (
      token.refresh_token
    ) {
      updateData.refreshToken =
        token.refresh_token;
    }

    const integration =
      await this.integrationModel
        .findOneAndUpdate(
          {
            provider:
              IntegrationProvider.WHOOP,
          },
          {
            $set:
              updateData,
          },
          {
            upsert: true,

            new: true,

            setDefaultsOnInsert:
              true,
          },
        )
        .lean();

    if (!integration) {
      throw new BadRequestException(
        'Unable to save WHOOP integration.',
      );
    }

    return {
      message:
        'WHOOP connected successfully.',

      data: {
        provider:
          integration.provider,

        status:
          integration.status,

        externalUserId:
          integration.externalUserId,

        scopes:
          integration.scopes,

        connectedAt:
          integration.connectedAt,
      },
    };
  }

  async syncHealth(
    options?: {
      startDate?: string;
      endDate?: string;
    },
  ) {
    const integration =
      await this.getWhoopIntegration();

    try {
      const accessToken =
        await this.getValidAccessToken();

      const result =
        await this.whoopHealthService.sync(
          accessToken,
          options,
        );

      await this.integrationModel.updateOne(
        {
          _id:
            integration._id,
        },
        {
          $set: {
            lastSyncedAt:
              new Date(),

            lastSyncError:
              null,

            status:
              IntegrationStatus.CONNECTED,
          },
        },
      );

      return result;
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : 'WHOOP health synchronization failed.';

      await this.integrationModel.updateOne(
        {
          _id:
            integration._id,
        },
        {
          $set: {
            lastSyncError:
              message,

            status:
              IntegrationStatus.ERROR,
          },
        },
      );

      throw error;
    }
  }

  async getValidAccessToken() {
    const integration =
      await this.getWhoopIntegration();

    if (
      integration.accessToken &&
      integration.accessTokenExpiresAt
    ) {
      /**
       * Refresh 5 minutes early.
       */
      const refreshAt =
        Date.now() +
        5 * 60 * 1000;

      if (
        integration.accessTokenExpiresAt.getTime() >
        refreshAt
      ) {
        return integration.accessToken;
      }
    }

    if (
      !integration.refreshToken
    ) {
      throw new UnauthorizedException(
        'WHOOP refresh token is missing. Please reconnect WHOOP.',
      );
    }

    try {
      const token =
        await this.refreshAccessToken(
          integration.refreshToken,
        );

      integration.accessToken =
        token.access_token;

      if (
        token.refresh_token
      ) {
        integration.refreshToken =
          token.refresh_token;
      }

      integration.accessTokenExpiresAt =
        new Date(
          Date.now() +
            token.expires_in *
              1000,
        );

      integration.lastRefreshedAt =
        new Date();

      integration.status =
        IntegrationStatus.CONNECTED;

      integration.lastSyncError =
        undefined;

      if (
        token.scope
      ) {
        integration.scopes =
          token.scope
            .split(' ')
            .filter(
              Boolean,
            );
      }

      await integration.save();

      return integration.accessToken;
    } catch (
      error
    ) {
      integration.status =
        IntegrationStatus.EXPIRED;

      integration.lastSyncError =
        error instanceof Error
          ? error.message
          : 'Unable to refresh WHOOP token.';

      await integration.save();

      throw error;
    }
  }

  async getStatus() {
    const integration =
      await this.integrationModel
        .findOne({
          provider:
            IntegrationProvider.WHOOP,

          isActive:
            true,
        })
        .select({
          accessToken: 0,
          refreshToken: 0,
        })
        .lean();

    if (!integration) {
      return {
        provider:
          IntegrationProvider.WHOOP,

        connected:
          false,
      };
    }

    return {
      provider:
        integration.provider,

      connected:
        integration.status ===
        IntegrationStatus.CONNECTED,

      status:
        integration.status,

      scopes:
        integration.scopes,

      externalUserId:
        integration.externalUserId,

      connectedAt:
        integration.connectedAt,

      lastRefreshedAt:
        integration.lastRefreshedAt,

      lastSyncedAt:
        integration.lastSyncedAt,

      lastSyncError:
        integration.lastSyncError,
    };
  }

  async syncRecentHealth(
    days = 3,
  ) {
    const safeDays =
      Math.min(
        Math.max(
          Math.floor(
            days,
          ),
          1,
        ),
        30,
      );

    const endDate =
      this.getDateKey(
        new Date(),
      );

    const startDate =
      this.addDaysToDateKey(
        endDate,
        -(safeDays - 1),
      );

    return this.syncHealth({
      startDate,
      endDate,
    });
  }

  async backfillHealth(
    startDate: string,
    endDate: string,
  ) {
    const startDateKey =
      this.validateDateKey(
        startDate,
      );

    const endDateKey =
      this.validateDateKey(
        endDate,
      );

    if (
      startDateKey >
      endDateKey
    ) {
      throw new BadRequestException(
        'startDate must be before or equal to endDate.',
      );
    }

    /**
     * Safety limit.
     */
    const totalDays =
      this.getDaysBetween(
        startDateKey,
        endDateKey,
      ) + 1;

    if (
      totalDays >
      730
    ) {
      throw new BadRequestException(
        'WHOOP backfill cannot exceed 730 days in one request.',
      );
    }

    const chunkSizeDays =
      7;

    let currentStart =
      startDateKey;

    const chunks: Array<{
      startDate: string;
      endDate: string;

      cycles: number;
      recoveries: number;
      sleeps: number;
      workouts: number;

      dailyEntriesUpdated: number;

      workoutsCreated: number;
      workoutsUpdated: number;
    }> = [];

    const totals = {
      cycles: 0,
      recoveries: 0,
      sleeps: 0,
      workouts: 0,

      dailyEntriesUpdated:
        0,

      workoutsCreated: 0,
      workoutsUpdated: 0,
    };

    while (
      currentStart <=
      endDateKey
    ) {
      const candidateEnd =
        this.addDaysToDateKey(
          currentStart,
          chunkSizeDays -
            1,
        );

      const currentEnd =
        candidateEnd >
        endDateKey
          ? endDateKey
          : candidateEnd;

      const result =
        await this.syncHealth({
          startDate:
            currentStart,

          endDate:
            currentEnd,
        });

      const data =
        result.data;

      chunks.push({
        startDate:
          currentStart,

        endDate:
          currentEnd,

        cycles:
          data.cycles,

        recoveries:
          data.recoveries,

        sleeps:
          data.sleeps,

        workouts:
          data.workouts,

        dailyEntriesUpdated:
          data.dailyEntriesUpdated,

        workoutsCreated:
          data.workoutsCreated,

        workoutsUpdated:
          data.workoutsUpdated,
      });

      totals.cycles +=
        data.cycles;

      totals.recoveries +=
        data.recoveries;

      totals.sleeps +=
        data.sleeps;

      totals.workouts +=
        data.workouts;

      totals.dailyEntriesUpdated +=
        data.dailyEntriesUpdated;

      totals.workoutsCreated +=
        data.workoutsCreated;

      totals.workoutsUpdated +=
        data.workoutsUpdated;

      currentStart =
        this.addDaysToDateKey(
          currentEnd,
          1,
        );

      if (
        currentStart <=
        endDateKey
      ) {
        await this.sleep(
          500,
        );
      }
    }

    return {
      message:
        'WHOOP historical backfill completed.',

      period: {
        startDate:
          startDateKey,

        endDate:
          endDateKey,

        days:
          totalDays,
      },

      totals,

      chunks,
    };
  }

  async getWorkoutById(
    workoutId: string,
  ): Promise<WhoopWorkout> {
    const accessToken =
      await this.getValidAccessToken();

    return this.whoopApiGet<WhoopWorkout>(
      `/activity/workout/${encodeURIComponent(
        workoutId,
      )}`,
      accessToken,
    );
  }

  async getSleepById(
    sleepId: string,
  ): Promise<WhoopSleep> {
    const accessToken =
      await this.getValidAccessToken();

    return this.whoopApiGet<WhoopSleep>(
      `/activity/sleep/${encodeURIComponent(
        sleepId,
      )}`,
      accessToken,
    );
  }

  private async exchangeCode(
    code: string,
  ) {
    const body =
      new URLSearchParams({
        grant_type:
          'authorization_code',

        code,

        client_id:
          this.getConfig(
            'WHOOP_CLIENT_ID',
          ),

        client_secret:
          this.getConfig(
            'WHOOP_CLIENT_SECRET',
          ),

        redirect_uri:
          this.getConfig(
            'WHOOP_REDIRECT_URI',
          ),
      });

    return this.requestToken(
      body,
    );
  }

  private async refreshAccessToken(
    refreshToken: string,
  ) {
    const body =
      new URLSearchParams({
        grant_type:
          'refresh_token',

        refresh_token:
          refreshToken,

        client_id:
          this.getConfig(
            'WHOOP_CLIENT_ID',
          ),

        client_secret:
          this.getConfig(
            'WHOOP_CLIENT_SECRET',
          ),
      });

    return this.requestToken(
      body,
    );
  }

  private async requestToken(
    body: URLSearchParams,
  ): Promise<WhoopTokenResponse> {
    const response =
      await fetch(
        this.tokenUrl,
        {
          method:
            'POST',

          headers: {
            'Content-Type':
              'application/x-www-form-urlencoded',

            Accept:
              'application/json',
          },

          body:
            body.toString(),
        },
      );

    if (
      !response.ok
    ) {
      const responseBody =
        await response.text();

      throw new UnauthorizedException(
        `WHOOP token request failed: ${response.status} ${responseBody}`,
      );
    }

    const result =
      (await response.json()) as
        WhoopTokenResponse;

    if (
      !result.access_token
    ) {
      throw new UnauthorizedException(
        'WHOOP did not return an access token.',
      );
    }

    return result;
  }

  private async fetchProfile(
    accessToken: string,
  ): Promise<WhoopProfile> {
    const response =
      await fetch(
        `${this.apiUrl}/user/profile/basic`,
        {
          method:
            'GET',

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            Accept:
              'application/json',
          },
        },
      );

    if (
      response.status ===
      401
    ) {
      throw new UnauthorizedException(
        'WHOOP access token is invalid.',
      );
    }

    if (
      !response.ok
    ) {
      const body =
        await response.text();

      throw new BadRequestException(
        `Unable to fetch WHOOP profile: ${response.status} ${body}`,
      );
    }

    return (
      await response.json()
    ) as WhoopProfile;
  }

  private async getWhoopIntegration() {
    const integration =
      await this.integrationModel.findOne({
        provider:
          IntegrationProvider.WHOOP,

        isActive:
          true,
      });

    if (!integration) {
      throw new NotFoundException(
        'WHOOP is not connected.',
      );
    }

    return integration;
  }

  /**
   * State format:
   *
   * base64url(payload).signature
   *
   * Payload:
   * randomNonce.timestamp
   */
  private createState() {
    const nonce =
      randomBytes(
        24,
      ).toString(
        'hex',
      );

    const timestamp =
      Date.now().toString();

    const payload =
      `${nonce}.${timestamp}`;

    const encodedPayload =
      Buffer.from(
        payload,
      ).toString(
        'base64url',
      );

    const signature =
      this.signState(
        encodedPayload,
      );

    return `${encodedPayload}.${signature}`;
  }

  private verifyState(
    state: string,
  ) {
    const parts =
      state.split(
        '.',
      );

    if (
      parts.length !==
      2
    ) {
      throw new BadRequestException(
        'Invalid WHOOP OAuth state.',
      );
    }

    const [
      encodedPayload,
      signature,
    ] =
      parts;

    const expectedSignature =
      this.signState(
        encodedPayload,
      );

    const providedBuffer =
      Buffer.from(
        signature,
        'utf8',
      );

    const expectedBuffer =
      Buffer.from(
        expectedSignature,
        'utf8',
      );

    if (
      providedBuffer.length !==
      expectedBuffer.length
    ) {
      throw new BadRequestException(
        'Invalid WHOOP OAuth state.',
      );
    }

    const valid =
      timingSafeEqual(
        providedBuffer,
        expectedBuffer,
      );

    if (!valid) {
      throw new BadRequestException(
        'Invalid WHOOP OAuth state.',
      );
    }

    let payload: string;

    try {
      payload =
        Buffer.from(
          encodedPayload,
          'base64url',
        ).toString(
          'utf8',
        );
    } catch {
      throw new BadRequestException(
        'Invalid WHOOP OAuth state.',
      );
    }

    const payloadParts =
      payload.split(
        '.',
      );

    if (
      payloadParts.length !==
      2
    ) {
      throw new BadRequestException(
        'Invalid WHOOP OAuth state.',
      );
    }

    const [
      nonce,
      timestampValue,
    ] =
      payloadParts;

    if (
      !nonce ||
      !timestampValue
    ) {
      throw new BadRequestException(
        'Invalid WHOOP OAuth state.',
      );
    }

    const timestamp =
      Number(
        timestampValue,
      );

    if (
      !Number.isFinite(
        timestamp,
      )
    ) {
      throw new BadRequestException(
        'Invalid WHOOP OAuth state.',
      );
    }

    /**
     * OAuth authorization window:
     * 10 minutes.
     */
    const maxAgeMs =
      10 *
      60 *
      1000;

    if (
      Date.now() -
        timestamp >
      maxAgeMs
    ) {
      throw new BadRequestException(
        'WHOOP OAuth state has expired. Please reconnect.',
      );
    }
  }

  private signState(
    value: string,
  ) {
    return createHmac(
      'sha256',
      this.getConfig(
        'WHOOP_STATE_SECRET',
      ),
    )
      .update(
        value,
      )
      .digest(
        'hex',
      );
  }

  private getConfig(
    key: string,
  ) {
    const value =
      this.configService.get<string>(
        key,
      );

    if (!value) {
      throw new BadRequestException(
        `${key} is not configured.`,
      );
    }

    return value;
  }

  private validateDateKey(
    value: string,
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        value,
      )
    ) {
      throw new BadRequestException(
        'Date must use YYYY-MM-DD format.',
      );
    }

    const [
      year,
      month,
      day,
    ] =
      value
        .split('-')
        .map(Number);

    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day,
        ),
      );

    if (
      date.getUTCFullYear() !==
        year ||
      date.getUTCMonth() !==
        month - 1 ||
      date.getUTCDate() !==
        day
    ) {
      throw new BadRequestException(
        `Invalid date: ${value}.`,
      );
    }

    return value;
  }

  private getDateKey(
    date: Date,
  ) {
    const parts =
      new Intl.DateTimeFormat(
        'en-US',
        {
          timeZone:
            'Asia/Kolkata',

          year:
            'numeric',

          month:
            '2-digit',

          day:
            '2-digit',
        },
      ).formatToParts(
        date,
      );

    const year =
      parts.find(
        (
          part,
        ) =>
          part.type ===
          'year',
      )?.value;

    const month =
      parts.find(
        (
          part,
        ) =>
          part.type ===
          'month',
      )?.value;

    const day =
      parts.find(
        (
          part,
        ) =>
          part.type ===
          'day',
      )?.value;

    if (
      !year ||
      !month ||
      !day
    ) {
      throw new BadRequestException(
        'Unable to determine date.',
      );
    }

    return `${year}-${month}-${day}`;
  }

  private addDaysToDateKey(
    dateKey: string,
    days: number,
  ) {
    const validDate =
      this.validateDateKey(
        dateKey,
      );

    const [
      year,
      month,
      day,
    ] =
      validDate
        .split('-')
        .map(Number);

    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day,
        ),
      );

    date.setUTCDate(
      date.getUTCDate() +
        days,
    );

    return [
      date.getUTCFullYear(),

      String(
        date.getUTCMonth() +
          1,
      ).padStart(
        2,
        '0',
      ),

      String(
        date.getUTCDate(),
      ).padStart(
        2,
        '0',
      ),
    ].join(
      '-',
    );
  }

  private getDaysBetween(
    startDate: string,
    endDate: string,
  ) {
    const [
      startYear,
      startMonth,
      startDay,
    ] =
      this.validateDateKey(
        startDate,
      )
        .split('-')
        .map(Number);

    const [
      endYear,
      endMonth,
      endDay,
    ] =
      this.validateDateKey(
        endDate,
      )
        .split('-')
        .map(Number);

    const start =
      Date.UTC(
        startYear,
        startMonth - 1,
        startDay,
      );

    const end =
      Date.UTC(
        endYear,
        endMonth - 1,
        endDay,
      );

    return Math.floor(
      (end -
        start) /
        86400000,
    );
  }

  private async whoopApiGet<T>(
    path: string,
    accessToken: string,
  ): Promise<T> {
    const response =
      await fetch(
        `${this.apiUrl}${path}`,
        {
          method:
            'GET',

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            Accept:
              'application/json',
          },
        },
      );

    if (
      response.status ===
      401
    ) {
      throw new UnauthorizedException(
        'WHOOP access token is invalid or expired.',
      );
    }

    if (
      !response.ok
    ) {
      const body =
        await response.text();

      throw new BadRequestException(
        `WHOOP API request failed: ${response.status} ${body}`,
      );
    }

    return (
      await response.json()
    ) as T;
  }

  private sleep(
    milliseconds: number,
  ) {
    return new Promise<void>(
      (
        resolve,
      ) => {
        setTimeout(
          resolve,
          milliseconds,
        );
      },
    );
  }
}