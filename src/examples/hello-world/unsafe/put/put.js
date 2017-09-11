import {KV_Store} from "kv-store";
import fs from "fs";

const conf = JSON.parse(fs.readFileSync('conf.json', 'utf8'));

module.exports.handler = function (event, context, callback) {
    let kv = new KV_Store(conf.host, conf.user, conf.pass);

    kv.init(function (err) {
        if (err) throw err;
        kv.put(event.key, event.value, function (err, result) {
            if (err) throw err;
            kv.close(function (err) {
                if (err) throw err;
                callback(null, result);
            })
        })
    })
};