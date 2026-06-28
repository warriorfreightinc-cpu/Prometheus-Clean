import { AfterViewChecked, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { ChatbbThreadMessage, PrometheusBrainApproval } from '../../../shared/types/models';
import { formatChatTimeLabel } from '../../../shared/time/chat-time-label';

type ConsoleBubble = {
  id: string;
  sender: 'assistant' | 'user' | 'system';
  text: string;
  label?: string;
  createdAt?: string | null;
};

@Component({
  selector: 'app-ai-matching-console',
  templateUrl: './ai-matching-console.component.html',
  styleUrls: ['./ai-matching-console.component.scss'],
})
export class AiMatchingConsoleComponent implements AfterViewChecked {
  @ViewChild('chatThreadRef') private chatThreadRef?: ElementRef<HTMLDivElement>;
  @ViewChild('importFileInput') private importFileInput?: ElementRef<HTMLInputElement>;

  @Input() matchingConsoleMessages: ConsoleBubble[] = [];
  @Input() chatbbMessages: ChatbbThreadMessage[] = [];
  @Input() chatbbLoading = false;
  @Input() chatbbError = '';
  @Input() chatbbPrompt = '';
  @Input() dispatchRoleLabel = 'posts';
  @Input() pendingBrainApprovals: PrometheusBrainApproval[] = [];

  @Output() chatbbPromptChange = new EventEmitter<string>();
  @Output() submitConsole = new EventEmitter<void>();
  @Output() importFileSelected = new EventEmitter<File>();
  @Output() approveBrainRequest = new EventEmitter<PrometheusBrainApproval>();
  @Output() rejectBrainRequest = new EventEmitter<PrometheusBrainApproval>();

  private lastRenderedMessageKey = '';

  ngAfterViewChecked(): void {
    const messageKey = this.currentMessageKey();
    if (messageKey === this.lastRenderedMessageKey) return;
    this.lastRenderedMessageKey = messageKey;
    this.scrollThreadToBottom();
  }

  updatePrompt(value: string): void {
    this.chatbbPromptChange.emit(value);
  }

  submit(): void {
    this.submitConsole.emit();
  }

  openImportPicker(): void {
    this.importFileInput?.nativeElement.click();
  }

  handleImportFileSelection(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.importFileSelected.emit(file);
    input.value = '';
  }

  handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    this.submit();
  }

  approve(approval: PrometheusBrainApproval): void {
    this.approveBrainRequest.emit(approval);
  }

  reject(approval: PrometheusBrainApproval): void {
    this.rejectBrainRequest.emit(approval);
  }

  trackByBubble(_: number, bubble: ConsoleBubble): string {
    return bubble.id;
  }

  trackByChatMessage(index: number, message: ChatbbThreadMessage): string {
    return `${message.createdAt}-${index}`;
  }

  formatTimestamp(value: string | Date | null | undefined, now = new Date()): string {
    return formatChatTimeLabel(value, now);
  }

  speakerLabel(sender: ConsoleBubble['sender'] | ChatbbThreadMessage['sender']): string {
    if (sender === 'user') {
      return 'You';
    }
    if (sender === 'system') {
      return 'System';
    }
    return 'Prometheus';
  }

  private currentMessageKey(): string {
    const matchingTail = this.matchingConsoleMessages.at(-1);
    const chatTail = this.chatbbMessages.at(-1);
    return [
      this.matchingConsoleMessages.length,
      matchingTail?.id ?? '',
      this.chatbbMessages.length,
      chatTail?.createdAt ?? '',
      this.chatbbLoading ? 'loading' : 'idle',
    ].join('|');
  }

  private scrollThreadToBottom(): void {
    const thread = this.chatThreadRef?.nativeElement;
    if (!thread) return;
    thread.scrollTop = thread.scrollHeight;
  }
}
