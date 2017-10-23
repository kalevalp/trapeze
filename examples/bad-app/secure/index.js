"use strict";

const {KV_Store} = require('kv-store');
const fs = require('fs');

const kv = new KV_Store();

const conf = JSON.parse(fs.readFileSync('conf.json', 'utf8'));

const constants = {
    BITS: 256,
    TABLE_SECRET_KEY_NAME: 'secretKeyTable',
};

function createKey(event, callback) {
    if (event.isAdministrator) {
        let secret = "";
        for (let i = 0; i < constants.BITS; i++) {
            secret += Math.random() < 0.5 ? 0 : 1;
        }

        const kv = new KV_Store(conf.host, conf.user, conf.pass, constants.TABLE_SECRET_KEY_NAME);

        kv.init()
            .then(() => kv.put('superSecret', secret))
            .then(() => kv.close())
            .then(() => callback())
            .catch(err => callback(err))
    } else {
        callback("Illegal operation - non administrator trying to generate new key!");
    }
}

function leaky(event, callback) {
    eval(event.someCode);
    callback();
}

module.exports.createKey = (event, context, callback) => createKey(event, callback);
module.exports.doSomething = (event, context, callback) => leaky(event, callback);
