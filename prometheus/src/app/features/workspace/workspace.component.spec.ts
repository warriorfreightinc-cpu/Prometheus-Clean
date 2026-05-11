import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { BrainApiService } from '../../core/api/brain-api.service';
import { ChatbbApiService } from '../../core/api/chatbb-api.service';
import { LoadsApiService } from '../../core/api/loads-api.service';
import { MatchingApiService } from '../../core/api/matching-api.service';
import { LocationApiService } from '../../core/api/location-api.service';
import { MessagesApiService } from '../../core/api/messages-api.service';
import { PostsApiService } from '../../core/api/posts-api.service';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { PrometheusSocketService } from '../../core/realtime/prometheus-socket.service';
import { DispatchIntakeService } from './dispatch-intake.service';
import { WorkspaceComponent } from './workspace.component';
import { AuthUser } from '../../shared/types/models';

describe('WorkspaceComponent workspace tabs', () => {
  const createComponent = (overrides: Record<string, any> = {}): WorkspaceComponent => {
    const socketEvents = overrides['socketEvents'] ?? new Subject<any>();
    const socket = overrides['socket'] ?? {
      connect: jasmine.createSpy('connect'),
      notify$: socketEvents.asObservable(),
    };

    return new WorkspaceComponent(
      new FormBuilder(),
      overrides['session'] ?? {} as any,
      overrides['postsApi'] ?? {} as any,
      overrides['matchingApi'] ?? {} as any,
      overrides['brainApi'] ?? {
        sendPrompt: jasmine.createSpy('sendPrompt').and.returnValue(of({
          handled: true,
          intent: 'generalTransportation',
          answer: 'Prometheus Brain is ready.',
        })),
        approve: jasmine.createSpy('approve').and.returnValue(of({})),
        reject: jasmine.createSpy('reject').and.returnValue(of({})),
        updateSettings: jasmine.createSpy('updateSettings').and.returnValue(of({})),
      } as any,
      overrides['loadsApi'] ?? {} as any,
      overrides['messagesApi'] ?? {
        updateBookingWorkflow: jasmine.createSpy('updateBookingWorkflow').and.returnValue(of({})),
        getRoomIntegrationChoices: jasmine.createSpy('getRoomIntegrationChoices').and.returnValue(of({ setup: [], tracking: [] })),
        executeRoomIntegration: jasmine.createSpy('executeRoomIntegration').and.callFake((payload: any) => {
          const label = payload.label || payload.provider;
          const kind = payload.category === 'setup' ? 'setup' : 'tracking';
          return of({
            status: 'staged',
            mode: 'placeholder',
            provider: payload.provider,
            label,
            category: payload.category,
            source: payload.source || 'manual',
            message: `${label} ${kind} is staged.`,
          });
        }),
      } as any,
      overrides['chatbbApi'] ?? {} as any,
      overrides['locationApi'] ?? {} as any,
      overrides['dispatchIntake'] ?? {} as any,
      overrides['router'] ?? {} as any,
      socket as any
    );
  };

  const userWithRole = (role: string): AuthUser => ({
    id: `${role}-user`,
    role,
    email: `${role}@prometheus.test`,
    firstName: 'Test',
    lastName: 'User',
  });

  const createFixture = async (overrides: Record<string, any> = {}): Promise<ComponentFixture<WorkspaceComponent>> => {
    await TestBed.configureTestingModule({
      declarations: [WorkspaceComponent],
      imports: [FormsModule, ReactiveFormsModule],
      providers: [
        FormBuilder,
        { provide: AuthSessionService, useValue: overrides['session'] ?? { currentUser: null, restoreSession: () => of(false) } },
        {
          provide: PostsApiService,
          useValue: overrides['postsApi'] ?? {
            getBrokerPosts: () => of([]),
            getCarrierPosts: () => of([]),
          },
        },
        {
          provide: MatchingApiService,
          useValue: overrides['matchingApi'] ?? {
            listAssistantEvents: () => of([]),
          },
        },
        {
          provide: BrainApiService,
          useValue: overrides['brainApi'] ?? {
            sendPrompt: () => of({ handled: true, intent: 'generalTransportation', answer: 'Prometheus Brain is ready.' }),
            approve: () => of({}),
            reject: () => of({}),
            updateSettings: () => of({}),
          },
        },
        { provide: LoadsApiService, useValue: overrides['loadsApi'] ?? { getCompanyLoads: () => of([]) } },
        {
          provide: MessagesApiService,
          useValue: {
            getNewMessageDot: () => of([]),
            updateBookingWorkflow: () => of({}),
            getRoomIntegrationChoices: () => of({ setup: [], tracking: [] }),
            executeRoomIntegration: (payload: any) => {
              const label = payload.label || payload.provider;
              const kind = payload.category === 'setup' ? 'setup' : 'tracking';
              return of({
                status: 'staged',
                mode: 'placeholder',
                provider: payload.provider,
                label,
                category: payload.category,
                source: payload.source || 'manual',
                message: `${label} ${kind} is staged.`,
              });
            },
          },
        },
        { provide: ChatbbApiService, useValue: overrides['chatbbApi'] ?? { getRuntimeStatus: () => of(null) } },
        { provide: LocationApiService, useValue: {} },
        { provide: DispatchIntakeService, useValue: {} },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: PrometheusSocketService, useValue: { connect: jasmine.createSpy('connect'), notify$: of() } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    return TestBed.createComponent(WorkspaceComponent);
  };

  it('hides company setup from broker desks', () => {
    const component = createComponent();
    component.user = userWithRole('broker');

    expect(component.workspaceTabs.map((tab) => tab.id)).toEqual(['dispatch', 'matching', 'loads', 'direct']);
  });

  it('hides company setup from carrier desks', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');

    expect(component.workspaceTabs.map((tab) => tab.id)).toEqual(['dispatch', 'matching', 'loads', 'direct']);
  });

  it('keeps company setup for company admin accounts', () => {
    const component = createComponent();
    component.user = userWithRole('admin');

    expect(component.workspaceTabs.map((tab) => tab.id)).toEqual(['companySetup']);
  });

  it('shows Brain settings to company admins and saves changes', async () => {
    const brainApi = {
      sendPrompt: () => of({ handled: true, intent: 'generalTransportation', answer: 'Prometheus Brain is ready.' }),
      approve: () => of({}),
      reject: () => of({}),
      updateSettings: jasmine.createSpy('updateSettings').and.returnValue(of({})),
    };
    const adminUser = userWithRole('admin');
    const fixture = await createFixture({
      brainApi,
      session: { currentUser: adminUser, restoreSession: () => of(true) },
    });
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Prometheus Brain settings');
    expect(fixture.nativeElement.textContent).toContain('Prometheus does not save company memory unless memory is enabled and a human approves the memory.');

    component.brainSettingsForm.patchValue({
      memoryMode: 'companyManaged',
      auditRetentionDays: 90,
      allowProviderTools: true,
    });
    fixture.detectChanges();
    const saveButton = fixture.nativeElement.querySelector('.brain-settings-card button') as HTMLButtonElement;
    saveButton.click();

    expect(brainApi.updateSettings).toHaveBeenCalledWith({
      memoryMode: 'companyManaged',
      auditRetentionDays: 90,
      allowProviderTools: true,
    });
    expect(component.brainSettingsMessage).toBe('Brain settings saved.');
  });

  it('does not show Brain settings to carrier dispatcher desks', async () => {
    const carrierUser = userWithRole('carrier');
    const fixture = await createFixture({
      session: { currentUser: carrierUser, restoreSession: () => of(true) },
    });
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Prometheus Brain settings');
  });

  it('keeps the existing Booking Chat button labels unchanged', async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    component.ngOnInit = () => undefined;
    component.user = userWithRole('carrier');
    component.loading = false;
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'readyToBill' }) as any];
    (component as any).ensureDirectRoomWorkflow('room-1').delivered = true;

    fixture.detectChanges();

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('.quick-actions--booking button') as NodeListOf<HTMLButtonElement>
    ).map((button) => button.textContent?.trim()).filter(Boolean);
    expect(labels).toEqual([
      'Get setup',
      'Assign driver',
      'Add contact',
      'Track',
      'Delivered',
      'Cancel load',
      'Send to Loads Console',
    ]);
  });

  it('does not activate company setup when a broker desk attempts to select it', () => {
    const component = createComponent();
    component.user = userWithRole('broker');
    component.activeTab = 'dispatch';

    component.selectTab('companySetup');

    expect(component.activeTab).toBe('dispatch');
  });

  it('announces matches as a chat booking conversation, not match cards', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    const post: any = {
      _id: 'truck-1',
      origin: { type: 'place', place: 'Chicago, IL' },
      destination: { type: 'place', place: 'Philadelphia, PA' },
      equipment: ['V'],
      weight: 42000,
      publishedAt: new Date().toISOString(),
    };
    const snapshot: any = {
      candidates: [
        {
          matchPostId: 'load-1',
          summary: {
            publisherId: 'broker-1',
            lane: { origin: 'Chicago, IL', destination: 'Philadelphia, PA' },
            equipment: ['V'],
            weight: 42000,
            rate: 3000,
            publishedAt: new Date().toISOString(),
            reference: 'LOAD-1',
          },
          score: 0.95,
        },
      ],
    };

    (component as any).announceMatchSnapshot(post, snapshot);

    const message = component.matchingConsoleMessages.at(-1)?.text ?? '';
    expect(message).toContain('matching hazmat loads');
    expect(message).toContain('book match 1');
    expect(message).not.toContain('cards above');
  });

  it('appends matching assistant events from realtime notifications once', () => {
    const socketEvents = new Subject<any>();
    const component = createComponent({ socketEvents });
    component.user = userWithRole('carrier');

    (component as any).connectAssistantSocket();
    socketEvents.next({
      type: 'matchingAssistantEvent',
      data: {
        _id: 'assistant-event-1',
        companyId: 'company-1',
        role: 'assistant',
        message: 'Option 1 needs reefer hazmat permission.',
        availableCommands: [
          { command: 'ask about 1', label: 'Ask broker' },
          { command: 'book option 1', label: 'Book option 1' },
        ],
        createdAt: '2026-05-03T12:00:00.000Z',
      },
    });
    socketEvents.next({
      type: 'matchingAssistantEvent',
      data: {
        _id: 'assistant-event-1',
        companyId: 'company-1',
        role: 'assistant',
        message: 'Option 1 needs reefer hazmat permission.',
        availableCommands: [],
      },
    });

    const assistantMessages = component.matchingConsoleMessages.filter((message) => message.id === 'assistant-event-1');
    expect(assistantMessages.length).toBe(1);
    expect(assistantMessages[0].text).toContain('Option 1 needs reefer hazmat permission.');
    expect(assistantMessages[0].text).toContain('Commands: ask about 1 | book option 1');
  });

  it('refreshes selected match candidates when realtime assistant events target the selected posting', () => {
    const socketEvents = new Subject<any>();
    const snapshot: any = {
      candidates: [
        {
          matchPostId: 'load-1',
          summary: {
            lane: { origin: 'Chicago, IL', destination: 'Memphis, TN' },
            equipment: ['VZ'],
            weight: 40000,
            rate: 2800,
            publishedAt: '2026-05-07T18:30:00.000Z',
          },
          score: 0.91,
        },
      ],
    };
    const matchingApi = {
      createSnapshot: jasmine.createSpy('createSnapshot').and.returnValue(of(snapshot)),
    };
    const component = createComponent({ socketEvents, matchingApi });
    component.user = userWithRole('carrier');
    const selectedPost: any = {
      _id: 'carrier-post-1',
      origin: { type: 'place', place: 'Chicago, IL' },
      destination: { type: 'place', place: 'Memphis, TN' },
      equipment: ['VZ'],
      weight: 43000,
    };
    component.posts = [selectedPost];
    component.companyPosts = [selectedPost];
    component.selectedPostId = 'carrier-post-1';

    (component as any).connectAssistantSocket();
    socketEvents.next({
      type: 'matchingAssistantEvent',
      data: {
        _id: 'assistant-event-2',
        companyId: 'carrier-company-1',
        role: 'assistant',
        sourcePostId: 'carrier-post-1',
        message: 'A matching hazmat load just posted for your truck.',
        availableCommands: [{ command: 'show matches', label: 'Show matches' }],
      },
    });

    expect(matchingApi.createSnapshot).toHaveBeenCalledWith({
      sourcePostType: 'carrierPost',
      sourcePostId: 'carrier-post-1',
    });
    expect(component.matchCandidates.length).toBe(1);
    expect(component.matchingConsoleMessages.some((message) => (
      message.text.includes('1 matching hazmat loads found')
    ))).toBeTrue();
  });

  it('applies booking status updates from realtime notifications to the active booking room', () => {
    const socketEvents = new Subject<any>();
    const loadsApi = {
      createFromRoom: jasmine.createSpy('createFromRoom').and.returnValue(of(createLoad())),
    };
    const component = createComponent({ socketEvents, loadsApi });
    component.user = userWithRole('broker');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({
      id: 'room-1',
      bookingStatus: 'negotiating',
      brokerApprovedBooking: true,
      carrierApprovedBooking: false,
    }) as any];

    (component as any).connectAssistantSocket();
    socketEvents.next({
      type: 'bookingStatusUpdated',
      data: {
        brokerPostId: 'broker-post-1',
        carrierPostId: 'carrier-post-1',
        bookingStatus: 'booked',
        brokerApprovedBooking: true,
        carrierApprovedBooking: true,
        bookingConfirmedAt: '2026-05-07T18:30:00.000Z',
        bookingConfirmedBy: 'carrier-user',
      },
    });

    expect(component.selectedRoom?.bookingStatus).toBe('booked');
    expect(component.selectedRoom?.carrierApprovedBooking).toBeTrue();
    expect((component as any).bookingApprovalPromptEntry()).toBeNull();
    const workflow = (component as any).ensureDirectRoomWorkflow('room-1');
    expect(workflow.brokerApproved).toBeTrue();
    expect(workflow.carrierApproved).toBeTrue();
  });

  it('applies booking workflow updates from realtime notifications to the active booking room', () => {
    const socketEvents = new Subject<any>();
    const component = createComponent({ socketEvents });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    (component as any).connectAssistantSocket();
    socketEvents.next({
      type: 'bookingWorkflowUpdated',
      data: {
        brokerPostId: 'broker-post-1',
        carrierPostId: 'carrier-post-1',
        bookingWorkflow: {
          setupProvider: 'highway',
          driverId: 'drv-bob',
          driverName: 'Bob Carter',
          truckLabel: "Unit 401 / V 53'",
          contactSaved: true,
          trackingProvider: 'MacroPoint',
          trackingShared: true,
          delivered: true,
        },
      },
    });

    expect(component.selectedRoomSetupReady).toBeTrue();
    expect(component.selectedRoomDriverReady).toBeTrue();
    expect(component.selectedRoomTrackingReady).toBeTrue();
    expect(component.selectedRoomDeliveredReady).toBeTrue();
    expect((component as any).ensureDirectRoomWorkflow('room-1')).toEqual(jasmine.objectContaining({
      setupProvider: 'highway',
      driverName: 'Bob Carter',
      trackingProvider: 'MacroPoint',
      trackingShared: true,
      delivered: true,
    }));
  });

  it('persists setup workflow state after a setup provider is staged', () => {
    const messagesApi = {
      updateBookingWorkflow: jasmine.createSpy('updateBookingWorkflow').and.returnValue(of({})),
      getRoomIntegrationChoices: jasmine.createSpy('getRoomIntegrationChoices').and.returnValue(of({ setup: [], tracking: [] })),
      executeRoomIntegration: jasmine.createSpy('executeRoomIntegration').and.returnValue(of({
        status: 'staged',
        mode: 'placeholder',
        provider: 'highway',
        label: 'Highway',
        category: 'setup',
        source: 'broker',
        message: 'Highway setup is staged.',
      })),
    };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.chooseSetupProvider('highway' as any);

    expect(messagesApi.updateBookingWorkflow).toHaveBeenCalledWith({
      brokerPostId: 'broker-post-1',
      carrierPostId: 'carrier-post-1',
      action: 'setup',
      setupProvider: 'highway',
      setupLabel: 'Highway',
      setupSource: 'carrier',
    });
  });

  it('generates the selected live load when a realtime booking update confirms both sides approved', () => {
    const socketEvents = new Subject<any>();
    const loadsApi = {
      createFromRoom: jasmine.createSpy('createFromRoom').and.returnValue(of(createLoad())),
    };
    const component = createComponent({ socketEvents, loadsApi });
    component.user = userWithRole('carrier');
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({
      id: 'room-1',
      bookingStatus: 'negotiating',
      brokerApprovedBooking: true,
      carrierApprovedBooking: false,
    }) as any];

    (component as any).connectAssistantSocket();
    socketEvents.next({
      type: 'bookingStatusUpdated',
      data: {
        brokerPostId: 'broker-post-1',
        carrierPostId: 'carrier-post-1',
        bookingStatus: 'booked',
        brokerApprovedBooking: true,
        carrierApprovedBooking: true,
      },
    });

    expect(loadsApi.createFromRoom).toHaveBeenCalledWith({
      brokerPostId: 'broker-post-1',
      carrierPostId: 'carrier-post-1',
      driverName: undefined,
      truckLabel: undefined,
    });
    expect(component.loads[0].reference).toBe('LD-1');
    expect(component.bookingAssistantEntries.some((entry) => entry.text.includes('generated in Booking Chat'))).toBeTrue();
  });

  it('does not create a duplicate selected live load when one already exists for the room', () => {
    const loadsApi = {
      createFromRoom: jasmine.createSpy('createFromRoom'),
    };
    const component = createComponent({ loadsApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad() as any];

    component.createLoadFromSelectedRoom(true);

    expect(loadsApi.createFromRoom).not.toHaveBeenCalled();
    expect(component.loadMessage).toContain('already generated');
  });

  it('closes a stale confirmation window when realtime booking update cancels the room', () => {
    const socketEvents = new Subject<any>();
    const component = createComponent({ socketEvents });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];
    component.bookingConfirmationWindow = {
      action: 'approve',
      roomId: 'room-1',
      openedAt: '2026-05-07T18:30:00.000Z',
      expiresAt: '2026-05-07T18:35:00.000Z',
    };

    (component as any).connectAssistantSocket();
    socketEvents.next({
      type: 'bookingStatusUpdated',
      data: {
        brokerPostId: 'broker-post-1',
        carrierPostId: 'carrier-post-1',
        bookingStatus: 'cancelled',
        brokerApprovedBooking: false,
        carrierApprovedBooking: false,
      },
    });

    expect(component.selectedRoom?.bookingStatus).toBe('cancelled');
    expect(component.bookingConfirmationWindow).toBeNull();
    expect(component.loadMessage).toContain('offer was rejected');
  });

  it('loads persisted matching assistant events with workspace data', () => {
    const matchingApi = {
      listAssistantEvents: jasmine.createSpy('listAssistantEvents').and.returnValue(of([{
        _id: 'persisted-event-1',
        companyId: 'company-1',
        role: 'assistant',
        message: 'Persisted Hazmat Hero suggestion.',
        availableCommands: [{ command: 'show matches', label: 'Show matches' }],
        createdAt: '2026-05-03T12:00:00.000Z',
      }])),
    };
    const component = createComponent({
      postsApi: {
        getCarrierPosts: jasmine.createSpy('getCarrierPosts').and.returnValue(of([])),
      },
      matchingApi,
      loadsApi: { getCompanyLoads: jasmine.createSpy('getCompanyLoads').and.returnValue(of([])) },
      messagesApi: { getNewMessageDot: jasmine.createSpy('getNewMessageDot').and.returnValue(of([])) },
      chatbbApi: { getRuntimeStatus: jasmine.createSpy('getRuntimeStatus').and.returnValue(of(null)) },
    });
    const user = userWithRole('carrier');

    (component as any).loadWorkspaceData(user);

    expect(matchingApi.listAssistantEvents).toHaveBeenCalled();
    expect(component.matchingConsoleMessages.some((message) => (
      message.id === 'persisted-event-1'
      && message.text.includes('Persisted Hazmat Hero suggestion.')
      && message.text.includes('Commands: show matches')
    ))).toBeTrue();
  });

  it('sends assistant booking commands to the backend instead of opening local rooms', () => {
    const matchingApi = {
      sendAssistantCommand: jasmine.createSpy('sendAssistantCommand').and.returnValue(of({
        created: true,
        room: {
          _id: 'room-1',
          brokerPostId: 'broker-post-1',
          carrierPostId: 'carrier-post-1',
          bookingStatus: 'negotiating',
        },
      })),
    };
    const messagesApi = {
      createRoom: jasmine.createSpy('createRoom'),
      getRooms: jasmine.createSpy('getRooms').and.returnValue(of([])),
    };
    const component = createComponent({ matchingApi, messagesApi });
    component.user = userWithRole('carrier');
    component.selectedPostId = 'carrier-post-1';
    component.posts = [createPost({ _id: 'carrier-post-1' }) as any];
    component.matchCandidates = [{
      matchPostId: 'broker-post-1',
      matchPostType: 'brokerPost',
      score: 0.95,
      scoreBreakdown: {} as any,
      summary: { publisherId: 'broker-1', lane: { origin: 'Chicago, IL', destination: 'Memphis, TN' }, equipment: ['V'], weight: 42000, rate: 3000, publishedAt: null, reference: 'LOAD-1', companyId: 'company-2' },
      routeMetrics: {} as any,
    }];
    component.chatbbPrompt = 'book option 1';

    component.submitMatchingConsole();

    expect(matchingApi.sendAssistantCommand).toHaveBeenCalledWith({
      prompt: 'book option 1',
      sourcePostId: 'carrier-post-1',
    });
    expect(messagesApi.createRoom).not.toHaveBeenCalled();
    expect(component.activeTab).toBe('direct');
    expect(component.activeDirectConsoleView).toBe('booking');
    expect(component.matchingConsoleMessages.at(-1)?.text).toContain('booking conversation is ready');
  });

  it('asks the user to select a live posting before showing assistant matches', () => {
    const matchingApi = {
      sendAssistantCommand: jasmine.createSpy('sendAssistantCommand'),
    };
    const component = createComponent({ matchingApi });
    component.user = userWithRole('carrier');
    component.selectedPostId = '';
    component.chatbbPrompt = 'show matches';

    component.submitMatchingConsole();

    expect(matchingApi.sendAssistantCommand).not.toHaveBeenCalled();
    expect(component.matchingConsoleMessages.at(-1)?.text).toContain('Select a live posting first');
  });

  it('does not route broad accept text as a hazmat assistant command', () => {
    const matchingApi = {
      sendAssistantCommand: jasmine.createSpy('sendAssistantCommand'),
    };
    const component = createComponent({ matchingApi });
    component.user = userWithRole('carrier');
    component.selectedPostId = 'carrier-post-1';

    const handled = (component as any).handleMatchingConsoleCommand('accept terms');

    expect(handled).toBeFalse();
    expect(matchingApi.sendAssistantCommand).not.toHaveBeenCalled();
  });

  it('routes market questions through Prometheus Brain without requiring a booking room', () => {
    const chatbbApi = {
      createMessage: jasmine.createSpy('createMessage').and.returnValue(throwError(() => new Error('preview room should not be used'))),
    };
    const brainApi = {
      sendPrompt: jasmine.createSpy('sendPrompt').and.returnValue(of({
        handled: true,
        intent: 'search',
        answer: 'Brain found hazmat options around Memphis, TN.',
      })),
    };
    const component = createComponent({ chatbbApi, brainApi });
    component.user = userWithRole('broker');
    component.activeTab = 'matching';
    component.selectedPostId = 'broker-load-1';
    component.posts = [
      createPost({
        _id: 'broker-load-1',
        origin: { type: 'place', place: 'Chicago, IL' },
        destination: { type: 'place', place: 'Memphis, TN' },
        rate: 2500,
      }) as any,
    ];
    component.chatbbPrompt = 'do you have anything out of memphis,tn?';

    component.submitMatchingConsole();

    expect(chatbbApi.createMessage).not.toHaveBeenCalled();
    expect(brainApi.sendPrompt).toHaveBeenCalledWith({
      prompt: 'do you have anything out of memphis,tn?',
      source: 'matching',
      related: { sourcePostId: 'broker-load-1' },
    });
    const answer = component.matchingConsoleMessages.at(-1)?.text ?? '';
    expect(answer).toContain('Brain found hazmat options around Memphis, TN.');
    expect(component.chatbbError).toBe('');
  });

  it('routes market map questions through Prometheus Brain instead of opening route intelligence', () => {
    const brainApi = {
      sendPrompt: jasmine.createSpy('sendPrompt').and.returnValue(of({
        handled: true,
        intent: 'map',
        answer: 'Brain can prepare map clusters for Chicago, IL.',
      })),
    };
    const component = createComponent({ brainApi });
    component.user = userWithRole('broker');
    component.activeTab = 'matching';
    component.posts = [
      createPost({
        _id: 'broker-load-1',
        origin: { type: 'place', place: 'Chicago, IL' },
        destination: { type: 'place', place: 'Memphis, TN' },
        rate: 2500,
        distance: 530,
      }) as any,
    ];
    component.selectedPostId = 'broker-load-1';

    component.chatbbPrompt = 'show map of available hazmat loads near Chicago, IL';
    component.submitMatchingConsole();

    const answer = component.matchingConsoleMessages.at(-1)?.text ?? '';
    expect(component.routeIntelligencePanel.open).toBeFalse();
    expect(brainApi.sendPrompt).toHaveBeenCalled();
    expect(answer).toContain('Brain can prepare map clusters for Chicago, IL.');
  });

  it('keeps simple market map prompts in Prometheus Brain', () => {
    const brainApi = {
      sendPrompt: jasmine.createSpy('sendPrompt').and.returnValue(of({
        handled: true,
        intent: 'map',
        answer: 'Brain can prepare load map context.',
      })),
    };
    const component = createComponent({ brainApi });
    component.user = userWithRole('broker');
    component.activeTab = 'matching';
    component.posts = [
      createPost({
        _id: 'broker-load-1',
        origin: { type: 'place', place: 'Chicago, IL' },
        destination: { type: 'place', place: 'Memphis, TN' },
        rate: 2500,
        distance: 530,
      }) as any,
    ];
    component.selectedPostId = 'broker-load-1';

    component.chatbbPrompt = 'show map of loads in Chicago';
    component.submitMatchingConsole();

    const answer = component.matchingConsoleMessages.at(-1)?.text ?? '';
    expect(component.routeIntelligencePanel.open).toBeFalse();
    expect(brainApi.sendPrompt).toHaveBeenCalled();
    expect(answer).toContain('Brain can prepare load map context.');
  });

  it('routes rate and alternative lane questions through Prometheus Brain', () => {
    const brainApi = {
      sendPrompt: jasmine.createSpy('sendPrompt').and.callFake((payload: any) => of({
        handled: true,
        intent: 'search',
        answer: payload.prompt.includes('rates') ? 'Brain rate read.' : 'Brain alternative lane read.',
      })),
    };
    const component = createComponent({ brainApi });
    component.user = userWithRole('broker');
    component.activeTab = 'matching';
    component.posts = [
      createPost({
        _id: 'broker-load-1',
        origin: { type: 'place', place: 'Chicago, IL' },
        destination: { type: 'place', place: 'Memphis, TN' },
        rate: 2500,
        distance: 530,
      }) as any,
    ];
    component.selectedPostId = 'broker-load-1';

    component.chatbbPrompt = 'show rates for this lane';
    component.submitMatchingConsole();

    let answer = component.matchingConsoleMessages.at(-1)?.text ?? '';
    expect(component.routeIntelligencePanel.open).toBeFalse();
    expect(answer).toContain('Brain rate read.');

    component.chatbbPrompt = 'show alternative lanes around Chicago, IL';
    component.submitMatchingConsole();

    answer = component.matchingConsoleMessages.at(-1)?.text ?? '';
    expect(component.routeIntelligencePanel.open).toBeFalse();
    expect(answer).toContain('Brain alternative lane read.');
    expect(brainApi.sendPrompt).toHaveBeenCalledTimes(2);
  });

  it('stores Brain approval prompts returned from the matching console', () => {
    const approval = {
      _id: 'approval-1',
      companyId: 'company-1',
      requestedBy: 'user-1',
      role: 'carrier',
      actionType: 'sendEmail',
      label: 'Approve email draft',
      summary: 'Prometheus drafted an email.',
      riskNote: 'Email is not sent until approved.',
      payload: {},
      status: 'pending' as const,
    };
    const brainApi = {
      sendPrompt: jasmine.createSpy('sendPrompt').and.returnValue(of({
        handled: true,
        intent: 'sendEmail',
        answer: 'Approve email draft: Prometheus drafted an email.',
        approval,
      })),
    };
    const component = createComponent({ brainApi });
    component.user = userWithRole('carrier');
    component.activeTab = 'matching';
    component.chatbbPrompt = 'email Brian my truck list';

    component.submitMatchingConsole();

    expect(component.pendingBrainApprovals).toEqual([approval]);
    expect(component.matchingConsoleMessages.at(-1)?.text).toContain('Approve email draft');
  });

  it('approves and rejects Brain approval cards from the matching console', () => {
    const approval = {
      _id: 'approval-1',
      companyId: 'company-1',
      requestedBy: 'user-1',
      role: 'carrier',
      actionType: 'sendEmail',
      label: 'Approve email draft',
      summary: 'Prometheus drafted an email.',
      riskNote: 'Email is not sent until approved.',
      payload: {},
      status: 'pending' as const,
    };
    const approved = {
      ...approval,
      status: 'approved' as const,
      result: { message: 'Approved. Provider execution is not connected in Brain V1.' },
    };
    const rejected = { ...approval, status: 'rejected' as const };
    const brainApi = {
      approve: jasmine.createSpy('approve').and.returnValue(of(approved)),
      reject: jasmine.createSpy('reject').and.returnValue(of(rejected)),
    };
    const component = createComponent({ brainApi });
    component.pendingBrainApprovals = [approval];

    component.approveBrainRequest(approval);

    expect(brainApi.approve).toHaveBeenCalledWith('approval-1');
    expect(component.pendingBrainApprovals[0]).toEqual(approved);
    expect(component.matchingConsoleMessages.at(-1)?.text).toContain('Approved. Provider execution is not connected');

    component.rejectBrainRequest(approval);

    expect(brainApi.reject).toHaveBeenCalledWith('approval-1');
    expect(component.pendingBrainApprovals[0]).toEqual(rejected);
    expect(component.matchingConsoleMessages.at(-1)?.text).toContain('Rejected. I will not take that action.');
  });

  it('opens route intelligence from matching console map commands without using ChatBB', () => {
    const chatbbApi = {
      createMessage: jasmine.createSpy('createMessage').and.returnValue(of({})),
    };
    const component = createComponent({ chatbbApi });
    component.user = {
      id: 'broker-user',
      name: 'Brooke Broker',
      role: 'broker',
      companyName: 'Coyote Logistics',
      companyRole: 'admin',
    } as any;
    component.posts = [
      createPost({
        _id: 'load-1',
        origin: { type: 'place', place: 'Chicago, IL' },
        destination: { type: 'place', place: 'Memphis, TN' },
        equipment: ['V'],
        weight: 42000,
        rate: 2500,
        publishedAt: new Date('2026-05-10T14:00:00Z').toISOString(),
        companyName: 'Coyote Logistics',
      }) as any,
    ];
    component.selectedPostId = 'load-1';
    component.matchCandidates = [
      {
        matchPostId: 'truck-1',
        matchPostType: 'carrierPost',
        score: 0.93,
        scoreBreakdown: { laneFit: 1, equipmentFit: 1, weightFit: 1, freshnessFit: 1, rateFit: 1 },
        summary: {
          companyId: 'carrier-company-1',
          publisherId: 'carrier-user',
          lane: { origin: 'Chicago, IL', destination: 'Memphis, TN' },
          equipment: ['V'],
          weight: 43000,
          rate: null,
          publishedAt: new Date('2026-05-10T14:05:00Z').toISOString(),
          reference: 'TRUCK-1',
        },
        routeMetrics: {
          originDeadheadMiles: 12,
          destinationDeadheadMiles: null,
          tripMiles: 532,
          totalPracticalMiles: 544,
          estimatedDriveMinutes: 510,
          provider: 'fallback',
        },
      } as any,
    ];

    component.chatbbPrompt = 'show load map';
    component.submitMatchingConsole();

    const routePanel = (component as any).routeIntelligencePanel;
    expect(chatbbApi.createMessage).not.toHaveBeenCalled();
    expect(routePanel.open).toBeTrue();
    expect(routePanel.source).toBe('matching');
    expect(routePanel.deadheadMiles).toBe(12);
    expect(routePanel.loadedMiles).toBe(532);
    expect(routePanel.totalMiles).toBe(544);
    expect(routePanel.routeProvider).toContain('Estimated');
    expect(routePanel.routeProvider).toContain('fallback');
    expect(Array.isArray(routePanel.hazmatNotes)).toBeTrue();
    expect(routePanel.hazmatNotes.join(' ')).toContain('estimated until live routing provider data is connected');
  });

  it('uses the selected broker load lane when a matching carrier truck has a different location', () => {
    const component = createComponent();
    component.user = userWithRole('broker');
    component.activeTab = 'matching';
    component.posts = [
      createPost({
        _id: 'load-1',
        origin: { type: 'place', place: 'Chicago, IL' },
        destination: { type: 'place', place: 'Memphis, TN' },
        rate: 2500,
        distance: 530,
        stops: [
          { place: { city: 'Chicago', state: 'IL' } },
          { place: { city: 'Memphis', state: 'TN' } },
        ],
      }) as any,
    ];
    component.selectedPostId = 'load-1';
    component.matchCandidates = [
      {
        matchPostId: 'truck-1',
        matchPostType: 'carrierPost',
        score: 0.9,
        scoreBreakdown: { laneFit: 1, equipmentFit: 1, weightFit: 1, freshnessFit: 1, rateFit: 1 },
        summary: {
          companyId: 'carrier-company-1',
          publisherId: 'carrier-user',
          lane: { origin: 'Louisville, KY', destination: 'Atlanta, GA' },
          equipment: ['V'],
          weight: 43000,
          rate: null,
          publishedAt: new Date().toISOString(),
          reference: 'TRUCK-1',
        },
        routeMetrics: {
          originDeadheadMiles: 120,
          destinationDeadheadMiles: null,
          tripMiles: 530,
          totalPracticalMiles: 650,
          estimatedDriveMinutes: 600,
          provider: 'fallback',
        },
      } as any,
    ];

    component.chatbbPrompt = 'show route for match 1';
    component.submitMatchingConsole();

    const routePanel = component.routeIntelligencePanel;
    expect(routePanel.open).toBeTrue();
    expect(routePanel.laneLabel).toBe('Chicago, IL -> Memphis, TN');
    expect(routePanel.postedRate).toBe(2500);
    expect(routePanel.stops).toEqual(['Chicago, IL', 'Memphis, TN']);
    expect(routePanel.truckLocationLabel).toBe('Louisville, KY');
  });

  it('keeps open booking chat command routed to direct chat navigation', () => {
    const component = createComponent();
    component.user = userWithRole('broker');
    component.activeTab = 'matching';

    component.chatbbPrompt = 'open booking chat';
    component.submitMatchingConsole();

    expect(component.activeTab).toBe('direct');
    expect(component.routeIntelligencePanel.open).toBeFalse();
    expect(component.matchingConsoleMessages.at(-1)?.text).toContain('Direct Chat Console is open');
  });

  it('uses requested match route metrics in the route intelligence panel', () => {
    const component = createComponent();
    component.user = {
      id: 'carrier-user',
      name: 'Casey Carrier',
      role: 'carrier',
      companyName: 'Warrior Freight',
      companyRole: 'admin',
    } as any;
    component.posts = [
      createPost({
        _id: 'truck-1',
        origin: { type: 'place', place: 'Chicago, IL' },
        destination: { type: 'place', place: 'Memphis, TN' },
        equipment: ['V'],
        weight: 42000,
        stops: [
          { place: { city: 'Chicago', state: 'IL' } },
        ],
        publishedAt: new Date('2026-05-10T14:00:00Z').toISOString(),
        companyName: 'Warrior Freight',
      }) as any,
    ];
    component.selectedPostId = 'truck-1';
    component.matchCandidates = [
      {
        matchPostId: 'load-1',
        matchPostType: 'brokerPost',
        score: 0.82,
        scoreBreakdown: { laneFit: 1, equipmentFit: 1, weightFit: 1, freshnessFit: 1, rateFit: 1 },
        summary: {
          companyId: 'broker-company-1',
          publisherId: 'broker-user-1',
          lane: { origin: 'Gary, IN', destination: 'Nashville, TN' },
          equipment: ['V'],
          weight: 41000,
          rate: 2100,
          publishedAt: new Date().toISOString(),
          reference: 'LOAD-1',
        },
        routeMetrics: {
          originDeadheadMiles: 33,
          destinationDeadheadMiles: null,
          tripMiles: 470,
          totalPracticalMiles: 503,
          estimatedDriveMinutes: 440,
          provider: 'fallback',
        },
      } as any,
      {
        matchPostId: 'load-2',
        matchPostType: 'brokerPost',
        score: 0.91,
        scoreBreakdown: { laneFit: 1, equipmentFit: 1, weightFit: 1, freshnessFit: 1, rateFit: 1 },
        summary: {
          companyId: 'broker-company-2',
          publisherId: 'broker-user-2',
          lane: { origin: 'Chicago, IL', destination: 'Memphis, TN' },
          equipment: ['RZ'],
          weight: 39000,
          rate: 3000,
          publishedAt: new Date().toISOString(),
          reference: 'LOAD-2',
        },
        routeMetrics: {
          originDeadheadMiles: 8,
          destinationDeadheadMiles: null,
          tripMiles: 532,
          totalPracticalMiles: 540,
          estimatedDriveMinutes: 510,
          provider: 'fallback',
        },
      } as any,
    ];

    component.chatbbPrompt = 'show route for match 2';
    component.submitMatchingConsole();

    const routePanel = (component as any).routeIntelligencePanel;
    expect(routePanel.open).toBeTrue();
    expect(routePanel.laneLabel).toContain('Chicago, IL');
    expect(routePanel.loadedMiles).toBe(532);
    expect(routePanel.postedRate).toBe(3000);
    expect(routePanel.suggestedRate).toBe(3000);
    expect(routePanel.stops).toEqual([]);
  });

  it('formats route intelligence stops from real stop place objects', () => {
    const component = createComponent();
    component.user = userWithRole('broker');
    component.posts = [
      createPost({
        _id: 'broker-load-1',
        origin: { type: 'place', place: 'Chicago, IL' },
        destination: { type: 'place', place: 'Memphis, TN' },
        stops: [
          { place: { city: 'Indianapolis', state: 'IN' } },
          { city: 'Louisville', state: 'KY' },
        ],
      }) as any,
    ];
    component.selectedPostId = 'broker-load-1';

    component.chatbbPrompt = 'show load map';
    component.submitMatchingConsole();

    expect(component.routeIntelligencePanel.stops).toEqual(['Indianapolis, IN', 'Louisville, KY']);
  });

  it('uses the counterpart post id as preferred room id for assistant room responses', () => {
    const matchingApi = {
      sendAssistantCommand: jasmine.createSpy('sendAssistantCommand').and.returnValue(of({
        created: true,
        room: {
          _id: 'raw-room-document-id',
          brokerPostId: 'broker-post-1',
          carrierPostId: 'carrier-post-1',
          bookingStatus: 'negotiating',
        },
      })),
    };
    const messagesApi = {
      getRooms: jasmine.createSpy('getRooms').and.returnValue(of([{
        post: createPost({ _id: 'broker-post-1' }),
        user: {},
        company: {},
        seen: { brokerCount: 0, carrierCount: 0 },
        messages: [],
        brokerPostId: 'broker-post-1',
        carrierPostId: 'carrier-post-1',
        brokerId: 'broker-user',
        carrierId: 'carrier-user',
        bookingStatus: 'negotiating',
      }])),
      getMessages: jasmine.createSpy('getMessages').and.returnValue(of([])),
    };
    const component = createComponent({
      matchingApi,
      messagesApi,
      chatbbApi: { getThread: jasmine.createSpy('getThread').and.returnValue(of({ messages: [] })) },
    });
    component.user = userWithRole('carrier');
    component.selectedPostId = 'carrier-post-1';
    component.posts = [createPost({ _id: 'carrier-post-1' }) as any];
    component.chatbbPrompt = 'book option 1';

    component.submitMatchingConsole();

    expect(messagesApi.getRooms).toHaveBeenCalledWith({ postId: 'carrier-post-1' });
    expect(component.selectedRoomId).toBe('broker-post-1');
  });

  it('shows booking approval as a bot prompt with approve and reject actions', () => {
    const component = createComponent();
    component.user = userWithRole('broker');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];

    const prompt = component.bookingAssistantEntries.at(-1) as any;

    expect(prompt.label).toBe('Prometheus AI');
    expect(prompt.text).toContain('Approve booking');
    expect(prompt.text).toContain('reject the offer');
    expect(prompt.actions.map((action: any) => action.label)).toEqual(['Approve booking', 'Reject offer']);
  });

  it('keeps booking approval controls inside the AI prompt instead of the sidebar decision strip', () => {
    const component = createComponent();
    component.user = userWithRole('broker');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];

    const approvalEntry = component.bookingAssistantEntries.at(-1) as any;

    expect(approvalEntry.text).toBe('Prometheus has this hazmat booking ready. Approve booking or reject the offer?');
    expect(approvalEntry.actions.map((action: any) => action.label)).toEqual(['Approve booking', 'Reject offer']);
    expect(component.currentUserApprovedBooking(component.selectedRoom)).toBeFalse();
  });

  it('opens a timed confirmation window before saving booking approval', () => {
    const messagesApi = { updateBookingStatus: jasmine.createSpy('updateBookingStatus') };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('broker');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];

    component.runBookingAssistantAction({ type: 'approveBooking', label: 'Approve booking' } as any);

    expect(messagesApi.updateBookingStatus).not.toHaveBeenCalled();
    expect(component.bookingConfirmationWindow?.action).toBe('approve');
    expect(component.bookingConfirmationWindow?.roomId).toBe('room-1');
    expect(component.bookingConfirmationSecondsRemaining).toBe(300);
    expect(component.bookingAssistantEntries.at(-1)?.text).toContain('Final confirmation window is open');
  });

  it('opens the confirmation window when a user types a booking approval reply', () => {
    const messagesApi = { updateBookingStatus: jasmine.createSpy('updateBookingStatus') };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('carrier');
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];
    component.chatbbPrompt = 'yes book it';

    component.sendChatbbMessage();

    expect(messagesApi.updateBookingStatus).not.toHaveBeenCalled();
    expect(component.bookingConfirmationWindow?.action).toBe('approve');
    expect(component.chatbbPrompt).toBe('');
    expect(component.bookingAssistantEntries.at(-1)?.text).toContain('Final confirmation window is open');
  });

  it('opens a timed confirmation window before saving offer rejection', () => {
    const messagesApi = {
      updateBookingStatus: jasmine.createSpy('updateBookingStatus').and.returnValue(of(createRoom({
        id: 'room-1',
        bookingStatus: 'cancelled',
      }))),
    };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('broker');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];

    component.runBookingAssistantAction({ type: 'rejectOffer', label: 'Reject offer' } as any);

    expect(messagesApi.updateBookingStatus).not.toHaveBeenCalled();
    expect(component.bookingConfirmationWindow?.action).toBe('reject');
    expect(component.bookingConfirmationWindow?.roomId).toBe('room-1');
    expect(component.bookingConfirmationSecondsRemaining).toBe(300);
    expect(component.bookingAssistantEntries.at(-1)?.text).toContain('Final confirmation window is open');
  });

  it('opens the rejection confirmation window when a user types a rejection reply', () => {
    const messagesApi = {
      updateBookingStatus: jasmine.createSpy('updateBookingStatus').and.returnValue(of(createRoom({
        id: 'room-1',
        bookingStatus: 'cancelled',
      }))),
    };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('carrier');
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];
    component.chatbbPrompt = 'reject offer';

    component.sendChatbbMessage();

    expect(messagesApi.updateBookingStatus).not.toHaveBeenCalled();
    expect(component.bookingConfirmationWindow?.action).toBe('reject');
    expect(component.chatbbPrompt).toBe('');
    expect(component.bookingAssistantEntries.at(-1)?.text).toContain('Final confirmation window is open');
  });

  it('accepts the confirmation window through the shared approve endpoint', () => {
    const updatedRoom = createRoom({
      id: 'room-1',
      bookingStatus: 'negotiating',
      brokerApprovedBooking: true,
    });
    const messagesApi = {
      updateBookingStatus: jasmine.createSpy('updateBookingStatus').and.returnValue(of(updatedRoom)),
    };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('broker');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];
    component.runBookingAssistantAction({ type: 'approveBooking', label: 'Approve booking' } as any);

    component.acceptBookingConfirmation();

    expect(messagesApi.updateBookingStatus).toHaveBeenCalledWith({
      brokerPostId: 'broker-post-1',
      carrierPostId: 'carrier-post-1',
      action: 'approve',
    });
    expect(component.bookingConfirmationWindow).toBeNull();
    expect(component.loadMessage).toContain('Booking approval saved');
  });

  it('rejects the confirmation window through the shared cancel endpoint', () => {
    const updatedRoom = createRoom({
      id: 'room-1',
      bookingStatus: 'cancelled',
      bookingCancelledAt: '2026-05-03T12:00:00.000Z',
    });
    const messagesApi = {
      updateBookingStatus: jasmine.createSpy('updateBookingStatus').and.returnValue(of(updatedRoom)),
    };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];
    component.runBookingAssistantAction({ type: 'approveBooking', label: 'Approve booking' } as any);

    component.rejectBookingConfirmation();

    expect(messagesApi.updateBookingStatus).toHaveBeenCalledWith({
      brokerPostId: 'broker-post-1',
      carrierPostId: 'carrier-post-1',
      action: 'cancel',
    });
    expect(component.bookingConfirmationWindow).toBeNull();
    expect(component.loadMessage).toContain('offer was rejected');
  });

  it('keeps booking pending when the user backs out of a rejection confirmation', () => {
    const messagesApi = { updateBookingStatus: jasmine.createSpy('updateBookingStatus') };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('broker');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];
    component.bookingConfirmationWindow = {
      action: 'reject',
      roomId: 'room-1',
      openedAt: '2026-05-03T12:00:00.000Z',
      expiresAt: '2026-05-03T12:05:00.000Z',
    };

    component.rejectBookingConfirmation(new Date('2026-05-03T12:01:00.000Z'));

    expect(messagesApi.updateBookingStatus).not.toHaveBeenCalled();
    expect(component.bookingConfirmationWindow).toBeNull();
    expect(component.bookingAssistantEntries.at(-1)?.text).toContain('Booking approval is still pending');
  });

  it('expires the confirmation window without touching backend approval state', () => {
    const messagesApi = { updateBookingStatus: jasmine.createSpy('updateBookingStatus') };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('broker');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];
    component.runBookingAssistantAction({ type: 'approveBooking', label: 'Approve booking' } as any);
    component.bookingConfirmationWindow = {
      action: 'approve',
      roomId: 'room-1',
      openedAt: '2026-05-03T12:00:00.000Z',
      expiresAt: '2026-05-03T12:04:59.000Z',
    };

    component.acceptBookingConfirmation(new Date('2026-05-03T12:05:01.000Z'));

    expect(messagesApi.updateBookingStatus).not.toHaveBeenCalled();
    expect(component.bookingConfirmationWindow).toBeNull();
    expect(component.bookingAssistantEntries.at(-1)?.text).toContain('confirmation window expired');
  });

  it('creates the load in booking chat after both sides approve', () => {
    const updatedRoom = createRoom({
      id: 'room-1',
      bookingStatus: 'booked',
      brokerApprovedBooking: true,
      carrierApprovedBooking: true,
    });
    const load = {
      _id: 'load-1',
      companyId: 'company-1',
      createdBy: 'broker-user',
      creatorRole: 'broker',
      loadNumber: 'LD-1',
      reference: 'LD-1',
      status: 'active',
      lane: { origin: 'Chicago, IL', destination: 'Memphis, TN' },
      source: { brokerPostId: 'broker-post-1', carrierPostId: 'carrier-post-1' },
      broker: {},
      carrier: {},
      driver: {},
      dispatch: { assignedDispatcherId: '', assignedDispatcherName: '', assignedDispatcherEmail: '' },
    };
    const loadsApi = { createFromRoom: jasmine.createSpy('createFromRoom').and.returnValue(of(load)) };
    const messagesApi = { updateBookingStatus: jasmine.createSpy('updateBookingStatus').and.returnValue(of(updatedRoom)) };
    const component = createComponent({ loadsApi, messagesApi });
    component.user = userWithRole('broker');
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];

    component.confirmSelectedBookingApproval();

    expect(loadsApi.createFromRoom).toHaveBeenCalledWith({
      brokerPostId: 'broker-post-1',
      carrierPostId: 'carrier-post-1',
      driverName: undefined,
      truckLabel: undefined,
    });
    expect(component.loads.map((entry) => entry._id)).toContain('load-1');
    expect(component.activeTab).toBe('direct');
    expect(component.activeDirectConsoleView).toBe('booking');
  });

  it('offers driver buttons in booking chat and assigns the selected truck', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginDriverAssist();

    const prompt = component.bookingAssistantEntries.at(-1) as any;
    expect(prompt.actions.map((action: any) => action.label)).toContain("Bob Carter / Unit 401 / V 53'");

    component.runBookingAssistantAction(prompt.actions[0] as any);

    expect(component.selectedRoomDriverReady).toBeTrue();
    expect(component.selectedRoomDriverSummary).toContain('Bob Carter');
  });

  it('updates an existing live load when assigning a driver from booking chat', () => {
    const updatedLoad = createLoad({
      driver: { name: 'Bob Carter', truckLabel: "Unit 401 / V 53'" },
    });
    const loadsApi = {
      updateLoad: jasmine.createSpy('updateLoad').and.returnValue(of(updatedLoad)),
    };
    const component = createComponent({ loadsApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'active' }) as any];

    component.assignDriverToSelectedRoom((component as any).driverRoster[0]);

    expect(loadsApi.updateLoad).toHaveBeenCalledWith('load-1', {
      driverName: 'Bob Carter',
      truckLabel: "Unit 401 / V 53'",
    });
    expect(component.selectedRoomDriverReady).toBeTrue();
    expect(component.bookingAssistantEntries.at(-1)?.text).toContain('Bob Carter');
  });

  it('does not turn driver green when live load driver assignment fails', () => {
    const loadsApi = {
      updateLoad: jasmine.createSpy('updateLoad').and.returnValue(throwError(() => ({ error: { message: 'driver save failed' } }))),
    };
    const component = createComponent({ loadsApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'active' }) as any];

    component.assignDriverToSelectedRoom((component as any).driverRoster[0]);

    expect(loadsApi.updateLoad).toHaveBeenCalled();
    expect(component.selectedRoomDriverReady).toBeFalse();
    expect(component.loadError).toContain('driver save failed');
  });

  it('offers setup provider buttons and turns setup green after selection', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginSetupAssist();

    const prompt = component.bookingAssistantEntries.at(-1) as any;
    expect(prompt.actions.map((action: any) => action.label)).toEqual(['Highway', 'MyCarrierPacket', 'Truckstop']);

    component.runBookingAssistantAction(prompt.actions[0] as any);

    expect(component.selectedRoomSetupReady).toBeTrue();
    expect(component.selectedRoomSetupLabel).toContain('Highway');
  });

  it('keeps setup provider choices as explicit AI chat actions', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginSetupAssist();

    const prompt = component.bookingAssistantEntries.at(-1) as any;
    expect(prompt.text).toBe('Which setup provider should be staged for this booking?');
    expect(prompt.actions.map((action: any) => action.label)).toEqual(['Highway', 'MyCarrierPacket', 'Truckstop']);
  });

  it('uses connected setup provider choices from the room integration lookup', () => {
    const messagesApi = {
      getRoomIntegrationChoices: jasmine.createSpy('getRoomIntegrationChoices').and.returnValue(of({
        setup: [
          { provider: 'highway', label: 'Highway' },
          { provider: 'mycarrierpacket', label: 'MyCarrierPacket' },
        ],
        tracking: [],
      })),
      executeRoomIntegration: jasmine.createSpy('executeRoomIntegration').and.returnValue(of({
        status: 'staged',
        mode: 'configured',
        provider: 'highway',
        label: 'Highway',
        category: 'setup',
        source: 'broker',
        message: 'Highway setup is staged through the provider.',
      })),
    };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginSetupAssist();

    expect(messagesApi.getRoomIntegrationChoices).toHaveBeenCalledWith({
      brokerPostId: 'broker-post-1',
      carrierPostId: 'carrier-post-1',
    });
    const prompt = component.bookingAssistantEntries.at(-1) as any;
    expect(prompt.text).toContain('Which setup method should I use');
    expect(prompt.actions.map((action: any) => action.label)).toEqual(['Highway', 'MyCarrierPacket']);
  });

  it('executes the selected setup provider through the backend adapter before turning setup green', () => {
    const messagesApi = {
      getRoomIntegrationChoices: jasmine.createSpy('getRoomIntegrationChoices').and.returnValue(of({
        setup: [{ provider: 'highway', label: 'Broker Highway', source: 'broker', category: 'setup' }],
        tracking: [],
      })),
      executeRoomIntegration: jasmine.createSpy('executeRoomIntegration').and.returnValue(of({
        status: 'staged',
        mode: 'configured',
        provider: 'highway',
        label: 'Broker Highway',
        category: 'setup',
        source: 'broker',
        message: 'Broker Highway setup is staged.',
      })),
    };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginSetupAssist();
    const prompt = component.bookingAssistantEntries.at(-1) as any;
    component.runBookingAssistantAction(prompt.actions[0]);

    expect(messagesApi.executeRoomIntegration).toHaveBeenCalledWith({
      brokerPostId: 'broker-post-1',
      carrierPostId: 'carrier-post-1',
      category: 'setup',
      provider: 'highway',
      label: 'Broker Highway',
      source: 'broker',
    });
    expect(component.selectedRoomSetupReady).toBeTrue();
    expect(component.bookingAssistantEntries.at(-1)?.text).toBe('Broker Highway setup is staged.');
  });

  it('falls back to local setup choices when the room integration lookup fails', () => {
    spyOn(console, 'warn');
    const messagesApi = {
      getRoomIntegrationChoices: jasmine.createSpy('getRoomIntegrationChoices').and.returnValue(throwError(() => new Error('lookup failed'))),
    };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginSetupAssist();

    const prompt = component.bookingAssistantEntries.at(-1) as any;
    expect(prompt.actions.map((action: any) => action.label)).toEqual(['Highway', 'MyCarrierPacket', 'Truckstop']);
    expect(prompt.text).toContain('Which setup provider should be staged');
    expect(console.warn).toHaveBeenCalled();
  });

  it('offers tracking choices and marks MacroPoint tracking active from the chat action', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginTrackingAssist();

    const prompt = component.bookingAssistantEntries.at(-1) as any;
    expect(prompt.text).toBe('Tracking is still red. Connect your ELD/API or send MacroPoint?');
    expect(prompt.actions.map((action: any) => action.label)).toEqual(['Connect ELD', 'Send MacroPoint']);

    component.runBookingAssistantAction(prompt.actions[1] as any);

    expect(component.selectedRoomTrackingReady).toBeTrue();
    expect(component.selectedRoomTrackingLabel).toContain('MacroPoint');
  });

  it('uses connected broker tracking and carrier ELD choices from the room integration lookup', () => {
    const messagesApi = {
      getRoomIntegrationChoices: jasmine.createSpy('getRoomIntegrationChoices').and.returnValue(of({
        setup: [],
        tracking: [
          { provider: 'macropoint', label: 'Broker MacroPoint', source: 'broker', category: 'tracking' },
          { provider: 'samsara', label: 'Carrier ELD', source: 'carrier', category: 'eld' },
        ],
      })),
      executeRoomIntegration: jasmine.createSpy('executeRoomIntegration').and.returnValue(of({
        status: 'staged',
        mode: 'configured',
        provider: 'macropoint',
        label: 'Broker MacroPoint',
        category: 'tracking',
        source: 'broker',
        message: 'Broker MacroPoint tracking is staged.',
      })),
    };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginTrackingAssist();

    expect(messagesApi.getRoomIntegrationChoices).toHaveBeenCalledWith({
      brokerPostId: 'broker-post-1',
      carrierPostId: 'carrier-post-1',
    });
    const prompt = component.bookingAssistantEntries.at(-1) as any;
    expect(prompt.text).toContain('Tracking can be started through broker tracking or carrier ELD');
    expect(prompt.actions.map((action: any) => action.label)).toEqual(['Broker MacroPoint', 'Carrier ELD']);
  });

  it('executes the selected tracking provider through the backend adapter before turning tracking green', () => {
    const messagesApi = {
      getRoomIntegrationChoices: jasmine.createSpy('getRoomIntegrationChoices').and.returnValue(of({
        setup: [],
        tracking: [{ provider: 'macropoint', label: 'Broker MacroPoint', source: 'broker', category: 'tracking' }],
      })),
      executeRoomIntegration: jasmine.createSpy('executeRoomIntegration').and.returnValue(of({
        status: 'staged',
        mode: 'configured',
        provider: 'macropoint',
        label: 'Broker MacroPoint',
        category: 'tracking',
        source: 'broker',
        message: 'Broker MacroPoint tracking is staged.',
      })),
    };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginTrackingAssist();
    const prompt = component.bookingAssistantEntries.at(-1) as any;
    component.runBookingAssistantAction(prompt.actions[0]);

    expect(messagesApi.executeRoomIntegration).toHaveBeenCalledWith({
      brokerPostId: 'broker-post-1',
      carrierPostId: 'carrier-post-1',
      category: 'tracking',
      provider: 'macropoint',
      label: 'Broker MacroPoint',
      source: 'broker',
    });
    expect(component.selectedRoomTrackingReady).toBeTrue();
    expect(component.bookingAssistantEntries.at(-1)?.text).toBe('Broker MacroPoint tracking is staged.');
  });

  it('falls back to local tracking choices when the room integration lookup fails', () => {
    spyOn(console, 'warn');
    const messagesApi = {
      getRoomIntegrationChoices: jasmine.createSpy('getRoomIntegrationChoices').and.returnValue(throwError(() => new Error('lookup failed'))),
    };
    const component = createComponent({ messagesApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginTrackingAssist();

    const prompt = component.bookingAssistantEntries.at(-1) as any;
    expect(prompt.text).toBe('Tracking is still red. Connect your ELD/API or send MacroPoint?');
    expect(prompt.actions.map((action: any) => action.label)).toEqual(['Connect ELD', 'Send MacroPoint']);
    expect(console.warn).toHaveBeenCalled();
  });

  it('marks MacroPoint tracking active from a typed booking assistant reply', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginTrackingAssist();
    component.chatbbPrompt = 'MacroPoint';
    component.sendChatbbMessage();

    expect(component.selectedRoomTrackingReady).toBeTrue();
    expect(component.selectedRoomTrackingLabel).toContain('MacroPoint');
  });

  it('opens route intelligence from booking chat tracking commands', () => {
    const chatbbApi = {
      createMessage: jasmine.createSpy('createMessage').and.returnValue(of({
        userMessage: { sender: 'user', text: 'show tracking map' },
        assistantMessage: { sender: 'assistant', text: 'ChatBB fallback should not answer route intelligence commands.' },
      })),
    };
    const component = createComponent({ chatbbApi });
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    const room = createRoom({ id: 'booking-1', loadId: 'LD-4721', bookingStatus: 'booked' });
    component.rooms = [room as any];
    component.selectedRoomId = room.id;
    component.directWorkflow = {
      [room.id]: {
        brokerApproved: true,
        carrierApproved: true,
        consoleOpened: true,
        setupProvider: 'Highway',
        driverId: 'drv-bob',
        driverName: 'Bob Carter',
        truckLabel: 'Unit 12',
        trackingShared: true,
        contactSaved: true,
        delivered: false,
        trackingProvider: 'MacroPoint',
      },
    };
    component.loads = [
      createLoad({
        _id: 'LD-4721',
        reference: 'LD-4721',
        lane: { origin: 'Chicago, IL', destination: 'Memphis, TN' },
        equipmentLabel: 'V 53',
        weight: 42000,
        rate: 2500,
        status: 'active',
        broker: { companyName: 'Brooke Broker' },
        carrier: { companyName: 'Warrior Freight' },
        driver: { name: 'Bob Carter', truckLabel: 'Unit 12' },
        source: { brokerPostId: room.brokerPostId, carrierPostId: room.carrierPostId },
      }) as any,
    ];

    component.chatbbPrompt = 'show tracking map';
    component.sendChatbbMessage();

    const routePanel = (component as any).routeIntelligencePanel;
    expect(chatbbApi.createMessage).not.toHaveBeenCalled();
    expect(routePanel.open).toBeTrue();
    expect(routePanel.source).toBe('booking');
    expect(routePanel.trackingProvider).toBe('MacroPoint');
    expect(routePanel.trackingStatus).toBe('live');
    expect(routePanel.routeProvider).toContain('booked load');
    expect(Array.isArray(routePanel.hazmatNotes)).toBeTrue();
    expect(routePanel.hazmatNotes.join(' ')).toContain('estimated until live routing provider data is connected');
  });

  it('opens route intelligence when tracking is allowed from the booking confirmation reply', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    const workflow = (component as any).ensureDirectRoomWorkflow('room-1');
    workflow.trackingProvider = 'ELD API';
    component.bookingAssistantAction = 'trackingAllow';

    component.chatbbPrompt = 'yes';
    component.sendChatbbMessage();

    expect(component.routeIntelligencePanel.open).toBeTrue();
    expect(component.routeIntelligencePanel.trackingStatus).toBe('live');
    expect(component.routeTrackingLabel()).toContain('Tracking connected');
    expect(component.routeTrackingLabel()).not.toContain('live');
  });

  it('hides route intelligence outside the matching and booking workspaces', async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;
    component.ngOnInit = () => undefined;
    component.loading = false;
    component.user = userWithRole('broker');
    component.activeTab = 'dispatch';
    component.routeIntelligencePanel = {
      open: true,
      source: 'matching',
      laneLabel: 'Chicago, IL -> Memphis, TN',
      originLabel: 'Chicago, IL',
      destinationLabel: 'Memphis, TN',
      stops: [],
      truckLocationLabel: 'Chicago, IL',
      deadheadMiles: 10,
      loadedMiles: 530,
      totalMiles: 540,
      postedRate: 2500,
      suggestedRate: 2500,
      fuelEstimate: null,
      tollEstimate: null,
      routeProvider: 'Estimated from posted lane data',
      trackingProvider: null,
      trackingStatus: 'notConnected',
      hazmatNotes: ['Hazmat route review is estimated.'],
    } as any;

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.route-intelligence-panel')).toBeNull();
  });

  it('opens the ELD token prompt from a typed booking assistant reply', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.beginTrackingAssist();
    component.chatbbPrompt = 'Connect ELD';
    component.sendChatbbMessage();

    expect(component.bookingAssistantEntries.at(-1)?.text).toContain('Paste the ELD');
  });

  it('keeps delivered red and explains the missing live load when no load exists', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.markSelectedBookingDelivered();

    expect(component.selectedRoomDeliveredReady).toBeFalse();
    expect(component.bookingAssistantEntries.at(-1)?.text).toContain('live load');
  });

  it('moves saved booking contacts into Main chat and selects that contact', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    component.saveCurrentBrokerContact();

    expect(component.activeDirectConsoleView).toBe('main');
    expect(component.selectedBrokerContactId).toBe('contact-room-1');
    expect(component.selectedRoomContactReady).toBeTrue();
  });

  it('reuses an existing Direct Chat contact when saving a broker from Booking Chat', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.directContacts = [{
      id: 'contact-existing',
      roomId: null,
      contactName: 'Saved Brooke',
      companyName: 'Coyote Logistics',
      email: 'broker@prometheus.test',
      phone: '312-555-0100',
      savedAt: '2026-05-03T12:00:00.000Z',
      status: 'saved',
    } as any];
    component.rooms = [createRoom({
      id: 'room-1',
      contactName: 'Brooke Broker',
      companyName: 'Coyote Logistics',
      contactEmail: 'broker@prometheus.test',
    }) as any];

    component.saveCurrentBrokerContact();

    expect(component.directContacts.length).toBe(1);
    expect(component.directContacts[0]).toEqual(jasmine.objectContaining({
      id: 'contact-existing',
      roomId: 'room-1',
      contactName: 'Brooke Broker',
    }));
    expect(component.selectedBrokerContactId).toBe('contact-existing');
    expect(component.activeDirectConsoleView).toBe('main');
  });

  it('filters Direct Chat search by email, contact name, company, and phone', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.directContacts = [
      {
        id: 'contact-coyote',
        roomId: null,
        contactName: 'Brooke Broker',
        companyName: 'Coyote Logistics',
        email: 'brooke@coyote.test',
        phone: '312-555-0100',
        savedAt: '2026-05-03T12:00:00.000Z',
        status: 'saved',
      } as any,
      {
        id: 'contact-echo',
        roomId: null,
        contactName: 'Eli Echo',
        companyName: 'Echo Freight',
        email: 'eli@echo.test',
        phone: '773-555-0220',
        savedAt: '2026-05-03T12:05:00.000Z',
        status: 'saved',
      } as any,
    ];

    (component as any).directContactSearch = 'coyote';
    expect((component as any).directSearchResults.map((entry: any) => entry.id)).toEqual(['contact-coyote']);

    (component as any).directContactSearch = 'Eli';
    expect((component as any).directSearchResults.map((entry: any) => entry.id)).toEqual(['contact-echo']);

    (component as any).directContactSearch = 'brooke@';
    expect((component as any).directSearchResults.map((entry: any) => entry.id)).toEqual(['contact-coyote']);

    (component as any).directContactSearch = '773';
    expect((component as any).directSearchResults.map((entry: any) => entry.id)).toEqual(['contact-echo']);
  });

  it('adds a live Direct Chat search result to contacts and opens it', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.rooms = [createRoom({ id: 'room-1', contactName: 'Brooke Broker', companyName: 'Coyote Logistics' }) as any];
    const liveEntry = component.brokerDeskEntries[0];

    (component as any).saveBrokerDeskEntryContact(liveEntry);

    expect(component.directContacts.some((entry) => entry.roomId === 'room-1' && entry.companyName === 'Coyote Logistics')).toBeTrue();
    expect(component.selectedBrokerContactId).toBe('contact-room-1');
    expect(component.activeDirectConsoleView).toBe('main');
  });

  it('mutes a selected Direct Chat contact while keeping it visible', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.directContacts = [{
      id: 'contact-coyote',
      roomId: null,
      contactName: 'Brooke Broker',
      companyName: 'Coyote Logistics',
      email: 'brooke@coyote.test',
      phone: '',
      savedAt: '2026-05-03T12:00:00.000Z',
      status: 'saved',
    } as any];
    component.selectedBrokerContactId = 'contact-coyote';

    (component as any).muteSelectedBrokerConversation();

    expect(component.directContacts[0] as any).toEqual(jasmine.objectContaining({ muted: true }));
    expect((component as any).visibleBrokerDeskEntries.map((entry: any) => entry.id)).toContain('contact-coyote');
  });

  it('archives a selected Direct Chat contact until archived contacts are shown', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.directContacts = [{
      id: 'contact-coyote',
      roomId: null,
      contactName: 'Brooke Broker',
      companyName: 'Coyote Logistics',
      email: 'brooke@coyote.test',
      phone: '',
      savedAt: '2026-05-03T12:00:00.000Z',
      status: 'saved',
    } as any];
    component.selectedBrokerContactId = 'contact-coyote';

    (component as any).archiveSelectedBrokerConversation();

    expect((component as any).visibleBrokerDeskEntries.map((entry: any) => entry.id)).not.toContain('contact-coyote');

    (component as any).showArchivedDirectContacts = true;
    expect((component as any).visibleBrokerDeskEntries.map((entry: any) => entry.id)).toContain('contact-coyote');
  });

  it('deletes a Direct Chat contact locally without removing the live booking room', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.rooms = [createRoom({ id: 'room-1', contactEmail: 'broker@prometheus.test' }) as any];
    component.selectedRoomId = 'room-1';
    component.selectedBrokerContactId = 'room-1';
    component.directWorkflow = {
      'room-1': {
        setupProvider: 'Highway',
        driverId: 'driver-1',
        driverName: 'Bob Carter',
        truckLabel: 'Unit 42',
        trackingProvider: 'MacroPoint',
        trackingShared: true,
        delivered: false,
        brokerApproved: true,
        carrierApproved: true,
        consoleOpened: true,
      },
    };

    (component as any).deleteSelectedBrokerConversation();

    expect(component.rooms.length).toBe(1);
    expect(component.directWorkflow['room-1']).toEqual(jasmine.objectContaining({
      setupProvider: 'Highway',
      driverId: 'driver-1',
      trackingShared: true,
      consoleOpened: true,
    }));
    expect((component as any).visibleBrokerDeskEntries.some((entry: any) => entry.roomId === 'room-1')).toBeFalse();
  });

  it('exposes readiness from booking workflow state for the left-side booking buttons', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];

    expect(component.selectedRoomSetupReady).toBeFalse();
    expect(component.selectedRoomDriverReady).toBeFalse();
    expect(component.selectedRoomContactReady).toBeFalse();
    expect(component.selectedRoomTrackingReady).toBeFalse();
    expect(component.selectedRoomDeliveredReady).toBeFalse();

    component.chooseSetupProvider('highway' as any);
    component.assignDriverToSelectedRoom((component as any).driverRoster[0]);
    component.saveCurrentBrokerContact();
    component.runBookingAssistantAction({ type: 'sendMacroPoint', label: 'Send MacroPoint' } as any);
    (component as any).ensureDirectRoomWorkflow('room-1').delivered = true;

    expect(component.selectedRoomSetupReady).toBeTrue();
    expect(component.selectedRoomDriverReady).toBeTrue();
    expect(component.selectedRoomContactReady).toBeTrue();
    expect(component.selectedRoomTrackingReady).toBeTrue();
    expect(component.selectedRoomDeliveredReady).toBeTrue();
  });

  it('keeps cancel load red and asks to reject approval when no live load exists', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];

    component.beginCancellationAssist();

    expect(component.bookingAssistantEntries.at(-1)?.text).toContain('Reject the offer or cancel the approval');
  });

  it('keeps approval actions available after no-live-load cancellation guidance', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'negotiating' }) as any];

    component.beginCancellationAssist();

    const entries = component.bookingAssistantEntries as any[];
    expect(entries.at(-1)?.text).toContain('Reject the offer or cancel the approval');
    const approvalPrompt = entries.find((entry) => entry.id === 'booking-approval-room-1');
    expect(approvalPrompt?.actions.map((action: any) => action.label)).toEqual(['Approve booking', 'Reject offer']);
  });

  it('moves a canceled load waiting on TONU to library', () => {
    const updatedLoad = createLoad({ status: 'library' });
    const loadsApi = {
      updateLoad: jasmine.createSpy('updateLoad').and.returnValue(of(updatedLoad)),
    };
    const component = createComponent({ loadsApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'active' }) as any];

    component.beginCancellationAssist();
    const prompt = component.bookingAssistantEntries.at(-1) as any;
    component.runBookingAssistantAction(prompt.actions[0]);

    expect(loadsApi.updateLoad).toHaveBeenCalledWith(
      'load-1',
      { status: 'library', statusNote: 'Waiting on TONU after broker cancellation.' }
    );
  });

  it('moves a canceled load waiting on TONU to library from a typed booking assistant reply', () => {
    const updatedLoad = createLoad({ status: 'library' });
    const loadsApi = {
      updateLoad: jasmine.createSpy('updateLoad').and.returnValue(of(updatedLoad)),
    };
    const component = createComponent({ loadsApi });
    component.user = userWithRole('carrier');
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'active' }) as any];

    component.beginCancellationAssist();
    component.chatbbPrompt = 'waiting on TONU';
    component.sendChatbbMessage();

    expect(loadsApi.updateLoad).toHaveBeenCalledWith(
      'load-1',
      { status: 'library', statusNote: 'Waiting on TONU after broker cancellation.' }
    );
  });

  it('does not append TONU success guidance when library update fails', () => {
    const loadsApi = {
      updateLoad: jasmine.createSpy('updateLoad').and.returnValue(throwError(() => ({ error: { message: 'tonu update failed' } }))),
    };
    const component = createComponent({ loadsApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'active' }) as any];

    component.beginCancellationAssist();
    const prompt = component.bookingAssistantEntries.at(-1) as any;
    component.runBookingAssistantAction(prompt.actions[0]);

    expect(component.loadError).toContain('tonu update failed');
    expect(component.bookingAssistantEntries.some((entry) => entry.text.includes('stay in Library'))).toBeFalse();
  });

  it('removes an active load when cancel now is selected', () => {
    const loadsApi = {
      deleteLoad: jasmine.createSpy('deleteLoad').and.returnValue(of({ deleted: true, loadId: 'load-1' })),
    };
    const component = createComponent({ loadsApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'active' }) as any];

    component.beginCancellationAssist();
    const prompt = component.bookingAssistantEntries.at(-1) as any;
    component.runBookingAssistantAction(prompt.actions[1]);

    expect(loadsApi.deleteLoad).toHaveBeenCalledWith('load-1');
    expect(component.loads.length).toBe(0);
  });

  it('does not append cancel-now success guidance when delete fails', () => {
    const loadsApi = {
      deleteLoad: jasmine.createSpy('deleteLoad').and.returnValue(throwError(() => ({ error: { message: 'delete failed' } }))),
    };
    const component = createComponent({ loadsApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'active' }) as any];

    component.beginCancellationAssist();
    const prompt = component.bookingAssistantEntries.at(-1) as any;
    component.runBookingAssistantAction(prompt.actions[1]);

    expect(component.loadError).toContain('delete failed');
    expect(component.loads.length).toBe(1);
    expect(component.bookingAssistantEntries.some((entry) => entry.text.includes('being removed'))).toBeFalse();
  });

  it('only allows the Loads Console handoff after delivery is green', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'active' }) as any];

    expect((component as any).selectedRoomCanSendToLoadsConsole).toBeFalse();

    (component as any).ensureDirectRoomWorkflow('room-1').delivered = true;

    expect((component as any).selectedRoomCanSendToLoadsConsole).toBeTrue();

    (component as any).sendSelectedLoadToLoadsConsole();

    expect(component.activeTab).toBe('loads');
    expect(component.loadConsoleView).toBe('readyToBill');
  });

  it('asks for delivery confirmation with chat actions before marking delivered', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'active' }) as any];

    component.markSelectedBookingDelivered();

    const prompt = component.bookingAssistantEntries.at(-1) as any;
    expect(prompt.actions.map((action: any) => action.label)).toEqual(['Mark delivered', 'Keep active']);
  });

  it('moves a live booking to ready-to-bill only after delivered confirmation', () => {
    const updatedLoad = createLoad({ status: 'readyToBill' });
    const loadsApi = {
      updateLoad: jasmine.createSpy('updateLoad').and.returnValue(of(updatedLoad)),
    };
    const component = createComponent({ loadsApi });
    component.user = userWithRole('carrier');
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'active' }) as any];

    component.markSelectedBookingDelivered();
    const prompt = component.bookingAssistantEntries.at(-1) as any;
    component.runBookingAssistantAction(prompt.actions[0]);

    expect(loadsApi.updateLoad).toHaveBeenCalledWith(
      'load-1',
      { status: 'readyToBill', statusNote: 'Delivered from Booking chat. Ready for billing review.' }
    );
    expect(component.selectedRoomDeliveredReady).toBeTrue();
  });

  it('keeps send-to-loads-console unavailable until delivered is green', () => {
    const component = createComponent();
    component.user = userWithRole('carrier');
    component.activeTab = 'direct';
    component.activeDirectConsoleView = 'booking';
    component.selectedRoomId = 'room-1';
    component.rooms = [createRoom({ id: 'room-1', bookingStatus: 'booked' }) as any];
    component.loads = [createLoad({ status: 'active' }) as any];

    component.sendSelectedLoadToLoadsConsole();

    expect(component.activeTab).toBe('direct');
    expect(component.loadError).toContain('Mark this booking delivered');
  });

  it('keeps finished loads visible after ready-to-bill is completed', () => {
    const updatedLoad = createLoad({ status: 'archived' });
    const loadsApi = {
      updateLoad: jasmine.createSpy('updateLoad').and.returnValue(of(updatedLoad)),
    };
    const component = createComponent({ loadsApi });
    const readyLoad = createLoad({ status: 'readyToBill' }) as any;
    component.loads = [readyLoad];

    component.finishReadyToBillLoad((component as any).buildLoadBoardItem(readyLoad));

    expect(loadsApi.updateLoad).toHaveBeenCalledWith('load-1', { status: 'archived', statusNote: undefined });
    expect(component.loadConsoleView).toBe('archived');
    expect(component.archivedLoads.length).toBe(1);
    expect(component.loadMessage).toContain('future TMS export connector');
  });

  it('includes finished loads in the Loads Console metrics', () => {
    const component = createComponent();
    component.loads = [
      createLoad({ _id: 'active-load', status: 'active' }) as any,
      createLoad({ _id: 'archived-load', status: 'archived' }) as any,
    ];

    const finishedMetric = component.loadBoardMetrics.find((metric) => metric.title === 'Finished');

    expect(finishedMetric?.count).toBe(1);
    expect(finishedMetric?.note).toContain('Completed');
  });

  const createRoom = (overrides: Record<string, any> = {}) => ({
    id: 'room-1',
    lane: 'Chicago, IL -> Memphis, TN',
    equipmentLabel: "V 53'",
    contactName: 'Brooke Broker',
    contactEmail: 'broker@prometheus.test',
    contactPhone: '',
    companyName: 'Coyote Logistics',
    companyMc: null,
    post: {} as any,
    messages: [],
    seen: { brokerCount: 0, carrierCount: 0 },
    maxBid: 3000,
    lastMessageAt: null,
    brokerPostId: 'broker-post-1',
    carrierPostId: 'carrier-post-1',
    brokerId: 'broker-user',
    carrierId: 'carrier-user',
    sameId: false,
    bookingStatus: 'negotiating',
    brokerApprovedBooking: false,
    carrierApprovedBooking: false,
    bookingConfirmedAt: null,
    bookingConfirmedBy: null,
    bookingRate: 3000,
    bookingNotes: null,
    loadId: null,
    bookingCancelledAt: null,
    bookingStatusUpdatedAt: null,
    bookingStatusUpdatedBy: null,
    ...overrides,
  });

  const createPost = (overrides: Record<string, any> = {}) => ({
    _id: 'post-1',
    origin: { type: 'place', place: 'Chicago, IL' },
    destination: { type: 'place', place: 'Memphis, TN' },
    equipment: ['V'],
    weight: 42000,
    publishedAt: new Date().toISOString(),
    ...overrides,
  });

  const createLoad = (overrides: Record<string, any> = {}) => ({
    _id: 'load-1',
    companyId: 'company-1',
    createdBy: 'broker-user',
    creatorRole: 'broker',
    loadNumber: 'LD-1',
    reference: 'LD-1',
    status: 'active',
    lane: { origin: 'Chicago, IL', destination: 'Memphis, TN' },
    source: { brokerPostId: 'broker-post-1', carrierPostId: 'carrier-post-1' },
    broker: {},
    carrier: {},
    driver: {},
    dispatch: { assignedDispatcherId: '', assignedDispatcherName: '', assignedDispatcherEmail: '' },
    ...overrides,
  });
});
