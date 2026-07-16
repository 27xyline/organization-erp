import { TableCell, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'

interface EmployeesTableSkeletonProps {
  rowCount?: number
  cellCount?: number
}

export function EmployeesTableSkeleton({ rowCount = 5, cellCount = 8 }: EmployeesTableSkeletonProps) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, i) => (
        <TableRow key={`skeleton-row-${i}`}>
          {Array.from({ length: cellCount }).map((_, j) => (
            <TableCell key={`skeleton-cell-${i}-${j}`}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}
