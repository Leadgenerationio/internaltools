import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD || 'changeme123';
  const companyName = process.env.SEED_COMPANY_NAME || 'My Company';

  // Check if company already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`User ${email} already exists, skipping seed.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const company = await prisma.company.create({
    data: {
      name: companyName,
      slug: companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    },
  });

  const user = await prisma.user.create({
    data: {
      email,
      name: 'Admin',
      passwordHash,
      role: 'OWNER',
      companyId: company.id,
    },
  });

  console.log(`Created company "${company.name}" (${company.id})`);
  console.log(`Created admin user "${user.email}" (${user.id})`);
  console.log(`Login with: ${email} / ${password}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
