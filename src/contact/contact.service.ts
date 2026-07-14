import { Injectable } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { CreateContactMessageDto } from './dto/create-contact-message.dto';

@Injectable()
export class ContactService {
  constructor(private readonly mailService: MailService) {}

  async submit(dto: CreateContactMessageDto) {
    await this.mailService.sendContactMessage(dto);
    return { success: true };
  }
}
