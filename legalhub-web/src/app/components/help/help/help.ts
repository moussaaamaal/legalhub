import { Component, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [NgClass, FormsModule],
  templateUrl: './help.html',
})
export class Help {

  // ── Support channels ──────────────────────────────────────
  channels = [
    { icon: 'fa-solid fa-headset',   iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   title: 'Live Chat',       desc: 'Chat with our team in real time',           badge: 'Online now',    badgeCls: 'bg-green-100 text-green-700',  btnLabel: 'Start Chat',    btnCls: 'bg-blue-600 hover:bg-blue-700 text-white' },
    { icon: 'fa-solid fa-envelope',  iconBg: 'bg-purple-100', iconColor: 'text-purple-600', title: 'Email Support',   desc: 'We reply within 24 hours',                  badge: '24h response',  badgeCls: 'bg-purple-100 text-purple-700',btnLabel: 'Send Email',    btnCls: 'bg-purple-600 hover:bg-purple-700 text-white' },
    { icon: 'fa-solid fa-phone',     iconBg: 'bg-green-100',  iconColor: 'text-green-600',  title: 'Phone Support',   desc: 'Speak with a support specialist',           badge: 'Mon–Fri 9–6',   badgeCls: 'bg-amber-100 text-amber-700',  btnLabel: 'Call Now',      btnCls: 'bg-green-600 hover:bg-green-700 text-white' },
    { icon: 'fa-solid fa-book-open', iconBg: 'bg-amber-100',  iconColor: 'text-amber-600',  title: 'Documentation',   desc: 'Browse guides, tutorials and API docs',     badge: '200+ articles', badgeCls: 'bg-gray-100 text-gray-700',    btnLabel: 'Browse Docs',   btnCls: 'bg-amber-600 hover:bg-amber-700 text-white' },
  ];

  // ── FAQ ───────────────────────────────────────────────────
  faqs = [
    { q: 'How do I add a new case?',             a: 'Click the "New Case" button in the top navigation bar. Fill in the case details, assign a lawyer, and set the practice area. The case will be immediately visible in the Cases module.' },
    { q: 'How do I invite a team member?',        a: 'Go to Settings > Team Members and click "Invite Team Member". Enter their email address, assign a role, and they will receive an invitation email to join your LegalFlow workspace.' },
    { q: 'How are AI credits calculated?',        a: 'Each AI operation consumes credits: document generation uses 10 credits, document analysis uses 5 credits, and legal action suggestions use 3 credits. Credits reset monthly with your subscription.' },
    { q: 'Can I export my data?',                 a: 'Yes. Go to Settings and click "Export Settings". You can also export case data, client lists, and billing reports from their respective sections.' },
    { q: 'How do I change billing information?',  a: 'Navigate to Settings > Subscription Plan. Click "View All Invoices" and then "Update Payment Method" to change your credit card or billing details.' },
    { q: 'What happens if I exceed storage?',     a: 'You will receive alerts at 70%, 85%, and 95% capacity. Once full, new uploads will be blocked until you upgrade your plan or archive older documents.' },
    { q: 'How do I reset my password?',           a: 'Click your profile avatar at the bottom of the sidebar, select "Account Settings", and then "Change Password". You can also use the forgot password link on the login page.' },
    { q: 'Is my data backed up automatically?',   a: 'Yes. LegalFlow performs automatic backups every 24 hours. Enterprise plan subscribers also get real-time incremental backups with 30-day retention.' },
  ];

  openFaq = signal<number | null>(null);
  toggleFaq(i: number) { this.openFaq.set(this.openFaq() === i ? null : i); }

  // ── Quick guides ──────────────────────────────────────────
  guides = [
    { icon: 'fa-solid fa-play-circle',   iconColor: 'text-blue-500',   title: 'Getting Started Guide',           meta: '5 min read',   tag: 'Beginner',  tagCls: 'bg-blue-100 text-blue-700' },
    { icon: 'fa-solid fa-video',          iconColor: 'text-purple-500', title: 'Video: Case Management',          meta: '12 min video', tag: 'Video',     tagCls: 'bg-purple-100 text-purple-700' },
    { icon: 'fa-solid fa-file-pdf',       iconColor: 'text-red-500',    title: 'AI Assistant Full Manual',        meta: 'PDF, 24 pages',tag: 'Advanced',  tagCls: 'bg-red-100 text-red-700' },
    { icon: 'fa-solid fa-keyboard',       iconColor: 'text-green-500',  title: 'Keyboard Shortcuts Cheatsheet',   meta: '1 min read',   tag: 'Quick tip', tagCls: 'bg-green-100 text-green-700' },
    { icon: 'fa-solid fa-shield-halved',  iconColor: 'text-amber-500',  title: 'Security Best Practices',         meta: '8 min read',   tag: 'Security',  tagCls: 'bg-amber-100 text-amber-700' },
    { icon: 'fa-solid fa-rotate',         iconColor: 'text-indigo-500', title: 'Migration & Import Guide',        meta: '10 min read',  tag: 'Setup',     tagCls: 'bg-indigo-100 text-indigo-700' },
    { icon: 'fa-solid fa-credit-card',    iconColor: 'text-pink-500',   title: 'Billing & Subscription Guide',    meta: '6 min read',   tag: 'Billing',   tagCls: 'bg-pink-100 text-pink-700' },
    { icon: 'fa-solid fa-users',          iconColor: 'text-teal-500',   title: 'Team & Roles Management',         meta: '7 min read',   tag: 'Team',      tagCls: 'bg-teal-100 text-teal-700' },
    { icon: 'fa-solid fa-robot',          iconColor: 'text-purple-600', title: 'AI Credits & Usage Guide',        meta: '4 min read',   tag: 'AI',        tagCls: 'bg-purple-100 text-purple-700' },
  ];

  // ── System status ─────────────────────────────────────────
  systemServices = [
    { name: 'Web Application',     status: 'Operational', cls: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
    { name: 'AI Assistant',        status: 'Operational', cls: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
    { name: 'Document Storage',    status: 'Degraded',    cls: 'bg-amber-100 text-amber-700',  dot: 'bg-amber-500' },
    { name: 'Email Notifications', status: 'Operational', cls: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
    { name: 'Billing System',      status: 'Operational', cls: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
    { name: 'API Services',        status: 'Operational', cls: 'bg-green-100 text-green-700',  dot: 'bg-green-500' },
  ];

  // ── Recent tickets ────────────────────────────────────────
  tickets = [
    { id: '#TKT-1042', subject: 'Cannot upload documents larger than 5MB', status: 'Open',     statusCls: 'bg-red-100 text-red-700',    priority: 'High',   priorityCls: 'bg-red-100 text-red-700',    created: '2 hours ago' },
    { id: '#TKT-1041', subject: 'AI credits not refreshing after renewal',  status: 'Open',     statusCls: 'bg-red-100 text-red-700',    priority: 'Medium', priorityCls: 'bg-amber-100 text-amber-700',created: '1 day ago' },
    { id: '#TKT-1038', subject: 'Calendar sync with Google not working',    status: 'Pending',  statusCls: 'bg-amber-100 text-amber-700',priority: 'Low',    priorityCls: 'bg-blue-100 text-blue-700',  created: '3 days ago' },
    { id: '#TKT-1035', subject: 'Invoice PDF formatting issue',             status: 'Resolved', statusCls: 'bg-green-100 text-green-700',priority: 'Low',    priorityCls: 'bg-blue-100 text-blue-700',  created: '5 days ago' },
  ];
}
