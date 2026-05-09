import {
  Component, Input, Output, EventEmitter,
  signal, computed, inject, OnDestroy,
} from '@angular/core';
import { NgClass } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

// ── Shared types ──────────────────────────────────────────────────────────────
interface VoiceExtracted {
  title?:     string;
  content?:   string;
  case_id?:   string;
  case_name?: string;
}
interface VoiceAssistantResp {
  status:    'missing' | 'complete';
  extracted?: VoiceExtracted;
  missing?:  string[];
  question?: string;
  message?:  string;
  note?:     Record<string, unknown>;
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

  private http = inject(HttpClient);

  // ── State ──────────────────────────────────────────────────────────────────
  isOpen         = signal(false);
  voiceRecording = signal(false);
  voicePaused    = signal(false);
  voiceSeconds   = signal(0);
  voiceTranscript = signal('');
  voiceThinking  = signal(false);
  voiceAiResponse = signal('');
  voiceSpeaking  = signal(false);
  voiceExtracted = signal<VoiceExtracted>({});
  voiceDone      = signal(false);

  hasExtracted = computed(() => {
    const e = this.voiceExtracted();
    return !!(e.title || e.content || e.case_id);
  });

  waveformBars = Array.from({ length: 24 }, (_, i) => {
    const h = [8, 16, 28, 20, 36, 14, 32, 24, 12, 30, 18, 38, 10, 26, 34, 16, 22, 32, 8, 28, 20, 14, 24, 18];
    return { h: h[i], delay: i * 50 };
  });

  private pausedTranscript   = '';
  private runPipelineOnEnd   = false;
  private recognition: any   = null;
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
    this.pausedTranscript  = '';
    this.runPipelineOnEnd  = false;
    this.recognition       = null;

    // Pre-fill the case when opened from a case page
    this.voiceExtracted.set(
      this.prefillCase
        ? { case_id: this.prefillCase.id, case_name: this.prefillCase.name }
        : {}
    );

    this.isOpen.set(true);
  }

  closeModal(): void {
    speechSynthesis.cancel();
    this.runPipelineOnEnd = false;
    this.recognition?.stop();
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

  // ── Recording ──────────────────────────────────────────────────────────────
  toggleVoiceRecording(): void {
    if (this.voiceRecording()) {
      this.runPipelineOnEnd = true;
      this.recognition?.stop();
      this.stopTimer();
      this.voiceRecording.set(false);
      this.voicePaused.set(false);
      return;
    }

    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { alert('Speech recognition is not supported in this browser.'); return; }

    this.voiceAiResponse.set('');
    this.voiceThinking.set(false);
    this.voiceSeconds.set(0);
    this.pausedTranscript = '';
    this.voiceTranscript.set('');
    this.runPipelineOnEnd = false;

    this.recognition = new SR();
    this.recognition.lang = 'en-US';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.onresult = (e: any) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      const prefix = this.pausedTranscript;
      this.voiceTranscript.set(prefix ? prefix + ' ' + t : t);
    };
    this.recognition.onend = () => {
      if (this.runPipelineOnEnd) {
        this.runPipelineOnEnd = false;
        if (this.voiceTranscript()) this.runVoicePipeline(this.voiceTranscript());
      }
    };
    this.recognition.onerror = () => { this.runPipelineOnEnd = false; this.voiceRecording.set(false); };
    this.recognition.start();
    this.startTimer();
    this.voiceRecording.set(true);
  }

  pauseVoiceRecording(): void {
    if (!this.voiceRecording()) return;
    if (this.voicePaused()) {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return;
      this.pausedTranscript = this.voiceTranscript();
      const rec = new SR();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      rec.onresult = (e: any) => {
        let t = '';
        for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
        const p = this.pausedTranscript;
        this.voiceTranscript.set(p ? p + ' ' + t : t);
      };
      rec.onend = () => {
        if (this.runPipelineOnEnd) { this.runPipelineOnEnd = false; if (this.voiceTranscript()) this.runVoicePipeline(this.voiceTranscript()); }
      };
      rec.onerror = () => { this.runPipelineOnEnd = false; };
      rec.start();
      this.recognition = rec;
      this.startTimer();
      this.voicePaused.set(false);
    } else {
      this.runPipelineOnEnd = false;
      this.pausedTranscript = this.voiceTranscript();
      this.recognition?.stop();
      this.stopTimer();
      this.voicePaused.set(true);
    }
  }

  discardVoiceRecording(): void {
    this.runPipelineOnEnd = false;
    this.recognition?.stop();
    this.stopTimer();
    speechSynthesis.cancel();
    this.voiceRecording.set(false);
    this.voicePaused.set(false);
    this.voiceSeconds.set(0);
    this.voiceTranscript.set('');
    this.voiceAiResponse.set('');
    this.voiceThinking.set(false);
    this.voiceSpeaking.set(false);
    this.pausedTranscript = '';
  }

  // ── AI pipeline ────────────────────────────────────────────────────────────
  private async runVoicePipeline(transcript: string): Promise<void> {
    this.voiceThinking.set(true);
    this.voiceAiResponse.set('');
    this.voiceTranscript.set('');
    try {
      const data = await firstValueFrom(
        this.http.post<VoiceAssistantResp>(
          `${environment.apiUrl}/api/ai/voice-assistant`,
          { transcript, extracted: this.voiceExtracted() }
        )
      );
      this.voiceThinking.set(false);
      this.voiceExtracted.set(data.extracted ?? {});

      if (data.status === 'missing') {
        const q = data.question ?? '';
        this.voiceAiResponse.set(q);
        this.speakText(q);
      } else {
        const msg = data.message ?? 'Note saved successfully!';
        this.voiceAiResponse.set(msg);
        this.voiceDone.set(true);
        this.speakText(msg);
        this.saved.emit(data.note ?? {});
      }
    } catch {
      this.voiceThinking.set(false);
      this.voiceAiResponse.set('Could not reach the AI service. Please try again.');
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
