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
  uploader_name?:        string | null;
  uploader_avatar_url?:  string | null;
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

export interface DocumentRequest {
  id:          string;
  firm_id:     string;
  case_id:     string;
  client_id?:  string | null;
  requested_by: string;
  description: string;
  category?:   string | null;
  deadline?:   string | null;
  status:      'PENDING' | 'FULFILLED' | 'CANCELLED';
  created_at:  string;
  case_file?:  { id: string; title: string; case_number: string } | null;
}

// ── Voice-note AI response types ──────────────────────────────────────────────

export interface VoiceNoteNeedsInfo {
  status:          'needs_info';
  transcription:   string;
  question:        string;
  missing_fields:  string[];
  partial_data:    Record<string, string>;
}

export interface VoiceNoteConfirm {
  status:        'confirm';
  transcription: string;
  note_data: {
    title:      string;
    content:    string;
    case_title: string;
  };
}

export interface VoiceNoteSaved {
  status:  'saved';
  message: string;
  note:    Record<string, unknown>;
}

export type VoiceNoteAIResponse = VoiceNoteNeedsInfo | VoiceNoteConfirm | VoiceNoteSaved;

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

  async uploadFile(file: File, caseId: string, originalName?: string): Promise<RawDoc> {
    const form = new FormData();
    form.append('file', file);
    form.append('case_id', caseId);
    if (originalName) form.append('original_name', originalName);
    return firstValueFrom(
      this.http.post<RawDoc>(`${this.api}/api/documents/upload`, form)
    );
  }

  // ── status is a query param on the backend, NOT a body field ──────────────
  async updateStatus(id: string, status: DocStatus): Promise<RawDoc> {
    return firstValueFrom(
      this.http.patch<RawDoc>(
        `${this.api}/api/documents/${id}/status`,
        null,
        { params: { status } }
      )
    );
  }

  async deleteDocument(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.api}/api/documents/${id}`));
  }

  async shareDocument(id: string): Promise<void> {
    await firstValueFrom(this.http.post(`${this.api}/api/documents/${id}/share`, {}));
  }

  async aiSummarize(id: string, force = false): Promise<{ summary: string; ai_summary_id: string; cached: boolean }> {
    const params: Record<string, string> | undefined = force ? { force: 'true' } : undefined;
    return firstValueFrom(
      this.http.post<{ summary: string; ai_summary_id: string; cached: boolean }>(
        `${this.api}/api/documents/${id}/ai-summarize`,
        {},
        { params }
      )
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

  // ── Voice Note AI (multi-step STT + LLM pipeline) ────────────────────────

  async voiceNoteAI(
    file: File,
    partialData?: Record<string, string>,
    priorTranscriptions?: string[],
  ): Promise<VoiceNoteAIResponse> {
    const form = new FormData();
    form.append('file', file);
    if (partialData && Object.keys(partialData).length > 0) {
      form.append('partial_data', JSON.stringify(partialData));
    }
    if (priorTranscriptions && priorTranscriptions.length > 0) {
      form.append('prior_transcriptions', JSON.stringify(priorTranscriptions));
    }
    return firstValueFrom(
      this.http.post<VoiceNoteAIResponse>(`${this.api}/api/documents/voice-note-ai`, form)
    );
  }

  async voiceNoteAIConfirm(noteData: { title: string; content: string; case_title: string }): Promise<VoiceNoteSaved> {
    const form = new FormData();
    form.append('note_data', JSON.stringify(noteData));
    return firstValueFrom(
      this.http.post<VoiceNoteSaved>(`${this.api}/api/documents/voice-note-ai/confirm`, form)
    );
  }

  // ── Document Requests ─────────────────────────────────────────────────────

  async createDocumentRequest(data: {
    case_id:     string;
    description: string;
    category?:   string;
    deadline?:   string;
  }): Promise<DocumentRequest> {
    return firstValueFrom(
      this.http.post<DocumentRequest>(`${this.api}/api/documents/request`, data)
    );
  }

  async listDocumentRequests(caseId?: string): Promise<DocumentRequest[]> {
    const params: Record<string, string> = {};
    if (caseId) params['case_id'] = caseId;
    return firstValueFrom(
      this.http.get<DocumentRequest[]>(`${this.api}/api/documents/requests`, { params })
    );
  }

  async cancelDocumentRequest(requestId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.api}/api/documents/requests/${requestId}`)
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

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
