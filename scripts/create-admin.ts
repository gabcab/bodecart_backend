import { PrismaClient, UserRole, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createAdmin() {
  try {
    // Check if admin exists
    const existingAdmin = await prisma.user.findFirst({
      where: {
        roles: { has: UserRole.ADMIN },
      },
    });

    if (existingAdmin) {
      console.log('✅ Admin user already exists:');
      console.log('   Email:', existingAdmin.email);
      console.log('   ID:', existingAdmin.id);
      console.log('   Roles:', existingAdmin.roles);
      console.log('   Status:', existingAdmin.status);
      console.log('\n📧 Login credentials:');
      console.log('   Email:', existingAdmin.email);
      console.log('   Password: Admin123! (if not changed)');
      return;
    }

    // Create admin user
    const hashedPassword = await bcrypt.hash('Admin123!', 10);

    const admin = await prisma.user.create({
      data: {
        email: 'admin@bodecart.com',
        password: hashedPassword,
        phone: '+34900000000',
        roles: [UserRole.ADMIN],
        status: UserStatus.ACTIVE,
        firstName: 'Admin',
        lastName: 'BodeCart',
      },
    });

    console.log('✅ Admin user created successfully!');
    console.log('   Email:', admin.email);
    console.log('   ID:', admin.id);
    console.log('   Roles:', admin.roles);
    console.log('   Status:', admin.status);
    console.log('\n📧 Login credentials:');
    console.log('   Email: admin@bodecart.com');
    console.log('   Password: Admin123!');
    console.log('\n⚠️  Please change this password after first login!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
