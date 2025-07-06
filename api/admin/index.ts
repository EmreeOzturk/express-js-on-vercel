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

// Domain validation utility
const isValidDomain = (domain: string): boolean => {
    try {
        const url = new URL(domain);
        // Allow http/https protocols and localhost for development
        if (!['http:', 'https:'].includes(url.protocol)) {
            return false;
        }
        // Basic domain format validation
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        return domainRegex.test(url.hostname) || url.hostname === 'localhost';
    } catch {
        return false;
    }
};

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

// Un-blacklist a user
router.post('/users/unblacklist', authenticateToken, async (req: any, res: any) => {
    const { userId } = req.body;

    if (!userId) {
        return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: { isBlacklisted: false },
        });

        res.json({ success: true, message: 'User successfully removed from blacklist' });
    } catch (error: any) {
        if (error.code === 'P2025') {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        console.error('Error un-blacklisting user:', error);
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

router.get('/cors-clients', authenticateToken, async (req: any, res: any) => {
    try {
        const clients = await prisma.corsClient.findMany({
            orderBy: {
                createdAt: 'desc',
            },
        });
        res.json({ success: true, clients });
    } catch (error) {
        console.error('Error fetching CORS clients:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch CORS clients' });
    }
});

router.post('/cors-clients', authenticateToken, async (req: any, res: any) => {
    const { domain, scAddress } = req.body;

    if (!domain) {
        return res.status(400).json({ success: false, message: 'Domain is required' });
    }

    // Validate domain format
    if (!isValidDomain(domain)) {
        return res.status(400).json({ success: false, message: 'Invalid domain format' });
    }

    try {
        const client = await prisma.corsClient.create({
            data: {
                domain: domain.toLowerCase(), // Store in lowercase for consistency
                scAddress
            },
        });

        res.json({
            success: true,
            message: 'CORS client added successfully',
            client
        });
    } catch (error: any) {
        // P2002 is Prisma's error code for unique constraint violation
        if (error.code === 'P2002') {
            return res.status(409).json({ success: false, message: 'Domain already exists' });
        }
        console.error('Error adding CORS client:', error);
        res.status(500).json({ success: false, message: 'Failed to add CORS client' });
    }
});

router.delete('/cors-clients/:id', authenticateToken, async (req: any, res: any) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ success: false, message: 'Client ID is required' });
    }

    try {
        await prisma.corsClient.delete({
            where: { id },
        });

        res.json({ success: true, message: 'CORS client deleted successfully' });
    } catch (error: any) {
        // P2025 is Prisma's error code for "record not found" on delete
        if (error.code === 'P2025') {
            return res.status(404).json({ success: false, message: 'CORS client not found' });
        }
        console.error('Error deleting CORS client:', error);
        res.status(500).json({ success: false, message: 'Failed to delete CORS client' });
    }
});

router.patch('/cors-clients/:id/toggle', authenticateToken, async (req: any, res: any) => {
    const { id } = req.params;

    if (!id) {
        return res.status(400).json({ success: false, message: 'Client ID is required' });
    }

    try {
        // First get the current status
        const currentClient = await prisma.corsClient.findUnique({
            where: { id },
        });

        if (!currentClient) {
            return res.status(404).json({ success: false, message: 'CORS client not found' });
        }

        // Toggle the status
        const updatedClient = await prisma.corsClient.update({
            where: { id },
            data: { isActive: !currentClient.isActive },
        });

        res.json({
            success: true,
            message: `CORS client ${updatedClient.isActive ? 'activated' : 'deactivated'} successfully`,
            client: updatedClient
        });
    } catch (error: any) {
        if (error.code === 'P2025') {
            return res.status(404).json({ success: false, message: 'CORS client not found' });
        }
        console.error('Error toggling CORS client status:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle CORS client status' });
    }
});

export default router; 