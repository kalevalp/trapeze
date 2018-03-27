const {KV_Store} = require("kv-store");
const fs = require("fs");
const crypto = require('crypto');

let conf;
if (fs.existsSync('conf.json')) { // (probably) running on AWS Lambda
    conf = JSON.parse(fs.readFileSync('conf.json', 'utf8'));
} else { // (probably) running on OpenWhisk
    conf = JSON.parse(fs.readFileSync(__dirname.split('node_modules')[0] + 'conf.json', 'utf8'));
}

const kv = new KV_Store(conf.host, conf.user, conf.pass, 'userLabelMappingTable');

const authMapPromise = kv.init()
    .then(() => kv.entries())
    .then(res => kv.close().then(() => res))
    .then(res => {
        "use strict";

        const map = {};
        for (let entry of res) {
            map[entry.key] = entry.val;
        }

        return map;

    });

function auth(user, pass) {
    const md5sum = crypto.createHash('md5');
    md5sum.update(user + pass, 'utf8');
    const h = md5sum.digest('hex');

    return authMapPromise
        .then(map => map[h])
        .catch(err => Promise.reject(err));
}

function storeCredentials(user, pass, label) {
    const md5sum = crypto.createHash('md5');
    md5sum.update(user + pass, 'utf8');
    const h = md5sum.digest('hex');

    let kv = new KV_Store(conf.host, conf.user, conf.pass, 'userLabelMappingTable');

    return kv.init()
        .then(() => kv.put(h, label))
        .then(() => kv.close())
        .catch(err => Promise.reject(err))
}

function fenceAfterMap() {
    return authMapPromise
        .then(() => true);
}

module.exports.auth = auth;
module.exports.storeCredentials = storeCredentials;
module.exports.fence = fenceAfterMap;
