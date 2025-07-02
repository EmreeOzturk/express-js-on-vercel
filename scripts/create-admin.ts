import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
    const username = 'admin';
    const password = 'password123'; 

    console.log(`Checking if admin user '${username}' exists...`);
    
    const existingAdmin = await prisma.admin.findUnique({
        where: { username },
    });

    if (existingAdmin) {
        console.log(`Admin user '${username}' already exists.`);
    } else {
        console.log(`Admin user '${username}' not found, creating...`);
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.admin.create({
            data: {
                username,
                password: hashedPassword,
            },
        });
        console.log(`Admin user '${username}' created successfully.`);
        console.log('You can now log in with this username and the password you set.');
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