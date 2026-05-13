from enum import Enum

class UserRole(str, Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    FIRM_ADMIN  = "FIRM_ADMIN"
    LAWYER      = "LAWYER"
    CLIENT      = "CLIENT"

class CaseStatus(str, Enum):
    NEW           = "NEW"
    INVESTIGATION = "INVESTIGATION"
    PRE_TRIAL     = "PRE_TRIAL"
    TRIAL         = "TRIAL"
    APPEAL        = "APPEAL"
    SETTLED       = "SETTLED"
    CLOSED        = "CLOSED"

class CasePriority(str, Enum):
    URGENT = "URGENT"
    HIGH   = "HIGH"
    MEDIUM = "MEDIUM"
    NORMAL = "NORMAL"
    LOW    = "LOW"

class CaseType(str, Enum):
    CRIMINAL         = "CRIMINAL"
    CIVIL            = "CIVIL"
    CORPORATE        = "CORPORATE"
    FAMILY           = "FAMILY"
    REAL_ESTATE      = "REAL_ESTATE"
    IMMIGRATION      = "IMMIGRATION"
    PERSONAL_INJURY  = "PERSONAL_INJURY"
    IP               = "IP"
    LABOR            = "LABOR"
    TAX              = "TAX"

class BillingType(str, Enum):
    HOURLY      = "HOURLY"
    FLAT_FEE    = "FLAT_FEE"
    CONTINGENCY = "CONTINGENCY"
    RETAINER    = "RETAINER"

class InvoiceStatus(str, Enum):
    DRAFT     = "DRAFT"
    PENDING   = "PENDING"
    PAID      = "PAID"
    OVERDUE   = "OVERDUE"
    CANCELLED = "CANCELLED"

class DocumentCategory(str, Enum):
    CONTRACT         = "CONTRACT"
    COURT_DOC        = "COURT_DOC"
    EVIDENCE         = "EVIDENCE"
    FINANCIAL        = "FINANCIAL"
    CLIENT_DOC       = "CLIENT_DOC"
    VOICE_TRANSCRIPT = "VOICE_TRANSCRIPT"
    OTHER            = "OTHER"

class DocumentStatus(str, Enum):
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED       = "APPROVED"
    REJECTED       = "REJECTED"

class EventType(str, Enum):
    HEARING      = "HEARING"
    MEETING      = "MEETING"
    DEADLINE     = "DEADLINE"
    CONSULTATION = "CONSULTATION"
    COURT_DATE   = "COURT_DATE"

class PaymentGateway(str, Enum):
    STRIPE     = "STRIPE"
    MASTERCARD = "MASTERCARD"
    SADAD      = "SADAD"

class ClientTag(str, Enum):
    ACTIVE  = "ACTIVE"
    PENDING = "PENDING"
    PREMIUM = "PREMIUM"
    VIP     = "VIP"
    NEW     = "NEW"
    URGENT  = "URGENT"