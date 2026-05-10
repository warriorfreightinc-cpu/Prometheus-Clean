import { BadRequestException } from "@nestjs/common";
import { ChatbbService } from "./chatbb.service";

describe("ChatbbService", () => {
  const createModel = () => ({
    findOne: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  });

  it("rejects preview room ids before creating a ChatBB thread", async () => {
    const threadModel = createModel();
    const service = new ChatbbService(
      threadModel as any,
      createModel() as any,
      createModel() as any,
      createModel() as any
    );

    await expect(
      service.sendMessage(
        { _id: "user-1", role: "broker", companyId: "company-1" },
        "preview-room-1-carrier",
        "preview-room-1-broker",
        "do you have anything out of Memphis?"
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(threadModel.findOne).not.toHaveBeenCalled();
    expect(threadModel.create).not.toHaveBeenCalled();
  });
});
