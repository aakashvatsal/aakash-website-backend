import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { FundDeliveryStatus } from './schemas/fund-case.schema';

export interface FundNotificationContact {
  fullName?: string | null;
  phone?: string | null;
  email?: string | null;
  preferredContactMethod?: 'email' | 'whatsapp' | 'phone' | null;
}

export interface FundDecisionNotification {
  caseReference: string;
  decisionLabel: string;
  reason: string;
  amount?: number;
}

export interface FundNotificationResult {
  emailStatus: FundDeliveryStatus;
  whatsappStatus: FundDeliveryStatus;
  manualContactRequired: boolean;
  lastError?: string;
}

@Injectable()
export class FundNotificationService {
  constructor(private readonly configService: ConfigService) {}

  async deliver(
    contact: FundNotificationContact,
    decision: FundDecisionNotification,
  ): Promise<FundNotificationResult> {
    const errors: string[] = [];
    let emailStatus = FundDeliveryStatus.NOT_CONFIGURED;
    let whatsappStatus = FundDeliveryStatus.NOT_CONFIGURED;

    if (contact.email) {
      try {
        emailStatus = await this.sendEmail(contact, decision);
      } catch (error) {
        emailStatus = FundDeliveryStatus.FAILED;
        errors.push(this.errorMessage(error));
      }
    }

    if (contact.phone) {
      try {
        whatsappStatus = await this.sendWhatsapp(contact, decision);
      } catch (error) {
        whatsappStatus = FundDeliveryStatus.FAILED;
        errors.push(this.errorMessage(error));
      }
    }

    const preferred = contact.preferredContactMethod;
    const preferredDelivered =
      preferred === 'email'
        ? emailStatus === FundDeliveryStatus.SENT
        : preferred === 'whatsapp'
          ? whatsappStatus === FundDeliveryStatus.SENT
          : false;

    const anyDelivered =
      emailStatus === FundDeliveryStatus.SENT ||
      whatsappStatus === FundDeliveryStatus.SENT;

    return {
      emailStatus,
      whatsappStatus,
      manualContactRequired:
        preferred === 'phone' || (!preferredDelivered && !anyDelivered),
      lastError: errors.length ? errors.join(' | ').slice(0, 1000) : undefined,
    };
  }

  private async sendEmail(
    contact: FundNotificationContact,
    decision: FundDecisionNotification,
  ): Promise<FundDeliveryStatus> {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const from = this.configService.get<string>('FUND_FROM_EMAIL');

    if (!apiKey || !from || !contact.email) {
      return FundDeliveryStatus.NOT_CONFIGURED;
    }

    const amountLine = decision.amount
      ? `\nAssistance amount: ₹${decision.amount.toLocaleString('en-IN')}`
      : '';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [contact.email],
        subject: `HSAKAA Fund update for ${decision.caseReference}`,
        text: [
          `Hi ${contact.fullName || 'there'},`,
          '',
          `Your HSAKAA Fund case ${decision.caseReference} has been reviewed.`,
          `Decision: ${decision.decisionLabel}.`,
          amountLine.trim(),
          '',
          decision.reason,
          '',
          'This decision was made by a human reviewer.',
        ]
          .filter(Boolean)
          .join('\n'),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Resend delivery failed (${response.status}): ${detail}`);
    }

    return FundDeliveryStatus.SENT;
  }

  private async sendWhatsapp(
    contact: FundNotificationContact,
    decision: FundDecisionNotification,
  ): Promise<FundDeliveryStatus> {
    const accessToken = this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');
    const phoneNumberId = this.configService.get<string>(
      'WHATSAPP_PHONE_NUMBER_ID',
    );
    const templateName = this.configService.get<string>(
      'FUND_WHATSAPP_TEMPLATE_NAME',
    );

    if (!accessToken || !phoneNumberId || !templateName || !contact.phone) {
      return FundDeliveryStatus.NOT_CONFIGURED;
    }

    const graphVersion =
      this.configService.get<string>('WHATSAPP_GRAPH_VERSION') || 'v23.0';
    const languageCode =
      this.configService.get<string>('FUND_WHATSAPP_TEMPLATE_LANGUAGE') || 'en';
    const normalizedPhone = contact.phone.replace(/\D/g, '');
    const amount = decision.amount
      ? `₹${decision.amount.toLocaleString('en-IN')}`
      : 'Not applicable';

    const response = await fetch(
      `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalizedPhone,
          type: 'template',
          template: {
            name: templateName,
            language: { code: languageCode },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: contact.fullName || 'Applicant' },
                  { type: 'text', text: decision.caseReference },
                  { type: 'text', text: decision.decisionLabel },
                  { type: 'text', text: amount },
                  { type: 'text', text: decision.reason.slice(0, 900) },
                ],
              },
            ],
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `WhatsApp delivery failed (${response.status}): ${detail}`,
      );
    }

    return FundDeliveryStatus.SENT;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
