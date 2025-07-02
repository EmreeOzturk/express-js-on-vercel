import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { authenticateToken } from './middleware';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-default-secret';
if (JWT_SECRET === 'your-default-secret') {
    console.warn('Warning: JWT_SECRET is not set in environment variables. Using a default, insecure secret.');
}

// Admin Login
router.post('/login', async (req: any, res: any) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    try {
        const admin = await prisma.admin.findUnique({
            where: { username },
        });

        if (!admin) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const isPasswordValid = await bcrypt.compare(password, admin.password);

        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, {
            expiresIn: '1h',
        });

        res.json({ success: true, token });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Get all users
router.get('/users', authenticateToken, async (req: any, res: any) => {
    try {
        const users = await prisma.user.findMany({
            orderBy: {
                createdAt: 'desc',
            },
        });
        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Blacklist a user
router.post('/users/blacklist', authenticateToken, async (req: any, res: any) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { isBlacklisted: true },
        });

        res.json({ success: true, message: 'User successfully blacklisted' });
    } catch (error: any) {
        // P2025 is Prisma's error code for "record not found" on an update
        if (error.code === 'P2025') {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        console.error('Error blacklisting user:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

// Get all orders
router.get('/orders', authenticateToken, async (req: any, res: any) => {
    try {
        const orders = await prisma.order.findMany({
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                user: true, // Populate the user field
            },
        });
        res.json({ success: true, orders });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred' });
    }
});

export default router; 