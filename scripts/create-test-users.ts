import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Creando usuarios de prueba...\n');

  // Contraseña común para todos los usuarios de prueba
  const password = 'Test123!';
  const hashedPassword = await bcrypt.hash(password, 10);

  try {
    // 1. ADMIN
    console.log('👤 Creando usuario ADMIN...');
    const admin = await prisma.user.upsert({
      where: { email: 'admin@bodecart.com' },
      update: {},
      create: {
        email: 'admin@bodecart.com',
        password: hashedPassword,
        roles: [UserRole.ADMIN],
        status: UserStatus.ACTIVE,
        firstName: 'Admin',
        lastName: 'BodeCart',
        phone: '+1-555-0001',
      },
    });
    console.log('✅ Admin creado:', admin.email);

    // 2. CLIENT
    console.log('\n👤 Creando usuario CLIENT...');
    const clientUser = await prisma.user.upsert({
      where: { email: 'cliente@bodecart.com' },
      update: {},
      create: {
        email: 'cliente@bodecart.com',
        password: hashedPassword,
        roles: [UserRole.CLIENT],
        status: UserStatus.ACTIVE,
        firstName: 'Juan',
        lastName: 'Pérez',
        phone: '+1-555-0002',
      },
    });

    // Crear perfil de cliente
    const client = await prisma.client.upsert({
      where: { userId: clientUser.id },
      update: {},
      create: {
        userId: clientUser.id,
      },
    });
    console.log('✅ Cliente creado:', clientUser.email);

    // Crear dirección de ejemplo para el cliente
    await prisma.address.upsert({
      where: {
        id: '00000000-0000-0000-0000-000000000001' // ID fijo para upsert
      },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        clientId: client.id,
        label: 'Casa',
        street: '123 Main Street',
        city: 'New York',
        state: 'NY',
        zipCode: '10001',
        country: 'USA',
        latitude: 40.7128,
        longitude: -74.0060,
        instructions: 'Apartamento 5B',
        isDefault: true,
      },
    });
    console.log('   📍 Dirección de ejemplo creada');

    // 3. BODEGA_OWNER
    console.log('\n👤 Creando usuario BODEGA_OWNER...');
    const ownerUser = await prisma.user.upsert({
      where: { email: 'bodeguero@bodecart.com' },
      update: {},
      create: {
        email: 'bodeguero@bodecart.com',
        password: hashedPassword,
        roles: [UserRole.BODEGA_OWNER],
        status: UserStatus.ACTIVE,
        firstName: 'María',
        lastName: 'García',
        phone: '+1-555-0003',
      },
    });

    // Crear perfil de bodeguero
    const bodegaOwner = await prisma.bodegaOwner.upsert({
      where: { userId: ownerUser.id },
      update: {},
      create: {
        userId: ownerUser.id,
        businessName: 'Bodega García',
        taxId: 'TAX-123456',
        paypalEmail: 'bodeguero@paypal.com',
      },
    });
    console.log('✅ Bodeguero creado:', ownerUser.email);

    // Crear bodega de ejemplo
    await prisma.bodega.upsert({
      where: {
        id: '00000000-0000-0000-0000-000000000002' // ID fijo para upsert
      },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000002',
        ownerId: bodegaOwner.id,
        name: 'Bodega García',
        description: 'Bodega familiar con productos frescos',
        phone: '+1-555-1234',
        email: 'bodega@garcia.com',
        street: '456 Broadway',
        city: 'New York',
        state: 'NY',
        zipCode: '10002',
        country: 'USA',
        latitude: 40.7150,
        longitude: -74.0050,
        openingTime: '08:00',
        closingTime: '22:00',
        isOpen: true,
        isPrimary: true,
        isVerified: true,
        verifiedAt: new Date(),
      },
    });
    console.log('   🏪 Bodega de ejemplo creada');

    // 4. DELIVERY_PERSON
    console.log('\n👤 Creando usuario DELIVERY_PERSON...');
    const deliveryUser = await prisma.user.upsert({
      where: { email: 'repartidor@bodecart.com' },
      update: {},
      create: {
        email: 'repartidor@bodecart.com',
        password: hashedPassword,
        roles: [UserRole.DELIVERY_PERSON],
        status: UserStatus.ACTIVE,
        firstName: 'Carlos',
        lastName: 'Rodríguez',
        phone: '+1-555-0004',
      },
    });

    // Crear perfil de repartidor
    await prisma.deliveryPerson.upsert({
      where: { userId: deliveryUser.id },
      update: {},
      create: {
        userId: deliveryUser.id,
        isVerified: true,
        verifiedAt: new Date(),
        documentId: 'DL-987654',
        vehicleType: 'Bicicleta',
        vehiclePlate: 'BIKE-001',
        vehicleColor: 'Azul',
        paypalEmail: 'repartidor@paypal.com',
        rating: 4.8,
        totalDeliveries: 0,
        completionRate: 100.0,
        isAvailable: true,
        currentLat: 40.7128,
        currentLng: -74.0060,
      },
    });
    console.log('✅ Repartidor creado:', deliveryUser.email);

    console.log('\n✅ ¡Todos los usuarios de prueba han sido creados!\n');
    console.log('📋 Resumen de credenciales:');
    console.log('═'.repeat(60));
    console.log('Contraseña para todos los usuarios: Test123!');
    console.log('═'.repeat(60));
    console.log('1. ADMIN:');
    console.log('   Email: admin@bodecart.com');
    console.log('   Rol: ADMIN');
    console.log('');
    console.log('2. CLIENTE:');
    console.log('   Email: cliente@bodecart.com');
    console.log('   Rol: CLIENT');
    console.log('   Dirección: 123 Main Street, New York, NY 10001');
    console.log('');
    console.log('3. BODEGUERO:');
    console.log('   Email: bodeguero@bodecart.com');
    console.log('   Rol: BODEGA_OWNER');
    console.log('   Bodega: Bodega García (456 Broadway, NY)');
    console.log('');
    console.log('4. REPARTIDOR:');
    console.log('   Email: repartidor@bodecart.com');
    console.log('   Rol: DELIVERY_PERSON');
    console.log('   Vehículo: Bicicleta Azul (BIKE-001)');
    console.log('═'.repeat(60));
    console.log('\n💡 Usa estos usuarios para probar la aplicación\n');
  } catch (error) {
    console.error('❌ Error creando usuarios:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
