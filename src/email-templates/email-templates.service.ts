import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { DEFAULT_EMAIL_TEMPLATES } from './default-templates';
import { EmailTemplateType } from '../../generated/prisma/client';

export type TemplateVariables = {
  prenom: string;
  nom: string;
  prestation: string;
  date: string;
  heure: string;
  prix: string;
};

function interpolate(text: string, vars: TemplateVariables): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    key in vars ? vars[key as keyof TemplateVariables] : match,
  );
}

@Injectable()
export class EmailTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const templates = await this.prisma.emailTemplate.findMany();
    const byType = new Map(templates.map((t) => [t.type, t]));

    return (Object.keys(DEFAULT_EMAIL_TEMPLATES) as EmailTemplateType[]).map(
      (type) => byType.get(type) ?? { type, ...DEFAULT_EMAIL_TEMPLATES[type] },
    );
  }

  async findOne(type: EmailTemplateType) {
    const template = await this.prisma.emailTemplate.findUnique({ where: { type } });
    return template ?? { type, ...DEFAULT_EMAIL_TEMPLATES[type] };
  }

  async update(type: EmailTemplateType, dto: UpdateEmailTemplateDto) {
    if (!(type in DEFAULT_EMAIL_TEMPLATES)) {
      throw new NotFoundException('Type de template inconnu');
    }
    return this.prisma.emailTemplate.upsert({
      where: { type },
      create: { type, ...dto },
      update: dto,
    });
  }

  /** Résout le template effectif (personnalisé ou par défaut) pour un type donné. */
  async resolve(type: EmailTemplateType) {
    const template = await this.prisma.emailTemplate.findUnique({ where: { type } });
    return template ?? { type, ...DEFAULT_EMAIL_TEMPLATES[type] };
  }

  render(
    template: { subject: string; title: string; body: string },
    vars: TemplateVariables,
  ) {
    return {
      subject: interpolate(template.subject, vars),
      title: interpolate(template.title, vars),
      body: interpolate(template.body, vars),
    };
  }
}
