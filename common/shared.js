const church = require("../models/Church");
const user = require("../models/user");
const checkExistById = async (type, id)=> {
    switch (type) {
        case 'church':
            return church.findById(id);
        case 'user':
            return user.findById(id);
        default:
            break
    }

}
module.exports = {checkExistById}
