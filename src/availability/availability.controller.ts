import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ExceptionSource } from '../../generated/prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AvailabilityService } from './availability.service';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { CreateExceptionRangeDto } from './dto/create-exception-range.dto';
import { CreateExtraSlotDto } from './dto/create-extra-slot.dto';
import { CreateExtraSlotsDto } from './dto/create-extra-slots.dto';
import { DeleteExtraSlotsDto } from './dto/delete-extra-slots.dto';
import { ImportFrenchHolidaysDto } from './dto/import-french-holidays.dto';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get('recurring')
  findAllAvailabilities() {
    return this.availabilityService.findAllAvailabilities();
  }

  @UseGuards(JwtAuthGuard)
  @Post('recurring')
  createAvailability(@Body() dto: CreateAvailabilityDto) {
    return this.availabilityService.createAvailability(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('recurring/:id')
  @HttpCode(204)
  removeAvailability(@Param('id', ParseIntPipe) id: number) {
    return this.availabilityService.removeAvailability(id);
  }

  @Get('exceptions')
  findAllExceptions() {
    return this.availabilityService.findAllExceptions();
  }

  @UseGuards(JwtAuthGuard)
  @Post('exceptions')
  createException(@Body() dto: CreateExceptionDto) {
    return this.availabilityService.createException(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('exceptions/range')
  createExceptionRange(@Body() dto: CreateExceptionRangeDto) {
    return this.availabilityService.createExceptionRange(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('exceptions/import-french-holidays')
  importFrenchHolidays(@Body() dto: ImportFrenchHolidaysDto) {
    return this.availabilityService.importFrenchHolidays(dto.year);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('exceptions')
  removeAllExceptions(@Query('source') source?: ExceptionSource) {
    return this.availabilityService.removeAllExceptions(source);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('exceptions/:id')
  @HttpCode(204)
  removeException(@Param('id', ParseIntPipe) id: number) {
    return this.availabilityService.removeException(id);
  }

  @Get('extra-slots')
  findAllExtraSlots() {
    return this.availabilityService.findAllExtraSlots();
  }

  @UseGuards(JwtAuthGuard)
  @Post('extra-slots')
  createExtraSlot(@Body() dto: CreateExtraSlotDto) {
    return this.availabilityService.createExtraSlot(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('extra-slots/bulk')
  createExtraSlots(@Body() dto: CreateExtraSlotsDto) {
    return this.availabilityService.createExtraSlots(dto.slots);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('extra-slots')
  removeExtraSlotsByDate(@Query() query: DeleteExtraSlotsDto) {
    return this.availabilityService.removeExtraSlotsByDate(query.date);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('extra-slots/:id')
  @HttpCode(204)
  removeExtraSlot(@Param('id', ParseIntPipe) id: number) {
    return this.availabilityService.removeExtraSlot(id);
  }
}
