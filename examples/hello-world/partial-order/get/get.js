const {KV_Store} = require("kv-store");
const fs = require("fs");

const conf = JSON.parse(fs.readFileSync('conf.json', 'utf8'));

module.exports.handler = function (event, context, callback) {
    let kv = new KV_Store(conf.host, conf.user, conf.pass);

    kv.init()
        .then(() => get(event.key))
        .then((res) => kv.close().then(callback(null,res)))
        .catch((err) => callback(err));
};