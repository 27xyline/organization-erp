"""SQLAlchemy mappings for finance tables."""

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
from app.models.enums import (
    FinancePlanType,
    PayrollAdjustmentType,
    PayrollPeriodStatus,
    PersonnelActionType,
)


class SalaryEntry(Base):
    __tablename__ = "salary_entries"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="salary_entries_pkey"),
        CheckConstraint('"amount" >= 0', name="salary_entries_amount_nonnegative"),
        Index("salary_entries_year_month_idx", "year", "month", unique=False),
        Index(
            "salary_entries_employeeId_year_month_key", "employeeId", "year", "month", unique=True
        ),
    )
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[SalaryEntry.employeeId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    employeeId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="salary_entries_employeeId_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    year: Mapped[int] = mapped_column(Integer(), nullable=False)
    month: Mapped[int] = mapped_column(Integer(), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=12, scale=2), nullable=False)
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


class PayrollAdjustment(Base):
    __tablename__ = "payroll_adjustments"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="payroll_adjustments_pkey"),
        CheckConstraint(
            '"year" BETWEEN 2000 AND 2100 AND "month" BETWEEN 1 AND 12',
            name="payroll_adjustments_period_check",
        ),
        CheckConstraint('"amount" > 0', name="payroll_adjustments_amount_check"),
        Index(
            "payroll_adjustments_year_month_employeeId_idx",
            "year",
            "month",
            "employeeId",
            unique=False,
        ),
        Index(
            "payroll_adjustments_projectId_year_month_idx",
            "projectId",
            "year",
            "month",
            unique=False,
        ),
    )
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[PayrollAdjustment.employeeId]")
    project: Mapped[Any] = relationship("Project", foreign_keys="[PayrollAdjustment.projectId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    employeeId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="payroll_adjustments_employeeId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    projectId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "projects.id",
            name="payroll_adjustments_projectId_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    year: Mapped[int] = mapped_column(Integer(), nullable=False)
    month: Mapped[int] = mapped_column(Integer(), nullable=False)
    type: Mapped[PayrollAdjustmentType] = mapped_column(
        SAEnum(
            PayrollAdjustmentType,
            name="payroll_adjustment_type",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=12, scale=2), nullable=False)
    description: Mapped[str] = mapped_column(Text(), nullable=False)
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


class PayrollPeriod(Base):
    __tablename__ = "payroll_periods"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="payroll_periods_pkey"),
        CheckConstraint(
            '"year" BETWEEN 2000 AND 2100 AND "month" BETWEEN 1 AND 12',
            name="payroll_periods_period_check",
        ),
        CheckConstraint(
            ' ("status" = \'OPEN\' AND "closedAt" IS NULL AND "closedById" IS NULL) '
            'OR ("status" = \'CLOSED\' AND "closedAt" IS NOT NULL AND "closedById" IS NOT NULL) ',
            name="payroll_periods_close_consistent",
        ),
        Index("payroll_periods_year_month_key", "year", "month", unique=True),
        Index("payroll_periods_status_year_month_idx", "status", "year", "month", unique=False),
    )
    closedBy: Mapped[Any] = relationship("User", foreign_keys="[PayrollPeriod.closedById]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    year: Mapped[int] = mapped_column(Integer(), nullable=False)
    month: Mapped[int] = mapped_column(Integer(), nullable=False)
    status: Mapped[PayrollPeriodStatus] = mapped_column(
        SAEnum(
            PayrollPeriodStatus,
            name="payroll_period_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'OPEN'"),
    )
    closedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    closedById: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="payroll_periods_closedById_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
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


class FinancePlanEntry(Base):
    __tablename__ = "finance_plan_entries"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="finance_plan_entries_pkey"),
        CheckConstraint('"amount" >= 0', name="finance_plan_entries_amount_nonnegative"),
        Index("finance_plan_entries_year_month_type_idx", "year", "month", "type", unique=False),
        Index(
            "finance_plan_entries_employeeId_year_month_type_idx",
            "employeeId",
            "year",
            "month",
            "type",
            unique=False,
        ),
        Index(
            "finance_plan_entries_employeeId_year_month_type_projectId_key",
            "employeeId",
            "year",
            "month",
            "type",
            "projectId",
            unique=True,
        ),
        Index(
            "finance_plan_entries_without_project_key",
            "employeeId",
            "year",
            "month",
            "type",
            unique=True,
            postgresql_where=text('"projectId" IS NULL'),
        ),
    )
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[FinancePlanEntry.employeeId]")
    project: Mapped[Any] = relationship("Project", foreign_keys="[FinancePlanEntry.projectId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    employeeId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="finance_plan_entries_employeeId_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    projectId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "projects.id",
            name="finance_plan_entries_projectId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    year: Mapped[int] = mapped_column(Integer(), nullable=False)
    month: Mapped[int] = mapped_column(Integer(), nullable=False)
    type: Mapped[FinancePlanType] = mapped_column(
        SAEnum(
            FinancePlanType,
            name="finance_plan_type",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=12, scale=2), nullable=False)
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


class PersonnelAction(Base):
    __tablename__ = "personnel_actions"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="personnel_actions_pkey"),
        Index("personnel_actions_employeeId_date_idx", "employeeId", "date", unique=False),
    )
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[PersonnelAction.employeeId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    type: Mapped[PersonnelActionType] = mapped_column(
        SAEnum(
            PersonnelActionType,
            name="personnel_action_type",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
    )
    date: Mapped[datetime] = mapped_column(TIMESTAMP(timezone=False, precision=3), nullable=False)
    description: Mapped[str | None] = mapped_column(Text(), nullable=True)
    employeeId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="personnel_actions_employeeId_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    oldDepartment: Mapped[str | None] = mapped_column(Text(), nullable=True)
    newDepartment: Mapped[str | None] = mapped_column(Text(), nullable=True)
    oldPosition: Mapped[str | None] = mapped_column(Text(), nullable=True)
    newPosition: Mapped[str | None] = mapped_column(Text(), nullable=True)
    oldContractEndDate: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    newContractEndDate: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
