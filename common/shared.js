const church = require("../models/church");
const user = require("../models/user");
const checkChurchById = async (id)=> { return church.findById(id);}
const checkUserById = async (id)=> { return user.findById(id);}

module.exports = {checkChurchById, checkUserById }
