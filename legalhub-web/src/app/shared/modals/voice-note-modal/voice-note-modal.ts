import {
  Component, Input, Output, EventEmitter,
  signal, computed, OnDestroy,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { environment } from '../../../environments/environment';

interface VoiceExtracted {
  title?:     string;
  content?:   string;
  case_id?:   string;
  case_name?: string;
}

interface ConfirmData {
  title:      string;
  content:    string;
  case_title: string;
}

@Component({
  selector:    'app-voice-note-modal',
  standalone:  true,
  imports:     [NgClass],
  templateUrl: './voice-note-modal.html',
})
export class VoiceNoteModal implements OnDestroy {

  /** When provided the case is pre-filled — user only needs to say title + content. */
  @Input() prefillCase?: { id: string; name: string };

  /** Emitted after the note is successfully saved. */
  @Output() saved = new EventEmitter<Record<string, unknown>>();

  // ── State ──────────────────────────────────────────────────────────────────
  isOpen           = signal(false);
  voiceRecording   = signal(false);
  voicePaused      = signal(false);
  voiceSeconds     = signal(0);
  voiceTranscript  = signal('');
  voiceThinking    = signal(false);
  voiceAiResponse  = signal('');
  voiceSpeaking    = signal(false);
  voiceExtracted   = signal<VoiceExtracted>({});
  voiceDone        = signal(false);
  voiceConfirmData = signal<ConfirmData | null>(null);

  hasExtracted = computed(() => {
    const e = this.voiceExtracted();
    return !!(e.title || e.content || e.case_id || e.case_name);
  });

  waveformBars = Array.from({ length: 24 }, (_, i) => {
    const h = [8, 16, 28, 20, 36, 14, 32, 24, 12, 30, 18, 38, 10, 26, 34, 16, 22, 32, 8, 28, 20, 14, 24, 18];
    return { h: h[i], delay: i * 50 };
  });

  private mediaRecorder:       MediaRecorder | null   = null;
  private audioChunks:         Blob[]                 = [];
  private activeStream:        MediaStream | null      = null;
  private partialData:         Record<string, unknown> = {};
  private priorTranscriptions: string[]               = [];
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  // ── Public API ─────────────────────────────────────────────────────────────
  openModal(): void {
    this.voiceTranscript.set('');
    this.voiceAiResponse.set('');
    this.voiceThinking.set(false);
    this.voiceSpeaking.set(false);
    this.voiceRecording.set(false);
    this.voicePaused.set(false);
    this.voiceSeconds.set(0);
    this.voiceDone.set(false);
    this.voiceConfirmData.set(null);
    this.partialData         = {};
    this.priorTranscriptions = [];
    this.mediaRecorder       = null;
    this.audioChunks         = [];

    this.voiceExtracted.set(
      this.prefillCase
        ? { case_id: this.prefillCase.id, case_name: this.prefillCase.name }
        : {}
    );

    this.isOpen.set(true);
  }

  closeModal(): void {
    speechSynthesis.cancel();
    this._stopStream();
    this.stopTimer();
    this.voiceRecording.set(false);
    this.voicePaused.set(false);
    this.voiceSpeaking.set(false);
    this.voiceSeconds.set(0);
    this.isOpen.set(false);
  }

  ngOnDestroy(): void { this.closeModal(); }

  // ── Timer ──────────────────────────────────────────────────────────────────
  fmtSeconds(s: number): string {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  private startTimer(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => this.voiceSeconds.update(s => s + 1), 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
  }

  private _stopStream(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = null;
      this.mediaRecorder.stop();
    }
    this.activeStream?.getTracks().forEach(t => t.stop());
    this.activeStream = null;
  }

  // ── Recording ──────────────────────────────────────────────────────────────
  toggleVoiceRecording(): void {
    if (this.voiceRecording()) {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop(); // onstop → pipeline
      }
      this.stopTimer();
      this.voiceRecording.set(false);
      this.voicePaused.set(false);
      return;
    }

    // Start fresh recording — clear confirm state if re-recording
    this.voiceConfirmData.set(null);
    this.voiceAiResponse.set('');
    this.voiceThinking.set(false);
    this.voiceSeconds.set(0);
    this.audioChunks = [];

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        this.activeStream  = stream;
        this.mediaRecorder = new MediaRecorder(stream);

        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.onstop = () => {
          this.activeStream?.getTracks().forEach(t => t.stop());
          this.activeStream = null;
          if (this.audioChunks.length > 0) {
            const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
            const blob = new Blob(this.audioChunks, { type: mimeType });
            this.runVoicePipeline(blob);
          }
        };

        this.mediaRecorder.start();
        this.startTimer();
        this.voiceRecording.set(true);
      })
      .catch(() => alert('Microphone access is required to use voice notes.'));
  }

  pauseVoiceRecording(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

    try {
      if (this.voicePaused()) {
        if (this.mediaRecorder.state === 'paused') this.mediaRecorder.resume();
        this.startTimer();
        this.voicePaused.set(false);
      } else {
        if (this.mediaRecorder.state === 'recording') this.mediaRecorder.pause();
        this.stopTimer();
        this.voicePaused.set(true);
      }
    } catch {
      // pause/resume not supported — update UI state only
      if (this.voicePaused()) { this.startTimer(); this.voicePaused.set(false); }
      else                    { this.stopTimer();  this.voicePaused.set(true);  }
    }
  }

  discardVoiceRecording(): void {
    speechSynthesis.cancel();
    this.audioChunks = [];
    if (this.mediaRecorder) {
      this.mediaRecorder.onstop = null;
      this._stopStream();
      this.mediaRecorder = null;
    }
    this.stopTimer();
    this.voiceRecording.set(false);
    this.voicePaused.set(false);
    this.voiceSeconds.set(0);
    this.voiceTranscript.set('');
    this.voiceAiResponse.set('');
    this.voiceThinking.set(false);
    this.voiceSpeaking.set(false);
    this.voiceConfirmData.set(null);
    this.partialData         = {};
    this.priorTranscriptions = [];
    this.voiceExtracted.set(
      this.prefillCase
        ? { case_id: this.prefillCase.id, case_name: this.prefillCase.name }
        : {}
    );
  }

  // ── Confirm & save ─────────────────────────────────────────────────────────
  async confirmNote(): Promise<void> {
    const nd = this.voiceConfirmData();
    if (!nd) return;
    this.voiceThinking.set(true);
    try {
      const formData = new FormData();
      formData.append('note_data', JSON.stringify(nd));

      const token = localStorage.getItem('access_token') ?? sessionStorage.getItem('access_token');
      const res = await fetch(`${environment.apiUrl}/api/documents/voice-note-ai/confirm`, {
        method:  'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body:    formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);

      // Parse the stored "**title**\ncontent" format
      const rawContent  = (data.note?.['content'] as string) ?? '';
      const titleMatch  = rawContent.match(/^\*\*(.+?)\*\*\n?/);
      const noteContent = titleMatch ? rawContent.slice(titleMatch[0].length) : rawContent;

      this.voiceExtracted.update(prev => ({
        title:    prev.title,
        content:  noteContent || prev.content,
        case_id:  (data.note?.['case_id'] as string) || prev.case_id,
        case_name: prev.case_name,
      }));

      this.voiceConfirmData.set(null);
      this.voiceThinking.set(false);
      this.voiceDone.set(true);
      const msg = data.message ?? 'Note saved successfully!';
      this.voiceAiResponse.set(msg);
      this.speakText(msg);
      this.saved.emit(data.note ?? {});
    } catch {
      this.voiceThinking.set(false);
      this.voiceAiResponse.set('Could not save the note. Please try again.');
    }
  }

  // ── AI pipeline ────────────────────────────────────────────────────────────
  private async runVoicePipeline(audioBlob: Blob): Promise<void> {
    this.voiceThinking.set(true);
    this.voiceAiResponse.set('');
    try {
      const ext = audioBlob.type.includes('ogg') ? 'ogg'
                : audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const formData = new FormData();
      formData.append('file', audioBlob, `voice.${ext}`);

      // Build partial_data: merge confirmed fields + prefill case
      // Backend now injects this into the LLM prompt via pre_filled_section
      const sendPartial: Record<string, unknown> = { ...this.partialData };
      if (this.prefillCase && !sendPartial['case_identifier']) {
        sendPartial['case_identifier'] = this.prefillCase.name;
      }
      if (Object.keys(sendPartial).length > 0) {
        formData.append('partial_data', JSON.stringify(sendPartial));
      }

      // Send accumulated transcriptions from previous turns
      if (this.priorTranscriptions.length > 0) {
        formData.append('prior_transcriptions', JSON.stringify(this.priorTranscriptions));
      }

      const token = localStorage.getItem('access_token') ?? sessionStorage.getItem('access_token');
      const res = await fetch(`${environment.apiUrl}/api/documents/voice-note-ai`, {
        method:  'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body:    formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);

      // Show latest transcription and accumulate for next turn
      if (data.transcription) {
        this.voiceTranscript.set(data.transcription);
        this.priorTranscriptions.push(data.transcription);
      }

      if (data.status === 'confirm') {
        const nd: ConfirmData = data.note_data;
        this.voiceExtracted.set({
          title:     nd.title,
          content:   nd.content,
          case_name: nd.case_title,
          case_id:   this.prefillCase?.id,
        });
        this.voiceConfirmData.set(nd);
        this.voiceThinking.set(false);
        const msg = `Note ready: "${nd.title}" linked to case "${nd.case_title}". Tap Save Note to confirm.`;
        this.voiceAiResponse.set(msg);
        this.speakText(msg);

      } else {
        // needs_info — merge partial data from backend and update extracted display
        this.partialData = data.partial_data ?? {};
        const pd = this.partialData;
        this.voiceExtracted.set({
          title:     (pd['title']           as string) || undefined,
          content:   (pd['content']         as string) || undefined,
          case_name: (pd['case_identifier'] as string) || this.prefillCase?.name,
          case_id:   this.prefillCase?.id,
        });
        this.voiceThinking.set(false);
        const q = data.question ?? 'Please provide more details.';
        this.voiceAiResponse.set(q);
        this.speakText(q);
      }
    } catch (err: any) {
      this.voiceThinking.set(false);
      const msg = err?.message || err?.error?.detail || 'Could not reach the AI service. Please try again.';
      this.voiceAiResponse.set(msg);
    }
  }

  // ── TTS ────────────────────────────────────────────────────────────────────
  private speakText(text: string): void {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const doSpeak = () => {
      const utt  = new SpeechSynthesisUtterance(text);
      utt.lang   = 'en-US';
      utt.rate   = 1.0;
      utt.pitch  = 1.0;
      const vs = speechSynthesis.getVoices();
      const v  =
        vs.find(v => v.lang === 'en-US' && v.localService) ||
        vs.find(v => v.lang.startsWith('en-') && v.localService) ||
        vs.find(v => v.lang === 'en-US') ||
        vs.find(v => v.lang.startsWith('en-'));
      if (v) utt.voice = v;
      utt.onstart = () => this.voiceSpeaking.set(true);
      utt.onend   = () => this.voiceSpeaking.set(false);
      utt.onerror = () => this.voiceSpeaking.set(false);
      speechSynthesis.speak(utt);
    };
    const vs = speechSynthesis.getVoices();
    if (vs.length > 0) doSpeak();
    else speechSynthesis.onvoiceschanged = () => { speechSynthesis.onvoiceschanged = null; doSpeak(); };
  }
}
