import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';
import { Case } from '../models';

@Injectable({ providedIn: 'root' })
export class CaseService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  private casesSignal = signal<Case[]>([]);
  cases = this.casesSignal.asReadonly();

  // ── Mapper réponse backend → Case local ───────────────────
  private _map(raw: Record<string, unknown>): Case {
    const client = raw['client'] as Record<string, string> | null;
    return {
      id:          String(raw['id']),
      caseNumber:  String(raw['case_number'] ?? ''),
      title:       String(raw['title'] ?? ''),
      client:      client
                     ? `${client['first_name']} ${client['last_name']}`.trim()
                     : String(raw['client_id'] ?? ''),
      clientId:    String(raw['client_id'] ?? ''),
      type:        String(raw['case_type'] ?? ''),
      status:      String(raw['status'] ?? 'NEW'),
      priority:    String(raw['priority'] ?? 'NORMAL'),
      assignedTo:  String(raw['lawyer_id'] ?? ''),
      openDate:    raw['created_at'] ? new Date(String(raw['created_at'])) : new Date(),
      nextHearing: raw['first_hearing_date']
                     ? new Date(String(raw['first_hearing_date']))
                     : undefined,
      court:       String(raw['court_name'] ?? '') || undefined,
      description: String(raw['description'] ?? '') || undefined,
      tags:        Array.isArray(raw['tags']) ? raw['tags'] as string[] : [],
    };
  }

  // ── Charger tous les dossiers depuis l'API ─────────────────
  async loadCases(filters?: { status?: string; priority?: string; case_type?: string }): Promise<void> {
    const params: Record<string, string> = {};
    if (filters?.status)    params['status']    = filters.status;
    if (filters?.priority)  params['priority']  = filters.priority;
    if (filters?.case_type) params['case_type'] = filters.case_type;

    const raw = await firstValueFrom(
      this.http.get<Record<string, unknown>[]>(`${this.api}/api/cases`, { params })
    );
    this.casesSignal.set(raw.map(r => this._map(r)));
  }

  getCaseById(id: string): Case | undefined {
    return this.casesSignal().find(c => c.id === id);
  }

  getActiveCases(): Case[] {
    const activeStatuses = new Set(['NEW', 'INVESTIGATION', 'PRE_TRIAL', 'TRIAL', 'APPEAL']);
    return this.casesSignal().filter(c => activeStatuses.has(c.status));
  }

  async addCase(payload: Record<string, unknown>): Promise<void> {
    const raw = await firstValueFrom(
      this.http.post<Record<string, unknown>>(`${this.api}/api/cases`, payload)
    );
    this.casesSignal.update(list => [this._map(raw), ...list]);
  }

  async updateCase(id: string, payload: Record<string, unknown>): Promise<void> {
    const raw = await firstValueFrom(
      this.http.put<Record<string, unknown>>(`${this.api}/api/cases/${id}`, payload)
    );
    const updated = this._map(raw);
    this.casesSignal.update(list => list.map(c => c.id === id ? updated : c));
  }

  async deleteCase(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/api/cases/${id}`));
    this.casesSignal.update(list => list.filter(c => c.id !== id));
  }

  async updateCaseStatus(id: string, status: string): Promise<void> {
    await firstValueFrom(
      this.http.patch(`${this.api}/api/cases/${id}/status`, { status })
    );
  }

  async fetchCaseById(id: string): Promise<Case> {
    const raw = await firstValueFrom(
      this.http.get<Record<string, unknown>>(`${this.api}/api/cases/${id}`)
    );
    return this._map(raw);
  }

  async fetchTimeline(caseId: string): Promise<Record<string, unknown>[]> {
    return firstValueFrom(
      this.http.get<Record<string, unknown>[]>(`${this.api}/api/cases/${caseId}/timeline`)
    );
  }
}
