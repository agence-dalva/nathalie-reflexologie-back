import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { formatInTimeZone } from 'date-fns-tz';
import { BUSINESS_TIMEZONE } from '../bookings/timeslots.service';
import type { Booking, Service } from '../../generated/prisma/client';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { renderBookingEmailHtml } from './render-booking-email';
import { generateBookingIcs } from './ics';

type BookingWithService = Booking & { service: Service };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const CABINET_ADDRESS = '12, lotissement les Bosquets, 68130 Altkirch';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly adminEmail: string | undefined;
  private readonly logoUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailTemplatesService: EmailTemplatesService,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from =
      this.configService.get<string>('MAIL_FROM') ??
      'Nathalie Réflexologie <onboarding@resend.dev>';
    this.adminEmail = this.configService.get<string>('ADMIN_SEED_EMAIL');
    this.logoUrl = `${this.configService.get<string>('FRONTEND_URL') ?? ''}/images/nathalie-logo.png`;
  }

  async sendBookingConfirmation(booking: BookingWithService) {
    const { subject, html, attachments } = await this.buildBookingEmail(booking, 'CONFIRMATION');
    await this.send(booking.customerEmail, subject, html, attachments);
    if (this.adminEmail) {
      await this.send(this.adminEmail, `Nouvelle réservation — ${booking.service.name}`, html);
    }
  }

  async sendBookingCancellation(booking: BookingWithService) {
    const { subject, html } = await this.buildBookingEmail(booking, 'CANCELLATION');
    await this.send(booking.customerEmail, subject, html);
    if (this.adminEmail) {
      await this.send(this.adminEmail, `Réservation annulée — ${booking.service.name}`, html);
    }
  }

  async sendBookingModification(booking: BookingWithService) {
    const { subject, html, attachments } = await this.buildBookingEmail(booking, 'MODIFICATION');
    await this.send(booking.customerEmail, subject, html, attachments);
    if (this.adminEmail) {
      await this.send(this.adminEmail, `Réservation modifiée — ${booking.service.name}`, html);
    }
  }

  async sendBookingReminder(booking: BookingWithService) {
    const subject = `Rappel : rendez-vous demain — ${booking.service.name}`;
    const dateLabel = this.formatDate(booking.startsAt);
    const timeLabel = this.formatTime(booking.startsAt);
    const html = renderBookingEmailHtml({
      title: 'Rappel de votre rendez-vous',
      bodyText: `Bonjour ${booking.customerFirstname},\n\nPetit rappel : vous avez rendez-vous demain pour "${booking.service.name}" à ${timeLabel} (${dateLabel}).`,
      logoUrl: this.logoUrl,
    });
    await this.send(booking.customerEmail, subject, html);
  }

  async sendContactMessage(message: {
    firstname: string;
    lastname: string;
    email: string;
    phone?: string;
    message: string;
  }) {
    if (!this.adminEmail) {
      this.logger.warn('ADMIN_SEED_EMAIL absent — message de contact non transmis');
      return;
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2>Nouveau message depuis le site</h2>
        <p><strong>${escapeHtml(message.firstname)} ${escapeHtml(message.lastname)}</strong></p>
        <p>${escapeHtml(message.email)}${message.phone ? ` — ${escapeHtml(message.phone)}` : ''}</p>
        <p style="white-space: pre-wrap;">${escapeHtml(message.message)}</p>
      </div>
    `;

    await this.send(
      this.adminEmail,
      `Nouveau message de ${message.firstname} ${message.lastname}`,
      html,
    );
  }

  private async buildBookingEmail(
    booking: BookingWithService,
    type: 'CONFIRMATION' | 'CANCELLATION' | 'MODIFICATION',
  ) {
    const template = await this.emailTemplatesService.resolve(type);
    const dateLabel = this.formatDate(booking.startsAt);
    const timeLabel = this.formatTime(booking.startsAt);

    const rendered = this.emailTemplatesService.render(template, {
      prenom: booking.customerFirstname,
      nom: booking.customerLastname,
      prestation: booking.service.name,
      date: dateLabel,
      heure: timeLabel,
      prix: `${booking.service.price} €`,
    });

    const beneficiaryNote = booking.beneficiaryFirstname
      ? `\n\nRendez-vous pour : ${booking.beneficiaryFirstname} ${booking.beneficiaryLastname ?? ''}${
          booking.beneficiaryPhone ? ` (${booking.beneficiaryPhone})` : ''
        }`
      : '';

    const cancelUrl = `${this.configService.get<string>('FRONTEND_URL') ?? ''}/annulation/${booking.cancelToken}`;
    const isConfirmationOrModification = type === 'CONFIRMATION' || type === 'MODIFICATION';

    const ics = isConfirmationOrModification
      ? generateBookingIcs({
          uid: `booking-${booking.id}-${booking.updatedAt.getTime()}`,
          title: `${booking.service.name} — Nathalie OHL Réflexologue`,
          description: `Rendez-vous ${booking.service.name.toLowerCase()} chez Nathalie OHL.`,
          location: CABINET_ADDRESS,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
        })
      : null;

    const html = renderBookingEmailHtml({
      title: rendered.title,
      bodyText: rendered.body + beneficiaryNote,
      cancelUrl,
      showCancelLink: type === 'CONFIRMATION',
      hasCalendarAttachment: Boolean(ics),
      logoUrl: this.logoUrl,
    });

    return {
      subject: rendered.subject,
      html,
      attachments: ics
        ? [{ filename: 'rendez-vous.ics', content: Buffer.from(ics).toString('base64') }]
        : undefined,
    };
  }

  private formatDate(date: Date): string {
    return formatInTimeZone(date, BUSINESS_TIMEZONE, "EEEE d MMMM yyyy");
  }

  private formatTime(date: Date): string {
    return formatInTimeZone(date, BUSINESS_TIMEZONE, 'HH:mm');
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    attachments?: { filename: string; content: string }[],
  ) {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY absent — email "${subject}" à ${to} non envoyé (mode dev)`,
      );
      return;
    }

    try {
      await this.resend.emails.send({ from: this.from, to, subject, html, attachments });
    } catch (error) {
      this.logger.error(`Échec d'envoi d'email à ${to}: ${(error as Error).message}`);
    }
  }
}
