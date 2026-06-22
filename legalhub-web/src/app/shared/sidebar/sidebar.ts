import { Component, inject, OnInit, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';

interface NavItem {
  label:       string;
  icon:        string;
  route:       string;
  badge?:      string;      
  badgeColor?: string;      
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, NgClass],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css'
})
export class Sidebar implements OnInit {
  private authService  = inject(AuthService);
  private notifService = inject(NotificationService);

  currentUser        = this.authService.currentUser;
  showLogoutConfirm  = signal(false);

  unreadCount   = this.notifService.unreadCount;
  casesCount    = this.notifService.casesCount;
  calendarCount = this.notifService.calendarCount;

  ngOnInit(): void {
    this.notifService.loadAllBadges();
  }

  navGroups: NavGroup[] = [
    {
      title: 'Workspace',
      items: [
        { label: 'Dashboard',     icon: 'fa-solid fa-chart-line',   route: '/dashboard' },
        { label: 'Cases',         icon: 'fa-solid fa-briefcase',    route: '/cases' },
        { label: 'Clients',       icon: 'fa-solid fa-users',        route: '/clients' },
        { label: 'Calendar',      icon: 'fa-solid fa-calendar-alt', route: '/calendar' },
        { label: 'Notifications', icon: 'fa-solid fa-bell',         route: '/notifications' },
      ]
    },
    {
      title: 'Resources',
      items: [
        { label: 'Documents',    icon: 'fa-solid fa-folder-open',         route: '/documents' },
        { label: 'Billing',      icon: 'fa-solid fa-file-invoice-dollar', route: '/billing' },
{ label: 'AI Assistant', icon: 'fa-solid fa-robot',               route: '/ai-assistant' },
      ]
    },
    {
      title: 'Organization',
      items: [
        { label: 'Staff',              icon: 'fa-solid fa-users',          route: '/staff' },
        { label: 'Profile & Settings', icon: 'fa-solid fa-sliders',        route: '/settings' },
      ]
    },
  ];

  logout(): void {
    this.showLogoutConfirm.set(true);
  }

  async confirmLogout(): Promise<void> {
    await this.authService.logout();
  }

  cancelLogout(): void {
    this.showLogoutConfirm.set(false);
  }
}