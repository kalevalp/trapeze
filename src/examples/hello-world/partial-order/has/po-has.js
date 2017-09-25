const shim = require("lambda-shim");

shim.makeShim(module.exports);

module.exports.handler({key: "A", user: "poguest", pass: "poguestpass"}, {}, (err, res) => {console.log("ERR: " + err + ";;; RES: " + res)});