import { HttpService } from "@nestjs/axios";
import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, InternalServerErrorException, MethodNotAllowedException, Post, Req, UnauthorizedException } from "@nestjs/common";
import { ApiExcludeController, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { InjectStripe } from "nestjs-stripe";
import { CompanyService } from "src/company/company.service";
import { Public } from "src/shared/decorators/public.decorator";
import { Roles } from "src/shared/decorators/roles.decorator";
import Stripe from "stripe";




// @ApiTags("api")
@ApiExcludeController()
@Controller('subscriptions')
export class PaymentController {
  constructor(
    @InjectStripe() private readonly stripeClient: Stripe,
    private http: HttpService,
    private companyService: CompanyService
  ) { }

  @Post()
  @Roles("admin","supervisor")
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ status: 200, type: String })
  async createCheckoutSession(@Body() body, @Req() req) {
    const priceId = String(body.priceId ?? "").trim();
    const quantity = Number(body.quantity);
    if (!priceId) {
      throw new BadRequestException("Stripe price is required.");
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException("Seat quantity must be at least 1.");
    }

    let company = await this.companyService.get(req.user.companyId)
    const companyId = company._id.toString();
    if (!company.subscription?.customer) {
      const createdCustomer = await this.stripeClient.customers.create({
        name: company.name,
        email: company.email,
        phone: company.phone,
        metadata: { companyId }
      });
      company = await this.companyService.setSubscriptionCustomer(companyId, createdCustomer.id);
    }

    let client: any = await this.stripeClient.customers.retrieve(company.subscription.customer, { expand: ['subscriptions'] })

    if (client.subscriptions?.data?.length) {
      throw new MethodNotAllowedException("User has active subscription already")
    }

    const subscriptionData: any = {
      metadata: { companyId }
    };
    const trialDays = Number(process.env.STRIPE_TRIAL_DAYS ?? 0);
    if (Number.isInteger(trialDays) && trialDays > 0) {
      subscriptionData.trial_period_days = trialDays;
    }

    const session: any = await this.stripeClient.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: client.id,

      line_items: [
        {
          price: priceId,
          quantity
        },
      ],
      subscription_data: subscriptionData,
      // {CHECKOUT_SESSION_ID} is a string literal; do not change it!
      // the actual Session ID is returned in the query parameter when your customer
      // is redirected to the success page.
      success_url: this.returnUrl("success"),
      cancel_url: this.returnUrl("cancelled"),

    });
    return { sessionId: session.id, sessionUrl: session.url }
  }

  @Roles("admin","supervisor")
  @Get('portal')
  async GetPortalSessionUrl(@Req() req) {
    try{
      const company = await this.companyService.get(req.user.companyId)
      if (!company.subscription?.customer) {
        throw new MethodNotAllowedException("Company billing is not set up yet.");
      }
      const session = await this.stripeClient.billingPortal.sessions.create({
        customer: company.subscription.customer,
        return_url: this.returnUrl("portal"),
      });
  
      return { sessionUrl: session.url }
    }catch(err){
      if (err instanceof MethodNotAllowedException) {
        throw err;
      }
      throw new InternalServerErrorException()
    }
  }


  @Get("products")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ status: 200, type: String })
  async getProducts() {
    try {
      const products = await this.stripeClient.products.list({ active: true, expand: ["data.default_price", "data.default_price.tiers"] })
      return products.data
    } catch {
      return []
    }
  }


  @Public()
  @Post("stripe_webhooks")
  async StripeWebhook(@Req() req) {

    // ignat const secret = "whsec_de5e829434c0ab9a9e4005db6b6fe39ea287f6b21d2f9f2ba83e26d65a03a120"

    // local data const secret =  "whsec_0febd9f4e57dd5f21f1fd22ff622f543725313d6494fe055f898939a098af71a"
    const secret =  process.env.STRIPE_WEBHOOKS_KEY
    const sig = req.headers['stripe-signature'];

    let event = null
    try {
      event = this.stripeClient.webhooks.constructEvent(req.body, sig, secret);
    } catch (err) {
      throw new UnauthorizedException()
    }

    switch (event.type) {
      case 'customer.subscription.created':
        await this.manageSubscription(event.data.object)
        break;
      case 'customer.subscription.updated':
        await this.manageSubscription(event.data.object)
        break;
      case 'customer.subscription.deleted':
        await this.deleteSubscription(event.data.object)
        break;
      case 'invoice.paid':
        const paidInvoice = event.data.object;
        // Then define and call a function to handle the event invoice.paid
        break;
      case 'invoice.payment_failed':
        await this.failedSubscription(event.data.object)
        // Then define and call a function to handle the event invoice.payment_failed
        break;

      default:
    }

    return { data: "OK" }
  }

  private async manageSubscription(subscription){
    try{
    const endDate = subscription.current_period_end * 1000
    const customer = subscription.customer
    const quantity = this.subscriptionQuantity(subscription);
    const amountDue = await this.upcomingAmountDue(customer);
    await this.companyService.updateSubscription(customer, endDate, quantity, amountDue)
  }catch(err){
    throw new InternalServerErrorException()
  }
  
  }

  private async deleteSubscription(subscription){
    try{
    const customer = subscription.customer
    await this.companyService.updateSubscription(customer, null, null, null)
  }catch(err){
    throw new InternalServerErrorException()
  }
  }

  private async failedSubscription(subscription){
    try{
      const customer = subscription.customer
      await this.companyService.failedSubscription(customer)
    }catch(err){
      throw new InternalServerErrorException()
    }
  }

  private returnUrl(state: "success" | "cancelled" | "portal"): string {
    const baseUrl = (process.env.STRIPE_RETURN_URL || process.env.APP_URL || "http://localhost:4300/workspace").trim();
    const separator = baseUrl.includes("?") ? "&" : "?";
    if (state === "success") {
      return `${baseUrl}${separator}payment=success&session_id={CHECKOUT_SESSION_ID}`;
    }
    return `${baseUrl}${separator}payment=${state}`;
  }

  private subscriptionQuantity(subscription: any): number {
    const directQuantity = Number(subscription?.quantity);
    if (Number.isInteger(directQuantity) && directQuantity > 0) {
      return directQuantity;
    }

    const itemQuantity = Number(subscription?.items?.data?.[0]?.quantity);
    return Number.isInteger(itemQuantity) && itemQuantity > 0 ? itemQuantity : 1;
  }

  private async upcomingAmountDue(customer: string): Promise<number> {
    try {
      const upcomingInvoice = await this.stripeClient.invoices.retrieveUpcoming({customer});
      return Number(upcomingInvoice?.amount_due ?? 0) / 100;
    } catch {
      return 0;
    }
  }

}
