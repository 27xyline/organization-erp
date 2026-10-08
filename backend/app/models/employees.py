"""SQLAlchemy mappings for employees tables."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    PrimaryKeyConstraint,
    Text,
    text,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, new_cuid, utc_now_naive
from app.models.enums import EmployeeStatus, EmploymentContractType


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="employees_pkey"),
        CheckConstraint(
            '"contractSignedDate" IS NULL OR "contractEndDate" IS NULL '
            'OR "contractSignedDate" <= "contractEndDate"',
            name="employees_contract_date_range",
        ),
        CheckConstraint(
            '"managerId" IS NULL OR "managerId" <> "id"', name="employees_manager_not_self_check"
        ),
        Index("employees_code_key", "code", unique=True),
        Index("employees_status_fullName_idx", "status", "fullName", unique=False),
        Index("employees_departmentId_idx", "departmentId", unique=False),
        Index("employees_managerId_idx", "managerId", unique=False),
    )
    departmentRef: Mapped[Any] = relationship(
        "Department",
        foreign_keys="[Employee.departmentId]",
        back_populates="employees",
    )
    manager: Mapped[Any] = relationship(
        "Employee",
        foreign_keys="[Employee.managerId]",
        remote_side="[Employee.id]",
    )
    staffSchedule: Mapped[Any] = relationship(
        "StaffSchedule", foreign_keys="[Employee.staffScheduleId]"
    )

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    code: Mapped[str] = mapped_column(Text(), nullable=False)
    fullName: Mapped[str] = mapped_column(Text(), nullable=False)
    department: Mapped[str] = mapped_column(Text(), nullable=False)
    departmentId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "departments.id",
            name="employees_departmentId_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    photo: Mapped[str | None] = mapped_column(Text(), nullable=True)
    contractType: Mapped[EmploymentContractType] = mapped_column(
        SAEnum(
            EmploymentContractType,
            name="employment_contract_type",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'PRIMARY'"),
    )
    contractSignedDate: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    contractEndDate: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    contractNumber: Mapped[str | None] = mapped_column(Text(), nullable=True)
    phone: Mapped[str | None] = mapped_column(Text(), nullable=True)
    email: Mapped[str | None] = mapped_column(Text(), nullable=True)
    birthDate: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    education: Mapped[str | None] = mapped_column(Text(), nullable=True)
    qualification: Mapped[str | None] = mapped_column(Text(), nullable=True)
    managerId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id", name="employees_managerId_fkey", ondelete="SET NULL", onupdate="CASCADE"
        ),
        nullable=True,
    )
    staffScheduleId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "staff_schedule.id",
            name="employees_staffScheduleId_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    employmentRate: Mapped[Decimal] = mapped_column(
        Numeric(precision=5, scale=2), nullable=False, server_default=text("1.00")
    )
    status: Mapped[EmployeeStatus] = mapped_column(
        SAEnum(
            EmployeeStatus,
            name="employee_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'ACTIVE'"),
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        default=utc_now_naive,
        onupdate=utc_now_naive,
    )


class EmployeeSkill(Base):
    __tablename__ = "employee_skills"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="employee_skills_pkey"),
        CheckConstraint(
            '"level" IS NULL OR "level" BETWEEN 1 AND 5', name="employee_skills_level_check"
        ),
        Index("employee_skills_employeeId_idx", "employeeId", unique=False),
        Index("employee_skills_employeeId_name_key", "employeeId", "name", unique=True),
    )
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[EmployeeSkill.employeeId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    employeeId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="employee_skills_employeeId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    level: Mapped[int | None] = mapped_column(Integer(), nullable=True)
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        default=utc_now_naive,
        onupdate=utc_now_naive,
    )


class EmployeeCertificate(Base):
    __tablename__ = "employee_certificates"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="employee_certificates_pkey"),
        CheckConstraint(
            '"issuedAt" IS NULL OR "expiresAt" IS NULL OR "expiresAt" >= "issuedAt"',
            name="employee_certificates_date_check",
        ),
        Index(
            "employee_certificates_employeeId_expiresAt_idx",
            "employeeId",
            "expiresAt",
            unique=False,
        ),
    )
    employee: Mapped[Any] = relationship(
        "Employee", foreign_keys="[EmployeeCertificate.employeeId]"
    )

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    employeeId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="employee_certificates_employeeId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(Text(), nullable=False)
    issuer: Mapped[str | None] = mapped_column(Text(), nullable=True)
    number: Mapped[str | None] = mapped_column(Text(), nullable=True)
    issuedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    expiresAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updatedAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        default=utc_now_naive,
        onupdate=utc_now_naive,
    )
