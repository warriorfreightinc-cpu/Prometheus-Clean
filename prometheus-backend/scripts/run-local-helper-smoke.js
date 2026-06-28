const path = require("path");
const { execFileSync } = require("child_process");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const fetch = require("node-fetch");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const DB_URI = process.env.DB_URI || "mongodb://127.0.0.1:27017/prometheus_local";
const API_URL = (process.env.PROMETHEUS_API_URL || "http://127.0.0.1:3100").replace(/\/+$/, "");
const PASSWORD = "Prometheus123!";
const SMOKE_BROKER_PREFIX = "SMOKE-BROKER-";
const SMOKE_CARRIER_PREFIX = "SMOKE-CARRIER-";

const HELPER_USERS = [
  {
    email: "broker.helper1.local@prometheus.test",
    role: "broker",
    firstName: "Brianna",
    lastName: "Broker",
    companyEmail: "broker.company.local@prometheus.test",
    phone: "555-000-1101",
  },
  {
    email: "broker.helper2.local@prometheus.test",
    role: "broker",
    firstName: "Blake",
    lastName: "Broker",
    companyEmail: "broker.company.local@prometheus.test",
    phone: "555-000-1102",
  },
  {
    email: "carrier.dispatch1.local@prometheus.test",
    role: "carrier",
    firstName: "Drew",
    lastName: "Dispatcher",
    companyEmail: "carrier.company.local@prometheus.test",
    phone: "555-000-2101",
  },
  {
    email: "carrier.dispatch2.local@prometheus.test",
    role: "carrier",
    firstName: "Dana",
    lastName: "Dispatcher",
    companyEmail: "carrier.company.local@prometheus.test",
    phone: "555-000-2102",
  },
];

const STATE_FIXTURES = [
  { code: "AL", city: "Birmingham", zip: "35203", lat: 33.5207, lng: -86.8025 },
  { code: "AK", city: "Anchorage", zip: "99501", lat: 61.2181, lng: -149.9003 },
  { code: "AZ", city: "Phoenix", zip: "85004", lat: 33.4484, lng: -112.074 },
  { code: "AR", city: "Little Rock", zip: "72201", lat: 34.7465, lng: -92.2896 },
  { code: "CA", city: "Los Angeles", zip: "90012", lat: 34.0522, lng: -118.2437 },
  { code: "CO", city: "Denver", zip: "80202", lat: 39.7392, lng: -104.9903 },
  { code: "CT", city: "Hartford", zip: "06103", lat: 41.7658, lng: -72.6734 },
  { code: "DE", city: "Wilmington", zip: "19801", lat: 39.7391, lng: -75.5398 },
  { code: "FL", city: "Jacksonville", zip: "32202", lat: 30.3322, lng: -81.6557 },
  { code: "GA", city: "Atlanta", zip: "30303", lat: 33.749, lng: -84.388 },
  { code: "HI", city: "Honolulu", zip: "96813", lat: 21.3069, lng: -157.8583 },
  { code: "ID", city: "Boise", zip: "83702", lat: 43.615, lng: -116.2023 },
  { code: "IL", city: "Chicago", zip: "60601", lat: 41.8781, lng: -87.6298 },
  { code: "IN", city: "Indianapolis", zip: "46204", lat: 39.7684, lng: -86.1581 },
  { code: "IA", city: "Des Moines", zip: "50309", lat: 41.5868, lng: -93.625 },
  { code: "KS", city: "Wichita", zip: "67202", lat: 37.6872, lng: -97.3301 },
  { code: "KY", city: "Louisville", zip: "40202", lat: 38.2527, lng: -85.7585 },
  { code: "LA", city: "New Orleans", zip: "70112", lat: 29.9511, lng: -90.0715 },
  { code: "ME", city: "Portland", zip: "04101", lat: 43.6591, lng: -70.2568 },
  { code: "MD", city: "Baltimore", zip: "21202", lat: 39.2904, lng: -76.6122 },
  { code: "MA", city: "Boston", zip: "02108", lat: 42.3601, lng: -71.0589 },
  { code: "MI", city: "Detroit", zip: "48226", lat: 42.3314, lng: -83.0458 },
  { code: "MN", city: "Minneapolis", zip: "55401", lat: 44.9778, lng: -93.265 },
  { code: "MS", city: "Jackson", zip: "39201", lat: 32.2988, lng: -90.1848 },
  { code: "MO", city: "Kansas City", zip: "64106", lat: 39.0997, lng: -94.5786 },
  { code: "MT", city: "Billings", zip: "59101", lat: 45.7833, lng: -108.5007 },
  { code: "NE", city: "Omaha", zip: "68102", lat: 41.2565, lng: -95.9345 },
  { code: "NV", city: "Las Vegas", zip: "89101", lat: 36.1699, lng: -115.1398 },
  { code: "NH", city: "Manchester", zip: "03101", lat: 42.9956, lng: -71.4548 },
  { code: "NJ", city: "Newark", zip: "07102", lat: 40.7357, lng: -74.1724 },
  { code: "NM", city: "Albuquerque", zip: "87102", lat: 35.0844, lng: -106.6504 },
  { code: "NY", city: "New York", zip: "10007", lat: 40.7128, lng: -74.006 },
  { code: "NC", city: "Charlotte", zip: "28202", lat: 35.2271, lng: -80.8431 },
  { code: "ND", city: "Fargo", zip: "58102", lat: 46.8772, lng: -96.7898 },
  { code: "OH", city: "Columbus", zip: "43215", lat: 39.9612, lng: -82.9988 },
  { code: "OK", city: "Oklahoma City", zip: "73102", lat: 35.4676, lng: -97.5164 },
  { code: "OR", city: "Portland", zip: "97204", lat: 45.5152, lng: -122.6784 },
  { code: "PA", city: "Philadelphia", zip: "19107", lat: 39.9526, lng: -75.1652 },
  { code: "RI", city: "Providence", zip: "02903", lat: 41.824, lng: -71.4128 },
  { code: "SC", city: "Charleston", zip: "29401", lat: 32.7765, lng: -79.9311 },
  { code: "SD", city: "Sioux Falls", zip: "57104", lat: 43.5446, lng: -96.7311 },
  { code: "TN", city: "Nashville", zip: "37203", lat: 36.1627, lng: -86.7816 },
  { code: "TX", city: "Dallas", zip: "75201", lat: 32.7767, lng: -96.797 },
  { code: "UT", city: "Salt Lake City", zip: "84101", lat: 40.7608, lng: -111.891 },
  { code: "VT", city: "Burlington", zip: "05401", lat: 44.4759, lng: -73.2121 },
  { code: "VA", city: "Richmond", zip: "23219", lat: 37.5407, lng: -77.436 },
  { code: "WA", city: "Seattle", zip: "98101", lat: 47.6062, lng: -122.3321 },
  { code: "WV", city: "Charleston", zip: "25301", lat: 38.3498, lng: -81.6326 },
  { code: "WI", city: "Milwaukee", zip: "53202", lat: 43.0389, lng: -87.9065 },
  { code: "WY", city: "Cheyenne", zip: "82001", lat: 41.14, lng: -104.8202 },
];

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const options = {
  minutes: Number(argValue("minutes", process.env.PROMETHEUS_SMOKE_MINUTES || "60")),
  geocodeDelayMs: Number(argValue("geocode-delay-ms", process.env.PROMETHEUS_SMOKE_GEOCODE_DELAY_MS || "1100")),
  enduranceIntervalMs: Number(argValue("endurance-interval-ms", process.env.PROMETHEUS_SMOKE_INTERVAL_MS || "300000")),
  skipGeocode: hasFlag("skip-geocode"),
  skipBaseSeed: hasFlag("skip-base-seed"),
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function postId(post) {
  return String(post?._id || post?.id || "");
}

function place(fixture) {
  return {
    type: "place",
    place: {
      city: fixture.city,
      state: fixture.code,
      country: "USA",
    },
    location: {
      type: "Point",
      coordinates: {
        lat: fixture.lat,
        lng: fixture.lng,
      },
    },
  };
}

function distanceMiles(origin, destination) {
  const radians = (value) => (value * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = radians(destination.lat - origin.lat);
  const dLng = radians(destination.lng - origin.lng);
  const lat1 = radians(origin.lat);
  const lat2 = radians(destination.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function request(pathname, { method = "GET", token, body } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const payload = text ? tryParseJson(text) : null;

  if (!response.ok) {
    const message = payload?.message || payload?.error || text || response.statusText;
    throw new Error(`${method} ${pathname} failed (${response.status}): ${message}`);
  }

  return payload;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return text;
  }
}

function seedBaseDemo() {
  if (options.skipBaseSeed) {
    console.log("Skipping base demo seed.");
    return;
  }

  console.log("Ensuring base local demo data...");
  execFileSync(process.execPath, [path.join(__dirname, "seed-local-demo.js")], {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: process.env,
  });
}

async function connectDb() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(DB_URI);
  }
  return mongoose.connection.db;
}

async function ensureHelperCrew() {
  const db = await connectDb();
  const companies = db.collection("companies");
  const users = db.collection("users");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const helpers = [];

  for (const helper of HELPER_USERS) {
    const company = await companies.findOne({ email: helper.companyEmail });
    if (!company) {
      throw new Error(`Missing company for ${helper.email}: ${helper.companyEmail}`);
    }

    const saved = await users.findOneAndUpdate(
      { email: helper.email },
      {
        $set: {
          companyId: company._id,
          email: helper.email,
          password: passwordHash,
          role: helper.role,
          firstName: helper.firstName,
          lastName: helper.lastName,
          emailConfirmation: true,
          isActive: true,
          phone: helper.phone,
          contactEmail: company.email,
          previewedPosts: [],
          blacklist: [],
          isLogged: "",
          subscriptionEmail: true,
          messages: [],
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    helpers.push({ ...helper, userId: String(saved._id), companyId: String(company._id) });
  }

  console.log("Helper crew is ready:");
  for (const helper of helpers) {
    console.log(`- ${helper.email} / ${PASSWORD} (${helper.role})`);
  }

  return helpers;
}

async function cleanupPreviousSmokePosts() {
  const db = await connectDb();
  const brokerPosts = db.collection("brokerposts");
  const carrierPosts = db.collection("carrierposts");
  const messages = db.collection("messages");
  const matchSnapshots = db.collection("matchsnapshots");
  const matchingAssistantEvents = db.collection("matchingassistantevents");

  const brokerPostsToDelete = await brokerPosts
    .find({ refNum: { $regex: `^${SMOKE_BROKER_PREFIX}` } }, { projection: { _id: 1 } })
    .toArray();
  const carrierPostsToDelete = await carrierPosts
    .find({ refNum: { $regex: `^${SMOKE_CARRIER_PREFIX}` } }, { projection: { _id: 1 } })
    .toArray();

  const brokerIds = brokerPostsToDelete.map((item) => String(item._id));
  const carrierIds = carrierPostsToDelete.map((item) => String(item._id));
  const allIds = [...brokerIds, ...carrierIds];

  if (brokerIds.length || carrierIds.length) {
    await messages.deleteMany({
      $or: [{ brokerPostId: { $in: brokerIds } }, { carrierPostId: { $in: carrierIds } }],
    });
    await matchSnapshots.deleteMany({ sourcePostId: { $in: allIds } });
    await matchingAssistantEvents.deleteMany({ sourcePostId: { $in: allIds } });
  }

  const brokerResult = await brokerPosts.deleteMany({ refNum: { $regex: `^${SMOKE_BROKER_PREFIX}` } });
  const carrierResult = await carrierPosts.deleteMany({ refNum: { $regex: `^${SMOKE_CARRIER_PREFIX}` } });
  console.log(`Cleaned previous smoke posts: ${brokerResult.deletedCount} broker, ${carrierResult.deletedCount} carrier.`);
}

async function login(email) {
  const payload = await request("/login", {
    method: "POST",
    body: { email, password: PASSWORD, rememberMe: true },
  });
  if (!payload?.token) {
    throw new Error(`Login did not return a token for ${email}`);
  }
  const me = await request("/users/me", { token: payload.token });
  return { email, token: payload.token, user: me };
}

function buildBrokerPayload(originFixture, destinationFixture, index, helperEmail) {
  const origin = place(originFixture);
  const destination = place(destinationFixture);
  const pickupDate = new Date(Date.now() + (index + 2) * 60 * 60 * 1000).toISOString();
  const deliveryDate = new Date(Date.now() + (index + 26) * 60 * 60 * 1000).toISOString();
  const distance = distanceMiles(originFixture, destinationFixture);

  return {
    length: 53,
    weight: 42000 + (index % 6) * 500,
    capacity: "full",
    capacitySearch: "both",
    equipment: ["V"],
    contact: helperEmail,
    origin,
    destination,
    stops: [
      { type: "pickUp", place: origin, startDate: pickupDate, endDate: pickupDate, date: pickupDate, comment: "All-state smoke pickup" },
      { type: "delivery", place: destination, startDate: deliveryDate, endDate: deliveryDate, date: deliveryDate, comment: "All-state smoke delivery" },
    ],
    stopsDistances: [distance],
    distance,
    comment: `All-state broker smoke lane ${originFixture.code} to ${destinationFixture.code}.`,
    refNum: `${SMOKE_BROKER_PREFIX}${originFixture.code}-${destinationFixture.code}`,
    rate: 2200 + index * 25,
    tankerEndorsement: false,
    nonHazmat: false,
    team: false,
  };
}

function buildCarrierPayload(originFixture, destinationFixture, index, helperEmail) {
  const origin = place(originFixture);
  const destination = place(destinationFixture);
  const startDate = new Date(Date.now() + (index + 1) * 60 * 60 * 1000).toISOString();
  const endDate = new Date(Date.now() + (index + 25) * 60 * 60 * 1000).toISOString();

  return {
    length: 53,
    weight: 45000,
    capacity: "full",
    capacitySearch: "both",
    equipment: ["V"],
    contact: helperEmail,
    startDate,
    endDate,
    origin,
    destination,
    distance: distanceMiles(originFixture, destinationFixture),
    comment: `All-state carrier dispatcher smoke truck ${originFixture.code} to ${destinationFixture.code}.`,
    refNum: `${SMOKE_CARRIER_PREFIX}${originFixture.code}-${destinationFixture.code}`,
    team: false,
    nonTanker: true,
  };
}

async function createAllStatePosts(sessions) {
  const brokerSessions = sessions.filter((session) => session.user.role === "broker");
  const carrierSessions = sessions.filter((session) => session.user.role === "carrier");
  const brokerPosts = [];
  const carrierPosts = [];

  for (let index = 0; index < STATE_FIXTURES.length; index += 1) {
    const origin = STATE_FIXTURES[index];
    const destination = STATE_FIXTURES[(index + 1) % STATE_FIXTURES.length];
    const brokerSession = brokerSessions[index % brokerSessions.length];
    const carrierSession = carrierSessions[index % carrierSessions.length];

    const brokerPost = await request("/broker", {
      method: "POST",
      token: brokerSession.token,
      body: buildBrokerPayload(origin, destination, index, brokerSession.email),
    });
    brokerPosts.push(brokerPost);

    const carrierPost = await request("/carrier", {
      method: "POST",
      token: carrierSession.token,
      body: buildCarrierPayload(origin, destination, index, carrierSession.email),
    });
    carrierPosts.push(carrierPost);

    if ((index + 1) % 10 === 0) {
      console.log(`Created smoke lanes for ${index + 1}/${STATE_FIXTURES.length} states.`);
    }
  }

  return { brokerPosts, carrierPosts };
}

async function createSnapshots(posts, sourcePostType, sessions) {
  let withMatches = 0;
  let totalCandidates = 0;

  for (let index = 0; index < posts.length; index += 1) {
    const session = sessions[index % sessions.length];
    const snapshot = await request("/matching/snapshots", {
      method: "POST",
      token: session.token,
      body: { sourcePostType, sourcePostId: postId(posts[index]) },
    });
    const candidates = Array.isArray(snapshot?.candidates) ? snapshot.candidates.length : 0;
    if (candidates > 0) {
      withMatches += 1;
      totalCandidates += candidates;
    }
  }

  return { total: posts.length, withMatches, totalCandidates };
}

async function checkCoworkerVisibility(sessions) {
  const checks = [];

  for (const session of sessions) {
    const endpoint = session.user.role === "broker" ? "/broker/companyPins" : "/carrier/companyPins";
    const pins = await request(endpoint, { token: session.token });
    checks.push({
      email: session.email,
      role: session.user.role,
      coworkerVisiblePosts: Array.isArray(pins) ? pins.length : 0,
    });
  }

  return checks;
}

async function checkMyPosts(sessions) {
  const checks = [];

  for (const session of sessions) {
    const userId = session.user.id || session.user._id;
    const endpoint = session.user.role === "broker" ? `/broker/mine/${userId}` : `/carrier/mine/${userId}`;
    const posts = await request(endpoint, { token: session.token });
    checks.push({
      email: session.email,
      role: session.user.role,
      myPosts: Array.isArray(posts) ? posts.length : 0,
    });
  }

  return checks;
}

async function checkLocationMatrix() {
  if (options.skipGeocode) {
    return {
      skipped: true,
      cityStateFound: 0,
      zipFound: 0,
      stateCodeFound: 0,
      stateLookupFound: 0,
      failures: [],
    };
  }

  const summary = {
    skipped: false,
    cityStateFound: 0,
    zipFound: 0,
    stateCodeFound: 0,
    stateLookupFound: 0,
    failures: [],
  };

  for (const fixture of STATE_FIXTURES) {
    try {
      const cityState = await request("/geocode", {
        method: "POST",
        body: { city: fixture.city, state: fixture.code, country: "USA" },
      });
      if (cityState?.found && cityState?.location) {
        summary.cityStateFound += 1;
      } else {
        summary.failures.push(`${fixture.code} city/state not found`);
      }
    } catch (error) {
      summary.failures.push(`${fixture.code} city/state error: ${error.message}`);
    }
    await sleep(options.geocodeDelayMs);

    try {
      const zip = await request("/geocode", {
        method: "POST",
        body: { input: fixture.zip, country: "USA" },
      });
      if (zip?.found && zip?.location) {
        summary.zipFound += 1;
      } else {
        summary.failures.push(`${fixture.code} ZIP ${fixture.zip} not found`);
      }
    } catch (error) {
      summary.failures.push(`${fixture.code} ZIP error: ${error.message}`);
    }
    await sleep(options.geocodeDelayMs);

    try {
      const stateOnly = await request("/geocode", {
        method: "POST",
        body: { state: fixture.code, country: "USA" },
      });
      if (stateOnly?.found && stateOnly?.location) {
        summary.stateCodeFound += 1;
      } else {
        summary.failures.push(`${fixture.code} state geocode not found`);
      }
    } catch (error) {
      summary.failures.push(`${fixture.code} state geocode error: ${error.message}`);
    }
    await sleep(options.geocodeDelayMs);

    try {
      const stateLookup = await request(`/states?input=${encodeURIComponent(fixture.code)}`);
      if (stateLookup?.code === fixture.code) {
        summary.stateLookupFound += 1;
      } else {
        summary.failures.push(`${fixture.code} state lookup not found`);
      }
    } catch (error) {
      summary.failures.push(`${fixture.code} state lookup error: ${error.message}`);
    }

    if ((summary.cityStateFound + summary.zipFound + summary.stateCodeFound) % 30 === 0) {
      console.log(`Location matrix progress: ${fixture.code}`);
    }
  }

  return summary;
}

async function runEndurance(sessions, brokerPosts, carrierPosts) {
  const minutes = Number.isFinite(options.minutes) && options.minutes > 0 ? options.minutes : 0;
  if (!minutes) {
    return { skipped: true, cycles: 0, failures: [] };
  }

  const startedAt = Date.now();
  const endsAt = startedAt + minutes * 60 * 1000;
  const failures = [];
  let cycles = 0;

  console.log(`Starting endurance loop for ${minutes} minute(s).`);

  while (Date.now() < endsAt) {
    cycles += 1;
    const brokerPost = brokerPosts[(cycles - 1) % brokerPosts.length];
    const carrierPost = carrierPosts[(cycles - 1) % carrierPosts.length];
    const brokerSession = sessions.find((session) => session.user.role === "broker");
    const carrierSession = sessions.find((session) => session.user.role === "carrier");

    try {
      const health = await request("/health-check");
      if (health !== "OK") {
        failures.push(`Cycle ${cycles}: health-check returned ${health}`);
      }
      await request("/session-status", { token: brokerSession.token });
      await request("/session-status", { token: carrierSession.token });
      await request("/matching/snapshots", {
        method: "POST",
        token: brokerSession.token,
        body: { sourcePostType: "brokerPost", sourcePostId: postId(brokerPost) },
      });
      await request("/matching/snapshots", {
        method: "POST",
        token: carrierSession.token,
        body: { sourcePostType: "carrierPost", sourcePostId: postId(carrierPost) },
      });
      console.log(`[${new Date().toISOString()}] endurance cycle ${cycles} OK`);
    } catch (error) {
      const message = `Cycle ${cycles}: ${error.message}`;
      failures.push(message);
      console.log(`[${new Date().toISOString()}] ${message}`);
    }

    const remainingMs = Math.max(0, endsAt - Date.now());
    if (remainingMs > 0) {
      await sleep(Math.min(options.enduranceIntervalMs, remainingMs));
    }
  }

  return {
    skipped: false,
    cycles,
    minutes,
    failures,
  };
}

async function main() {
  console.log("Prometheus helper crew smoke test");
  console.log(`API: ${API_URL}`);
  console.log(`DB: ${DB_URI}`);
  console.log(`States in matrix: ${STATE_FIXTURES.length}`);
  console.log(`Endurance minutes: ${options.minutes}`);
  console.log("");

  await request("/health-check");
  seedBaseDemo();
  await ensureHelperCrew();
  await cleanupPreviousSmokePosts();

  const sessions = [];
  for (const helper of HELPER_USERS) {
    sessions.push(await login(helper.email));
  }
  console.log(`Authenticated ${sessions.length} helper users.`);

  const created = await createAllStatePosts(sessions);
  const brokerSessions = sessions.filter((session) => session.user.role === "broker");
  const carrierSessions = sessions.filter((session) => session.user.role === "carrier");
  const brokerSnapshots = await createSnapshots(created.brokerPosts, "brokerPost", brokerSessions);
  const carrierSnapshots = await createSnapshots(created.carrierPosts, "carrierPost", carrierSessions);
  const coworkerVisibility = await checkCoworkerVisibility(sessions);
  const myPosts = await checkMyPosts(sessions);
  const locationMatrix = await checkLocationMatrix();
  const endurance = await runEndurance(sessions, created.brokerPosts, created.carrierPosts);

  const summary = {
    helperAccounts: HELPER_USERS.map((helper) => ({
      email: helper.email,
      password: PASSWORD,
      role: helper.role,
    })),
    allStatePosts: {
      brokerCreated: created.brokerPosts.length,
      carrierCreated: created.carrierPosts.length,
    },
    matching: {
      brokerSnapshots,
      carrierSnapshots,
    },
    coworkerVisibility,
    myPosts,
    locationMatrix,
    endurance,
    note: "City/state and ZIP geocoding are endpoint checks. State-only lookup resolves state data, but the current plain-language posting parser still expects a city plus state before it can create a live post from chat.",
  };

  console.log("");
  console.log("Smoke summary:");
  console.log(JSON.stringify(summary, null, 2));

  const hardFailures = [
    created.brokerPosts.length !== STATE_FIXTURES.length ? "Not all broker smoke posts were created." : null,
    created.carrierPosts.length !== STATE_FIXTURES.length ? "Not all carrier smoke posts were created." : null,
    brokerSnapshots.withMatches === 0 ? "No broker snapshots found matches." : null,
    carrierSnapshots.withMatches === 0 ? "No carrier snapshots found matches." : null,
    coworkerVisibility.some((item) => item.coworkerVisiblePosts === 0) ? "At least one helper cannot see coworker posts." : null,
    endurance.failures?.length ? "Endurance loop recorded failures." : null,
  ].filter(Boolean);

  if (hardFailures.length) {
    console.error("");
    console.error("Hard failures:");
    for (const failure of hardFailures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
