function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textToHtmlParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(
      (paragraph) =>
        `<p style="margin: 0 0 16px;">${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`,
    )
    .join('');
}

/** L'enveloppe visuelle commune à tous les emails : en-tête, logo, pied de page. */
function renderShell(options: {
  title: string;
  content: string;
  logoUrl?: string;
}): string {
  const { title, content, logoUrl } = options;

  return `
    <div style="background-color: #f5f7f4; padding: 32px 16px; font-family: -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif;">
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e8eee7;">
        <div style="background-color: #384b3f; padding: 28px 32px; text-align: center;">
          ${
            logoUrl
              ? `<img src="${logoUrl}" alt="Nathalie OHL Réflexologue" width="120" height="120" style="display: block; margin: 0 auto 16px;" />`
              : ''
          }
          <p style="margin: 0; color: #fcfaf6; font-size: 20px; letter-spacing: 0.02em;">
            Nathalie&nbsp;OHL <span style="color: #b3bf99; font-weight: normal;">— Réflexologue</span>
          </p>
        </div>
        <div style="padding: 32px;">
          <h1 style="margin: 0 0 20px; color: #2b3a30; font-size: 22px; font-weight: 600;">
            ${escapeHtml(title)}
          </h1>
          ${content}
        </div>
        <div style="padding: 20px 32px; background-color: #f5f7f4; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #94a487;">
            12, lotissement les Bosquets — 68130 Altkirch · 06 82 06 69 00
          </p>
        </div>
      </div>
    </div>
  `;
}

/**
 * L'email envoyé au client (confirmation, annulation, modification) : le titre
 * et le corps viennent des modèles que Nathalie peut modifier au back-office,
 * la mise en forme non.
 */
export function renderBookingEmailHtml(options: {
  title: string;
  bodyText: string;
  cancelUrl?: string;
  showCancelLink?: boolean;
  hasCalendarAttachment?: boolean;
  logoUrl?: string;
}): string {
  const {
    title,
    bodyText,
    cancelUrl,
    showCancelLink,
    hasCalendarAttachment,
    logoUrl,
  } = options;

  const content = `
          <div style="color: #4a5a4f; font-size: 15px; line-height: 1.6;">
            ${textToHtmlParagraphs(bodyText)}
          </div>
          ${
            hasCalendarAttachment
              ? `<p style="margin: 24px 0 0; font-size: 13px; color: #94a487;">
                   📅 Le fichier joint à cet email vous permet d'ajouter ce rendez-vous à votre calendrier (Google, Apple, Outlook…).
                 </p>`
              : ''
          }
          ${
            showCancelLink && cancelUrl
              ? `<p style="margin: 16px 0 0; font-size: 13px; color: #94a487;">
                   Besoin d'annuler ? <a href="${cancelUrl}" style="color: #5d7c67;">Cliquez ici</a>
                 </p>`
              : ''
          }`;

  return renderShell({ title, content, logoUrl });
}

/** Une ligne « libellé / valeur » de la fiche envoyée à Nathalie. */
export interface AdminEmailRow {
  label: string;
  value: string;
  /** Ouvre un nouveau bloc : la ligne est précédée d'un filet de séparation. */
  startsGroup?: boolean;
}

/**
 * L'email réservé à Nathalie : la fiche complète du rendez-vous, telle que le
 * client l'a remplie. Elle n'est pas modifiable au back-office — c'est un
 * outil de travail, pas un message au client.
 */
export function renderAdminBookingEmailHtml(options: {
  title: string;
  rows: AdminEmailRow[];
  notes?: string;
  logoUrl?: string;
}): string {
  const { title, rows, notes, logoUrl } = options;

  const rowsHtml = rows
    .map(
      (row) => `
            <tr>
              <td style="padding: 7px 12px 7px 0; color: #94a487; white-space: nowrap; vertical-align: top;${
                row.startsGroup
                  ? ' border-top: 1px solid #e8eee7; padding-top: 15px;'
                  : ''
              }">${escapeHtml(row.label)}</td>
              <td style="padding: 7px 0; color: #2b3a30; font-weight: 600; vertical-align: top;${
                row.startsGroup
                  ? ' border-top: 1px solid #e8eee7; padding-top: 15px;'
                  : ''
              }">${escapeHtml(row.value)}</td>
            </tr>`,
    )
    .join('');

  const content = `
          <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; border-collapse: collapse; font-size: 15px; line-height: 1.5;">
            ${rowsHtml}
          </table>
          ${
            notes
              ? `<div style="margin-top: 24px; border-top: 1px solid #e8eee7; padding-top: 20px;">
                   <p style="margin: 0 0 8px; font-size: 13px; color: #94a487; text-transform: uppercase; letter-spacing: 0.06em;">Motif</p>
                   <div style="color: #4a5a4f; font-size: 15px; line-height: 1.6;">${textToHtmlParagraphs(notes)}</div>
                 </div>`
              : ''
          }`;

  return renderShell({ title, content, logoUrl });
}
