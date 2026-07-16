import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ensureExpiredContractArchiveActions } from '@/lib/employees'

export async function POST() {
  try {
    const createdCount = await ensureExpiredContractArchiveActions(prisma)

    return NextResponse.json({
      success: true,
      createdCount,
    })
  } catch (error) {
    console.error('Error syncing personnel actions:', error)
    return NextResponse.json(
      { error: 'Failed to sync personnel actions' },
      { status: 500 }
    )
  }
}
