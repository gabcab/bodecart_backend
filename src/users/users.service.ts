import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UploadService } from '../common/upload/upload.service';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UpdateClientDto } from './dtos/update-client.dto';
import { UpdateDeliveryPersonDto } from './dtos/update-delivery-person.dto';
import { UpdatePayoutMethodsDto } from './dtos/update-payout-methods.dto';
import { UserRole, UserStatus, DocumentType, DeliveryDocumentType, DeliveryStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        roles: true,
        status: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
        client: true,
        bodegaOwner: {
          include: {
            bodegas: true,
          },
        },
        deliveryPerson: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Compute delivery stats dynamically from actual Delivery records
    if (user.deliveryPerson) {
      const deliveryPersonId = user.deliveryPerson.id;

      const totalAssigned = await this.prisma.delivery.count({
        where: { deliveryPersonId },
      });

      const deliveredCount = await this.prisma.delivery.count({
        where: {
          deliveryPersonId,
          status: DeliveryStatus.DELIVERED,
        },
      });

      const completionRate = totalAssigned > 0
        ? (deliveredCount / totalAssigned) * 100
        : 0;

      user.deliveryPerson.totalDeliveries = totalAssigned;
      user.deliveryPerson.completionRate = completionRate;
    }

    return user;
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: updateUserDto,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        roles: true,
        status: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
      },
    });

    return user;
  }

  async clearAvatar(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, avatar: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.avatar) {
      try {
        await this.uploadService.deleteFile(user.avatar);
      } catch (error) {
        // Ignore storage delete errors; still clear DB avatar reference
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatar: null },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        roles: true,
        status: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
        lastLogin: true,
      },
    });

    return updatedUser;
  }

  async updateClientProfile(userId: string, updateClientDto: UpdateClientDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { client: true },
    });

    if (!user || !user.roles.includes(UserRole.CLIENT)) {
      throw new ForbiddenException('Only clients can update client profile');
    }

    if (!user.client) {
      throw new NotFoundException('Client profile not found');
    }

    const client = await this.prisma.client.update({
      where: { id: user.client.id },
      data: updateClientDto,
    });

    return client;
  }

  async updateDeliveryPersonProfile(
    userId: string,
    updateDeliveryPersonDto: UpdateDeliveryPersonDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { deliveryPerson: true },
    });

    if (!user || !user.roles.includes(UserRole.DELIVERY_PERSON)) {
      throw new ForbiddenException('Only delivery persons can update delivery profile');
    }

    if (!user.deliveryPerson) {
      throw new NotFoundException('Delivery person profile not found');
    }

    const deliveryPerson = await this.prisma.deliveryPerson.update({
      where: { id: user.deliveryPerson.id },
      data: updateDeliveryPersonDto,
    });

    return deliveryPerson;
  }

  // ============================================
  // PAYOUT METHODS (BODEGA OWNER & DELIVERY PERSON)
  // ============================================

  async getPayoutMethods(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        bodegaOwner: true,
        deliveryPerson: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.roles.includes(UserRole.BODEGA_OWNER) && user.bodegaOwner) {
      return {
        paypalEmail: user.bodegaOwner.paypalEmail,
        stripeAccountId: user.bodegaOwner.stripeAccountId,
        bankAccount: user.bodegaOwner.bankAccount,
      };
    } else if (user.roles.includes(UserRole.DELIVERY_PERSON) && user.deliveryPerson) {
      return {
        paypalEmail: user.deliveryPerson.paypalEmail,
        stripeAccountId: user.deliveryPerson.stripeAccountId,
        bankAccount: user.deliveryPerson.bankAccount,
      };
    } else {
      throw new ForbiddenException('Only bodega owners and delivery persons can access payout methods');
    }
  }

  async updatePayoutMethods(userId: string, dto: UpdatePayoutMethodsDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        bodegaOwner: true,
        deliveryPerson: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.roles.includes(UserRole.BODEGA_OWNER) && user.bodegaOwner) {
      const updatedBodegaOwner = await this.prisma.bodegaOwner.update({
        where: { id: user.bodegaOwner.id },
        data: {
          paypalEmail: dto.paypalEmail,
          stripeAccountId: dto.stripeAccountId,
          bankAccount: dto.bankAccount,
        },
        select: {
          paypalEmail: true,
          stripeAccountId: true,
          bankAccount: true,
        },
      });

      return updatedBodegaOwner;
    } else if (user.roles.includes(UserRole.DELIVERY_PERSON) && user.deliveryPerson) {
      const updatedDeliveryPerson = await this.prisma.deliveryPerson.update({
        where: { id: user.deliveryPerson.id },
        data: {
          paypalEmail: dto.paypalEmail,
          stripeAccountId: dto.stripeAccountId,
          bankAccount: dto.bankAccount,
        },
        select: {
          paypalEmail: true,
          stripeAccountId: true,
          bankAccount: true,
        },
      });

      return updatedDeliveryPerson;
    } else {
      throw new ForbiddenException('Only bodega owners and delivery persons can update payout methods');
    }
  }

  async getUserById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        roles: true,
        status: true,
        avatar: true,
        createdAt: true,
        lastLogin: true,
        client: {
          select: {
            id: true,
          },
        },
        bodegaOwner: {
          select: {
            id: true,
            businessName: true,
          },
        },
        deliveryPerson: {
          select: {
            id: true,
            vehicleType: true,
            isVerified: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async getAvailableDeliveryPersons() {
    const deliveryPersons = await this.prisma.deliveryPerson.findMany({
      where: {
        isAvailable: true,
        user: {
          status: 'ACTIVE',
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            phone: true,
            avatar: true,
          },
        },
      },
    });

    return deliveryPersons;
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async getAllUsers(params?: {
    role?: UserRole;
    status?: UserStatus;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (params?.role) where.roles = { has: params.role };
    if (params?.status) where.status = params.status;
    if (params?.search) {
      where.OR = [
        { email: { contains: params.search, mode: 'insensitive' } },
        { firstName: { contains: params.search, mode: 'insensitive' } },
        { lastName: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          roles: true,
          status: true,
          avatar: true,
          createdAt: true,
          lastLogin: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateUserStatus(userId: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        roles: true,
        status: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  async updateUserRole(userId: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        client: true,
        bodegaOwner: true,
        deliveryPerson: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.$transaction(async (tx) => {
      // Add role if not already present
      if (!user.roles.includes(role)) {
        await tx.user.update({
          where: { id: userId },
          data: { roles: { push: role } },
        });
      }

      // Create missing profiles based on new role
      if (role === UserRole.CLIENT && !user.client) {
        await tx.client.create({
          data: { userId },
        });
      } else if (role === UserRole.BODEGA_OWNER && !user.bodegaOwner) {
        await tx.bodegaOwner.create({
          data: { userId },
        });
      } else if (role === UserRole.DELIVERY_PERSON && !user.deliveryPerson) {
        await tx.deliveryPerson.create({
          data: { userId },
        });
      }
    });

    // Return updated user
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        roles: true,
        status: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async removeUserRole(userId: string, role: UserRole) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.roles.includes(role)) {
      throw new BadRequestException(`User does not have role ${role}`);
    }

    if (user.roles.length <= 1) {
      throw new BadRequestException('Cannot remove the last role from a user');
    }

    const updatedRoles = user.roles.filter((r) => r !== role);

    return this.prisma.user.update({
      where: { id: userId },
      data: { roles: { set: updatedRoles } },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        roles: true,
        status: true,
        avatar: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async deleteUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Soft delete by setting status to INACTIVE
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.INACTIVE },
    });

    return { message: 'User deleted successfully' };
  }

  // ============================================
  // DOCUMENT UPLOAD METHODS
  // ============================================

  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
    documentType: string,
    bodegaId?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        bodegaOwner: {
          include: { bodegas: true },
        },
        deliveryPerson: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Determine folder based on user's roles
    const isBodegaOwner = user.roles.includes(UserRole.BODEGA_OWNER);
    const isDeliveryPerson = user.roles.includes(UserRole.DELIVERY_PERSON);

    // Upload file
    const folder = isBodegaOwner ? 'bodega-documents' : 'delivery-documents';
    const filename = `${userId}-${documentType}-${Date.now()}`;
    const documentMimeTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    const documentMaxSize = 10 * 1024 * 1024; // 10MB for documents
    const fileUrl = await this.uploadService.uploadFile(file, folder, filename, documentMimeTypes, documentMaxSize);

    // Create document record based on user role
    if (isBodegaOwner && Object.values(DocumentType).includes(documentType as DocumentType)) {
      // If bodegaId is not provided, use the primary bodega
      let targetBodegaId = bodegaId;
      if (!targetBodegaId) {
        const primaryBodega = user.bodegaOwner?.bodegas.find((b) => b.isPrimary);
        if (!primaryBodega) {
          throw new BadRequestException('No bodega found. Please create a bodega first.');
        }
        targetBodegaId = primaryBodega.id;
      }

      const document = await this.prisma.bodegaDocument.create({
        data: {
          bodegaId: targetBodegaId,
          type: documentType as DocumentType,
          fileUrl,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
        },
      });

      return {
        message: 'Document uploaded successfully',
        document,
      };
    } else if (isDeliveryPerson && Object.values(DeliveryDocumentType).includes(documentType as DeliveryDocumentType)) {
      if (!user.deliveryPerson) {
        throw new BadRequestException('Delivery person profile not found');
      }

      const document = await this.prisma.deliveryPersonDocument.create({
        data: {
          deliveryPersonId: user.deliveryPerson.id,
          type: documentType as DeliveryDocumentType,
          fileUrl,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
        },
      });

      return {
        message: 'Document uploaded successfully',
        document,
      };
    } else {
      throw new ForbiddenException('Only bodega owners and delivery persons can upload documents');
    }
  }

  async getMyDocuments(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        bodegaOwner: {
          include: {
            bodegas: {
              include: {
                documents: {
                  orderBy: { createdAt: 'desc' },
                },
              },
            },
          },
        },
        deliveryPerson: {
          include: {
            documents: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.roles.includes(UserRole.BODEGA_OWNER)) {
      const allDocuments = user.bodegaOwner?.bodegas.flatMap((bodega) => bodega.documents) || [];
      return { documents: allDocuments };
    } else if (user.roles.includes(UserRole.DELIVERY_PERSON)) {
      return { documents: user.deliveryPerson?.documents || [] };
    } else {
      throw new ForbiddenException('Only bodega owners and delivery persons can view documents');
    }
  }
}
