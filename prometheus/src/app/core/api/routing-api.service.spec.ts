import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RoutingIntelligenceRequest, RoutingIntelligenceResponse } from '../../shared/types/models';
import { RoutingApiService } from './routing-api.service';

describe('RoutingApiService', () => {
  let service: RoutingApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(RoutingApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('posts route intelligence requests to the backend', () => {
    const payload: RoutingIntelligenceRequest = {
      truckLocation: { label: 'Gary, IN', lat: 41.5934, lng: -87.3464 },
      origin: { label: 'Chicago, IL', lat: 41.8781, lng: -87.6298 },
      destination: { label: 'Memphis, TN', lat: 35.1495, lng: -90.049 },
      equipment: ['VZ'],
      weightLbs: 42000,
      postedRate: 2500,
    };
    const response: RoutingIntelligenceResponse = {
      routeProvider: 'fallback-routing',
      providerStatus: 'fallback',
      truckLocationLabel: 'Gary, IN',
      originLabel: 'Chicago, IL',
      destinationLabel: 'Memphis, TN',
      stops: [],
      deadheadMiles: 31,
      loadedMiles: 532,
      totalMiles: 563,
      deadheadDriveMinutes: 45,
      loadedDriveMinutes: 680,
      totalDriveMinutes: 725,
      postedRate: 2500,
      suggestedRate: 2500,
      ratePerLoadedMile: 4.7,
      fuelEstimate: null,
      tollEstimate: null,
      vehicleProfile: { equipment: ['VZ'], hazmat: true, weightLbs: 42000 },
      hazmatNotes: ['Hazmat route restrictions are advisory until a live hazmat routing provider is connected.'],
      providerWarnings: [],
      alternativeRoutes: ['Alternative route details require Google Routes or a hazmat routing provider.'],
    };

    service.getRouteIntelligence(payload).subscribe((result) => {
      expect(result).toEqual(response);
    });

    const req = http.expectOne('routing/intelligence');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);
    req.flush(response);
  });
});
