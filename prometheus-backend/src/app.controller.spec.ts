import { throwError } from "rxjs";
import { AppController } from "./app.controller";

describe("AppController geocode", () => {
  const createController = () => {
    const http = {
      get: jest.fn().mockReturnValue(throwError(() => new Error("provider unavailable"))),
    };
    const controller = new AppController({} as any, {} as any, http as any, {} as any);
    return { controller, http };
  };

  beforeEach(() => {
    delete process.env.AgmCoreModule;
  });

  it("falls back to local city data when external geocoding is unavailable", async () => {
    const { controller, http } = createController();

    await expect(
      controller.geocodePlace({ city: "Chicago", state: "IL", country: "USA" })
    ).resolves.toEqual(
      expect.objectContaining({
        found: true,
        provider: "local-city-data",
        city: "Chicago",
        state: "IL",
        location: expect.objectContaining({
          lat: expect.any(Number),
          lng: expect.any(Number),
        }),
      })
    );
    expect(http.get).not.toHaveBeenCalled();
  });

  it("falls back to local ZIP and state data for smoke-test searches", async () => {
    const { controller } = createController();

    await expect(controller.geocodePlace({ input: "98101", country: "USA" })).resolves.toEqual(
      expect.objectContaining({
        found: true,
        provider: "local-city-data",
        city: "Seattle",
        state: "WA",
      })
    );
    await expect(controller.geocodePlace({ state: "WA", country: "USA" })).resolves.toEqual(
      expect.objectContaining({
        found: true,
        provider: "local-city-data",
        state: "WA",
      })
    );
    await expect(controller.geocodePlace({ input: "40202", country: "USA" })).resolves.toEqual(
      expect.objectContaining({
        found: true,
        provider: "local-city-data",
        city: "Louisville",
        state: "KY",
      })
    );
  });
});
