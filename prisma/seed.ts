import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // ============================================
  // CATEGORIES
  // ============================================
  console.log('📦 Creating categories...');

  const categoryData = [
    { slug: 'alcohol', name: 'Alcohol', imageUrl: 'https://cdn-icons-png.flaticon.com/512/920/920582.png', en: 'Alcohol' },
    { slug: 'bebidas', name: 'Bebidas', imageUrl: 'https://cdn-icons-png.flaticon.com/512/3050/3050131.png', en: 'Beverages' },
    { slug: 'arroz', name: 'Arroz y Granos', imageUrl: 'https://cdn-icons-png.flaticon.com/512/3480/3480618.png', en: 'Rice & Grains' },
    { slug: 'pastas', name: 'Pastas', imageUrl: 'https://cdn-icons-png.flaticon.com/512/3480/3480538.png', en: 'Pasta' },
    { slug: 'detergentes', name: 'Detergentes y Limpieza', imageUrl: 'https://cdn-icons-png.flaticon.com/512/2989/2989849.png', en: 'Detergents & Cleaning' },
    { slug: 'lacteos', name: 'Lácteos', imageUrl: 'https://cdn-icons-png.flaticon.com/512/3050/3050158.png', en: 'Dairy' },
    { slug: 'carnes', name: 'Carnes y Embutidos', imageUrl: 'https://cdn-icons-png.flaticon.com/512/3143/3143643.png', en: 'Meats & Cold Cuts' },
    { slug: 'frutas', name: 'Frutas y Verduras', imageUrl: 'https://cdn-icons-png.flaticon.com/512/1625/1625048.png', en: 'Fruits & Vegetables' },
    { slug: 'panaderia', name: 'Panadería', imageUrl: 'https://cdn-icons-png.flaticon.com/512/3014/3014986.png', en: 'Bakery' },
    { slug: 'snacks', name: 'Snacks y Golosinas', imageUrl: 'https://cdn-icons-png.flaticon.com/512/2553/2553691.png', en: 'Snacks & Candy' },
    { slug: 'higiene', name: 'Higiene Personal', imageUrl: 'https://cdn-icons-png.flaticon.com/512/2553/2553635.png', en: 'Personal Hygiene' },
    { slug: 'enlatados', name: 'Enlatados', imageUrl: 'https://cdn-icons-png.flaticon.com/512/3480/3480709.png', en: 'Canned Goods' },
  ];

  const categories: { id: string; slug: string }[] = [];
  for (const cat of categoryData) {
    const category = await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: {
        name: cat.name,
        description: `Categoría de ${cat.name.toLowerCase()}`,
        imageUrl: cat.imageUrl,
      },
    });
    categories.push({ id: category.id, slug: cat.slug });

    // Seed English translation
    await prisma.categoryTranslation.upsert({
      where: {
        categoryId_locale: {
          categoryId: category.id,
          locale: 'en',
        },
      },
      update: { name: cat.en },
      create: {
        categoryId: category.id,
        locale: 'en',
        name: cat.en,
      },
    });
  }

  console.log(`✅ Created ${categories.length} categories with translations`);


  // ============================================
  // BODEGA OWNERS (Users)
  // ============================================
  console.log('👥 Creating bodega owners...');

  const hashedPassword = await bcrypt.hash('password123', 10);

  // Create bodega owner users
  const ownerUsers = await Promise.all([
    prisma.user.upsert({
      where: { email: 'carlos.bodega@example.com' },
      update: {},
      create: {
        email: 'carlos.bodega@example.com',
        password: hashedPassword,
        roles: [UserRole.BODEGA_OWNER],
        status: UserStatus.ACTIVE,
        firstName: 'Carlos',
        lastName: 'Rodriguez',
        phone: '+1-809-555-0101',
      },
    }),
    prisma.user.upsert({
      where: { email: 'maria.bodega@example.com' },
      update: {},
      create: {
        email: 'maria.bodega@example.com',
        password: hashedPassword,
        roles: [UserRole.BODEGA_OWNER],
        status: UserStatus.ACTIVE,
        firstName: 'María',
        lastName: 'Santos',
        phone: '+1-809-555-0102',
      },
    }),
    prisma.user.upsert({
      where: { email: 'jose.bodega@example.com' },
      update: {},
      create: {
        email: 'jose.bodega@example.com',
        password: hashedPassword,
        roles: [UserRole.BODEGA_OWNER],
        status: UserStatus.ACTIVE,
        firstName: 'José',
        lastName: 'Martínez',
        phone: '+1-809-555-0103',
      },
    }),
    prisma.user.upsert({
      where: { email: 'ana.bodega@example.com' },
      update: {},
      create: {
        email: 'ana.bodega@example.com',
        password: hashedPassword,
        roles: [UserRole.BODEGA_OWNER],
        status: UserStatus.ACTIVE,
        firstName: 'Ana',
        lastName: 'Pérez',
        phone: '+1-809-555-0104',
      },
    }),
    prisma.user.upsert({
      where: { email: 'roberto.bodega@example.com' },
      update: {},
      create: {
        email: 'roberto.bodega@example.com',
        password: hashedPassword,
        roles: [UserRole.BODEGA_OWNER],
        status: UserStatus.ACTIVE,
        firstName: 'Roberto',
        lastName: 'García',
        phone: '+1-809-555-0105',
      },
    }),
  ]);

  console.log(`✅ Created ${ownerUsers.length} bodega owner users`);

  // ============================================
  // ADMIN USER
  // ============================================
  console.log('🔑 Creating admin user...');

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@bodecart.com' },
    update: {},
    create: {
      email: 'admin@bodecart.com',
      password: hashedPassword,
      roles: [UserRole.ADMIN],
      status: UserStatus.ACTIVE,
      firstName: 'Admin',
      lastName: 'BodeCart',
      phone: '+1-809-555-0001',
    },
  });

  console.log(`✅ Created admin user: ${adminUser.email}`);

  // ============================================
  // CLIENT USER
  // ============================================
  console.log('👤 Creating client user...');

  const clientUser = await prisma.user.upsert({
    where: { email: 'cliente@example.com' },
    update: {},
    create: {
      email: 'cliente@example.com',
      password: hashedPassword,
      roles: [UserRole.CLIENT],
      status: UserStatus.ACTIVE,
      firstName: 'Juan',
      lastName: 'Pérez',
      phone: '+1-809-555-0010',
    },
  });

  // Create Client profile
  const clientProfile = await prisma.client.upsert({
    where: { userId: clientUser.id },
    update: {},
    create: {
      userId: clientUser.id,
    },
  });

  // Create a default address for the client
  const existingAddress = await prisma.address.findFirst({
    where: { clientId: clientProfile.id, isDefault: true },
  });

  if (!existingAddress) {
    await prisma.address.create({
      data: {
        clientId: clientProfile.id,
        label: 'HOME',
        street: 'Av. Abraham Lincoln #456',
        apartment: 'Apt 3B',
        city: 'Santo Domingo',
        state: 'Distrito Nacional',
        zipCode: '10104',
        country: 'Dominican Republic',
        latitude: 18.4655,
        longitude: -69.9295,
        instructions: 'Edificio azul, tercer piso',
        isDefault: true,
      },
    });
  }

  console.log(`✅ Created client user: ${clientUser.email} with address`);

  // ============================================
  // DELIVERY PERSON USER
  // ============================================
  console.log('🚗 Creating delivery person user...');

  const deliveryUser = await prisma.user.upsert({
    where: { email: 'repartidor@example.com' },
    update: {},
    create: {
      email: 'repartidor@example.com',
      password: hashedPassword,
      roles: [UserRole.DELIVERY_PERSON],
      status: UserStatus.ACTIVE,
      firstName: 'Pedro',
      lastName: 'Gómez',
      phone: '+1-809-555-0020',
    },
  });

  // Create DeliveryPerson profile
  await prisma.deliveryPerson.upsert({
    where: { userId: deliveryUser.id },
    update: {},
    create: {
      userId: deliveryUser.id,
      vehicleType: 'Motocicleta',
      vehiclePlate: 'A123456',
      vehicleColor: 'Rojo',
      isAvailable: true,
      currentLat: 18.4750,
      currentLng: -69.9200,
      rating: 4.5,
      totalDeliveries: 0,
      completionRate: 0.0,
    },
  });

  console.log(`✅ Created delivery person: ${deliveryUser.email}`);

  // Create BodegaOwner profiles
  const bodegaOwners = await Promise.all(
    ownerUsers.map(async (user, index) => {
      return prisma.bodegaOwner.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          businessName: `Bodega ${user.firstName}`,
          taxId: `RNC-${100000000 + index}`,
        },
      });
    })
  );

  console.log(`✅ Created ${bodegaOwners.length} bodega owner profiles`);

  // ============================================
  // BODEGAS in Santo Domingo
  // ============================================
  console.log('🏪 Creating bodegas in Santo Domingo...');

  // Santo Domingo, Dominican Republic real locations
  const bodegasData = [
    {
      name: 'Colmado El Rincón Criollo',
      description: 'Tu colmado de confianza con los mejores precios del barrio. Abierto todos los días.',
      street: 'Calle Duarte #45',
      city: 'Santo Domingo',
      state: 'Distrito Nacional',
      zipCode: '10101',
      latitude: 18.4861,
      longitude: -69.9312,
      ownerId: bodegaOwners[0].id,
    },
    {
      name: 'Supermercado Don Fello',
      description: 'Gran variedad de productos frescos y de primera calidad. Servicio a domicilio disponible.',
      street: 'Av. 27 de Febrero #123',
      city: 'Santo Domingo',
      state: 'Distrito Nacional',
      zipCode: '10102',
      latitude: 18.4595,
      longitude: -69.9387,
      ownerId: bodegaOwners[1].id,
    },
    {
      name: 'Colmado La Esquina',
      description: 'El colmado más surtido de la zona. Frutas frescas todos los días.',
      street: 'Calle El Conde #78',
      city: 'Santo Domingo',
      state: 'Distrito Nacional',
      zipCode: '10103',
      latitude: 18.4722,
      longitude: -69.8856,
      ownerId: bodegaOwners[2].id,
    },
    {
      name: 'Mini Market Los Pinos',
      description: 'Todo lo que necesitas en un solo lugar. Precios especiales para mayoristas.',
      street: 'Av. Winston Churchill #456',
      city: 'Santo Domingo',
      state: 'Distrito Nacional',
      zipCode: '10104',
      latitude: 18.4687,
      longitude: -69.9456,
      ownerId: bodegaOwners[3].id,
    },
    {
      name: 'Bodega El Progreso',
      description: 'Más de 20 años sirviendo a la comunidad. Carnicería y productos frescos.',
      street: 'Calle José Contreras #89',
      city: 'Santo Domingo',
      state: 'Distrito Nacional',
      zipCode: '10105',
      latitude: 18.4823,
      longitude: -69.9178,
      ownerId: bodegaOwners[4].id,
    },
    {
      name: 'Colmado Hermanos Díaz',
      description: 'Atención personalizada y los mejores productos del mercado.',
      street: 'Av. Máximo Gómez #234',
      city: 'Santo Domingo',
      state: 'Distrito Nacional',
      zipCode: '10106',
      latitude: 18.4789,
      longitude: -69.9234,
      ownerId: bodegaOwners[0].id,
    },
    {
      name: 'Super Colmado Tropical',
      description: 'Especialistas en bebidas frías y snacks. El mejor ambiente del barrio.',
      street: 'Calle Las Mercedes #56',
      city: 'Santo Domingo',
      state: 'Distrito Nacional',
      zipCode: '10107',
      latitude: 18.4912,
      longitude: -69.9045,
      ownerId: bodegaOwners[1].id,
    },
    {
      name: 'La Bodeguita del Centro',
      description: 'En el corazón de la zona colonial. Productos dominicanos y artesanales.',
      street: 'Calle Arzobispo Meriño #12',
      city: 'Santo Domingo',
      state: 'Distrito Nacional',
      zipCode: '10108',
      latitude: 18.4734,
      longitude: -69.8823,
      ownerId: bodegaOwners[2].id,
    },
    {
      name: 'Colmado Villa Mella Express',
      description: 'Servicio rápido y eficiente. Abiertos hasta tarde.',
      street: 'Av. Hermanas Mirabal #567',
      city: 'Santo Domingo Norte',
      state: 'Santo Domingo',
      zipCode: '10201',
      latitude: 18.5234,
      longitude: -69.8987,
      ownerId: bodegaOwners[3].id,
    },
    {
      name: 'Supermercado Los Alcarrizos',
      description: 'El más grande de la zona. Parqueo disponible. Ofertas semanales.',
      street: 'Calle Principal #100',
      city: 'Los Alcarrizos',
      state: 'Santo Domingo Oeste',
      zipCode: '10301',
      latitude: 18.5156,
      longitude: -70.0123,
      ownerId: bodegaOwners[4].id,
    },
  ];

  const bodegas = await Promise.all(
    bodegasData.map(async (bodegaData) => {
      // Check if bodega with same name and owner exists
      const existing = await prisma.bodega.findFirst({
        where: {
          name: bodegaData.name,
          ownerId: bodegaData.ownerId,
        },
      });

      if (existing) {
        return existing;
      }

      return prisma.bodega.create({
        data: {
          ...bodegaData,
          country: 'Dominican Republic',
          phone: `+1-809-555-${Math.floor(1000 + Math.random() * 9000)}`,
          openingTime: '07:00',
          closingTime: '22:00',
          isOpen: true,
          rating: Number((3.5 + Math.random() * 1.5).toFixed(1)),
          avgPrepTimeMinutes: 10 + Math.floor(Math.random() * 15),
        },
      });
    })
  );

  console.log(`✅ Created ${bodegas.length} bodegas in Santo Domingo`);

  // ============================================
  // DIFFERENT PRODUCTS for each bodega
  // ============================================
  console.log('🛒 Creating unique products for each bodega...');

  // Large pool of products by category
  const productPool: Record<string, { name: string; basePrice: number }[]> = {
    arroz: [
      { name: 'Arroz La Garza 5lb', basePrice: 7.99 },
      { name: 'Arroz Selecto 3lb', basePrice: 4.99 },
      { name: 'Arroz Integral 2lb', basePrice: 5.49 },
      { name: 'Habichuelas Rojas 1lb', basePrice: 2.49 },
      { name: 'Habichuelas Negras 1lb', basePrice: 2.69 },
      { name: 'Guandules Verdes 1lb', basePrice: 2.29 },
      { name: 'Lentejas 1lb', basePrice: 1.99 },
      { name: 'Garbanzos 1lb', basePrice: 2.89 },
    ],
    pastas: [
      { name: 'Pasta Barilla Spaghetti', basePrice: 2.99 },
      { name: 'Pasta Allegra Coditos', basePrice: 1.89 },
      { name: 'Pasta Rummo Penne', basePrice: 3.49 },
      { name: 'Fideos Chinos', basePrice: 2.49 },
      { name: 'Lasaña Barilla', basePrice: 4.99 },
      { name: 'Pasta Angel Hair', basePrice: 2.79 },
    ],
    alcohol: [
      { name: 'Cerveza Presidente', basePrice: 2.50 },
      { name: 'Cerveza Bohemia', basePrice: 2.75 },
      { name: 'Ron Barceló Añejo', basePrice: 18.99 },
      { name: 'Ron Brugal Extra Viejo', basePrice: 22.99 },
      { name: 'Whisky Johnnie Walker Red', basePrice: 25.99 },
      { name: 'Vodka Smirnoff', basePrice: 14.99 },
      { name: 'Vino Tinto Concha y Toro', basePrice: 9.99 },
      { name: 'Cerveza Corona', basePrice: 2.99 },
    ],
    bebidas: [
      { name: 'Coca Cola 2L', basePrice: 2.99 },
      { name: 'Pepsi 2L', basePrice: 2.89 },
      { name: 'Agua Crystal 1gal', basePrice: 1.50 },
      { name: 'Jugo de Naranja Tropicana', basePrice: 4.99 },
      { name: 'Refresco de Limón', basePrice: 1.99 },
      { name: 'Malta Morena', basePrice: 1.49 },
      { name: 'Red Bull', basePrice: 3.99 },
      { name: 'Gatorade', basePrice: 2.49 },
      { name: 'Café Santo Domingo 1lb', basePrice: 6.99 },
    ],
    detergentes: [
      { name: 'Detergente Fab 2kg', basePrice: 8.99 },
      { name: 'Detergente Ace 1kg', basePrice: 4.99 },
      { name: 'Cloro Bravo 1gal', basePrice: 3.49 },
      { name: 'Suavizante Downy', basePrice: 5.99 },
      { name: 'Jabón de Cuaba', basePrice: 1.99 },
      { name: 'Desinfectante Lysol', basePrice: 6.49 },
      { name: 'Esponja Scotch-Brite', basePrice: 2.29 },
    ],
    lacteos: [
      { name: 'Leche Milex 1L', basePrice: 3.99 },
      { name: 'Leche Rica Entera', basePrice: 3.49 },
      { name: 'Queso de Hoja', basePrice: 5.99 },
      { name: 'Queso Cheddar', basePrice: 4.99 },
      { name: 'Mantequilla Rica', basePrice: 3.99 },
      { name: 'Yogurt Yoplait', basePrice: 1.99 },
      { name: 'Crema Agria', basePrice: 2.99 },
    ],
    carnes: [
      { name: 'Salami Induveca', basePrice: 4.49 },
      { name: 'Jamón Ahumado', basePrice: 5.99 },
      { name: 'Salchicha Oscar Mayer', basePrice: 4.29 },
      { name: 'Tocino', basePrice: 6.99 },
      { name: 'Chorizo Español', basePrice: 7.49 },
      { name: 'Pechuga de Pollo lb', basePrice: 3.99 },
      { name: 'Carne Molida lb', basePrice: 4.49 },
    ],
    frutas: [
      { name: 'Plátanos Verdes (5)', basePrice: 2.99 },
      { name: 'Guineos Maduros (5)', basePrice: 1.99 },
      { name: 'Aguacate', basePrice: 1.49 },
      { name: 'Limones (6)', basePrice: 1.99 },
      { name: 'Tomates lb', basePrice: 2.49 },
      { name: 'Cebolla lb', basePrice: 1.99 },
      { name: 'Ajo Cabeza', basePrice: 0.99 },
      { name: 'Yuca lb', basePrice: 1.49 },
    ],
    panaderia: [
      { name: 'Pan Sobao', basePrice: 1.99 },
      { name: 'Pan de Agua', basePrice: 1.49 },
      { name: 'Bizcocho Dominicano', basePrice: 8.99 },
      { name: 'Donas (6)', basePrice: 4.99 },
      { name: 'Croissants (4)', basePrice: 5.49 },
      { name: 'Pan Integral', basePrice: 3.49 },
    ],
    snacks: [
      { name: 'Galletas Hatuey', basePrice: 1.49 },
      { name: 'Doritos Nacho', basePrice: 3.49 },
      { name: 'Cheetos', basePrice: 2.99 },
      { name: 'Maní Salado', basePrice: 1.99 },
      { name: 'Chocolate M&M', basePrice: 2.49 },
      { name: 'Chicles Trident', basePrice: 1.29 },
      { name: 'Caramelos Surtidos', basePrice: 0.99 },
    ],
    higiene: [
      { name: 'Jabón Palmolive', basePrice: 1.99 },
      { name: 'Shampoo Head & Shoulders', basePrice: 7.99 },
      { name: 'Pasta Dental Colgate', basePrice: 3.49 },
      { name: 'Desodorante Dove', basePrice: 4.99 },
      { name: 'Papel Higiénico (4)', basePrice: 4.49 },
      { name: 'Toallas Sanitarias', basePrice: 5.99 },
    ],
    enlatados: [
      { name: 'Atún Van Camps', basePrice: 2.49 },
      { name: 'Sardinas en Salsa', basePrice: 1.99 },
      { name: 'Maíz Dulce', basePrice: 1.79 },
      { name: 'Salsa de Tomate', basePrice: 2.29 },
      { name: 'Leche Evaporada', basePrice: 1.99 },
      { name: 'Frijoles Refritos', basePrice: 2.49 },
    ],
  };

  const categoryMap = categories.reduce((acc, cat) => {
    acc[cat.slug] = cat.id;
    return acc;
  }, {} as Record<string, string>);

  // Shuffle array helper
  function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  let productCount = 0;
  const categoryKeys = Object.keys(productPool);

  for (let bodegaIndex = 0; bodegaIndex < bodegas.length; bodegaIndex++) {
    const bodega = bodegas[bodegaIndex];

    // Each bodega gets a random subset of categories (6-10 categories)
    const numCategories = 6 + Math.floor(Math.random() * 5);
    const selectedCategories = shuffleArray(categoryKeys).slice(0, numCategories);

    for (const categoryValue of selectedCategories) {
      const productsInCategory = productPool[categoryValue];
      // Each bodega gets 2-4 random products per category
      const numProducts = 2 + Math.floor(Math.random() * 3);
      const selectedProducts = shuffleArray(productsInCategory).slice(0, numProducts);

      for (const productData of selectedProducts) {
        const existing = await prisma.product.findFirst({
          where: {
            bodegaId: bodega.id,
            name: productData.name,
          },
        });

        if (!existing && categoryMap[categoryValue]) {
          // Vary price slightly per bodega (+/- 15%)
          const priceVariation = 0.85 + Math.random() * 0.30;
          const finalPrice = Number((productData.basePrice * priceVariation).toFixed(2));

          await prisma.product.create({
            data: {
              bodegaId: bodega.id,
              name: productData.name,
              description: `${productData.name} disponible en ${bodega.name}`,
              price: finalPrice,
              categoryId: categoryMap[categoryValue],
              stock: 10 + Math.floor(Math.random() * 150),
              isAvailable: Math.random() > 0.1, // 90% available
            },
          });
          productCount++;
        }
      }
    }
  }

  console.log(`✅ Created ${productCount} unique products across all bodegas`);

  console.log('');
  console.log('🎉 Database seeding completed successfully!');
  console.log('');
  console.log('📋 Summary:');
  console.log(`   - ${categories.length} categories`);
  console.log(`   - 1 admin user`);
  console.log(`   - 1 client user (with address)`);
  console.log(`   - 1 delivery person`);
  console.log(`   - ${ownerUsers.length} bodega owners`);
  console.log(`   - ${bodegas.length} bodegas in Santo Domingo`);
  console.log(`   - ${productCount} products`);
  console.log('');
  console.log('🔑 Login credentials (password: password123 for all):');
  console.log('   Admin:      admin@bodecart.com');
  console.log('   Cliente:    cliente@example.com');
  console.log('   Bodeguero:  carlos.bodega@example.com');
  console.log('   Repartidor: repartidor@example.com');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
