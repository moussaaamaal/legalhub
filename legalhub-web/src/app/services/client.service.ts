import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { Client } from '../models';

@Injectable({ providedIn: 'root' })
export class ClientService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  private clientsSignal = signal<Client[]>([]);
  clients = this.clientsSignal.asReadonly();

  private statusMap: Record<string, { bg: string; color: string; label: string }> = {
    ACTIVE:   { bg: 'bg-green-100', color: 'text-green-700', label: 'Active' },
    INACTIVE: { bg: 'bg-red-100',   color: 'text-red-700',   label: 'Inactive' },
    PENDING:  { bg: 'bg-amber-100', color: 'text-amber-700', label: 'Pending' },
  };

  private typeMap: Record<string, { bg: string; color: string; label: string }> = {
    INDIVIDUAL: { bg: 'bg-gray-100', color: 'text-gray-700', label: 'Standard Client' },
    CORPORATE:  { bg: 'bg-blue-100', color: 'text-blue-700', label: 'Corporate Client' },
  };

  private _map(raw: Record<string, unknown>): Client {
    const firstName  = String(raw['first_name']   ?? '');
    const lastName   = String(raw['last_name']    ?? '');
    const name       = `${firstName} ${lastName}`.trim() || String(raw['company_name'] ?? '');
    const tag        = (raw['tag']          as string)?.toUpperCase() ?? 'ACTIVE';
    const clientType = (raw['client_type']  as string)?.toUpperCase() ?? 'INDIVIDUAL';

    const statusInfo = this.statusMap[tag]        ?? this.statusMap['ACTIVE'];
    const typeInfo   = this.typeMap[clientType]   ?? this.typeMap['INDIVIDUAL'];

    const joinDate = raw['created_at'] ? new Date(String(raw['created_at'])) : new Date();
    const since    = joinDate.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

    return {
      id:          String(raw['id']),
      name,
      firstName,
      lastName,
      email:       String(raw['email']  ?? ''),
      phone:       String(raw['phone']  ?? ''),
      company:     raw['company_name'] ? String(raw['company_name']) : '—',
      type:        typeInfo.label,
      typeBg:      typeInfo.bg,
      typeColor:   typeInfo.color,
      clientType,
      status:      statusInfo.label as 'Active' | 'Inactive' | 'Pending',
      statusBg:    statusInfo.bg,
      statusColor: statusInfo.color,
      tag,
      since,
      lastContact: since,
      totalBilled: '$0',
      activeCases: Number(raw['open_cases']  ?? 0),
      totalCases:  Number(raw['total_cases'] ?? 0),
      openCases:   Number(raw['open_cases']  ?? 0),
      tags:        [],
      attorney:    '—',
      avatar:      raw['avatar_url']
                     ? String(raw['avatar_url'])
                     : 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg',
      address:     raw['address'] ? String(raw['address']) : undefined,
      notes:       raw['notes']   ? String(raw['notes'])   : undefined,
      joinDate,
    };
  }

  async loadClients(filters?: { tag?: string; search?: string }): Promise<void> {
    const params: Record<string, string> = {};
    if (filters?.tag)    params['tag']    = filters.tag;
    if (filters?.search) params['search'] = filters.search;

    const raw = await firstValueFrom(
      this.http.get<Record<string, unknown>[]>(`${this.api}/api/clients`, { params })
    );
    this.clientsSignal.set(raw.map(r => this._map(r)));
  }

  getClientById(id: string): Client | undefined {
    return this.clientsSignal().find(c => c.id === id);
  }

  async fetchClientById(id: string): Promise<Client | null> {
    try {
      const raw = await firstValueFrom(
        this.http.get<Record<string, unknown>>(`${this.api}/api/clients/${id}`)
      );
      return this._map(raw);
    } catch {
      return null;
    }
  }

  async addClient(payload: Record<string, unknown>): Promise<Client> {
    const raw = await firstValueFrom(
      this.http.post<Record<string, unknown>>(`${this.api}/api/clients`, payload)
    );
    const client = this._map(raw);
    this.clientsSignal.update(list => [client, ...list]);
    return client;
  }

  async updateClient(id: string, payload: Record<string, unknown>): Promise<Client> {
    const raw = await firstValueFrom(
      this.http.put<Record<string, unknown>>(`${this.api}/api/clients/${id}`, payload)
    );
    const updated = this._map(raw);
    this.clientsSignal.update(list => list.map(c => c.id === id ? updated : c));
    return updated;
  }

  async deleteClient(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.api}/api/clients/${id}`)
    );
    this.clientsSignal.update(list => list.filter(c => c.id !== id));
  }

  async uploadAvatar(id: string, file: File): Promise<Client> {
    const form = new FormData();
    form.append('file', file);
    const raw = await firstValueFrom(
      this.http.post<Record<string, unknown>>(`${this.api}/api/clients/${id}/avatar`, form)
    );
    const updated = this._map(raw);
    this.clientsSignal.update(list => list.map(c => c.id === id ? updated : c));
    return updated;
  }

  async fetchClientCases(clientId: string): Promise<any[]> {
    try {
      return await firstValueFrom(
        this.http.get<any[]>(`${this.api}/api/clients/${clientId}/cases`)
      );
    } catch { return []; }
  }

  async fetchClientInvoices(clientId: string): Promise<any[]> {
    try {
      return await firstValueFrom(
        this.http.get<any[]>(`${this.api}/api/clients/${clientId}/invoices`)
      );
    } catch { return []; }
  }

  async fetchClientDocuments(clientId: string): Promise<any[]> {
    try {
      return await firstValueFrom(
        this.http.get<any[]>(`${this.api}/api/clients/${clientId}/documents`)
      );
    } catch { return []; }
  }
}
