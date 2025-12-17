const axios = require("axios");
const { faker } = require("@faker-js/faker");

const API_BASE = "http://localhost:5500"; // adjust to your API base
const token =
  "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijk1MTg5MTkxMTA3NjA1NDM0NGUxNWUyNTY0MjViYjQyNWVlYjNhNWMiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiT2xhbnJld2FqdSBCYWJhdHVuZGUiLCJwaWN0dXJlIjoiaHR0cHM6Ly9saDMuZ29vZ2xldXNlcmNvbnRlbnQuY29tL2EvQUNnOG9jSlNXLXVpc25HTXhzS0NWbFJ1dkdUYjZLRWNheEwzMDFwVG50ckZ6alAyeDcwYjdnPXM5Ni1jIiwiaXNzIjoiaHR0cHM6Ly9zZWN1cmV0b2tlbi5nb29nbGUuY29tL2NodXJjaGxpZnkiLCJhdWQiOiJjaHVyY2hsaWZ5IiwiYXV0aF90aW1lIjoxNzY0OTAwNDg2LCJ1c2VyX2lkIjoicW5vYjRZenZxemFDUTE4YUdVb2I3SDVPVGdrMiIsInN1YiI6InFub2I0WXp2cXphQ1ExOGFHVW9iN0g1T1RnazIiLCJpYXQiOjE3NjUwMDIxNjQsImV4cCI6MTc2NTAwNTc2NCwiZW1haWwiOiJ5YW5uaWJvLjdjQGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7Imdvb2dsZS5jb20iOlsiMTAwMTgyODA5MjUzOTAwNDM4NjY0Il0sImVtYWlsIjpbInlhbm5pYm8uN2NAZ21haWwuY29tIl19LCJzaWduX2luX3Byb3ZpZGVyIjoiZ29vZ2xlLmNvbSJ9fQ.DK8cf1mNOtFkOYpbXljLNJ65ykEjupVktmAiyasZH8Aw8gBtTL_1tn03gReSvJIHQqC76xeyEwfLocCaSaW8fNuZ8UHuj84YGRNtCInvek57-6HCLlXNgi4Rl1LzWlRpz9V9Y_KUXNhbBO8Q0RTSiFhQ6z4cC1wgr6Iqn5RftHcicrAtamt4WcKUfjTbgp95OnueCKjucJgCVltLIqMOev4YrICWeAaC0a_rrazDLU92_YiXBof3ON72QiPcnnJAxz9eZV0KPGZfRW5JwBGN-vEr6vyHqQglBh8DwmbPqfaf2hwnR_HHA4v2vkTcSRwGHvGHnsEI4QgFu9yc4iDk1Q";
axios.defaults.headers.common.Authorization = `Bearer ${token}`;
axios.defaults.headers.common["x-seeding"] = "true";

const churches = [
  {
    name: "Dominion City Church",
    shortName: "Dominion City London",
    emailAddress: "info@dominioncitylo.ca",
    phoneNumber: "+1-226-577-7613",
    address: {
      state: "Ontario",
      postalCode: "N5V 1Z5",
      street: "549 First St, London",
      city: "London",
      country: "Canada",
      location: {
        type: "Point",
        coordinates: [-81.2496, 42.9837], // longitude, latitude
      },
    },
    timeZone: "America/Toronto",
    isApproved: true,
    isPublished: true,
  },
  {
    name: "God’s Favourite House Canada",
    shortName: "GFH Canada",
    emailAddress: "hello@gfhcanada.com",
    phoneNumber: "+1-555-987-6543",
    address: {
      state: "Ontario",
      postalCode: "N6E 1N9",
      street: "1074, Dearness Drive Units B",
      city: "London",
      country: "Canada",
      location: {
        type: "Point",
        coordinates: [-81.233, 42.984],
      },
    },
    timeZone: "America/Toronto",
    isApproved: true,
    isPublished: true,
  },
];


async function seedIteration(devotionCount = 5, eventCount = 5, index = 0) {
  try {
    // 1. Create User
    const userPayload = {
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      dateOfBirth: faker.date.birthdate({ min: 25, max: 65, mode: "age" }),
      gender: faker.helpers.arrayElement(["Male", "Female"]),
      emailAddress: faker.internet.email(),
      phoneNumber: faker.phone.number({ style: "international" }),
      firebaseId: faker.string.uuid(),
      role: "admin",
      address: {
        state: faker.location.state(),
        postalCode: faker.location.zipCode(),
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        country: faker.location.country(),
        location: {
          type: "Point",
          coordinates: [
            parseFloat(faker.location.longitude()),
            parseFloat(faker.location.latitude()),
          ],
        },
      },
    };
    console.log("Creating User ===");
    const userRes = await axios.post(`${API_BASE}/user/create`, userPayload);
    const user = userRes.data.user;
    console.log("Created User:", user._id);

    // 2. Create Church
   const churchPayload = { ...churches[index % churches.length], createdBy: user._id, };


    console.log("Creating Church ===");

    const churchRes = await axios.post(
      `${API_BASE}/church/create`,
      churchPayload
    );
    const church = churchRes.data.church;
    console.log("Created Church:", church._id);

    // 3. Update User with church + adminAt
    console.log("Updating User ===");
    await axios.patch(
      `${API_BASE}/user/update/${user._id}`,
      {
        church: church._id,
        adminAt: church._id,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-church": `${church._id}`,
          "x-user": `${user._id}`,
        },
      }
    );
    console.log("Updated User with church/adminAt");

    // 4. Create multiple Devotions
    for (let i = 0; i < devotionCount; i++) {
      const devotionPayload = {
        church: church._id,
        title: faker.lorem.sentence(5),
        scripture: `${faker.word.sample()} ${faker.number.int({
          min: 1,
          max: 150,
        })}:${faker.number.int({ min: 1, max: 40 })}`,
        content: faker.lorem.paragraphs(2),
        date: faker.date.recent({ days: 30 }),
        author: user._id,
        tags: faker.lorem.words(3).split(" "),
        image: faker.image.urlPicsumPhotos(),
        isPublished: faker.datatype.boolean(),
      };
      await axios.post(`${API_BASE}/devotion/create`, devotionPayload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-church": `${church._id}`,
          "x-user": `${user._id}`,
        },
      });
    }
    console.log(`Created ${devotionCount} Devotions`);

    // 5. Create multiple Events
    for (let i = 0; i < eventCount; i++) {
      const eventPayload = {
        church: church._id,
        createdBy: user._id,
        title: faker.lorem.words(3),
        description: faker.lorem.paragraph(),
        startDate: faker.date.future().toISOString().slice(0, 10),
        endDate: faker.date.future({ years: 1 }).toISOString().slice(0, 10),
        startTime: "10:00",
        endTime: "13:00",
        location: {
          name: faker.company.name(),
          address: {
            state: faker.location.state(),
            postalCode: faker.location.zipCode(),
            street: faker.location.streetAddress(),
            city: faker.location.city(),
            country: faker.location.country(),
            location: {
              type: "Point",
              coordinates: [
                parseFloat(faker.location.longitude()),
                parseFloat(faker.location.latitude()),
              ],
            },
          },
        },
        flier: faker.image.urlPicsumPhotos(),
        allowKidsCheckin: faker.datatype.boolean(),
        rsvp: faker.datatype.boolean(),
        isRecurring: true,
        recurrence: {
          frequency: "WEEKLY",
          interval: 1,
          daysOfWeek: [0, 2, 4], // Sun, Tue, Thu
          endDate: faker.date.future({ years: 1 }).toISOString().slice(0, 10),
        },
      };
      await axios.post(`${API_BASE}/event/create`, eventPayload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-church": `${church._id}`,
          "x-user": `${user._id}`,
        },
      });
    }
    console.log(`Created ${eventCount} Events`);
  } catch (err) {
    console.error(
      "Error in seeding iteration:",
      err.response?.data || err.message
    );
  }
}

// Run multiple iterations (each creates 1 user + 1 church + many devotions/events)
(async () => {
  for (let i = 0; i < 2; i++) {
    // adjust iteration count
    console.log(`--- Iteration ${i + 1} ---`);
    await seedIteration(3, 4, i); // adjust devotion/event counts per iteration
  }
})();
