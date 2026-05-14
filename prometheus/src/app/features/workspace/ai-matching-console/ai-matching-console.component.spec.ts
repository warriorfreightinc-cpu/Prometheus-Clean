import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { PrometheusBrainApproval } from '../../../shared/types/models';
import { AiMatchingConsoleComponent } from './ai-matching-console.component';

describe('AiMatchingConsoleComponent time labels', () => {
  it('keeps the matching console as a chat-only surface', () => {
    const component = new AiMatchingConsoleComponent() as any;

    expect(component.openDirectRoom).toBeUndefined();
    expect(component.openAnnouncementMatch).toBeUndefined();
    expect(component.refreshMatches).toBeUndefined();
    expect(component.runChatbbAction).toBeUndefined();
  });

  it('formats chat message time with clock and age', () => {
    const component = new AiMatchingConsoleComponent();
    const now = new Date(2026, 3, 30, 15, 41, 0);
    const value = new Date(2026, 3, 30, 15, 33, 0);

    expect(component.formatTimestamp(value.toISOString(), now)).toBe('3:33 PM | 8 min ago');
  });

  it('renders pending Brain approval actions and emits approve or reject', async () => {
    await TestBed.configureTestingModule({
      declarations: [AiMatchingConsoleComponent],
      imports: [FormsModule],
    }).compileComponents();
    const fixture: ComponentFixture<AiMatchingConsoleComponent> = TestBed.createComponent(AiMatchingConsoleComponent);
    const component = fixture.componentInstance;
    const approval: PrometheusBrainApproval = {
      _id: 'approval-1',
      companyId: 'company-1',
      requestedBy: 'user-1',
      role: 'carrier',
      actionType: 'sendEmail',
      label: 'Approve email draft',
      summary: 'Prometheus drafted an email.',
      riskNote: 'Email is not sent until approved.',
      payload: {},
      status: 'pending',
    };
    spyOn(component.approveBrainRequest, 'emit');
    spyOn(component.rejectBrainRequest, 'emit');

    component.pendingBrainApprovals = [approval];
    fixture.detectChanges();

    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.brain-approval-actions button') as NodeListOf<HTMLButtonElement>
    );
    expect(fixture.nativeElement.textContent).toContain('Approve email draft');
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(['Approve', 'Reject']);

    buttons[0].click();
    buttons[1].click();

    expect(component.approveBrainRequest.emit).toHaveBeenCalledWith(approval);
    expect(component.rejectBrainRequest.emit).toHaveBeenCalledWith(approval);
  });

  it('keeps the newest chat content in view when messages change', async () => {
    await TestBed.configureTestingModule({
      declarations: [AiMatchingConsoleComponent],
      imports: [FormsModule],
    }).compileComponents();
    const fixture: ComponentFixture<AiMatchingConsoleComponent> = TestBed.createComponent(AiMatchingConsoleComponent);
    const component = fixture.componentInstance;
    component.matchingConsoleMessages = [
      { id: 'm-1', sender: 'assistant', label: 'Prometheus', text: 'Morning scan is ready.' },
    ];
    fixture.detectChanges();
    const scrollSpy = spyOn<any>(component, 'scrollThreadToBottom').and.callThrough();

    component.matchingConsoleMessages = [
      ...component.matchingConsoleMessages,
      { id: 'm-2', sender: 'user', label: 'You', text: 'Post my truck in Chicago.' },
    ];
    fixture.detectChanges();

    expect(scrollSpy).toHaveBeenCalled();
  });
});
