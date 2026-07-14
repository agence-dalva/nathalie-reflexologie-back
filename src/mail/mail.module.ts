import { Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { EmailTemplatesModule } from '../email-templates/email-templates.module';

@Module({
  imports: [EmailTemplatesModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
