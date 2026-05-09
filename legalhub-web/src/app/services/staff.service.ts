import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export interface StaffMember {
  id: string;
  avatar: string;
  borderCls: string;
  name: string;
  title: string;
  dept: string;
  deptCls: string;
  phone: string;
  email: string;
  roleCls: string;
  roleLabel: string;
  statusCls: string;
  status: string;
  since: string;
  cases: number;
  role: string;
  is_active: boolean;
}

const ROLE_MAP: Record<string, { label: string; cls: string }> = {
  FIRM_ADMIN:  { label: 'Admin',       cls: 'bg-blue-100 text-blue-700'   },
  LAWYER:      { label: 'Lawyer',      cls: 'bg-green-100 text-green-700' },
  SUPER_ADMIN: { label: 'Super Admin', cls: 'bg-purple-100 text-purple-700' },
};

const DEPT_MAP: Record<string, { label: string; cls: string }> = {
  FIRM_ADMIN:  { label: 'Leadership', cls: 'bg-blue-100 text-blue-700'   },
  LAWYER:      { label: 'Legal',      cls: 'bg-green-100 text-green-700' },
  SUPER_ADMIN: { label: 'Leadership', cls: 'bg-purple-100 text-purple-700' },
};

@Injectable({ providedIn: 'root' })
export class StaffService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  private _staff = signal<StaffMember[]>([]);
  staff = this._staff.asReadonly();

  private _map(raw: Record<string, unknown>): StaffMember {
    const role     = String(raw['role'] ?? 'LAWYER');
    const isActive = Boolean(raw['is_active']);
    const lastLogin = raw['last_login_at'];
    const fullName = String(raw['full_name'] ?? '');

    const avatar = raw['avatar_url']
      ? String(raw['avatar_url'])
      : `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=f59e0b&color=fff`;

    // Pending = invited but never logged in; Inactive = was active then deactivated
    let status: string;
    if (isActive) {
      status = 'Active';
    } else if (!lastLogin) {
      status = 'Pending';
    } else {
      status = 'Inactive';
    }

    const statusCls =
      status === 'Active'  ? 'bg-green-100 text-green-700' :
      status === 'Pending' ? 'bg-amber-100 text-amber-700' :
                             'bg-red-100 text-red-700';
    const borderCls =
      status === 'Active'  ? 'border-green-500' :
      status === 'Pending' ? 'border-amber-500' :
                             'border-red-400';

    const createdAt = raw['created_at'] ? new Date(String(raw['created_at'])) : new Date();
    const since = createdAt.toLocaleString('en-US', { month: 'short', year: 'numeric' });

    return {
      id:        String(raw['id']),
      avatar,
      borderCls,
      name:      fullName,
      title:     ROLE_MAP[role]?.label ?? role,
      dept:      DEPT_MAP[role]?.label ?? 'General',
      deptCls:   DEPT_MAP[role]?.cls   ?? 'bg-gray-100 text-gray-700',
      phone:     String(raw['phone'] ?? ''),
      email:     String(raw['email'] ?? ''),
      roleCls:   ROLE_MAP[role]?.cls   ?? 'bg-gray-100 text-gray-700',
      roleLabel: ROLE_MAP[role]?.label ?? role,
      statusCls,
      status,
      since,
      cases:     0,
      role,
      is_active: isActive,
    };
  }

  async loadStaff(): Promise<void> {
    const [rawTeam, caseCounts] = await Promise.all([
      firstValueFrom(this.http.get<Record<string, unknown>[]>(`${this.api}/api/firm/team`)),
      firstValueFrom(this.http.get<Record<string, number>>(`${this.api}/api/firm/team/case-counts`)),
    ]);
    this._staff.set(rawTeam.map(r => ({
      ...this._map(r),
      cases: caseCounts[String(r['id'])] ?? 0,
    })));
  }

  async inviteStaff(email: string, fullName: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.api}/api/auth/invite/lawyer`, { email, full_name: fullName })
    );
    await this.loadStaff();
  }

  async updateMember(userId: string, fullName: string, phone: string, role: string): Promise<void> {
    await firstValueFrom(
      this.http.put(`${this.api}/api/firm/team/${userId}`, {
        full_name: fullName || undefined,
        phone:     phone    || undefined,
        role,
      })
    );
    this._staff.update(list =>
      list.map(m => m.id !== userId ? m : {
        ...m,
        name:      fullName,
        phone,
        role,
        title:     ROLE_MAP[role]?.label ?? m.title,
        roleLabel: ROLE_MAP[role]?.label ?? m.roleLabel,
        roleCls:   ROLE_MAP[role]?.cls   ?? m.roleCls,
        dept:      DEPT_MAP[role]?.label ?? m.dept,
        deptCls:   DEPT_MAP[role]?.cls   ?? m.deptCls,
      })
    );
  }

  async updateRole(userId: string, role: string): Promise<void> {
    await firstValueFrom(
      this.http.put(`${this.api}/api/firm/team/${userId}/role`, { role })
    );
    this._staff.update(list =>
      list.map(m => m.id !== userId ? m : {
        ...m,
        role,
        roleLabel: ROLE_MAP[role]?.label ?? role,
        roleCls:   ROLE_MAP[role]?.cls   ?? 'bg-gray-100 text-gray-700',
        dept:      DEPT_MAP[role]?.label ?? m.dept,
        deptCls:   DEPT_MAP[role]?.cls   ?? m.deptCls,
      })
    );
  }

  async deactivate(userId: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/api/firm/team/${userId}`));
    this._staff.update(list =>
      list.map(m => m.id !== userId ? m : {
        ...m,
        is_active: false,
        status:    'Inactive',
        statusCls: 'bg-red-100 text-red-700',
        borderCls: 'border-red-400',
      })
    );
  }
}
