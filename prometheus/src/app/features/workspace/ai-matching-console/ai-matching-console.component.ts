import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ChatbbThreadMessage } from '../../../shared/types/models';
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
export class AiMatchingConsoleComponent {
  @Input() matchingConsoleMessages: ConsoleBubble[] = [];
  @Input() chatbbMessages: ChatbbThreadMessage[] = [];
  @Input() chatbbLoading = false;
  @Input() chatbbError = '';
  @Input() chatbbPrompt = '';
  @Input() dispatchRoleLabel = 'posts';

  @Output() chatbbPromptChange = new EventEmitter<string>();
  @Output() submitConsole = new EventEmitter<void>();

  updatePrompt(value: string): void {
    this.chatbbPromptChange.emit(value);
  }

  submit(): void {
    this.submitConsole.emit();
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
}
