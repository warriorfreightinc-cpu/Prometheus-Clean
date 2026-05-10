import * as nodemailer from "nodemailer";
import { UserService } from "./user.service";

const sendMail = jest.fn();

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail
  }))
}));

describe("UserService", () => {
  const userModel: any = {};
  const companyModel: any = {};
  const jwtService: any = {};
  const gateway: any = {};

  function createService() {
    return new UserService(userModel, companyModel, jwtService, gateway);
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not reject when local email delivery is unavailable", async () => {
    sendMail.mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:1025"));
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      (createService() as any).sendEmail(
        ["dispatcher@prometheus.test"],
        "Create password",
        "<p>Create your password</p>"
      )
    ).resolves.toBeUndefined();

    expect(nodemailer.createTransport).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "Email not sent:",
      "connect ECONNREFUSED 127.0.0.1:1025"
    );

    errorSpy.mockRestore();
  });
});
