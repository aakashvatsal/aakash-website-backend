import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { randomBytes, randomUUID } from 'node:crypto';
import { Model, Types } from 'mongoose';

import {
  FUND_ALLOWED_EVIDENCE_MIME_TYPES,
  FUND_CONTACT_CONFIDENCE_THRESHOLD,
  FUND_MAX_EVIDENCE_FILE_BYTES,
  FUND_MONTHLY_ALLOCATION_INR,
  FUND_REVIEW_TARGET_HOURS,
  FUND_START_AT,
  FUND_START_MONTH,
} from './fund.constants';
import { FundCryptoService } from './fund-crypto.service';
import {
  FundAiService,
  FundAssessment,
  FundAssessmentContact,
  FundAssessmentPayment,
  FundAssessmentRiskSignal,
  FundEvidenceAnalysis,
} from './fund-ai.service';
import { FundNotificationService } from './fund-notification.service';
import { FundChatDto, FundPublicCaseQueryDto } from './dto/fund-chat.dto';
import { FundEvidenceUploadDto } from './dto/fund-evidence.dto';
import {
  FundAmountOverrideDto,
  FundDecisionDto,
  FundMarkPaidDto,
} from './dto/fund-admin.dto';
import {
  FundCase,
  FundCaseDocument,
  FundCauseCategory,
  FundCaseStatus,
  FundDecisionType,
  FundDeliveryStatus,
  FundMessageRole,
  FundRiskSignal,
} from './schemas/fund-case.schema';
import {
  FundEvidence,
  FundEvidenceDocument,
} from './schemas/fund-evidence.schema';

export interface UploadedFundFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface FundContact {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  preferredContactMethod?: 'email' | 'whatsapp' | 'phone' | null;
}

export interface FundPayment {
  upi?: string | null;
  bankAccount?: string | null;
  ifsc?: string | null;
  accountHolderName?: string | null;
}

interface StoredMessage {
  id: string;
  role: FundMessageRole;
  content: string;
  createdAt: Date;
}

export interface HsakaaFundRouteResult {
  kind: 'case' | 'info';
  answer: string;
  fund: {
    active: boolean;
    caseId?: string;
    caseReference?: string;
    status?: string;
    reviewTargetAt?: string | null;
    contactCaptureStarted?: boolean;
    canUploadEvidence?: boolean;
    startsAt: string;
    monthlyAllocation: number;
    humanApprovalRequired: true;
    reviewTargetHours: number;
  };
}

@Injectable()
export class FundService {
  private readonly rateLimits = new Map<
    string,
    { count: number; resetAt: number }
  >();

  constructor(
    @InjectModel(FundCase.name)
    private readonly caseModel: Model<FundCaseDocument>,
    @InjectModel(FundEvidence.name)
    private readonly evidenceModel: Model<FundEvidenceDocument>,
    private readonly crypto: FundCryptoService,
    private readonly fundAi: FundAiService,
    private readonly notificationService: FundNotificationService,
    private readonly configService: ConfigService,
  ) {}

  getAvailability() {
    const now = new Date();
    const prelaunchEnabled = this.isPrelaunchEnabled();

    return {
      enabled: now >= FUND_START_AT || prelaunchEnabled,
      startsAt: FUND_START_AT.toISOString(),
      prelaunchEnabled,
      monthlyAllocation: FUND_MONTHLY_ALLOCATION_INR,
      humanApprovalRequired: true,
      reviewTargetHours: FUND_REVIEW_TARGET_HOURS,
    };
  }

  async chat(dto: FundChatDto) {
    this.assertAvailable();
    const sessionHash = this.crypto.sessionHash(dto.sessionId);
    this.consumeRateLimit(`chat:${sessionHash}`, 18, 60_000);

    const fundCase = await this.getOrCreatePublicCase(dto, sessionHash);
    return this.continueCaseConversation(fundCase, dto.message);
  }

  async routeHsakaaMessage(params: {
    sessionId: string;
    conversationId: string;
    message: string;
    previousMessages?: Array<{
      role: 'user' | 'assistant';
      content: string;
      metadata?: Record<string, unknown>;
    }>;
  }): Promise<HsakaaFundRouteResult | null> {
    const sessionHash = this.crypto.sessionHash(params.sessionId);
    const linkedCase = await this.caseModel
      .findOne({
        publicConversationId: params.conversationId,
        publicSessionHash: sessionHash,
      })
      .sort({ createdAt: -1 });

    const isOpenCase = Boolean(
      linkedCase &&
      [
        FundCaseStatus.COLLECTING,
        FundCaseStatus.REVIEW_READY,
        FundCaseStatus.NEEDS_INFORMATION,
      ].includes(linkedCase.status),
    );

    const directIntent = isOpenCase
      ? 'apply'
      : this.classifyHsakaaFundIntent(params.message);
    const confirmedApplication =
      !isOpenCase &&
      directIntent === 'none' &&
      this.isHsakaaFundApplicationConfirmation(
        params.message,
        params.previousMessages ?? [],
      );
    const isFundInfoFollowUp =
      !isOpenCase &&
      !confirmedApplication &&
      directIntent === 'none' &&
      this.isHsakaaFundInfoFollowUp(
        params.message,
        params.previousMessages ?? [],
      );
    const intent = confirmedApplication
      ? 'apply'
      : isFundInfoFollowUp
        ? 'info'
        : directIntent;

    if (intent === 'none') {
      return null;
    }

    const availability = this.getAvailability();

    if (intent === 'confirm') {
      return {
        kind: 'info',
        answer: availability.enabled
          ? 'If you mean financial support through HSAKAA Aid, I can help with that. Is money the blocker for this situation?'
          : 'If you mean financial support through HSAKAA Aid, I can explain how it works. The public program opens on October 1, 2026.',
        fund: {
          active: false,
          startsAt: availability.startsAt,
          monthlyAllocation: availability.monthlyAllocation,
          humanApprovalRequired: true,
          reviewTargetHours: availability.reviewTargetHours,
        },
      };
    }

    if (intent === 'info') {
      return {
        kind: 'info',
        answer: this.buildFundInfoReply(
          availability.enabled,
          false,
          params.message,
        ),
        fund: {
          active: false,
          startsAt: availability.startsAt,
          monthlyAllocation: availability.monthlyAllocation,
          humanApprovalRequired: true,
          reviewTargetHours: availability.reviewTargetHours,
        },
      };
    }

    if (!availability.enabled) {
      return {
        kind: 'info',
        answer: this.buildFundInfoReply(false, true, params.message),
        fund: {
          active: false,
          startsAt: availability.startsAt,
          monthlyAllocation: availability.monthlyAllocation,
          humanApprovalRequired: true,
          reviewTargetHours: availability.reviewTargetHours,
        },
      };
    }

    if (
      linkedCase &&
      [
        FundCaseStatus.APPROVED,
        FundCaseStatus.NOT_APPROVED,
        FundCaseStatus.PAID,
      ].includes(linkedCase.status)
    ) {
      return {
        kind: 'info',
        answer:
          'This HSAKAA conversation already has a completed Fund case. If this is a different situation, start a new chat and explain the new request there. The previous case remains securely available to the human reviewer.',
        fund: {
          active: false,
          caseId: linkedCase.id,
          caseReference: linkedCase.caseReference,
          status: this.publicStatus(linkedCase.status),
          reviewTargetAt: linkedCase.reviewTargetAt?.toISOString() ?? null,
          startsAt: availability.startsAt,
          monthlyAllocation: availability.monthlyAllocation,
          humanApprovalRequired: true,
          reviewTargetHours: availability.reviewTargetHours,
        },
      };
    }

    this.consumeRateLimit(`chat:${sessionHash}`, 18, 60_000);

    const creatingCase = !linkedCase;
    const fundCase =
      linkedCase ||
      (await this.getOrCreatePublicCase(
        {
          sessionId: params.sessionId,
          message: params.message,
        },
        sessionHash,
        params.conversationId,
      ));

    if (creatingCase && params.previousMessages?.length) {
      for (const previous of params.previousMessages.slice(-8)) {
        const content = this.cleanUserText(previous.content);
        if (!content) continue;
        this.appendMessage(
          fundCase,
          previous.role === 'user'
            ? FundMessageRole.USER
            : FundMessageRole.ASSISTANT,
          content,
        );
      }
    }

    if (!fundCase.publicConversationId) {
      fundCase.publicConversationId = params.conversationId;
    }

    const result = await this.continueCaseConversation(
      fundCase,
      params.message,
    );

    return {
      kind: 'case',
      answer: result.message,
      fund: {
        active: true,
        caseId: result.caseId,
        caseReference: result.caseReference,
        status: result.status,
        reviewTargetAt: result.reviewTargetAt,
        contactCaptureStarted: result.contactCaptureStarted,
        canUploadEvidence: result.canUploadEvidence,
        startsAt: availability.startsAt,
        monthlyAllocation: availability.monthlyAllocation,
        humanApprovalRequired: true,
        reviewTargetHours: availability.reviewTargetHours,
      },
    };
  }

  private async continueCaseConversation(
    fundCase: FundCaseDocument,
    rawMessage: string,
  ) {
    const userMessage = this.cleanUserText(rawMessage);
    this.appendMessage(fundCase, FundMessageRole.USER, userMessage);
    await fundCase.save();

    const messages = this.decryptMessages(fundCase);
    const currentContact =
      this.crypto.decryptJson<FundContact>(fundCase.contactEncrypted) || {};
    const currentPayment =
      this.crypto.decryptJson<FundPayment>(fundCase.paymentEncrypted) || {};

    let assessment: FundAssessment;
    try {
      assessment = await this.fundAi.assessConversation({
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        current: {
          caseConfidence: fundCase.caseConfidence,
          evidenceConfidence: fundCase.evidenceConfidence,
          consistency: fundCase.consistency,
          requestedAmount: fundCase.requestedAmount,
          suggestedAmount: fundCase.suggestedAmount,
          contact: this.contactForAi(currentContact),
          payment: this.paymentForAi(currentPayment),
          whyMaySucceed: fundCase.whyMaySucceed,
          whyMayNot: fundCase.whyMayNot,
          missingVerification: fundCase.missingVerification,
        },
      });
    } catch {
      assessment = this.fallbackAssessment(
        fundCase,
        currentContact,
        currentPayment,
      );
    }

    this.applyAssessment(fundCase, assessment, currentContact, currentPayment);
    await this.refreshDuplicateSignals(fundCase);

    const publicReply = this.buildApplicantReply(
      assessment.assistantMessage,
      fundCase,
    );

    this.appendMessage(fundCase, FundMessageRole.ASSISTANT, publicReply);
    await fundCase.save();

    return this.publicCasePayload(fundCase, publicReply);
  }

  async getPublicCase(caseId: string, query: FundPublicCaseQueryDto) {
    this.assertAvailable();
    const fundCase = await this.findPublicCase(
      caseId,
      this.crypto.sessionHash(query.sessionId),
    );

    return {
      caseId: fundCase.id,
      caseReference: fundCase.caseReference,
      status: this.publicStatus(fundCase.status),
      reviewTargetAt: fundCase.reviewTargetAt?.toISOString() ?? null,
      messages: this.decryptMessages(fundCase).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
    };
  }

  async uploadEvidence(dto: FundEvidenceUploadDto, files: UploadedFundFile[]) {
    this.assertAvailable();
    const sessionHash = this.crypto.sessionHash(dto.sessionId);
    this.consumeRateLimit(`evidence:${sessionHash}`, 6, 10 * 60_000);

    if (!files.length) {
      throw new BadRequestException('Attach at least one image or PDF.');
    }

    const fundCase = await this.findPublicCase(dto.caseId, sessionHash);
    const transcript = this.decryptMessages(fundCase)
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n');

    const uploaded: Array<{
      evidenceId: string;
      filename: string;
      analysisAvailable: boolean;
    }> = [];
    const analyses: FundEvidenceAnalysis[] = [];

    for (const file of files) {
      this.validateEvidenceFile(file);
      const evidenceId = randomUUID();
      const sha256 = this.crypto.sha256(file.buffer);
      const evidence = await this.evidenceModel.create({
        caseId: fundCase._id,
        evidenceId,
        filenameEncrypted: this.crypto.encryptText(file.originalname),
        mimeType: file.mimetype,
        size: file.size,
        sha256,
        payloadEncrypted: this.crypto.encryptBuffer(file.buffer),
        analysisFailed: false,
      });

      let analysisAvailable = false;
      try {
        const analysis = await this.fundAi.analyzeEvidence({
          filename: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
          transcript,
          requestedAmount: fundCase.requestedAmount,
          suggestedAmount: fundCase.suggestedAmount,
        });
        evidence.analysisEncrypted = this.crypto.encryptJson(analysis);
        evidence.analyzedAt = new Date();
        analyses.push(analysis);
        analysisAvailable = true;
      } catch {
        evidence.analysisFailed = true;
      }

      await evidence.save();
      uploaded.push({
        evidenceId,
        filename: file.originalname,
        analysisAvailable,
      });
    }

    if (analyses.length) {
      const averageEvidence = Math.round(
        analyses.reduce((sum, item) => sum + item.evidenceConfidence, 0) /
          analyses.length,
      );
      const averageConsistency = Math.round(
        analyses.reduce((sum, item) => sum + item.consistency, 0) /
          analyses.length,
      );
      fundCase.evidenceConfidence = fundCase.evidenceConfidence
        ? Math.round((fundCase.evidenceConfidence + averageEvidence) / 2)
        : averageEvidence;
      fundCase.consistency = Math.round(
        (fundCase.consistency + averageConsistency) / 2,
      );
      fundCase.missingVerification = this.uniqueStrings([
        ...fundCase.missingVerification,
        ...analyses.flatMap((item) => item.missingVerification),
      ]);
      fundCase.riskSignals = this.mergeRiskSignals(
        fundCase.riskSignals,
        analyses.flatMap((item) => item.riskSignals),
      );
    }

    await this.refreshDuplicateSignals(fundCase);

    const applicantMessage = this.buildEvidenceReply(analyses, files.length);
    this.appendMessage(fundCase, FundMessageRole.ASSISTANT, applicantMessage);
    await fundCase.save();

    return {
      caseId: fundCase.id,
      caseReference: fundCase.caseReference,
      message: applicantMessage,
      files: uploaded,
    };
  }

  async getDashboard(month?: string) {
    const monthKey = this.resolveMonthKey(month);
    const metrics = await this.getBudgetMetrics(monthKey);
    const cases = await this.caseModel
      .find()
      .sort({ createdAt: -1 })
      .limit(250);

    return {
      month: monthKey,
      startsAt: FUND_START_AT.toISOString(),
      allocation: FUND_MONTHLY_ALLOCATION_INR,
      ...metrics,
      causeAnalytics: await this.getCauseAnalytics(),
      cases: cases.map((fundCase) => this.adminCaseSummary(fundCase)),
    };
  }

  async getAdminCase(caseId: string) {
    const fundCase = await this.requireCase(caseId);
    const evidence = await this.evidenceModel
      .find({ caseId: fundCase._id })
      .sort({ createdAt: 1 });

    return {
      ...this.adminCaseSummary(fundCase),
      messages: this.decryptMessages(fundCase).map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
      })),
      evidence: evidence.map((item) => ({
        evidenceId: item.evidenceId,
        filename: this.crypto.decryptText(item.filenameEncrypted) || 'evidence',
        mimeType: item.mimeType,
        size: item.size,
        analyzedAt: item.analyzedAt?.toISOString() ?? null,
        analysisFailed: item.analysisFailed,
        analysis:
          this.crypto.decryptJson<FundEvidenceAnalysis>(
            item.analysisEncrypted,
          ) || null,
      })),
    };
  }

  async decide(caseId: string, dto: FundDecisionDto) {
    const fundCase = await this.requireCase(caseId);
    if (fundCase.status === FundCaseStatus.PAID) {
      throw new BadRequestException('Paid cases cannot be re-decided.');
    }
    const reason = this.cleanDecisionReason(dto.reason);
    const monthKey = this.resolveMonthKey();

    if (dto.action === 'approve') {
      const amount =
        dto.amount ?? fundCase.suggestedAmount ?? fundCase.requestedAmount;
      if (!amount || amount <= 0) {
        throw new BadRequestException(
          'Set an assistance amount before approving this case.',
        );
      }
      await this.assertBudgetAvailable(fundCase, monthKey, amount);
      fundCase.status = FundCaseStatus.APPROVED;
      fundCase.decision.type = FundDecisionType.APPROVE;
      fundCase.decision.assistanceAmount = amount;
    } else if (dto.action === 'needs_more_information') {
      fundCase.status = FundCaseStatus.NEEDS_INFORMATION;
      fundCase.decision.type = FundDecisionType.NEEDS_MORE_INFORMATION;
      fundCase.decision.assistanceAmount = undefined;
    } else {
      fundCase.status = FundCaseStatus.NOT_APPROVED;
      fundCase.decision.type = FundDecisionType.NOT_APPROVE;
      fundCase.decision.assistanceAmount = undefined;
    }

    fundCase.decision.reasonEncrypted = this.crypto.encryptText(reason);
    fundCase.decision.decidedAt = new Date();
    fundCase.decision.decisionMonthKey = monthKey;
    fundCase.decision.delivery.emailStatus = FundDeliveryStatus.NOT_ATTEMPTED;
    fundCase.decision.delivery.whatsappStatus =
      FundDeliveryStatus.NOT_ATTEMPTED;
    fundCase.decision.delivery.manualContactRequired = false;
    await fundCase.save();

    await this.deliverDecision(fundCase, reason);
    await fundCase.save();

    return this.getAdminCase(fundCase.id);
  }

  async overrideAmount(caseId: string, dto: FundAmountOverrideDto) {
    const fundCase = await this.requireCase(caseId);
    if (fundCase.status === FundCaseStatus.PAID) {
      throw new BadRequestException(
        'Paid cases cannot have their assistance amount changed.',
      );
    }
    const monthKey =
      fundCase.decision.decisionMonthKey || this.resolveMonthKey();

    if (fundCase.status === FundCaseStatus.APPROVED) {
      await this.assertBudgetAvailable(fundCase, monthKey, dto.amount);
      fundCase.decision.assistanceAmount = dto.amount;
    }

    fundCase.suggestedAmount = dto.amount;
    await fundCase.save();
    return this.getAdminCase(fundCase.id);
  }

  async markPaid(caseId: string, dto: FundMarkPaidDto) {
    const fundCase = await this.requireCase(caseId);
    if (fundCase.status !== FundCaseStatus.APPROVED) {
      throw new BadRequestException('Only approved cases can be marked paid.');
    }

    const approvedAmount = fundCase.decision.assistanceAmount;
    if (!approvedAmount) {
      throw new BadRequestException('Approved assistance amount is missing.');
    }

    const paidAmount = dto.amount ?? approvedAmount;
    if (paidAmount !== approvedAmount) {
      await this.assertBudgetAvailable(
        fundCase,
        fundCase.decision.decisionMonthKey || this.resolveMonthKey(),
        paidAmount,
      );
      fundCase.decision.assistanceAmount = paidAmount;
    }

    fundCase.status = FundCaseStatus.PAID;
    fundCase.paidAmount = paidAmount;
    fundCase.paidAt = new Date();
    fundCase.paymentReferenceEncrypted = this.crypto.encryptText(
      dto.paymentReference.trim(),
    );
    await fundCase.save();
    return this.getAdminCase(fundCase.id);
  }

  async resendDecision(caseId: string) {
    const fundCase = await this.requireCase(caseId);
    const reason = this.crypto.decryptText(fundCase.decision.reasonEncrypted);
    if (!fundCase.decision.type || !reason) {
      throw new BadRequestException(
        'This case does not have a final review update.',
      );
    }

    await this.deliverDecision(fundCase, reason);
    await fundCase.save();
    return this.getAdminCase(fundCase.id);
  }

  async getEvidenceFile(caseId: string, evidenceId: string) {
    const fundCase = await this.requireCase(caseId);
    const evidence = await this.evidenceModel.findOne({
      caseId: fundCase._id,
      evidenceId,
    });
    if (!evidence) {
      throw new NotFoundException('Evidence not found.');
    }

    return {
      filename:
        this.crypto.decryptText(evidence.filenameEncrypted) || 'evidence',
      mimeType: evidence.mimeType,
      buffer: this.crypto.decryptBuffer(evidence.payloadEncrypted),
    };
  }

  private async getOrCreatePublicCase(
    dto: FundChatDto,
    sessionHash: string,
    publicConversationId?: string,
  ) {
    if (dto.caseId) {
      return this.findPublicCase(dto.caseId, sessionHash);
    }

    return this.caseModel.create({
      caseReference: this.createCaseReference(),
      publicSessionHash: sessionHash,
      publicConversationId,
      status: FundCaseStatus.COLLECTING,
      prelaunchCase: new Date() < FUND_START_AT,
      messages: [],
      caseConfidence: 0,
      evidenceConfidence: 0,
      consistency: 50,
      riskSignals: [],
      whyMaySucceed: [],
      whyMayNot: [],
      missingVerification: [],
      decision: { delivery: {} },
    });
  }

  private async findPublicCase(caseId: string, sessionHash: string) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new NotFoundException('Fund case not found for this session.');
    }

    const fundCase = await this.caseModel.findOne({
      _id: new Types.ObjectId(caseId),
      publicSessionHash: sessionHash,
    });

    if (!fundCase) {
      throw new NotFoundException('Fund case not found for this session.');
    }

    return fundCase;
  }

  private async requireCase(caseId: string) {
    if (!Types.ObjectId.isValid(caseId)) {
      throw new BadRequestException('Invalid Fund case ID.');
    }
    const fundCase = await this.caseModel.findById(caseId);
    if (!fundCase) {
      throw new NotFoundException('Fund case not found.');
    }
    return fundCase;
  }

  private applyAssessment(
    fundCase: FundCaseDocument,
    assessment: FundAssessment,
    existingContact: FundContact,
    existingPayment: FundPayment,
  ) {
    fundCase.caseConfidence = this.clampScore(assessment.caseConfidence);
    fundCase.evidenceConfidence = Math.max(
      fundCase.evidenceConfidence,
      this.clampScore(assessment.evidenceConfidence),
    );
    fundCase.consistency = this.clampScore(assessment.consistency);

    if (
      assessment.requestedAmount !== null &&
      assessment.requestedAmount >= 0
    ) {
      fundCase.requestedAmount = assessment.requestedAmount;
    }
    if (
      assessment.suggestedAmount !== null &&
      assessment.suggestedAmount >= 0
    ) {
      fundCase.suggestedAmount = assessment.suggestedAmount;
    }

    fundCase.causeCategory = assessment.causeCategory;
    fundCase.causeConfidence = this.clampScore(assessment.causeConfidence);
    fundCase.causeSummary = assessment.causeSummary?.trim()
      ? this.cleanInternalSummary(assessment.causeSummary)
      : undefined;

    const mergedContact = this.mergeContact(
      existingContact,
      assessment.contact,
    );
    if (Object.values(mergedContact).some(Boolean)) {
      fundCase.contactEncrypted = this.crypto.encryptJson(mergedContact);
      fundCase.contactHashes = {
        phone: mergedContact.phone
          ? this.crypto.lookupHash(mergedContact.phone, 'phone')
          : undefined,
        email: mergedContact.email
          ? this.crypto.lookupHash(mergedContact.email, 'email')
          : undefined,
      };
    }

    const mergedPayment = this.mergePayment(
      existingPayment,
      assessment.payment,
    );
    if (Object.values(mergedPayment).some(Boolean)) {
      fundCase.paymentEncrypted = this.crypto.encryptJson(mergedPayment);
      fundCase.paymentHashes = {
        upi: mergedPayment.upi
          ? this.crypto.lookupHash(mergedPayment.upi, 'upi')
          : undefined,
        bankAccount: mergedPayment.bankAccount
          ? this.crypto.lookupHash(mergedPayment.bankAccount, 'bank')
          : undefined,
      };
    }

    fundCase.whyMaySucceed = this.uniqueStrings(assessment.whyMaySucceed);
    fundCase.whyMayNot = this.uniqueStrings(assessment.whyMayNot);
    fundCase.missingVerification = this.uniqueStrings(
      assessment.missingVerification,
    );
    fundCase.riskSignals = this.mergeRiskSignals([], assessment.riskSignals);

    if (
      fundCase.caseConfidence >= FUND_CONTACT_CONFIDENCE_THRESHOLD &&
      this.isContactComplete(mergedContact) &&
      !fundCase.contactCapturedAt
    ) {
      const capturedAt = new Date();
      fundCase.contactCapturedAt = capturedAt;
      fundCase.reviewTargetAt = new Date(
        capturedAt.getTime() + FUND_REVIEW_TARGET_HOURS * 60 * 60 * 1000,
      );
      if (fundCase.status === FundCaseStatus.COLLECTING) {
        fundCase.status = FundCaseStatus.REVIEW_READY;
      }
    }
  }

  private async refreshDuplicateSignals(fundCase: FundCaseDocument) {
    const preserved = fundCase.riskSignals.filter(
      (signal) => !signal.code.startsWith('DUPLICATE_'),
    );
    const duplicateSignals: FundAssessmentRiskSignal[] = [];
    const checks: Array<{
      code: string;
      path: string;
      hash?: string;
      label: string;
    }> = [
      {
        code: 'DUPLICATE_PHONE',
        path: 'contactHashes.phone',
        hash: fundCase.contactHashes.phone,
        label: 'Phone number',
      },
      {
        code: 'DUPLICATE_EMAIL',
        path: 'contactHashes.email',
        hash: fundCase.contactHashes.email,
        label: 'Email address',
      },
      {
        code: 'DUPLICATE_UPI',
        path: 'paymentHashes.upi',
        hash: fundCase.paymentHashes.upi,
        label: 'UPI destination',
      },
      {
        code: 'DUPLICATE_BANK',
        path: 'paymentHashes.bankAccount',
        hash: fundCase.paymentHashes.bankAccount,
        label: 'Bank account',
      },
    ];

    for (const check of checks) {
      if (!check.hash) continue;
      const count = await this.caseModel.countDocuments({
        _id: { $ne: fundCase._id },
        [check.path]: check.hash,
      });
      if (count > 0) {
        duplicateSignals.push({
          code: check.code,
          summary: `${check.label} also appears in ${count} other Fund case${count === 1 ? '' : 's'}. Review context before deciding.`,
          severity: 'medium',
        });
      }
    }

    const hashes = await this.evidenceModel.distinct('sha256', {
      caseId: fundCase._id,
    });
    if (hashes.length) {
      const matches = await this.evidenceModel.distinct('caseId', {
        caseId: { $ne: fundCase._id },
        sha256: { $in: hashes },
      });
      if (matches.length) {
        duplicateSignals.push({
          code: 'DUPLICATE_DOCUMENT',
          summary: `One or more uploaded files match evidence used in ${matches.length} other Fund case${matches.length === 1 ? '' : 's'}. Review the relationship and context.`,
          severity: 'medium',
        });
      }
    }

    fundCase.riskSignals = this.mergeRiskSignals(preserved, duplicateSignals);
  }

  private adminCaseSummary(fundCase: FundCaseDocument) {
    const contact =
      this.crypto.decryptJson<FundContact>(fundCase.contactEncrypted) || null;
    const payment =
      this.crypto.decryptJson<FundPayment>(fundCase.paymentEncrypted) || null;
    const reason =
      this.crypto.decryptText(fundCase.decision.reasonEncrypted) || null;
    const paymentReference =
      this.crypto.decryptText(fundCase.paymentReferenceEncrypted) || null;
    const createdAt = fundCase.get('createdAt') as Date | undefined;
    const updatedAt = fundCase.get('updatedAt') as Date | undefined;

    return {
      id: fundCase.id,
      caseReference: fundCase.caseReference,
      status: fundCase.status,
      contact,
      payment,
      requestedAmount: fundCase.requestedAmount ?? null,
      suggestedAmount: fundCase.suggestedAmount ?? null,
      causeCategory: fundCase.causeCategory ?? FundCauseCategory.UNCLASSIFIED,
      causeConfidence: fundCase.causeConfidence ?? 0,
      causeSummary: fundCase.causeSummary ?? null,
      caseConfidence: fundCase.caseConfidence,
      evidenceConfidence: fundCase.evidenceConfidence,
      consistency: fundCase.consistency,
      riskSignals: fundCase.riskSignals,
      whyMaySucceed: fundCase.whyMaySucceed,
      whyMayNot: fundCase.whyMayNot,
      missingVerification: fundCase.missingVerification,
      contactCapturedAt: fundCase.contactCapturedAt?.toISOString() ?? null,
      reviewTargetAt: fundCase.reviewTargetAt?.toISOString() ?? null,
      decision: {
        type: fundCase.decision.type ?? null,
        reason,
        assistanceAmount: fundCase.decision.assistanceAmount ?? null,
        decidedAt: fundCase.decision.decidedAt?.toISOString() ?? null,
        decisionMonthKey: fundCase.decision.decisionMonthKey ?? null,
        delivery: fundCase.decision.delivery,
      },
      paidAt: fundCase.paidAt?.toISOString() ?? null,
      paidAmount: fundCase.paidAmount ?? null,
      paymentReference,
      prelaunchCase: fundCase.prelaunchCase,
      createdAt: createdAt?.toISOString() ?? null,
      updatedAt: updatedAt?.toISOString() ?? null,
    };
  }

  private cleanInternalSummary(value: string) {
    return value
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 500);
  }

  private async getCauseAnalytics() {
    const rows = await this.caseModel.aggregate<{
      _id: FundCauseCategory;
      cases: number;
      approvedCases: number;
      requestedAmount: number;
      approvedAmount: number;
      paidAmount: number;
    }>([
      {
        $group: {
          _id: {
            $ifNull: ['$causeCategory', FundCauseCategory.UNCLASSIFIED],
          },
          cases: { $sum: 1 },
          approvedCases: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [FundCaseStatus.APPROVED, FundCaseStatus.PAID],
                  ],
                },
                1,
                0,
              ],
            },
          },
          requestedAmount: { $sum: { $ifNull: ['$requestedAmount', 0] } },
          approvedAmount: {
            $sum: {
              $cond: [
                {
                  $in: [
                    '$status',
                    [FundCaseStatus.APPROVED, FundCaseStatus.PAID],
                  ],
                },
                { $ifNull: ['$decision.assistanceAmount', 0] },
                0,
              ],
            },
          },
          paidAmount: {
            $sum: {
              $cond: [
                { $eq: ['$status', FundCaseStatus.PAID] },
                { $ifNull: ['$paidAmount', 0] },
                0,
              ],
            },
          },
        },
      },
    ]);

    const byCategory = new Map(rows.map((row) => [row._id, row]));
    return Object.values(FundCauseCategory).map((category) => {
      const row = byCategory.get(category);
      return {
        category,
        cases: row?.cases ?? 0,
        approvedCases: row?.approvedCases ?? 0,
        requestedAmount: row?.requestedAmount ?? 0,
        approvedAmount: row?.approvedAmount ?? 0,
        paidAmount: row?.paidAmount ?? 0,
      };
    });
  }

  private async getBudgetMetrics(monthKey: string) {
    const approvedCases = await this.caseModel.find({
      status: { $in: [FundCaseStatus.APPROVED, FundCaseStatus.PAID] },
      'decision.decisionMonthKey': monthKey,
    });

    const approvedAmount = approvedCases.reduce(
      (sum, item) => sum + (item.decision.assistanceAmount || 0),
      0,
    );
    const paidAmount = approvedCases
      .filter((item) => item.status === FundCaseStatus.PAID)
      .reduce((sum, item) => sum + (item.paidAmount || 0), 0);
    const committedAmount = Math.max(0, approvedAmount - paidAmount);

    return {
      available: Math.max(0, FUND_MONTHLY_ALLOCATION_INR - approvedAmount),
      approved: approvedAmount,
      committed: committedAmount,
      paid: paidAmount,
      approvedCases: approvedCases.length,
    };
  }

  private async assertBudgetAvailable(
    fundCase: FundCaseDocument,
    monthKey: string,
    nextAmount: number,
  ) {
    const metrics = await this.getBudgetMetrics(monthKey);
    const currentCommitted =
      fundCase.decision.decisionMonthKey === monthKey &&
      [FundCaseStatus.APPROVED, FundCaseStatus.PAID].includes(fundCase.status)
        ? fundCase.decision.assistanceAmount || 0
        : 0;
    const projected = metrics.approved - currentCommitted + nextAmount;

    if (projected > FUND_MONTHLY_ALLOCATION_INR) {
      throw new ForbiddenException(
        `This approval would exceed the ₹${FUND_MONTHLY_ALLOCATION_INR.toLocaleString('en-IN')} monthly Fund allocation.`,
      );
    }
  }

  private async deliverDecision(fundCase: FundCaseDocument, reason: string) {
    const contact =
      this.crypto.decryptJson<FundContact>(fundCase.contactEncrypted) || {};
    const decisionLabel = this.decisionLabel(fundCase.decision.type);
    const result = await this.notificationService.deliver(contact, {
      caseReference: fundCase.caseReference,
      decisionLabel,
      reason,
      amount: fundCase.decision.assistanceAmount,
    });

    fundCase.decision.delivery.emailStatus = result.emailStatus;
    fundCase.decision.delivery.whatsappStatus = result.whatsappStatus;
    fundCase.decision.delivery.manualContactRequired =
      result.manualContactRequired;
    fundCase.decision.delivery.lastAttemptAt = new Date();
    fundCase.decision.delivery.lastError = result.lastError;
  }

  private decisionLabel(type?: FundDecisionType) {
    if (type === FundDecisionType.APPROVE) return 'Approved';
    if (type === FundDecisionType.NEEDS_MORE_INFORMATION)
      return 'More information needed';
    if (type === FundDecisionType.NOT_APPROVE) return 'Not approved';
    return 'Reviewed';
  }

  private buildApplicantReply(rawMessage: string, fundCase: FundCaseDocument) {
    const safe = this.sanitizeApplicantText(rawMessage);
    const previousAssistant = [...this.decryptMessages(fundCase)]
      .reverse()
      .find((message) => message.role === FundMessageRole.ASSISTANT)?.content;

    if (
      !previousAssistant ||
      this.normalizedReply(previousAssistant) !== this.normalizedReply(safe)
    ) {
      return safe;
    }

    const previous = previousAssistant.toLowerCase();
    const nextVerification = this.applicantSafeItems(
      fundCase.missingVerification,
    ).find((item) => !previous.includes(item.toLowerCase()));

    if (nextVerification) {
      return `I still need to verify: ${nextVerification}.`;
    }

    return 'What is the next document or detail that can verify the request?';
  }

  private buildEvidenceReply(
    analyses: FundEvidenceAnalysis[],
    fileCount: number,
  ) {
    if (!analyses.length) {
      return 'I saved the file securely. A human reviewer can inspect it if automated verification is unavailable.';
    }

    const conflicts = this.uniqueStrings(
      analyses.flatMap((analysis) => analysis.conflicts),
    );
    const missing = this.uniqueStrings(
      analyses.flatMap((analysis) => analysis.missingVerification),
    );
    const next = this.applicantSafeItems([...conflicts, ...missing]).slice(
      0,
      2,
    );

    if (next.length) {
      return `I checked ${fileCount === 1 ? 'the file' : 'the files'}. I still need to verify: ${next.join('; ')}.`;
    }

    return `I checked ${fileCount === 1 ? 'the file' : 'the files'}. I have what I need from ${fileCount === 1 ? 'it' : 'them'} for now.`;
  }

  private publicCasePayload(fundCase: FundCaseDocument, message: string) {
    return {
      caseId: fundCase.id,
      caseReference: fundCase.caseReference,
      status: this.publicStatus(fundCase.status),
      message,
      reviewTargetAt: fundCase.reviewTargetAt?.toISOString() ?? null,
      contactCaptureStarted: Boolean(fundCase.contactCapturedAt),
      canUploadEvidence: true,
    };
  }

  private publicStatus(status: FundCaseStatus) {
    if (status === FundCaseStatus.PAID) return 'paid';
    if (status === FundCaseStatus.APPROVED) return 'reviewed';
    if (status === FundCaseStatus.NOT_APPROVED) return 'reviewed';
    if (status === FundCaseStatus.NEEDS_INFORMATION) return 'needs_information';
    if (status === FundCaseStatus.REVIEW_READY) return 'in_review';
    return 'chatting';
  }

  private appendMessage(
    fundCase: FundCaseDocument,
    role: FundMessageRole,
    content: string,
  ) {
    fundCase.messages.push({
      id: randomUUID(),
      role,
      contentEncrypted: this.crypto.encryptText(content),
      createdAt: new Date(),
    });
  }

  private decryptMessages(fundCase: FundCaseDocument): StoredMessage[] {
    return fundCase.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: this.crypto.decryptText(message.contentEncrypted) || '',
      createdAt: new Date(message.createdAt),
    }));
  }

  private mergeContact(
    existing: FundContact,
    incoming: FundAssessmentContact,
  ): FundContact {
    return {
      fullName: this.prefer(incoming.fullName, existing.fullName),
      phone: this.prefer(incoming.phone, existing.phone),
      email: this.prefer(incoming.email, existing.email),
      preferredContactMethod:
        incoming.preferredContactMethod ||
        existing.preferredContactMethod ||
        null,
    };
  }

  private mergePayment(
    existing: FundPayment,
    incoming: FundAssessmentPayment,
  ): FundPayment {
    return {
      upi: this.prefer(incoming.upi, existing.upi),
      bankAccount: this.prefer(incoming.bankAccount, existing.bankAccount),
      ifsc: this.prefer(incoming.ifsc, existing.ifsc),
      accountHolderName: this.prefer(
        incoming.accountHolderName,
        existing.accountHolderName,
      ),
    };
  }

  private contactForAi(contact: FundContact): FundAssessmentContact {
    return {
      fullName: contact.fullName || null,
      phone: contact.phone || null,
      email: contact.email || null,
      preferredContactMethod: contact.preferredContactMethod || null,
    };
  }

  private paymentForAi(payment: FundPayment): FundAssessmentPayment {
    return {
      upi: payment.upi || null,
      bankAccount: payment.bankAccount || null,
      ifsc: payment.ifsc || null,
      accountHolderName: payment.accountHolderName || null,
    };
  }

  private fallbackAssessment(
    fundCase: FundCaseDocument,
    contact: FundContact,
    payment: FundPayment,
  ): FundAssessment {
    return {
      assistantMessage: fundCase.missingVerification[0]
        ? `I still need to verify: ${fundCase.missingVerification[0]}.`
        : 'What amount do you need, and by when?',
      caseConfidence: fundCase.caseConfidence,
      evidenceConfidence: fundCase.evidenceConfidence,
      consistency: fundCase.consistency,
      requestedAmount: fundCase.requestedAmount ?? null,
      suggestedAmount: fundCase.suggestedAmount ?? null,
      causeCategory: fundCase.causeCategory ?? FundCauseCategory.UNCLASSIFIED,
      causeConfidence: fundCase.causeConfidence ?? 0,
      causeSummary: fundCase.causeSummary ?? null,
      contact: this.contactForAi(contact),
      payment: this.paymentForAi(payment),
      whyMaySucceed: fundCase.whyMaySucceed.length
        ? fundCase.whyMaySucceed
        : [
            'You have started providing a concrete account that can be checked and clarified.',
          ],
      whyMayNot: fundCase.whyMayNot.length
        ? fundCase.whyMayNot
        : [
            'The request still needs enough verifiable detail for a human review.',
          ],
      missingVerification: fundCase.missingVerification.length
        ? fundCase.missingVerification
        : [
            'The reason for assistance, amount, timing and supporting evidence.',
          ],
      riskSignals: fundCase.riskSignals,
    };
  }

  private isContactComplete(contact: FundContact) {
    return Boolean(
      contact.fullName && contact.phone && contact.preferredContactMethod,
    );
  }

  private hasPaymentDestination(payment: FundPayment) {
    return Boolean(payment.upi || payment.bankAccount);
  }

  getPublicKnowledgeContext() {
    const officiallyStarted = new Date() >= FUND_START_AT;
    const availabilityLine = officiallyStarted
      ? 'HSAKAA Aid is active.'
      : 'HSAKAA Aid starts on October 1, 2026.';

    return [
      'HSAKAA AID PUBLIC FACTS',
      availabilityLine,
      'The starting monthly allocation is ₹30,000 across approved assistance cases.',
      'It is for genuine situations where money is the blocker and the request can be verified. There is no fixed public category list; requests are assessed individually.',
      'Applications happen inside the normal HSAKAA chat. There is no separate application form.',
      'HSAKAA should ask only for the next fact, clarification or evidence needed to verify the request and should avoid repetitive case commentary.',
      'Supporting documents, images or PDFs may be requested when relevant.',
      'The review target is 24 hours after contact details are captured.',
      'Every final approval, assistance amount and payment decision is made by a human, not autonomously by HSAKAA.',
      'Fund contact details, payment details, evidence and case conversation data are kept separate from normal HSAKAA Memory.',
      'Never claim that HSAKAA Aid is unconfirmed, fictional or unavailable merely because normal Memory lacks an Aid record. These public facts are authoritative.',
    ].join('\n');
  }

  private validateEvidenceFile(file: UploadedFundFile) {
    if (!FUND_ALLOWED_EVIDENCE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Only PDF, JPG, PNG and WebP evidence files are supported.',
      );
    }
    if (file.size < 1 || file.size > FUND_MAX_EVIDENCE_FILE_BYTES) {
      throw new BadRequestException(
        'Each evidence file must be 5 MB or smaller.',
      );
    }
  }

  private resolveMonthKey(requested?: string) {
    if (requested) return requested;
    const current = this.monthKeyInIndia(new Date());
    return current < FUND_START_MONTH ? FUND_START_MONTH : current;
  }

  private monthKeyInIndia(date: Date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(date);
    const year = parts.find((part) => part.type === 'year')?.value || '1970';
    const month = parts.find((part) => part.type === 'month')?.value || '01';
    return `${year}-${month}`;
  }

  private createCaseReference() {
    const month = this.resolveMonthKey().replace('-', '');
    return `HF-${month}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  private classifyHsakaaFundIntent(
    message: string,
  ): 'apply' | 'info' | 'confirm' | 'none' {
    const text = message.trim().toLowerCase();

    const explicitFundTopic =
      /\b(hsakaa\s+(?:fund|aid)|your\s+(?:fund|aid)|the\s+fund|fund\s+(?:help|assistance|application|support)|financial\s+(?:help|assistance|support)|monetary\s+assistance|aid\s+from\s+hsakaa|grant\s+from\s+hsakaa|(?:do|does)\s+(?:you|hsakaa)\s+have\s+(?:a\s+|any\s+)?(?:fund|aid|financial\s+assistance)|is\s+there\s+(?:a\s+|any\s+)?(?:fund|aid|financial\s+assistance))\b/i;
    const directApplication =
      /\b(?:i|we|my\s+family|our\s+family)\b.{0,80}\b(?:need|require|request|looking\s+for|asking\s+for)\b.{0,80}\b(?:money|financial\s+help|financial\s+assistance|assistance|aid|grant|₹|inr|rupees?|rs\.?|fund\s+help)\b/i;
    const inabilityToPay =
      /\b(?:can'?t|cannot|unable\s+to|struggling\s+to)\s+(?:afford|pay|cover)\b/i;
    const helpWithExpense =
      /\b(?:help|support|assistance)\b.{0,80}\b(?:medical|hospital|medicine|treatment|fees?|school|college|rent|food|bill|bills|expense|expenses|emergency|surgery|test|tests|payment)\b/i;
    const ambiguousSupportRequest =
      /\b(?:i|we|my\s+family|our\s+family)\b.{0,70}\b(?:need|want|require|looking\s+for|asking\s+for)\b.{0,50}\b(?:help|support|assistance)\b/i;
    const sensitiveNeedContext =
      /\b(?:sick|sic|ill|unwell|hospital|doctor|medical|medicine|treatment|health|operation|surgery|test|tests|emergency)\b/i;
    const amountWithNeed =
      /\b(?:need|require|short\s+of|need\s+around)\b.{0,40}(?:₹\s*\d|rs\.?\s*\d|inr\s*\d|\d[\d,]*(?:\s*rupees?)?)/i;

    if (
      directApplication.test(text) ||
      inabilityToPay.test(text) ||
      helpWithExpense.test(text) ||
      amountWithNeed.test(text)
    ) {
      return 'apply';
    }

    if (explicitFundTopic.test(text)) {
      const applicationCue =
        /\b(apply|application|need\s+help|need\s+support|want\s+help|request\s+help|can\s+you\s+help\s+me|i\s+need|we\s+need|connect\s+me|switch\s+me|take\s+me|start\s+(?:an?\s+)?(?:aid|fund)\s+(?:case|request)|open\s+(?:an?\s+)?(?:aid|fund)\s+(?:case|request)|help\s+me\s+apply|let\s+me\s+apply|i\s+want\s+(?:to\s+use\s+)?(?:hsakaa\s+)?(?:aid|fund))\b/i;
      return applicationCue.test(text) ? 'apply' : 'info';
    }

    if (ambiguousSupportRequest.test(text) && sensitiveNeedContext.test(text)) {
      return 'confirm';
    }

    return 'none';
  }

  private isHsakaaFundApplicationConfirmation(
    message: string,
    previousMessages: Array<{
      role: 'user' | 'assistant';
      content: string;
      metadata?: Record<string, unknown>;
    }>,
  ) {
    const text = message
      .trim()
      .toLowerCase()
      .replace(/[?!.]+$/g, '')
      .trim();

    const confirms =
      /^(?:yes|yeah|yep|yup|correct|exactly|yes\s+it\s+is|it\s+is|money\s+is\s+the\s+blocker|yes\s*,?\s*money\s+is\s+the\s+blocker|i\s+mean\s+financial\s+support|financial\s+support)$/i.test(
        text,
      );
    if (!confirms) return false;

    const lastAssistant = [...previousMessages]
      .reverse()
      .find((item) => item.role === 'assistant');
    if (!lastAssistant || lastAssistant.metadata?.fundInfo !== true) {
      return false;
    }

    return /\b(?:is\s+money\s+the\s+blocker|money\s+the\s+blocker|do\s+you\s+mean\s+financial\s+support|if\s+you\s+mean\s+financial\s+support|financial\s+support\s+through\s+hsakaa\s+aid)\b/i.test(
      lastAssistant.content,
    );
  }

  private isHsakaaFundInfoFollowUp(
    message: string,
    previousMessages: Array<{
      role: 'user' | 'assistant';
      content: string;
      metadata?: Record<string, unknown>;
    }>,
  ) {
    const text = message
      .trim()
      .toLowerCase()
      .replace(/[?!.]+$/g, '')
      .trim();

    const hasRecentAidContext = previousMessages.slice(-8).some((item) => {
      if (item.metadata?.fundInfo === true) return true;
      const content = item.content.toLowerCase();
      return /\b(?:hsakaa\s+(?:aid|fund)|₹30,000|30,000\s+(?:allocated|each month)|human-reviewed|human reviewed)\b/i.test(
        content,
      );
    });

    if (!hasRecentAidContext) return false;

    const followUpCue =
      /^(?:and\s+)?(?:what does (?:that|it) mean|what do you mean|what is that|how does (?:that|it|this) work|tell me more|explain(?: that| it| this)?|who can apply|who is (?:it|that) for|when does (?:it|that) start|when is (?:it|that) available|how much(?: is available)?|what is the amount|how do i apply|how can i apply|can i apply|where do i apply|is it available|what happens next)$/i;

    if (followUpCue.test(text)) return true;

    const explicitTopicSwitch =
      /\b(?:8lete|frayto|hsakaa\s+ai|memory\s+system|journal|whoop|health|social\s+media|media\s+system|guitar|chess|books?|companies|company)\b/i;
    if (explicitTopicSwitch.test(text)) return false;

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const conversationalQuestion =
      /^(?:(?:and|so|but|also)\s+)?(?:what|which|who|when|where|why|how|does|do|did|can|could|would|will|is|are|was|were|tell|explain)\b/i;

    return wordCount <= 20 && conversationalQuestion.test(text);
  }

  private buildFundInfoReply(
    enabled: boolean,
    applicationAttempt = false,
    message = '',
  ) {
    const text = message
      .trim()
      .toLowerCase()
      .replace(/what['’]?s/g, 'what is')
      .replace(/\s+/g, ' ');
    const officiallyStarted = new Date() >= FUND_START_AT;

    const asksScope =
      /\bwhat\s+is\s+it\s+solv(?:e|ing)\b/i.test(text) ||
      /\b(?:problem|problems|cause|causes|case|cases|need|needs|situation|situations)\b.{0,45}\b(?:solve|solving|help|support|cover|consider|address|handle)\b/i.test(
        text,
      ) ||
      /\b(?:solve|solving|help|support|cover|consider|address|handle)\b.{0,45}\b(?:problem|problems|cause|causes|case|cases|need|needs|situation|situations)\b/i.test(
        text,
      ) ||
      /\bwhat\s+(?:does|do|can|will)\s+(?:hsakaa\s+aid|it|you)\s+(?:solve|help\s+with|support|cover|consider)\b/i.test(
        text,
      ) ||
      /\bwhat\s+(?:is\s+)?(?:hsakaa\s+aid|the\s+aid|this\s+aid|it)\s+for\b/i.test(
        text,
      ) ||
      /\bwho\s+do\s+you\s+help\b/i.test(text);

    if (asksScope) {
      return 'HSAKAA Aid is not limited to predefined causes right now. If financial support could genuinely help your situation, explain what happened and what you need. HSAKAA will ask only for what is needed to verify it before human review.';
    }

    if (
      /\bwhy\s+(?:did\s+you|do\s+you|does\s+it|did\s+hsakaa)\s+(?:start|create|build|run|exist)\b|\bwhy\s+(?:hsakaa\s+)?aid\b|\bpurpose\s+of\s+(?:hsakaa\s+)?aid\b/i.test(
        text,
      )
    ) {
      return 'The purpose is simple: when a genuine, verifiable need is blocked by money, HSAKAA can collect the facts and evidence for human review instead of making the person navigate a long form or opaque process.';
    }

    if (
      /\bwhat\s+does\s+(?:that|it)\s+mean\b|\bwhat\s+do\s+you\s+mean\b|\bwhat\s+is\s+that\b|\bwhat\s+is\s+hsakaa\s+aid\b|\btell\s+me\s+about\s+hsakaa\s+aid\b/i.test(
        text,
      )
    ) {
      return officiallyStarted
        ? 'HSAKAA Aid is a monthly assistance program run through this chat. ₹30,000 is allocated each month. You explain the need, HSAKAA verifies the relevant details, and a human makes the final decision.'
        : 'HSAKAA Aid is a monthly assistance program starting October 1, 2026. ₹30,000 is allocated each month. You explain the need in this chat, HSAKAA verifies the relevant details, and a human makes the final decision.';
    }

    if (
      /\bhow\s+does\s+(?:that|it|this)\s+work\b|\btell\s+me\s+more\b|\bexplain(?:\s+that|\s+it|\s+this)?\b/i.test(
        text,
      )
    ) {
      return 'You explain the situation here. HSAKAA asks only for the next information or evidence needed to verify it, then prepares the case for human review. The final decision is not automatic.';
    }

    if (
      /\bwho\s+can\s+apply\b|\bwho\s+is\s+(?:it|that|this)\s+for\b|\bam\s+i\s+eligible\b|\beligib(?:le|ility)\b/i.test(
        text,
      )
    ) {
      return 'There is no predefined public cause list right now. If financial support could genuinely help your situation, explain what happened and what you need. The request must be understandable and verifiable before human review.';
    }

    if (
      /\b(?:how\s+(?:do|can)\s+i|where\s+do\s+i)\s+(?:upload|attach|send)\s+(?:a\s+)?(?:document|documents|file|files|bill|evidence|photo|pdf)\b|\b(?:upload|attach)\s+(?:a\s+)?(?:document|file|bill|evidence|photo|pdf)\b/i.test(
        text,
      )
    ) {
      return 'Once your Aid case is active, use the Attach button beside the chat box to send a PDF or image. If you do not see Attach, tell me you need financial support or ask me to connect you to HSAKAA Aid so I can open the case first.';
    }

    if (
      /\bwhat\s+(?:proof|evidence|documents?|information)\b|\bwhat\s+do\s+you\s+need\s+to\s+verify\b|\bhow\s+do\s+you\s+verify\b|\bverification\b/i.test(
        text,
      )
    ) {
      return 'It depends on the request. HSAKAA may ask for the amount, timing, relevant bills or estimates, identity/contact details, and supporting documents that directly verify the claim. It asks only for what is needed.';
    }

    if (
      /\bhow\s+(?:do|will)\s+(?:you|hsakaa)\s+decide\b|\bwho\s+decides\b|\bdecision\b|\bapprove|approval|reject|rejection\b/i.test(
        text,
      )
    ) {
      return 'HSAKAA organizes and verifies the case, but it does not grant money autonomously. A human reviews the evidence, the request and the available monthly allocation before the final decision.';
    }

    if (
      /\bwhen\s+does\s+(?:it|that|this)\s+start\b|\bwhen\s+is\s+(?:it|that|this)\s+available\b|\bwhen\s+can\s+i\s+apply\b/i.test(
        text,
      )
    ) {
      return officiallyStarted
        ? 'HSAKAA Aid is live now.'
        : 'HSAKAA Aid starts on October 1, 2026.';
    }

    if (
      /\bhow\s+much(?:\s+is\s+available)?\b|\bwhat\s+is\s+the\s+amount\b|\bmonthly\s+allocation\b|\bbudget\b/i.test(
        text,
      )
    ) {
      return 'The starting allocation is ₹30,000 per month across approved assistance cases.';
    }

    if (
      /\bhow\s+do\s+i\s+apply\b|\bhow\s+can\s+i\s+apply\b|\bcan\s+i\s+apply\b|\bwhere\s+do\s+i\s+apply\b/i.test(
        text,
      )
    ) {
      return officiallyStarted || enabled
        ? 'You apply in this same HSAKAA chat. Explain what you need help with, and I will ask only for the next information needed to verify it.'
        : 'Applications start on October 1, 2026 and happen in this same HSAKAA chat.';
    }

    if (/\bwhat\s+happens\s+next\b/i.test(text)) {
      return 'If you want assistance, explain what happened, how much you need and when you need it. I will ask only for the next detail needed to verify the request.';
    }

    if (applicationAttempt && !enabled) {
      return 'HSAKAA Aid opens on October 1, 2026 with ₹30,000 allocated each month. Applications will happen in this same chat once it opens.';
    }

    // Do not repeat the launch/amount introduction for an Aid-context follow-up
    // we do not recognise. Keep the answer short and invite the missing angle.
    return 'HSAKAA Aid is open to genuine, verifiable financial-assistance requests without a predefined cause list. You can ask about verification, evidence, timing, decisions or how to apply.';
  }

  private assertAvailable() {
    if (new Date() < FUND_START_AT && !this.isPrelaunchEnabled()) {
      throw new ServiceUnavailableException(
        'HSAKAA Fund opens on October 1, 2026. Prelaunch testing is not enabled.',
      );
    }
  }

  private isPrelaunchEnabled() {
    return (
      this.configService.get<string>('HSAKAA_FUND_PRELAUNCH_ENABLED') === 'true'
    );
  }

  private consumeRateLimit(key: string, max: number, windowMs: number) {
    const now = Date.now();
    if (this.rateLimits.size > 5000) {
      for (const [storedKey, entry] of this.rateLimits) {
        if (entry.resetAt <= now) this.rateLimits.delete(storedKey);
      }
    }
    const current = this.rateLimits.get(key);
    if (!current || current.resetAt <= now) {
      this.rateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }
    if (current.count >= max) {
      throw new HttpException(
        'Too many Fund requests. Try again shortly.',
        429,
      );
    }
    current.count += 1;
  }

  private cleanUserText(value: string) {
    return value.trim().split('\0').join('').slice(0, 4000);
  }

  private cleanDecisionReason(value: string) {
    return this.sanitizeApplicantText(value.trim().slice(0, 2500));
  }

  private sanitizeApplicantText(value: string) {
    const normalized = value.replace(/[—–]/g, '-');
    const sensitiveInternalLine =
      /\b(confidence|fraud|duplicate|risk score|risk signal|matches? another fund case|same (?:phone|email|upi|bank))\b/i;
    const evaluativeApplicantLine =
      /\b(makes? (?:this|the) (?:request|case) stronger|could (?:still )?prevent approval|looks? (?:good|bad|strong|weak)|why (?:it|this) may (?:succeed|not))\b/i;
    const safe = normalized
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(
        (line) =>
          line &&
          !sensitiveInternalLine.test(line) &&
          !evaluativeApplicantLine.test(line),
      )
      .join('\n\n')
      .trim();

    return (
      safe ||
      'I saved what you shared. I will keep asking only for information needed to prepare the case for human review.'
    );
  }

  private applicantSafeItems(values: string[]) {
    const sensitiveInternalItem =
      /\b(confidence|fraud|duplicate|risk score|risk signal|matches? another fund case|same (?:phone|email|upi|bank))\b/i;
    return values
      .map((value) => value.replace(/[—–]/g, '-').trim())
      .filter((value) => value && !sensitiveInternalItem.test(value));
  }

  private normalizedReply(value: string) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9₹]+/g, ' ')
      .trim();
  }

  private uniqueStrings(values: Array<string | undefined | null>) {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const clean = value?.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(clean);
    }
    return result;
  }

  private mergeRiskSignals(
    existing: FundRiskSignal[],
    incoming: FundAssessmentRiskSignal[],
  ): FundRiskSignal[] {
    const map = new Map<string, FundRiskSignal>();
    for (const signal of [...existing, ...incoming]) {
      if (!signal.code?.trim() || !signal.summary?.trim()) continue;
      map.set(signal.code.trim().toUpperCase(), {
        code: signal.code.trim().toUpperCase(),
        summary: signal.summary.trim().slice(0, 600),
        severity: signal.severity,
      });
    }
    return [...map.values()].slice(0, 24);
  }

  private prefer(incoming?: string | null, existing?: string | null) {
    const next = incoming?.trim();
    if (next) return next;
    return existing?.trim() || null;
  }

  private clampScore(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.min(100, Math.max(0, Math.round(value)));
  }
}
