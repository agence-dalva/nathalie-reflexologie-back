import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  findAllPublic() {
    return this.prisma.service.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  findAllAdmin() {
    return this.prisma.service.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) {
      throw new NotFoundException('Prestation introuvable');
    }
    return service;
  }

  create(dto: CreateServiceDto) {
    return this.prisma.service.create({ data: dto });
  }

  async update(id: number, dto: UpdateServiceDto) {
    await this.findOne(id);
    return this.prisma.service.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findOne(id);
    const bookingCount = await this.prisma.booking.count({
      where: { serviceId: id },
    });

    if (bookingCount > 0) {
      throw new BadRequestException(
        'Cette prestation a des réservations liées : désactivez-la au lieu de la supprimer',
      );
    }

    await this.prisma.service.delete({ where: { id } });
  }
}
