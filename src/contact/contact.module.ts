import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { ContactService } from './contact.service';
import { ContactController } from './contact.controller';

@Module({
  imports: [MailModule],
  providers: [ContactService],
  controllers: [ContactController],
})
export class ContactModule {}
