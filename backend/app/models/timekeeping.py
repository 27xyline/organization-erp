"""Отображения SQLAlchemy для таблиц учёта рабочего времени."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
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
from app.models.enums import TimeEntryType, TimesheetStatus, VacationType


class TimeEntry(Base):
    __tablename__ = "time_entries"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="time_entries_pkey"),
        CheckConstraint('"hours" > 0 AND "hours" <= 24', name="time_entries_hours_check"),
        Index("time_entries_workDate_employeeId_idx", "workDate", "employeeId", unique=False),
        Index("time_entries_projectId_workDate_idx", "projectId", "workDate", unique=False),
        Index("time_entries_taskId_workDate_idx", "taskId", "workDate", unique=False),
    )
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[TimeEntry.employeeId]")
    project: Mapped[Any] = relationship("Project", foreign_keys="[TimeEntry.projectId]")
    task: Mapped[Any] = relationship("Task", foreign_keys="[TimeEntry.taskId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    employeeId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="time_entries_employeeId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    projectId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "projects.id",
            name="time_entries_projectId_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    taskId: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "tasks.id", name="time_entries_taskId_fkey", ondelete="SET NULL", onupdate="CASCADE"
        ),
        nullable=True,
    )
    workDate: Mapped[datetime] = mapped_column(Date(), nullable=False)
    type: Mapped[TimeEntryType] = mapped_column(
        SAEnum(
            TimeEntryType,
            name="time_entry_type",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'REGULAR'"),
    )
    hours: Mapped[Decimal] = mapped_column(Numeric(precision=5, scale=2), nullable=False)
    note: Mapped[str | None] = mapped_column(Text(), nullable=True)
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


class Timesheet(Base):
    __tablename__ = "timesheets"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="timesheets_pkey"),
        Index("timesheets_year_month_status_idx", "year", "month", "status", unique=False),
        Index(
            "timesheets_submittedById_year_month_idx",
            "submittedById",
            "year",
            "month",
            unique=False,
        ),
        Index("timesheets_employeeId_year_month_key", "employeeId", "year", "month", unique=True),
    )
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[Timesheet.employeeId]")
    submittedBy: Mapped[Any] = relationship("User", foreign_keys="[Timesheet.submittedById]")
    decidedBy: Mapped[Any] = relationship("User", foreign_keys="[Timesheet.decidedById]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    employeeId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id",
            name="timesheets_employeeId_fkey",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    year: Mapped[int] = mapped_column(Integer(), nullable=False)
    month: Mapped[int] = mapped_column(Integer(), nullable=False)
    status: Mapped[TimesheetStatus] = mapped_column(
        SAEnum(
            TimesheetStatus,
            name="timesheet_status",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'DRAFT'"),
    )
    zeroHoursConfirmed: Mapped[bool] = mapped_column(
        Boolean(), nullable=False, server_default=text("false")
    )
    submittedById: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "users.id",
            name="timesheets_submittedById_fkey",
            ondelete="SET NULL",
            onupdate="CASCADE",
        ),
        nullable=True,
    )
    submittedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    decidedById: Mapped[str | None] = mapped_column(
        Text(),
        ForeignKey(
            "users.id", name="timesheets_decidedById_fkey", ondelete="SET NULL", onupdate="CASCADE"
        ),
        nullable=True,
    )
    decidedAt: Mapped[datetime | None] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=True
    )
    decisionReason: Mapped[str | None] = mapped_column(Text(), nullable=True)
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


class StaffSchedule(Base):
    __tablename__ = "staff_schedule"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="staff_schedule_pkey"),
        Index("staff_schedule_departmentId_idx", "departmentId", unique=False),
    )
    departmentRef: Mapped[Any] = relationship(
        "Department", foreign_keys="[StaffSchedule.departmentId]"
    )

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    position: Mapped[str] = mapped_column(Text(), nullable=False)
    department: Mapped[str] = mapped_column(Text(), nullable=False)
    departmentId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "departments.id",
            name="staff_schedule_departmentId_fkey",
            ondelete="RESTRICT",
            onupdate="CASCADE",
        ),
        nullable=False,
    )
    rate: Mapped[Decimal] = mapped_column(Numeric(precision=5, scale=2), nullable=False)
    salary: Mapped[Decimal] = mapped_column(Numeric(precision=10, scale=2), nullable=False)
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


class Vacation(Base):
    __tablename__ = "vacations"
    __table_args__ = (
        PrimaryKeyConstraint("id", name="vacations_pkey"),
        CheckConstraint('"startDate" <= "endDate"', name="vacations_date_range"),
        Index("vacations_employeeId_startDate_idx", "employeeId", "startDate", unique=False),
    )
    employee: Mapped[Any] = relationship("Employee", foreign_keys="[Vacation.employeeId]")

    id: Mapped[str] = mapped_column(Text(), nullable=False, default=new_cuid)
    startDate: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=False
    )
    endDate: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3), nullable=False
    )
    type: Mapped[VacationType] = mapped_column(
        SAEnum(
            VacationType,
            name="vacation_type",
            native_enum=True,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
        ),
        nullable=False,
        server_default=text("'VACATION'"),
    )
    employeeId: Mapped[str] = mapped_column(
        Text(),
        ForeignKey(
            "employees.id", name="vacations_employeeId_fkey", ondelete="CASCADE", onupdate="CASCADE"
        ),
        nullable=False,
    )
    createdAt: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=False, precision=3),
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP"),
    )
