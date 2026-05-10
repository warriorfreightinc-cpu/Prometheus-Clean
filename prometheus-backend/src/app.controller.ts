import { HttpService } from "@nestjs/axios";
import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req, Sse } from "@nestjs/common";
import { ApiExcludeController, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { InjectStripe } from "nestjs-stripe";
import { Observable, firstValueFrom, map } from "rxjs";
import Stripe from "stripe";
import { AppService } from "./app.service";
import { Public } from "./shared/decorators/public.decorator";

import * as states from "../json/state-boundry.json";
import { XMLParser } from "fast-xml-parser";
import { PostBrokerService } from "./post-broker/post.service";

// @ApiTags("api")
@ApiExcludeController()
@Controller()
export class AppController {


  private parser = new XMLParser({
    ignoreAttributes: false,
    //attributeNamePrefix: '@_',
    parseAttributeValue: true,
  });



  constructor(
    @InjectStripe() private readonly stripeClient: Stripe,
    private service: AppService,
    private http: HttpService,
    private postBrokerService: PostBrokerService
  ) { }

  @Get("health-check")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ status: 200, type: String })
  healthCheck(): string {
    return "OK";
  }

  @Public()
  @Post("geocode")
  async geocodePlace(@Body() body: { input?: string; city?: string; state?: string; country?: string }) {
    const address = [
      body?.input,
      body?.city,
      body?.state,
      body?.country || "USA"
    ]
      .filter((value, index, all) => value && all.indexOf(value) === index)
      .join(", ")
      .trim();

    if (!address) {
      throw new BadRequestException("Address input is required.");
    }

    const googleApiKey = process.env.AgmCoreModule?.trim();

    if (googleApiKey) {
      const response = await firstValueFrom(
        this.http.get("https://maps.googleapis.com/maps/api/geocode/json", {
          params: {
            address,
            key: googleApiKey
          }
        })
      );

      const result = response?.data?.results?.[0];
      const location = result?.geometry?.location;
      if (location && Number.isFinite(Number(location.lat)) && Number.isFinite(Number(location.lng))) {
        return {
          found: true,
          provider: "google-geocode",
          input: address,
          formattedAddress: result.formatted_address ?? address,
          city: body?.city ?? "",
          state: body?.state ?? "",
          country: body?.country || "USA",
          location: {
            lat: Number(location.lat),
            lng: Number(location.lng)
          }
        };
      }
    }

    const response = await firstValueFrom(
      this.http.get("https://nominatim.openstreetmap.org/search", {
        params: {
          q: address,
          format: "jsonv2",
          limit: 1,
          countrycodes: "us"
        },
        headers: {
          "User-Agent": "Prometheus Local Workspace/1.0",
          "Accept-Language": "en-US,en"
        }
      })
    );

    const result = Array.isArray(response?.data) ? response.data[0] : null;
    if (!result) {
      return {
        found: false,
        provider: "nominatim",
        input: address,
        formattedAddress: null,
        location: null
      };
    }

    return {
      found: true,
      provider: "nominatim",
      input: address,
      formattedAddress: result.display_name ?? address,
      city: body?.city ?? "",
      state: body?.state ?? "",
      country: body?.country || "USA",
      location: {
        lat: Number(result.lat),
        lng: Number(result.lon)
      }
    };
  }


  @Post('places')
  getPlaces(@Query() params) {
    params.key = process.env.AgmCoreModule;
    let url = "https://maps.googleapis.com/maps/api/place/autocomplete/json"
    return this.http.post(url, {}, { params }).pipe(
      map((res: any) => res.data)
    )
  }

  @Post('distance')
  getDistance(@Body() params) {

    params.key = process.env.AgmCoreModule;
    console.log('[distance] Proxying Distance Matrix request', {
      origins: params?.origins,
      destinations: params?.destinations
    });
    let url = "https://maps.googleapis.com/maps/api/distancematrix/json"
    return this.http.post(url, {}, { params }).pipe(
      map((res: any) => res.data)
    )
  }

  @Get('statesPolygons')
  postPlaceFromGeocode(@Body() params) {
    let stateObj = (states as any)
    let keys = Object.keys(stateObj)
    let polygons = [];
    for (let key of keys) {
      polygons.push({ state: stateObj[key].Code, polygon: stateObj[key].Coordinates, visible: false })
    }
    return polygons;
  }
  // for (let key of keys) {
  //   if (stateObj[key].Code === state)
  //     return { name: `${key},${stateObj[key].Country || "USA"}`, code: stateObj[key].Code, polygon: stateObj[key].Coordinates } 
  // }


  // @Get('geocode')
  // getPlaceFromGeocode(@Query() params) {
  //   let url = "https://maps.googleapis.com/maps/api/geocode/json"
  //   return this.http.post(url, {}, { params }).pipe(
  //     map((res: any) =>{ 

  //       res.data})
  //   )
  // }

  @Get('places')
  getPlaceDetails(@Query() params) {
     params.key = process.env.AgmCoreModule;
    let url = "https://maps.googleapis.com/maps/api/place/details/json"
    return this.http.get(url, { params }).pipe(
      map((res: any) => res.data)
    )

  }

  @Public()
  @Get('states')
  getStates(@Query() params) {

    let stateObj = (states as any)
    let keys = Object.keys(stateObj)
    for (let key of keys) {
      if (stateObj[key].Code == params.input)
        return { name: `${key},${stateObj[key].Country || "USA"}`, code: stateObj[key].Code, polygon: stateObj[key].Coordinates }

    }


  }

  @Public()
  @Get('states/list')
  getStatesList(@Query() params) {

    let stateObj = (states as any)
    let keys = Object.keys(stateObj)

    return keys.map(key => {
      return { country: `${stateObj[key].Country || "USA"}`, code: stateObj[key].Code }
    })

  }

  @Sse('sse')
  sse(): Observable<any> {
    return this.service.subscribe("ignat");
  }

  @Public()
  @Post("loadboardnetwork")
  async loadboardWebhook(@Req() req) {

    const rawInput = req.body instanceof Buffer ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : "";
    const raw = rawInput?.trim();
    if (!raw || !raw.trim()) {
      throw new BadRequestException('Empty XML body');
    }
    try {
      const parsed = this.parser.parse(raw ?? '');

      const loadCount = Array.isArray(parsed?.LBNLoadPostings?.PostLoads?.load)
        ? parsed.LBNLoadPostings.PostLoads.load.length
        : parsed?.LBNLoadPostings?.PostLoads?.load
          ? 1
          : 0;
      const removeCount = Array.isArray(parsed?.LBNLoadPostings?.RemoveLoads?.load)
        ? parsed.LBNLoadPostings.RemoveLoads.load.length
        : parsed?.LBNLoadPostings?.RemoveLoads?.load
          ? 1
          : 0;
      console.log('[LoadboardWebhook] XML parsed', { loads: loadCount, removes: removeCount });

      return await this.postBrokerService.importFromLoadboardPayload(parsed);
    } catch (e) {
      console.error('[loadboardWebhook] Invalid payload', e);
      throw new BadRequestException('Invalid XML');
    }
  }




}
