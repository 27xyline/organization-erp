'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet } from 'lucide-react'

export function ExportButton() {
  const [loading, setLoading] = useState(false)

  const handleExport = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/export?type=assets')
      
      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `assets_export_${new Date().toISOString().split('T')[0]}.xlsx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
      } else {
        alert('Ошибка при экспорте данных')
      }
    } catch (error) {
      console.error('Export error:', error)
      alert('Ошибка при экспорте данных')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" disabled={loading} onClick={handleExport}>
      <FileSpreadsheet className="mr-2 h-4 w-4" />
      {loading ? 'Экспорт...' : 'Экспорт в Excel'}
    </Button>
  )
}