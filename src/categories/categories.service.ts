import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(createCategoryDto: CreateCategoryDto) {
    // Check if category with same name already exists
    const existingCategory = await this.prisma.category.findUnique({
      where: { name: createCategoryDto.name },
    });

    if (existingCategory) {
      throw new ConflictException(`Category with name "${createCategoryDto.name}" already exists`);
    }

    const category = await this.prisma.category.create({
      data: createCategoryDto,
    });

    return category;
  }

  async findAll(locale?: string) {
    const categories = await this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: {
        translations: locale
          ? { where: { locale }, take: 1 }
          : false,
      },
    });

    // If locale was requested, resolve translated name (fallback to original)
    return categories.map((cat) => {
      const translations = (cat as any).translations;
      const translatedName = translations?.[0]?.name;
      const { translations: _, ...rest } = cat as any;
      return {
        ...rest,
        name: translatedName ?? cat.name,
      };
    });
  }

  async findOne(id: string, locale?: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
        translations: locale
          ? { where: { locale }, take: 1 }
          : false,
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const translations = (category as any).translations;
    const translatedName = translations?.[0]?.name;
    const { translations: _, ...rest } = category as any;
    return {
      ...rest,
      name: translatedName ?? category.name,
    };
  }

  async findByName(name: string) {
    const category = await this.prisma.category.findUnique({
      where: { name },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException(`Category with name "${name}" not found`);
    }

    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // If updating value, check for conflicts
    if (updateCategoryDto.name && updateCategoryDto.name !== category.name) {
      const existingCategory = await this.prisma.category.findUnique({
        where: { name: updateCategoryDto.name },
      });

      if (existingCategory) {
        throw new ConflictException(
          `Category with name "${updateCategoryDto.name}" already exists`,
        );
      }
    }

    const updatedCategory = await this.prisma.category.update({
      where: { id },
      data: updateCategoryDto,
    });

    return updatedCategory;
  }

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    // Check if category has products
    if (category._count.products > 0) {
      throw new ConflictException(
        `Cannot delete category with ${category._count.products} associated products. Remove products first.`,
      );
    }

    await this.prisma.category.delete({
      where: { id },
    });

    return { message: 'Category deleted successfully' };
  }

  async getProductsByCategory(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    const products = await this.prisma.product.findMany({
      where: {
        categoryId: categoryId,
        isAvailable: true,
      },
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

    return products;
  }
}
