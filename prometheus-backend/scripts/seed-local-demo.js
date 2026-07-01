const path = require("path");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const DB_URI = process.env.DB_URI || "mongodb://127.0.0.1:27017/prometheus_local";

function place(city, state, lat, lng) {
  const point = {
    type: "Point",
    coordinates: {
      lat,
      lng,
    },
  };

  return {
    type: "place",
    place: {
      city,
      state,
      country: "USA",
    },
    location: point,
    pinLocation: {
      type: "Point",
      coordinates: {
        lat: lat + 0.015,
        lng: lng + 0.015,
      },
    },
    geoLocation: {
      type: "Point",
      coordinates: [lng, lat],
    },
  };
}

function brokerStops(origin, destination, pickupDate, deliveryDate) {
  return [
    {
      type: "pickUp",
      place: {
        place: origin.place,
        location: origin.location,
      },
      date: pickupDate,
      comment: "Pickup window confirmed",
    },
    {
      type: "delivery",
      place: {
        place: destination.place,
        location: destination.location,
      },
      date: deliveryDate,
      comment: "Delivery appointment requested",
    },
  ];
}

async function upsertCompany(companies, email, data) {
  return companies.findOneAndUpdate(
    { email },
    { $set: data },
    { upsert: true, returnDocument: "after" }
  );
}

async function upsertUser(users, email, data) {
  return users.findOneAndUpdate(
    { email },
    { $set: data },
    { upsert: true, returnDocument: "after" }
  );
}

async function upsertBrokerPost(posts, postId, data) {
  return posts.findOneAndUpdate(
    { refNum: postId },
    { $set: data },
    { upsert: true, returnDocument: "after" }
  );
}

async function upsertCarrierPost(posts, postId, data) {
  return posts.findOneAndUpdate(
    { refNum: postId },
    { $set: data },
    { upsert: true, returnDocument: "after" }
  );
}

async function upsertMessageRoom(messages, carrierPostId, brokerPostId, data) {
  return messages.findOneAndUpdate(
    { carrierPostId, brokerPostId },
    { $set: data },
    { upsert: true, returnDocument: "after" }
  );
}

async function ensureGeoIndexes(brokerPosts, carrierPosts) {
  const collections = [brokerPosts, carrierPosts];

  for (const collection of collections) {
    const indexes = await collection.indexes().catch(() => []);
    const indexNames = new Set(indexes.map((index) => index.name));

    for (const oldName of ["origin.location_2dsphere", "destination.location_2dsphere"]) {
      if (indexNames.has(oldName)) {
        await collection.dropIndex(oldName);
      }
    }

    await collection.createIndex({ "origin.geoLocation": "2dsphere" });
    await collection.createIndex({ "destination.geoLocation": "2dsphere" });
  }
}

async function run() {
  await mongoose.connect(DB_URI);

  const db = mongoose.connection.db;
  const companies = db.collection("companies");
  const users = db.collection("users");
  const brokerPosts = db.collection("brokerposts");
  const carrierPosts = db.collection("carrierposts");
  const messages = db.collection("messages");
  const now = new Date();
  const nextYear = new Date(now);
  nextYear.setFullYear(now.getFullYear() + 1);

  await ensureGeoIndexes(brokerPosts, carrierPosts);

  const localPassword = "Prometheus123!";
  const passwordHash = await bcrypt.hash(localPassword, 10);

  const superadmin = await upsertUser(users, "superadmin.local@prometheus.test", {
    email: "superadmin.local@prometheus.test",
    password: passwordHash,
    role: "superadmin",
    firstName: "Local",
    lastName: "Superadmin",
    emailConfirmation: true,
    isActive: true,
    phone: "555-000-0001",
    contactEmail: "superadmin.local@prometheus.test",
    previewedPosts: [],
    blacklist: [],
    isLogged: "",
    subscriptionEmail: false,
    messages: [],
  });

  const brokerCompany = await upsertCompany(companies, "broker.company.local@prometheus.test", {
    name: "Local Broker Logistics",
    email: "broker.company.local@prometheus.test",
    phone: "555-000-1000",
    dot: "1234567",
    mc: "MC-LOCAL-BROKER",
    clientId: "LOCAL-BROKER-CLIENT",
    address: {
      country: "USA",
      city: "Chicago",
      street: "100 W Lake St",
      state: "IL",
      zip: "60601",
    },
    type: "broker",
    isWaiting: false,
    filesUploaded: true,
    filesNames: {},
    status: "activated",
    statusDate: now,
    deactivationReason: "",
    statusReason: "Local seed data",
    notes: [],
    contactPerson: {
      firstName: "Brooke",
      lastName: "Broker",
      email: "broker.local@prometheus.test",
      phone: "555-000-1001",
      role: "dispatcher",
    },
    subscription: {
      endPeriod: nextYear,
      customer: "local-broker-customer",
      status: "active",
    },
  });

  const carrierCompany = await upsertCompany(companies, "carrier.company.local@prometheus.test", {
    name: "Local Carrier Transport",
    email: "carrier.company.local@prometheus.test",
    phone: "555-000-2000",
    dot: "7654321",
    mc: "MC-LOCAL-CARRIER",
    clientId: "LOCAL-CARRIER-CLIENT",
    address: {
      country: "USA",
      city: "Joliet",
      street: "200 Logistics Dr",
      state: "IL",
      zip: "60431",
    },
    type: "carrier",
    isWaiting: false,
    filesUploaded: true,
    filesNames: {},
    status: "activated",
    statusDate: now,
    deactivationReason: "",
    statusReason: "Local seed data",
    notes: [],
    contactPerson: {
      firstName: "Casey",
      lastName: "Carrier",
      email: "carrier.local@prometheus.test",
      phone: "555-000-2001",
      role: "dispatcher",
    },
    subscription: {
      endPeriod: nextYear,
      customer: "local-carrier-customer",
      status: "active",
    },
  });

  await upsertCompany(companies, "pending.carrier.local@prometheus.test", {
    name: "Pending Carrier Review",
    email: "pending.carrier.local@prometheus.test",
    phone: "555-000-3000",
    dot: "3333000",
    mc: "MC-PENDING-CARRIER",
    clientId: "LOCAL-PENDING-CARRIER",
    address: {
      country: "USA",
      city: "Aurora",
      street: "300 Review Way",
      state: "IL",
      zip: "60502",
    },
    type: "carrier",
    status: "pending_review",
    isWaiting: false,
    filesUploaded: true,
    filesNames: {
      "MC-Authority": { name: "MC-Authority", ext: "pdf" },
      "Insurance-Certificate": { name: "Insurance-Certificate", ext: "pdf" },
      "HAZMAT-Authority": { name: "HAZMAT-Authority", ext: "pdf" },
    },
    onboarding: {
      status: "pending_review",
      submittedAt: now,
      requestedSeats: 4,
      documents: {
        mc: { fileType: "mc", displayName: "MC authority", source: "manual", status: "pending" },
        insurance: { fileType: "insurance", displayName: "Insurance certificate", source: "manual", status: "pending" },
        hazmat: { fileType: "hazmat", displayName: "HAZMAT authority", source: "manual", status: "pending" },
      },
    },
    notes: [],
    contactPerson: {
      firstName: "Pat",
      lastName: "Pending",
      email: "pending.carrier.local@prometheus.test",
      phone: "555-000-3001",
      verificationPhone: "555-000-3002",
      role: "Owner",
    },
  });

  const setupBrokerCompany = await upsertCompany(companies, "setup.broker.local@prometheus.test", {
    name: "Setup Broker Review",
    email: "setup.broker.local@prometheus.test",
    phone: "555-000-4000",
    dot: "4444000",
    mc: "MC-SETUP-BROKER",
    clientId: "LOCAL-SETUP-BROKER",
    address: {
      country: "USA",
      city: "Naperville",
      street: "400 Setup Ave",
      state: "IL",
      zip: "60540",
    },
    type: "broker",
    status: "approved_waiting_setup",
    isWaiting: false,
    filesUploaded: true,
    filesNames: {
      "MC-Authority": { name: "MC-Authority", ext: "pdf" },
      "Insurance-Certificate": { name: "Insurance-Certificate", ext: "pdf" },
    },
    onboarding: {
      status: "approved_waiting_setup",
      submittedAt: now,
      approvedAt: now,
      setupEmailSentAt: now,
      requestedSeats: 3,
      documents: {
        mc: { fileType: "mc", displayName: "MC authority", source: "manual", status: "verified", expirationDate: nextYear },
        insurance: { fileType: "insurance", displayName: "Insurance certificate", source: "manual", status: "verified", expirationDate: nextYear },
      },
    },
    notes: [],
    contactPerson: {
      firstName: "Sam",
      lastName: "Setup",
      email: "setup.broker.local@prometheus.test",
      phone: "555-000-4001",
      verificationPhone: "555-000-4002",
      role: "Owner",
    },
    subscription: {
      status: "setup_pending",
    },
  });

  const brokerUser = await upsertUser(users, "broker.local@prometheus.test", {
    companyId: brokerCompany._id,
    email: "broker.local@prometheus.test",
    password: passwordHash,
    role: "broker",
    firstName: "Brooke",
    lastName: "Broker",
    emailConfirmation: true,
    isActive: true,
    phone: "555-000-1001",
    contactEmail: "broker.company.local@prometheus.test",
    previewedPosts: [],
    blacklist: [],
    isLogged: "",
    subscriptionEmail: true,
    messages: [],
  });

  const carrierUser = await upsertUser(users, "carrier.local@prometheus.test", {
    companyId: carrierCompany._id,
    email: "carrier.local@prometheus.test",
    password: passwordHash,
    role: "carrier",
    firstName: "Casey",
    lastName: "Carrier",
    emailConfirmation: true,
    isActive: true,
    phone: "555-000-2001",
    contactEmail: "carrier.company.local@prometheus.test",
    previewedPosts: [],
    blacklist: [],
    isLogged: "",
    subscriptionEmail: true,
    messages: [],
  });

  const setupAdmin = await upsertUser(users, "setup.admin.local@prometheus.test", {
    companyId: setupBrokerCompany._id,
    email: "setup.admin.local@prometheus.test",
    password: passwordHash,
    role: "admin",
    firstName: "Sam",
    lastName: "Setup",
    emailConfirmation: true,
    isActive: true,
    phone: "555-000-4001",
    contactEmail: "setup.broker.local@prometheus.test",
    previewedPosts: [],
    blacklist: [],
    isLogged: "",
    subscriptionEmail: false,
    messages: [],
  });

  await companies.updateOne(
    { _id: brokerCompany._id },
    { $set: { adminId: brokerUser._id } }
  );
  await companies.updateOne(
    { _id: carrierCompany._id },
    { $set: { adminId: carrierUser._id } }
  );
  await companies.updateOne(
    { _id: setupBrokerCompany._id },
    { $set: { adminId: setupAdmin._id } }
  );

  const chicago = place("Chicago", "IL", 41.8781, -87.6298);
  const houston = place("Houston", "TX", 29.7604, -95.3698);
  const memphis = place("Memphis", "TN", 35.1495, -90.0490);
  const desPlaines = place("Des Plaines", "IL", 42.0334, -87.8834);
  const pasadena = place("Pasadena", "TX", 29.6911, -95.2091);
  const joliet = place("Joliet", "IL", 41.5250, -88.0817);
  const dallas = place("Dallas", "TX", 32.7767, -96.7970);

  const pickupOne = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const deliveryOne = new Date(now.getTime() + 26 * 60 * 60 * 1000);
  const pickupTwo = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const deliveryTwo = new Date(now.getTime() + 30 * 60 * 60 * 1000);
  const pickupThree = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const deliveryThree = new Date(now.getTime() + 20 * 60 * 60 * 1000);

  const brokerPostOne = await upsertBrokerPost(brokerPosts, "LB-CHI-HOU-001", {
    publisherId: brokerUser._id.toString(),
    companyId: brokerCompany._id.toString(),
    length: 53,
    weight: 42000,
    equipment: ["V"],
    capacity: "full",
    capacitySearch: "both",
    contact: "broker.local@prometheus.test",
    company: brokerCompany.name,
    origin: chicago,
    destination: houston,
    distance: 1080,
    publishedAt: now,
    comment: "Hazmat dry van lane for local Prometheus ChatBB testing.",
    bookUrl: "",
    refNum: "LB-CHI-HOU-001",
    tankerEndorsement: false,
    nonHazmat: false,
    team: false,
    rate: 2500,
    stopsDistances: [0, 1080],
    dhoRadius: 50,
    dhdRadius: 50,
    companyDot: brokerCompany.dot,
    companyMc: brokerCompany.mc,
    companyName: brokerCompany.name,
    companyFirstName: brokerUser.firstName,
    companyLastName: brokerUser.lastName,
    companyEmail: brokerUser.email,
    companyPhone: brokerUser.phone,
    stops: brokerStops(chicago, houston, pickupOne, deliveryOne),
  });

  const brokerPostTwo = await upsertBrokerPost(brokerPosts, "LB-DES-PAS-002", {
    publisherId: brokerUser._id.toString(),
    companyId: brokerCompany._id.toString(),
    length: 53,
    weight: 44000,
    equipment: ["V"],
    capacity: "full",
    capacitySearch: "both",
    contact: "broker.local@prometheus.test",
    company: brokerCompany.name,
    origin: desPlaines,
    destination: pasadena,
    distance: 1105,
    publishedAt: now,
    comment: "Second sample load for rate comparison.",
    bookUrl: "",
    refNum: "LB-DES-PAS-002",
    tankerEndorsement: false,
    nonHazmat: false,
    team: false,
    rate: 2650,
    stopsDistances: [0, 1105],
    dhoRadius: 50,
    dhdRadius: 50,
    companyDot: brokerCompany.dot,
    companyMc: brokerCompany.mc,
    companyName: brokerCompany.name,
    companyFirstName: brokerUser.firstName,
    companyLastName: brokerUser.lastName,
    companyEmail: brokerUser.email,
    companyPhone: brokerUser.phone,
    stops: brokerStops(desPlaines, pasadena, pickupTwo, deliveryTwo),
  });

  const brokerPostThree = await upsertBrokerPost(brokerPosts, "LB-CHI-MEM-003", {
    publisherId: brokerUser._id.toString(),
    companyId: brokerCompany._id.toString(),
    length: 53,
    weight: 41000,
    equipment: ["V"],
    capacity: "full",
    capacitySearch: "both",
    contact: "broker.local@prometheus.test",
    company: brokerCompany.name,
    origin: chicago,
    destination: memphis,
    distance: 540,
    publishedAt: now,
    comment: "IL to TN hazmat demo lane for broker/carrier assistant testing.",
    bookUrl: "",
    refNum: "LB-CHI-MEM-003",
    tankerEndorsement: false,
    nonHazmat: false,
    team: false,
    rate: 2400,
    stopsDistances: [0, 540],
    dhoRadius: 50,
    dhdRadius: 50,
    companyDot: brokerCompany.dot,
    companyMc: brokerCompany.mc,
    companyName: brokerCompany.name,
    companyFirstName: brokerUser.firstName,
    companyLastName: brokerUser.lastName,
    companyEmail: brokerUser.email,
    companyPhone: brokerUser.phone,
    stops: brokerStops(chicago, memphis, pickupThree, deliveryThree),
  });

  const carrierPostOne = await upsertCarrierPost(carrierPosts, "LC-CHI-HOU-001", {
    publisherId: carrierUser._id.toString(),
    companyId: carrierCompany._id.toString(),
    contact: "carrier.local@prometheus.test",
    length: 53,
    weight: 45000,
    equipment: ["V"],
    capacity: "full",
    capacitySearch: "both",
    startDate: now,
    endDate: nextYear,
    dhoRadius: 50,
    dhdRadius: 50,
    company: carrierCompany.name,
    comment: "53' dry van hazmat ready near Chicago and looking to go to Texas.",
    refNum: "LC-CHI-HOU-001",
    origin: chicago,
    team: false,
    nonTanker: true,
    distance: 1080,
    publishedAt: now,
    destination: houston,
  });

  const carrierPostTwo = await upsertCarrierPost(carrierPosts, "LC-JOL-DAL-002", {
    publisherId: carrierUser._id.toString(),
    companyId: carrierCompany._id.toString(),
    contact: "carrier.local@prometheus.test",
    length: 53,
    weight: 43000,
    equipment: ["V"],
    capacity: "full",
    capacitySearch: "both",
    startDate: now,
    endDate: nextYear,
    dhoRadius: 50,
    dhdRadius: 50,
    company: carrierCompany.name,
    comment: "Alternate truck lane for local testing.",
    refNum: "LC-JOL-DAL-002",
    origin: joliet,
    team: false,
    nonTanker: true,
    distance: 930,
    publishedAt: now,
    destination: dallas,
  });

  const carrierPostThree = await upsertCarrierPost(carrierPosts, "LC-CHI-MEM-003", {
    publisherId: carrierUser._id.toString(),
    companyId: carrierCompany._id.toString(),
    contact: "carrier.local@prometheus.test",
    length: 53,
    weight: 43000,
    equipment: ["V"],
    capacity: "full",
    capacitySearch: "both",
    startDate: now,
    endDate: nextYear,
    dhoRadius: 50,
    dhdRadius: 50,
    company: carrierCompany.name,
    comment: "53' dry van hazmat ready for the IL to TN demo lane.",
    refNum: "LC-CHI-MEM-003",
    origin: chicago,
    team: false,
    nonTanker: true,
    distance: 540,
    publishedAt: now,
    destination: memphis,
  });

  await upsertMessageRoom(
    messages,
    carrierPostThree._id.toString(),
    brokerPostThree._id.toString(),
    {
      carrierPostId: carrierPostThree._id.toString(),
      brokerPostId: brokerPostThree._id.toString(),
      brokerId: brokerUser._id.toString(),
      carrierId: carrierUser._id.toString(),
      hiddenForBroker: false,
      hiddenForCarrier: false,
      createdBy: brokerUser._id.toString(),
      seen: { brokerCount: 0, carrierCount: 0 },
      bookingStatus: "open",
      brokerApprovedBooking: false,
      carrierApprovedBooking: false,
      bookingStatusUpdatedAt: now,
      bookingStatusUpdatedBy: brokerUser._id.toString(),
      bookingNotes: "Seeded IL to TN lane for Niko-style assistant search testing.",
      messages: [
        {
          text: "IL to TN demo lane is open for assistant testing.",
          type: "message",
          date: now,
          role: "broker",
        },
      ],
    }
  );

  await upsertMessageRoom(
    messages,
    carrierPostOne._id.toString(),
    brokerPostOne._id.toString(),
    {
      carrierPostId: carrierPostOne._id.toString(),
      brokerPostId: brokerPostOne._id.toString(),
      brokerId: brokerUser._id.toString(),
      carrierId: carrierUser._id.toString(),
      hiddenForBroker: false,
      hiddenForCarrier: false,
      createdBy: carrierUser._id.toString(),
      seen: { brokerCount: 1, carrierCount: 0 },
      bookingStatus: "booked",
      brokerApprovedBooking: true,
      carrierApprovedBooking: true,
      bookingConfirmedAt: new Date(now.getTime() + 30 * 60 * 1000),
      bookingConfirmedBy: brokerUser._id.toString(),
      bookingStatusUpdatedAt: new Date(now.getTime() + 30 * 60 * 1000),
      bookingStatusUpdatedBy: brokerUser._id.toString(),
      bookingNotes: "Seeded booked room for load creation smoke tests.",
      messages: [
        {
          text: "Truck available in Chicago for Houston. Ready today.",
          type: "message",
          date: now,
          role: "carrier",
        },
        {
          bid: 2400,
          type: "bid",
          date: new Date(now.getTime() + 5 * 60 * 1000),
          role: "carrier",
        },
      ],
    }
  );

  await upsertMessageRoom(
    messages,
    carrierPostOne._id.toString(),
    brokerPostTwo._id.toString(),
    {
      carrierPostId: carrierPostOne._id.toString(),
      brokerPostId: brokerPostTwo._id.toString(),
      brokerId: brokerUser._id.toString(),
      carrierId: carrierUser._id.toString(),
      hiddenForBroker: false,
      hiddenForCarrier: false,
      createdBy: brokerUser._id.toString(),
      seen: { brokerCount: 0, carrierCount: 1 },
      bookingStatus: "negotiating",
      brokerApprovedBooking: true,
      carrierApprovedBooking: false,
      bookingStatusUpdatedAt: new Date(now.getTime() + 16 * 60 * 1000),
      bookingStatusUpdatedBy: brokerUser._id.toString(),
      bookingNotes: "Seeded broker approval awaiting carrier confirmation.",
      messages: [
        {
          text: "Can you cover Des Plaines to Pasadena on a dry van?",
          type: "message",
          date: new Date(now.getTime() + 10 * 60 * 1000),
          role: "broker",
        },
        {
          bid: 2550,
          type: "bid",
          date: new Date(now.getTime() + 15 * 60 * 1000),
          role: "carrier",
        },
      ],
    }
  );

  await upsertMessageRoom(
    messages,
    carrierPostTwo._id.toString(),
    brokerPostOne._id.toString(),
    {
      carrierPostId: carrierPostTwo._id.toString(),
      brokerPostId: brokerPostOne._id.toString(),
      brokerId: brokerUser._id.toString(),
      carrierId: carrierUser._id.toString(),
      hiddenForBroker: false,
      hiddenForCarrier: false,
      createdBy: brokerUser._id.toString(),
      seen: { brokerCount: 0, carrierCount: 1 },
      bookingStatus: "negotiating",
      brokerApprovedBooking: false,
      carrierApprovedBooking: false,
      bookingStatusUpdatedAt: new Date(now.getTime() + 26 * 60 * 1000),
      bookingStatusUpdatedBy: carrierUser._id.toString(),
      bookingNotes: "Seeded negotiating room.",
      messages: [
        {
          text: "We also have another truck option if timing changes.",
          type: "message",
          date: new Date(now.getTime() + 20 * 60 * 1000),
          role: "carrier",
        },
        {
          bid: 2300,
          type: "bid",
          date: new Date(now.getTime() + 25 * 60 * 1000),
          role: "carrier",
        },
      ],
    }
  );

  console.log("Local demo data is ready.");
  console.log("");
  console.log("Login credentials:");
  console.log("superadmin.local@prometheus.test / Prometheus123!");
  console.log("setup.admin.local@prometheus.test / Prometheus123!");
  console.log("broker.local@prometheus.test / Prometheus123!");
  console.log("carrier.local@prometheus.test / Prometheus123!");
  console.log("");
  console.log("Local companies, users, posts, and chat rooms are ready.");
  console.log("Created sample broker posts:");
  console.log(`- ${brokerPostOne.refNum}`);
  console.log(`- ${brokerPostTwo.refNum}`);
  console.log("Created sample carrier posts:");
  console.log(`- ${carrierPostOne.refNum}`);
  console.log(`- ${carrierPostTwo.refNum}`);

  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  try {
    await mongoose.disconnect();
  } catch (disconnectError) {
    // ignore disconnect failure on fatal exit
  }
  process.exit(1);
});
