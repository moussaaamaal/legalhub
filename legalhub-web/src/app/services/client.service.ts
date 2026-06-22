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

  private deletedIds = new Set<string>(
    JSON.parse(localStorage.getItem('_deletedClientIds') ?? '[]')
  );

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

    const totalBilledAmount = Number(raw['total_billed'] ?? 0);
    const totalBilled = totalBilledAmount >= 1000
      ? '$' + (totalBilledAmount / 1000).toFixed(1) + 'K'
      : '$' + totalBilledAmount.toFixed(0);

    const activeCases = Number(raw['active_cases_count'] ?? 0);

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
      totalBilledAmount,
      totalBilled,
      hasUnpaidInvoices: Boolean(raw['has_unpaid_invoices']),
      practiceArea: raw['practice_area'] ? String(raw['practice_area']) : undefined,
      activeCases,
      totalCases:  activeCases,
      openCases:   activeCases,
      tags:        [],
      attorney:    '—',
      avatar:      raw['avatar_url']
                     ? String(raw['avatar_url'])
                     : 'https://storage.googleapis.com/uxpilot-auth.appspot.com/avatars/avatar-1.jpg',
      address:     raw['address'] ? String(raw['address']) : undefined,
      notes:       raw['notes']   ? String(raw['notes'])   : undefined,
      joinDate,
      whatsappNumber: raw['whatsapp_number'] ? String(raw['whatsapp_number']) : undefined,
      dateOfBirth:    raw['date_of_birth']   ? String(raw['date_of_birth'])   : undefined,
      gender:         raw['gender']          ? String(raw['gender'])           : undefined,
      nationalId:     raw['national_id']     ? String(raw['national_id'])      : undefined,
      nationality:    raw['nationality']     ? String(raw['nationality'])      : undefined,
      occupation:     raw['occupation']      ? String(raw['occupation'])       : undefined,
      inviteStatus:   raw['invite_status']   ? String(raw['invite_status'])    : undefined,
      userId:         raw['user_id']         ? String(raw['user_id'])          : undefined,
    };
  }

  async loadClients(filters?: { tag?: string; search?: string }): Promise<void> {
    const params: Record<string, string> = {};
    if (filters?.tag)    params['tag']    = filters.tag;
    if (filters?.search) params['search'] = filters.search;

    const raw = await firstValueFrom(
      this.http.get<Record<string, unknown>[]>(`${this.api}/api/clients`, { params })
    );
    this.clientsSignal.set(raw.map(r => this._map(r)).filter(c => !this.deletedIds.has(c.id)));
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
    this.deletedIds.add(id);
    localStorage.setItem('_deletedClientIds', JSON.stringify([...this.deletedIds]));
    this.clientsSignal.update(list => list.filter(c => c.id !== id));
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
        this.http.get<any[]>(`${this.api}/api/invoices`, { params: { client_id: clientId } })
      );
    } catch { return []; }
  }

  async fetchClientDocuments(clientId: string): Promise<any[]> {
    try {
      const cases = await firstValueFrom(
        this.http.get<any[]>(`${this.api}/api/clients/${clientId}/cases`)
      );
      if (!cases?.length) return [];
      const docResults = await Promise.all(
        cases.map((c: any) =>
          firstValueFrom(
            this.http.get<any[]>(`${this.api}/api/documents`, { params: { case_id: c.id } })
          ).then((docs: any[]) =>
            docs.map((d: any) => ({
              ...d,
              case_file: d.case_file ?? { id: c.id, title: c.title, case_number: c.case_number },
            }))
          ).catch(() => [] as any[])
        )
      );
      return docResults.flat();
    } catch { return []; }
  }

  async fetchNotesByCaseIds(caseIds: string[]): Promise<any[]> {
    if (!caseIds.length) return [];
    const results = await Promise.all(
      caseIds.map(id =>
        firstValueFrom(
          this.http.get<any[]>(`${this.api}/api/notes`, { params: { case_id: id } })
        ).catch(() => [] as any[])
      )
    );
    return results.flat();
  }

  async fetchEventsByCaseIds(caseIds: string[]): Promise<any[]> {
    if (!caseIds.length) return [];
    const results = await Promise.all(
      caseIds.map(id =>
        firstValueFrom(
          this.http.get<any[]>(`${this.api}/api/calendar/events`, { params: { case_id: id } })
        ).catch(() => [] as any[])
      )
    );
    return results.flat();
  }

  async fetchTasksByCaseIds(caseIds: string[]): Promise<any[]> {
    if (!caseIds.length) return [];
    const results = await Promise.all(
      caseIds.map(id =>
        firstValueFrom(
          this.http.get<any[]>(`${this.api}/api/tasks`, { params: { case_id: id } })
        ).catch(() => [] as any[])
      )
    );
    return results.flat();
  }

  async createNote(caseId: string, content: string): Promise<any> {
    return firstValueFrom(
      this.http.post(`${this.api}/api/notes`, { case_id: caseId, content })
    );
  }

  async sendWhatsapp(toPhone: string, message: string): Promise<any> {
    return firstValueFrom(
      this.http.post(`${this.api}/api/whatsapp/send`, { to_phone: toPhone, message })
    );
  }

  async inviteClient(clientId: string): Promise<{ message: string; invite_token: string }> {
    return firstValueFrom(
      this.http.post<{ message: string; invite_token: string }>(
        `${this.api}/api/clients/${clientId}/invite`,
        {}
      )
    );
  }
}
