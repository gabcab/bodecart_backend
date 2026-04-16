import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { CurrencyService } from '../common/currency/currency.service';
import { CreateBodegaDto } from './dtos/create-bodega.dto';
import { UpdateBodegaDto } from './dtos/update-bodega.dto';
import { SearchBodegasDto } from './dtos/search-bodegas.dto';
import { UploadDocumentDto } from './dtos/upload-document.dto';
import { UserRole, DocumentType, DocumentStatus, OrderStatus } from '@prisma/client';
import { WebsocketGateway } from '../websocket/websocket.gateway';

@Injectable()
export class BodegasService {
  private readonly logger = new Logger(BodegasService.name);

  constructor(
    private prisma: PrismaService,
    private readonly websocketGateway: WebsocketGateway,
  ) {}

  /**
   * Enrich a bodega object with a `currency` field derived from its country.
   */
  private enrichBodegaWithCurrency<T extends { country: string }>(bodega: T): T & { currency: string } {
    const currency = CurrencyService.getCurrencyForCountry(bodega.country);
    return { ...bodega, currency };
  }

  async create(userId: string, createBodegaDto: CreateBodegaDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { bodegaOwner: true },
    });

    if (!user || !user.roles.includes(UserRole.BODEGA_OWNER)) {
      throw new ForbiddenException('Only bodega owners can create bodegas');
    }

    if (!user.bodegaOwner) {
      throw new NotFoundException('Bodega owner profile not found');
    }

    const bodega = await this.prisma.bodega.create({
      data: {
        ...createBodegaDto,
        ownerId: user.bodegaOwner.id,
        photos: [],
      },
    });

    return this.enrichBodegaWithCurrency({
      ...bodega,
      photos: bodega.photos || [],
    });
  }

  async findAll(ownerId?: string) {
    const bodegas = await this.prisma.bodega.findMany({
      where: ownerId ? { ownerId } : undefined,
      include: {
        owner: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                phone: true,
              },
            },
          },
        },
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
    });

    return bodegas.map((b) => this.enrichBodegaWithCurrency(b));
  }

  async findOne(id: string) {
    const bodega = await this.prisma.bodega.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            userId: true,
            businessName: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
        products: {
          where: {
            isAvailable: true,
          },
        },
        _count: {
          select: {
            products: true,
            orders: true,
            favorites: true,
          },
        },
      },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    return this.enrichBodegaWithCurrency(bodega);
  }

  async searchNearby(searchDto: SearchBodegasDto) {
    const { latitude, longitude, radius } = searchDto;

    if (!latitude || !longitude) {
      return this.findAll();
    }

    const radiusInMeters = (radius || 10) * 1000;
    const bodegas = await this.prisma.bodega.findMany({
      include: {
        owner: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                phone: true,
              },
            },
          },
        },
      },
    });

    return bodegas
      .filter((bodega) => {
        const distance = this.calculateDistance(
          latitude,
          longitude,
          bodega.latitude,
          bodega.longitude,
        );
        return distance <= radiusInMeters;
      })
      .sort((a, b) => {
        const distA = this.calculateDistance(latitude, longitude, a.latitude, a.longitude);
        const distB = this.calculateDistance(latitude, longitude, b.latitude, b.longitude);
        return distA - distB;
      })
      .map((b) => this.enrichBodegaWithCurrency(b));
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Search bodegas by estimated delivery time (ETA)
   * ETA = (avgPrepTime * busynessMultiplier) + travelTime + buffer
   */
  async searchByETA(latitude: number, longitude: number, radiusKm: number = 10) {
    const radiusInMeters = radiusKm * 1000;

    // Fetch all bodegas with their active order count
    const bodegas = await this.prisma.bodega.findMany({
      where: {
        isOpen: true,
      },
      include: {
        owner: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                phone: true,
              },
            },
          },
        },
        _count: {
          select: {
            products: true,
          },
        },
        orders: {
          where: {
            status: {
              in: [OrderStatus.PLACED, OrderStatus.ACCEPTED, OrderStatus.PREPARING],
            },
          },
          select: {
            id: true,
          },
        },
      },
    });

    // Calculate ETA for each bodega and filter by radius
    const bodegasWithETA = bodegas
      .map((bodega) => {
        // Calculate distance in meters
        const distanceMeters = this.calculateDistance(
          latitude,
          longitude,
          bodega.latitude,
          bodega.longitude,
        );

        // Skip if outside radius
        if (distanceMeters > radiusInMeters) {
          return null;
        }

        // Calculate travel time (assume 30 km/h average speed)
        const travelTimeMinutes = (distanceMeters / 1000 / 30) * 60;

        // Calculate busyness multiplier (1.0 + 0.1 per active order)
        const activeOrders = bodega.orders.length;
        const busynessMultiplier = 1.0 + activeOrders * 0.1;

        // Calculate total ETA
        const prepTime = bodega.avgPrepTimeMinutes * busynessMultiplier;
        const bufferMinutes = 5;
        const etaMinutes = Math.round(prepTime + travelTimeMinutes + bufferMinutes);

        // Remove orders from response (internal use only)
        const { orders, ...bodegaData } = bodega;

        return {
          ...bodegaData,
          distanceMeters: Math.round(distanceMeters),
          distanceKm: Math.round(distanceMeters / 100) / 10, // 1 decimal place
          etaMinutes,
          activeOrders,
          travelTimeMinutes: Math.round(travelTimeMinutes),
        };
      })
      .filter(Boolean) // Remove null entries (outside radius)
      .sort((a, b) => a!.etaMinutes - b!.etaMinutes); // Sort by ETA ascending

    return bodegasWithETA;
  }

  async update(id: string, userId: string, updateBodegaDto: UpdateBodegaDto) {
    const bodega = await this.prisma.bodega.findUnique({
      where: { id },
      include: {
        owner: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    if (bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only update your own bodegas');
    }

    // If isOpen is being manually set, clear the manual override to prevent conflicts
    const data: any = { ...updateBodegaDto };
    if (updateBodegaDto.isOpen !== undefined) {
      data.manualOverrideUntil = null;
    }

    const updatedBodega = await this.prisma.bodega.update({
      where: { id },
      data,
    });

    return updatedBodega;
  }

  async uploadLogo(id: string, userId: string, logoUrl: string) {
    const bodega = await this.prisma.bodega.findUnique({
      where: { id },
      include: {
        owner: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    if (bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only update your own bodegas');
    }

    const updatedBodega = await this.prisma.bodega.update({
      where: { id },
      data: { logo: logoUrl },
    });

    return updatedBodega;
  }

  async setPrimary(id: string, userId: string) {
    const bodega = await this.prisma.bodega.findUnique({
      where: { id },
      include: {
        owner: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    if (bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only set primary for your own bodegas');
    }

    // Use transaction to ensure atomicity
    await this.prisma.$transaction(async (tx) => {
      // Set all owner's bodegas to non-primary
      await tx.bodega.updateMany({
        where: {
          ownerId: bodega.ownerId,
        },
        data: {
          isPrimary: false,
        },
      });

      // Set this bodega as primary
      await tx.bodega.update({
        where: { id },
        data: {
          isPrimary: true,
        },
      });
    });

    // Return updated bodega
    return this.prisma.bodega.findUnique({
      where: { id },
    });
  }

  async remove(id: string, userId: string) {
    const bodega = await this.prisma.bodega.findUnique({
      where: { id },
      include: {
        owner: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    if (bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only delete your own bodegas');
    }

    await this.prisma.bodega.delete({
      where: { id },
    });

    return { message: 'Bodega deleted successfully' };
  }

  async findByOwner(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { bodegaOwner: true },
    });

    if (!user || !user.bodegaOwner) {
      throw new NotFoundException('Bodega owner profile not found');
    }

    const bodegas = await this.prisma.bodega.findMany({
      where: {
        ownerId: user.bodegaOwner.id,
      },
      include: {
        _count: {
          select: {
            products: true,
            orders: true,
          },
        },
      },
    });

    return bodegas.map((b) => this.enrichBodegaWithCurrency(b));
  }

  async getBodegaOwner(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { bodegaOwner: true },
    });

    if (!user || !user.bodegaOwner) {
      throw new NotFoundException('Bodega owner profile not found');
    }

    return user.bodegaOwner;
  }

  /**
   * Get bodegas that have products in a specific category, ordered by distance
   */
  async getBodegasByCategory(categoryId: string, latitude?: number, longitude?: number) {
    // First verify the category exists
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Find all bodegas that have at least one product in this category
    const bodegas = await this.prisma.bodega.findMany({
      where: {
        products: {
          some: {
            categoryId: categoryId,
            isAvailable: true,
          },
        },
      },
      include: {
        owner: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                phone: true,
              },
            },
          },
        },
        _count: {
          select: {
            products: {
              where: {
                categoryId: categoryId,
                isAvailable: true,
              },
            },
          },
        },
      },
    });

    // If no location provided, return bodegas without distance sorting
    if (!latitude || !longitude) {
      return bodegas.map(bodega => ({
        ...bodega,
        productsInCategory: bodega._count.products,
      }));
    }

    // Calculate distance for each bodega and sort
    const bodegasWithDistance = bodegas.map(bodega => {
      const distanceMeters = this.calculateDistance(
        latitude,
        longitude,
        bodega.latitude,
        bodega.longitude
      );

      return {
        ...bodega,
        productsInCategory: bodega._count.products,
        distanceMeters: Math.round(distanceMeters),
        distanceKm: Math.round(distanceMeters / 100) / 10, // 1 decimal place
      };
    });

    // Sort by distance (nearest first)
    bodegasWithDistance.sort((a, b) => a.distanceMeters - b.distanceMeters);

    return bodegasWithDistance;
  }

  // ============================================
  // DOCUMENT MANAGEMENT
  // ============================================

  async uploadDocument(
    bodegaId: string,
    userId: string,
    uploadDocumentDto: UploadDocumentDto,
    fileUrl: string,
    fileName: string,
    fileSize: number,
    mimeType: string,
  ) {
    // Verify ownership
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
      include: {
        owner: {
          include: { user: true },
        },
      },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    if (bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only upload documents for your own bodegas');
    }

    // Check if document of this type already exists
    const existingDoc = await this.prisma.bodegaDocument.findFirst({
      where: {
        bodegaId,
        type: uploadDocumentDto.type,
      },
    });

    // If exists, delete the old one
    if (existingDoc) {
      await this.prisma.bodegaDocument.delete({
        where: { id: existingDoc.id },
      });
    }

    // Create new document
    const document = await this.prisma.bodegaDocument.create({
      data: {
        bodegaId,
        type: uploadDocumentDto.type,
        fileUrl,
        fileName,
        fileSize,
        mimeType,
        status: DocumentStatus.PENDING,
        expiresAt: uploadDocumentDto.expiresAt ? new Date(uploadDocumentDto.expiresAt) : null,
      },
    });

    return document;
  }

  async getDocuments(bodegaId: string, userId: string) {
    // Verify ownership
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
      include: {
        owner: {
          include: { user: true },
        },
      },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    if (bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only view documents for your own bodegas');
    }

    const documents = await this.prisma.bodegaDocument.findMany({
      where: { bodegaId },
      orderBy: { createdAt: 'desc' },
    });

    return documents;
  }

  async deleteDocument(documentId: string, userId: string) {
    const document = await this.prisma.bodegaDocument.findUnique({
      where: { id: documentId },
      include: {
        bodega: {
          include: {
            owner: {
              include: { user: true },
            },
          },
        },
      },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only delete documents for your own bodegas');
    }

    await this.prisma.bodegaDocument.delete({
      where: { id: documentId },
    });

    return { message: 'Document deleted successfully' };
  }

  async getRequiredDocuments(bodegaId: string): Promise<{
    requiredTypes: DocumentType[];
    uploadedTypes: DocumentType[];
    missingTypes: DocumentType[];
  }> {
    // Documentos obligatorios para todos
    const baseRequired: DocumentType[] = [
      DocumentType.BUSINESS_LICENSE,
      DocumentType.EIN,
      DocumentType.OWNER_ID,
      DocumentType.BANK_INFORMATION,
      DocumentType.SALES_TAX_PERMIT,
    ];

    // Get uploaded documents
    const documents = await this.prisma.bodegaDocument.findMany({
      where: { bodegaId },
      select: { type: true },
    });

    const uploadedTypes = documents.map((doc) => doc.type);
    const missingTypes = baseRequired.filter((type) => !uploadedTypes.includes(type));

    return {
      requiredTypes: baseRequired,
      uploadedTypes,
      missingTypes,
    };
  }

  async checkVerificationStatus(bodegaId: string) {
    const { missingTypes } = await this.getRequiredDocuments(bodegaId);

    // Get all documents to check their status
    const documents = await this.prisma.bodegaDocument.findMany({
      where: { bodegaId },
    });

    const allApproved =
      documents.length > 0 && documents.every((doc) => doc.status === DocumentStatus.APPROVED);
    const hasRejected = documents.some((doc) => doc.status === DocumentStatus.REJECTED);
    const allDocumentsUploaded = missingTypes.length === 0;

    return {
      isVerified: allApproved && allDocumentsUploaded,
      allDocumentsUploaded,
      missingDocuments: missingTypes.length,
      totalDocuments: documents.length,
      approvedDocuments: documents.filter((d) => d.status === DocumentStatus.APPROVED).length,
      rejectedDocuments: documents.filter((d) => d.status === DocumentStatus.REJECTED).length,
      pendingDocuments: documents.filter((d) => d.status === DocumentStatus.PENDING).length,
      hasRejected,
    };
  }

  // ============================================
  // ADMIN METHODS
  // ============================================

  async verifyBodega(bodegaId: string, isVerified: boolean, reason?: string) {
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    const updatedBodega = await this.prisma.bodega.update({
      where: { id: bodegaId },
      data: { isVerified },
      include: {
        owner: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return updatedBodega;
  }

  async suspendBodega(bodegaId: string, reason: string) {
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    // Set isVerified to false to suspend
    const updatedBodega = await this.prisma.bodega.update({
      where: { id: bodegaId },
      data: {
        isVerified: false,
      },
      include: {
        owner: {
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    return updatedBodega;
  }

  async verifyDocument(
    bodegaId: string,
    documentId: string,
    reviewerId: string,
    status: DocumentStatus,
    rejectionReason?: string,
  ) {
    // Verify bodega exists
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    // Verify document exists and belongs to bodega
    const document = await this.prisma.bodegaDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (document.bodegaId !== bodegaId) {
      throw new BadRequestException('Document does not belong to this bodega');
    }

    // Update document status
    const updatedDocument = await this.prisma.bodegaDocument.update({
      where: { id: documentId },
      data: {
        status,
        reviewedAt: new Date(),
        reviewedById: reviewerId,
        rejectionReason: status === DocumentStatus.REJECTED ? rejectionReason : null,
      },
      include: {
        bodega: {
          select: {
            id: true,
            name: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    return updatedDocument;
  }

  async toggleFavorite(bodegaId: string, userId: string) {
    // First get the client from the user
    const client = await this.prisma.client.findUnique({
      where: { userId },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Check if bodega exists
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    // Check if favorite already exists
    const existingFavorite = await this.prisma.favorite.findUnique({
      where: {
        clientId_bodegaId: {
          clientId: client.id,
          bodegaId,
        },
      },
    });

    if (existingFavorite) {
      // Remove favorite
      await this.prisma.favorite.delete({
        where: { id: existingFavorite.id },
      });
      return { isFavorite: false };
    } else {
      // Add favorite
      await this.prisma.favorite.create({
        data: {
          clientId: client.id,
          bodegaId,
        },
      });
      return { isFavorite: true };
    }
  }

  // ============================================
  // SCHEDULE-BASED AUTO OPEN/CLOSE
  // ============================================

  @Cron('*/5 * * * *') // Every 5 minutes
  async autoUpdateBodegaStatus() {
    const now = new Date();

    // Get all bodegas with schedule configured
    const bodegas = await this.prisma.bodega.findMany({
      where: {
        openingTime: { not: null },
        closingTime: { not: null },
      },
    });

    for (const bodega of bodegas) {
      const currentTime = this.getCurrentTimeInTimezone(bodega.timezone || 'America/Santo_Domingo');
      const shouldBeOpen = this.isWithinSchedule(
        currentTime,
        bodega.openingTime!,
        bodega.closingTime!,
      );
      this.logger.debug(
        `Bodega "${bodega.name}" (${bodega.timezone}): schedule=${bodega.openingTime}-${bodega.closingTime}, localTime=${currentTime}, shouldBeOpen=${shouldBeOpen}, isOpen=${bodega.isOpen}`,
      );

      // Check manual override
      if (bodega.manualOverrideUntil && now < bodega.manualOverrideUntil) {
        // Manual override active - keep open regardless of schedule
        if (!bodega.isOpen) {
          await this.prisma.bodega.update({
            where: { id: bodega.id },
            data: { isOpen: true },
          });
          this.logger.log(
            `Bodega ${bodega.name} kept open by manual override (until ${bodega.manualOverrideUntil.toISOString()})`,
          );
        }
        continue;
      }

      // Clear expired override
      if (bodega.manualOverrideUntil && now >= bodega.manualOverrideUntil) {
        await this.prisma.bodega.update({
          where: { id: bodega.id },
          data: { manualOverrideUntil: null },
        });
        this.logger.log(`Bodega ${bodega.name} manual override expired`);
      }

      // Auto-update status based on schedule
      if (shouldBeOpen && !bodega.isOpen) {
        await this.prisma.bodega.update({
          where: { id: bodega.id },
          data: { isOpen: true },
        });
        this.logger.log(
          `Bodega ${bodega.name} auto-opened (schedule: ${bodega.openingTime}-${bodega.closingTime})`,
        );
        this.websocketGateway.emitBodegaStatusChanged(bodega.id, true);
      } else if (!shouldBeOpen && bodega.isOpen) {
        await this.prisma.bodega.update({
          where: { id: bodega.id },
          data: { isOpen: false },
        });
        this.logger.log(
          `Bodega ${bodega.name} auto-closed (schedule: ${bodega.openingTime}-${bodega.closingTime})`,
        );
        this.websocketGateway.emitBodegaStatusChanged(bodega.id, false);
      }
    }
  }

  private getCurrentTimeInTimezone(timezone: string): string {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(now);
      const hour = parts.find((p) => p.type === 'hour')?.value || '00';
      const minute = parts.find((p) => p.type === 'minute')?.value || '00';
      return `${hour}:${minute}`;
    } catch {
      // Fallback to server local time if timezone is invalid
      const now = new Date();
      return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }
  }

  private isWithinSchedule(
    currentTime: string,
    openingTime: string,
    closingTime: string,
  ): boolean {
    // Handle overnight schedules (e.g., 22:00 - 06:00)
    if (openingTime <= closingTime) {
      return currentTime >= openingTime && currentTime < closingTime;
    } else {
      return currentTime >= openingTime || currentTime < closingTime;
    }
  }

  async updateTimezone(bodegaId: string, timezone: string) {
    // Validate timezone is valid by trying to use it
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    } catch {
      throw new BadRequestException(`Invalid timezone: ${timezone}`);
    }

    const bodega = await this.prisma.bodega.findUnique({ where: { id: bodegaId } });
    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    return this.prisma.bodega.update({
      where: { id: bodegaId },
      data: { timezone },
    });
  }

  async extendHours(bodegaId: string, userId: string) {
    const bodega = await this.prisma.bodega.findUnique({
      where: { id: bodegaId },
      include: {
        owner: {
          include: { user: true },
        },
      },
    });

    if (!bodega) {
      throw new NotFoundException('Bodega not found');
    }

    if (bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only extend hours for your own bodegas');
    }

    const overrideUntil = new Date();
    overrideUntil.setHours(overrideUntil.getHours() + 1);

    const updatedBodega = await this.prisma.bodega.update({
      where: { id: bodegaId },
      data: {
        isOpen: true,
        manualOverrideUntil: overrideUntil,
      },
    });

    return updatedBodega;
  }

  async getFavorites(userId: string) {
    // First get the client from the user
    const client = await this.prisma.client.findUnique({
      where: { userId },
    });

    if (!client) {
      return [];
    }

    // Get all favorites for this client with bodega details
    const favorites = await this.prisma.favorite.findMany({
      where: { clientId: client.id },
      include: {
        bodega: {
          include: {
            owner: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
            _count: {
              select: {
                products: true,
                orders: true,
                reviews: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Return just the bodegas
    return favorites.map((fav) => fav.bodega);
  }
}
