import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function updateAdminPassword() {
  try {
    const hashedPassword = await bcrypt.hash('Admin123!', 10);

    const admin = await prisma.user.update({
      where: { email: 'admin@bodecart.com' },
      data: { password: hashedPassword },
    });

    console.log('✅ Admin password updated successfully!');
    console.log('   Email:', admin.email);
    console.log('   Password: Admin123!');
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateAdminPassword();
