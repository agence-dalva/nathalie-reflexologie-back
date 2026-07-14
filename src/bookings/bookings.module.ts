import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { MailModule } from '../mail/mail.module';
import { ServicesModule } from '../services/services.module';
import { ClientsModule } from '../clients/clients.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { TimeslotsService } from './timeslots.service';

@Module({
  imports: [ServicesModule, AvailabilityModule, MailModule, ClientsModule],
  providers: [BookingsService, TimeslotsService],
  controllers: [BookingsController],
  exports: [BookingsService],
})
export class BookingsModule {}
