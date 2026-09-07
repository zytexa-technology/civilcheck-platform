// apps/api/scripts/create-super-admin.ts
//
// One-time interactive script to create a single production Super Admin.
// Not part of the seed, the app, or any API route — run manually, once.
//
// Usage (run this yourself in your own terminal, NOT via an automated tool,
// so the password prompt is a real interactive TTY):
//   SUPER_ADMIN_EMAIL=... SUPER_ADMIN_NAME=... SUPER_ADMIN_PHONE=... \
//     pnpm --filter @civilcheck/api exec tsx scripts/create-super-admin.ts
// (or set them in apps/api/.env — see .env.sample)
import 'dotenv/config'
import readline from 'readline'
import bcrypt from 'bcryptjs'
import prisma from '../src/lib/prisma.js'

const requiredEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return value
}

const ADMIN = {
  email: requiredEnv('SUPER_ADMIN_EMAIL'),
  name: requiredEnv('SUPER_ADMIN_NAME'),
  phone: requiredEnv('SUPER_ADMIN_PHONE'),
  role: 'SUPER_ADMIN' as const,
}

// Masks input with '*' so the password never echoes to the terminal.
function promptHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    // @ts-expect-error — readline's internal write hook; no public API for masking
    rl._writeToOutput = (chunk: string) => {
      // @ts-expect-error
      rl.output.write(chunk.includes(query) ? chunk : '*')
    }
    rl.question(query, (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

async function main() {
  const existing = await prisma.admin.findUnique({ where: { email: ADMIN.email } })
  if (existing) {
    console.log(`Admin ${ADMIN.email} already exists (id: ${existing.id}) — no changes made.`)
    return
  }

  const password = await promptHidden('Enter new Super Admin password: ')
  const confirm = await promptHidden('Confirm password: ')

  if (password !== confirm) {
    console.error('Passwords do not match — aborted. No database change made.')
    process.exitCode = 1
    return
  }
  if (password.length < 8) {
    console.error('Password too short (min 8 characters) — aborted. No database change made.')
    process.exitCode = 1
    return
  }

  const hash = await bcrypt.hash(password, 10)

  const admin = await prisma.admin.create({
    data: { ...ADMIN, password: hash },
  })

  console.log('\nAdmin created successfully:')
  console.log('  id:   ', admin.id)
  console.log('  email:', admin.email)
  console.log('  name: ', admin.name)
  console.log('  phone:', admin.phone)
  console.log('  role: ', admin.role)
  console.log('  passwordIsBcryptHash:', /^\$2[aby]\$\d{2}\$/.test(admin.password))
}

main()
  .catch((err) => {
    console.error('Admin creation failed:', err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
