import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export interface RawNote {
  id:            string;
  firm_id:       string;
  case_id:       string;
  lawyer_id:     string;
  title?:        string;
  content:       string;
  is_voice_note?: boolean;
  created_at:    string;
  app_user?:     { id: string; full_name: string };
}

export interface RawTask {
  id:          string;
  firm_id:     string;
  case_id?:    string | null;
  title:       string;
  description?: string | null;
  category?:   string | null;
  priority:    string;
  status:      string;
  due_date?:   string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  created_at:  string;
  reminder_at?: string | null;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  async listTasks(filters?: { case_id?: string; status?: string }): Promise<RawTask[]> {
    const params: Record<string, string> = {};
    if (filters?.case_id) params['case_id'] = filters.case_id;
    if (filters?.status)  params['status']  = filters.status;
    return firstValueFrom(
      this.http.get<RawTask[]>(`${this.api}/api/tasks`, { params })
    );
  }

  async createTask(data: {
    title:        string;
    case_id?:     string;
    description?: string;
    category?:    string;
    priority?:    string;
    due_date?:    string;
    assigned_to?: string;
  }): Promise<RawTask> {
    return firstValueFrom(
      this.http.post<RawTask>(`${this.api}/api/tasks`, data)
    );
  }

  async updateStatus(id: string, status: string): Promise<RawTask> {
    return firstValueFrom(
      this.http.patch<RawTask>(`${this.api}/api/tasks/${id}/status`, { status })
    );
  }

  async deleteTask(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/api/tasks/${id}`));
  }

  // ── Notes ─────────────────────────────────────────────────

  async listNotes(filters?: { case_id?: string }): Promise<RawNote[]> {
    const params: Record<string, string> = {};
    if (filters?.case_id) params['case_id'] = filters.case_id;
    return firstValueFrom(
      this.http.get<RawNote[]>(`${this.api}/api/notes`, { params })
    );
  }

  async createNote(data: { case_id: string; title?: string; content: string }): Promise<RawNote> {
    return firstValueFrom(
      this.http.post<RawNote>(`${this.api}/api/notes`, data)
    );
  }

  async updateNote(id: string, title: string | undefined, content: string): Promise<RawNote> {
    return firstValueFrom(
      this.http.put<RawNote>(`${this.api}/api/notes/${id}`, { title, content })
    );
  }

  async deleteNote(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/api/notes/${id}`));
  }
}
