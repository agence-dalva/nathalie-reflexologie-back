import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailTemplatesService } from './email-templates.service';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { EmailTemplateType } from '../../generated/prisma/client';
import { renderBookingEmailHtml } from '../mail/render-booking-email';

const PREVIEW_VARS = {
  prenom: 'Julie',
  nom: 'Martin',
  prestation: 'Réflexologie plantaire',
  date: 'lundi 13 juillet 2026',
  heure: '10:00',
  prix: '60 €',
};

function parseType(type: string): EmailTemplateType {
  if (!Object.values(EmailTemplateType).includes(type as EmailTemplateType)) {
    throw new BadRequestException('Type de template inconnu');
  }
  return type as EmailTemplateType;
}

@UseGuards(JwtAuthGuard)
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(
    private readonly emailTemplatesService: EmailTemplatesService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  findAll() {
    return this.emailTemplatesService.findAll();
  }

  @Get(':type')
  findOne(@Param('type') type: string) {
    return this.emailTemplatesService.findOne(parseType(type));
  }

  @Post(':type')
  update(@Param('type') type: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.emailTemplatesService.update(parseType(type), dto);
  }

  @Post(':type/preview')
  async preview(@Param('type') type: string, @Body() dto: UpdateEmailTemplateDto) {
    const parsedType = parseType(type);
    const rendered = this.emailTemplatesService.render(dto, PREVIEW_VARS);
    const logoUrl = `${this.configService.get<string>('FRONTEND_URL') ?? ''}/images/nathalie-logo.png`;
    const html = renderBookingEmailHtml({
      title: rendered.title,
      bodyText: rendered.body,
      showCancelLink: parsedType === 'CONFIRMATION',
      hasCalendarAttachment: parsedType !== 'CANCELLATION',
      logoUrl,
    });
    return { subject: rendered.subject, html };
  }
}
