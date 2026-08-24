import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { formatInTimeZone } from 'date-fns-tz';
import { fr } from 'date-fns/locale';
import { BUSINESS_TIMEZONE } from '../bookings/timeslots.service';
import type { Booking, Service } from '../../generated/prisma/client';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import {
  renderAdminBookingEmailHtml,
  renderBookingEmailHtml,
  type AdminEmailRow,
} from './render-booking-email';
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

// Le logo voyage avec l'email plutôt que d'être chargé depuis le site : les
// messageries bloquent les images distantes, et l'en-tête arrivait vide.
const LOGO_CONTENT_ID = 'logo';
const LOGO_FILENAME = 'nathalie-logo.png';

interface EmailAttachment {
  filename: string;
  content: string;
  contentId?: string;
}

type BookingEmailType = 'CONFIRMATION' | 'CANCELLATION' | 'MODIFICATION';

/** Les seuls événements qui méritent un email à Nathalie. */
type AdminNotificationType = 'CONFIRMATION' | 'CANCELLATION';

/** Objet et titre de la fiche envoyée à Nathalie, selon l'événement. */
const ADMIN_EMAIL_LABELS: Record<
  AdminNotificationType,
  { subject: string; title: string }
> = {
  CONFIRMATION: {
    subject: 'Nouvelle réservation',
    title: 'Nouveau rendez-vous',
  },
  CANCELLATION: {
    subject: 'Réservation annulée',
    title: 'Rendez-vous annulé',
  },
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;
  private readonly from: string;
  private readonly adminEmail: string | undefined;
  private readonly logoAttachment: EmailAttachment | null;
  private readonly logoUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailTemplatesService: EmailTemplatesService,
  ) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    this.resend = apiKey ? new Resend(apiKey) : null;
    this.from =
      this.configService.get<string>('MAIL_FROM') ??
      'Nathalie OHL Réflexologue <nathalie.ohl@reflexologie-altkirch.fr>';
    this.adminEmail = this.configService.get<string>('ADMIN_SEED_EMAIL');
    this.logoAttachment = this.loadLogoAttachment();
    this.logoUrl = this.logoAttachment
      ? `cid:${LOGO_CONTENT_ID}`
      : `${this.configService.get<string>('FRONTEND_URL') ?? ''}/images/nathalie-logo.png`;
  }

  /** Le logo, lu une fois au démarrage pour être joint à chaque email. */
  private loadLogoAttachment(): EmailAttachment | null {
    try {
      const content = readFileSync(join(__dirname, 'assets', LOGO_FILENAME));
      return {
        filename: LOGO_FILENAME,
        content: content.toString('base64'),
        contentId: LOGO_CONTENT_ID,
      };
    } catch (error) {
      this.logger.warn(
        `Logo ${LOGO_FILENAME} illisible, les emails retombent sur l'image du site : ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * `notifyAdmin` : Nathalie n'est prévenue que des gestes venus du site. Ce
   * qu'elle fait elle-même au back-office, elle le sait déjà — seul le client
   * reçoit un message.
   */
  async sendBookingConfirmation(
    booking: BookingWithService,
    { notifyAdmin = true }: { notifyAdmin?: boolean } = {},
  ) {
    const { subject, html, attachments } = await this.buildBookingEmail(
      booking,
      'CONFIRMATION',
    );
    await this.send(booking.customerEmail, subject, html, attachments);
    if (notifyAdmin) {
      await this.sendAdminNotification(booking, 'CONFIRMATION');
    }
  }

  async sendBookingCancellation(
    booking: BookingWithService,
    { notifyAdmin = true }: { notifyAdmin?: boolean } = {},
  ) {
    const { subject, html } = await this.buildBookingEmail(
      booking,
      'CANCELLATION',
    );
    await this.send(booking.customerEmail, subject, html);
    if (notifyAdmin) {
      await this.sendAdminNotification(booking, 'CANCELLATION');
    }
  }

  /** Une modification part toujours du back-office : seul le client est prévenu. */
  async sendBookingModification(booking: BookingWithService) {
    const { subject, html, attachments } = await this.buildBookingEmail(
      booking,
      'MODIFICATION',
    );
    await this.send(booking.customerEmail, subject, html, attachments);
  }

  /**
   * La copie de Nathalie : la fiche du rendez-vous avec tout ce que le client a
   * rempli. Elle ne reçoit pas le message adressé au client, qui ne lui apprend
   * rien sur qui vient ni pourquoi.
   */
  private async sendAdminNotification(
    booking: BookingWithService,
    type: AdminNotificationType,
  ) {
    if (!this.adminEmail) {
      return;
    }
    const { subject, title } = ADMIN_EMAIL_LABELS[type];
    const html = renderAdminBookingEmailHtml({
      title,
      rows: this.buildAdminRows(booking),
      notes: booking.notes ?? undefined,
      logoUrl: this.logoUrl,
    });
    await this.send(
      this.adminEmail,
      `${subject} — ${booking.service.name}`,
      html,
    );
  }

  private buildAdminRows(booking: BookingWithService): AdminEmailRow[] {
    const rows: AdminEmailRow[] = [
      { label: 'Prestation', value: booking.service.name },
      { label: 'Date', value: this.formatDate(booking.startsAt) },
      {
        label: 'Heure',
        value: `${this.formatTime(booking.startsAt)} — ${this.formatDuration(
          booking.service.durationMinutes,
        )}`,
      },
      { label: 'Tarif', value: `${booking.service.price.toString()} €` },
      {
        label: 'Client',
        value: `${booking.customerFirstname} ${booking.customerLastname}`,
        startsGroup: true,
      },
      { label: 'Email', value: booking.customerEmail },
    ];

    if (booking.customerPhone) {
      rows.push({ label: 'Téléphone', value: booking.customerPhone });
    }
    // Prestation à domicile : l'adresse où elle doit se rendre.
    if (booking.address) {
      rows.push({ label: 'Adresse', value: booking.address });
    }
    // Le client réserve pour quelqu'un d'autre : c'est cette personne qu'elle voit.
    if (booking.beneficiaryFirstname) {
      rows.push({
        label: 'Séance pour',
        value:
          `${booking.beneficiaryFirstname} ${booking.beneficiaryLastname ?? ''}`.trim(),
        startsGroup: true,
      });
      if (booking.beneficiaryPhone) {
        rows.push({ label: 'Téléphone', value: booking.beneficiaryPhone });
      }
    }

    return rows;
  }

  async sendBookingReminder(booking: BookingWithService) {
    const subject = `Rappel : rendez-vous demain — ${booking.service.name}`;
    const dateLabel = this.formatDate(booking.startsAt);
    const timeLabel = this.formatTime(booking.startsAt);
    const html = renderBookingEmailHtml({
      title: 'Rappel de votre rendez-vous',
      bodyText: `Bonjour ${booking.customerFirstname} ${booking.customerLastname},\n\nPetit rappel : vous avez rendez-vous demain pour "${booking.service.name}" à ${timeLabel} (${dateLabel}).`,
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
      this.logger.warn(
        'ADMIN_SEED_EMAIL absent — message de contact non transmis',
      );
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
    type: BookingEmailType,
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
      prix: `${booking.service.price.toString()} €`,
    });

    const beneficiaryNote = booking.beneficiaryFirstname
      ? `\n\nRendez-vous pour : ${booking.beneficiaryFirstname} ${booking.beneficiaryLastname ?? ''}${
          booking.beneficiaryPhone ? ` (${booking.beneficiaryPhone})` : ''
        }`
      : '';

    // Séance à domicile : c'est l'adresse du client qui fait foi, pas le cabinet.
    const addressNote = booking.address
      ? `\n\nAdresse du rendez-vous : ${booking.address}`
      : '';

    const cancelUrl = `${this.configService.get<string>('FRONTEND_URL') ?? ''}/annulation/${booking.cancelToken}`;
    const isConfirmationOrModification =
      type === 'CONFIRMATION' || type === 'MODIFICATION';

    const ics = isConfirmationOrModification
      ? generateBookingIcs({
          uid: `booking-${booking.id}-${booking.updatedAt.getTime()}`,
          title: `${booking.service.name} — Nathalie OHL Réflexologue`,
          description: `Rendez-vous ${booking.service.name.toLowerCase()} chez Nathalie OHL.`,
          location: booking.address ?? CABINET_ADDRESS,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
        })
      : null;

    const html = renderBookingEmailHtml({
      title: rendered.title,
      bodyText: rendered.body + beneficiaryNote + addressNote,
      cancelUrl,
      showCancelLink: type === 'CONFIRMATION',
      hasCalendarAttachment: Boolean(ics),
      logoUrl: this.logoUrl,
    });

    return {
      subject: rendered.subject,
      html,
      attachments: ics
        ? [
            {
              filename: 'rendez-vous.ics',
              content: Buffer.from(ics).toString('base64'),
            },
          ]
        : undefined,
    };
  }

  private formatDate(date: Date): string {
    return formatInTimeZone(date, BUSINESS_TIMEZONE, 'EEEE d MMMM yyyy', {
      locale: fr,
    });
  }

  private formatTime(date: Date): string {
    return formatInTimeZone(date, BUSINESS_TIMEZONE, 'HH:mm');
  }

  private formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) {
      return `${rest} min`;
    }
    return rest === 0 ? `${hours} h` : `${hours} h ${rest}`;
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    attachments?: EmailAttachment[],
  ) {
    if (!this.resend) {
      this.logger.warn(
        `RESEND_API_KEY absent — email "${subject}" à ${to} non envoyé (mode dev)`,
      );
      return;
    }

    // Le logo n'accompagne que les emails qui l'affichent : ailleurs, il
    // apparaîtrait comme une pièce jointe orpheline.
    const allAttachments =
      this.logoAttachment && html.includes(`cid:${LOGO_CONTENT_ID}`)
        ? [...(attachments ?? []), this.logoAttachment]
        : attachments;

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.from,
        to,
        subject,
        html,
        attachments: allAttachments,
      });

      // Resend ne lève pas d'exception quand il refuse un envoi (domaine non
      // vérifié, adresse invalide, quota) : sans lire l'erreur renvoyée,
      // l'email disparaîtrait sans laisser la moindre trace dans les logs.
      if (error) {
        this.logger.error(
          `Échec d'envoi d'email à ${to} — ${error.name}: ${error.message}`,
        );
        return;
      }

      this.logger.log(`Email « ${subject} » envoyé à ${to} (${data?.id})`);
    } catch (error) {
      this.logger.error(
        `Échec d'envoi d'email à ${to}: ${(error as Error).message}`,
      );
    }
  }
}
