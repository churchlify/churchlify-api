const express = require("express");
const Assignment = require("../models/assignment");
const Ministry = require("../models/ministry");
const Fellowship = require("../models/fellowship");
const mongoose = require("mongoose");
const ObjectId = mongoose.Types.ObjectId;

const { validateAssignment } = require("../middlewares/validators");
const router = express.Router();
router.use(express.json());

router.post("/create", validateAssignment(), async (req, res) => {
  const {
    userId,
    ministryId,
    fellowshipId,
    role,
    availability,
    skills,
    status,
    dateAssigned,
  } = req.body;
  const newItem = new Assignment({
    userId,
    ministryId,
    fellowshipId,
    role,
    availability,
    skills,
    status,
    dateAssigned,
  });
  try {
    await newItem.save();
    res.status(201).json({
      message: "Assignment registered successfully",
      setting: newItem,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/find/:id", async (req, res) => {
  const { id } = req.params;
  const setting = await Assignment.findById(id).populate("church");
  if (!setting) {
    return res
      .status(404)
      .json({ message: `Assignment with id ${id} not found` });
  }
  res.json({ setting });
});

router.patch("/update/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const updatedAssignment = await Assignment.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true, runValidators: true }
    );
    if (!updatedAssignment) {
      return res
        .status(404)
        .json({ message: `Assignment with id ${id} not found` });
    }
    res.status(200).json({
      message: "Record updated successfully",
      setting: updatedAssignment,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get("/list", async (req, res) => {
  try {
    const assignment = await Assignment.find().populate("userId");
    res.status(200).json({ assignment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/list/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const assignment = await Assignment.find({ userId: userId }).sort({
      dateAssigned: -1,
    });
    res.status(200).json({ assignment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete("/delete/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedAssignment = await Assignment.findByIdAndDelete(id);
    if (!deletedAssignment) {
      return res.status(404).json({ error: "Assignment not found" });
    }
    res.status(200).json({
      message: "Assignment deleted successfully",
      setting: deletedAssignment,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const church = req.church;
    const filter = {};
    if (church?._id) {
      filter.church = church._id;
    }

    const [ministries, fellowships, assignments] = await Promise.all([
      Ministry.find(filter).lean(),     
      Fellowship.find(filter).lean(),    
      Assignment.find({ userId }).lean(),
    ]);

    const getStatusAndJoined = (itemId, type) => {
      const match = assignments.find(
        (a) =>
          (type === "ministry" && String(a.ministryId) === String(itemId)) ||
          (type === "fellowship" && String(a.fellowshipId) === String(itemId))
      );
      
      const status = match ? match.status : "unregistered";
      const joined = (status === "approved"); // User is "joined" if the status is "approved"

      return { status, joined };
    };

    const ministryResults = ministries.map((min) => {
      const { status, joined } = getStatusAndJoined(min._id, "ministry");
      
      return {
        id: min._id,
        name: min.name,
        leaderId: min.leaderId,
        category: "ministry",
        address: church?.address? `${church.address.street}, ${church.address.city}, ${church.address.state}` : null,
        joined: joined,
        status: status, // This is now the actual string status
      };
    });

    // 5. Map Fellowships (now fully synchronous)
    const fellowshipResults = fellowships.map((fel) => {
      const { status, joined } = getStatusAndJoined(fel._id, "fellowship");

      return {
        id: fel._id,
        name: fel.name,
        leaderId: fel.leaderId,
        category: "fellowship",
        address: fel.address ? `${fel.address.street}, ${fel.address.city}, ${fel.address.state}` : null,
        joined: joined,
        status: status, // This is now the actual string status
      };
    });

    // 6. Combine and return
    const groups = [...ministryResults, ...fellowshipResults];
    res.json({ success: true, groups });
    
  } catch (error) {
    console.error("Error fetching assignments:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/groupLed/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const church = req.church;
    const filter = { leaderId: userId };

    if (church?._id) {
      filter.church = church._id;
    }

    const fellowshipsLed = await Fellowship.find(filter);
    const ministriesLed = await Ministry.find(filter);

    const groupsLed = [
      ...fellowshipsLed.map((group) => ({ type: "fellowship", group })),
      ...ministriesLed.map((group) => ({ type: "ministry", group })),
    ];

    res.json({ success: true, groupsLed });
  } catch (error) {
    console.error("Error fetching groups led:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/isLeader/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const church = req.church;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(400)
        .json({ error: "Invalid user identifier provided" });
    }

    const filter = { leaderId: userId };
    if (church?._id) {
      filter.church = church._id;
    }

    const leadsFellowship = await Fellowship.exists(filter);
    const leadsMinistry = await Ministry.exists(filter);
    const isLeader = !!leadsFellowship || !!leadsMinistry;

    res.json({ success: true, isLeader });
  } catch (error) {
    console.error("Error checking leadership status:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/groupMembers/:groupType/:groupId", async (req, res) => {
  try {
    const { groupType, groupId } = req.params;

    let groupKey;
    if (groupType === "fellowship") {
      groupKey = "fellowshipId";
    } else if (groupType === "ministry") {
      groupKey = "ministryId";
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid group type" });
    }

    const filter = {
      [groupKey]: new ObjectId(groupId),
    };
    console.log(filter);

    const members = await Assignment.find(filter).populate("userId");
    console.log(members);

    res.json({ success: true, members });
  } catch (error) {
    console.error("Error fetching group members:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
