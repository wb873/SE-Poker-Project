const AdController = require("../controller/AdController");

describe("AdController.getAd", () => {
  afterEach(() => jest.restoreAllMocks());

  test("returns a placeholder ad", () => {
    const res = { json: jest.fn() };
    AdController.getAd({}, res);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(true);
    expect(AdController.PLACEHOLDER_ADS).toContainEqual(body.ad);
  });

  test("picks the ad using the random number", () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    const res = { json: jest.fn() };
    AdController.getAd({}, res);
    expect(res.json.mock.calls[0][0].ad).toEqual(AdController.PLACEHOLDER_ADS[0]);
  });
});