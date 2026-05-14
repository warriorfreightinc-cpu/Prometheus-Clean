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

  @Input() matchingConsoleMessages: ConsoleBubble[] = [];
  @Input() chatbbMessages: ChatbbThreadMessage[] = [];
  @Input() chatbbLoading = false;
  @Input() chatbbError = '';
  @Input() chatbbPrompt = '';
  @Input() dispatchRoleLabel = 'posts';
  @Input() pendingBrainApprovals: PrometheusBrainApproval[] = [];

  @Output() chatbbPromptChange = new EventEmitter<string>();
  @Output() submitConsole = new EventEmitter<void>();
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
