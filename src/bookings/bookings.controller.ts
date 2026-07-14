import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { MailService } from '../mail/mail.service';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingsService: BookingsService,
    private readonly mailService: MailService,
  ) {}

  @Get('timeslots')
  getTimeslots(
    @Query('serviceId', ParseIntPipe) serviceId: number,
    @Query('date') date: string,
  ) {
    return this.bookingsService.getAvailableTimeslots(serviceId, date);
  }

  @Post()
  async create(
    @Body() dto: CreateBookingDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const { booking, isNew } = await this.bookingsService.create(dto, idempotencyKey);
    if (isNew) {
      await this.mailService.sendBookingConfirmation(booking);
    }
    return booking;
  }

  @Get('cancel/:token')
  findByCancelToken(@Param('token') token: string) {
    return this.bookingsService.findByCancelToken(token);
  }

  @Patch('cancel/:token')
  async cancelByToken(@Param('token') token: string) {
    const booking = await this.bookingsService.cancelByToken(token);
    await this.mailService.sendBookingCancellation(booking);
    return booking;
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin')
  findAllAdmin(@Query('from') from?: string, @Query('to') to?: string) {
    return this.bookingsService.findAllAdmin({ from, to });
  }

  @UseGuards(JwtAuthGuard)
  @Get('admin/:id')
  findOneAdmin(@Param('id', ParseIntPipe) id: number) {
    return this.bookingsService.findOneAdmin(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin')
  async createAdmin(@Body() dto: CreateBookingDto) {
    const { booking } = await this.bookingsService.create(dto);
    await this.mailService.sendBookingConfirmation(booking);
    return booking;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/:id/cancel')
  async cancelAdmin(@Param('id', ParseIntPipe) id: number) {
    const booking = await this.bookingsService.cancelAdmin(id);
    await this.mailService.sendBookingCancellation(booking);
    return booking;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/:id')
  async updateAdmin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBookingDto,
  ) {
    const booking = await this.bookingsService.updateAdmin(id, dto);
    await this.mailService.sendBookingModification(booking);
    return booking;
  }
}
