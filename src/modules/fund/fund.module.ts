import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { HsakaaOwnerSessionGuard } from '../../hsakaa/guards/hsakaa-owner-session.guard';
import { AiModule } from '../ai/ai.module';
import { FundAdminController } from './fund-admin.controller';
import { FundAiService } from './fund-ai.service';
import { FundController } from './fund.controller';
import { FundCryptoService } from './fund-crypto.service';
import { FundNotificationService } from './fund-notification.service';
import { FundService } from './fund.service';
import { FundCase, FundCaseSchema } from './schemas/fund-case.schema';
import {
  FundEvidence,
  FundEvidenceSchema,
} from './schemas/fund-evidence.schema';

@Module({
  imports: [
    AiModule,
    MongooseModule.forFeature([
      { name: FundCase.name, schema: FundCaseSchema },
      { name: FundEvidence.name, schema: FundEvidenceSchema },
    ]),
  ],
  controllers: [FundController, FundAdminController],
  providers: [
    FundService,
    FundCryptoService,
    FundAiService,
    FundNotificationService,
    HsakaaOwnerSessionGuard,
  ],
  exports: [FundService],
})
export class FundModule {}
