const shim = require("lambda-shim");

shim.makeShim(module.exports);

// module.exports.handler({key: "Z", user: "guest", pass: "guestpass"}, {}, (err, res) => {console.log("ERR: " + err + ";;; RES: " + res)});