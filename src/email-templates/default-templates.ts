import type { EmailTemplateType } from '../../generated/prisma/client';

/**
 * Variables disponibles dans subject/title/body, remplacées à l'envoi :
 * {{prenom}}, {{nom}}, {{prestation}}, {{date}}, {{heure}}, {{prix}}
 */
export const DEFAULT_EMAIL_TEMPLATES: Record<
  EmailTemplateType,
  { subject: string; title: string; body: string }
> = {
  CONFIRMATION: {
    subject: 'Confirmation de votre rendez-vous — {{prestation}}',
    title: 'Votre rendez-vous est confirmé',
    body: 'Bonjour {{prenom}} {{nom}},\n\nVotre rendez-vous pour "{{prestation}}" est bien confirmé le {{date}} à {{heure}}.\n\nÀ très bientôt !',
  },
  CANCELLATION: {
    subject: 'Annulation de votre rendez-vous — {{prestation}}',
    title: 'Votre rendez-vous a été annulé',
    body: "Bonjour {{prenom}} {{nom}},\n\nVotre rendez-vous pour \"{{prestation}}\" du {{date}} à {{heure}} a bien été annulé.\n\nN'hésitez pas à reprendre rendez-vous quand vous le souhaitez.",
  },
  MODIFICATION: {
    subject: 'Modification de votre rendez-vous — {{prestation}}',
    title: 'Votre rendez-vous a été modifié',
    body: 'Bonjour {{prenom}} {{nom}},\n\nVotre rendez-vous pour "{{prestation}}" a été modifié. Il aura désormais lieu le {{date}} à {{heure}}.\n\nÀ très bientôt !',
  },
};
