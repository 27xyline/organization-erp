-- CreateEnum
CREATE TYPE "employee_status" AS ENUM ('ACTIVE', 'ON_VACATION', 'ON_SICK_LEAVE', 'DISMISSED');

-- CreateEnum
CREATE TYPE "personnel_action_type" AS ENUM ('HIRE', 'DISMISS', 'TRANSFER', 'EXTEND', 'PROMOTE');

-- CreateEnum
CREATE TYPE "vacation_type" AS ENUM ('VACATION', 'SICK_LEAVE', 'BUSINESS_TRIP', 'UNPAID_LEAVE');

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "photo" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "staffScheduleId" TEXT,
    "status" "employee_status" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_schedule" (
    "id" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "rate" DECIMAL(3,2) NOT NULL,
    "salary" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel_actions" (
    "id" TEXT NOT NULL,
    "type" "personnel_action_type" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT,
    "employeeId" TEXT NOT NULL,
    "oldDepartment" TEXT,
    "newDepartment" TEXT,
    "oldPosition" TEXT,
    "newPosition" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personnel_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacations" (
    "id" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "type" "vacation_type" NOT NULL DEFAULT 'VACATION',
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vacations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_code_key" ON "employees"("code");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_staffScheduleId_fkey" FOREIGN KEY ("staffScheduleId") REFERENCES "staff_schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_actions" ADD CONSTRAINT "personnel_actions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacations" ADD CONSTRAINT "vacations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
