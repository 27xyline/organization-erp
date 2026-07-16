import { hash } from '@node-rs/argon2'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'
import { getDb } from '../src/lib/prisma'
import { createUserSchema } from '../src/features/users/contracts/schemas'

async function readHidden(prompt: string): Promise<string> {
  if (!stdin.isTTY || !stdin.setRawMode) {
    throw new Error('Команда должна выполняться в интерактивном терминале')
  }

  stdout.write(prompt)
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')

  return new Promise((resolve, reject) => {
    let value = ''
    const cleanup = () => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onData)
      stdout.write('\n')
    }
    const onData = (chunk: string) => {
      if (chunk === '\u0003') {
        cleanup()
        reject(new Error('Операция отменена'))
        return
      }
      if (chunk === '\r' || chunk === '\n') {
        cleanup()
        resolve(value)
        return
      }
      if (chunk === '\u007f') {
        value = value.slice(0, -1)
        return
      }
      value += chunk
    }
    stdin.on('data', onData)
  })
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL не задан')
  }

  const readline = createInterface({ input: stdin, output: stdout })
  const username = await readline.question('Логин администратора: ')
  const name = await readline.question('Имя администратора: ')
  readline.close()
  const temporaryPassword = await readHidden('Временный пароль (минимум 12 символов): ')

  const input = createUserSchema.parse({
    username,
    name,
    role: 'ADMIN',
    temporaryPassword,
  })
  const passwordHash = await hash(input.temporaryPassword)
  const db = getDb()

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        username: input.username,
        name: input.name,
        role: 'ADMIN',
        passwordHash,
        mustChangePassword: true,
      },
    })
    await tx.auditLog.create({
      data: {
        userId: created.id,
        action: 'INITIAL_ADMIN_CREATE',
        entityType: 'User',
        entityId: created.id,
        details: { bootstrap: true },
      },
    })
    return created
  })

  stdout.write(`Администратор ${user.username} создан. Пароль потребуется изменить после входа.\n`)
  await db.$disconnect()
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`Ошибка: ${message}\n`)
  process.exitCode = 1
})
