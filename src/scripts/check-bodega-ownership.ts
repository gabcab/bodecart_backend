import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  try {
    console.log('=== CHECKING BODEGA OWNERSHIP ===\n');

    // Get all BODEGA_OWNER users
    console.log('1. BODEGA_OWNER Users:');
    const users = await prisma.user.findMany({
      where: { roles: { has: 'BODEGA_OWNER' } },
      select: {
        id: true,
        email: true,
        firstName: true,
        bodegaOwner: {
          select: {
            id: true,
            _count: {
              select: { bodegas: true },
            },
          },
        },
      },
    });

    users.forEach((user) => {
      console.log(`  - Email: ${user.email}`);
      console.log(`    User ID: ${user.id}`);
      console.log(`    BodegaOwner ID: ${user.bodegaOwner?.id || 'NULL'}`);
      console.log(`    Bodegas Count: ${user.bodegaOwner?._count.bodegas || 0}`);
      console.log('');
    });

    // Get all BodegaOwners
    console.log('\n2. BodegaOwner Records:');
    const owners = await prisma.bodegaOwner.findMany({
      include: {
        user: {
          select: { email: true, firstName: true },
        },
        _count: {
          select: { bodegas: true },
        },
      },
    });

    owners.forEach((owner) => {
      console.log(`  - BodegaOwner ID: ${owner.id}`);
      console.log(`    User Email: ${owner.user.email}`);
      console.log(`    User ID: ${owner.userId}`);
      console.log(`    Bodegas Count: ${owner._count.bodegas}`);
      console.log('');
    });

    // Get all Bodegas
    console.log('\n3. Bodegas:');
    const bodegas = await prisma.bodega.findMany({
      include: {
        owner: {
          include: {
            user: {
              select: { email: true, firstName: true },
            },
          },
        },
      },
    });

    bodegas.forEach((bodega) => {
      console.log(`  - Bodega: ${bodega.name}`);
      console.log(`    Bodega ID: ${bodega.id}`);
      console.log(`    Owner ID: ${bodega.ownerId}`);
      console.log(`    Owner Email: ${bodega.owner.user.email}`);
      console.log(`    Owner User ID: ${bodega.owner.userId}`);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
