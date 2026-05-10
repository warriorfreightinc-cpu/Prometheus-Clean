import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface GeocodeResult {
  found: boolean;
  provider: string;
  input: string;
  formattedAddress: string | null;
  city?: string;
  state?: string;
  country?: string;
  location: {
    lat: number;
    lng: number;
  } | null;
}

@Injectable({ providedIn: 'root' })
export class LocationApiService {
  constructor(private readonly http: HttpClient) {}

  geocodePlace(payload: { input?: string; city?: string; state?: string; country?: string }): Observable<GeocodeResult> {
    return this.http.post<GeocodeResult>('geocode', payload);
  }
}
