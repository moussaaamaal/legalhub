// User model
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'partner' | 'associate' | 'paralegal' | 'admin';
  avatar?: string;
  title?: string;
}

// Case model
export interface Case {
  id: string;
  caseNumber: string;
  title: string;
  client: string;
  clientId: string;
  type: string;         // backend enum: CRIMINAL | CIVIL | CORPORATE | ...
  status: string;       // backend enum: NEW | INVESTIGATION | PRE_TRIAL | TRIAL | APPEAL | SETTLED | CLOSED
  priority: string;     // backend enum: URGENT | HIGH | MEDIUM | NORMAL | LOW
  assignedTo: string;
  openDate: Date;
  nextHearing?: Date;
  court?: string;
  description?: string;
  tags?: string[];
}

// Client model
export interface Client {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  type: string;
  typeBg: string;
  typeColor: string;
  clientType: string;       // raw backend: INDIVIDUAL | CORPORATE
  status: 'Active' | 'Inactive' | 'Pending';
  statusBg: string;
  statusColor: string;
  tag: string;              // raw backend: ACTIVE | INACTIVE | PENDING
  since: string;
  lastContact: string;
  totalBilled: string;
  activeCases: number;
  totalCases: number;
  openCases: number;
  tags: string[];
  attorney: string;
  avatar: string;
  address?: string;
  notes?: string;
  joinDate: Date;
}

// Invoice model
export interface Invoice {
  id: string;
  invoiceNumber: string;
  client: string;
  clientId: string;
  caseId?: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue' | 'draft';
  issueDate: Date;
  dueDate: Date;
  items: InvoiceItem[];
}

export interface InvoiceItem {
  description: string;
  hours: number;
  rate: number;
  amount: number;
}

// Document model
export interface Document {
  id: string;
  name: string;
  type: string;
  size: string;
  caseId?: string;
  clientId?: string;
  uploadedBy: string;
  uploadDate: Date;
  tags?: string[];
  folder?: string;
}

// Notification model
export interface Notification {
  id: string;
  type: 'hearing' | 'deadline' | 'payment' | 'document' | 'system';
  title: string;
  message: string;
  date: Date;
  read: boolean;
  priority: 'high' | 'medium' | 'low';
  link?: string;
}

// Calendar Event model
export interface CalendarEvent {
  id: string;
  title: string;
  type: 'hearing' | 'meeting' | 'deadline' | 'reminder';
  date: Date;
  startTime?: string;
  endTime?: string;
  location?: string;
  caseId?: string;
  clientId?: string;
  description?: string;
  color?: string;
}
