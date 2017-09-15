const {KV_Store} = require("kv-store");
const fs = require("fs");

const conf = JSON.parse(fs.readFileSync('conf.json', 'utf8'));

module.exports.handler = function (event, context, callback) {
    let kv = new KV_Store(conf.host, conf.user, conf.pass);

    kv.init(function (err) {
        if (err) {
            callback(err);
        } else {
            kv.get(event.key, function (err, result) {
                if (err) {
                    callback(err);
                } else {
                    kv.close(function (err) {
                        if (err) {
                            callback(err);
                        } else {
                            callback(null, result);
                        }
                    })
                }
            })
        }
    })
};