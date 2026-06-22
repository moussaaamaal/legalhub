import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments/environment';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface RagSource {
  source_type: string;
  source_id: string;
  relevance_score: number;
  source_label: string;
  excerpt: string;
  case_id?: string;
}

export interface AskResponse {
  answer: string;
  sources?: RagSource[];
  chunks_used?: number;
}

export interface SessionEntry {
  id: string;
  prompt: string;
  output: string;
  created_at: string;
}

export interface IndexStatus {
  case_id: string;
  is_indexed: boolean;
  total_chunks: number;
  chunks_by_source: Record<string, number>;
}

export interface FirmIndexStatus {
  firm_id: string;
  is_indexed: boolean;
  total_chunks: number;
  chunks_by_source: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class RagService {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  // ── Case-level RAG ───────────────────────────────────────────────────────

  async ingestCase(caseId: string): Promise<{ message: string; case_id: string }> {
    return firstValueFrom(
      this.http.post<{ message: string; case_id: string }>(
        `${this.api}/api/rag/ingest`,
        { case_id: caseId }
      )
    );
  }

  async ask(
    caseId: string,
    question: string,
    chatHistory: ChatMessage[] = []
  ): Promise<AskResponse> {
    return firstValueFrom(
      this.http.post<AskResponse>(`${this.api}/api/rag/ask`, {
        case_id:      caseId,
        question,
        chat_history: chatHistory,
      })
    );
  }

  async generateSessionTitle(question: string, answer: string): Promise<string | null> {
    const result = await firstValueFrom(
      this.http.post<{ title: string | null }>(`${this.api}/api/rag/session-title`, {
        question,
        answer,
      })
    );
    return result.title ?? null;
  }

  async getHistory(caseId: string, limit = 30): Promise<SessionEntry[]> {
    return firstValueFrom(
      this.http.get<SessionEntry[]>(`${this.api}/api/rag/history/${caseId}`, {
        params: { limit: String(limit) }
      })
    );
  }

  async getIndexStatus(caseId: string): Promise<IndexStatus> {
    return firstValueFrom(
      this.http.get<IndexStatus>(`${this.api}/api/rag/status/${caseId}`)
    );
  }

  async deleteIndex(caseId: string): Promise<{ message: string; case_id: string }> {
    return firstValueFrom(
      this.http.delete<{ message: string; case_id: string }>(
        `${this.api}/api/rag/index/${caseId}`
      )
    );
  }

  // ── Firm-level RAG ───────────────────────────────────────────────────────

  async ingestFirm(): Promise<{ message: string; scope: string }> {
    return firstValueFrom(
      this.http.post<{ message: string; scope: string }>(
        `${this.api}/api/rag/firm/ingest`,
        {}
      )
    );
  }

  async askFirm(question: string, chatHistory: ChatMessage[] = []): Promise<AskResponse> {
    return firstValueFrom(
      this.http.post<AskResponse>(`${this.api}/api/rag/firm/ask`, {
        question,
        chat_history: chatHistory,
      })
    );
  }

  async getFirmIndexStatus(): Promise<FirmIndexStatus> {
    return firstValueFrom(
      this.http.get<FirmIndexStatus>(`${this.api}/api/rag/firm/status`)
    );
  }
}
