import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export type DocStatus   = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';
export type DocCategory = 'CONTRACT' | 'COURT_DOC' | 'EVIDENCE' | 'FINANCIAL' | 'CLIENT_DOC' | 'VOICE_TRANSCRIPT' | 'OTHER';

export interface RawDoc {
  id:                    string;
  firm_id:               string;
  case_id:               string;
  file_name:             string;
  file_type:             'PDF' | 'WORD' | 'IMAGE' | 'OTHER';
  file_size_mb:          number;
  storage_url:           string;
  category:              DocCategory;
  status:                DocStatus;
  uploaded_by:           string;
  created_at:            string;
  reviewed_by?:          string | null;
  reviewed_at?:          string | null;
  is_shared_with_client: boolean;
  ai_categorized?:       boolean | null;
}

// Kept for backward compatibility with case-detail page
export interface DocEntry {
  id:        string;
  name:      string;
  size:      string;
  ago:       string;
  iconBg:    string;
  iconColor: string;
  icon:      string;
  url:       string;
}

@Injectable({ providedIn: 'root' })
export class DocumentService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  async listDocuments(filters?: { case_id?: string; category?: string; status?: string }): Promise<RawDoc[]> {
    const params: Record<string, string> = {};
    if (filters?.case_id)  params['case_id']  = filters.case_id;
    if (filters?.category) params['category'] = filters.category;
    if (filters?.status)   params['status']   = filters.status;
    return firstValueFrom(
      this.http.get<RawDoc[]>(`${this.api}/api/documents`, { params })
    );
  }

  // Backward compat for case-detail page
  async listForCase(caseId: string): Promise<DocEntry[]> {
    const raw = await this.listDocuments({ case_id: caseId });
    return raw.map(r => this._mapToEntry(r));
  }

  async uploadFile(file: File, caseId: string): Promise<RawDoc> {
    const form = new FormData();
    form.append('file', file);
    form.append('case_id', caseId);
    return firstValueFrom(
      this.http.post<RawDoc>(`${this.api}/api/documents/upload`, form)
    );
  }

  async uploadVoiceNote(file: File, caseId: string): Promise<{ document: RawDoc; transcript: string | null }> {
    const form = new FormData();
    form.append('file', file);
    form.append('case_id', caseId);
    return firstValueFrom(
      this.http.post<{ document: RawDoc; transcript: string | null }>(`${this.api}/api/documents/voice-note`, form)
    );
  }

  async updateStatus(id: string, status: DocStatus): Promise<RawDoc> {
    return firstValueFrom(
      this.http.patch<RawDoc>(`${this.api}/api/documents/${id}/status`, { status })
    );
  }

  async deleteDocument(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/api/documents/${id}`));
  }

  async shareDocument(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/api/documents/${id}/share`, {}));
  }

  async aiSummarize(id: string): Promise<{ summary: string; ai_summary_id: string }> {
    return firstValueFrom(
      this.http.post<{ summary: string; ai_summary_id: string }>(`${this.api}/api/documents/${id}/ai-summarize`, {})
    );
  }

  async downloadFile(doc: { name: string; url: string }): Promise<void> {
    try {
      const res  = await fetch(doc.url);
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = doc.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(doc.url, '_blank');
    }
  }

  getTypeStyle(fileType: string): { iconBg: string; iconColor: string; icon: string; typeBg: string; typeColor: string } {
    const map: Record<string, { iconBg: string; iconColor: string; icon: string; typeBg: string; typeColor: string }> = {
      PDF:   { iconBg: 'bg-red-100',    iconColor: 'text-red-600',    icon: 'fa-solid fa-file-pdf',   typeBg: 'bg-red-100',    typeColor: 'text-red-700' },
      WORD:  { iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   icon: 'fa-solid fa-file-word',  typeBg: 'bg-blue-100',   typeColor: 'text-blue-700' },
      IMAGE: { iconBg: 'bg-purple-100', iconColor: 'text-purple-600', icon: 'fa-solid fa-file-image', typeBg: 'bg-purple-100', typeColor: 'text-purple-700' },
      OTHER: { iconBg: 'bg-gray-100',   iconColor: 'text-gray-600',   icon: 'fa-solid fa-file',       typeBg: 'bg-gray-100',   typeColor: 'text-gray-700' },
    };
    return map[fileType] ?? map['OTHER'];
  }

  timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 60)  return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24)  return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  private _mapToEntry(raw: RawDoc): DocEntry {
    const s = this.getTypeStyle(raw.file_type);
    return {
      id:        raw.id,
      name:      raw.file_name,
      size:      `${(raw.file_size_mb ?? 0).toFixed(1)} MB`,
      ago:       this.timeAgo(raw.created_at),
      iconBg:    s.iconBg,
      iconColor: s.iconColor,
      icon:      s.icon,
      url:       raw.storage_url ?? '',
    };
  }
}
