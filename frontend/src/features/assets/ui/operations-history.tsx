'use client'

import { formatDate, formatCurrency, formatDecimal } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { 
  ArrowRightLeft, 
  Plus, 
  Minus, 
  RefreshCw, 
  Edit3,
  Tag,
  User,
  DollarSign,
  Hash,
  FileText,
  Calendar,
  Package
} from "lucide-react"

interface OperationsHistoryProps {
  operations: any[]
}

function statusLabel(code?: string): string {
  const map: Record<string, string> = {
    IN_STOCK: 'В наличии',
    IN_USE: 'В эксплуатации',
    UNDER_REPAIR: 'На ремонте',
    PLANNED_FOR_DISPOSAL: 'К списанию',
    PARTIALLY_DISPOSED: 'Частично списан',
    FULLY_DISPOSED: 'Полностью списан'
  }
  return map[code || ''] ?? (code ?? '')
}


const operationTypeLabels: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  RECEIPT: { 
    label: "Приход", 
    icon: <Plus className="h-4 w-4" />,
    color: "bg-green-100 text-green-800" 
  },
  TRANSFER: { 
    label: "Передача", 
    icon: <ArrowRightLeft className="h-4 w-4" />,
    color: "bg-blue-100 text-blue-800" 
  },
  DISPOSAL: { 
    label: "Списание", 
    icon: <Minus className="h-4 w-4" />,
    color: "bg-red-100 text-red-800" 
  },
  STATUS_CHANGE: { 
    label: "Изменение", 
    icon: <RefreshCw className="h-4 w-4" />,
    color: "bg-gray-100 text-gray-800" 
  },
}

const changeIcons: Record<string, React.ReactNode> = {
  'Наименование': <Tag className="h-3 w-3" />,
  'Инв. номер': <Hash className="h-3 w-3" />,
  'Цена': <DollarSign className="h-3 w-3" />,
  'Количество': <Package className="h-3 w-3" />,
  'Статус': <RefreshCw className="h-3 w-3" />,
  'МОЛ': <User className="h-3 w-3" />,
  'Группа': <Tag className="h-3 w-3" />,
  'Примечания': <FileText className="h-3 w-3" />,
  'Плановая дата списания': <Calendar className="h-3 w-3" />,
}

function parseChanges(reason: string): { field: string; oldValue: string; newValue: string }[] {
  if (!reason.includes('Редактирование объекта:')) return []
  
  const changesText = reason.replace('Редактирование объекта:\n', '')
  const lines = changesText.split('\n')
  
  return lines.map(line => {
    // Формат: "Поле: "старое" → "новое""
    const match = line.match(/^([^:]+):\s*"([^"]*)"\s*→\s*"([^"]*)"$/)
    if (match) {
      return {
        field: match[1],
        oldValue: match[2],
        newValue: match[3]
      }
    }
    // Формат: "Поле: старое → новое" (без кавычек)
    const match2 = line.match(/^([^:]+):\s*(.+?)\s*→\s*(.+)$/)
    if (match2) {
      return {
        field: match2[1],
        oldValue: match2[2],
        newValue: match2[3]
      }
    }
    return { field: line, oldValue: '', newValue: '' }
  }).filter(item => item.field)
}

export function OperationsHistory({ operations }: OperationsHistoryProps) {
  if (operations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Нет операций
      </div>
    )
  }

  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
      {operations.map((operation: any) => {
        const typeInfo = operationTypeLabels[operation.type] || { 
          label: operation.type, 
          icon: null,
          color: "bg-gray-100 text-gray-800" 
        }
        
        const isEdit = Boolean(operation.reason && operation.reason.startsWith('Редактирование объекта:'))
        const changes = isEdit ? parseChanges(operation.reason || '') : []

        return (
          <div 
            key={operation.id} 
            className="border rounded-lg p-3 hover:bg-muted/50 transition-colors"
          >
            {/* Шапка операции */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${typeInfo.color}`}>
                  {isEdit ? <Edit3 className="h-4 w-4" /> : typeInfo.icon}
                </div>
                <div>
                  <Badge variant="outline" className={`text-xs ${typeInfo.color}`}>
                    {isEdit ? 'Редактирование' : typeInfo.label}
                  </Badge>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatDate(operation.date)}
                  </span>
                </div>
              </div>
            </div>

            {/* Детали операции */}
            <div className="ml-10 space-y-2">
              {/* Если это редактирование - показываем список изменений */}
              {isEdit && changes.length > 0 && (
                <div className="space-y-1.5">
                {changes.map((change, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-muted-foreground mt-0.5">
                        {changeIcons[change.field] || <RefreshCw className="h-3 w-3" />}
                      </span>
                      <div className="flex-1">
                        <span className="font-medium text-muted-foreground">{change.field}:</span>
                        <div className="flex items-center gap-1 mt-0.5">
                          {change.oldValue && (
                            <>
                              <span className="line-through text-red-500/70 bg-red-50 px-1 rounded">
                                {change.field === 'Статус' ? (
                                  // читаемое значение статуса
                                  statusLabel(change.oldValue)
                                ) : change.oldValue}
                              </span>
                              <span className="text-muted-foreground">→</span>
                            </>
                          )}
                          <span className="text-green-700 bg-green-50 px-1 rounded font-medium">
                            {change.field === 'Статус' ? statusLabel(change.newValue) : change.newValue}
                          </span>
                        </div>
                      </div>
                  </div>
                ))}
                </div>
              )}

              {/* Основание редактирования */}
              {isEdit && operation.documentDetails && (
                <div className="text-sm bg-blue-50 p-2 rounded">
                  <span className="text-muted-foreground">Основание: </span>
                  <span className="font-medium text-blue-800">{operation.documentDetails}</span>
                </div>
              )}

              {/* Стандартная информация для операций */}
              {!isEdit && (
                <>
                  <div className="flex items-center gap-4 text-sm">
                    <span>
                      <span className="text-muted-foreground">Кол-во:</span>{' '}
                      <span className="font-medium">{formatDecimal(operation.quantity)}</span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Сумма:</span>{' '}
                      <span className="font-medium">{formatCurrency(operation.totalCost)}</span>
                    </span>
                  </div>

                  {operation.type === 'TRANSFER' && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <User className="h-3 w-3" />
                      {operation.fromMol?.fullName || 'Неизвестно'} 
                      <span className="mx-1">→</span>
                      {operation.toMol?.fullName || 'Неизвестно'}
                    </div>
                  )}

                  {operation.oldStatus && operation.newStatus && operation.type !== 'STATUS_CHANGE' && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Статус: </span>
                      <span className="line-through text-red-500/70">{operation.oldStatus}</span>
                      <span className="mx-1 text-muted-foreground">→</span>
                      <span className="text-green-700 font-medium">{operation.newStatus}</span>
                    </div>
                  )}
                </>
              )}

              {/* Документ */}
              {operation.documentType && !isEdit && (
                <p className="text-xs text-muted-foreground">
                  Документ: {operation.documentType}
                  {operation.documentDetails && ` - ${operation.documentDetails}`}
                </p>
              )}

              {/* Основание для не-редактирования */}
              {operation.reason && !isEdit && (
                <p className="text-xs text-muted-foreground">
                  Основание: {operation.reason}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
