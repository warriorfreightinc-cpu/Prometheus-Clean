import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BrainApiService } from './brain-api.service';
import { PrometheusBrainPromptRequest } from '../../shared/types/models';

describe('BrainApiService', () => {
  let service: BrainApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(BrainApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('posts prompts to the Brain endpoint', () => {
    const payload: PrometheusBrainPromptRequest = {
      prompt: 'anything out of Memphis, TN?',
      source: 'matching',
    };
    const response = {
      handled: true,
      intent: 'search',
      answer: 'I found 2 hazmat loads.',
    };

    service.sendPrompt(payload).subscribe((result) => {
      expect(result).toEqual(response);
    });

    const req = http.expectOne('brain/prompt');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(response);
  });

  it('patches approval accept requests', () => {
    const response = {
      _id: 'approval-1',
      companyId: 'company-1',
      requestedBy: 'user-1',
      role: 'carrier',
      actionType: 'sendEmail',
      label: 'Approve email draft',
      summary: 'Send this email?',
      riskNote: 'Email is not sent until approved.',
      payload: {},
      status: 'approved' as const,
    };

    service.approve('approval-1').subscribe((result) => {
      expect(result).toEqual(response);
    });

    const req = http.expectOne('brain/approvals/approval-1/approve');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({});
    req.flush(response);
  });

  it('patches approval reject requests', () => {
    const response = {
      _id: 'approval-1',
      companyId: 'company-1',
      requestedBy: 'user-1',
      role: 'carrier',
      actionType: 'sendEmail',
      label: 'Approve email draft',
      summary: 'Send this email?',
      riskNote: 'Email is not sent until approved.',
      payload: {},
      status: 'rejected' as const,
    };

    service.reject('approval-1').subscribe((result) => {
      expect(result).toEqual(response);
    });

    const req = http.expectOne('brain/approvals/approval-1/reject');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({});
    req.flush(response);
  });
});
