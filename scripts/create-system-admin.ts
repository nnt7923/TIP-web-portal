import { AccountStatus, GlobalRole, PrismaClient } from '@prisma/client';
import { randomBytes, randomUUID, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const prisma = new PrismaClient();
const scryptAsync = promisify(scrypt);

function readArgument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function main(): Promise<void> {
  const username = readArgument('username')?.trim();
  const email = readArgument('email')?.trim().toLowerCase();
  const password = readArgument('password');
  const fullName = readArgument('full-name')?.trim();
  const phone = readArgument('phone')?.trim();

  if (!username || !email || !password || !fullName) {
    throw new Error(
      'Required: --username=... --email=... --password=... --full-name=...',
    );
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new Error('Email is invalid');
  }

  if (password.length < 12) {
    throw new Error(
      'System admin password must contain at least 12 characters',
    );
  }

  const duplicate = await prisma.account.findFirst({
    where: { OR: [{ username }, { email }] },
    select: { id: true },
  });

  if (duplicate) {
    throw new Error('Username or email already exists');
  }

  const accountId = randomUUID();
  const account = await prisma.$transaction(async (transaction) => {
    const created = await transaction.account.create({
      data: {
        id: accountId,
        username,
        email,
        passwordHash: await hashPassword(password),
        fullName,
        phone,
        globalRole: GlobalRole.SYSTEM_ADMIN,
        status: AccountStatus.ACTIVE,
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        globalRole: true,
        status: true,
      },
    });

    await transaction.auditLog.create({
      data: {
        actorId: accountId,
        action: 'SYSTEM_ADMIN_BOOTSTRAPPED',
        entityType: 'Account',
        entityId: accountId,
      },
    });

    return created;
  });

  console.info('System admin created:', account);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
