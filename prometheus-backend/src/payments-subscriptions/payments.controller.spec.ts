import {
  BadRequestException,
  MethodNotAllowedException,
  UnauthorizedException,
} from "@nestjs/common";

jest.mock("src/company/company.service", () => ({
  CompanyService: class CompanyService {},
}), { virtual: true });

jest.mock("src/shared/decorators/public.decorator", () => ({
  Public: () => () => undefined,
}), { virtual: true });

jest.mock("src/shared/decorators/roles.decorator", () => ({
  Roles: () => () => undefined,
}), { virtual: true });

import { PaymentController } from "./payments.controller";

describe("PaymentController", () => {
  const stripeClient: any = {
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
      },
    },
    billingPortal: {
      sessions: {
        create: jest.fn(),
      },
    },
    products: {
      list: jest.fn(),
    },
    invoices: {
      retrieveUpcoming: jest.fn(),
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
  };
  const companyService: any = {
    get: jest.fn(),
    setSubscriptionCustomer: jest.fn(),
    updateSubscription: jest.fn(),
    failedSubscription: jest.fn(),
  };

  function controller() {
    return new PaymentController(stripeClient, {} as any, companyService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STRIPE_RETURN_URL = "http://localhost:4300/workspace";
    process.env.STRIPE_TRIAL_DAYS = "";
    process.env.STRIPE_WEBHOOKS_KEY = "whsec_test";
  });

  it("creates checkout for the company customer with a validated seat quantity", async () => {
    companyService.get.mockResolvedValue({
      _id: "company-1",
      name: "Prometheus Logistics",
      email: "ops@example.com",
      phone: "555-0100",
      onboarding: { requestedSeats: 4 },
      subscription: {},
    });
    stripeClient.customers.create.mockResolvedValue({ id: "cus_123" });
    companyService.setSubscriptionCustomer.mockResolvedValue({
      subscription: { customer: "cus_123" },
    });
    stripeClient.customers.retrieve.mockResolvedValue({ id: "cus_123", subscriptions: { data: [] } });
    stripeClient.checkout.sessions.create.mockResolvedValue({
      id: "cs_test_123",
      url: "https://checkout.stripe.test/session",
    });

    const result = await controller().createCheckoutSession(
      { priceId: "price_123", quantity: "2" },
      { user: { companyId: "company-1" } }
    );

    expect(stripeClient.customers.create).toHaveBeenCalledWith({
      name: "Prometheus Logistics",
      email: "ops@example.com",
      phone: "555-0100",
      metadata: { companyId: "company-1" },
    });
    expect(stripeClient.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "subscription",
        customer: "cus_123",
        line_items: [{ price: "price_123", quantity: 2 }],
        success_url: "http://localhost:4300/workspace?payment=success&session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "http://localhost:4300/workspace?payment=cancelled",
        subscription_data: expect.objectContaining({
          metadata: { companyId: "company-1" },
        }),
      })
    );
    expect(stripeClient.checkout.sessions.create.mock.calls[0][0].subscription_data.trial_period_days).toBeUndefined();
    expect(result).toEqual({
      sessionId: "cs_test_123",
      sessionUrl: "https://checkout.stripe.test/session",
    });
  });

  it("rejects checkout without a price id or valid seat quantity", async () => {
    await expect(
      controller().createCheckoutSession(
        { priceId: "", quantity: 0 },
        { user: { companyId: "company-1" } }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("opens the billing portal for companies with a Stripe customer", async () => {
    companyService.get.mockResolvedValue({
      subscription: { customer: "cus_123" },
    });
    stripeClient.billingPortal.sessions.create.mockResolvedValue({
      url: "https://billing.stripe.test/session",
    });

    const result = await controller().GetPortalSessionUrl({ user: { companyId: "company-1" } });

    expect(stripeClient.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "http://localhost:4300/workspace?payment=portal",
    });
    expect(result).toEqual({ sessionUrl: "https://billing.stripe.test/session" });
  });

  it("keeps local setup usable when Stripe product lookup is not configured yet", async () => {
    stripeClient.products.list.mockRejectedValue(new Error("Invalid API Key provided"));

    await expect(controller().getProducts()).resolves.toEqual([]);
  });

  it("does not open the billing portal before a Stripe customer exists", async () => {
    companyService.get.mockResolvedValue({ subscription: {} });

    await expect(
      controller().GetPortalSessionUrl({ user: { companyId: "company-1" } })
    ).rejects.toBeInstanceOf(MethodNotAllowedException);
  });

  it("rejects webhooks when the Stripe signature cannot be verified", async () => {
    stripeClient.webhooks.constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });

    await expect(
      controller().StripeWebhook({ headers: { "stripe-signature": "bad" }, body: Buffer.from("{}") })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
