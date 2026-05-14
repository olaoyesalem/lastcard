import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrisma() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('supabase') ? { rejectUnauthorized: false } : false,
  })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrisma()

globalForPrisma.prisma = prisma
