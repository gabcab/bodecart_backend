import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateAddressDto } from './dtos/create-address.dto';
import { UpdateAddressDto } from './dtos/update-address.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AddressesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, createAddressDto: CreateAddressDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { client: true },
    });

    if (!user || !user.roles.includes(UserRole.CLIENT)) {
      throw new ForbiddenException('Only clients can create addresses');
    }

    // Find or create client
    let client = user.client;
    if (!client) {
      client = await this.prisma.client.create({
        data: { userId },
      });
    }

    // Check if this is the first address
    const existingAddresses = await this.prisma.address.count({
      where: { clientId: client.id },
    });

    // If this is the first address, make it default automatically
    const isDefault = createAddressDto.isDefault || existingAddresses === 0;

    // If this address is set as default, unset other defaults
    if (isDefault) {
      await this.prisma.address.updateMany({
        where: { clientId: client.id },
        data: { isDefault: false },
      });
    }

    const address = await this.prisma.address.create({
      data: {
        ...createAddressDto,
        isDefault,
        clientId: client.id,
        country: createAddressDto.country || 'Panamá',
      },
    });

    return address;
  }

  async findAll(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { client: true },
    });

    if (!user || !user.roles.includes(UserRole.CLIENT)) {
      throw new ForbiddenException('Only clients can view addresses');
    }

    // Find or create client
    let client = user.client;
    if (!client) {
      client = await this.prisma.client.create({
        data: { userId },
      });
      return [];
    }

    const addresses = await this.prisma.address.findMany({
      where: { clientId: client.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });

    return addresses;
  }

  async getDefault(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        client: {
          include: {
            addresses: {
              where: { isDefault: true },
            },
          },
        },
      },
    });

    if (!user || !user.roles.includes(UserRole.CLIENT)) {
      throw new ForbiddenException('Only clients can view addresses');
    }

    if (!user.client || user.client.addresses.length === 0) {
      return null;
    }

    return user.client.addresses[0];
  }

  async findOne(id: string, userId: string) {
    const address = await this.prisma.address.findUnique({
      where: { id },
      include: {
        client: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    // Verify ownership
    if (address.client.userId !== userId) {
      throw new ForbiddenException('You can only view your own addresses');
    }

    return address;
  }

  async update(id: string, userId: string, updateAddressDto: UpdateAddressDto) {
    const address = await this.findOne(id, userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { client: true },
    });

    // If this address is set as default, unset other defaults
    if (updateAddressDto.isDefault) {
      await this.prisma.address.updateMany({
        where: {
          clientId: user.client.id,
          id: { not: id },
        },
        data: { isDefault: false },
      });
    }

    const updatedAddress = await this.prisma.address.update({
      where: { id },
      data: updateAddressDto,
    });

    return updatedAddress;
  }

  async remove(id: string, userId: string) {
    const address = await this.findOne(id, userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { client: true },
    });

    await this.prisma.address.delete({
      where: { id },
    });

    // If the deleted address was default, set another one as default
    if (address.isDefault) {
      const nextAddress = await this.prisma.address.findFirst({
        where: { clientId: user.client.id },
        orderBy: { createdAt: 'desc' },
      });

      if (nextAddress) {
        await this.prisma.address.update({
          where: { id: nextAddress.id },
          data: { isDefault: true },
        });
      }
    }

    return { message: 'Address deleted successfully' };
  }

  async setDefault(id: string, userId: string) {
    const address = await this.findOne(id, userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { client: true },
    });

    // Unset all other defaults
    await this.prisma.address.updateMany({
      where: { clientId: user.client.id },
      data: { isDefault: false },
    });

    // Set this one as default
    const updatedAddress = await this.prisma.address.update({
      where: { id },
      data: { isDefault: true },
    });

    return updatedAddress;
  }
}
