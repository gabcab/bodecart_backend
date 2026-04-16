import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CurrencyService } from '../common/currency/currency.service';
import { CreateProductDto } from './dtos/create-product.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import { BulkProductRow, BulkUploadResult } from './dtos/bulk-upload-product.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    private prisma: PrismaService,
    private currencyService: CurrencyService,
  ) {}

  async create(userId: string, createProductDto: CreateProductDto) {
    const { bodegaIds, originalPrice, originalCurrency, ...productData } = createProductDto;

    // Fetch all bodegas with their owners
    const bodegas = await this.prisma.bodega.findMany({
      where: {
        id: { in: bodegaIds },
      },
      include: {
        owner: {
          include: {
            user: true,
          },
        },
      },
    });

    // Validate all bodegas exist
    if (bodegas.length !== bodegaIds.length) {
      const foundIds = bodegas.map((b) => b.id);
      const missingIds = bodegaIds.filter((id) => !foundIds.includes(id));
      throw new NotFoundException(`Bodegas not found: ${missingIds.join(', ')}`);
    }

    // Validate user owns all bodegas
    const notOwnedBodegas = bodegas.filter((b) => b.owner.user.id !== userId);
    if (notOwnedBodegas.length > 0) {
      throw new ForbiddenException(
        `You can only create products for your own bodegas. Unauthorized bodegas: ${notOwnedBodegas.map((b) => b.name).join(', ')}`,
      );
    }

    // Handle currency conversion: if originalPrice + originalCurrency are provided,
    // convert to USD for the `price` field
    let priceInUsd = productData.price;
    let discountPriceInUsd = productData.discountPrice;
    let storedOriginalPrice = originalPrice;
    let storedOriginalCurrency = originalCurrency?.toUpperCase();

    if (originalPrice != null && originalCurrency && originalCurrency.toUpperCase() !== 'USD') {
      priceInUsd = this.currencyService.toUsd(originalPrice, storedOriginalCurrency!);
      if (productData.discountPrice != null) {
        discountPriceInUsd = this.currencyService.toUsd(productData.discountPrice, storedOriginalCurrency!);
      }
      this.logger.log(
        `Currency conversion: ${originalPrice} ${storedOriginalCurrency} => ${priceInUsd} USD`,
      );
    } else if (originalPrice != null && (!originalCurrency || originalCurrency.toUpperCase() === 'USD')) {
      // Price given in USD, store original fields for consistency
      storedOriginalCurrency = 'USD';
    }

    // Create products in a transaction (all or nothing)
    const products = await this.prisma.$transaction(
      bodegaIds.map((bodegaId) =>
        this.prisma.product.create({
          data: {
            name: productData.name,
            description: productData.description,
            categoryId: productData.categoryId,
            subcategory: productData.subcategory,
            price: priceInUsd,
            discountPrice: discountPriceInUsd,
            originalPrice: storedOriginalPrice,
            originalCurrency: storedOriginalCurrency,
            stock: productData.stock,
            bodegaId: bodegaId,
            images: productData.images || [],
            isAvailable: productData.isAvailable ?? true,
            barcode: productData.barcode,
            isBundle: productData.isBundle ?? false,
            bundleItems: productData.isBundle && productData.bundleItems ? {
              create: productData.bundleItems.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
              })),
            } : undefined,
          },
          include: {
            bodega: {
              select: {
                id: true,
                name: true,
                street: true,
                city: true,
                country: true,
              },
            },
            category: true,
            bundleItems: {
              include: {
                product: true,
              },
            },
          },
        }),
      ),
    );

    // Enrich with displayPrice
    return products.map((p) => this.enrichProductWithDisplayPrice(p));
  }

  /**
   * Enrich a product with displayPrice and displayCurrency.
   * If the product has originalPrice, use that for display.
   * Otherwise, derive from the bodega's country currency.
   */
  private enrichProductWithDisplayPrice(product: any): any {
    let displayPrice = product.price;
    let displayCurrency = 'USD';
    let displayDiscountPrice = product.discountPrice;

    if (product.originalPrice != null && product.originalCurrency) {
      // Product was entered in a local currency; use the stored original for display
      displayPrice = product.originalPrice;
      displayCurrency = product.originalCurrency;
      // For discount, recalculate from USD if not stored as original
      if (product.discountPrice != null && product.originalCurrency !== 'USD') {
        displayDiscountPrice = this.currencyService.fromUsd(
          product.discountPrice,
          product.originalCurrency,
        );
      }
    } else if (product.bodega?.country) {
      // No original currency stored; derive from bodega country
      const currency = CurrencyService.getCurrencyForCountry(product.bodega.country);
      if (currency !== 'USD') {
        displayPrice = this.currencyService.fromUsd(product.price, currency);
        displayCurrency = currency;
        if (product.discountPrice != null) {
          displayDiscountPrice = this.currencyService.fromUsd(product.discountPrice, currency);
        }
      }
    }

    return {
      ...product,
      displayPrice,
      displayCurrency,
      displayDiscountPrice,
    };
  }

  /**
   * Build the Prisma include fragment for category with optional translation.
   */
  private categoryInclude(locale?: string) {
    if (!locale) return { category: true } as const;
    return {
      category: {
        include: {
          translations: {
            where: { locale },
            take: 1,
          },
        },
      },
    } as const;
  }

  /**
   * Resolve translated category name on a product that includes category with translations.
   */
  private resolveCategoryTranslation(product: any): any {
    if (!product.category) return product;
    const translations = product.category.translations;
    const translatedName = translations?.[0]?.name;
    const { translations: _, ...categoryRest } = product.category;
    return {
      ...product,
      category: {
        ...categoryRest,
        name: translatedName ?? product.category.name,
      },
    };
  }

  async findAll(locale?: string) {
    const products = await this.prisma.product.findMany({
      where: {
        isAvailable: true,
      },
      include: {
        bodega: {
          select: {
            id: true,
            name: true,
            street: true,
            city: true,
            country: true,
          },
        },
        ...this.categoryInclude(locale),
        bundleItems: {
          include: {
            product: true,
          },
        },
      },
    });

    return products
      .map((p) => this.resolveCategoryTranslation(p))
      .map((p) => this.enrichProductWithDisplayPrice(p));
  }

  async findByBodega(bodegaId: string, locale?: string) {
    const products = await this.prisma.product.findMany({
      where: {
        bodegaId,
      },
      include: {
        bodega: {
          select: {
            id: true,
            name: true,
            country: true,
          },
        },
        ...this.categoryInclude(locale),
        bundleItems: {
          include: {
            product: true,
          },
        },
      },
    });

    return products
      .map((p) => this.resolveCategoryTranslation(p))
      .map((p) => this.enrichProductWithDisplayPrice(p));
  }

  async findOne(id: string, locale?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        bodega: {
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
        },
        ...this.categoryInclude(locale),
        bundleItems: {
          include: {
            product: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return this.enrichProductWithDisplayPrice(this.resolveCategoryTranslation(product));
  }

  async update(id: string, userId: string, updateProductDto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        bodega: {
          include: {
            owner: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only update products from your own bodegas');
    }

    const { bundleItems, isBundle, originalPrice, originalCurrency, ...updateData } = updateProductDto;

    // Handle currency conversion on update
    if (originalPrice != null && originalCurrency && originalCurrency.toUpperCase() !== 'USD') {
      const currency = originalCurrency.toUpperCase();
      updateData.price = this.currencyService.toUsd(originalPrice, currency);
      if (updateData.discountPrice != null) {
        updateData.discountPrice = this.currencyService.toUsd(updateData.discountPrice, currency);
      }
      (updateData as any).originalPrice = originalPrice;
      (updateData as any).originalCurrency = currency;
      this.logger.log(
        `Currency conversion on update: ${originalPrice} ${currency} => ${updateData.price} USD`,
      );
    } else if (originalPrice != null) {
      (updateData as any).originalPrice = originalPrice;
      (updateData as any).originalCurrency = originalCurrency?.toUpperCase() || 'USD';
    }

    // Check if we need to update bundles
    let bundleItemsUpdate;
    // If it is becoming a bundle or updating its bundle array
    if (Object.prototype.hasOwnProperty.call(updateProductDto, 'isBundle')) {
      if (isBundle && bundleItems) {
        bundleItemsUpdate = {
          deleteMany: {},
          create: bundleItems.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        };
      } else if (!isBundle) {
        bundleItemsUpdate = {
          deleteMany: {},
        };
      }
    } else if (product.isBundle && bundleItems) {
      // It is already a bundle, and we are just updating the items
      bundleItemsUpdate = {
        deleteMany: {},
        create: bundleItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      };
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: {
        ...updateData,
        isBundle: isBundle !== undefined ? isBundle : undefined,
        bundleItems: bundleItemsUpdate,
      },
      include: {
        bundleItems: {
          include: {
            product: true,
          },
        },
      },
    });

    return updatedProduct;
  }

  async remove(id: string, userId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        bodega: {
          include: {
            owner: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only delete products from your own bodegas');
    }

    await this.prisma.product.delete({
      where: { id },
    });

    return { message: 'Product deleted successfully' };
  }

  async searchProducts(query: string) {
    const products = await this.prisma.product.findMany({
      where: {
        isAvailable: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: {
        bodega: {
          select: {
            id: true,
            name: true,
            street: true,
            city: true,
            country: true,
          },
        },
      },
    });

    return products.map((p) => this.enrichProductWithDisplayPrice(p));
  }

  async addImages(productId: string, userId: string, imageUrls: string[]) {
    // First verify the product exists and user owns it
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        bodega: {
          include: {
            owner: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only add images to your own products');
    }

    // Append new images to existing ones
    const updatedImages = [...(product.images || []), ...imageUrls];

    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: { images: updatedImages },
      include: {
        bodega: {
          select: {
            id: true,
            name: true,
            street: true,
            city: true,
          },
        },
        category: true,
      },
    });

    return { images: updatedProduct.images };
  }

  async removeImage(productId: string, userId: string, imageUrl: string) {
    // First verify the product exists and user owns it
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: {
        bodega: {
          include: {
            owner: {
              include: {
                user: true,
              },
            },
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (product.bodega.owner.user.id !== userId) {
      throw new ForbiddenException('You can only remove images from your own products');
    }

    // Check if image exists in the product
    const currentImages = product.images || [];
    if (!currentImages.includes(imageUrl)) {
      throw new NotFoundException('Image not found in this product');
    }

    // Remove the image from the array
    const updatedImages = currentImages.filter((img) => img !== imageUrl);

    const updatedProduct = await this.prisma.product.update({
      where: { id: productId },
      data: { images: updatedImages },
      include: {
        bodega: {
          select: {
            id: true,
            name: true,
            street: true,
            city: true,
          },
        },
        category: true,
      },
    });

    return {
      message: 'Image removed successfully',
      images: updatedProduct.images,
    };
  }

  async bulkUpload(
    userId: string,
    bodegaIds: string[],
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<BulkUploadResult> {
    // Validate bodegas ownership
    const bodegas = await this.prisma.bodega.findMany({
      where: { id: { in: bodegaIds } },
      include: {
        owner: {
          include: { user: true },
        },
      },
    });

    if (bodegas.length !== bodegaIds.length) {
      throw new NotFoundException('One or more bodegas not found');
    }

    const notOwnedBodegas = bodegas.filter((b) => b.owner.user.id !== userId);
    if (notOwnedBodegas.length > 0) {
      throw new ForbiddenException('You can only upload products to your own bodegas');
    }

    // Parse CSV content
    const content = fileBuffer.toString('utf-8');
    const rows = this.parseCSV(content);

    if (rows.length === 0) {
      throw new BadRequestException('The file is empty or has no valid data rows');
    }

    // Get all categories for mapping names to IDs
    const categories = await this.prisma.category.findMany();
    const categoryMap = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

    const result: BulkUploadResult = {
      success: true,
      totalRows: rows.length,
      successCount: 0,
      errorCount: 0,
      errors: [],
      createdProducts: [],
    };

    // Process each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +2 because row 1 is header, and we're 0-indexed

      try {
        // Validate required fields
        if (!row.name || row.name.trim() === '') {
          throw new Error('El nombre del producto es requerido');
        }
        if (!row.categoryName || row.categoryName.trim() === '') {
          throw new Error('La categoría es requerida');
        }
        if (row.price === undefined || row.price === null || isNaN(row.price)) {
          throw new Error('El precio es requerido y debe ser un número');
        }
        if (row.stock === undefined || row.stock === null || isNaN(row.stock)) {
          throw new Error('El stock es requerido y debe ser un número');
        }

        // Find category by name
        const categoryId = categoryMap.get(row.categoryName.toLowerCase());
        if (!categoryId) {
          throw new Error(`Categoría "${row.categoryName}" no encontrada`);
        }

        // Process images if provided
        const images = row.images || [];

        // Create product in all selected bodegas
        await this.prisma.$transaction(
          bodegaIds.map((bodegaId) =>
            this.prisma.product.create({
              data: {
                name: row.name.trim(),
                description: row.description?.trim() || null,
                categoryId,
                subcategory: row.subcategory?.trim() || null,
                price: Number(row.price),
                discountPrice: row.discountPrice ? Number(row.discountPrice) : null,
                stock: Number(row.stock),
                bodegaId,
                images: images,
                isAvailable: row.isAvailable !== false,
              },
            }),
          ),
        );

        result.successCount++;
        result.createdProducts.push({
          name: row.name,
          bodegaCount: bodegaIds.length,
        });
      } catch (error) {
        result.errorCount++;
        result.errors.push({
          row: rowNumber,
          name: row.name || 'Sin nombre',
          error: error.message || 'Error desconocido',
        });
      }
    }

    result.success = result.errorCount === 0;
    return result;
  }

  private parseCSV(content: string): BulkProductRow[] {
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');
    if (lines.length < 2) return [];

    // Parse header
    const headerLine = lines[0];
    const headers = this.parseCSVLine(headerLine).map((h) => h.toLowerCase().trim());

    // Map column indices
    const nameIndex = headers.findIndex((h) => h === 'nombre' || h === 'name');
    const descriptionIndex = headers.findIndex((h) => h === 'descripcion' || h === 'description');
    const categoryIndex = headers.findIndex((h) => h === 'categoria' || h === 'category');
    const subcategoryIndex = headers.findIndex((h) => h === 'subcategoria' || h === 'subcategory');
    const priceIndex = headers.findIndex((h) => h === 'precio' || h === 'price');
    const discountPriceIndex = headers.findIndex(
      (h) => h === 'precio_descuento' || h === 'discountprice' || h === 'discount_price',
    );
    const stockIndex = headers.findIndex((h) => h === 'stock' || h === 'cantidad');
    const availableIndex = headers.findIndex(
      (h) => h === 'disponible' || h === 'isavailable' || h === 'available',
    );
    const imagesIndex = headers.findIndex(
      (h) => h === 'imagenes' || h === 'images' || h === 'fotos' || h === 'photos',
    );

    if (nameIndex === -1 || categoryIndex === -1 || priceIndex === -1 || stockIndex === -1) {
      throw new BadRequestException(
        'El archivo CSV debe contener las columnas: nombre, categoria, precio, stock',
      );
    }

    const rows: BulkProductRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length === 0 || values.every((v) => v.trim() === '')) continue;

      // Parse images: URLs separated by | (pipe)
      let images: string[] = [];
      if (imagesIndex !== -1 && values[imagesIndex]) {
        images = values[imagesIndex]
          .split('|')
          .map((url) => url.trim())
          .filter((url) => url.length > 0 && (url.startsWith('http://') || url.startsWith('https://')));
      }

      const row: BulkProductRow = {
        name: values[nameIndex] || '',
        description: descriptionIndex !== -1 ? values[descriptionIndex] : undefined,
        categoryName: values[categoryIndex] || '',
        subcategory: subcategoryIndex !== -1 ? values[subcategoryIndex] : undefined,
        price: priceIndex !== -1 ? parseFloat(values[priceIndex]) : 0,
        discountPrice:
          discountPriceIndex !== -1 && values[discountPriceIndex]
            ? parseFloat(values[discountPriceIndex])
            : undefined,
        stock: stockIndex !== -1 ? parseInt(values[stockIndex], 10) : 0,
        isAvailable:
          availableIndex !== -1
            ? values[availableIndex]?.toLowerCase() === 'true' ||
              values[availableIndex]?.toLowerCase() === 'si' ||
              values[availableIndex] === '1'
            : true,
        images: images,
      };

      rows.push(row);
    }

    return rows;
  }

  private parseCSVLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        if (nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if ((char === ',' || char === ';') && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());

    return values;
  }

  async getCategories() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }
}
