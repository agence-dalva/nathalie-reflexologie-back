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
    .map((paragraph) => `<p style="margin: 0 0 16px;">${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

/**
 * Template visuel commun à tous les emails transactionnels (couleurs,
 * logo, structure) — non personnalisable par Nathalie, seuls le titre et
 * le corps de texte (déjà interpolés) le sont.
 */
export function renderBookingEmailHtml(options: {
  title: string;
  bodyText: string;
  cancelUrl?: string;
  showCancelLink?: boolean;
  hasCalendarAttachment?: boolean;
  logoUrl?: string;
}): string {
  const { title, bodyText, cancelUrl, showCancelLink, hasCalendarAttachment, logoUrl } = options;

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
          }
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
