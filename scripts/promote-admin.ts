import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'

const email = process.argv[2]

if (!email) {
  console.error('Usage: npx tsx scripts/promote-admin.ts <email>')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const user = await prisma.user.findUnique({ where: { email } })

  if (!user) {
    console.error(`No user found with email: ${email}`)
    console.error('Make sure they have signed up and verified their email first.')
    await prisma.$disconnect()
    process.exit(1)
  }

  await prisma.user.update({ where: { email }, data: { role: 'admin' } })
  console.log(`✓ ${email} is now an admin.`)
  await prisma.$disconnect()
}

main()
